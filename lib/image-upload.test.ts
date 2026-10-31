import { beforeEach, describe, expect, test, vi } from "vitest";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  imageUploadSchema,
  maxImageBytes,
  uploadImageTypes,
  type ImageUpload,
} from "@/lib/image-upload";

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_ENVIRONMENT: "dev",
    R2_ENDPOINT: "https://r2.test",
    R2_ACCESS_KEY: "a",
    R2_SECRET_ACCESS_KEY: "b",
  },
}));
vi.mock("@/lib/database-client", () => ({ redis: { isReady: false } }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://r2.test/put?sig=1"),
}));

type Presign = (key: string, file: ImageUpload) => Promise<string>;
// The spec lets presignImagePut live in either file; the export name is fixed.
const loadPresign = async (): Promise<Presign> => {
  const upload = (await import("@/lib/image-upload")) as unknown as {
    presignImagePut?: Presign;
  };
  const s3 = (await import("@/lib/s3-client")) as unknown as {
    presignImagePut?: Presign;
  };
  const presign = upload.presignImagePut ?? s3.presignImagePut;
  if (!presign) throw new Error("presignImagePut is not exported");
  return presign;
};

const sizeMessage = "Images must be 5 MB or smaller";
const typeMessage = "Only JPEG, PNG, WebP or GIF images can be uploaded";
const parse = (value: unknown) => imageUploadSchema.safeParse(value);
const firstMessage = (value: unknown) => parse(value).error?.issues[0]?.message;

describe("R1: one shared limit", () => {
  test("maxImageBytes is 5 MiB", () => {
    expect(maxImageBytes).toBe(5 * 1024 * 1024);
    expect(maxImageBytes).toBe(5_242_880);
  });

  test("uploadImageTypes lists JPEG, PNG, WebP and GIF", () => {
    expect([...uploadImageTypes]).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);
  });
});

describe("R15: imageUploadSchema", () => {
  test.each(uploadImageTypes)("accepts %s and returns both fields", (type) => {
    expect(imageUploadSchema.parse({ size: 1000, type })).toEqual({
      size: 1000,
      type,
    });
  });

  test.each([
    ["1 byte", 1],
    ["exactly maxImageBytes", 5 * 1024 * 1024],
    ["maxImageBytes - 1", 5 * 1024 * 1024 - 1],
  ])("accepts a size of %s", (_, size) => {
    expect(parse({ size, type: "image/jpeg" }).success).toBe(true);
  });

  test.each([
    ["maxImageBytes + 1", 5 * 1024 * 1024 + 1],
    ["6,000,000 (user flow 6)", 6_000_000],
    ["a huge number", Number.MAX_SAFE_INTEGER],
  ])("rejects %s with the size message", (_, size) => {
    expect(parse({ size, type: "image/jpeg" }).success).toBe(false);
    expect(firstMessage({ size, type: "image/jpeg" })).toBe(sizeMessage);
  });

  test.each([
    ["zero", 0],
    ["negative", -1],
    ["a fraction", 1.5],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["a numeric string", "1000"],
    ["null", null],
    ["missing", undefined],
  ])("rejects a size that is %s", (_, size) => {
    expect(parse({ size, type: "image/jpeg" }).success).toBe(false);
  });

  test.each([
    "image/heic",
    "image/heif",
    "image/bmp",
    "image/svg+xml",
    "application/pdf",
    "IMAGE/JPEG",
    "image/jpg",
    "",
  ])("rejects type %j with the type message", (type) => {
    expect(parse({ size: 1000, type }).success).toBe(false);
    expect(firstMessage({ size: 1000, type })).toBe(typeMessage);
  });

  test.each([
    ["missing", undefined],
    ["null", null],
    ["a number", 1],
  ])("rejects a type that is %s", (_, type) => {
    expect(parse({ size: 1000, type }).success).toBe(false);
  });

  test.each([null, "image/jpeg", [], 5])("rejects a body of %j", (body) => {
    expect(parse(body).success).toBe(false);
  });

  test("an unknown field does not reach the output", () => {
    expect(
      imageUploadSchema.safeParse({
        size: 10,
        type: "image/png",
        name: "x.png",
      }).data,
    ).not.toHaveProperty("name");
  });

  test("an oversized HEIC fails (both checks apply)", () => {
    const result = parse({ size: 6_000_000, type: "image/heic" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([sizeMessage, typeMessage]),
    );
  });
});

describe("R16: presignImagePut", () => {
  beforeEach(() => {
    vi.mocked(getSignedUrl).mockClear();
  });

  test("signs a PUT with the declared Content-Type and Content-Length for 300 s", async () => {
    const presign = await loadPresign();
    const s3Client = (await import("@/lib/s3-client")).default;

    const url = await presign("two-do/a.jpg-1", {
      size: 123_456,
      type: "image/jpeg",
    });

    expect(url).toBe("https://r2.test/put?sig=1");
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    const [client, command, options] = vi.mocked(getSignedUrl).mock.calls[0];
    expect(client).toBe(s3Client);
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toEqual({
      Bucket: "images-dev",
      Key: "two-do/a.jpg-1",
      ContentType: "image/jpeg",
      ContentLength: 123_456,
    });
    expect(options?.expiresIn).toBe(300);
    expect(options?.signableHeaders).toEqual(
      new Set(["content-type", "content-length"]),
    );
  });

  test.each(uploadImageTypes)(
    "passes %s through as the signed type",
    async (type) => {
      const presign = await loadPresign();

      await presign("avatar/me-1", { size: 1, type });

      const command = vi.mocked(getSignedUrl).mock
        .calls[0][1] as PutObjectCommand;
      expect(command.input).toMatchObject({
        ContentType: type,
        ContentLength: 1,
      });
    },
  );

  test("a presign failure rejects", async () => {
    const presign = await loadPresign();
    vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error("r2 down"));

    await expect(
      presign("notes/x", { size: 10, type: "image/png" }),
    ).rejects.toThrow("r2 down");
  });
});
