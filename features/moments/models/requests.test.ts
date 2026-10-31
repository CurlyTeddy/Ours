import { describe, expect, test } from "vitest";
import {
  noteColors,
  noteCreateSchema,
  notePatterns,
  notePositionSchema,
  noteSaveSchema,
  specialDayCreateSchema,
  specialDayFormSchema,
} from "@/features/moments/models/requests";

const song = {
  videoId: "dQw4w9WgXcQ",
  title: "Inferno",
  channelTitle: "Mrs. GREEN APPLE",
  thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
};
const place = {
  name: "Taipei",
  address: "Taipei City, Taiwan",
  placeId: "ChIJmQrivHKsQjQR4MIK3c41aj8",
  latitude: 25.033,
  longitude: 121.5654,
};
const save = {
  text: "hello wall",
  color: "butter",
  pattern: "grid",
  photo: "none",
  photoFile: null,
  song: null,
  place: null,
  date: "2026-10-22",
};
const photoFile = { size: 2_000_000, type: "image/jpeg" };
const full = {
  ...save,
  photo: "new",
  photoFile,
  song,
  place,
};
const ok = (value: unknown) => noteSaveSchema.safeParse(value).success;

describe("R34/Inputs: note enums", () => {
  test("colors and patterns are the design's, in order", () => {
    expect(noteColors).toEqual([
      "mist",
      "butter",
      "blush",
      "mint",
      "lilac",
      "paper",
    ]);
    expect(notePatterns).toEqual(["plain", "grid", "lines"]);
  });
});

