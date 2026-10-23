import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  decodeLandMask,
  greatCircle,
  isLand,
  orthoForward,
  orthoInverse,
  panCamera,
  sphericalCenter,
  wrapLon,
  zoomCamera,
  zoomLevelName,
} from "@/features/moments/globe";

const D2R = Math.PI / 180;
const camera = (lon: number, lat: number, radius: number) => ({
  lon,
  lat,
  radius,
});
// The mask is base64 of varints: per row a run count, then run lengths alternating water/land
const encode = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

describe("R25: orthoForward", () => {
  test("the camera center projects to the origin, facing the viewer", () => {
    const point = orthoForward(121.5, 25, camera(121.5, 25, 300));
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(0);
    expect(point.c).toBeCloseTo(1);
  });

  test("90° east on the equator lands on the right rim", () => {
    const point = orthoForward(90, 0, camera(0, 0, 300));
    expect(point.x).toBeCloseTo(300);
    expect(point.y).toBeCloseTo(0);
    expect(point.c).toBeCloseTo(0);
  });

  test("the north pole is up (positive y)", () => {
    const point = orthoForward(0, 90, camera(0, 0, 300));
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(300);
  });

  test("the antipode is on the far side (c < 0)", () => {
    expect(orthoForward(180, 0, camera(0, 0, 300)).c).toBeCloseTo(-1);
  });
});

describe("R25: orthoInverse", () => {
  test("the origin is the camera center", () => {
    const point = orthoInverse(0, 0, camera(10, 20, 300));
    expect(point?.lon).toBeCloseTo(10);
    expect(point?.lat).toBeCloseTo(20);
    expect(point?.c).toBeCloseTo(1);
  });

  test("outside the disc there is no point", () => {
    expect(orthoInverse(301, 0, camera(0, 0, 300))).toBeNull();
    expect(orthoInverse(250, 250, camera(0, 0, 300))).toBeNull();
  });

  test.each([
    [121.5, 25, camera(121.5, 25, 300)],
    [140, 35, camera(121.5, 25, 300)],
    [-74, 40.7, camera(-30, 30, 500)],
    [10, -60, camera(0, -20, 1000)],
  ])("inverts orthoForward for (%d, %d)", (lon, lat, cam) => {
    const { x, y } = orthoForward(lon, lat, cam);
    const back = orthoInverse(x, y, cam);
    expect(back?.lon).toBeCloseTo(lon, 6);
    expect(back?.lat).toBeCloseTo(lat, 6);
  });
});

describe("R26: panCamera", () => {
  test("at the minimum radius, dragging right moves the view west by dx/R radians", () => {
    expect(panCamera(camera(0, 0, 100), 100 * 10 * D2R, 0, 100)).toEqual({
      lon: expect.closeTo(-10, 6) as number,
      lat: 0,
      radius: 100,
    });
  });

  test("dragging down moves the view north", () => {
    const next = panCamera(camera(0, 0, 100), 0, 100 * 10 * D2R, 100);
    expect(next.lat).toBeCloseTo(10);
    expect(next.lon).toBeCloseTo(0);
  });

  test("longitude wraps across the antimeridian", () => {
    expect(
      panCamera(camera(175, 0, 100), -100 * 10 * D2R, 0, 100).lon,
    ).toBeCloseTo(-175);
  });

  test("latitude clamps at ±85", () => {
    expect(panCamera(camera(0, 80, 100), 0, 100 * 10 * D2R, 100).lat).toBe(85);
    expect(panCamera(camera(0, -80, 100), 0, -100 * 10 * D2R, 100).lat).toBe(
      -85,
    );
  });

  test("keeps the radius and does not mutate the camera", () => {
    const cam = camera(0, 0, 400);
    const next = panCamera(cam, 50, 50, 100);
    expect(next.radius).toBe(400);
    expect(cam).toEqual(camera(0, 0, 400));
  });
});

