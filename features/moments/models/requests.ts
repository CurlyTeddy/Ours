import { DateTime } from "luxon";
import { z } from "zod/v4";
import { imageUploadSchema } from "@/lib/image-upload";

const noteColors = [
  "mist",
  "butter",
  "blush",
  "mint",
  "lilac",
  "paper",
] as const;
const notePatterns = ["plain", "grid", "lines"] as const;

// A local calendar day; luxon rejects impossible dates like 2026-02-30.
const isIsoDate = (date: string) =>
  DateTime.fromFormat(date, "yyyy-MM-dd").isValid;

const noteSongSchema = z.object({
  videoId: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  channelTitle: z.string().max(200),
  thumbnailUrl: z.url(),
});

const notePlaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(300),
  placeId: z.string().min(1).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const noteContentSchema = z.object({
  text: z.string().max(200),
  color: z.enum(noteColors),
  pattern: z.enum(notePatterns),
  // "new" makes the API issue a fresh key and an upload URL; "keep" leaves the stored photo.
  photo: z.enum(["keep", "new", "none"]),
  photoFile: imageUploadSchema.nullable().default(null),
  song: noteSongSchema.nullable(),
  place: notePlaceSchema.nullable(),
  date: z.string().refine(isIsoDate).nullable(),
});

// A "new" photo's upload URL is signed for its exact size and type, so both must come with it.
const hasPhotoFile = ({
  photo,
  photoFile,
}: {
  photo: string;
  photoFile: unknown;
}) => photo !== "new" || photoFile !== null;
const missingPhotoFile = {
  message: "Missing image details",
  path: ["photoFile"],
};

const noteSaveSchema = noteContentSchema.refine(hasPhotoFile, missingPhotoFile);

const noteCreateSchema = noteContentSchema
  .extend({
    x: z.number(),
    y: z.number(),
    rotation: z.number().min(-8).max(8),
  })
  .refine(hasPhotoFile, missingPhotoFile);

const notePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().int().min(0),
});

type NoteColor = (typeof noteColors)[number];
type NotePattern = (typeof notePatterns)[number];
type NoteSong = z.infer<typeof noteSongSchema>;
type NotePlace = z.infer<typeof notePlaceSchema>;
type NoteSaveRequest = z.infer<typeof noteSaveSchema>;
type NoteCreateRequest = z.infer<typeof noteCreateSchema>;
type NotePositionRequest = z.infer<typeof notePositionSchema>;

const specialDayCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1),
    year: z.number().int().min(1900).max(2200).nullable().default(null),
  })
  // Day 0 of the next month is this month's last day; leap year 2024 lets a yearly Feb 29 through.
  .refine(
    ({ month, day, year }) => day <= new Date(year ?? 2024, month, 0).getDate(),
  );

type SpecialDayCreateRequest = z.infer<typeof specialDayCreateSchema>;

const specialDayFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(50, "Name must be 50 characters or fewer"),
  date: z.string().refine(isIsoDate, { message: "Pick a date" }),
  yearly: z.boolean(),
});

export {
  noteColors,
  notePatterns,
  noteSaveSchema,
  noteCreateSchema,
  notePositionSchema,
  specialDayCreateSchema,
  specialDayFormSchema,
};
export type {
  NoteColor,
  NotePattern,
  NoteSong,
  NotePlace,
  NoteSaveRequest,
  NoteCreateRequest,
  NotePositionRequest,
  SpecialDayCreateRequest,
};
