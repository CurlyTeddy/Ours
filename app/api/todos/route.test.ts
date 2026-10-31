import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockReset, type mockDeep } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
  deleteObjects: vi.fn(),
  getCachedSignedUrl: vi.fn(async () => "https://signed"),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://r2.test/put"),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => ({ value: "token" }) })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/session", () => ({
  validateSessionToken: vi.fn(async () => ({
    user: { id: "u1", name: "Teddy" },
    session: { id: "s1" },
  })),
}));

import { GET, POST } from "@/app/api/todos/route";

const prisma = () => db.prisma as ReturnType<typeof mockDeep<PrismaClient>>;

const kyoto = {
  name: "Kyoto",
  address: "Kyoto, Japan",
  placeId: "place-kyoto",
  latitude: 35.01,
  longitude: 135.77,
};
const todoRow = (patch: Record<string, unknown> = {}) => ({
  todoId: "t1",
  title: "Temple",
  description: null,
  location: kyoto,
  locationId: "loc-kyoto",
  tripId: "trip1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  doneAt: null,
  priority: 4,
  imageKeys: null,
  createdById: "u1",
  createdBy: { name: "Teddy", image: null },
  ...patch,
});
const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("known", {
    code,
    clientVersion: "test",
  });
const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest("http://localhost/api/todos", {
      method: "POST",
      body: JSON.stringify({
        title: "Temple",
        location: null,
        tripId: null,
        images: [],
        ...body,
      }),
    }),
  );
const created = () =>
  prisma().todo.create.mock.calls[0][0].data as Record<string, unknown>;
// tripId may be written as a scalar or as a relation connect
const writtenTripId = (data: Record<string, unknown>) => {
  if ("tripId" in data) return data.tripId;
  const trip = data.trip as
    | { connect?: { tripId: string }; disconnect?: boolean }
    | undefined;
  if (trip?.connect) return trip.connect.tripId;
  return null;
};
const tripExists = (exists: boolean) => {
  prisma().trip.findUnique.mockResolvedValue(
    (exists ? { tripId: "trip1" } : null) as never,
  );
  prisma().trip.count.mockResolvedValue(exists ? 1 : 0);
  if (!exists) {
    prisma().todo.create.mockRejectedValue(known("P2003"));
  }
};

beforeEach(() => {
  mockReset(prisma());
  vi.mocked(getSignedUrl).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  prisma().$transaction.mockImplementation((async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (txn: PrismaClient) => unknown)(prisma())
      : Promise.all(arg as Promise<unknown>[])) as never);
  prisma().todo.aggregate.mockResolvedValue({
    _max: { priority: 9 },
  } as never);
  prisma().todo.findFirst.mockResolvedValue(todoRow({ priority: 9 }) as never);
  prisma().todo.create.mockImplementation((async ({
    data,
  }: {
    data: Record<string, unknown>;
  }) =>
    todoRow({
      title: data.title,
      priority: data.priority,
      tripId: writtenTripId(data),
      location: data.location ? kyoto : null,
      locationId: data.location ? "loc-kyoto" : null,
    })) as never);
});

describe("R1/R3: GET /api/todos", () => {
  test("DTOs carry tripId and a nullable location", async () => {
    prisma().todo.findMany.mockResolvedValue([
      todoRow(),
      todoRow({
        todoId: "t2",
        tripId: null,
        location: null,
        locationId: null,
        priority: 5,
      }),
    ] as never);

    const response = await GET();
    const body = (await response.json()) as {
      todos: { id: string; tripId: string | null; location: unknown }[];
    };

    expect(response.status).toBe(200);
    expect(
      body.todos.map(({ id, tripId, location }) => ({ id, tripId, location })),
    ).toEqual([
      { id: "t1", tripId: "trip1", location: kyoto },
      { id: "t2", tripId: null, location: null },
    ]);
  });
});

