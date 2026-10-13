import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Each unit is chosen on the rounded value, so 59.6 seconds reads "1 minute", not "60 seconds".
function formatTime(seconds: number): string {
  const plural = (count: number, unit: string) =>
    `${count.toString()} ${unit}${count === 1 ? "" : "s"}`;

  const roundedSeconds = Math.round(seconds);
  if (roundedSeconds < 60) {
    return plural(roundedSeconds, "second");
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return plural(minutes, "minute");
  }

  const hours = Math.round(seconds / 3600);
  if (hours < 24) {
    return plural(hours, "hour");
  }

  return plural(Math.round(seconds / 86400), "day");
}

export { cn, formatTime };
