import type { LonLat } from "@/features/moments/globe";
import type { ListKey } from "@/features/two-dos/lists";
import type { Todo } from "@/features/two-dos/models/views";

// Notes, or one of the Two Do lists
type MapLayer = "notes" | ListKey;

function parseMapLayer(value: string | null, tripIds: string[]): MapLayer {
  if (value === "inspiration" || value === "unsorted") return value;
  return value !== null && tripIds.includes(value) ? value : "notes";
}

// Segments between consecutive stops that have a place; stops without one are skipped.
function tripRoute(
  stops: Todo[],
): { from: LonLat; to: LonLat; solid: boolean }[] {
  const located = stops.flatMap((stop) =>
    stop.location
      ? [
          {
            point: {
              lon: stop.location.longitude,
              lat: stop.location.latitude,
            },
            done: stop.status,
          },
        ]
      : [],
  );
  return located.slice(1).map((stop, index) => ({
    from: located[index].point,
    to: stop.point,
    solid: located[index].done && stop.done,
  }));
}

export { parseMapLayer, tripRoute };
export type { MapLayer };
