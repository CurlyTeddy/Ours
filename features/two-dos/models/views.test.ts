import { describe, expect, test } from "vitest";
import { DateTime } from "luxon";
import { toTodo } from "@/features/two-dos/models/views";
import type { TodoDto } from "@/features/two-dos/models/responses";

const dto = (doneAt: string | null): TodoDto => ({
  id: "t1",
  title: "Trip",
  description: null,
  location: {
    name: "Taiwan",
    address: "Taiwan",
    placeId: null,
    latitude: 23.7,
    longitude: 121,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  doneAt,
  priority: 1,
  images: [],
  createdBy: { name: "Teddy", imageUrl: null },
});

describe("toTodo status", () => {
  test.each([
    ["no done date", null, false],
    ["a past done date", DateTime.utc().minus({ days: 1 }).toISO(), true],
    ["a future done date", DateTime.utc().plus({ days: 1 }).toISO(), false],
  ])("%s", (_, doneAt, status) => {
    expect(toTodo(dto(doneAt)).status).toBe(status);
  });
});
