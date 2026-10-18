import { describe, expect, test } from "vitest";
import {
  specialDayCreateSchema,
  specialDayFormSchema,
} from "@/features/moments/models/requests";

const valid = { name: "Halloween", month: 10, day: 31 };

describe("specialDayCreateSchema (server)", () => {
  test("accepts a valid day and trims the name", () => {
    expect(
      specialDayCreateSchema.parse({ ...valid, name: "  Halloween  " }),
    ).toEqual(valid);
  });

  test.each([
    ["1 char", "a"],
    ["50 chars", "a".repeat(50)],
    ["50 chars plus padding", `  ${"a".repeat(50)}  `],
    ["CJK and emoji", "生日 🎂"],
  ])("accepts a name of %s", (_, name) => {
    expect(specialDayCreateSchema.safeParse({ ...valid, name }).success).toBe(
      true,
    );
  });

  test.each([
    ["empty", ""],
    ["whitespace-only", "   "],
    ["51 chars", "a".repeat(51)],
    ["a number", 5],
    ["null", null],
  ])("rejects a name that is %s", (_, name) => {
    expect(specialDayCreateSchema.safeParse({ ...valid, name }).success).toBe(
      false,
    );
  });

  test.each([1, 12])("accepts month %i", (month) => {
    expect(
      specialDayCreateSchema.safeParse({ ...valid, month, day: 1 }).success,
    ).toBe(true);
  });

  test.each([0, 13, -1, 1.5, "10", null])("rejects month %j", (month) => {
    expect(
      specialDayCreateSchema.safeParse({ ...valid, month, day: 1 }).success,
    ).toBe(false);
  });

  test.each([
    [1, 31],
    [2, 29],
    [4, 30],
    [6, 30],
    [9, 30],
    [11, 30],
    [12, 31],
    [3, 1],
  ])("accepts %i/%i", (month, day) => {
    expect(
      specialDayCreateSchema.safeParse({ name: "x", month, day }).success,
    ).toBe(true);
  });

  test.each([
    [1, 32],
    [2, 30],
    [4, 31],
    [6, 31],
    [9, 31],
    [11, 31],
    [12, 32],
    [3, 0],
    [3, 1.5],
    [3, "1"],
  ])("rejects %j/%j", (month, day) => {
    expect(
      specialDayCreateSchema.safeParse({ name: "x", month, day }).success,
    ).toBe(false);
  });

  test.each(["name", "month", "day"])("rejects a missing %s", (field) => {
    const body = Object.fromEntries(
      Object.entries(valid).filter(([k]) => k !== field),
    );
    expect(specialDayCreateSchema.safeParse(body).success).toBe(false);
  });

  test.each([null, [], "Halloween"])("rejects a body of %j", (body) => {
    expect(specialDayCreateSchema.safeParse(body).success).toBe(false);
  });

  test("strips unknown fields instead of rejecting them", () => {
    expect(
      specialDayCreateSchema.parse({ ...valid, specialDayId: "hijack" }),
    ).toEqual(valid);
  });
});

const formMessage = (input: { name: string; date: string }, field: string) => {
  const result = specialDayFormSchema.safeParse(input);
  return result.success
    ? undefined
    : result.error.issues.find((issue) => issue.path[0] === field)?.message;
};

describe("specialDayFormSchema (client)", () => {
  const date = "Oct 31, 2026";

  test("accepts a valid name and date", () => {
    expect(
      specialDayFormSchema.safeParse({ name: "Halloween", date }).success,
    ).toBe(true);
  });

  test.each([
    ["empty", ""],
    ["whitespace-only", "   "],
  ])("a %s name says Name is required", (_, name) => {
    expect(formMessage({ name, date }, "name")).toBe("Name is required");
  });

  test("a 51-char name says it is too long", () => {
    expect(formMessage({ name: "a".repeat(51), date }, "name")).toBe(
      "Name must be 50 characters or fewer",
    );
  });

  test.each([
    ["1 char", "a"],
    ["50 chars", "a".repeat(50)],
    ["50 chars plus padding", ` ${"a".repeat(50)} `],
    ["CJK and emoji", "生日 🎂"],
  ])("accepts a name of %s", (_, name) => {
    expect(formMessage({ name, date }, "name")).toBeUndefined();
  });

  test.each([
    "",
    "   ",
    "not a date",
    "2026-10-31",
    "Oct 32, 2026",
    "Feb 29, 2026",
  ])("date %j says Pick a date", (bad) => {
    expect(formMessage({ name: "x", date: bad }, "date")).toBe("Pick a date");
  });

  test.each(["Jan 01, 2026", "Feb 29, 2024", "Dec 31, 2030"])(
    "accepts date %j",
    (good) => {
      expect(formMessage({ name: "x", date: good }, "date")).toBeUndefined();
    },
  );

  test("an empty form reports both messages", () => {
    const result = specialDayFormSchema.safeParse({ name: "", date: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message).sort()).toEqual([
      "Name is required",
      "Pick a date",
    ]);
  });
});
