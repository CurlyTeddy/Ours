"use client";

import {
  ArrowRight,
  CalendarHeart,
  Globe2,
  MapPin,
  MessageCircleHeart,
  Sparkles,
} from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PhotoGallery } from "@/features/moments/components/photo-gallery";
import { MessageBoard } from "@/features/moments/components/message-board";
import { usePhotos } from "@/features/moments/hooks/use-photos";
import { useMessages } from "@/features/moments/hooks/use-messages";
import { useTodos } from "@/features/two-dos/hooks/use-two-dos";
import { SharedMusicPlayer } from "@/features/music/components/shared-music-player";
import { useEffect, useState } from "react";

const relationshipStart = new Date(Date.UTC(2022, 10, 1));

export default function Page() {
  const { photos, isLoading: isPhotosLoading } = usePhotos();
  const { totalCount: messageCount, isLoading: isMessagesLoading } =
    useMessages(5);
  const { todos, isLoading: isTodosLoading } = useTodos();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updateNow();
      }
    };

    window.addEventListener("focus", updateNow);
    window.addEventListener("pageshow", updateNow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", updateNow);
      window.removeEventListener("pageshow", updateNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const daysTogether = Math.trunc(
    (now - relationshipStart.getTime()) / (1000 * 60 * 60 * 24),
  );
  const openTodos = todos.filter((todo) => !todo.status).length;
  const anniversary = getNextAnniversary(now);

  return (
    <main className="pb-10">
      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_0.95fr] lg:px-8">
        <div className="flex flex-col justify-center">
          <Badge className="mb-5" variant="secondary">
            <Sparkles data-icon="inline-start" />
            Since 2022
          </Badge>

          <h1 className="max-w-2xl text-5xl font-bold leading-[0.98] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Adventures of <span className="text-primary">Us</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            A shared home for our photos, notes, plans, and the small moments
            that keep adding up.
          </p>

          <div className="mt-8 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricPill value={String(daysTogether)} label="Days" />
            <MetricPill
              value={isPhotosLoading ? null : String(photos.length)}
              label="Photos"
            />
            <MetricPill
              value={isMessagesLoading ? null : String(messageCount)}
              label="Messages"
            />
            <MetricPill
              value={isTodosLoading ? null : String(openTodos)}
              label="Open Plans"
            />
          </div>
        </div>

        <div
          id="gallery"
          className="scroll-mt-24 **:data-[slot=card]:relative **:data-[slot=card]:gap-0 **:data-[slot=card]:overflow-hidden **:data-[slot=card]:rounded-4xl **:data-[slot=card]:py-0 **:data-[slot=card-header]:pointer-events-none **:data-[slot=card-header]:absolute **:data-[slot=card-header]:inset-x-4 **:data-[slot=card-header]:top-4 **:data-[slot=card-header]:z-20 **:data-[slot=card-header]:p-0 [&_[data-slot=card-header]>div]:justify-end [&_[data-slot=card-header]>div>div:last-child]:pointer-events-auto **:data-[slot=card-title]:hidden"
        >
          <PhotoGallery />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl grid-cols-1 items-stretch gap-6 px-4 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)] lg:px-8">
        <div className="flex flex-col gap-6">
          <section id="messages" className="scroll-mt-24">
            <Card className="gap-4">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <MessageCircleHeart className="size-5" />
                  </span>
                  <CardTitle className="text-xl">Today&apos;s Note</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="*:data-[slot=card]:border-0 *:data-[slot=card]:bg-transparent *:data-[slot=card]:py-0 *:data-[slot=card]:shadow-none [&>[data-slot=card]>[data-slot=card-header]]:hidden">
                <MessageBoard />
              </CardContent>
            </Card>
          </section>

          <div className="lg:flex-1 *:data-[slot=card]:h-full">
            <SharedMusicPlayer />
          </div>
        </div>

        <aside className="flex flex-col gap-6">
          <Card className="rounded-4xl">
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Globe2 className="size-5" />
                </span>
                <CardTitle>Love Map</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <AspectRatio
                ratio={1}
                className="relative flex overflow-hidden rounded-3xl border border-border bg-muted"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_42%),linear-gradient(145deg,var(--muted),var(--card))]" />
                <div className="relative m-auto flex size-16 items-center justify-center rounded-full border border-border bg-card text-primary shadow-sm">
                  <MapPin className="size-8 fill-current" />
                </div>
                <div className="absolute right-5 bottom-5 left-5">
                  <p className="text-lg font-semibold text-foreground">
                    Places we have loved
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Location history is not connected yet.
                  </p>
                </div>
              </AspectRatio>
              <div className="flex flex-col gap-3 text-sm">
                <SummaryRow label="Countries visited" value="Not tracked" />
                <Separator />
                <SummaryRow label="Cities explored" value="Not tracked" />
              </div>
              <Button
                className="w-full rounded-full"
                variant="outline"
                disabled
              >
                Explore Map
                <ArrowRight data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-4xl border-primary/20 bg-primary text-primary-foreground">
            <CardHeader>
              <div className="flex items-center gap-3">
                <CalendarHeart className="size-6" />
                <CardTitle>Next Anniversary</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pb-8 text-center">
              <div className="text-6xl font-bold leading-none">
                {anniversary.daysLeft}
              </div>
              <div className="mt-2 text-sm font-semibold uppercase tracking-[0.12em] opacity-85">
                Days Left
              </div>
              <div className="mt-8 flex flex-col gap-6 text-sm">
                <Separator className="bg-primary-foreground/25" />
                <div>
                  <p className="font-semibold">{anniversary.label}</p>
                  <p className="opacity-80">{anniversary.yearLabel}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </section>
    </main>
  );
}

function MetricPill({ value, label }: { value: string | null; label: string }) {
  return (
    <div className="flex h-24 flex-col items-center justify-center rounded-full border border-border bg-card text-center shadow-sm">
      {value === null ? (
        <Skeleton className="mb-2 h-8 w-12" />
      ) : (
        <span className="text-3xl font-bold leading-none text-primary">
          {value}
        </span>
      )}
      <span className="mt-1 text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between pb-3 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function getNextAnniversary(timestamp: number) {
  const now = new Date(timestamp);
  let anniversary = new Date(Date.UTC(now.getUTCFullYear(), 10, 1, 0, 0, 0, 0));

  if (anniversary.getTime() < now.getTime()) {
    anniversary = new Date(
      Date.UTC(now.getUTCFullYear() + 1, 10, 1, 0, 0, 0, 0),
    );
  }

  const daysLeft = Math.ceil(
    (anniversary.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  const years =
    anniversary.getUTCFullYear() - relationshipStart.getUTCFullYear();

  return {
    daysLeft,
    label: anniversary.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
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
