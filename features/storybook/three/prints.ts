/* =====================================================================
   PRINTED PAPER — the ground each pop-up stands on, the cloth covers,
   page edges and the tabletop. All drawn once into canvases.
   Spread canvas: 2048 × 1332 px ↔ X ∈ [−1, 1], Z ∈ [−0.65 (head), 0.65 (foot)].
   ===================================================================== */
import * as THREE from "three";
import { corben, gaegu, nunito } from "@/components/ui/storybook-fonts";
import { STORY } from "@/features/storybook/story";
import {
  D,
  canvas,
  ctx2d,
  clamp,
  grain,
  lerp,
  rng,
} from "@/features/storybook/three/core";

type Rand = () => number;
type Pt = [number, number];

const PX = 1024;
const toX = (x: number) => x / PX - 1,
  toZ = (y: number) => (y / 1332) * D - D / 2;
function hexVary(hex: string, r: Rand, amt: number) {
  const c = new THREE.Color(hex).multiplyScalar(1 + (r() - 0.5) * 2 * amt);
  return "#" + c.getHexString();
}
function mixHex(a: string, b: string, t: number) {
  return (
    "#" + new THREE.Color(a).lerp(new THREE.Color(b), clamp(t)).getHexString()
  );
}
function distSeg(px: number, pz: number, a: Pt, b: Pt) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz));
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}
function distPoly(px: number, pz: number, pts: Pt[]) {
  let m = Infinity;
  for (let i = 0; i < pts.length - 1; i++)
    m = Math.min(m, distSeg(px, pz, pts[i], pts[i + 1]));
  return m;
}

