import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { deleteObjects } from "@/lib/s3-client";

const db = vi.hoisted(() => ({ prisma: undefined as unknown }));
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_ENVIRONMENT: "dev",
    R2_ENDPOINT: "https://r2.test",
    R2_ACCESS_KEY: "a",
    R2_SECRET_ACCESS_KEY: "b",
  },
}));
vi.mock("@/lib/database-client", async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  db.prisma = mockDeep<PrismaClient>();
  return { prisma: db.prisma, redis: mockDeep() };
});
// Real module (presignImagePut may live here), with network-facing parts stubbed
vi.mock("@/lib/s3-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/s3-client")>()),
  deleteObjects: vi.fn(() => Promise.resolve()),
  getCachedSignedUrl: vi.fn((key: string) =>
    Promise.resolve(`https://signed/${key}`),
  ),
}));
// Records whether each presign happened inside the note's transaction
const txn = vi.hoisted(() => ({ open: false, signedInside: [] as boolean[] }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(() => {
    txn.signedInside.push(txn.open);
    return Promise.resolve("https://r2.test/put");
  }),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ get: () => ({ value: "token" }) })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/session", () => ({
  validateSessionToken: vi.fn(() =>
    Promise.resolve({ session: {}, user: { id: "u1", name: "Teddy" } }),
  ),
}));

import { DELETE, PATCH, PUT } from "@/app/api/moments/notes/[noteId]/route";

const prisma = () => db.prisma as DeepMockProxy<PrismaClient>;
const url = (noteId: string) => `http://localhost/api/moments/notes/${noteId}`;
const params = (noteId: string) => ({ params: Promise.resolve({ noteId }) });

const teddy = {
  userId: "u1",
  name: "Teddy",
  email: "t@example.com",
  password: "x",
  image: null,
};
const song = {
  videoId: "vid1",
  title: "Inferno",
  channelTitle: "Mrs. GREEN APPLE",
  thumbnailUrl: "https://i.ytimg.com/vi/vid1/hqdefault.jpg",
};
const place = {
  name: "Taipei",
  address: "Taipei City, Taiwan",
  placeId: "ChIJtaipei",
  latitude: 25.03,
  longitude: 121.56,
};
const oldKey = "notes/oldoldoldoldoldoldoldold";
const stored = {
  noteId: "n1",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-02T00:00:00.000Z"),
  authorId: "u1",
  author: teddy,
  text: "old",
  color: "mist",
  pattern: "plain",
  date: null,
  x: 10,
  y: 20,
  rotation: -2,
  z: 7,
  photoKey: oldKey,
  songVideoId: null,
  song: null,
  locationId: null,
  location: null,
};
interface ConnectOrCreate<T> {
  connectOrCreate?: { where: unknown; create: T };
  disconnect?: boolean;
}
// Shared rows already in the DB; connectOrCreate connects to them instead of creating
let storedLocations: Record<string, typeof place & { locationId: string }> = {};
const joined = (data: Record<string, unknown>) => {
  const result: Record<string, unknown> = {};
  const location = data.location as ConnectOrCreate<typeof place> | undefined;
  if (location?.connectOrCreate) {
    const { create } = location.connectOrCreate;
    const row = storedLocations[create.placeId] ?? {
      locationId: "loc-new",
      ...create,
    };
    result.location = row;
    result.locationId = row.locationId;
  } else if (location?.disconnect) {
    result.location = null;
    result.locationId = null;
  }
  const songWrite = data.song as ConnectOrCreate<typeof song> | undefined;
  if (songWrite?.connectOrCreate) {
    result.song = songWrite.connectOrCreate.create;
    result.songVideoId = songWrite.connectOrCreate.create.videoId;
  } else if (songWrite?.disconnect) {
    result.song = null;
    result.songVideoId = null;
  }
  return result;
};
// The cropped photo the client declares for photo "new"
const photoFile = { size: 123_456, type: "image/jpeg" };
const save = {
  text: "new text",
  color: "lilac",
  pattern: "lines",
  photo: "keep",
  song: null,
  place: null,
  date: "2026-10-22",
};
const notFound = () =>
  new Prisma.PrismaClientKnownRequestError("Record not found", {
    code: "P2025",
    clientVersion: "test",
  });