describe("R17: POST /api/todos", () => {
  test("into a trip: 200 with the trip id, appended", async () => {
    tripExists(true);

    const response = await post({ tripId: "trip1", location: kyoto });
    const body = (await response.json()) as {
      todo: { tripId: string | null; priority: number };
      signedUrls: string[];
    };

    expect(response.status).toBe(200);
    expect(body.todo.tripId).toBe("trip1");
    expect(body.signedUrls).toEqual([]);
    expect(writtenTripId(created())).toBe("trip1");
    expect(created().priority).toBe(10);
  });

  test("into Inspiration: no trip, no location", async () => {
    const response = await post({ tripId: null, location: null });
    const body = (await response.json()) as {
      todo: { tripId: string | null; location: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.todo).toMatchObject({ tripId: null, location: null });
    expect(writtenTripId(created())).toBeNull();
    // R3: no fallback to the old placeholder location
    expect(JSON.stringify(created())).not.toContain('"default"');
  });

  test("the title is trimmed", async () => {
    await post({ title: "  Temple  " });

    expect(created().title).toBe("Temple");
  });

  test("an unknown trip: 400 Trip not found.", async () => {
    tripExists(false);

    const response = await post({ tripId: "nope" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Trip not found." });
  });

  test.each([
    ["empty", ""],
    ["whitespace-only", "   "],
  ])("%s title: 400 Title is required", async (_, title) => {
    const response = await post({ title });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Title is required",
    });
    expect(prisma().todo.create).not.toHaveBeenCalled();
  });

  test("a DB failure is a 500", async () => {
    prisma().todo.create.mockRejectedValue(new Error("db down"));

    const response = await post({});

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Failed to create a todo. Please try again later.",
    });
  });
});

describe("POST /api/todos (white-box)", () => {
  test("no session is a 401 and writes nothing", async () => {
    const { validateSessionToken } = await import("@/features/auth/session");
    vi.mocked(validateSessionToken).mockResolvedValueOnce({
      user: null,
      session: null,
    } as never);

    const response = await post({});

    expect(response.status).toBe(401);
    expect(prisma().todo.create).not.toHaveBeenCalled();
  });

  test("the first to-do gets priority 1", async () => {
    prisma().todo.aggregate.mockResolvedValue({
      _max: { priority: null },
    } as never);

    await post({});

    expect(created().priority).toBe(1);
  });

  test("no trip skips the trip lookup", async () => {
    await post({ tripId: null });

    expect(prisma().trip.findUnique).not.toHaveBeenCalled();
    expect(created().trip).toBeUndefined();
  });

  test("an unknown trip creates nothing", async () => {
    tripExists(false);

    await post({ tripId: "nope" });

    expect(prisma().todo.create).not.toHaveBeenCalled();
  });

  test("images get comma-safe keys and one signed URL each", async () => {
    const response = await post({
      images: [
        { name: "0-a.jpg", size: 10, type: "image/jpeg" },
        { name: "1-Paris, France.jpg", size: 20, type: "image/jpeg" },
      ],
    });
    const body = (await response.json()) as { signedUrls: string[] };

    expect(created().imageKeys).toMatch(
      /^0-a\.jpg-\w+,1-Paris_ France\.jpg-\w+$/,
    );
    expect(body.signedUrls).toEqual([
      "https://r2.test/put",
      "https://r2.test/put",
    ]);
  });

  test("no images stores null keys", async () => {
    await post({ images: [] });

    expect(created().imageKeys).toBeNull();
  });

  test("the description is kept", async () => {
    await post({ description: "bring tea" });

    expect(created().description).toBe("bring tea");
  });

  test("a place without a Google id gets its own row", async () => {
    await post({ location: { ...kyoto, placeId: null } });

    expect(created().location).toEqual({
      create: { ...kyoto, placeId: null },
    });
  });

  test("an invalid location is a 400", async () => {
    const response = await post({ location: { ...kyoto, name: "" } });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Location is required",
    });
  });
});

describe("GET /api/todos failure", () => {
  test("a DB failure is a 500", async () => {
    prisma().todo.findMany.mockRejectedValue(new Error("db down"));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Failed to fetch todos. Please try again later.",
    });
  });
});

describe("toTodoDto (white-box)", () => {
  test("signs image and avatar URLs and splits the keys", async () => {
    prisma().todo.findMany.mockResolvedValue([
      todoRow({
        imageKeys: "a.jpg-1,b.jpg-2",
        createdBy: { name: "Teddy", image: "me.jpg" },
        doneAt: new Date("2025-01-10T12:00:00.000Z"),
      }),
    ] as never);

    const body = (await (await GET()).json()) as {
      todos: {
        images: { key: string; url: string }[];
        createdBy: { imageUrl: string | null };
        doneAt: string | null;
      }[];
    };

    expect(body.todos[0].images).toEqual([
      { key: "a.jpg-1", url: "https://signed" },
      { key: "b.jpg-2", url: "https://signed" },
    ]);
    expect(body.todos[0].createdBy.imageUrl).toBe("https://signed");
    expect(body.todos[0].doneAt).toBe("2025-01-10T12:00:00.000Z");
  });
});

