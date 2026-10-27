import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockReset, type mockDeep } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";
import { deleteObjects } from "@/lib/s3-client";

const db = vi.hoisted(() => ({ prisma: undefined as unknown }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_ENVIRONMENT: "dev" } }));
vi.mock("@/lib/database-client", async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  db.prisma = mockDeep<PrismaClient>();
  return { prisma: db.prisma, redis: mockDeep() };
});
vi.mock("@/lib/s3-client", () => ({
  default: { send: vi.fn() },
  bucket: "images-test",
  deleteObjects: vi.fn(),
  getCachedSignedUrl: () => Promise.resolve("https://r2.test/get"),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: () => Promise.resolve("https://r2.test/put"),
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

import { DELETE, GET, PATCH, PUT } from "@/app/api/todos/[id]/route";

const prisma = () => db.prisma as ReturnType<typeof mockDeep<PrismaClient>>;

const kyoto = {
  name: "Kyoto",
  address: "Kyoto, Japan",
  placeId: "place-kyoto",
  latitude: 35.01,
  longitude: 135.77,
};
const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
const todoRow = (patch: Record<string, unknown> = {}) => ({
  todoId: "t1",
  title: "Trip",
  description: null,
  location: kyoto,
  locationId: "loc-kyoto",
  tripId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  doneAt: null,
  priority: 3,
  imageKeys: "a.jpg-1,b.jpg-2",
  createdById: "u1",
  createdBy: { name: "Teddy", image: null },
  ...patch,
});
const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("known", {
    code,
    clientVersion: "test",
  });
const params = { params: Promise.resolve({ id: "t1" }) };
const request = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/todos/t1", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const put = (body: Record<string, unknown> = {}) =>
  PUT(
    request("PUT", {
      title: "Trip",
      description: null,
      location: kyoto,
      tripId: null,
      imageNames: ["a.jpg-1", "b.jpg-2"],
      ...body,
    }),
    params,
  );
const patch = (body: unknown) => PATCH(request("PATCH", body), params);
const patchRaw = (raw: string) =>
  PATCH(
    new NextRequest("http://localhost/api/todos/t1", {
      method: "PATCH",
      body: raw,
    }),
    params,
  );
const del = () => DELETE(request("DELETE"), params);

const updated = () =>
  prisma().todo.update.mock.calls[0][0].data as Record<string, unknown>;
const writtenTripId = (data: Record<string, unknown>) => {
  if ("tripId" in data) return data.tripId;
  const trip = data.trip as
    | { connect?: { tripId: string }; disconnect?: boolean }
    | undefined;
  if (trip?.connect) return trip.connect.tripId;
  if (trip?.disconnect) return null;
  return undefined;
};
const writtenDoneAt = (data: Record<string, unknown>) => {
  const value = data.doneAt as Date | string | null | undefined;
  return value === undefined || value === null ? value : new Date(value);
};
const deletedKeys = () =>
  vi.mocked(deleteObjects).mock.calls.flatMap(([keys]) => keys);
const locationCleanups = () =>
  prisma().location.deleteMany.mock.calls.map(
    ([args]) => (args?.where ?? {}) as Record<string, unknown>,
  );
const existing = (patch: Record<string, unknown> = {}) => {
  prisma().todo.findUnique.mockResolvedValue(todoRow(patch) as never);
  prisma().todo.findUniqueOrThrow.mockResolvedValue(todoRow(patch) as never);
};
const tripExists = (exists: boolean) => {
  prisma().trip.findUnique.mockResolvedValue(
    (exists ? { tripId: "trip2" } : null) as never,
  );
  prisma().trip.count.mockResolvedValue(exists ? 1 : 0);
  if (!exists) prisma().todo.update.mockRejectedValue(known("P2003"));
};
const todoMissing = () => {
  prisma().todo.findUnique.mockResolvedValue(null);
  prisma().todo.findUniqueOrThrow.mockRejectedValue(known("P2025"));
  prisma().todo.update.mockRejectedValue(known("P2025"));
  prisma().todo.delete.mockRejectedValue(known("P2025"));
};

beforeEach(() => {
  mockReset(prisma());
  vi.mocked(deleteObjects).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  prisma().$transaction.mockImplementation((async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (txn: PrismaClient) => unknown)(prisma())
      : Promise.all(arg as Promise<unknown>[])) as never);
  existing();
  tripExists(true);
  prisma().todo.aggregate.mockResolvedValue({
    _max: { priority: 9 },
  } as never);
  prisma().todo.findFirst.mockResolvedValue(todoRow({ priority: 9 }) as never);
  prisma().location.deleteMany.mockResolvedValue({ count: 0 });
  prisma().todo.update.mockImplementation((async ({
    data,
  }: {
    data: Record<string, unknown>;
  }) => {
    const tripId = writtenTripId(data);
    return todoRow({
      imageKeys: data.imageKeys ?? "a.jpg-1,b.jpg-2",
      tripId: tripId === undefined ? null : tripId,
      priority: typeof data.priority === "number" ? data.priority : 3,
      doneAt: writtenDoneAt(data) ?? null,
      ...(data.location === null ||
      (data.location as { disconnect?: boolean } | undefined)?.disconnect
        ? { location: null, locationId: null }
        : {}),
    });
  }) as never);
  prisma().todo.delete.mockResolvedValue(todoRow() as never);
});

describe("PUT /api/todos/[id] images", () => {
  test("keeps listed keys, deletes dropped ones, signs uploads for new names", async () => {
    const response = await put({ imageNames: ["a.jpg-1", "0-new.jpg"] });
    const body = (await response.json()) as {
      imagesToUpload: { name: string }[];
    };

    expect(response.status).toBe(200);
    expect(updated().imageKeys).toMatch(/^a\.jpg-1,0-new\.jpg-\w+$/);
    expect(deletedKeys()).toEqual(["two-do/b.jpg-2"]);
    expect(body.imagesToUpload.map((image) => image.name)).toEqual([
      "0-new.jpg",
    ]);
  });

  test("a comma in a new file name stays inside one key", async () => {
    await put({ imageNames: ["a.jpg-1", "0-Paris, France.jpg"] });

    expect(updated().imageKeys).toMatch(/^a\.jpg-1,0-Paris_ France\.jpg-\w+$/);
  });

  test("an empty list clears the keys and deletes every object", async () => {
    await put({ imageNames: [] });

    expect(updated().imageKeys).toBeNull();
    expect(deletedKeys()).toEqual(["two-do/a.jpg-1", "two-do/b.jpg-2"]);
  });

  test("a failed DB update deletes nothing", async () => {
    prisma().todo.update.mockRejectedValue(new Error("db down"));

    const response = await put();

    expect(response.status).toBe(500);
    expect(deleteObjects).not.toHaveBeenCalled();
  });
});

describe("R17: PUT /api/todos/[id] trip and fields", () => {
  test("no longer touches doneAt, even when sent", async () => {
    existing({ doneAt: yesterday });

    const response = await put({ doneAt: null });

    expect(response.status).toBe(200);
    expect("doneAt" in updated()).toBe(false);
  });

  test("the title is trimmed", async () => {
    await put({ title: "  Temple  " });

    expect(updated().title).toBe("Temple");
  });

  test("a changed trip appends: priority = max + 1", async () => {
    existing({ tripId: "trip1", priority: 3 });

    const response = await put({ tripId: "trip2" });

    expect(response.status).toBe(200);
    expect(writtenTripId(updated())).toBe("trip2");
    expect(updated().priority).toBe(10);
  });

  test("moving to no trip appends too", async () => {
    existing({ tripId: "trip1", priority: 3 });

    await put({ tripId: null });

    expect(writtenTripId(updated())).toBeNull();
    expect(updated().priority).toBe(10);
  });

  test("the same trip keeps its priority", async () => {
    existing({ tripId: "trip2", priority: 3 });

    await put({ tripId: "trip2" });

    // An undefined priority is a no-op in Prisma
    expect(updated().priority ?? 3).toBe(3);
  });

  test("an unknown trip: 400 Trip not found.", async () => {
    tripExists(false);

    const response = await put({ tripId: "nope" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Trip not found." });
  });

  test.each([
    ["empty", ""],
    ["whitespace-only", "  "],
  ])("%s title: 400 Title is required", async (_, title) => {
    const response = await put({ title });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Title is required",
    });
    expect(prisma().todo.update).not.toHaveBeenCalled();
  });

  test("an unknown to-do is a 404", async () => {
    todoMissing();

    const response = await put();

    expect(response.status).toBe(404);
  });
});

describe("R3/R4: PUT location cleanup", () => {
  test("a cleared location: no fallback to 'default', the old row cleaned only if no to-do and no note use it", async () => {
    existing({ locationId: "loc-old" });

    const response = await put({ location: null });

    expect(response.status).toBe(200);
    expect(JSON.stringify(updated())).not.toContain('"default"');
    expect(locationCleanups()).toContainEqual(
      expect.objectContaining({
        locationId: "loc-old",
        todos: { none: {} },
        momentNotes: { none: {} },
      }),
    );
  });

  test("a changed location cleans the old row with the same guard", async () => {
    existing({ locationId: "loc-old" });

    await put({ location: kyoto });

    expect(locationCleanups()).toContainEqual(
      expect.objectContaining({
        locationId: "loc-old",
        todos: { none: {} },
        momentNotes: { none: {} },
      }),
    );
  });

  test("every cleanup is guarded by notes", async () => {
    existing({ locationId: "loc-old" });

    await put({ location: null });

    for (const where of locationCleanups()) {
      expect(where).toMatchObject({ momentNotes: { none: {} } });
    }
  });

  test("an unchanged location deletes nothing", async () => {
    await put({ location: kyoto });

    expect(
      locationCleanups().filter((where) => where.locationId === "loc-kyoto"),
    ).toEqual([]);
  });
});

describe("R4: DELETE /api/todos/[id]", () => {
  test("204; the location is cleaned only if no to-do and no note use it", async () => {
    const response = await del();

    expect(response.status).toBe(204);
    expect(locationCleanups()).toContainEqual(
      expect.objectContaining({
        locationId: "loc-kyoto",
        todos: { none: {} },
        momentNotes: { none: {} },
      }),
    );
    expect(deletedKeys()).toEqual(["two-do/a.jpg-1", "two-do/b.jpg-2"]);
  });

  test("a to-do with no location deletes no location", async () => {
    prisma().todo.delete.mockResolvedValue(
      todoRow({ location: null, locationId: null, imageKeys: null }) as never,
    );

    const response = await del();

    expect(response.status).toBe(204);
    for (const where of locationCleanups()) {
      expect(where.locationId).toBeTruthy();
    }
  });
});

describe("R10/R11/R12/R13: PATCH /api/todos/[id] placement", () => {
  test("done: true sets doneAt to now: 200 with the todo", async () => {
    const before = Date.now();

    const response = await patch({ done: true });
    const body = (await response.json()) as {
      todo: { id: string; doneAt: string | null; tripId: string | null };
    };

    expect(response.status).toBe(200);
    const doneAt = writtenDoneAt(updated()) as Date;
    expect(doneAt).toBeInstanceOf(Date);
    expect(doneAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(doneAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(body.todo.id).toBe("t1");
    expect(body.todo.doneAt).not.toBeNull();
  });

  test("done: true on a done to-do keeps its doneAt", async () => {
    existing({ doneAt: yesterday });

    const response = await patch({ done: true });

    expect(response.status).toBe(200);
    const calls = prisma().todo.update.mock.calls;
    if (calls.length > 0) {
      const doneAt = writtenDoneAt(calls[0][0].data as Record<string, unknown>);
      expect(
        doneAt === undefined || doneAt?.getTime() === yesterday.getTime(),
      ).toBe(true);
    }
  });

  test("done: false sets doneAt to null", async () => {
    existing({ doneAt: yesterday });

    await patch({ done: false });

    expect(updated().doneAt).toBeNull();
  });

  test("a trip change without priority appends at the global max + 1", async () => {
    const response = await patch({ tripId: "trip2" });
    const body = (await response.json()) as {
      todo: { tripId: string | null; priority: number };
    };

    expect(response.status).toBe(200);
    expect(writtenTripId(updated())).toBe("trip2");
    expect(updated().priority).toBe(10);
    expect(body.todo).toMatchObject({ tripId: "trip2", priority: 10 });
  });

  test("an empty table appends at 1", async () => {
    prisma().todo.aggregate.mockResolvedValue({
      _max: { priority: null },
    } as never);
    prisma().todo.findFirst.mockResolvedValue(null);

    await patch({ tripId: "trip2" });

    expect(updated().priority).toBe(1);
  });

  test("tripId: null moves to no trip and appends", async () => {
    existing({ tripId: "trip1" });

    await patch({ tripId: null });

    expect(writtenTripId(updated())).toBeNull();
    expect(updated().priority).toBe(10);
  });

  test("an explicit priority is used as given", async () => {
    await patch({ tripId: "trip2", priority: 2.5 });

    expect(writtenTripId(updated())).toBe("trip2");
    expect(updated().priority).toBe(2.5);
  });

  test("priority alone reorders without a trip change", async () => {
    existing({ tripId: "trip1" });

    await patch({ priority: 4.5 });

    expect(updated().priority).toBe(4.5);
    expect(writtenTripId(updated())).not.toBe(null);
  });

  test("all three at once (undo)", async () => {
    existing({ tripId: "trip2", doneAt: yesterday, priority: 10 });

    await patch({ tripId: null, done: false, priority: 1 });

    expect(updated()).toMatchObject({ doneAt: null, priority: 1 });
    expect(writtenTripId(updated())).toBeNull();
  });

  test.each([
    ["truncated JSON", '{"name": '],
    ["not JSON", "hello"],
    ["empty", ""],
  ])("%s: 400 Invalid request body", async (_, raw) => {
    const response = await patchRaw(raw);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid request body" });
    expect(prisma().todo.update).not.toHaveBeenCalled();
  });

  test("an empty body: 400 Nothing to change", async () => {
    const response = await patch({});

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Nothing to change",
    });
    expect(prisma().todo.update).not.toHaveBeenCalled();
  });

  test.each([[{ priority: "1" }], [{ done: "yes" }], [{ tripId: 5 }]])(
    "400 for %j",
    async (body) => {
      const response = await patch(body);

      expect(response.status).toBe(400);
      expect(prisma().todo.update).not.toHaveBeenCalled();
    },
  );

  test("an unknown trip: 400 Trip not found.", async () => {
    tripExists(false);

    const response = await patch({ tripId: "nope" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Trip not found." });
  });

  test("an unknown to-do: 404 Todo not found.", async () => {
    todoMissing();

    const response = await patch({ done: true });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "Todo not found." });
  });

  test("a taken priority: 409", async () => {
    prisma().todo.update.mockRejectedValue(known("P2002"));

    const response = await patch({ priority: 2 });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: "That spot was just taken. Refresh and try again.",
    });
  });

  test("a DB failure: 500", async () => {
    prisma().todo.update.mockRejectedValue(new Error("db down"));

    const response = await patch({ done: true });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Failed to update todo. Please try again later.",
    });
  });
});