describe("R34/Inputs: noteSaveSchema", () => {
  test("accepts a plain note and returns each field", () => {
    expect(noteSaveSchema.parse(save)).toEqual(save);
  });

  test("accepts a note with photo, song and place", () => {
    expect(noteSaveSchema.parse(full)).toEqual(full);
  });

  test.each([
    ["empty", ""],
    ["200 chars", "a".repeat(200)],
    ["200 CJK chars", "愛".repeat(200)],
    ["emoji and newlines", "hi 🎂\nthere"],
    ["whitespace-only", "   "],
  ])("accepts text that is %s", (_, text) => {
    expect(ok({ ...save, text })).toBe(true);
  });

  test("does not trim text", () => {
    expect(noteSaveSchema.parse({ ...save, text: "  hi  " }).text).toBe(
      "  hi  ",
    );
  });

  test.each([
    ["201 chars", "a".repeat(201)],
    ["a number", 5],
    ["null", null],
  ])("rejects text that is %s", (_, text) => {
    expect(ok({ ...save, text })).toBe(false);
  });

  test.each(["mist", "butter", "blush", "mint", "lilac", "paper"])(
    "accepts color %s",
    (color) => {
      expect(ok({ ...save, color })).toBe(true);
    },
  );

  test.each(["blue", "Mist", "", null, 1])("rejects color %j", (color) => {
    expect(ok({ ...save, color })).toBe(false);
  });

  test.each(["plain", "grid", "lines"])("accepts pattern %s", (pattern) => {
    expect(ok({ ...save, pattern })).toBe(true);
  });

  test.each(["", "dots", "Grid", null])("rejects pattern %j", (pattern) => {
    expect(ok({ ...save, pattern })).toBe(false);
  });

  test.each(["keep", "new", "none"])("accepts photo %j", (photo) => {
    const body = {
      ...save,
      photo,
      photoFile: photo === "new" ? photoFile : null,
    };
    expect(noteSaveSchema.parse(body).photo).toBe(photo);
  });

  test.each([
    ["replace", "replace"],
    ["null", null],
    ["a key string", "notes/tz4a98xxat96iws9zmbrgj3a"],
    ["uppercase", "NEW"],
    ["empty", ""],
    ["a boolean", true],
  ])("rejects photo %s", (_, photo) => {
    expect(ok({ ...save, photo })).toBe(false);
  });

  test("rejects a missing photo", () => {
    expect(ok({ ...save, photo: undefined })).toBe(false);
  });

  test("strips a client-sent photoKey", () => {
    expect(
      noteSaveSchema.parse({
        ...save,
        photoKey: "notes/hijackhijackhijackhijack",
      }),
    ).toEqual(save);
  });

  test.each([
    ["1-char videoId", { ...song, videoId: "a" }],
    ["64-char videoId", { ...song, videoId: "a".repeat(64) }],
    ["200-char title", { ...song, title: "a".repeat(200) }],
    ["empty channelTitle", { ...song, channelTitle: "" }],
    ["200-char channelTitle", { ...song, channelTitle: "a".repeat(200) }],
    ["CJK title", { ...song, title: "ラヴィ 🎵" }],
  ])("accepts a song with %s", (_, value) => {
    expect(ok({ ...save, song: value })).toBe(true);
  });

  test.each([
    ["empty videoId", { ...song, videoId: "" }],
    ["65-char videoId", { ...song, videoId: "a".repeat(65) }],
    ["empty title", { ...song, title: "" }],
    ["201-char title", { ...song, title: "a".repeat(201) }],
    ["201-char channelTitle", { ...song, channelTitle: "a".repeat(201) }],
    ["a non-URL thumbnail", { ...song, thumbnailUrl: "not a url" }],
    ["a missing videoId", { ...song, videoId: undefined }],
    ["a string", "Inferno"],
  ])("rejects a song with %s", (_, value) => {
    expect(ok({ ...save, song: value })).toBe(false);
  });

  test("trims the place name and address", () => {
    expect(
      noteSaveSchema.parse({
        ...save,
        place: {
          ...place,
          name: "  Taipei  ",
          address: "  Taipei City, Taiwan ",
        },
      }).place,
    ).toEqual(place);
  });

  test.each([
    ["1-char name", { ...place, name: "a" }],
    ["100-char name", { ...place, name: "a".repeat(100) }],
    ["300-char placeId", { ...place, placeId: "a".repeat(300) }],
    ["latitude -90", { ...place, latitude: -90 }],
    ["latitude 90", { ...place, latitude: 90 }],
    ["longitude -180", { ...place, longitude: -180 }],
    ["longitude 180", { ...place, longitude: 180 }],
    ["CJK name", { ...place, name: "台北 101" }],
    ["1-char address", { ...place, address: "a" }],
    ["300-char address", { ...place, address: "a".repeat(300) }],
    [
      "300-char address plus padding",
      { ...place, address: ` ${"a".repeat(300)} ` },
    ],
    ["CJK and emoji address", { ...place, address: "110台北市信義區 🗼" }],
  ])("accepts a place with %s", (_, value) => {
    expect(ok({ ...save, place: value })).toBe(true);
  });

  test.each([
    ["empty name", { ...place, name: "" }],
    ["whitespace-only name", { ...place, name: "   " }],
    ["101-char name", { ...place, name: "a".repeat(101) }],
    ["empty placeId", { ...place, placeId: "" }],
    ["301-char placeId", { ...place, placeId: "a".repeat(301) }],
    ["latitude -90.1", { ...place, latitude: -90.1 }],
    ["latitude 90.1", { ...place, latitude: 90.1 }],
    ["longitude -180.1", { ...place, longitude: -180.1 }],
    ["longitude 180.1", { ...place, longitude: 180.1 }],
    ["string latitude", { ...place, latitude: "25" }],
    ["missing longitude", { ...place, longitude: undefined }],
    ["missing address", { ...place, address: undefined }],
    ["empty address", { ...place, address: "" }],
    ["whitespace-only address", { ...place, address: "   " }],
    ["301-char address", { ...place, address: "a".repeat(301) }],
    ["numeric address", { ...place, address: 5 }],
    ["null address", { ...place, address: null }],
  ])("rejects a place with %s", (_, value) => {
    expect(ok({ ...save, place: value })).toBe(false);
  });

  test.each(["2026-10-22", "2024-02-29", "2026-12-31", "2026-01-01", null])(
    "accepts date %j",
    (date) => {
      expect(ok({ ...save, date })).toBe(true);
    },
  );

  test.each([
    "",
    "2026-02-29",
    "2026-13-01",
    "2026-04-31",
    "2026-00-10",
    "2026-1-5",
    "2026/10/22",
    "Oct 22, 2026",
    "2026-10-22T00:00:00Z",
    "not a date",
  ])("rejects date %j", (date) => {
    expect(ok({ ...save, date })).toBe(false);
  });

  test.each(["text", "color", "pattern", "photo"])(
    "rejects a missing %s",
    (field) => {
      const body = Object.fromEntries(
        Object.entries(save).filter(([k]) => k !== field),
      );
      expect(ok(body)).toBe(false);
    },
  );

  test.each([null, [], "note", 5])("rejects a body of %j", (body) => {
    expect(ok(body)).toBe(false);
  });

  test("strips unknown fields, including position and author", () => {
    expect(
      noteSaveSchema.parse({
        ...save,
        noteId: "hijack",
        authorId: "someone",
        x: 1,
        y: 2,
        z: 3,
        rotation: 4,
      }),
    ).toEqual(save);
  });
});

