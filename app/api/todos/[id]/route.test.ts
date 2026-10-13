import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/database-client";
import s3Client from "@/lib/s3-client";
import { defaultTodoLocation } from "@/features/two-dos/models/location";
import { PUT } from "@/app/api/todos/[id]/route";

vi.mock("@/lib/database-client", () => ({
  prisma: {
    todo: { findUnique: vi.fn(), update: vi.fn() },
    location: { deleteMany: vi.fn() },
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

const put = (imageNames: string[]) =>
  PUT(
    new NextRequest("http://localhost/api/todos/t1", {
      method: "PUT",
      body: JSON.stringify({
        title: "Trip",
        description: null,
        location: defaultTodoLocation,
        doneAt: null,
        imageNames,
      }),
    }),
    { params: Promise.resolve({ id: "t1" }) },
  );
const deletedKeys = () =>
  vi
    .mocked(s3Client.send)
    .mock.calls.map(([command]) => (command as DeleteObjectCommand).input.Key);
const storedKeys = () =>
  vi.mocked(prisma.todo.update).mock.calls[0][0].data.imageKeys;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.todo.findUnique).mockResolvedValue({
    imageKeys: "a.jpg-1,b.jpg-2",
    locationId: "default",
  } as never);
  vi.mocked(prisma.todo.update).mockImplementation(
    ({ data }) =>
      Promise.resolve({
        todoId: "t1",
        title: "Trip",
        description: null,
        location: defaultTodoLocation,
        locationId: "default",
        createdAt: new Date(),
        updatedAt: new Date(),
        doneAt: null,
        priority: 1,
        imageKeys: data.imageKeys,
        createdBy: { name: "Teddy", image: null },
      }) as never,
  );
  vi.mocked(prisma.$transaction).mockImplementation((callback) =>
    (callback as (txn: typeof prisma) => Promise<unknown>)(prisma),
  );
});

describe("PUT /api/todos/[id] images", () => {
  test("keeps listed keys, deletes dropped ones, signs uploads for new names", async () => {
    const response = await put(["a.jpg-1", "0-new.jpg"]);
    const body = (await response.json()) as {
      imagesToUpload: { name: string }[];
    };

    expect(response.status).toBe(200);
    expect(storedKeys()).toMatch(/^a\.jpg-1,0-new\.jpg-\w+$/);
    expect(deletedKeys()).toEqual(["two-do/b.jpg-2"]);
    expect(body.imagesToUpload.map((image) => image.name)).toEqual([
      "0-new.jpg",
    ]);
  });

  test("an empty list clears the keys and deletes every object", async () => {
    await put([]);

    expect(storedKeys()).toBeNull();
    expect(deletedKeys()).toEqual(["two-do/a.jpg-1", "two-do/b.jpg-2"]);
  });

  test("a failed DB update deletes nothing", async () => {
    vi.mocked(prisma.todo.update).mockRejectedValue(new Error("db down"));

    const response = await put([]);

    expect(response.status).toBe(500);
    expect(s3Client.send).not.toHaveBeenCalled();
  });
});
