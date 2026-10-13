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

function getNextAnniversary(timestamp: number) {
  const today = startOfDay(timestamp);
  let anniversary = new Date(today.getFullYear(), 10, 1);
  if (anniversary < today) {
    anniversary = new Date(today.getFullYear() + 1, 10, 1);
  }

  const years = anniversary.getFullYear() - relationshipStart.getFullYear();

  return {
    daysLeft: daysBetween(today, anniversary),
    label: anniversary.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    yearLabel: `${years}${ordinalSuffix(years)} Year Anniversary`,
  };
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

export { getDaysTogether, getNextAnniversary };