describe("R26: zoomCamera", () => {
  // Screen offsets from the globe center, y down; orthoForward's y is up
  test.each([
    [camera(121, 25, 300), 80, -50, 750],
    [camera(0, 0, 300), 100, 60, 660],
    [camera(121, 25, 3000), 120, -90, 30000],
    [camera(-30, 50, 400), -100, 100, 1000],
  ])("keeps the point under the pointer fixed (%#)", (cam, px, py, radius) => {
    const anchor = orthoInverse(px, -py, cam);
    const next = zoomCamera(cam, px, py, radius, 300);
    const moved = orthoForward(anchor?.lon ?? 0, anchor?.lat ?? 0, next);

    expect(next.radius).toBe(radius);
    expect(Math.abs(moved.x - px)).toBeLessThan(1);
    expect(Math.abs(-moved.y - py)).toBeLessThan(1);
  });

  test("zooming at the center keeps lon/lat", () => {
    const next = zoomCamera(camera(121.5, 25, 300), 0, 0, 900, 300);
    expect(next.lon).toBeCloseTo(121.5);
    expect(next.lat).toBeCloseTo(25);
    expect(next.radius).toBe(900);
  });

  test("clamps the radius to [minRadius, 3.2e6]", () => {
    expect(zoomCamera(camera(0, 0, 300), 0, 0, 1e9, 300).radius).toBe(3.2e6);
    expect(zoomCamera(camera(0, 0, 300), 0, 0, 10, 300).radius).toBe(300);
    expect(zoomCamera(camera(0, 0, 300), 0, 0, 3.2e6, 300).radius).toBe(3.2e6);
  });

  test("a pointer off the globe only changes the radius", () => {
    expect(zoomCamera(camera(10, 20, 300), 400, 400, 600, 300)).toEqual(
      camera(10, 20, 600),
    );
  });
});

describe("R25: greatCircle", () => {
  test("returns steps + 1 points from a to b", () => {
    const points = greatCircle({ lon: 0, lat: 0 }, { lon: 90, lat: 0 }, 2);
    expect(points).toHaveLength(3);
    expect(points[0].lon).toBeCloseTo(0);
    expect(points[1].lon).toBeCloseTo(45);
    expect(points[1].lat).toBeCloseTo(0);
    expect(points[2].lon).toBeCloseTo(90);
  });

  test("bulges toward the pole between two northern cities", () => {
    const taipei = { lon: 121.5, lat: 25 };
    const sf = { lon: -122.4, lat: 37.8 };
    const points = greatCircle(taipei, sf, 96);
    expect(points).toHaveLength(97);
    expect(points[0].lon).toBeCloseTo(121.5);
    expect(points[0].lat).toBeCloseTo(25);
    expect(points[96].lon).toBeCloseTo(-122.4);
    expect(points[96].lat).toBeCloseTo(37.8);
    expect(Math.max(...points.map((p) => p.lat))).toBeGreaterThan(45);
  });

  test("the same point twice gives that point every step", () => {
    const points = greatCircle({ lon: 10, lat: 20 }, { lon: 10, lat: 20 }, 4);
    expect(points).toHaveLength(5);
    points.forEach((p) => {
      expect(p.lon).toBeCloseTo(10);
      expect(p.lat).toBeCloseTo(20);
    });
  });
});

describe("R26: zoomLevelName", () => {
  const radiusFor = (metersPerPixel: number) => 6371000 / metersPerPixel;

  test.each([
    [100000, "Globe"],
    [12001, "Globe"],
    [11999, "Continent"],
    [2501, "Continent"],
    [2499, "Country"],
    [401, "Country"],
    [399, "City"],
    [41, "City"],
    [39, "Neighborhood"],
    [4.1, "Neighborhood"],
    [3.9, "Street"],
    [1, "Street"],
  ])("%d m/px is %s", (metersPerPixel, name) => {
    expect(zoomLevelName(radiusFor(metersPerPixel))).toBe(name);
  });

  test("the max radius 3.2e6 is Street", () => {
    expect(zoomLevelName(3.2e6)).toBe("Street");
  });
});