const request = (method: string, value?: unknown) =>
  new NextRequest(url("n1"), {
    method,
    body:
      value === undefined
        ? undefined
        : typeof value === "string"
          ? value
          : JSON.stringify(value),
  });
const put = (value: unknown, noteId = "n1") =>
  PUT(request("PUT", value), params(noteId));
const patch = (value: unknown, noteId = "n1") =>
  PATCH(request("PATCH", value), params(noteId));
const remove = (noteId = "n1") => DELETE(request("DELETE"), params(noteId));
const updateArgs = () =>
  prisma().momentNote.update.mock.calls[0][0] as {
    where: unknown;
    data: Record<string, unknown>;
  };
const deletedKeys = () =>
  vi.mocked(deleteObjects).mock.calls.flatMap(([keys]) => keys);
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockReset(prisma());
  storedLocations = {};
  vi.mocked(deleteObjects).mockClear();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  txn.open = false;
  txn.signedInside = [];
  vi.mocked(getSignedUrl).mockClear();
  prisma().$transaction.mockImplementation((async (arg: unknown) => {
    if (typeof arg !== "function")
      return Promise.all(arg as Promise<unknown>[]);
    txn.open = true;
    try {
      return await (arg as (client: PrismaClient) => Promise<unknown>)(
        prisma(),
      );
    } finally {
      txn.open = false;
    }
  }) as never);
  // The builder may read the old photo key through any of these
  prisma().momentNote.findUnique.mockResolvedValue(stored as never);
  prisma().momentNote.findUniqueOrThrow.mockResolvedValue(stored as never);
  prisma().momentNote.findFirst.mockResolvedValue(stored as never);
  prisma().momentNote.update.mockImplementation((({
    data,
  }: {
    data: Record<string, unknown>;
  }) => Promise.resolve({ ...stored, ...data, ...joined(data) })) as never);
  prisma().momentNote.delete.mockResolvedValue(stored as never);
});

