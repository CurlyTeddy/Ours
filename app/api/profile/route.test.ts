import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/database-client";
import { deleteObjects } from "@/lib/s3-client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PUT } from "@/app/api/profile/route";

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_ENVIRONMENT: "dev",
    R2_ENDPOINT: "https://r2.test",
    R2_ACCESS_KEY: "a",
    R2_SECRET_ACCESS_KEY: "b",
  },
}));

vi.mock("@/lib/database-client", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
// Real module (presignImagePut may live here), with network-facing parts stubbed
vi.mock("@/lib/s3-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/s3-client")>()),
  deleteObjects: vi.fn(),
  getCachedSignedUrl: () => Promise.resolve("https://r2.test/get"),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(() => Promise.resolve("https://r2.test/put")),
}));
vi.mock("@/features/auth/session", () => ({
  validateSessionToken: () => Promise.resolve({ user: { id: "u1" } }),
}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: () => ({ value: "token" }) }),
}));

const jpegFile = { size: 2048, type: "image/jpeg" };
// A new image name sends its file details, as the client does
const put = (
  image: string | null,
  extra: Record<string, unknown> = image !== null && image !== "me.jpg-abc"
    ? { imageFile: jpegFile }
    : {},
) =>
  PUT(
    new NextRequest("http://localhost/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        name: "Teddy",
        email: "t@example.com",
        image,
        ...extra,
      }),
    }),
  );
const deletedKeys = () =>
  vi.mocked(deleteObjects).mock.calls.flatMap(([keys]) => keys);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    image: "me.jpg-abc",
  } as never);
  vi.mocked(prisma.user.update).mockImplementation(
    ({ data }) =>
      Promise.resolve({
        name: data.name,
        email: data.email,
        image: data.image ?? "me.jpg-abc",
      }) as never,
  );
  vi.mocked(prisma.$transaction).mockImplementation((callback) =>
    (callback as (txn: typeof prisma) => Promise<unknown>)(prisma),
  );
});

describe("PUT /api/profile avatar", () => {
  test("the current key leaves the avatar alone", async () => {
    const response = await put("me.jpg-abc");

    expect(response.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "Teddy", email: "t@example.com" },
      }),
    );
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  test("null removes the avatar and deletes the old object", async () => {
    const response = await put(null);

    expect(response.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "Teddy", email: "t@example.com", image: null },
      }),
    );
    expect(deletedKeys()).toEqual(["avatar/me.jpg-abc"]);
  });

  test("a new name stores a fresh key and returns an upload URL", async () => {
    const response = await put("new.jpg");
    const body = (await response.json()) as { signedUrl?: string };

    expect(body.signedUrl).toBe("https://r2.test/put");
    expect(vi.mocked(prisma.user.update).mock.calls[0][0].data.image).toMatch(
      /^new\.jpg-\w+$/,
    );
    expect(deletedKeys()).toEqual(["avatar/me.jpg-abc"]);
  });

  test("a failed DB update keeps the old object", async () => {
    vi.mocked(prisma.user.update).mockRejectedValue(new Error("db down"));

    const response = await put(null);

    expect(response.status).toBe(500);
    expect(deleteObjects).not.toHaveBeenCalled();
  });
});

describe("R15: PUT /api/profile imageFile", () => {
  test("a new image signs its declared size and type for 300 s", async () => {
    const response = await put("new.png", {
      imageFile: { size: 777, type: "image/png" },
    });

    expect(response.status).toBe(200);
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    const [, command, options] = vi.mocked(getSignedUrl).mock.calls[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    const key = vi.mocked(prisma.user.update).mock.calls[0][0].data.image;
    expect((command as PutObjectCommand).input).toEqual({
      Bucket: "images-dev",
      Key: `avatar/${String(key)}`,
      ContentType: "image/png",
      ContentLength: 777,
    });
    expect(options).toMatchObject({
      expiresIn: 300,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
  });

  test.each([
    ["left out", {}],
    ["null", { imageFile: null }],
  ])(
    "a new image with imageFile %s: 400 Missing image details",
    async (_, extra) => {
      const response = await put("new.jpg", extra);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        message: "Missing image details",
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(deleteObjects).not.toHaveBeenCalled();
      expect(getSignedUrl).not.toHaveBeenCalled();
    },
  );

  test("over 5 MB: 400 Images must be 5 MB or smaller", async () => {
    const response = await put("new.jpg", {
      imageFile: { size: 5 * 1024 * 1024 + 1, type: "image/jpeg" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Images must be 5 MB or smaller",
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("a HEIC: 400 Only JPEG, PNG, WebP or GIF", async () => {
    const response = await put("new.heic", {
      imageFile: { size: 100, type: "image/heic" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Only JPEG, PNG, WebP or GIF images can be uploaded",
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("exactly 5 MB is accepted", async () => {
    const response = await put("new.webp", {
      imageFile: { size: 5 * 1024 * 1024, type: "image/webp" },
    });

    expect(response.status).toBe(200);
  });

  test.each([
    ["the stored key", "me.jpg-abc"],
    ["null", null],
  ])("image %s needs no imageFile", async (_, image) => {
    const response = await put(image, {});

    expect(response.status).toBe(200);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  test("the stored key with a stray imageFile is still fine", async () => {
    const response = await put("me.jpg-abc", { imageFile: jpegFile });

    expect(response.status).toBe(200);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  test("a new image when no avatar is stored also needs imageFile", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      image: null,
    } as never);

    const response = await put("first.jpg", {});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Missing image details" });
  });

  test("name and email are still validated", async () => {
    const response = await PUT(
      new NextRequest("http://localhost/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: "",
          email: "t@example.com",
          image: null,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Name is required" });
  });
});

describe("PUT /api/profile imageFile (white-box)", () => {
  test("an invalid imageFile fails even when the image is unchanged", async () => {
    const response = await put("me.jpg-abc", {
      imageFile: { size: 6_000_000, type: "image/jpeg" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Images must be 5 MB or smaller",
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("a presign failure is a 500 and keeps the old object", async () => {
    vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error("r2 down"));

    const response = await put("new.jpg");

    expect(response.status).toBe(500);
    expect(deleteObjects).not.toHaveBeenCalled();
  });
});
