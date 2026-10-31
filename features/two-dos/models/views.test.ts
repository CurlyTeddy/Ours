import { describe, expect, test } from "vitest";
import { DateTime } from "luxon";
import * as views from "@/features/two-dos/models/views";
import { todoFormSchema, toTodo } from "@/features/two-dos/models/views";
import { maxImageBytes } from "@/lib/image-upload";
import type { TodoDto } from "@/features/two-dos/models/responses";

const taipei = {
  name: "Taipei",
  address: "Taipei, Taiwan",
  placeId: "place-taipei",
  latitude: 25.03,
  longitude: 121.56,
};

const dto = (doneAt: string | null, patch: Partial<TodoDto> = {}): TodoDto => ({
  id: "t1",
  title: "Trip",
  description: null,
  location: taipei,
  tripId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  doneAt,
  priority: 1,
  images: [],
  createdBy: { name: "Teddy", imageUrl: null },
  ...patch,
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

describe("R1/R3: toTodo maps trip, priority and location", () => {
  test("tripId and priority pass through", () => {
    const todo = toTodo(dto(null, { tripId: "trip1", priority: 2.5 }));
    expect(todo.tripId).toBe("trip1");
    expect(todo.priority).toBe(2.5);
    expect(todo.location).toEqual(taipei);
  });

  test("no trip and no location stay null", () => {
    const todo = toTodo(dto(null, { tripId: null, location: null }));
    expect(todo.tripId).toBeNull();
    expect(todo.location).toBeNull();
  });
});

describe("R1: todoFormSchema uses the shared limit", () => {
  const form = (images: File[]) =>
    todoFormSchema.safeParse({
      title: "Trip",
      list: "inspiration",
      location: null,
      description: "",
      images,
    });
  const sized = (size: number, type = "image/jpeg") =>
    new File([new Uint8Array(size)], "a.jpg", { type });

  test("an image of exactly maxImageBytes passes", () => {
    expect(form([sized(maxImageBytes)]).success).toBe(true);
  });

  test("one byte over fails", () => {
    expect(form([sized(maxImageBytes + 1)]).success).toBe(false);
  });

  test.each(["image/gif", "image/jpeg", "image/png", "image/webp"])(
    "%s is allowed",
    (type) => {
      expect(form([sized(10, type)]).success).toBe(true);
    },
  );

  test("maxFileSize is no longer exported", () => {
    expect("maxFileSize" in views).toBe(false);
  });
});
