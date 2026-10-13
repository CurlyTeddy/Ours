import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/database-client";
import s3Client from "@/lib/s3-client";
import { PUT } from "@/app/api/profile/route";

vi.mock("@/lib/database-client", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/s3-client", () => ({
  default: { send: vi.fn() },
  bucket: "images-test",
  getCachedSignedUrl: () => Promise.resolve("https://r2.test/get"),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: () => Promise.resolve("https://r2.test/put"),
}));
vi.mock("@/features/auth/session", () => ({
  validateSessionToken: () => Promise.resolve({ user: { id: "u1" } }),
}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: () => ({ value: "token" }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const put = (image: string | null) =>
  PUT(
    new NextRequest("http://localhost/api/profile", {
      method: "PUT",
      body: JSON.stringify({ name: "Teddy", email: "t@example.com", image }),
    }),
  );
const deletedKeys = () =>
  vi
    .mocked(s3Client.send)
    .mock.calls.map(([command]) => (command as DeleteObjectCommand).input.Key);

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
    expect(s3Client.send).not.toHaveBeenCalled();
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
    expect(s3Client.send).not.toHaveBeenCalled();
  });
});
