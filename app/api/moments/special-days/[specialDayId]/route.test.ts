import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database-client";
import { DELETE } from "@/app/api/moments/special-days/[specialDayId]/route";

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_ENVIRONMENT: "dev" } }));
vi.mock("@/lib/database-client", () => ({
  prisma: { specialDay: { delete: vi.fn() } },
  redis: {},
}));

const remove = (specialDayId: string) =>
  DELETE(
    new NextRequest(
      `http://localhost/api/moments/special-days/${specialDayId}`,
      {
        method: "DELETE",
      },
    ),
    { params: Promise.resolve({ specialDayId }) },
  );
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(prisma.specialDay.delete).mockResolvedValue({
    specialDayId: "sd1",
    createdAt: new Date(),
    name: "Halloween",
    month: 10,
    day: 31,
  } as never);
});

describe("R11: DELETE /api/moments/special-days/[specialDayId]", () => {
  test("deletes that day and answers success", async () => {
    const response = await remove("sd1");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(vi.mocked(prisma.specialDay.delete)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.specialDay.delete).mock.calls[0][0]).toMatchObject({
      where: { specialDayId: "sd1" },
    });
  });

  test("a missing day (P2025) answers 404", async () => {
    vi.mocked(prisma.specialDay.delete).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record not found", {
        code: "P2025",
        clientVersion: "test",
      }),
    );

    const response = await remove("gone");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      message: "Special day not found.",
    });
  });

  test("another known Prisma error answers 500", async () => {
    vi.mocked(prisma.specialDay.delete).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("FK", {
        code: "P2003",
        clientVersion: "test",
      }),
    );

    const response = await remove("sd1");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Failed to delete special day",
    });
  });

  test("an unknown failure is logged and answers 500", async () => {
    vi.mocked(prisma.specialDay.delete).mockRejectedValue(new Error("down"));

    const response = await remove("sd1");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "Failed to delete special day",
    });
    expect(consoleError).toHaveBeenCalled();
  });
});
