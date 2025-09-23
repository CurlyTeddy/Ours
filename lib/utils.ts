import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds).toString()} second${seconds > 1 ? "s" : ""}`;
  }

  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `${minutes.toString()} minute${minutes > 1 ? "s" : ""}`;
  }

  if (seconds < 86400) {
    const hours = Math.round(seconds / 3600);
    return `${hours.toString()} hour${hours > 1 ? "s" : ""}`;
  }

  const days = Math.round(seconds / 86400);
  return `${days.toString()} day${days > 1 ? "s" : ""}`;
}

export { cn, formatTime };
