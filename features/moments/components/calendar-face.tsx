import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { UpcomingSpecialDay } from "@/features/moments/anniversary";
import { HeartIcon } from "@/features/moments/components/heart-icon";

const months = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// The wall's tear-off pad and the dialog's big copy share a layout at two scales.
const sizes = {
  wall: {
    root: "w-44",
    backSheet: "inset-x-1.5 top-3 -bottom-2 rounded-md",
    midSheet: "inset-x-0.75 top-2 -bottom-1 rounded-md",
    sheetShadow: "shadow-[0_16px_22px_-14px_rgba(31,43,66,.55)]",
    body: "rounded-md shadow-[0_1px_1px_rgba(31,43,66,.08),0_8px_14px_-10px_rgba(31,43,66,.4)]",
    header: "gap-2 px-3 pt-5 pb-2.5 rounded-t-md",
    hole: "top-1.75 size-2.5",
    holeLeft: "left-9.5",
    holeRight: "right-9.5",
    date: "text-xl",
    weekday: "text-[11px]",
    page: "gap-0.5 px-3 pt-2.5 pb-3.5 rounded-b-md",
    days: "text-[74px]",
    daysLabel: "text-[11px] tracking-[.18em]",
    heart: "my-1.5 mb-0.5 size-13.5",
    today: "text-xl",
    name: "mt-1 text-2xl",
    pin: "-top-2.25 size-4.5 -ml-2.25 shadow-[inset_-3px_-3px_0_rgba(0,0,0,.18),0_4px_6px_-2px_rgba(31,43,66,.5)]",
  },
  large: {
    root: "w-75",
    backSheet: "inset-x-2.5 top-4.5 -bottom-3.5 rounded-[10px]",
    midSheet: "inset-x-1.25 top-3 -bottom-1.75 rounded-[10px]",
    sheetShadow: "shadow-[0_26px_40px_-24px_rgba(31,43,66,.6)]",
    body: "overflow-hidden rounded-[10px] shadow-[0_2px_2px_rgba(31,43,66,.08),0_12px_20px_-14px_rgba(31,43,66,.4)]",
    header: "gap-3 px-4 pt-8 pb-4",
    hole: "top-2.75 size-4",
    holeLeft: "left-17.5",
    holeRight: "right-17.5",
    date: "text-[34px]",
    weekday: "text-[15px]",
    page: "gap-1 px-4 pt-4.5 pb-6",
    days: "text-[128px]",
    daysLabel: "text-sm tracking-[.2em]",
    heart: "size-24",
    today: "text-[30px]",
    name: "mt-1.5 text-[38px]",
    pin: "-top-3 size-6.5 -ml-3.25 shadow-[inset_-4px_-4px_0_rgba(0,0,0,.18),0_6px_8px_-3px_rgba(31,43,66,.5)]",
  },
};

// Names that land on the same day share the page: "4th Anniversary & Her birthday".
function nextSpecialDay(upcoming: UpcomingSpecialDay[]) {
  const [next] = upcoming;
  const names = upcoming
    .filter(({ daysLeft }) => daysLeft === next.daysLeft)
    .map(({ name }) => name)
    .join(" & ");
  return { next, names, isToday: next.daysLeft === 0 };
}

function CountPage({
  days,
  names,
  size,
}: {
  days: number;
  names: string;
  size: keyof typeof sizes;
}) {
  const s = sizes[size];
  return (
    <>
      <span
        className={cn(
          "leading-[.95] font-black tracking-[-.04em] text-us-ink",
          s.days,
        )}
      >
        {days}
      </span>
      <span className={cn("font-black text-us-muted uppercase", s.daysLabel)}>
        {days === 1 ? "day to go" : "days to go"}
      </span>
      <span
        className={cn("font-hand leading-[1.1] font-bold text-us-ink", s.name)}
      >
        {names}
      </span>
    </>
  );
}

function CalendarFace({
  upcoming,
  size,
  tearingPage,
}: {
  upcoming: UpcomingSpecialDay[];
  size: keyof typeof sizes;
  // The page torn off on a new day, drawn over the current one while it falls.
  tearingPage?: ReactNode;
}) {
  const s = sizes[size];
  const { next, names, isToday } = nextSpecialDay(upcoming);

  return (
    <span className={cn("us-paper relative block text-center font-ui", s.root)}>
      <span
        aria-hidden="true"
        className={cn("absolute bg-[#F1EEE6]", s.backSheet, s.sheetShadow)}
      />
      <span
        aria-hidden="true"
        className={cn("absolute bg-[#F8F6F0]", s.midSheet)}
      />
      <span className={cn("relative flex flex-col", s.body)}>
        <span
          className={cn(
            "relative flex items-baseline justify-center bg-[#4D6CA3] text-white",
            s.header,
          )}
        >
          {[s.holeLeft, s.holeRight].map((side) => (
            <span
              key={side}
              aria-hidden="true"
              className={cn(
                "absolute rounded-full bg-us-wall shadow-[inset_0_2px_2px_rgba(0,0,0,.25)]",
                s.hole,
                side,
              )}
            />
          ))}
          <span className={cn("font-black tracking-[.04em]", s.date)}>
            <span>{months[next.date.getMonth()]}</span>{" "}
            <span>{next.date.getDate()}</span>
          </span>
          <span
            className={cn(
              "font-extrabold tracking-[.14em] text-[#E6ECF6]",
              s.weekday,
            )}
          >
            {weekdays[next.date.getDay()]}
          </span>
        </span>
        <span
          className={cn(
            "relative flex flex-col items-center bg-[#FFFDF7]",
            s.page,
          )}
        >
          {isToday ? (
            <>
              <HeartIcon className={cn("text-[#C96B7B]", s.heart)} />
              <span
                className={cn(
                  "font-black tracking-[.14em] text-us-ink",
                  s.today,
                )}
              >
                TODAY
              </span>
              <span
                className={cn(
                  "font-hand leading-[1.1] font-bold text-us-ink",
                  s.name,
                )}
              >
                Happy {names}!
              </span>
            </>
          ) : (
            <CountPage days={next.daysLeft} names={names} size={size} />
          )}
          {tearingPage}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn("absolute left-1/2 rounded-full bg-[#5B7DB6]", s.pin)}
      />
    </span>
  );
}

export { CalendarFace, CountPage, months, nextSpecialDay };
