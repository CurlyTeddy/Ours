import { DateTime } from "luxon";
import { z } from "zod/v4";

const tripDate = z
  .string()
  .refine((date) => DateTime.fromFormat(date, "yyyy-MM-dd").isValid, {
    message: "Invalid date",
  })
  .nullable();

const tripFields = {
  name: z
    .string()
    .trim()
    .min(1, "Give the trip a name")
    .max(80, "Keep the trip name under 80 characters"),
  startDate: tripDate,
  endDate: tripDate,
};

const datesInOrder = ({
  startDate,
  endDate,
}: {
  startDate?: string | null;
  endDate?: string | null;
}) => !startDate || !endDate || endDate >= startDate;
const datesOrderMessage = "The trip can’t end before it starts";

const tripSaveSchema = z
  .object(tripFields)
  // A fresh options object: zod rewrites the one it is given
  .refine(datesInOrder, { message: datesOrderMessage, path: ["endDate"] });

const tripPatchSchema = z.object({
  ...z.object(tripFields).partial().shape,
  // JSON has no Infinity or NaN, so any number that parses is finite
  position: z.number({ error: "Invalid position" }).optional(),
});

interface TripDto {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  position: number;
}

interface TripsResponse {
  trips: TripDto[];
}

interface TripResponse {
  trip: TripDto;
}

export { datesInOrder, datesOrderMessage, tripPatchSchema, tripSaveSchema };
export type { TripDto, TripResponse, TripsResponse };