describe("R34: PUT /api/moments/notes/[noteId]", () => {
  test("replaces the content fields of that note and answers it", async () => {
    const response = await put(save);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      uploadUrl: null,
      note: {
        noteId: "n1",
        text: "new text",
        color: "lilac",
        pattern: "lines",
        photoKey: oldKey,
        photoUrl: `https://signed/${oldKey}`,
        song: null,
        place: null,
        date: "2026-10-22",
        x: 10,
        y: 20,
        rotation: -2,
        z: 7,
        author: { id: "u1", name: "Teddy", imageUrl: null },
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    });
    expect(updateArgs().where).toMatchObject({ noteId: "n1" });
    expect(updateArgs().data).toMatchObject({
      text: "new text",
      color: "lilac",
      pattern: "lines",
      date: "2026-10-22",
    });
  });

  test("does not touch position or author", async () => {
    await put({ ...save, x: 1, y: 2, z: 3, rotation: 4, authorId: "u2" });

    for (const field of ["x", "y", "z", "rotation", "authorId", "author"]) {
      expect(updateArgs().data).not.toHaveProperty(field);
    }
  });

  test("a song and a place are connectOrCreate'd by videoId and placeId", async () => {
    const response = await put({
      ...save,
      song,
      place: { ...place, name: " Taipei ", address: " Taipei City, Taiwan " },
    });

    expect(updateArgs().data).toMatchObject({
      song: {
        connectOrCreate: { where: { videoId: song.videoId }, create: song },
      },
      location: {
        connectOrCreate: { where: { placeId: place.placeId }, create: place },
      },
    });
    expect(await response.json()).toMatchObject({ note: { song, place } });
  });

  test("the old detail columns are not written", async () => {
    await put({ ...save, song, place });

    for (const column of [
      "songTitle",
      "songChannelTitle",
      "songThumbnailUrl",
      "placeName",
      "placeId",
      "placeLatitude",
      "placeLongitude",
    ]) {
      expect(updateArgs().data).not.toHaveProperty(column);
    }
  });

  test("null song and place disconnect them", async () => {
    const response = await put(save);

    expect(updateArgs().data).toMatchObject({
      song: { disconnect: true },
      location: { disconnect: true },
    });
    expect(await response.json()).toMatchObject({
      note: { song: null, place: null },
    });
  });

  test("an existing place wins over the request's name and address", async () => {
    storedLocations[place.placeId] = {
      ...place,
      locationId: "loc-old",
      name: "台北",
      address: "臺北市, 台灣",
    };

    const response = await put({ ...save, place });

    expect(await response.json()).toMatchObject({
      note: { place: { ...place, name: "台北", address: "臺北市, 台灣" } },
    });
  });

  test("a place without an address answers 400", async () => {
    const response = await put({
      ...save,
      place: { ...place, address: undefined },
    });

    expect(response.status).toBe(400);
    expect(prisma().momentNote.update).not.toHaveBeenCalled();
  });

  test('photo "keep" leaves photoKey out of the update and deletes nothing', async () => {
    const response = await put(save);

    expect(updateArgs().data).not.toHaveProperty("photoKey");
    expect(deleteObjects).not.toHaveBeenCalled();
    expect(getSignedUrl).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      uploadUrl: null,
      note: { photoKey: oldKey, photoUrl: `https://signed/${oldKey}` },
    });
  });

  test('photo "new" writes a fresh server key, answers an upload URL, then deletes the old object', async () => {
    const response = await put({ ...save, photo: "new", photoFile });

    expect(response.status).toBe(200);
    const photoKey = updateArgs().data.photoKey as string;
    expect(photoKey).toMatch(/^notes\/[a-z0-9]{20,32}$/);
    expect(photoKey).not.toBe(oldKey);
    expect(await response.json()).toMatchObject({
      uploadUrl: "https://r2.test/put",
      note: { photoKey, photoUrl: `https://signed/${photoKey}` },
    });
    const [, command, options] = vi.mocked(getSignedUrl).mock.calls[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toMatchObject({
      Bucket: "images-dev",
      Key: photoKey,
    });
    expect(options).toMatchObject({ expiresIn: 300 });
    expect(txn.signedInside).toEqual([true]);
    expect(deletedKeys()).toEqual([oldKey]);
    expect(
      vi.mocked(deleteObjects).mock.invocationCallOrder[0],
    ).toBeGreaterThan(prisma().momentNote.update.mock.invocationCallOrder[0]);
  });

  test('photo "none" writes null and deletes the old object', async () => {
    const response = await put({ ...save, photo: "none" });

    expect(response.status).toBe(200);
    expect(updateArgs().data.photoKey).toBeNull();
    expect(deletedKeys()).toEqual([oldKey]);
    expect(getSignedUrl).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      uploadUrl: null,
      note: { photoKey: null, photoUrl: null },
    });
  });

  test.each(["new", "none"])(
    "photo %j on a note without a photo deletes nothing",
    async (photo) => {
      const plain = { ...stored, photoKey: null };
      prisma().momentNote.findUnique.mockResolvedValue(plain as never);
      prisma().momentNote.findUniqueOrThrow.mockResolvedValue(plain as never);
      prisma().momentNote.findFirst.mockResolvedValue(plain as never);

      const response = await put({
        ...save,
        photo,
        photoFile: photo === "new" ? photoFile : null,
      });

      expect(response.status).toBe(200);
      expect(deleteObjects).not.toHaveBeenCalled();
    },
  );

  test("a client-sent photoKey is ignored", async () => {
    await put({ ...save, photoKey: "notes/hijackhijackhijackhijack" });

    expect(updateArgs().data).not.toHaveProperty("photoKey");
  });

  test("a presign failure answers 500 and deletes nothing", async () => {
    vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error("r2 down"));

    const response = await put({ ...save, photo: "new", photoFile });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to update note" });
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  test("a failed update deletes nothing", async () => {
    prisma().momentNote.update.mockRejectedValue(new Error("down"));

    const response = await put({ ...save, photo: "new", photoFile });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to update note" });
    expect(deleteObjects).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });

  test.each([
    ["201-char text", { text: "a".repeat(201) }],
    ["unknown color", { color: "blue" }],
    ["unknown pattern", { pattern: "" }],
    ["unknown photo", { photo: "replace" }],
    ["null photo", { photo: null }],
    ["missing photo", { photo: undefined }],
    ["a key as photo", { photo: "notes/tz4a98xxat96iws9zmbrgj3a" }],
    ["bad date", { date: "2026-13-01" }],
    ["bad place", { place: { ...place, name: "" } }],
    ["bad song", { song: { ...song, thumbnailUrl: "nope" } }],
  ])("%s answers 400 and updates nothing", async (_, patchValue) => {
    const response = await put({ ...save, ...patchValue });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid note" });
    expect(prisma().momentNote.update).not.toHaveBeenCalled();
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  test.each(["{not json", "", "null"])(
    "malformed body %j answers 400",
    async (raw) => {
      const response = await put(raw);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ message: "Invalid note" });
    },
  );

  test("a missing note (P2025) answers 404", async () => {
    prisma().momentNote.findUnique.mockResolvedValue(null);
    prisma().momentNote.findFirst.mockResolvedValue(null);
    prisma().momentNote.findUniqueOrThrow.mockRejectedValue(notFound());
    prisma().momentNote.update.mockRejectedValue(notFound());

    const response = await put(save, "gone");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "Note not found." });
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  test("a P2002 race on first use of a place answers 500", async () => {
    prisma().momentNote.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "test",
        meta: { modelName: "Location", target: ["place_id"] },
      }),
    );

    const response = await put({ ...save, place });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to update note" });
  });

  test("a P2002 on the photo key is a 500 too", async () => {
    prisma().momentNote.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "test",
        meta: { modelName: "MomentNote", target: ["photo_key"] },
      }),
    );

    const response = await put({ ...save, photo: "new", photoFile });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to update note" });
    expect(deleteObjects).not.toHaveBeenCalled();
  });
});

