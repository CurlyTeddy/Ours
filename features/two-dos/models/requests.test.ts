import { describe, expect, test } from "vitest";
import { todoPlacementSchema } from "@/features/two-dos/models/requests";

const parse = (body: unknown) => todoPlacementSchema.safeParse(body);
const firstIssue = (body: unknown) => parse(body).error?.issues[0]?.message;

describe("R13: todoPlacementSchema", () => {
  test.each([
    [{ done: true }],
    [{ done: false }],
    [{ tripId: "trip1" }],
    [{ tripId: null }],
    [{ priority: 1.5 }],
    [{ priority: -2 }],
    [{ priority: 0 }],
    [{ tripId: "trip1", done: true }],
    [{ tripId: null, done: false, priority: 3 }],
  ])("accepts %j", (body) => {
    const result = parse(body);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(body);
  });

  test("an empty body: Nothing to change", () => {
    expect(firstIssue({})).toBe("Nothing to change");
  });

  test.each([
    ["Infinity", Infinity],
    ["NaN", NaN],
  ])("%s priority: Invalid priority", (_, priority) => {
    expect(firstIssue({ priority })).toBe("Invalid priority");
  });

  test.each([
    [{ priority: "1" }],
    [{ done: "yes" }],
    [{ done: 1 }],
    [{ tripId: 5 }],
    [null],
    ["done"],
  ])("rejects %j", (body) => {
    expect(parse(body).success).toBe(false);
  });

  test("only unknown keys changes nothing", () => {
    expect(parse({ title: "x" }).success).toBe(false);
  });
});
