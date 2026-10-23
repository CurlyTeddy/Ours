"use client";

import { useState, useTransition } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import ky from "ky";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/error";
import type { UpcomingSpecialDay } from "@/features/moments/anniversary";
import {
  specialDayFormSchema,
  type SpecialDayCreateRequest,
} from "@/features/moments/models/requests";
import {
  CalendarFace,
  months,
} from "@/features/moments/components/calendar-face";

const emptyForm = { name: "", date: "", yearly: true };

const field =
  "h-11 rounded-[14px] border-0 bg-us-surface px-3.5 text-base font-bold text-us-ink shadow-[inset_0_0_0_1px_var(--us-field-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_#4F70A8] min-[901px]:text-sm";

function repeatLabel({ specialDayId, year }: UpcomingSpecialDay) {
  if (specialDayId === null) return "Every year · since 2022";
  return year === null ? "Every year" : `One time · ${year}`;
}

function whenLabel(daysLeft: number) {
  if (daysLeft === 0) return "Today";
  if (daysLeft === 1) return "Tomorrow";
  return `in ${daysLeft} days`;
}

function SpecialDaysDialog({
  upcoming,
  apiKey,
  onChanged,
  onClose,
}: {
  upcoming: UpcomingSpecialDay[];
  // The special-days collection URL (useSpecialDays' SWR key)
  apiKey: string;
  onChanged: () => Promise<unknown>;
  onClose: () => void;
}) {
  // Focus goes back to whatever opened the dialog (the wall calendar).
  const [opener] = useState(() => document.activeElement);
  const [form, setForm] = useState(emptyForm);
  const [isPending, startTransition] = useTransition();
  const parsed = specialDayFormSchema.safeParse(form);

  const add = () => {
    if (!parsed.success) return;
    const { name, date, yearly } = parsed.data;
    const picked = DateTime.fromFormat(date, "yyyy-MM-dd");
    startTransition(async () => {
      try {
        await ky.post(apiKey, {
          json: {
            name,
            month: picked.month,
            day: picked.day,
            year: yearly ? null : picked.year,
          } satisfies SpecialDayCreateRequest,
        });
        await onChanged();
        setForm(emptyForm);
        toast.success("Special day added");
      } catch (error) {
        toast.error(await getErrorMessage(error, "Failed to add special day"));
      }
    });
  };

  const remove = async (specialDayId: string) => {
    try {
      await ky.delete(`${apiKey}/${specialDayId}`);
      await onChanged();
      toast.success("Special day removed");
    } catch (error) {
      toast.error(await getErrorMessage(error, "Failed to remove special day"));
    }
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Content
        aria-label="Special days"
        aria-modal="true"
        aria-labelledby={undefined}
        aria-describedby={undefined}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener instanceof HTMLElement) opener.focus();
        }}
        className="absolute inset-0 z-3000 flex animate-fade flex-wrap items-start justify-center gap-6 overflow-auto overscroll-contain bg-us-scrim px-4 pt-18 pb-6 backdrop-blur-[8px] min-[901px]:items-center min-[901px]:gap-18 min-[901px]:px-10 min-[901px]:py-8"
      >
        <DialogPrimitive.Close
          aria-label="Close special days"
          className="absolute top-6 right-6 flex size-11 cursor-pointer items-center justify-center rounded-full bg-us-surface text-us-ink shadow-[0_6px_16px_-10px_rgba(31,43,66,.5)] hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-[#4F70A8]"
        >
          <X size={18} strokeWidth={2.4} aria-hidden="true" />
        </DialogPrimitive.Close>

        <div
          aria-hidden="true"
          className="flex-none animate-pop max-[900px]:hidden"
        >
          <CalendarFace upcoming={upcoming} size="large" />
        </div>

        <div className="flex w-full max-w-105 animate-rise flex-col gap-5 rounded-[28px] border border-us-line bg-us-panel p-6.5 shadow-[0_34px_60px_-34px_rgba(31,43,66,.5)] min-[901px]:w-100">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-[22px] leading-[1.2] font-black text-us-ink">
              Special days
            </DialogPrimitive.Title>
            <span className="text-[13px] font-bold text-us-muted">
              The calendar on the wall counts down to the next one.
            </span>
          </div>

          <ul className="flex flex-col gap-1">
            {upcoming.map((day, index) => {
              const { specialDayId } = day;
              return (
                <li
                  key={specialDayId ?? "anniversary"}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl py-2 pr-1.5 pl-2",
                    index === 0 && "bg-us-subtle",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="us-paper w-11.5 flex-none overflow-hidden rounded-lg bg-[#FFFDF7] text-center shadow-[inset_0_0_0_1px_var(--us-hair)]"
                  >
                    <span className="block bg-[#4D6CA3] py-0.75 text-[10px] font-black tracking-[.1em] text-white">
                      {months[day.date.getMonth()]}
                    </span>
                    <span className="block pt-0.75 pb-1.25 text-lg font-black text-us-ink">
                      {day.date.getDate()}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-black text-us-ink">
                      {day.name}
                    </span>
                    <span className="text-xs font-bold text-us-muted">
                      {repeatLabel(day)}
                    </span>
                  </span>
                  <span className="flex-none rounded-full bg-us-surface px-2.5 py-1.5 text-xs font-black whitespace-nowrap text-us-ink shadow-[inset_0_0_0_1px_var(--us-hair)]">
                    {whenLabel(day.daysLeft)}
                  </span>
                  {specialDayId !== null ? (
                    <button
                      type="button"
                      aria-label={`Remove ${day.name}`}
                      onClick={() => void remove(specialDayId)}
                      className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full text-us-muted hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-[#4F70A8] min-[901px]:size-10"
                    >
                      <X size={15} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <form
            className="flex flex-col gap-2.5 border-t border-[rgba(31,43,66,.08)] pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <span className="text-xs font-black tracking-[.12em] text-us-muted uppercase">
              Add a special day
            </span>
            <label className="sr-only" htmlFor="special-day-name">
              Name
            </label>
            <input
              id="special-day-name"
              type="text"
              value={form.name}
              maxLength={50}
              placeholder="Name · e.g. her birthday"
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              className={field}
            />
            <div className="flex items-center gap-2.5">
              <label className="sr-only" htmlFor="special-day-date">
                Date
              </label>
              <input
                id="special-day-date"
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
                className={cn(field, "min-w-0 flex-1 px-3")}
              />
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-1 text-[13px] font-extrabold text-us-ink">
                <input
                  type="checkbox"
                  checked={form.yearly}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      yearly: event.target.checked,
                    }))
                  }
                  className="m-0 size-4.5 accent-[#4F70A8]"
                />
                Every year
              </label>
            </div>
            <button
              type="submit"
              disabled={!parsed.success || isPending}
              className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-[#4F70A8] text-sm font-extrabold text-white transition-colors hover:bg-[#3F5F96] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4F70A8] disabled:cursor-not-allowed disabled:bg-[#8EA3C6]"
            >
              <Plus size={16} strokeWidth={2.6} aria-hidden="true" />
              Add to calendar
            </button>
          </form>

          <DialogPrimitive.Close className="h-11 cursor-pointer rounded-[14px] bg-us-subtle text-sm font-extrabold text-us-ink hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-[#4F70A8]">
            Done
          </DialogPrimitive.Close>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}

export { SpecialDaysDialog };
