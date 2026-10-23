import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getCachedSignedUrl } from "@/lib/s3-client";
import { validateSessionToken } from "@/features/auth/session";

const db = vi.hoisted(() => ({ prisma: undefined as unknown }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_ENVIRONMENT: "dev" } }));
vi.mock("@/lib/database-client", async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  db.prisma = mockDeep<PrismaClient>();
  return { prisma: db.prisma, redis: mockDeep() };
});
vi.mock("@/lib/s3-client", () => ({
  default: { send: vi.fn() },
  bucket: "images-dev",
  deleteObjects: vi.fn(),
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
vi.mock("@/features/auth/session", () => ({ validateSessionToken: vi.fn() }));

import { GET, POST } from "@/app/api/moments/notes/route";

const prisma = () => db.prisma as DeepMockProxy<PrismaClient>;
const url = "http://localhost/api/moments/notes";

const teddy = {
  userId: "u1",
  name: "Teddy",
  email: "t@example.com",
  password: "x",
  image: "me.jpg-abc",
};
const ruru = { ...teddy, userId: "u2", name: "Ruru", image: null };
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
const locationRow = (value: typeof place, locationId = "loc1") => ({
  locationId,
  ...value,
});
const row = (overrides: Record<string, unknown> = {}) => ({
  noteId: "n1",
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-02T00:00:00.000Z"),
  authorId: "u1",
  author: teddy,
  text: "hello",
  color: "mist",
  pattern: "plain",
  photoKey: null,
  songVideoId: null,
  song: null,
  locationId: null,
  location: null,
  date: null,
  x: 10,
  y: 20,
  rotation: -2,
  z: 0,
  ...overrides,
});
const fullRow = row({
  noteId: "n2",
  authorId: "u2",
  author: ruru,
  text: "line1\nline2",
  color: "butter",
  pattern: "grid",
  date: "2026-10-12",
  z: 3,
  photoKey: "notes/abcdefghij0123456789abcd",
  songVideoId: song.videoId,
  song,
  locationId: "loc1",
  location: locationRow(place),
});

const body = {
  text: "hello wall",
  color: "butter",
  pattern: "grid",
  photo: "none",
  song: null,
  place: null,
  date: "2026-10-22",
  x: 120,
  y: -40,
  rotation: 3,
};
const post = (value: unknown) =>
  POST(
    new NextRequest(url, {
      method: "POST",
      body: typeof value === "string" ? value : JSON.stringify(value),
    }),
  );
const createData = () =>
  prisma().momentNote.create.mock.calls[0][0].data as Record<string, unknown>;
const authorOf = (data: Record<string, unknown>) =>
  data.authorId ??
  (data.author as { connect?: { userId?: string } } | undefined)?.connect
    ?.userId;
// The builder may read the current max z through aggregate or findFirst, inside a transaction or not
const setMaxZ = (z: number | null) => {
  prisma().momentNote.aggregate.mockResolvedValue({ _max: { z } } as never);
  prisma().momentNote.findFirst.mockResolvedValue(
    (z === null ? null : row({ z })) as never,
  );
};

interface ConnectOrCreate<T> {
  connectOrCreate?: { where: unknown; create: T };
}
// Shared rows already in the DB; connectOrCreate connects to them instead of creating
let storedLocations: Record<string, ReturnType<typeof locationRow>> = {};
let storedSongs: Record<string, typeof song> = {};
const resolveRelations = (data: Record<string, unknown>) => {
  const locationWrite = data.location as
    | ConnectOrCreate<typeof place>
    | undefined;
  const songWrite = data.song as ConnectOrCreate<typeof song> | undefined;
  const created = locationWrite?.connectOrCreate?.create;
  const location = created
    ? (storedLocations[created.placeId] ?? locationRow(created, "loc-new"))
    : null;
  const createdSong = songWrite?.connectOrCreate?.create;
  const joinedSong = createdSong
    ? (storedSongs[createdSong.videoId] ?? createdSong)
    : null;
  return {
    location,
    locationId: location?.locationId ?? null,
    song: joinedSong,
    songVideoId: joinedSong?.videoId ?? null,
  };
};
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockReset(prisma());
  storedLocations = {};
  storedSongs = {};
  vi.mocked(getCachedSignedUrl).mockClear();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(validateSessionToken).mockResolvedValue({
    session: { sessionId: "s", userId: "u1", expireAt: new Date() },
    user: {
      id: "u1",
      name: "Teddy",
      email: "t@example.com",
      password: "x",
      image: "me.jpg-abc",
    },
  });
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
  setMaxZ(4);
  prisma().momentNote.create.mockImplementation((({
    data,
  }: {
    data: Record<string, unknown>;
  }) =>
    Promise.resolve({
      ...row(),
      noteId: "new",
      createdAt: new Date("2026-10-22T04:00:00.000Z"),
      updatedAt: new Date("2026-10-22T04:00:00.000Z"),
      ...data,
      ...resolveRelations(data),
      authorId: "u1",
      author: teddy,
    })) as never);
});

describe("R32: GET /api/moments/notes", () => {
  test("answers every note with each field mapped from the joined rows", async () => {
    prisma().momentNote.findMany.mockResolvedValue([row(), fullRow] as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notes: [
        {
          noteId: "n1",
          text: "hello",
          color: "mist",
          pattern: "plain",
          photoKey: null,
          photoUrl: null,
          song: null,
          place: null,
          date: null,
          x: 10,
          y: 20,
          rotation: -2,
          z: 0,
          author: {
            id: "u1",
            name: "Teddy",
            imageUrl: "https://signed/avatar/me.jpg-abc",
          },
          createdAt: "2026-10-01T00:00:00.000Z",
        },
        {
          noteId: "n2",
          text: "line1\nline2",
          color: "butter",
          pattern: "grid",
          photoKey: "notes/abcdefghij0123456789abcd",
          photoUrl: "https://signed/notes/abcdefghij0123456789abcd",
          song,
          place,
          date: "2026-10-12",
          x: 10,
          y: 20,
          rotation: -2,
          z: 3,
          author: { id: "u2", name: "Ruru", imageUrl: null },
          createdAt: "2026-10-01T00:00:00.000Z",
        },
      ],
    });
  });

  test("the place in a response has no locationId", async () => {
    prisma().momentNote.findMany.mockResolvedValue([fullRow] as never);

    const { notes } = (await (await GET()).json()) as {
      notes: { place: Record<string, unknown> }[];
    };

    expect(Object.keys(notes[0].place).sort()).toEqual([
      "address",
      "latitude",
      "longitude",
      "name",
      "placeId",
    ]);
  });

  test("joins the author, song and location", async () => {
    prisma().momentNote.findMany.mockResolvedValue([] as never);

    await GET();

    const { include } = prisma().momentNote.findMany.mock.calls[0][0] as {
      include: Record<string, unknown>;
    };
    expect(include.author).toBeTruthy();
    expect(include.song).toBeTruthy();
    expect(include.location).toBeTruthy();
  });

  test("orders by z ascending, then createdAt ascending", async () => {
    prisma().momentNote.findMany.mockResolvedValue([] as never);

    await GET();

    const { orderBy } = prisma().momentNote.findMany.mock.calls[0][0] as {
      orderBy: unknown;
    };
    expect([orderBy].flat()).toEqual([{ z: "asc" }, { createdAt: "asc" }]);
  });

  test("signs the photo key itself, fresh per request", async () => {
    prisma().momentNote.findMany.mockResolvedValue([fullRow] as never);

    await GET();
    await GET();

    expect(
      vi
        .mocked(getCachedSignedUrl)
        .mock.calls.filter(([key]) => key === fullRow.photoKey),
    ).toHaveLength(2);
  });

  test("an empty table answers an empty list", async () => {
    prisma().momentNote.findMany.mockResolvedValue([] as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notes: [] });
  });

  test("a Prisma failure is logged and answers 500", async () => {
    prisma().momentNote.findMany.mockRejectedValue(new Error("down"));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to fetch notes" });
    expect(consoleError).toHaveBeenCalled();
  });

  test("a signing failure answers 500", async () => {
    prisma().momentNote.findMany.mockResolvedValue([fullRow] as never);
    vi.mocked(getCachedSignedUrl).mockRejectedValueOnce(new Error("r2"));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to fetch notes" });
  });
});

