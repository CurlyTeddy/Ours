import type { SpecialDay } from "@/features/moments/models/responses";

const millisecondsPerDay = 1000 * 60 * 60 * 24;

// Local dates, so the day turns at the viewer's midnight rather than UTC's.
const relationshipStart = new Date(2022, 10, 1);

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Math.round absorbs the 23h or 25h days around daylight saving changes.
function daysBetween(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / millisecondsPerDay);
}

function getDaysTogether(timestamp: number) {
  return daysBetween(relationshipStart, startOfDay(timestamp));
}

interface UpcomingSpecialDay {
  specialDayId: string | null;
  name: string;
  daysLeft: number;
  label: string;
}

// The first occurrence on or after today; Feb 29 falls on Feb 28 in non-leap years.
function nextOccurrence(today: Date, month: number, day: number) {
  const occurrenceIn = (year: number) =>
    new Date(
      year,
      month - 1,
      Math.min(day, new Date(year, month, 0).getDate()),
    );

  const thisYear = occurrenceIn(today.getFullYear());
  return thisYear < today ? occurrenceIn(today.getFullYear() + 1) : thisYear;
}

function getUpcomingSpecialDays(
  timestamp: number,
  specialDays: Pick<SpecialDay, "specialDayId" | "name" | "month" | "day">[],
): UpcomingSpecialDay[] {
  const today = startOfDay(timestamp);
  const anniversary = nextOccurrence(
    today,
    relationshipStart.getMonth() + 1,
    relationshipStart.getDate(),
  );
  const years = anniversary.getFullYear() - relationshipStart.getFullYear();

  const candidates = [
    {
      specialDayId: null,
      name: `${years}${ordinalSuffix(years)} Year Anniversary`,
      date: anniversary,
    },
    ...specialDays.map((specialDay) => ({
      specialDayId: specialDay.specialDayId,
      name: specialDay.name,
      date: nextOccurrence(today, specialDay.month, specialDay.day),
    })),
  ];

  // sort is stable, so ties keep the anniversary first, then the input order
  return candidates
    .map(({ date, ...candidate }) => ({
      ...candidate,
      daysLeft: daysBetween(today, date),
      label: date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

function ordinalSuffix(value: number) {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) {
    return "th";
  }

  switch (value % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export { getDaysTogether, getUpcomingSpecialDays };
export type { UpcomingSpecialDay };
