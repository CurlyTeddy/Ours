import { DateTime } from "luxon";
import { z } from "zod/v4";
import { dateFormat } from "@/lib/utils";

interface PhotoUploadRequest {
  imageNames: string[];
}

interface MessageCreateRequest {
  content: string;
}

const specialDayCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1),
  })
  // Day 0 of the next month is this month's last day; leap year 2024 lets Feb 29 through.
  .refine(({ month, day }) => day <= new Date(2024, month, 0).getDate());

type SpecialDayCreateRequest = z.infer<typeof specialDayCreateSchema>;

const specialDayFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(50, "Name must be 50 characters or fewer"),
  date: z
    .string()
    .refine((date) => DateTime.fromFormat(date, dateFormat).isValid, {
      message: "Pick a date",
    }),
});

export { specialDayCreateSchema, specialDayFormSchema };
export type {
  PhotoUploadRequest,
  MessageCreateRequest,
  SpecialDayCreateRequest,
};