describe("PATCH /api/todos/[id] (white-box)", () => {
  test("done: true on a future-dated plan moves doneAt to now", async () => {
    existing({ doneAt: new Date(Date.now() + 24 * 3600 * 1000) });
    const before = Date.now();

    await patch({ done: true });

    const doneAt = writtenDoneAt(updated()) as Date;
    expect(doneAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(doneAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  test("done omitted leaves doneAt alone", async () => {
    existing({ doneAt: yesterday });

    await patch({ priority: 2 });

    expect(updated().doneAt).toBeUndefined();
  });

  test("the same tripId without priority keeps the priority", async () => {
    existing({ tripId: "trip2" });

    await patch({ tripId: "trip2" });

    expect(updated().priority).toBeUndefined();
    expect(prisma().todo.aggregate).not.toHaveBeenCalled();
  });

  test("tripId: null skips the trip lookup", async () => {
    existing({ tripId: "trip1" });

    await patch({ tripId: null });

    expect(prisma().trip.findUnique).not.toHaveBeenCalled();
  });

  test("an unknown trip writes nothing", async () => {
    tripExists(false);

    await patch({ tripId: "nope" });

    expect(prisma().todo.update).not.toHaveBeenCalled();
  });

  test("an unknown to-do writes nothing and skips the trip lookup", async () => {
    prisma().todo.findUnique.mockResolvedValue(null);

    const response = await patch({ tripId: "trip2" });

    expect(response.status).toBe(404);
    expect(prisma().trip.findUnique).not.toHaveBeenCalled();
    expect(prisma().todo.update).not.toHaveBeenCalled();
  });
});

describe("PUT /api/todos/[id] (white-box)", () => {
  test("a validation error lists every issue", async () => {
    const response = await put({ title: "", imageNames: [""] });
    const body = (await response.json()) as {
      message: string;
      errors: unknown[];
    };

    expect(response.status).toBe(400);
    expect(body.message).toBe("Title is required");
    expect(body.errors).toHaveLength(2);
  });

  test("a place without a Google id gets its own row", async () => {
    await put({ location: { ...kyoto, placeId: null } });

    expect(updated().location).toEqual({
      create: { ...kyoto, placeId: null },
    });
  });

  test("a place with a Google id is shared by placeId", async () => {
    await put({ location: kyoto });

    expect(updated().location).toEqual({
      connectOrCreate: { where: { placeId: "place-kyoto" }, create: kyoto },
    });
  });

  test("no trip skips the trip lookup and disconnects", async () => {
    await put({ tripId: null });

    expect(prisma().trip.findUnique).not.toHaveBeenCalled();
    expect(updated().trip).toEqual({ disconnect: true });
  });

  test("an unknown trip writes nothing", async () => {
    tripExists(false);

    await put({ tripId: "nope" });

    expect(prisma().todo.update).not.toHaveBeenCalled();
    expect(deleteObjects).not.toHaveBeenCalled();
  });

  test("an old row with no location needs no cleanup", async () => {
    existing({ locationId: null, location: null });

    await put({ location: kyoto });

    expect(prisma().location.deleteMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/todos/[id]", () => {
  test("200 with the DTO", async () => {
    prisma().todo.findUnique.mockResolvedValue(
      todoRow({ tripId: "trip1" }) as never,
    );

    const response = await GET(request("GET"), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "t1",
      tripId: "trip1",
      location: kyoto,
    });
  });

  test("404 when missing, 500 when the DB fails", async () => {
    prisma().todo.findUnique.mockResolvedValue(null);
    expect((await GET(request("GET"), params)).status).toBe(404);

    prisma().todo.findUnique.mockRejectedValue(new Error("db down"));
    const response = await GET(request("GET"), params);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Failed to fetch todo. Please try again later.",
    });
  });
});

describe("DELETE /api/todos/[id] (white-box)", () => {
  test("no images deletes no objects", async () => {
    prisma().todo.delete.mockResolvedValue(
      todoRow({ imageKeys: null }) as never,
    );

    await del();

    expect(deleteObjects).not.toHaveBeenCalled();
  });

  test("a missing to-do is a 404, other failures a 500", async () => {
    prisma().todo.delete.mockRejectedValue(known("P2025"));
    expect((await del()).status).toBe(404);

    prisma().todo.delete.mockRejectedValue(new Error("db down"));
    const response = await del();
    expect(response.status).toBe(500);
    expect(deleteObjects).not.toHaveBeenCalled();
  });
});
