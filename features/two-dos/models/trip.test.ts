import { describe, expect, test } from "vitest";
import {
  tripPatchSchema,
  tripSaveSchema,
} from "@/features/two-dos/models/trip";

const firstIssue = (result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => result.error?.issues[0]?.message;

const save = (patch: Record<string, unknown>) =>
  tripSaveSchema.safeParse({
    name: "Japan",
    startDate: null,
    endDate: null,
    ...patch,
  });

describe("Trip name (tripSaveSchema)", () => {
  test("is trimmed", () => {
    const result = save({ name: "  Kyoto in spring  " });
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("Kyoto in spring");
  });

  test.each([
    ["empty", ""],
    ["whitespace-only", "   \t "],
  ])("%s: Give the trip a name", (_, name) => {
    const result = save({ name });
    expect(result.success).toBe(false);
    expect(firstIssue(result)).toBe("Give the trip a name");
  });

  test("1 char is fine", () => {
    expect(save({ name: "J" }).success).toBe(true);
  });

  test("80 chars is fine, 81 is not", () => {
    expect(save({ name: "a".repeat(80) }).success).toBe(true);
    const result = save({ name: "a".repeat(81) });
    expect(result.success).toBe(false);
    expect(firstIssue(result)).toBe("Keep the trip name under 80 characters");
  });

  test("80 chars after trimming is fine", () => {
    expect(save({ name: `  ${"a".repeat(80)}  ` }).success).toBe(true);
  });

  test("CJK and emoji names are fine", () => {
    expect(save({ name: "東京 🍣 旅行" }).success).toBe(true);
  });

  test.each([
    ["missing", undefined],
    ["a number", 42],
    ["null", null],
  ])("%s name fails", (_, name) => {
    expect(
      tripSaveSchema.safeParse({ name, startDate: null, endDate: null })
        .success,
    ).toBe(false);
  });
});

describe("Trip dates (tripSaveSchema)", () => {
  test("both null is fine", () => {
    const result = save({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: "Japan",
      startDate: null,
      endDate: null,
    });
  });

  test("both set keeps them as yyyy-MM-dd strings", () => {
    const result = save({ startDate: "2025-12-20", endDate: "2026-01-05" });
    expect(result.data).toEqual({
      name: "Japan",
      startDate: "2025-12-20",
      endDate: "2026-01-05",
    });
  });

  test("only one end set is fine", () => {
    expect(save({ startDate: "2025-12-20" }).success).toBe(true);
    expect(save({ endDate: "2025-12-20" }).success).toBe(true);
  });

  test("end on the start day is fine", () => {
    expect(
      save({ startDate: "2025-12-20", endDate: "2025-12-20" }).success,
    ).toBe(true);
  });

  test("end before start fails", () => {
    const result = save({ startDate: "2025-12-20", endDate: "2025-12-19" });
    expect(result.success).toBe(false);
    expect(firstIssue(result)).toBe("The trip can’t end before it starts");
  });

  test.each([
    ["Feb 30", "2025-02-30"],
    ["month 13", "2025-13-01"],
    ["slashes", "2025/01/01"],
    ["an ISO instant", "2025-01-01T00:00:00.000Z"],
    ["no padding", "2025-1-1"],
    ["empty", ""],
    ["text", "soon"],
  ])("%s is an Invalid date", (_, date) => {
    for (const key of ["startDate", "endDate"]) {
      const result = save({ [key]: date });
      expect(result.success).toBe(false);
      expect(firstIssue(result)).toBe("Invalid date");
    }
  });

  test("a leap day is valid", () => {
    expect(save({ startDate: "2028-02-29" }).success).toBe(true);
  });
});

describe("tripPatchSchema", () => {
  test("every field is optional", () => {
    expect(tripPatchSchema.safeParse({ name: "Osaka" }).success).toBe(true);
    expect(tripPatchSchema.safeParse({ startDate: "2025-01-01" }).success).toBe(
      true,
    );
    expect(tripPatchSchema.safeParse({ endDate: null }).success).toBe(true);
  });

  test("position is a number", () => {
    const result = tripPatchSchema.safeParse({ position: 2.5 });
    expect(result.success).toBe(true);
    expect(result.data?.position).toBe(2.5);
    expect(tripPatchSchema.safeParse({ position: -4 }).success).toBe(true);
  });

  test.each([
    ["Infinity", Infinity],
    ["NaN", NaN],
  ])("%s position: Invalid position", (_, position) => {
    const result = tripPatchSchema.safeParse({ position });
    expect(result.success).toBe(false);
    expect(firstIssue(result)).toBe("Invalid position");
  });

  test("a string position fails", () => {
    expect(tripPatchSchema.safeParse({ position: "1" }).success).toBe(false);
  });

  test("keeps the name rules", () => {
    expect(firstIssue(tripPatchSchema.safeParse({ name: "  " }))).toBe(
      "Give the trip a name",
    );
    expect(
      firstIssue(tripPatchSchema.safeParse({ name: "a".repeat(81) })),
    ).toBe("Keep the trip name under 80 characters");
    expect(tripPatchSchema.safeParse({ name: " Osaka " }).data?.name).toBe(
      "Osaka",
    );
  });

  test("keeps the date rule", () => {
    expect(
      firstIssue(tripPatchSchema.safeParse({ startDate: "2025-02-30" })),
    ).toBe("Invalid date");
  });
});
