import { describe, expect, test } from "vitest";
import { parseMapLayer, tripRoute } from "@/features/moments/map-layers";
import type { Todo } from "@/features/two-dos/models/views";

const at = (name: string, latitude: number, longitude: number) => ({
  name,
  address: `${name} address`,
  placeId: `place-${name}`,
  latitude,
  longitude,
});

const stop = (
  id: string,
  location: ReturnType<typeof at> | null,
  status: boolean,
): Todo => ({
  id,
  images: [],
  title: id,
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: { name: "Teddy", imageUrl: null },
  location,
  updatedAt: "2026-01-01T00:00:00.000Z",
  doneAt: status ? "2026-01-02T00:00:00.000Z" : null,
  description: null,
  status,
  tripId: "trip1",
  priority: 1,
});

describe("R24: parseMapLayer", () => {
  const tripIds = ["trip1", "trip2"];

  test.each([
    [null, "notes"],
    ["", "notes"],
    ["notes", "notes"],
    ["inspiration", "inspiration"],
    ["unsorted", "unsorted"],
    ["trip1", "trip1"],
    ["trip2", "trip2"],
    ["trip3", "notes"],
    ["inspo", "notes"],
    ["INSPIRATION", "notes"],
    [" trip1", "notes"],
  ])("%j → %s", (value, layer) => {
    expect(parseMapLayer(value, tripIds)).toBe(layer);
  });

  test("a trip id with no trips loaded is notes", () => {
    expect(parseMapLayer("trip1", [])).toBe("notes");
  });
});

describe("R27: tripRoute", () => {
  const tokyo = at("Tokyo", 35.68, 139.69);
  const kyoto = at("Kyoto", 35.01, 135.77);
  const osaka = at("Osaka", 34.69, 135.5);
  const nara = at("Nara", 34.68, 135.8);

  test("joins consecutive located stops in the given order", () => {
    expect(
      tripRoute([
        stop("a", tokyo, true),
        stop("b", kyoto, true),
        stop("c", osaka, false),
        stop("d", nara, true),
      ]),
    ).toEqual([
      {
        from: { lon: 139.69, lat: 35.68 },
        to: { lon: 135.77, lat: 35.01 },
        solid: true,
      },
      {
        from: { lon: 135.77, lat: 35.01 },
        to: { lon: 135.5, lat: 34.69 },
        solid: false,
      },
      {
        from: { lon: 135.5, lat: 34.69 },
        to: { lon: 135.8, lat: 34.68 },
        solid: false,
      },
    ]);
  });

  test("skips stops without a location", () => {
    expect(
      tripRoute([
        stop("a", tokyo, true),
        stop("b", null, false),
        stop("c", kyoto, true),
      ]),
    ).toEqual([
      {
        from: { lon: 139.69, lat: 35.68 },
        to: { lon: 135.77, lat: 35.01 },
        solid: true,
      },
    ]);
  });

  test("keeps the given order, not a sorted one", () => {
    const route = tripRoute([stop("b", kyoto, false), stop("a", tokyo, false)]);
    expect(route).toHaveLength(1);
    expect(route[0].from).toEqual({ lon: 135.77, lat: 35.01 });
    expect(route[0].to).toEqual({ lon: 139.69, lat: 35.68 });
  });

  test.each([
    ["no stops", []],
    ["one located stop", [stop("a", tokyo, true)]],
    ["only unlocated stops", [stop("a", null, true), stop("b", null, true)]],
    [
      "one located among unlocated",
      [stop("a", null, false), stop("b", tokyo, true), stop("c", null, false)],
    ],
  ])("%s: no segments", (_, stops) => {
    expect(tripRoute(stops)).toEqual([]);
  });
});
