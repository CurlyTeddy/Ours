"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { cn } from "@/lib/utils";
import type { UpcomingSpecialDay } from "@/features/moments/anniversary";
import {
  CalendarFace,
  CountPage,
  nextSpecialDay,
} from "@/features/moments/components/calendar-face";

const storageKey = "moments-calendar-day";

// True once per new local day: yesterday's page falls off when the wall first loads.
function claimNewDay(today: string) {
  try {
    const isNewDay = window.localStorage.getItem(storageKey) !== today;
    window.localStorage.setItem(storageKey, today);
    return isNewDay;
  } catch {
    return false;
  }
}

function WallCalendar({
  upcoming,
  now,
  ready,
  onOpen,
  className,
}: {
  upcoming: UpcomingSpecialDay[];
  now: number;
  // Special days have loaded, so the falling page shows the right count.
  ready: boolean;
  onOpen: () => void;
  className?: string;
}) {
  const [tearing, setTearing] = useState(false);
  const { next, names, isToday } = nextSpecialDay(upcoming);

  useEffect(() => {
    if (!ready) return;
    if (!claimNewDay(DateTime.fromMillis(now).toFormat("yyyy-MM-dd"))) return;
    if (!isToday) setTearing(true);
    // Once per page load, as soon as the data is in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!tearing) return;
    // 0.9s delay + 1.5s fall, then the page is gone
    const timer = window.setTimeout(() => setTearing(false), 2700);
    return () => window.clearTimeout(timer);
  }, [tearing]);

  return (
    <button
      type="button"
      aria-label={
        isToday
          ? `Today is ${names}. Press to manage special days`
          : `${next.daysLeft} days to ${names}. Press to manage special days`
      }
      onClick={onOpen}
      className={cn(
        "cursor-pointer rotate-4 transition-[opacity,rotate,translate] duration-[350ms,300ms,300ms] ease-[ease,cubic-bezier(.2,.8,.2,1),cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1 hover:rotate-1 focus-visible:outline-3 focus-visible:outline-offset-5 focus-visible:outline-[#4F70A8]",
        className,
      )}
    >
      <CalendarFace
        upcoming={upcoming}
        size="wall"
        tearingPage={
          tearing ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 z-3 flex origin-[12%_0] animate-tear flex-col items-center gap-0.5 rounded-b-md bg-[#FFFDF7] px-3 pt-2.5 pb-3.5 shadow-[0_10px_18px_-10px_rgba(31,43,66,.5)] motion-reduce:hidden"
            >
              <CountPage days={next.daysLeft + 1} names={names} size="wall" />
            </span>
          ) : null
        }
      />
    </button>
  );
}

export { WallCalendar };