describe("R34/Inputs: noteCreateSchema", () => {
  const create = { ...save, x: 100, y: -50.5, rotation: 3 };

  test("accepts a save body plus x, y, rotation", () => {
    expect(noteCreateSchema.parse(create)).toEqual(create);
  });

  test.each([-8, 8, 0, -4, 4, 2.5])("accepts rotation %d", (rotation) => {
    expect(noteCreateSchema.safeParse({ ...create, rotation }).success).toBe(
      true,
    );
  });

  test.each([-8.1, 8.1, 90, "3", null])("rejects rotation %j", (rotation) => {
    expect(noteCreateSchema.safeParse({ ...create, rotation }).success).toBe(
      false,
    );
  });

  test.each([
    ["x Infinity", { x: Infinity }],
    ["x NaN", { x: NaN }],
    ["y -Infinity", { y: -Infinity }],
    ["string x", { x: "1" }],
    ["missing x", { x: undefined }],
    ["missing y", { y: undefined }],
    ["missing rotation", { rotation: undefined }],
  ])("rejects %s", (_, patch) => {
    expect(noteCreateSchema.safeParse({ ...create, ...patch }).success).toBe(
      false,
    );
  });

  test("still validates the save fields", () => {
    expect(
      noteCreateSchema.safeParse({ ...create, color: "blue" }).success,
    ).toBe(false);
  });

  test("strips z and author", () => {
    expect(noteCreateSchema.parse({ ...create, z: 99, authorId: "x" })).toEqual(
      create,
    );
  });
});

describe("R33/Inputs: notePositionSchema", () => {
  const position = { x: 12.5, y: -30, z: 4 };

  test("accepts x, y, z", () => {
    expect(notePositionSchema.parse(position)).toEqual(position);
  });

  test.each([0, 1, 100000])("accepts z %i", (z) => {
    expect(notePositionSchema.safeParse({ ...position, z }).success).toBe(true);
  });

  test.each([-1, 1.5, "4", null, undefined])("rejects z %j", (z) => {
    expect(notePositionSchema.safeParse({ ...position, z }).success).toBe(
      false,
    );
  });

  test.each([
    ["x Infinity", { x: Infinity }],
    ["y NaN", { y: NaN }],
    ["string y", { y: "1" }],
    ["missing x", { x: undefined }],
  ])("rejects %s", (_, patch) => {
    expect(
      notePositionSchema.safeParse({ ...position, ...patch }).success,
    ).toBe(false);
  });

  test("strips content fields", () => {
    expect(
      notePositionSchema.parse({ ...position, text: "hijack", rotation: 3 }),
    ).toEqual(position);
  });
});

const valid = { name: "Halloween", month: 10, day: 31 };