describe("R34: POST /api/moments/notes", () => {
  test("creates the note for the session user with z = max + 1 and answers it", async () => {
    const response = await post(body);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      uploadUrl: null,
      note: {
        noteId: "new",
        text: "hello wall",
        color: "butter",
        pattern: "grid",
        photoKey: null,
        photoUrl: null,
        song: null,
        place: null,
        date: "2026-10-22",
        x: 120,
        y: -40,
        rotation: 3,
        z: 5,
        author: {
          id: "u1",
          name: "Teddy",
          imageUrl: "https://signed/avatar/me.jpg-abc",
        },
        createdAt: "2026-10-22T04:00:00.000Z",
      },
    });
    expect(prisma().momentNote.create).toHaveBeenCalledTimes(1);
    expect(createData()).toMatchObject({
      text: "hello wall",
      color: "butter",
      pattern: "grid",
      date: "2026-10-22",
      x: 120,
      y: -40,
      rotation: 3,
      z: 5,
    });
    expect(authorOf(createData())).toBe("u1");
  });

  test("the first note gets z = 0", async () => {
    setMaxZ(null);

    await post(body);

    expect(createData().z).toBe(0);
  });

  test("a place and a song are connectOrCreate'd by placeId and videoId", async () => {
    const response = await post({
      ...body,
      song,
      place: {
        ...place,
        name: "  Taipei  ",
        address: "  Taipei City, Taiwan ",
      },
    });

    expect(response.status).toBe(200);
    expect(createData()).toMatchObject({
      location: {
        connectOrCreate: {
          where: { placeId: place.placeId },
          create: place,
        },
      },
      song: {
        connectOrCreate: {
          where: { videoId: song.videoId },
          create: song,
        },
      },
    });
    expect(await response.json()).toMatchObject({ note: { song, place } });
  });

  test("the old detail columns are not written", async () => {
    await post({ ...body, song, place });

    for (const column of [
      "songTitle",
      "songChannelTitle",
      "songThumbnailUrl",
      "placeName",
      "placeId",
      "placeLatitude",
      "placeLongitude",
    ]) {
      expect(createData()).not.toHaveProperty(column);
    }
  });

  test("null song and place are left out", async () => {
    await post(body);

    expect(createData().location).toBeUndefined();
    expect(createData().song).toBeUndefined();
    expect(createData().locationId ?? null).toBeNull();
    expect(createData().songVideoId ?? null).toBeNull();
  });

  test("an existing place and song win over the request's details", async () => {
    storedLocations[place.placeId] = locationRow(
      { ...place, name: "台北", address: "臺北市, 台灣" },
      "loc-old",
    );
    storedSongs[song.videoId] = { ...song, title: "Inferno (Original)" };

    const response = await post({ ...body, song, place });

    expect(await response.json()).toMatchObject({
      note: {
        place: { ...place, name: "台北", address: "臺北市, 台灣" },
        song: { ...song, title: "Inferno (Original)" },
      },
    });
  });

  test('photo "new" stores a fresh server key and answers a presigned upload URL', async () => {
    const response = await post({ ...body, photo: "new" });

    expect(response.status).toBe(200);
    const photoKey = createData().photoKey as string;
    expect(photoKey).toMatch(/^notes\/[a-z0-9]{20,32}$/);
    expect(await response.json()).toMatchObject({
      uploadUrl: "https://r2.test/put",
      note: { photoKey, photoUrl: `https://signed/${photoKey}` },
    });
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    const [, command, options] = vi.mocked(getSignedUrl).mock.calls[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toMatchObject({
      Bucket: "images-dev",
      Key: photoKey,
    });
    expect(options).toMatchObject({ expiresIn: 300 });
    expect(txn.signedInside).toEqual([true]);
  });

  test('each photo "new" gets a different key', async () => {
    await post({ ...body, photo: "new" });
    await post({ ...body, photo: "new" });

    const [first, second] = prisma().momentNote.create.mock.calls.map(
      ([args]) => (args.data as { photoKey: string }).photoKey,
    );
    expect(first).not.toBe(second);
  });

  test.each(["keep", "none"])(
    "photo %j stores no key and answers no upload URL",
    async (photo) => {
      const response = await post({ ...body, photo });

      expect(response.status).toBe(200);
      expect(createData().photoKey ?? null).toBeNull();
      expect(await response.json()).toMatchObject({
        uploadUrl: null,
        note: { photoKey: null, photoUrl: null },
      });
      expect(getSignedUrl).not.toHaveBeenCalled();
    },
  );

  test("a client-sent photoKey is ignored", async () => {
    await post({
      ...body,
      photo: "none",
      photoKey: "notes/hijackhijackhijackhijack",
    });

    expect(createData().photoKey ?? null).toBeNull();
  });

  test("a presign failure answers 500", async () => {
    vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error("r2 down"));

    const response = await post({ ...body, photo: "new" });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to create note" });
  });

  test.each([
    ["empty text", { text: "" }],
    ["200-char text", { text: "a".repeat(200) }],
    ["CJK and emoji text", { text: "新功能上線！🎉" }],
    ["no date", { date: null }],
    ["rotation -8", { rotation: -8 }],
    ["rotation 8", { rotation: 8 }],
  ])("accepts %s", async (_, patch) => {
    const response = await post({ ...body, ...patch });

    expect(response.status).toBe(200);
    expect(createData()).toMatchObject(patch);
  });

  test("ignores a client-sent z, author and noteId", async () => {
    await post({ ...body, z: 99, authorId: "u2", noteId: "hijack" });

    expect(createData().z).toBe(5);
    expect(authorOf(createData())).toBe("u1");
    expect(createData().noteId).toBeUndefined();
  });

  test.each([
    ["201-char text", { text: "a".repeat(201) }],
    ["unknown color", { color: "blue" }],
    ["unknown pattern", { pattern: "dots" }],
    [
      "a photo key instead of photo",
      { photo: undefined, photoKey: "notes/tz4a98xxat96iws9zmbrgj3a" },
    ],
    ["unknown photo", { photo: "replace" }],
    ["null photo", { photo: null }],
    ["bad date", { date: "2026-02-29" }],
    ["rotation 9", { rotation: 9 }],
    ["string x", { x: "1" }],
    ["missing y", { y: undefined }],
    ["latitude 91", { place: { ...place, latitude: 91 } }],
    ["place without an address", { place: { ...place, address: undefined } }],
    ["empty address", { place: { ...place, address: "  " } }],
    ["empty song title", { song: { ...song, title: "" } }],
  ])("%s answers 400 and creates nothing", async (_, patch) => {
    const response = await post({ ...body, ...patch });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid note" });
    expect(prisma().momentNote.create).not.toHaveBeenCalled();
  });

  test.each(["{not json", "", "null", "[]"])(
    "malformed body %j answers 400",
    async (raw) => {
      const response = await post(raw);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ message: "Invalid note" });
      expect(prisma().momentNote.create).not.toHaveBeenCalled();
    },
  );

  test("a missing or invalid session answers 401 and creates nothing", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue({
      session: null,
      user: null,
    });

    const response = await post(body);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Unauthorized" });
    expect(prisma().momentNote.create).not.toHaveBeenCalled();
  });

  test("validates the session cookie's token", async () => {
    await post(body);

    expect(validateSessionToken).toHaveBeenCalledWith("token");
  });

  test("a P2002 on the photo key is a 500 too", async () => {
    prisma().momentNote.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "test",
        meta: { modelName: "MomentNote", target: ["photo_key"] },
      }),
    );

    const response = await post({ ...body, photo: "new" });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to create note" });
  });

  test("a P2002 race on first use of a place answers 500", async () => {
    prisma().momentNote.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint", {
        code: "P2002",
        clientVersion: "test",
        meta: { modelName: "Location", target: ["place_id"] },
      }),
    );

    const response = await post({ ...body, place });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to create note" });
  });

  test("a Prisma failure is logged and answers 500", async () => {
    prisma().momentNote.create.mockRejectedValue(new Error("down"));

    const response = await post(body);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to create note" });
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("R32/R34: edge cases (white-box)", () => {
  test("reads the author with only id, name and image", async () => {
    prisma().momentNote.findMany.mockResolvedValue([] as never);

    await GET();

    expect(prisma().momentNote.findMany.mock.calls[0][0]).toMatchObject({
      include: {
        author: { select: { userId: true, name: true, image: true } },
      },
    });
  });

  test("the session check runs before validation: a bad body without a session is 401", async () => {
    vi.mocked(validateSessionToken).mockResolvedValue({
      session: null,
      user: null,
    });

    const response = await post("{not json");

    expect(response.status).toBe(401);
  });

  test("a failure reading the max z answers 500", async () => {
    prisma().momentNote.aggregate.mockRejectedValue(new Error("down"));
    prisma().momentNote.findFirst.mockRejectedValue(new Error("down"));

    const response = await post(body);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Failed to create note" });
    expect(prisma().momentNote.create).not.toHaveBeenCalled();
  });

  test("another known Prisma error is still a 500", async () => {
    prisma().momentNote.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("FK", {
        code: "P2003",
        clientVersion: "test",
      }),
    );

    const response = await post(body);

    expect(response.status).toBe(500);
  });
});
