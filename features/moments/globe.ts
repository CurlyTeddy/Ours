// Orthographic dot-globe math for the Moments map mode.
// Screen offsets are measured from the globe's center; x grows right, y grows up
// unless a function says it takes pointer (y-down) offsets.

interface GlobeCamera {
  lon: number;
  lat: number;
  radius: number;
}
interface LonLat {
  lon: number;
  lat: number;
}
interface LandMask {
  w: number;
  h: number;
  bits: Uint8Array;
}

const degrees = Math.PI / 180;
const earthRadiusMeters = 6371000;
const maxRadius = 3.2e6;

// Meters per pixel thresholds; finer than the last one is "Street".
const zoomLevels = [
  [12000, "Globe"],
  [2500, "Continent"],
  [400, "Country"],
  [40, "City"],
  [4, "Neighborhood"],
] as const;

type ZoomLevelName = (typeof zoomLevels)[number][1] | "Street";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

function orthoForward(lon: number, lat: number, camera: GlobeCamera) {
  const phi = lat * degrees;
  const phi0 = camera.lat * degrees;
  const dLambda = (lon - camera.lon) * degrees;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosPhi0 = Math.cos(phi0);
  const sinPhi0 = Math.sin(phi0);
  const cosDLambda = Math.cos(dLambda);
  return {
    x: camera.radius * cosPhi * Math.sin(dLambda),
    y: camera.radius * (cosPhi0 * sinPhi - sinPhi0 * cosPhi * cosDLambda),
    // > 0 on the visible hemisphere
    c: sinPhi0 * sinPhi + cosPhi0 * cosPhi * cosDLambda,
  };
}

function orthoInverse(x: number, y: number, camera: GlobeCamera) {
  const rho = Math.sqrt(x * x + y * y);
  if (rho > camera.radius) return null;
  if (rho < 1e-9) return { lon: camera.lon, lat: camera.lat, c: 1 };
  const phi0 = camera.lat * degrees;
  const sinC = rho / camera.radius;
  const cosC = Math.sqrt(Math.max(0, 1 - sinC * sinC));
  const phi = Math.asin(
    clamp(cosC * Math.sin(phi0) + (y * sinC * Math.cos(phi0)) / rho, -1, 1),
  );
  const lambda =
    camera.lon * degrees +
    Math.atan2(
      x * sinC,
      rho * cosC * Math.cos(phi0) - y * sinC * Math.sin(phi0),
    );
  return { lon: lambda / degrees, lat: phi / degrees, c: cosC };
}

// dx/dy are pointer (y-down) pixels. Zoomed in, a drag also stretches with latitude
// so the ground keeps up with the finger near the poles.
function panCamera(
  camera: GlobeCamera,
  dx: number,
  dy: number,
  minRadius: number,
): GlobeCamera {
  const t = clamp((camera.radius / minRadius - 1) / 4, 0, 1);
  const k = 1 + t * (1 / Math.max(Math.cos(camera.lat * degrees), 0.25) - 1);
  return {
    lon: wrapLon(camera.lon - (dx / camera.radius / degrees) * k),
    lat: clamp(camera.lat + dy / camera.radius / degrees, -85, 85),
    radius: camera.radius,
  };
}

// Zooms to `radius` keeping the ground under pointer offset (px, py) (y-down) fixed.
function zoomCamera(
  camera: GlobeCamera,
  px: number,
  py: number,
  radius: number,
  minRadius: number,
): GlobeCamera {
  let next = {
    lon: camera.lon,
    lat: camera.lat,
    radius: clamp(radius, minRadius, maxRadius),
  };
  const anchor = orthoInverse(px, -py, camera);
  if (!anchor) return next;
  // Panning is not exactly linear, so three passes settle the anchor under the pointer.
  for (let i = 0; i < 3; i++) {
    const q = orthoForward(anchor.lon, anchor.lat, next);
    if (q.c <= 0) break;
    next = panCamera(next, px - q.x, py + q.y, minRadius);
  }
  return next;
}

