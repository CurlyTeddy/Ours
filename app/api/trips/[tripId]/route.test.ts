import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockReset, type mockDeep } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";

const db = vi.hoisted(() => ({ prisma: undefined as unknown }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_ENVIRONMENT: "dev" } }));
vi.mock("@/lib/database-client", async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  db.prisma = mockDeep<PrismaClient>();
  return { prisma: db.prisma, redis: mockDeep() };
});
vi.mock("@/lib/s3-client", () => ({
  default: {},
  getCachedSignedUrl: vi.fn(async () => "https://signed"),
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

import { DELETE, PATCH } from "@/app/api/trips/[tripId]/route";

const prisma = () => db.prisma as ReturnType<typeof mockDeep<PrismaClient>>;

const row = (patch: Record<string, unknown> = {}) => ({
  tripId: "trip1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  name: "Japan",
  startDate: "2025-12-20",
  endDate: "2026-01-05",
  position: 1,
  ...patch,
});
const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("known", {
    code,
    clientVersion: "test",
  });
const params = (tripId = "trip1") => ({
  params: Promise.resolve({ tripId }),
});
const patch = (body: unknown, tripId = "trip1") =>
  PATCH(
    new NextRequest(`http://localhost/api/trips/${tripId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    params(tripId),
  );
const patchRaw = (raw: string) =>
  PATCH(
    new NextRequest("http://localhost/api/trips/trip1", {
      method: "PATCH",
      body: raw,
    }),
    params(),
  );
const del = (tripId = "trip1") =>
  DELETE(
    new NextRequest(`http://localhost/api/trips/${tripId}`, {
      method: "DELETE",
    }),
    params(tripId),
  );
// A missing trip can surface as a null lookup or as P2025 from the write; cover both.
const missing = () => {
  prisma().trip.findUnique.mockResolvedValue(null);
  prisma().trip.findUniqueOrThrow.mockRejectedValue(known("P2025"));
  prisma().trip.update.mockRejectedValue(known("P2025"));
  prisma().trip.delete.mockRejectedValue(known("P2025"));
};

beforeEach(() => {
  mockReset(prisma());
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  prisma().$transaction.mockImplementation((async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (txn: PrismaClient) => unknown)(prisma())
      : Promise.all(arg as Promise<unknown>[])) as never);
  prisma().trip.findUnique.mockResolvedValue(row() as never);
  prisma().trip.findUniqueOrThrow.mockResolvedValue(row() as never);
  prisma().trip.update.mockImplementation((async ({
    data,
  }: {
    data: Record<string, unknown>;
  }) => row(data)) as never);
  prisma().trip.delete.mockResolvedValue(row() as never);
});

describe("R15: PATCH /api/trips/[tripId]", () => {
  test("renames: 200 with the trip, name trimmed", async () => {
    const response = await patch({ name: "  Kansai  " });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      trip: {
        id: "trip1",
        name: "Kansai",
        startDate: "2025-12-20",
        endDate: "2026-01-05",
        position: 1,
      },
    });
    const call = prisma().trip.update.mock.calls[0][0];
    expect(call.where).toEqual({ tripId: "trip1" });
    expect(call.data).toMatchObject({ name: "Kansai" });
  });

  test("R12: moves to a new position", async () => {
    const response = await patch({ position: 2.5 });

    expect(response.status).toBe(200);
    expect(prisma().trip.update.mock.calls[0][0].data).toMatchObject({
      position: 2.5,
    });
    expect(
      ((await response.json()) as { trip: { position: number } }).trip.position,
    ).toBe(2.5);
  });

  test("clears both dates", async () => {
    const response = await patch({ startDate: null, endDate: null });

    expect(response.status).toBe(200);
    expect(prisma().trip.update.mock.calls[0][0].data).toMatchObject({
      startDate: null,
      endDate: null,
    });
  });

  test("an end before the stored start is refused (merged check)", async () => {
    prisma().trip.findUnique.mockResolvedValue(
      row({ startDate: "2025-12-20", endDate: null }) as never,
    );
    prisma().trip.findUniqueOrThrow.mockResolvedValue(
      row({ startDate: "2025-12-20", endDate: null }) as never,
    );

    const response = await patch({ endDate: "2025-12-01" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "The trip can’t end before it starts",
    });
    expect(prisma().trip.update).not.toHaveBeenCalled();
  });

  test("a start after the stored end is refused (merged check)", async () => {
    const response = await patch({ startDate: "2026-02-01" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "The trip can’t end before it starts",
    });
  });

  test("a start after the stored end is fine when the end is cleared too", async () => {
    const response = await patch({ startDate: "2026-02-01", endDate: null });

    expect(response.status).toBe(200);
  });

  test("an empty body: 400 Nothing to change", async () => {
    const response = await patch({});

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Nothing to change",
    });
    expect(prisma().trip.update).not.toHaveBeenCalled();
  });

  test.each([
    [{ name: " " }, "Give the trip a name"],
    [{ name: "a".repeat(81) }, "Keep the trip name under 80 characters"],
    [{ startDate: "2025-13-01" }, "Invalid date"],
  ])("400 for %j", async (body, message) => {
    const response = await patch(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message });
    expect(prisma().trip.update).not.toHaveBeenCalled();
  });

  test.each([
    ["truncated JSON", '{"name": '],
    ["not JSON", "hello"],
    ["empty", ""],
  ])("%s: 400 Invalid request body", async (_, raw) => {
    const response = await patchRaw(raw);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid request body" });
    expect(prisma().trip.update).not.toHaveBeenCalled();
  });

  test("a string position is a 400", async () => {
    const response = await patch({ position: "2" });

    expect(response.status).toBe(400);
  });

  test("an unknown trip is a 404", async () => {
    missing();

    const response = await patch({ name: "Kansai" }, "nope");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "Trip not found." });
  });

  test("a taken position is a 409", async () => {
    prisma().trip.update.mockRejectedValue(known("P2002"));

    const response = await patch({ position: 2 });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: "That spot was just taken. Refresh and try again.",
    });
  });

  test("a DB failure is a 500", async () => {
    prisma().trip.update.mockRejectedValue(new Error("db down"));

    const response = await patch({ name: "Kansai" });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Failed to update the trip. Please try again later.",
    });
  });
});

