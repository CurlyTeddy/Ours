import { describe, expect, test } from "vitest";
import {
  listKeyOf,
  listTodos,
  freePriority,
  priorityBetween,
  tripDates,
  tripTint,
} from "@/features/two-dos/lists";
import type { Todo } from "@/features/two-dos/models/views";

const tints = ["#D3E0F4", "#FAEDBE", "#D6ECDF", "#F7D9DC", "#E2DCF3"];

const todo = (
  id: string,
  tripId: string | null,
  status: boolean,
  priority: number,
): Todo => ({
  id,
  images: [],
  title: id,
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: { name: "Teddy", imageUrl: null },
  location: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  doneAt: status ? "2026-01-02T00:00:00.000Z" : null,
  description: null,
  status,
  tripId,
  priority,
});

describe("R1: listKeyOf", () => {
  test.each([
    ["a trip stop, undone", "trip1", false, "trip1"],
    ["a trip stop, done", "trip1", true, "trip1"],
    ["no trip, undone", null, false, "inspiration"],
    ["no trip, done", null, true, "unsorted"],
  ])("%s → %s", (_, tripId, status, key) => {
    expect(listKeyOf({ tripId, status })).toBe(key);
  });
});

describe("R1/R2: listTodos", () => {
  const todos = [
    todo("c", "trip1", false, 30),
    todo("idea2", null, false, 9),
    todo("a", "trip1", true, 10),
    todo("done1", null, true, 4),
    todo("other", "trip2", false, 1),
    todo("b", "trip1", false, 20.5),
    todo("idea1", null, false, -3),
  ];

  test("a trip's stops, ascending priority, done or not", () => {
    expect(listTodos(todos, "trip1").map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  test("Inspiration holds only undone to-dos with no trip", () => {
    expect(listTodos(todos, "inspiration").map((t) => t.id)).toEqual([
      "idea1",
      "idea2",
    ]);
  });

  test("Unsorted holds only done to-dos with no trip", () => {
    expect(listTodos(todos, "unsorted").map((t) => t.id)).toEqual(["done1"]);
  });

  test("an unknown trip and an empty input are empty lists", () => {
    expect(listTodos(todos, "nope")).toEqual([]);
    expect(listTodos([], "inspiration")).toEqual([]);
  });

  test("does not reorder the input", () => {
    const copy = [...todos];
    listTodos(todos, "trip1");
    expect(todos).toEqual(copy);
  });
});

describe("R12: priorityBetween", () => {
  test.each([
    ["both set: midpoint", 1, 2, 1.5],
    ["both set, fractional", 1, 1.5, 1.25],
    ["both set, negative", -1, 1, 0],
    ["only before: +1", 3, null, 4],
    ["only after: −1", null, 3, 2],
    ["only after, fractional", null, 0.5, -0.5],
    ["neither: 1", null, null, 1],
  ])("%s", (_, before, after, expected) => {
    expect(priorityBetween(before, after)).toBe(expected);
  });

  test("a 0 neighbour counts as set", () => {
    expect(priorityBetween(0, null)).toBe(1);
    expect(priorityBetween(null, 0)).toBe(-1);
    expect(priorityBetween(0, 1)).toBe(0.5);
  });

  test("the result sorts strictly between its neighbours", () => {
    const p = priorityBetween(7, 8);
    expect(p).toBeGreaterThan(7);
    expect(p).toBeLessThan(8);
  });
});

describe("R16: tripTint", () => {
  test("is one of the five tints and stable per id", () => {
    for (const id of [
      "a",
      "clx123abc",
      "",
      "東京旅行",
      "🧳✈️",
      "x".repeat(500),
    ]) {
      expect(tints).toContain(tripTint(id));
      expect(tripTint(id)).toBe(tripTint(id));
    }
  });

  test("spreads ids over more than one tint", () => {
    const used = new Set(
      Array.from({ length: 50 }, (_, i) => tripTint(`trip-${String(i)}`)),
    );
    expect(used.size).toBeGreaterThan(1);
  });
});

describe("R5/R7: tripDates", () => {
  test("same year: the end drops its year", () => {
    expect(tripDates({ startDate: "2025-12-20", endDate: "2025-12-28" })).toBe(
      "2025.12.20 – 12.28",
    );
  });

  test("different years: the end keeps its year", () => {
    expect(tripDates({ startDate: "2025-12-20", endDate: "2026-01-05" })).toBe(
      "2025.12.20 – 2026.01.05",
    );
  });

  test("a one-day trip still shows both ends", () => {
    expect(tripDates({ startDate: "2025-03-01", endDate: "2025-03-01" })).toBe(
      "2025.03.01 – 03.01",
    );
  });

  test("only the start set", () => {
    expect(tripDates({ startDate: "2025-12-20", endDate: null })).toBe(
      "2025.12.20",
    );
  });

  test("no start: No dates yet, even with an end", () => {
    expect(tripDates({ startDate: null, endDate: null })).toBe("No dates yet");
    expect(tripDates({ startDate: null, endDate: "2025-12-20" })).toBe(
      "No dates yet",
    );
  });
});

describe("R12: freePriority (regression: priorities are unique across lists)", () => {
  test.each([
    ["between neighbours, past another list's value", 1, 3, [2, 3, 5], 1.5],
    ["at the end, short of another list's last + 1", 5, null, [1, 3, 6], 5.5],
    ["at the top, past another list's first − 1", null, 1, [0, 3, 5], 0.5],
    ["no other to-do in the way", 1, 3, [3], 2],
    ["the end with nothing above", 5, null, [1, 3], 6],
    ["the top with nothing below", null, 1, [3], 0],
    ["an empty list", null, null, [4, 7], 1],
  ])("%s", (_, before, after, others, expected) => {
    const priority = freePriority(before, after, others);
    expect(priority).toBe(expected);
    expect(others).not.toContain(priority);
  });
});

describe("R12: freePriority, neighbours held by the list itself", () => {
  test.each([
    ["between 1 and 3 with 2 taken", 1, 3, [1, 2, 3], 1.5],
    ["the top before 1", null, 1, [1, 2, 3], 0],
    ["the end after 3", 3, null, [1, 2, 3], 4],
    ["before 3 with 2 taken", null, 3, [2, 3], 2.5],
  ])("%s", (_, before, after, others, expected) => {
    const priority = freePriority(before, after, others);
    expect(priority).toBe(expected);
    // Sorts into the slot and no to-do holds it
    if (before !== null) expect(priority).toBeGreaterThan(before);
    if (after !== null) expect(priority).toBeLessThan(after);
    expect(others).not.toContain(priority);
  });

  test("no other to-dos", () => {
    expect(freePriority(null, null, [])).toBe(1);
    expect(freePriority(1, null, [])).toBe(2);
    expect(freePriority(null, 1, [])).toBe(0);
    expect(freePriority(1, 3, [3])).toBe(2);
  });
});
