import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useFormContext, UseFormRegisterReturn } from "react-hook-form";
import { useState } from "react";
import { DateTime } from "luxon";
import { useTimeZone } from "@/components/providers/time-zone";

const dateFormat = "MMM dd, yyyy";

export default function PopoverCalendar({
  ...props
}: Partial<UseFormRegisterReturn>) {
  const [open, setOpen] = useState(false);
  const timeZone = useTimeZone();
  const { setValue } = useFormContext();

  return (
    <div className="relative flex gap-2">
      <Input
        placeholder="select a date"
        className="bg-background pr-10"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        {...props}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date-picker"
            variant="ghost"
            className="absolute top-1/2 right-2 size-6 -translate-y-1/2"
          >
            <CalendarIcon className="size-3.5" />
            <span className="sr-only">Select date</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden p-0"
          align="end"
          alignOffset={-8}
          sideOffset={10}
        >
          <Calendar
            mode="single"
            captionLayout="dropdown"
            onSelect={(date) => {
              if (props.name && date) {
                setValue(
                  props.name,
                  DateTime.fromJSDate(date, { zone: timeZone }).toFormat(
                    dateFormat,
                  ),
                );
              }
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { dateFormat };