describe("R19: DELETE /api/trips/[tripId]", () => {
  test("204 and deletes that trip", async () => {
    const response = await del();

    expect(response.status).toBe(204);
    expect(prisma().trip.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tripId: "trip1" } }),
    );
  });

  test("leaves the to-dos to the FK (no to-do deletes)", async () => {
    await del();

    expect(prisma().todo.delete).not.toHaveBeenCalled();
    expect(prisma().todo.deleteMany).not.toHaveBeenCalled();
  });

  test("an unknown trip is a 404", async () => {
    missing();

    const response = await del("nope");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "Trip not found." });
  });

  test("a DB failure is a 500", async () => {
    prisma().trip.delete.mockRejectedValue(new Error("db down"));

    const response = await del();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Failed to delete the trip. Please try again later.",
    });
  });
});

describe("trip routes (white-box)", () => {
  test("DELETE detaches the trip's to-dos before deleting it", async () => {
    await del();

    expect(prisma().todo.updateMany).toHaveBeenCalledWith({
      where: { tripId: "trip1" },
      data: { tripId: null },
    });
    expect(prisma().todo.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma().trip.delete.mock.invocationCallOrder[0],
    );
  });

  test("PATCH: an unknown trip writes nothing", async () => {
    prisma().trip.findUnique.mockResolvedValue(null);

    await patch({ name: "Kansai" });

    expect(prisma().trip.update).not.toHaveBeenCalled();
  });

  test("PATCH: an end after the stored start passes, and only it is written", async () => {
    const response = await patch({ endDate: "2026-02-01" });

    expect(response.status).toBe(200);
    expect(prisma().trip.update.mock.calls[0][0].data).toEqual({
      endDate: "2026-02-01",
    });
  });

  test("PATCH: a stored trip with no dates takes any one end", async () => {
    prisma().trip.findUnique.mockResolvedValue(
      row({ startDate: null, endDate: null }) as never,
    );

    expect((await patch({ endDate: "2020-01-01" })).status).toBe(200);
  });
});