/* Jittered triangle mesh painted by a colour field: folded-paper facets. */
function triField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cell: number,
  colorAt: (X: number, Z: number, r: Rand) => string,
  seed: number,
) {
  const r = rng(seed),
    nx = Math.ceil(w / cell) + 1,
    ny = Math.ceil(h / cell) + 1,
    pts: Pt[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
      pts.push([
        i * cell + (edge ? 0 : (r() - 0.5) * cell * 0.75),
        j * cell + (edge ? 0 : (r() - 0.5) * cell * 0.75),
      ]);
    }
  ctx.lineWidth = 1.2;
  ctx.lineJoin = "round";
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = pts[j * nx + i],
        b = pts[j * nx + i + 1],
        c = pts[(j + 1) * nx + i],
        d = pts[(j + 1) * nx + i + 1];
      const tris =
        r() > 0.5
          ? [
              [a, b, d],
              [a, d, c],
            ]
          : [
              [a, b, c],
              [b, d, c],
            ];
      for (const t of tris) {
        const cx = (t[0][0] + t[1][0] + t[2][0]) / 3,
          cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
        const col = colorAt(toX(cx), toZ(cy), r);
        ctx.fillStyle = ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.moveTo(t[0][0], t[0][1]);
        ctx.lineTo(t[1][0], t[1][1]);
        ctx.lineTo(t[2][0], t[2][1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
}
function finishSpread(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(PX - 90, 0, PX + 90, 0);
  g.addColorStop(0, "rgba(70,45,25,0)");
  g.addColorStop(0.5, "rgba(70,45,25,.2)");
  g.addColorStop(1, "rgba(70,45,25,0)");
  ctx.fillStyle = g;
  ctx.fillRect(PX - 90, 0, 180, 1332);
  ctx.strokeStyle = "rgba(255,255,255,.35)";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 2038, 1322);
  grain(ctx, 2048, 1332, 10, 4);
}

export const PRINTS = {
  spring() {
    const c = canvas(2048, 1332),
      x = ctx2d(c);
    const path: Pt[] = [
      [0.06, 0.7],
      [0.02, 0.42],
      [-0.08, 0.2],
      [-0.26, 0.02],
      [-0.46, -0.18],
      [-0.58, -0.42],
      [-0.62, -0.7],
    ];
    triField(
      x,
      2048,
      1332,
      58,
      (X, Z, r) => {
        const d = distPoly(X, Z, path),
          w = lerp(0.05, 0.1, (Z + 0.65) / 1.3);
        if (d < w) return hexVary("#efe1c2", r, 0.04);
        if (d < w + 0.018) return hexVary("#dfd0ab", r, 0.04);
        if (r() < 0.035)
          return hexVary(r() > 0.5 ? "#f4b8c6" : "#fbe7ec", r, 0.03);
        return hexVary(mixHex("#79ad62", "#93c47a", (Z + 0.65) / 1.3), r, 0.07);
      },
      11,
    );
    finishSpread(x);
    return c;
  },
  lake() {
    const c = canvas(2048, 1332),
      x = ctx2d(c);
    triField(
      x,
      2048,
      1332,
      56,
      (X, Z, r) => {
        const e = Math.hypot(X / 0.64, (Z + 0.12) / 0.33);
        if (e < 0.78)
          return hexVary(mixHex("#6fa9c4", "#8cc3d8", e / 0.78), r, 0.05);
        if (e < 1)
          return hexVary(
            mixHex("#8cc3d8", "#a9d3e0", (e - 0.78) / 0.22),
            r,
            0.04,
          );
        if (e < 1.12) return hexVary("#efdcb3", r, 0.04);
        return hexVary(mixHex("#76ad60", "#8dc073", (Z + 0.65) / 1.3), r, 0.07);
      },
      12,
    );
    finishSpread(x);
    return c;
  },
  sunset() {
    const c = canvas(2048, 1332),
      x = ctx2d(c);
    triField(
      x,
      2048,
      1332,
      56,
      (X, Z, r) => {
        if (Z < -0.06) {
          const glow =
            Math.abs(X + 0.4) < 0.05 + (Z + 0.65) * 0.14 && r() > 0.25;
          if (glow) return hexVary("#f3c27a", r, 0.06);
          return hexVary(
            mixHex("#7f95c2", "#c49ab6", (Z + 0.65) / 0.6),
            r,
            0.06,
          );
        }
        if (Z < 0.0) return hexVary("#f6e8dc", r, 0.03);
        return hexVary(mixHex("#e9cda0", "#f1dab3", Z / 0.65), r, 0.05);
      },
      13,
    );
    finishSpread(x);
    return c;
  },
};

/* Cloth-bound cover with a paper label and a folded-mountain motif. */
function clothBase(
  x: CanvasRenderingContext2D,
  w: number,
  h: number,
  spineLeft: boolean,
) {
  x.fillStyle = "#3e5878";
  x.fillRect(0, 0, w, h);
  const r = rng(77);
  for (let i = 0; i < h; i += 3) {
    x.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`;
    x.fillRect(0, i, w, 1);
  }
  for (let i = 0; i < w; i += 3) {
    x.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.03})`;
    x.fillRect(i, 0, 1, h);
  }
  const sx = spineLeft ? 0 : w - 64,
    g = x.createLinearGradient(sx, 0, sx + 64, 0);
  g.addColorStop(spineLeft ? 0 : 1, "rgba(10,20,35,.38)");
  g.addColorStop(spineLeft ? 1 : 0, "rgba(10,20,35,0)");
  x.fillStyle = g;
  x.fillRect(sx, 0, 64, h);
  x.fillStyle = "rgba(10,20,35,.25)";
  x.fillRect(spineLeft ? 70 : w - 76, 0, 6, h);
}
function roundRect(
  x: CanvasRenderingContext2D,
  a: number,
  b: number,
  w: number,
  h: number,
  r: number,
) {
  x.beginPath();
  x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r);
  x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r);
  x.arcTo(a, b, a + w, b, r);
  x.closePath();
}

