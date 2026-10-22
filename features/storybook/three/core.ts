import * as THREE from "three";

/* ---------- shared constants and helpers ---------- */
export const W = 1.0; // page width (spine to fore-edge)
export const D = 1.3; // page depth (head to foot)
export const TB = 0.02; // board thickness
export const HB = 0.034; // page-block thickness per side
export const Y0 = TB + HB; // hinge height at the spine
export const EPS = 0.0016; // spacing between stacked leaves
export const OVER = 0.022; // board overhang

export type Vec3 = [number, number, number];

export function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const hash3 = (x: number, y: number, z: number, s: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 13.37) * 43758.5453;
  return h - Math.floor(h);
};

/* Moves vertices by a position-keyed offset so seams stay closed: hand-folded, slightly uneven paper. */
export function jitter(
  geo: THREE.BufferGeometry,
  amt: number,
  seed = 1,
  keepBase = true,
) {
  const p = geo.attributes.position as THREE.BufferAttribute;
  let minY = Infinity;
  for (let i = 0; i < p.count; i++) minY = Math.min(minY, p.getY(i));
  for (let i = 0; i < p.count; i++) {
    const x = +p.getX(i).toFixed(5),
      y = +p.getY(i).toFixed(5),
      z = +p.getZ(i).toFixed(5);
    const base = keepBase && Math.abs(y - minY) < 1e-5;
    p.setXYZ(
      i,
      x + (hash3(x, y, z, seed) - 0.5) * 2 * amt,
      base ? y : y + (hash3(z, x, y, seed + 1) - 0.5) * 2 * amt,
      z + (hash3(y, z, x, seed + 2) - 0.5) * 2 * amt,
    );
  }
  p.needsUpdate = true;
  return geo;
}

/* Gives each triangle its own slightly different shade: the origami facet look. */
export function facets(
  geo: THREE.BufferGeometry,
  hex: THREE.ColorRepresentation,
  vary = 0.12,
  seed = 3,
) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const base = new THREE.Color(hex),
    r = rng(seed),
    c = new THREE.Color();
  const n = g.attributes.position.count,
    col = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (r() - 0.5) * 2 * vary;
    c.copy(base).multiplyScalar(k);
    for (let j = 0; j < 3; j++) {
      col[(i + j) * 3] = Math.min(1, c.r);
      col[(i + j) * 3 + 1] = Math.min(1, c.g);
      col[(i + j) * 3 + 2] = Math.min(1, c.b);
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Shared materials for one boot; the stage clears them so nothing outlives its renderer.
let MATS: Record<string, THREE.MeshStandardMaterial> = {};
export function resetMaterialCache() {
  MATS = {};
}
export function cachedMat(key: string, make: () => THREE.MeshStandardMaterial) {
  return (MATS[key] ??= make());
}
export function paperMat(
  key = "v",
  opts: THREE.MeshStandardMaterialParameters = {},
) {
  return cachedMat(key, () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.93,
      metalness: 0,
      flatShading: true,
      vertexColors: key === "v" || key === "v2",
      ...opts,
    });
    if (key === "v2") m.side = THREE.DoubleSide;
    return m;
  });
}

export interface PartOpts {
  j?: number;
  seed?: number;
  keepBase?: boolean;
  vary?: number;
  mat?: THREE.Material;
  double?: boolean;
  cast?: boolean;
  p?: Vec3;
  r?: Vec3;
  s?: Vec3;
}

/* One paper part: geometry → faceted, jittered, shadowed mesh. */
export function part(
  geo: THREE.BufferGeometry,
  hex: THREE.ColorRepresentation,
  o: PartOpts = {},
) {
  if (o.j !== 0) jitter(geo, o.j ?? 0.003, o.seed ?? 1, o.keepBase !== false);
  const g = facets(geo, hex, o.vary ?? 0.1, o.seed ?? 3);
  const m = new THREE.Mesh(g, o.mat || paperMat(o.double ? "v2" : "v"));
  m.castShadow = o.cast !== false;
  m.receiveShadow = true;
  if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
  if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
  if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
  return m;
}
export const G = {
  box: (w: number, h: number, d: number, sx = 1, sy = 1, sz = 1) =>
    new THREE.BoxGeometry(w, h, d, sx, sy, sz),
  cyl: (rt: number, rb: number, h: number, seg = 6, hs = 1) =>
    new THREE.CylinderGeometry(rt, rb, h, seg, hs),
  cone: (r: number, h: number, seg = 6, hs = 1) =>
    new THREE.ConeGeometry(r, h, seg, hs),
  ico: (r: number, det = 0) => new THREE.IcosahedronGeometry(r, det),
  dodec: (r: number) => new THREE.DodecahedronGeometry(r, 0),
};

export function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
export function ctx2d(c: HTMLCanvasElement) {
  const x = c.getContext("2d");
  if (!x) throw new Error("This browser cannot draw on a 2D canvas.");
  return x;
}
export function tex(
  c: HTMLCanvasElement,
  o: { repeat?: [number, number] } = {},
) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  if (o.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(o.repeat[0], o.repeat[1]);
  }
  return t;
}
/* Mild paper tooth laid over any canvas. */
export function grain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amt = 14,
  seed = 9,
) {
  const img = ctx.getImageData(0, 0, w, h),
    d = img.data,
    r = rng(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}
export function shade(hex: THREE.ColorRepresentation, k: number) {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return "#" + c.getHexString();
}
