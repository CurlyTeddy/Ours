import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/database-client";
import { GET, POST } from "@/app/api/moments/special-days/route";

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_ENVIRONMENT: "dev" } }));
vi.mock("@/lib/database-client", () => ({
  prisma: { specialDay: { findMany: vi.fn(), create: vi.fn() } },
  redis: {},
}));

const url = "http://localhost/api/moments/special-days";
const row = (n: number, name = `Day ${n.toString()}`) => ({
  specialDayId: `sd${n.toString()}`,
  createdAt: new Date(`2026-01-0${n.toString()}T00:00:00.000Z`),
  name,
  month: n,
  day: n,
});
const post = (body: unknown) =>
  POST(
    new NextRequest(url, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const created = () => vi.mocked(prisma.specialDay.create).mock.calls;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(prisma.specialDay.create).mockImplementation(
    ({ data }) =>
      Promise.resolve({
        specialDayId: "new",
        createdAt: new Date("2026-10-17T04:00:00.000Z"),
        ...data,
      }) as never,
  );
});

describe("R1/R2: GET /api/moments/special-days", () => {
  test("answers every day with each field, ordered by createdAt ascending", async () => {
    vi.mocked(prisma.specialDay.findMany).mockResolvedValue([
      row(1, "Halloween"),
      row(2, "生日 🎂"),
    ] as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      specialDays: [
        {
          specialDayId: "sd1",
          name: "Halloween",
          month: 1,
          day: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          specialDayId: "sd2",
          name: "生日 🎂",
          month: 2,
          day: 2,
          createdAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
    const { orderBy } = vi.mocked(prisma.specialDay.findMany).mock
      .calls[0][0] as { orderBy: unknown };
    expect([orderBy].flat()).toEqual([{ createdAt: "asc" }]);
  });

  test("an empty table answers an empty list", async () => {
    vi.mocked(prisma.specialDay.findMany).mockResolvedValue([] as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ specialDays: [] });
  });

  test("a Prisma failure is logged and answers 500", async () => {
    vi.mocked(prisma.specialDay.findMany).mockRejectedValue(new Error("down"));

    const response = await GET();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Failed to fetch special days",
    });
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("R2/R13: POST /api/moments/special-days", () => {
  test("stores the trimmed name and answers the new day", async () => {
    const response = await post({ name: "  Halloween  ", month: 10, day: 31 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      specialDayId: "new",
      name: "Halloween",
      month: 10,
      day: 31,
      createdAt: "2026-10-17T04:00:00.000Z",
    });
    expect(created()).toHaveLength(1);
    expect(created()[0][0].data).toEqual({
      name: "Halloween",
      month: 10,
      day: 31,
    });
  });

  test.each([
    ["1-char name", { name: "a", month: 1, day: 1 }],
    ["50-char name", { name: "a".repeat(50), month: 1, day: 1 }],
    ["CJK and emoji name", { name: "生日 🎂", month: 5, day: 20 }],
    ["Feb 29", { name: "Leap", month: 2, day: 29 }],
    ["Dec 31", { name: "Eve", month: 12, day: 31 }],
    ["Apr 30", { name: "x", month: 4, day: 30 }],
  ])("accepts a %s", async (_, body) => {
    const response = await post(body);

    expect(response.status).toBe(200);
    expect(created()[0][0].data).toEqual(body);
  });

  test("a duplicate name and date is still created", async () => {
    await post({ name: "Dup", month: 3, day: 3 });
    const response = await post({ name: "Dup", month: 3, day: 3 });

    expect(response.status).toBe(200);
    expect(created()).toHaveLength(2);
  });

  test.each([
    ["empty name", { name: "", month: 1, day: 1 }],
    ["whitespace-only name", { name: "   ", month: 1, day: 1 }],
    ["51-char name", { name: "a".repeat(51), month: 1, day: 1 }],
    ["numeric name", { name: 5, month: 1, day: 1 }],
    ["month 0", { name: "x", month: 0, day: 1 }],
    ["month 13", { name: "x", month: 13, day: 1 }],
    ["fractional month", { name: "x", month: 1.5, day: 1 }],
    ["string month", { name: "x", month: "10", day: 1 }],
    ["day 0", { name: "x", month: 1, day: 0 }],
    ["Jan 32", { name: "x", month: 1, day: 32 }],
    ["Feb 30", { name: "x", month: 2, day: 30 }],
    ["Apr 31", { name: "x", month: 4, day: 31 }],
    ["Nov 31", { name: "x", month: 11, day: 31 }],
    ["string day", { name: "x", month: 1, day: "1" }],
    ["missing name", { month: 1, day: 1 }],
    ["missing month", { name: "x", day: 1 }],
    ["missing day", { name: "x", month: 1 }],
    ["null body", null],
    ["array body", []],
  ])("a %s answers 400 and creates nothing", async (_, body) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Invalid special day" });
    expect(created()).toHaveLength(0);
  });

  test.each(["{not json", "", "undefined"])(
    "malformed JSON %j answers 400",
    async (body) => {
      const response = await post(body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ message: "Invalid special day" });
      expect(created()).toHaveLength(0);
    },
  );

  test("unknown fields are stripped, not rejected", async () => {
    const response = await post({
      name: "x",
      month: 1,
      day: 1,
      specialDayId: "hijack",
      createdAt: "2000-01-01",
    });

    expect(response.status).toBe(200);
    expect(created()).toHaveLength(1);
    expect(created()[0][0].data).toEqual({ name: "x", month: 1, day: 1 });
  });

  test("a validation failure does not reach Prisma or log an error", async () => {
    await post({ name: "", month: 1, day: 1 });

    expect(created()).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  test("a Prisma failure is logged and answers 500", async () => {
    vi.mocked(prisma.specialDay.create).mockRejectedValue(new Error("down"));

    const response = await post({ name: "x", month: 1, day: 1 });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Failed to create special day",
    });
    expect(consoleError).toHaveBeenCalled();
  });
});