describe("R25: decodeLandMask / isLand", () => {
  // 4×2: row 0 = water, land, land, water; row 1 all water
  const mask = decodeLandMask({
    w: 4,
    h: 2,
    rle: encode([3, 1, 2, 1, 1, 4]),
  });

  test.each([
    [-45, 45, true],
    [45, 45, true],
    [-135, 45, false],
    [135, 45, false],
    [-45, -45, false],
    [45, -45, false],
  ])("(%d, %d) is land: %s", (lon, lat, land) => {
    expect(isLand(mask, lon, lat)).toBe(land);
  });

  test("wraps longitude outside -180…180", () => {
    expect(isLand(mask, 315, 45)).toBe(true);
    expect(isLand(mask, -315, 45)).toBe(true);
    expect(isLand(mask, 225, 45)).toBe(false);
  });

  test("the poles clamp to the first and last rows", () => {
    expect(isLand(mask, -45, 90)).toBe(true);
    expect(isLand(mask, -45, -90)).toBe(false);
  });

  test("decodes multi-byte run lengths and runs spanning whole bytes", () => {
    // 200×1: 130 water (varint 0x82 0x01), then 70 land
    const wide = decodeLandMask({ w: 200, h: 1, rle: encode([2, 130, 1, 70]) });
    expect(isLand(wide, 53, 0)).toBe(false);
    expect(isLand(wide, 55, 0)).toBe(true);
    expect(isLand(wide, 100, 0)).toBe(true);
    expect(isLand(wide, 179.9, 0)).toBe(true);
    expect(isLand(wide, -100, 0)).toBe(false);
  });

  test("the shipped mask puts Taipei and the Sahara on land, the Pacific in water", () => {
    const json = JSON.parse(
      readFileSync(
        join(process.cwd(), "public/moments/land-mask.json"),
        "utf8",
      ),
    ) as { w: number; h: number; rle: string };
    const world = decodeLandMask(json);
    expect(isLand(world, 121.0, 24.0)).toBe(true);
    expect(isLand(world, 10, 23)).toBe(true);
    expect(isLand(world, -150, 0)).toBe(false);
    expect(isLand(world, -30, 30)).toBe(false);
  });
});

describe("R25: sphericalCenter / wrapLon", () => {
  test("the center of two equator points is their midpoint", () => {
    const center = sphericalCenter([
      { lon: 0, lat: 0 },
      { lon: 90, lat: 0 },
    ]);
    expect(center.lon).toBeCloseTo(45);
    expect(center.lat).toBeCloseTo(0);
  });

  test("the center crosses the antimeridian the short way", () => {
    const center = sphericalCenter([
      { lon: 170, lat: 10 },
      { lon: -170, lat: 10 },
    ]);
    expect(Math.abs(center.lon)).toBeCloseTo(180);
    expect(center.lat).toBeGreaterThan(9);
  });

  test("one point is its own center", () => {
    const center = sphericalCenter([{ lon: 121.5, lat: 25 }]);
    expect(center.lon).toBeCloseTo(121.5);
    expect(center.lat).toBeCloseTo(25);
  });

  test.each([
    [0, 0],
    [180, -180],
    [-180, -180],
    [190, -170],
    [-190, 170],
    [540, -180],
    [359, -1],
  ])("wrapLon(%d) is %d", (lon, wrapped) => {
    expect(wrapLon(lon)).toBeCloseTo(wrapped);
  });
});

describe("R26: panCamera when zoomed in", () => {
  test("well past the minimum radius, a drag at 60° latitude moves twice as far in longitude", () => {
    const radius = 500;
    const dx = radius * 10 * D2R;
    expect(panCamera(camera(0, 60, radius), dx, 0, 100).lon).toBeCloseTo(-20);
  });

  test("the stretch is capped at 4× near the poles", () => {
    const radius = 500;
    const dx = radius * 10 * D2R;
    expect(panCamera(camera(0, 85, radius), dx, 0, 100).lon).toBeCloseTo(-40);
  });

  test("halfway there (radius 3× the minimum) it stretches halfway", () => {
    const radius = 300;
    const dx = radius * 10 * D2R;
    // t = (3 - 1) / 4 = 0.5, k = 1 + 0.5 × (2 - 1) = 1.5
    expect(panCamera(camera(0, 60, radius), dx, 0, 100).lon).toBeCloseTo(-15);
  });
});
