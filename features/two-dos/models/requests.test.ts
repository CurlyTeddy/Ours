import { describe, expect, test } from "vitest";
import {
  todoCreateSchema,
  todoPlacementSchema,
  todoUpdateSchema,
} from "@/features/two-dos/models/requests";

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

const sizeMessage = "Images must be 5 MB or smaller";
const typeMessage = "Only JPEG, PNG, WebP or GIF images can be uploaded";
const jpegUpload = (name: string, size = 1000) => ({
  name,
  size,
  type: "image/jpeg",
});
const create = (images: unknown) =>
  todoCreateSchema.safeParse({
    title: "Temple",
    location: null,
    tripId: null,
    images,
  });
const update = (patch: Record<string, unknown>) =>
  todoUpdateSchema.safeParse({
    title: "Temple",
    description: null,
    location: null,
    tripId: null,
    imageNames: [],
    uploads: [],
    ...patch,
  });

describe("R15/Inputs: todoCreateSchema.images", () => {
  test("accepts name, size and type per image and returns them", () => {
    const images = [
      jpegUpload("0-a.jpg"),
      { name: "1-b.gif", size: 5 * 1024 * 1024, type: "image/gif" },
    ];

    expect(create(images).data?.images).toEqual(images);
  });

  test("an empty list is fine", () => {
    expect(create([]).success).toBe(true);
  });

  test.each(["image/jpeg", "image/png", "image/webp", "image/gif"])(
    "accepts %s",
    (type) => {
      expect(create([{ name: "0-a", size: 1, type }]).success).toBe(true);
    },
  );

  test("a CJK and emoji name is fine", () => {
    expect(create([jpegUpload("0-相片 🐶.jpg")]).success).toBe(true);
  });

  test("over the limit: Images must be 5 MB or smaller", () => {
    const result = create([jpegUpload("0-a.jpg", 5 * 1024 * 1024 + 1)]);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(sizeMessage);
  });

  test.each(["image/heic", "image/bmp", ""])(
    "type %j: Only JPEG, PNG, WebP or GIF",
    (type) => {
      const result = create([{ name: "0-a", size: 10, type }]);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(typeMessage);
    },
  );

  test.each([
    ["an empty name", { name: "", size: 10, type: "image/jpeg" }],
    ["a missing name", { size: 10, type: "image/jpeg" }],
    ["a missing size", { name: "0-a", type: "image/jpeg" }],
    ["a missing type", { name: "0-a", size: 10 }],
    ["size 0", jpegUpload("0-a", 0)],
    ["a fractional size", jpegUpload("0-a", 1.5)],
    ["a bare string", "0-a.jpg"],
  ])("rejects %s", (_, image) => {
    expect(create([image]).success).toBe(false);
  });

  test("the old imageNames field alone is not enough", () => {
    expect(
      todoCreateSchema.safeParse({
        title: "Temple",
        location: null,
        tripId: null,
        imageNames: ["0-a.jpg"],
      }).success,
    ).toBe(false);
  });
});

describe("R15/Inputs: todoUpdateSchema.uploads", () => {
  test("accepts existing keys plus new names with their uploads", () => {
    const uploads = [jpegUpload("0-new.jpg")];
    const result = update({
      imageNames: ["a.jpg-1", "0-new.jpg"],
      uploads,
    });

    expect(result.success).toBe(true);
    expect(result.data?.imageNames).toEqual(["a.jpg-1", "0-new.jpg"]);
    expect(result.data?.uploads).toEqual(uploads);
  });

  test("over the limit: Images must be 5 MB or smaller", () => {
    const result = update({
      imageNames: ["0-a.jpg"],
      uploads: [jpegUpload("0-a.jpg", 6_000_000)],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(sizeMessage);
  });

  test("a HEIC upload: Only JPEG, PNG, WebP or GIF", () => {
    const result = update({
      imageNames: ["0-a.heic"],
      uploads: [{ name: "0-a.heic", size: 10, type: "image/heic" }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(typeMessage);
  });

  test.each([
    ["a missing size", { name: "0-a", type: "image/jpeg" }],
    ["a missing type", { name: "0-a", size: 10 }],
    ["an empty name", { name: "", size: 10, type: "image/jpeg" }],
  ])("rejects an upload with %s", (_, upload) => {
    expect(update({ imageNames: ["0-a"], uploads: [upload] }).success).toBe(
      false,
    );
  });

  test("empty imageNames still rejects an empty key", () => {
    expect(update({ imageNames: [""] }).success).toBe(false);
  });
});
