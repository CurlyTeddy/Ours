import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockReset, type mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

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

import { GET, POST } from "@/app/api/trips/route";

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

// The max position can be read either way; mock both so the test doesn't pin one.
const maxPosition = (position: number | null) => {
  prisma().trip.aggregate.mockResolvedValue({
    _max: { position },
  } as never);
  prisma().trip.findFirst.mockResolvedValue(
    (position === null ? null : row({ position })) as never,
  );
};

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/trips", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  mockReset(prisma());
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  prisma().$transaction.mockImplementation((async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (txn: PrismaClient) => unknown)(prisma())
      : Promise.all(arg as Promise<unknown>[])) as never);
  prisma().trip.create.mockImplementation((async ({
    data,
  }: {
    data: Record<string, unknown>;
  }) => row({ tripId: "new", ...data })) as never);
});

describe("GET /api/trips", () => {
  test("200 with trips mapped to TripDto, ordered by position", async () => {
    prisma().trip.findMany.mockResolvedValue([
      row(),
      row({
        tripId: "trip2",
        name: "Taipei weekend",
        startDate: null,
        endDate: null,
        position: 2.5,
      }),
    ] as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      trips: [
        {
          id: "trip1",
          name: "Japan",
          startDate: "2025-12-20",
          endDate: "2026-01-05",
          position: 1,
        },
        {
          id: "trip2",
          name: "Taipei weekend",
          startDate: null,
          endDate: null,
          position: 2.5,
        },
      ],
    });
    const { orderBy } = prisma().trip.findMany.mock.calls[0][0] ?? {};
    expect([orderBy, [orderBy].flat()[0]]).toContainEqual({ position: "asc" });
  });

  test("no trips: an empty list", async () => {
    prisma().trip.findMany.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ trips: [] });
  });

  test("a DB failure is a 500", async () => {
    prisma().trip.findMany.mockRejectedValue(new Error("db down"));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Failed to fetch trips. Please try again later.",
    });
  });
});

describe("R14: POST /api/trips", () => {
  test("201 with the new trip appended at max + 1, name trimmed", async () => {
    maxPosition(3);

    const response = await post({
      name: "  Japan  ",
      startDate: "2025-12-20",
      endDate: "2026-01-05",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      trip: {
        id: "new",
        name: "Japan",
        startDate: "2025-12-20",
        endDate: "2026-01-05",
        position: 4,
      },
    });
    expect(prisma().trip.create.mock.calls[0][0].data).toMatchObject({
      name: "Japan",
      startDate: "2025-12-20",
      endDate: "2026-01-05",
      position: 4,
    });
  });

  test("a fractional max still appends at max + 1", async () => {
    maxPosition(2.5);

    const response = await post({
      name: "Osaka",
      startDate: null,
      endDate: null,
    });

    expect(
      ((await response.json()) as { trip: { position: number } }).trip,
    ).toMatchObject({ position: 3.5, startDate: null, endDate: null });
  });

  test("the first trip gets position 1", async () => {
    maxPosition(null);

    const response = await post({
      name: "Japan",
      startDate: null,
      endDate: null,
    });

    expect(response.status).toBe(201);
    expect(prisma().trip.create.mock.calls[0][0].data).toMatchObject({
      position: 1,
    });
  });

  test("CJK and emoji names are kept", async () => {
    maxPosition(null);

    const response = await post({
      name: "東京 🍣",
      startDate: null,
      endDate: null,
    });

    expect(response.status).toBe(201);
    expect(prisma().trip.create.mock.calls[0][0].data).toMatchObject({
      name: "東京 🍣",
    });
  });

  test.each([
    [{ name: "", startDate: null, endDate: null }, "Give the trip a name"],
    [{ name: "   ", startDate: null, endDate: null }, "Give the trip a name"],
    [
      { name: "a".repeat(81), startDate: null, endDate: null },
      "Keep the trip name under 80 characters",
    ],
    [{ name: "Japan", startDate: "2025-02-30", endDate: null }, "Invalid date"],
    [{ name: "Japan", startDate: null, endDate: "tomorrow" }, "Invalid date"],
    [
      { name: "Japan", startDate: "2025-12-20", endDate: "2025-12-19" },
      "The trip can’t end before it starts",
    ],
  ])("400 for %j", async (body, message) => {
    maxPosition(3);

    const response = await post(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message });
    expect(prisma().trip.create).not.toHaveBeenCalled();
  });

  test("80 chars is accepted", async () => {
    maxPosition(null);

    const response = await post({
      name: "a".repeat(80),
      startDate: null,
      endDate: null,
    });

    expect(response.status).toBe(201);
  });

  test.each([
    ["missing name", { startDate: null, endDate: null }],
    ["name as a number", { name: 1, startDate: null, endDate: null }],
  ])("400 for %s", async (_, body) => {
    maxPosition(null);

    const response = await post(body);

    expect(response.status).toBe(400);
    expect(prisma().trip.create).not.toHaveBeenCalled();
  });

  test.each([
    ["truncated JSON", '{"name": '],
    ["not JSON", "hello"],
    ["empty", ""],
  ])("%s: 400 Invalid request body", async (_, raw) => {
    const response = await post(raw);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid request body" });
    expect(prisma().trip.create).not.toHaveBeenCalled();
  });

  test("a DB failure is a 500", async () => {
    maxPosition(1);
    prisma().trip.create.mockRejectedValue(new Error("db down"));

    const response = await post({
      name: "Japan",
      startDate: null,
      endDate: null,
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Failed to create a trip. Please try again later.",
    });
  });
});