describe("R33: PATCH /api/moments/notes/[noteId]", () => {
  test("saves x, y, z only and answers the note", async () => {
    const response = await patch({ x: 300.5, y: -12, z: 9 });

    expect(response.status).toBe(200);
    expect(updateArgs().where).toMatchObject({ noteId: "n1" });
    expect(updateArgs().data).toEqual({ x: 300.5, y: -12, z: 9 });
    expect(await response.json()).toMatchObject({
      noteId: "n1",
      x: 300.5,
      y: -12,
      z: 9,
      text: "old",
    });
  });

  test("strips content fields", async () => {
    await patch({ x: 1, y: 2, z: 0, text: "hijack", photoKey: null });

    expect(updateArgs().data).toEqual({ x: 1, y: 2, z: 0 });
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  test.each([
    ["negative z", { x: 1, y: 2, z: -1 }],
    ["fractional z", { x: 1, y: 2, z: 1.5 }],
    ["string x", { x: "1", y: 2, z: 0 }],
    ["missing y", { x: 1, z: 0 }],
    ["missing z", { x: 1, y: 2 }],
  ])("%s answers 400", async (_, value) => {
    const response = await patch(value);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid note" });
    expect(prisma().momentNote.update).not.toHaveBeenCalled();
  });

  test("malformed JSON answers 400", async () => {
    const response = await patch("{x:");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid note" });
  });

  test("a missing note (P2025) answers 404", async () => {
    prisma().momentNote.update.mockRejectedValue(notFound());

    const response = await patch({ x: 1, y: 2, z: 0 }, "gone");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "Note not found." });
  });

  test("a Prisma failure is logged and answers 500", async () => {
    prisma().momentNote.update.mockRejectedValue(new Error("down"));

    const response = await patch({ x: 1, y: 2, z: 0 });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to update note" });
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("R35: DELETE /api/moments/notes/[noteId]", () => {
  test("deletes the note, then its photo object", async () => {
    const response = await remove();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(prisma().momentNote.delete.mock.calls[0][0]).toMatchObject({
      where: { noteId: "n1" },
    });
    expect(deletedKeys()).toEqual([oldKey]);
    expect(
      vi.mocked(deleteObjects).mock.invocationCallOrder[0],
    ).toBeGreaterThan(prisma().momentNote.delete.mock.invocationCallOrder[0]);
  });

  test("a note without a photo deletes no object", async () => {
    prisma().momentNote.delete.mockResolvedValue({
      ...stored,
      photoKey: null,
    } as never);

    const response = await remove();

    expect(response.status).toBe(200);
    expect(deletedKeys()).toEqual([]);
  });

  test("a missing note (P2025) answers 404 and deletes no object", async () => {
    prisma().momentNote.delete.mockRejectedValue(notFound());

    const response = await remove("gone");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "Note not found." });
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  test("a Prisma failure is logged and answers 500", async () => {
    prisma().momentNote.delete.mockRejectedValue(new Error("down"));

    const response = await remove();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to delete note" });
    expect(deleteObjects).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("R34/R35: edge cases (white-box)", () => {
  test("PUT where the old row read finds nothing but the update succeeds deletes nothing", async () => {
    prisma().momentNote.findUnique.mockResolvedValue(null);

    const response = await put({ ...save, photo: "new", photoFile });

    expect(response.status).toBe(200);
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  test("PUT reads the old key and updates inside one transaction", async () => {
    await put({ ...save, photo: "new", photoFile });

    expect(prisma().$transaction).toHaveBeenCalledTimes(1);
    expect(prisma().momentNote.findUnique.mock.calls[0][0]).toMatchObject({
      where: { noteId: "n1" },
    });
  });

  test("PUT with another known Prisma error answers 500", async () => {
    prisma().momentNote.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("FK", {
        code: "P2003",
        clientVersion: "test",
      }),
    );

    const response = await put(save);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to update note" });
  });

  test("DELETE with another known Prisma error answers 500", async () => {
    prisma().momentNote.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("FK", {
        code: "P2003",
        clientVersion: "test",
      }),
    );

    const response = await remove();

    expect(response.status).toBe(500);
  });
});

describe("R15/R16: PUT /api/moments/notes/[noteId] photoFile", () => {
  test('photo "new" signs the declared Content-Type and Content-Length', async () => {
    const response = await put({
      ...save,
      photo: "new",
      photoFile: { size: 999, type: "image/webp" },
    });

    expect(response.status).toBe(200);
    const [, command, options] = vi.mocked(getSignedUrl).mock.calls[0];
    expect((command as PutObjectCommand).input).toEqual({
      Bucket: "images-dev",
      Key: updateArgs().data.photoKey,
      ContentType: "image/webp",
      ContentLength: 999,
    });
    // Request-only detail; Prisma would reject an unknown column
    expect(updateArgs().data).not.toHaveProperty("photoFile");
    expect(options).toMatchObject({
      expiresIn: 300,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
  });

  test.each([
    ["left out", undefined],
    ["null", null],
  ])(
    'photo "new" with photoFile %s: 400 Missing image details',
    async (_, value) => {
      const response = await put({ ...save, photo: "new", photoFile: value });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        message: "Missing image details",
      });
      expect(prisma().momentNote.update).not.toHaveBeenCalled();
      expect(deleteObjects).not.toHaveBeenCalled();
    },
  );

  test("over 5 MB: 400 Images must be 5 MB or smaller", async () => {
    const response = await put({
      ...save,
      photo: "new",
      photoFile: { size: 6_000_000, type: "image/jpeg" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Images must be 5 MB or smaller",
    });
    expect(prisma().momentNote.update).not.toHaveBeenCalled();
  });

  test("a HEIC: 400 Only JPEG, PNG, WebP or GIF", async () => {
    const response = await put({
      ...save,
      photo: "new",
      photoFile: { size: 10, type: "image/heif" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Only JPEG, PNG, WebP or GIF images can be uploaded",
    });
    expect(prisma().momentNote.update).not.toHaveBeenCalled();
  });

  test('the fallback photo "none" PUT with photoFile null clears the photo', async () => {
    const response = await put({ ...save, photo: "none", photoFile: null });

    expect(response.status).toBe(200);
    expect(updateArgs().data.photoKey).toBeNull();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  test('photo "keep" ignores a stray photoFile', async () => {
    const response = await put({ ...save, photo: "keep", photoFile });

    expect(response.status).toBe(200);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});

describe("PUT /api/moments/notes/[noteId] photoFile (white-box)", () => {
  test("a photoFile issue wins over another invalid field", async () => {
    const response = await put({
      ...save,
      text: "a".repeat(201),
      photo: "new",
      photoFile: { size: 10, type: "image/bmp" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Only JPEG, PNG, WebP or GIF images can be uploaded",
    });
  });

  test("a non-photo issue alone stays Invalid note", async () => {
    const response = await put({ ...save, color: "blue", photoFile: null });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid note" });
  });
});
