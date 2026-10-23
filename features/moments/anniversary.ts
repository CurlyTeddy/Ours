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
  date: Date;
  daysLeft: number;
  year: number | null;
}

// Feb 29 falls on Feb 28 in non-leap years.
function dateIn(year: number, month: number, day: number) {
  return new Date(
    year,
    month - 1,
    Math.min(day, new Date(year, month, 0).getDate()),
  );
}

// The first occurrence on or after today.
function nextOccurrence(today: Date, month: number, day: number) {
  const thisYear = dateIn(today.getFullYear(), month, day);
  return thisYear < today
    ? dateIn(today.getFullYear() + 1, month, day)
    : thisYear;
}

function getUpcomingSpecialDays(
  timestamp: number,
  specialDays: Pick<
    SpecialDay,
    "specialDayId" | "name" | "month" | "day" | "year"
  >[],
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
      name: `${years}${ordinalSuffix(years)} Anniversary`,
      date: anniversary,
      year: null,
    },
    // A one-time day keeps its own year and drops out once it has passed.
    ...specialDays.flatMap(({ specialDayId, name, month, day, year }) => {
      const date =
        year === null
          ? nextOccurrence(today, month, day)
          : dateIn(year, month, day);
      return date < today ? [] : [{ specialDayId, name, date, year }];
    }),
  ];

  // sort is stable, so ties keep the anniversary first, then the input order
  return candidates
    .map((candidate) => ({
      ...candidate,
      daysLeft: daysBetween(today, candidate.date),
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