function toVector({ lon, lat }: LonLat) {
  const lambda = lon * degrees;
  const phi = lat * degrees;
  return [
    Math.cos(phi) * Math.cos(lambda),
    Math.cos(phi) * Math.sin(lambda),
    Math.sin(phi),
  ] as const;
}

function toLonLat(x: number, y: number, z: number): LonLat {
  const length = Math.sqrt(x * x + y * y + z * z) || 1;
  return {
    lon: Math.atan2(y, x) / degrees,
    lat: Math.asin(clamp(z / length, -1, 1)) / degrees,
  };
}

// Points along the shortest arc from a to b, both ends included (steps + 1 points).
function greatCircle(a: LonLat, b: LonLat, steps: number): LonLat[] {
  const A = toVector(a);
  const B = toVector(b);
  const omega = Math.acos(
    clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1),
  );
  const sinOmega = Math.sin(omega);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    // Nearly identical points: plain interpolation avoids dividing by ~0.
    const k1 = sinOmega < 1e-6 ? 1 - t : Math.sin((1 - t) * omega) / sinOmega;
    const k2 = sinOmega < 1e-6 ? t : Math.sin(t * omega) / sinOmega;
    return toLonLat(
      k1 * A[0] + k2 * B[0],
      k1 * A[1] + k2 * B[1],
      k1 * A[2] + k2 * B[2],
    );
  });
}

function sphericalCenter(points: LonLat[]): LonLat {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of points) {
    const v = toVector(point);
    x += v[0];
    y += v[1];
    z += v[2];
  }
  return toLonLat(x, y, z);
}

function zoomLevelName(radius: number): ZoomLevelName {
  const metersPerPixel = earthRadiusMeters / radius;
  return (
    zoomLevels.find(([threshold]) => metersPerPixel > threshold)?.[1] ??
    "Street"
  );
}

function setRun(bits: Uint8Array, start: number, end: number) {
  let a = start;
  while (a < end && a & 7) {
    bits[a >> 3] |= 1 << (a & 7);
    a++;
  }
  const fullBytes = (end - a) >> 3;
  if (fullBytes > 0) {
    bits.fill(255, a >> 3, (a >> 3) + fullBytes);
    a += fullBytes << 3;
  }
  while (a < end) {
    bits[a >> 3] |= 1 << (a & 7);
    a++;
  }
}

// Each row: a varint run count, then varint run lengths alternating ocean, land, ocean…
function decodeLandMask(json: { w: number; h: number; rle: string }): LandMask {
  const binary = atob(json.rle);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  let position = 0;
  const readVarint = () => {
    let value = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = bytes[position++];
      value += (byte & 127) * 2 ** shift;
      shift += 7;
    } while (byte & 128);
    return value;
  };

  const bits = new Uint8Array(Math.ceil((json.w * json.h) / 8));
  for (let row = 0; row < json.h; row++) {
    const runs = readVarint();
    const base = row * json.w;
    let column = 0;
    for (let k = 0; k < runs; k++) {
      const length = readVarint();
      if (k & 1) setRun(bits, base + column, base + column + length);
      column += length;
    }
  }
  return { w: json.w, h: json.h, bits };
}

function isLand(mask: LandMask, lon: number, lat: number): boolean {
  const column = Math.min(
    Math.floor((((((lon + 180) % 360) + 360) % 360) / 360) * mask.w),
    mask.w - 1,
  );
  const row = clamp(Math.floor(((90 - lat) / 180) * mask.h), 0, mask.h - 1);
  const index = row * mask.w + column;
  return ((mask.bits[index >> 3] >> (index & 7)) & 1) === 1;
}

export {
  clamp,
  earthRadiusMeters,
  maxRadius,
  orthoForward,
  orthoInverse,
  panCamera,
  zoomCamera,
  greatCircle,
  sphericalCenter,
  zoomLevelName,
  decodeLandMask,
  isLand,
  wrapLon,
};
export type { GlobeCamera, LandMask, LonLat, ZoomLevelName };