export function coverCanvas() {
  const w = 1024,
    h = 1346,
    c = canvas(w, h),
    x = ctx2d(c);
  clothBase(x, w, h, true);
  const lx = 190,
    ly = 210,
    lw = 700,
    lh = 860;
  x.fillStyle = "rgba(0,0,0,.22)";
  roundRect(x, lx + 8, ly + 12, lw, lh, 26);
  x.fill();
  x.fillStyle = "#f3ecdf";
  roundRect(x, lx, ly, lw, lh, 26);
  x.fill();
  x.strokeStyle = "#e9d3a6";
  x.lineWidth = 6;
  roundRect(x, lx + 22, ly + 22, lw - 44, lh - 44, 16);
  x.stroke();
  // folded mountain + lake motif
  const mx = lx + lw / 2,
    base = ly + 520;
  const peaks: [number, number, string][] = [
    [mx - 190, 150, "#7fb46a"],
    [mx + 150, 120, "#86bb70"],
    [mx - 20, 230, "#6ea35c"],
  ];
  for (const [px, ph, col] of peaks) {
    const L = px - ph * 1.2,
      R = px + ph * 1.2;
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(L, base);
    x.lineTo(px, base - ph);
    x.lineTo(R, base);
    x.closePath();
    x.fill();
    x.fillStyle = "rgba(0,0,0,.12)";
    x.beginPath();
    x.moveTo(px, base - ph);
    x.lineTo(R, base);
    x.lineTo(px + ph * 0.15, base);
    x.closePath();
    x.fill();
  }
  x.fillStyle = "#8cc3d8";
  x.beginPath();
  x.ellipse(mx, base + 26, 230, 30, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#f5f2ec";
  x.beginPath();
  x.moveTo(mx - 40, base + 16);
  x.lineTo(mx - 8, base + 16);
  x.lineTo(mx - 24, base - 10);
  x.closePath();
  x.fill();
  x.fillStyle = "#e2606b";
  x.beginPath();
  const hx = mx + 110,
    hy = base - 190;
  x.moveTo(hx, hy + 16);
  x.bezierCurveTo(hx - 26, hy, hx - 18, hy - 22, hx, hy - 10);
  x.bezierCurveTo(hx + 18, hy - 22, hx + 26, hy, hx, hy + 16);
  x.fill();
  x.textAlign = "center";
  x.fillStyle = "#26385a";
  x.font = `400 82px ${corben.style.fontFamily}, Georgia, serif`;
  x.fillText(STORY.book.title, mx, ly + 690);
  x.fillStyle = "#7a6a5d";
  x.font = `400 46px ${gaegu.style.fontFamily}, "Comic Sans MS", cursive`;
  x.fillText(STORY.book.subtitle, mx, ly + 760);
  x.fillStyle = "#e9d3a6";
  x.font = `700 30px ${nunito.style.fontFamily}, system-ui, sans-serif`;
  x.letterSpacing = "10px";
  x.fillText(STORY.book.volume.toUpperCase(), mx + 30, h - 120);
  grain(x, w, h, 8, 6);
  return c;
}
export function backCanvas() {
  const w = 1024,
    h = 1346,
    c = canvas(w, h),
    x = ctx2d(c);
  clothBase(x, w, h, false);
  const mx = w / 2 - 30,
    my = 560;
  x.strokeStyle = "#e9d3a6";
  x.lineWidth = 8;
  x.lineJoin = "round";
  x.beginPath();
  x.moveTo(mx, my + 70);
  x.bezierCurveTo(mx - 120, my, mx - 80, my - 95, mx, my - 45);
  x.bezierCurveTo(mx + 80, my - 95, mx + 120, my, mx, my + 70);
  x.stroke();
  x.textAlign = "center";
  x.fillStyle = "#e9d3a6";
  x.font = `400 72px ${gaegu.style.fontFamily}, "Comic Sans MS", cursive`;
  x.fillText(STORY.ending.backLine, mx, my + 220);
  x.font = `700 26px ${nunito.style.fontFamily}, system-ui, sans-serif`;
  x.fillText(STORY.ending.backSmall.toUpperCase(), mx, h - 130);
  grain(x, w, h, 8, 8);
  return c;
}
export function edgeCanvas() {
  const c = canvas(64, 64),
    x = ctx2d(c);
  x.fillStyle = "#f2ebdd";
  x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 4) {
    x.fillStyle = "rgba(150,125,95,.35)";
    x.fillRect(0, i, 64, 1);
  }
  return c;
}
export function tableCanvas() {
  const c = canvas(1024, 1024),
    x = ctx2d(c),
    r = rng(31);
  x.fillStyle = "#dccbb1";
  x.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 260; i++) {
    const y = r() * 1024,
      a = 0.02 + r() * 0.05;
    x.strokeStyle =
      r() > 0.5 ? `rgba(120,90,60,${a})` : `rgba(255,250,240,${a})`;
    x.lineWidth = 1 + r() * 3;
    x.beginPath();
    x.moveTo(0, y);
    for (let k = 0; k <= 8; k++)
      x.lineTo(k * 128, y + Math.sin(k + i) * 6 * r());
    x.stroke();
  }
  grain(x, 1024, 1024, 10, 3);
  return c;
}
export function radialCanvas(
  inner: string,
  outer: string,
  size = 256,
  a = 0.55,
  b = 1,
) {
  const c = canvas(size, size),
    x = ctx2d(c),
    g = x.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
  g.addColorStop(0, inner);
  g.addColorStop(a, inner);
  g.addColorStop(b, outer);
  if (b < 1) g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}
