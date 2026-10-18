"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import ky from "ky";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { CalendarHeart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormItem,
  FormLabel,
  FormMessage,
  RegisteredFormControl,
  UncontrolledFormField,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import AlertDialogButton from "@/components/ui/alert-dialog-button";
import PopoverCalendar, { dateFormat } from "@/components/ui/popover-calendar";
import { getErrorMessage } from "@/lib/error";
import { getUpcomingSpecialDays } from "@/features/moments/anniversary";
import { useSpecialDays } from "@/features/moments/hooks/use-special-days";
import {
  SpecialDayCreateRequest,
  specialDayFormSchema,
} from "@/features/moments/models/requests";

function SpecialDayCountdown({ now }: { now: number }) {
  const { key, specialDays, isLoading, mutate } = useSpecialDays();
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof specialDayFormSchema>>({
    resolver: zodResolver(specialDayFormSchema),
    defaultValues: { name: "", date: "" },
  });

  const upcoming = getUpcomingSpecialDays(now, specialDays);
  const [next] = upcoming;
  const closestNames = upcoming
    .filter((specialDay) => specialDay.daysLeft === next.daysLeft)
    .map((specialDay) => specialDay.name)
    .join(" & ");

  const onSubmit = ({ name, date }: z.infer<typeof specialDayFormSchema>) => {
    startTransition(async () => {
      try {
        const picked = DateTime.fromFormat(date, dateFormat);
        await ky.post(key, {
          json: {
            name,
            month: picked.month,
            day: picked.day,
          } satisfies SpecialDayCreateRequest,
        });
        await mutate();
        form.reset();
        toast.success("Special day added");
      } catch (error) {
        toast.error(await getErrorMessage(error, "Failed to add special day"));
      }
    });
  };

  const onDelete = async (specialDayId: string) => {
    await ky.delete(`${key}/${specialDayId}`);
    await mutate();
    toast.success("Special day removed");
  };

  return (
    <Card className="overflow-hidden rounded-4xl border-primary/20 bg-primary text-primary-foreground">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalendarHeart className="size-6" />
            <CardTitle>Next Special Day</CardTitle>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary" className="h-11 cursor-pointer">
                Manage
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain">
              <DialogHeader>
                <DialogTitle>Special Days</DialogTitle>
                <DialogDescription>
                  Each day repeats yearly. The closest one shows on the card.
                </DialogDescription>
              </DialogHeader>

              <ul className="flex flex-col divide-y">
                {upcoming.map(({ specialDayId, name, label }) => (
                  <li
                    key={specialDayId ?? "anniversary"}
                    className="flex min-h-14 items-center justify-between gap-3 py-1"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{name}</p>
                      <p className="text-sm text-muted-foreground">{label}</p>
                    </div>
                    {specialDayId !== null && (
                      <AlertDialogButton
                        buttonVariant="ghost"
                        buttonSize="icon"
                        buttonClassName="size-11 shrink-0 cursor-pointer hover:text-destructive"
                        buttonAriaLabel={`Delete ${name}`}
                        alertTitle="Delete special day?"
                        alertDescription={`"${name}" will be removed from the countdown.`}
                        confirmButtonText="Delete"
                        onConfirm={() => onDelete(specialDayId)}
                      >
                        <Trash2 />
                      </AlertDialogButton>
                    )}
                  </li>
                ))}
              </ul>

              <Separator />

              <Form {...form}>
                <form
                  onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
                  className="flex flex-col gap-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <UncontrolledFormField name="name">
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <RegisteredFormControl>
                          <Input placeholder="e.g. Valentine's Day" />
                        </RegisteredFormControl>
                        <FormMessage />
                      </FormItem>
                    </UncontrolledFormField>

                    <UncontrolledFormField name="date">
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <RegisteredFormControl>
                          <PopoverCalendar />
                        </RegisteredFormControl>
                        <FormMessage />
                      </FormItem>
                    </UncontrolledFormField>
                  </div>

                  <Button
                    type="submit"
                    disabled={isPending}
                    className="h-11 cursor-pointer sm:self-end"
                  >
                    Add
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="pb-8 text-center">
        {isLoading ? (
          <Skeleton className="mx-auto h-15 w-24 bg-primary-foreground/25" />
        ) : (
          <div className="text-6xl font-bold leading-none">{next.daysLeft}</div>
        )}
        <div className="mt-2 text-sm font-semibold uppercase tracking-[0.12em] opacity-85">
          Days Left
        </div>
        <div className="mt-8 flex flex-col gap-6 text-sm">
          <Separator className="bg-primary-foreground/25" />
          {isLoading ? (
            <div className="flex flex-col items-center gap-1">
              <Skeleton className="h-5 w-32 bg-primary-foreground/25" />
              <Skeleton className="h-5 w-40 bg-primary-foreground/25" />
            </div>
          ) : (
            <div>
              <p className="font-semibold">{next.label}</p>
              <p className="opacity-80">{closestNames}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { SpecialDayCountdown };
