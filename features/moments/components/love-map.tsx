"use client";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useTodos } from "@/features/two-dos/hooks/use-two-dos";
import { Todo } from "@/features/two-dos/models/views";
import { env } from "@/lib/env";
import {
  AdvancedMarker,
  APILoadingStatus,
  Map as GoogleMap,
  useApiLoadingStatus,
} from "@vis.gl/react-google-maps";
import { ArrowRight, Globe2, Heart, MapPin } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

// Vector Map ID from Cloud Console (Map Management); AdvancedMarker needs one. Not a secret.
const loveMapId = "e7ae25bbcdc7871851a90684";

function LoveMap() {
  const { todos, isLoading } = useTodos();
  const loadingStatus = useApiLoadingStatus();
  const mapFailed =
    loadingStatus === APILoadingStatus.FAILED ||
    loadingStatus === APILoadingStatus.AUTH_FAILURE;

  const pinnedTodos = useMemo(() => {
    const byCoordinates = new Map<string, Todo>();
    todos.forEach((todo) => {
      const key = `${todo.location.latitude.toFixed(5)},${todo.location.longitude.toFixed(5)}`;
      if (!byCoordinates.has(key)) {
        byCoordinates.set(key, todo);
      }
    });
    return Array.from(byCoordinates.values());
  }, [todos]);

  const showMap =
    !!env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY &&
    pinnedTodos.length > 0 &&
    !mapFailed;

  const completedVisits = todos.filter((todo) => todo.status).length;

  return (
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
          className="relative overflow-hidden rounded-3xl border border-border bg-muted"
        >
          {showMap ? (
            <GoogleMap
              className="absolute inset-0"
              mapId={loveMapId}
              {...mapViewport(pinnedTodos)}
              clickableIcons={false}
              disableDefaultUI
              gestureHandling="cooperative"
              // Wheel scrolls the page, not the map, so no "ctrl + scroll" hint; touch still uses two fingers.
              scrollwheel={false}
              zoomControl
            >
              {pinnedTodos.map((todo) => (
                <AdvancedMarker
                  key={todo.id}
                  position={{
                    lat: todo.location.latitude,
                    lng: todo.location.longitude,
                  }}
                  title={todo.location.name}
                >
                  {/* Not fill-primary: the dark-theme primary is near white and would vanish on the map. */}
                  <Heart className="size-7 fill-(--brand-blue) text-white drop-shadow" />
                </AdvancedMarker>
              ))}
            </GoogleMap>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_42%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_42%),linear-gradient(145deg,var(--muted),var(--card))] p-6 text-center">
              <div className="flex size-16 items-center justify-center rounded-full border border-border bg-card text-primary shadow-sm">
                <MapPin className="size-8 fill-current" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {pinnedTodos.length === 0 ? "No places yet" : "Map pending"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isLoading
                    ? "Loading todo locations..."
                    : mapFailed
                      ? "Could not load Google Maps."
                      : "Add a Google Maps API key to show pins."}
                </p>
              </div>
            </div>
          )}
        </AspectRatio>
        <div className="flex flex-col gap-3 text-sm">
          <SummaryRow
            label="Pinned places"
            value={isLoading ? "Loading" : String(pinnedTodos.length)}
          />
          <Separator />
          <SummaryRow
            label="Completed visits"
            value={isLoading ? "Loading" : String(completedVisits)}
          />
        </div>
        <Button className="w-full rounded-full" variant="outline" asChild>
          <Link href="/twodo">
            Explore Todos
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

const wrapLongitude = (longitude: number) => ((longitude + 540) % 360) - 180;

// Default view only: the map is mounted after todos load, so it frames the pins once.
function mapViewport(todos: Todo[]) {
  const longitudes = todos
    .map((todo) => todo.location.longitude)
    .sort((a, b) => a - b);
  // The widest empty arc between neighbouring pins is the part to leave out, so the
  // frame takes the short way round, e.g. across the Pacific for Taiwan and the US.
  let gapEnd = 0;
  let widestGap = longitudes[0] + 360 - longitudes[longitudes.length - 1];
  for (let i = 1; i < longitudes.length; i++) {
    if (longitudes[i] - longitudes[i - 1] > widestGap) {
      widestGap = longitudes[i] - longitudes[i - 1];
      gapEnd = i;
    }
  }
  const west = longitudes[gapEnd];
  const east = longitudes[(gapEnd - 1 + longitudes.length) % longitudes.length];
  const center = wrapLongitude(west + (360 - widestGap) / 2);

  // One world wide, centred on the pins: no repeated worlds when zoomed out or dragged.
  const restriction = {
    latLngBounds: {
      north: 85,
      south: -85,
      west: wrapLongitude(center - 179.99),
      east: wrapLongitude(center + 179.99),
    },
    strictBounds: true,
  };

  const latitudes = todos.map((todo) => todo.location.latitude);
  if (todos.length === 1) {
    return {
      restriction,
      defaultCenter: { lat: latitudes[0], lng: center },
      defaultZoom: 7,
    };
  }

  return {
    restriction,
    defaultBounds: {
      north: Math.max(...latitudes),
      south: Math.min(...latitudes),
      east,
      west,
      padding: 48,
    },
  };
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between pb-3 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export { LoveMap };
