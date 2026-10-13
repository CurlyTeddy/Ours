import { describe, expect, test, vi } from "vitest";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { deleteObjects } from "@/lib/s3-client";

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_ENVIRONMENT: "dev",
    R2_ENDPOINT: "https://r2.test",
    R2_ACCESS_KEY: "a",
    R2_SECRET_ACCESS_KEY: "b",
  },
}));
vi.mock("@/lib/database-client", () => ({ redis: { isReady: false } }));

describe("deleteObjects", () => {
  test("tries every key and logs failures instead of throwing", async () => {
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockImplementation((command) =>
        (command as DeleteObjectCommand).input.Key === "two-do/b"
          ? Promise.reject(new Error("R2 down"))
          : Promise.resolve({}),
      );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      deleteObjects(["two-do/a", "two-do/b", "two-do/c"]),
    ).resolves.toBeUndefined();

    expect(
      send.mock.calls.map(
        ([command]) => (command as DeleteObjectCommand).input,
      ),
    ).toEqual([
      { Bucket: "images-dev", Key: "two-do/a" },
      { Bucket: "images-dev", Key: "two-do/b" },
      { Bucket: "images-dev", Key: "two-do/c" },
    ]);
    expect(log).toHaveBeenCalledWith(
      "Failed to delete two-do/b:",
      expect.any(Error),
    );
  });
});