const signedPuts = () =>
  vi.mocked(getSignedUrl).mock.calls.map(([, command, options]) => ({
    input: (command as PutObjectCommand).input,
    isPut: command instanceof PutObjectCommand,
    options,
  }));

describe("R15: POST /api/todos validates each image", () => {
  test("over 5 MB (user flow 6): 400 Images must be 5 MB or smaller, nothing written", async () => {
    const response = await post({
      images: [{ name: "0-big.jpg", size: 6_000_000, type: "image/jpeg" }],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Images must be 5 MB or smaller",
    });
    expect(prisma().todo.create).not.toHaveBeenCalled();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  test("one oversized image among good ones still fails the whole request", async () => {
    const response = await post({
      images: [
        { name: "0-a.jpg", size: 10, type: "image/jpeg" },
        { name: "1-b.jpg", size: 5 * 1024 * 1024 + 1, type: "image/jpeg" },
      ],
    });

    expect(response.status).toBe(400);
    expect(prisma().todo.create).not.toHaveBeenCalled();
  });

  test("a HEIC type (user flow 6): 400 Only JPEG, PNG, WebP or GIF", async () => {
    const response = await post({
      images: [{ name: "0-a.heic", size: 1000, type: "image/heic" }],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "Only JPEG, PNG, WebP or GIF images can be uploaded",
    });
    expect(prisma().todo.create).not.toHaveBeenCalled();
  });

  test.each([
    ["no size", { name: "0-a.jpg", type: "image/jpeg" }],
    ["no type", { name: "0-a.jpg", size: 10 }],
    ["an empty name", { name: "", size: 10, type: "image/jpeg" }],
    ["a bare name", "0-a.jpg"],
  ])("an image with %s: 400", async (_, image) => {
    const response = await post({ images: [image] });

    expect(response.status).toBe(400);
    expect(prisma().todo.create).not.toHaveBeenCalled();
  });

  test("the old imageNames body: 400", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/todos", {
        method: "POST",
        body: JSON.stringify({
          title: "Temple",
          location: null,
          tripId: null,
          imageNames: ["0-a.jpg"],
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test("exactly 5 MB is accepted", async () => {
    const response = await post({
      images: [{ name: "0-a.png", size: 5 * 1024 * 1024, type: "image/png" }],
    });

    expect(response.status).toBe(200);
  });
});

describe("R16: POST /api/todos signs size and type", () => {
  test("each PUT URL signs its image's Content-Type and Content-Length for 300 s", async () => {
    await post({
      images: [
        { name: "0-a.jpg", size: 1234, type: "image/jpeg" },
        { name: "1-b.gif", size: 5678, type: "image/gif" },
      ],
    });

    // Request-only detail; Prisma would reject an unknown field
    expect(created()).not.toHaveProperty("images");
    const keys = String(created().imageKeys).split(",");
    expect(signedPuts()).toEqual([
      {
        isPut: true,
        input: {
          Bucket: "images-dev",
          Key: `two-do/${keys[0]}`,
          ContentType: "image/jpeg",
          ContentLength: 1234,
        },
        options: expect.objectContaining({
          expiresIn: 300,
          signableHeaders: new Set(["content-type", "content-length"]),
        }),
      },
      {
        isPut: true,
        input: {
          Bucket: "images-dev",
          Key: `two-do/${keys[1]}`,
          ContentType: "image/gif",
          ContentLength: 5678,
        },
        options: expect.objectContaining({ expiresIn: 300 }),
      },
    ]);
  });

  test("keys keep the name rule: comma-safe, one per image, in order", async () => {
    await post({
      images: [{ name: "0-相片 🐶.jpg", size: 1, type: "image/jpeg" }],
    });

    expect(created().imageKeys).toMatch(/^0-相片 🐶\.jpg-\w+$/);
  });

  test("a presign failure is a 500", async () => {
    vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error("r2 down"));

    const response = await post({
      images: [{ name: "0-a.jpg", size: 10, type: "image/jpeg" }],
    });

    expect(response.status).toBe(500);
  });
});