describe("R37/Inputs: specialDayCreateSchema (server)", () => {
  test("accepts a valid day, trims the name and defaults year to null", () => {
    expect(
      specialDayCreateSchema.parse({ ...valid, name: "  Halloween  " }),
    ).toEqual({ ...valid, year: null });
  });

  test.each([null, 1900, 2026, 2200])("accepts year %j", (year) => {
    expect(specialDayCreateSchema.parse({ ...valid, year })).toEqual({
      ...valid,
      year,
    });
  });

  test.each([1899, 2201, 2026.5, "2026", -1])("rejects year %j", (year) => {
    expect(specialDayCreateSchema.safeParse({ ...valid, year }).success).toBe(
      false,
    );
  });

  test.each([
    ["Feb 29 every year", { month: 2, day: 29, year: null }],
    ["Feb 29 with no year", { month: 2, day: 29 }],
    ["Feb 29 2028", { month: 2, day: 29, year: 2028 }],
    ["Feb 28 2026", { month: 2, day: 28, year: 2026 }],
    ["Feb 29 2000", { month: 2, day: 29, year: 2000 }],
  ])("accepts %s", (_, patch) => {
    expect(
      specialDayCreateSchema.safeParse({ name: "x", ...patch }).success,
    ).toBe(true);
  });

  test.each([
    ["Feb 29 2026", { month: 2, day: 29, year: 2026 }],
    ["Feb 29 1900", { month: 2, day: 29, year: 1900 }],
    ["Feb 30 every year", { month: 2, day: 30, year: null }],
    ["Apr 31 2026", { month: 4, day: 31, year: 2026 }],
  ])("rejects %s", (_, patch) => {
    expect(
      specialDayCreateSchema.safeParse({ name: "x", ...patch }).success,
    ).toBe(false);
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

  test.each([0, 13, -1, 1.5, "10", null])("rejects month %j", (month) => {
    expect(
      specialDayCreateSchema.safeParse({ ...valid, month, day: 1 }).success,
    ).toBe(false);
  });

  test.each([
    [1, 32],
    [4, 31],
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
    ).toEqual({ ...valid, year: null });
  });
});

const formMessage = (
  input: { name: string; date: string; yearly: boolean },
  field: string,
) => {
  const result = specialDayFormSchema.safeParse(input);
  return result.success
    ? undefined
    : result.error.issues.find((issue) => issue.path[0] === field)?.message;
};

describe("R23/Inputs: specialDayFormSchema (client)", () => {
  const date = "2026-10-31";

  test.each([true, false])("accepts a valid form with yearly %s", (yearly) => {
    expect(
      specialDayFormSchema.parse({ name: " Halloween ", date, yearly }),
    ).toEqual({ name: "Halloween", date, yearly });
  });

  test.each([
    ["empty", ""],
    ["whitespace-only", "   "],
  ])("a %s name says Name is required", (_, name) => {
    expect(formMessage({ name, date, yearly: true }, "name")).toBe(
      "Name is required",
    );
  });

  test("a 51-char name says it is too long", () => {
    expect(
      formMessage({ name: "a".repeat(51), date, yearly: true }, "name"),
    ).toBe("Name must be 50 characters or fewer");
  });

  test.each([
    ["1 char", "a"],
    ["50 chars", "a".repeat(50)],
    ["CJK and emoji", "生日 🎂"],
  ])("accepts a name of %s", (_, name) => {
    expect(formMessage({ name, date, yearly: true }, "name")).toBeUndefined();
  });

  test.each([
    "",
    "   ",
    "not a date",
    "Oct 31, 2026",
    "2026-02-29",
    "2026-13-01",
    "2026-10-32",
    "2026-1-5",
  ])("date %j says Pick a date", (bad) => {
    expect(formMessage({ name: "x", date: bad, yearly: true }, "date")).toBe(
      "Pick a date",
    );
  });

  test.each(["2026-01-01", "2024-02-29", "2030-12-31"])(
    "accepts date %j",
    (good) => {
      expect(
        formMessage({ name: "x", date: good, yearly: false }, "date"),
      ).toBeUndefined();
    },
  );

  test("rejects a non-boolean yearly", () => {
    expect(
      specialDayFormSchema.safeParse({ name: "x", date, yearly: "yes" })
        .success,
    ).toBe(false);
  });

  test("an empty form reports both messages", () => {
    const result = specialDayFormSchema.safeParse({
      name: "",
      date: "",
      yearly: true,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message).sort()).toEqual([
      "Name is required",
      "Pick a date",
    ]);
  });
});

describe("R15/Inputs: photoFile", () => {
  const sizeMessage = "Images must be 5 MB or smaller";
  const typeMessage = "Only JPEG, PNG, WebP or GIF images can be uploaded";
  const missing = "Missing image details";
  const create = { x: 1, y: 2, rotation: 0 };
  const messages = (value: unknown) =>
    noteSaveSchema.safeParse(value).error?.issues.map((issue) => issue.message);
  const withoutPhotoFile = Object.fromEntries(
    Object.entries(save).filter(([key]) => key !== "photoFile"),
  );

  test("defaults to null when left out", () => {
    expect(noteSaveSchema.parse(withoutPhotoFile).photoFile).toBeNull();
  });

  test("photo new with its file details passes them through", () => {
    expect(
      noteSaveSchema.parse({ ...save, photo: "new", photoFile }).photoFile,
    ).toEqual(photoFile);
  });

  test.each(["image/jpeg", "image/png", "image/webp", "image/gif"])(
    "accepts %s",
    (type) => {
      expect(ok({ ...save, photo: "new", photoFile: { size: 1, type } })).toBe(
        true,
      );
    },
  );

  test("accepts exactly 5 MB", () => {
    expect(
      ok({
        ...save,
        photo: "new",
        photoFile: { size: 5 * 1024 * 1024, type: "image/png" },
      }),
    ).toBe(true);
  });

  test.each([
    ["photoFile null", null],
    ["photoFile left out", undefined],
  ])("photo new with %s: Missing image details", (_, value) => {
    const body = { ...save, photo: "new", photoFile: value };

    expect(ok(body)).toBe(false);
    expect(messages(body)).toContain(missing);
  });

  test("over the limit: Images must be 5 MB or smaller", () => {
    const body = {
      ...save,
      photo: "new",
      photoFile: { size: 5 * 1024 * 1024 + 1, type: "image/jpeg" },
    };

    expect(ok(body)).toBe(false);
    expect(messages(body)?.[0]).toBe(sizeMessage);
  });

  test("a HEIC type: Only JPEG, PNG, WebP or GIF", () => {
    const body = {
      ...save,
      photo: "new",
      photoFile: { size: 10, type: "image/heic" },
    };

    expect(ok(body)).toBe(false);
    expect(messages(body)?.[0]).toBe(typeMessage);
  });

  test.each([
    ["no size", { type: "image/jpeg" }],
    ["no type", { size: 10 }],
    ["size 0", { size: 0, type: "image/jpeg" }],
    ["a string", "image/jpeg"],
  ])("rejects a photoFile with %s", (_, value) => {
    expect(ok({ ...save, photo: "new", photoFile: value })).toBe(false);
  });

  test.each(["keep", "none"])("photo %j needs no photoFile", (photo) => {
    expect(ok({ ...save, photo, photoFile: null })).toBe(true);
    expect(ok({ ...withoutPhotoFile, photo })).toBe(true);
  });

  test("noteCreateSchema applies the same rule", () => {
    const body = { ...save, ...create, photo: "new", photoFile: null };
    const result = noteCreateSchema.safeParse(body);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      missing,
    );
    expect(
      noteCreateSchema.safeParse({ ...body, photoFile }).data?.photoFile,
    ).toEqual(photoFile);
  });

  test("noteCreateSchema defaults photoFile to null", () => {
    expect(
      noteCreateSchema.parse({ ...withoutPhotoFile, ...create }).photoFile,
    ).toBeNull();
  });
});
