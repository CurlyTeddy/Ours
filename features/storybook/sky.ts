/* =====================================================================
   SKY — the website background behind the book. One layer per moment
   (intro, each chapter, ending), crossfaded with the book's progress.
   Items are folded-paper SVGs placed in viewport % and moved with the
   camera, so they slide in as it lowers and drift as it swings.
   k: sun | moon | cloud | birds | balloon | stars | petals
   x, y: viewport %; s: size in vmin; d: depth 0..1 (more = more parallax)
   drift: sideways travel through the chapter; sink: % the item sinks
   SVG markup stays as strings: it is image data injected into the sky host, not UI.
   ===================================================================== */
import { clamp, rng, shade, smooth } from "@/features/storybook/three/core";

interface Tone {
  cloud: [string, string, string];
  shadow: string;
  bird: string;
  sun: [string, string, string];
  glow: string;
  star: string;
}
const SKY_TONES: Record<"spring" | "lake" | "sunset" | "end", Tone> = {
  spring: {
    cloud: ["#ffffff", "#f3eff3", "#dbd8e4"],
    shadow: "rgba(120,100,140,.12)",
    bird: "#6d5f73",
    sun: ["#ffe39a", "#f8cc6e", "#fff3c9"],
    glow: "rgba(255,236,190,.7)",
    star: "#ffffff",
  },
  lake: {
    cloud: ["#ffffff", "#ecf2f7", "#d0dce6"],
    shadow: "rgba(70,100,130,.12)",
    bird: "#4f6274",
    sun: ["#ffe08a", "#f7c65a", "#fff2c2"],
    glow: "rgba(255,240,200,.75)",
    star: "#ffffff",
  },
  sunset: {
    cloud: ["#ffe6d8", "#f4bcb5", "#c193b1"],
    shadow: "rgba(90,50,90,.14)",
    bird: "#4a3550",
    sun: ["#ffcf73", "#f5994a", "#ffe3a0"],
    glow: "rgba(255,196,126,.8)",
    star: "#fff6d8",
  },
  end: {
    cloud: ["#f5f8fb", "#e1e9ef", "#c6d3df"],
    shadow: "rgba(60,85,110,.12)",
    bird: "#5a6f84",
    sun: ["#f8f4ea", "#e5ded0", "#fffdf6"],
    glow: "rgba(255,255,255,.6)",
    star: "#ffffff",
  },
};

type Stop = [number, string];
export type SkyGrad =
  | {
      type: "radial";
      at: [number, number];
      size: [number, number];
      stops: Stop[];
    }
  | { type: "linear"; stops: Stop[] };
type SkyItemDef =
  | {
      k: "sun" | "cloud" | "birds" | "balloon";
      x: number;
      y: number;
      s: number;
      d: number;
      drift?: number;
      sink?: number;
    }
  | { k: "stars"; n: number; top: number; fade?: boolean }
  | { k: "petals"; n: number };
interface SkyDef {
  tone?: keyof typeof SKY_TONES;
  grad: SkyGrad;
  items: SkyItemDef[];
}

export const SKIES: SkyDef[] = [
  {
    grad: {
      type: "radial",
      at: [50, 40],
      size: [120, 90],
      stops: [
        [0, "#f4ede3"],
        [55, "#e9e0d3"],
        [100, "#d9ccbb"],
      ],
    },
    items: [],
  },
  {
    tone: "spring",
    grad: {
      type: "linear",
      stops: [
        [0, "#b9d6ec"],
        [40, "#ecdbe6"],
        [66, "#f7e4e0"],
        [100, "#efe3d8"],
      ],
    },
    items: [
      { k: "sun", x: 79, y: 15, s: 21, d: 0.95 },
      { k: "cloud", x: 11, y: 21, s: 26, d: 0.8, drift: 1 },
      { k: "cloud", x: 36, y: 31, s: 17, d: 0.9, drift: 0.6 },
      { k: "cloud", x: 64, y: 27, s: 22, d: 0.7, drift: 1.2 },
      { k: "cloud", x: 92, y: 34, s: 24, d: 0.6, drift: 0.8 },
      { k: "cloud", x: 25, y: 43, s: 19, d: 0.5, drift: 1.1 },
      { k: "birds", x: 31, y: 15, s: 7, d: 0.9, drift: 1.6 },
      { k: "birds", x: 56, y: 20, s: 5, d: 0.8, drift: 1.4 },
      { k: "petals", n: 18 },
    ],
  },
  {
    tone: "lake",
    grad: {
      type: "linear",
      stops: [
        [0, "#8fc1e5"],
        [45, "#c7e1f2"],
        [74, "#e7efee"],
        [100, "#efebe2"],
      ],
    },
    items: [
      { k: "sun", x: 16, y: 13, s: 23, d: 0.95 },
      { k: "cloud", x: 8, y: 33, s: 30, d: 0.7, drift: 1 },
      { k: "cloud", x: 27, y: 25, s: 22, d: 0.85, drift: 0.7 },
      { k: "cloud", x: 68, y: 21, s: 19, d: 1, drift: 1.1 },
      { k: "cloud", x: 88, y: 28, s: 28, d: 0.7, drift: 0.9 },
      { k: "cloud", x: 52, y: 39, s: 18, d: 0.55, drift: 1.2 },
      { k: "balloon", x: 78, y: 16, s: 11, d: 0.8, drift: 0.7 },
      { k: "birds", x: 45, y: 23, s: 7, d: 0.9, drift: 1.5 },
      { k: "birds", x: 70, y: 31, s: 5, d: 0.7, drift: 1.3 },
    ],
  },
  {
    tone: "sunset",
    grad: {
      type: "linear",
      stops: [
        [0, "#6b5a9b"],
        [34, "#b5799f"],
        [58, "#ea9883"],
        [78, "#f7cc96"],
        [100, "#f1dcc2"],
      ],
    },
    items: [
      { k: "stars", n: 30, top: 34, fade: true },
      { k: "sun", x: 30, y: 42, s: 36, d: 0.95, sink: 13 },
      { k: "cloud", x: 10, y: 29, s: 28, d: 0.7, drift: 1 },
      { k: "cloud", x: 57, y: 25, s: 21, d: 0.85, drift: 0.7 },
      { k: "cloud", x: 76, y: 35, s: 30, d: 0.65, drift: 1.1 },
      { k: "cloud", x: 93, y: 17, s: 20, d: 0.9, drift: 0.8 },
      { k: "birds", x: 42, y: 30, s: 6, d: 0.8, drift: 1.6 },
      { k: "birds", x: 62, y: 24, s: 5, d: 0.7, drift: 1.4 },
    ],
  },
  {
    tone: "end",
    grad: {
      type: "radial",
      at: [50, 42],
      size: [90, 75],
      stops: [
        [0, "#d3dee8"],
        [55, "#aac0d1"],
        [100, "#88a2b8"],
      ],
    },
    items: [
      { k: "stars", n: 26, top: 55 },
      { k: "sun", x: 82, y: 14, s: 16, d: 0.9 },
      { k: "cloud", x: 10, y: 25, s: 26, d: 0.7, drift: 0.8 },
      { k: "cloud", x: 73, y: 60, s: 32, d: 0.6, drift: 1 },
      { k: "cloud", x: 29, y: 79, s: 24, d: 0.5, drift: 1.1 },
    ],
  },
];

/* ---------- folded-paper SVGs ---------- */
let SVG_ID = 0;
type P2 = [number, number];
const svgWrap = (vb: string, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%">${inner}</svg>`;
const pts = (a: P2[]) =>
  a.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
const tri = (a: P2, b: P2, c: P2, col: string) =>
  `<polygon points="${pts([a, b, c])}" fill="${col}" stroke="${col}" stroke-width=".5" stroke-linejoin="round"/>`;

function cloudSVG(T: Tone, seed: number) {
  const r = rng(seed),
    blobs = [
      [34, 36, 18],
      [58, 27, 22],
      [82, 34, 17],
      [101, 40, 11],
      [15, 42, 11],
    ];
  let s = `<ellipse cx="60" cy="53" rx="50" ry="4.5" fill="${T.shadow}"/>`;
  for (const [cx, cy, R] of blobs) {
    const n = 7,
      rot = r() * 6.28,
      p: P2[] = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * 6.283,
        rr = R * (1 + (r() - 0.5) * 0.16);
      p.push([cx + Math.cos(a) * rr, Math.min(cy + Math.sin(a) * rr, 48)]);
    }
    for (let i = 0; i < n; i++) {
      const a = p[i],
        b = p[(i + 1) % n],
        l = Math.cos(
          Math.atan2((a[1] + b[1]) / 2 - cy, (a[0] + b[0]) / 2 - cx) + 2.36,
        );
      s += tri([cx, cy], a, b, T.cloud[l > 0.3 ? 0 : l > -0.4 ? 1 : 2]);
    }
  }
  return svgWrap("0 0 120 60", s);
}
function discSVG(T: Tone) {
  const id = "sg" + SVG_ID++;
  let s = `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${T.glow}"/><stop offset=".35" stop-color="${T.glow}"/><stop offset="1" stop-color="${T.glow}" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#${id})"/>`;
  const ring = (n: number, R: number, cols: string[], rot: number) => {
    const p: P2[] = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * 6.283;
      p.push([50 + Math.cos(a) * R, 50 + Math.sin(a) * R]);
    }
    for (let i = 0; i < n; i++)
      s += tri([50, 50], p[i], p[(i + 1) % n], cols[i % 2]);
  };
  ring(12, 24, [T.sun[0], T.sun[1]], 0.2);
  ring(8, 13, [T.sun[2], T.sun[0]], 0.5);
  return svgWrap("0 0 100 100", s);
}
function starSVG(col: string) {
  return svgWrap(
    "0 0 20 20",
    `<polygon points="10,0 12.4,7.6 20,10 12.4,12.4 10,20 7.6,12.4 0,10 7.6,7.6" fill="${col}"/>`,
  );
}
function birdsSVG(T: Tone, seed: number) {
  const r = rng(seed);
  let s = "";
  for (const [x, y, k] of [
    [14, 14, 1],
    [32, 8, 0.8],
    [46, 18, 0.65],
  ]) {
    const w = 11 * k,
      dy = (r() - 0.5) * 3;
    s +=
      tri([x - w, y - 4 * k + dy], [x, y], [x - 2 * k, y + 2.5 * k], T.bird) +
      tri(
        [x + w, y - 4 * k - dy],
        [x, y],
        [x + 2 * k, y + 2.5 * k],
        shade(T.bird, 1.35),
      );
  }
  return svgWrap("0 0 60 30", s);
}
function balloonSVG() {
  const id = "bc" + SVG_ID++,
    env =
      "M30 4C52 4 58 24 54 38C50 52 38 60 34 66L26 66C22 60 10 52 6 38C2 24 8 4 30 4Z";
  const cols = ["#f28c7a", "#f7d070", "#fff4e6", "#8fb8d8", "#f28c7a"];
  let s = `<defs><clipPath id="${id}"><path d="${env}"/></clipPath></defs><g clip-path="url(#${id})">`;
  cols.forEach((c, i) => {
    s += `<rect x="${i * 12}" y="0" width="12" height="70" fill="${c}"/><polygon points="${i * 12 + 6},0 ${i * 12 + 12},0 ${i * 12 + 12},70 ${i * 12 + 6},70" fill="rgba(60,40,60,.09)"/>`;
  });
  s += `</g><path d="M27 66L25.5 76M33 66L34.5 76" stroke="#8a6a55" stroke-width="1"/><rect x="24.5" y="76" width="11" height="8" fill="#b98a5e"/><rect x="24.5" y="76" width="5.5" height="8" fill="#a5784e"/>`;
  return svgWrap("0 0 60 90", s);
}

export function skyCSS(g: SkyGrad) {
  const st = g.stops.map(([p, c]) => `${c} ${p}%`).join(",");
  return g.type === "radial"
    ? `radial-gradient(${g.size[0]}% ${g.size[1]}% at ${g.at[0]}% ${g.at[1]}%,${st})`
    : `linear-gradient(180deg,${st})`;
}
function paintGrad(
  ctx: CanvasRenderingContext2D,
  g: SkyGrad,
  w: number,
  h: number,
) {
  if (g.type === "radial") {
    const cx = (g.at[0] / 100) * w,
      cy = (g.at[1] / 100) * h,
      rx = (g.size[0] / 100) * w,
      ry = (g.size[1] / 100) * h;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.stops.forEach(([p, c]) => gr.addColorStop(p / 100, c));
    ctx.fillStyle = gr;
    ctx.fillRect(-cx, (-cy * rx) / ry, w, (h * rx) / ry);
    ctx.restore();
  } else {
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    g.stops.forEach(([p, c]) => gr.addColorStop(p / 100, c));
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
  }
}

export interface SkyView {
  azim: number;
  elev: number;
}
interface SkyItem {
  el: HTMLDivElement;
  svg: string;
  ratio: number;
  d: number;
  x: number;
  y: number;
  s: number;
  drift: number;
  sink: number;
  w: number;
  h: number;
  fade?: boolean;
  fall?: number;
  spin?: number;
  lastO?: string;
}
export interface SkyLayer {
  el: HTMLDivElement;
  items: SkyItem[];
  def: SkyDef;
  view: SkyView;
  op: number;
  t0: number;
  t1: number;
}

/* views: per layer, the camera azimuth/elevation it is composed for.
   Class names are plain strings; the storybook stylesheet styles them only inside the sky host. */
export function buildSky(
  host: HTMLElement,
  envIdx: number[],
  views: SkyView[],
) {
  const layers: SkyLayer[] = envIdx.map((ei, j) => {
    const def = SKIES[ei],
      T = SKY_TONES[def.tone || "spring"],
      el = document.createElement("div");
    el.className = "bg" + (j ? "" : " first");
    el.style.background = skyCSS(def.grad);
    host.appendChild(el);
    const r = rng(100 + ei),
      items: SkyItem[] = [];
    const add = (
      spec: {
        x: number;
        y: number;
        s: number;
        d?: number;
        drift?: number;
        sink?: number;
      },
      svg: string,
      ratio: number,
      extra: {
        cls?: "twinkle" | "petal";
        wrap?: boolean;
        fade?: boolean;
        dl?: number;
        fall?: number;
        spin?: number;
        col?: string;
      } = {},
    ) => {
      const d = document.createElement("div");
      d.className = "sk" + (extra.cls ? " " + extra.cls : "");
      d.innerHTML = extra.wrap ? `<i>${svg}</i>` : svg;
      el.appendChild(d);
      if (extra.dl != null)
        d.style.setProperty("--dl", extra.dl.toFixed(2) + "s");
      if (extra.col) d.style.setProperty("--c", extra.col);
      items.push({
        el: d,
        svg,
        ratio,
        d: spec.d ?? 0.8,
        x: spec.x,
        y: spec.y,
        s: spec.s,
        drift: spec.drift || 0,
        sink: spec.sink || 0,
        w: 0,
        h: 0,
        fade: extra.fade,
        fall: extra.fall,
        spin: extra.spin,
      });
    };
    for (const it of def.items) {
      if (it.k === "cloud") add(it, cloudSVG(T, Math.floor(r() * 1e6)), 0.5);
      else if (it.k === "sun") add(it, discSVG(T), 1);
      else if (it.k === "birds")
        add(it, birdsSVG(T, Math.floor(r() * 1e6)), 0.5);
      else if (it.k === "balloon") add(it, balloonSVG(), 1.5);
      else if (it.k === "stars")
        for (let i = 0; i < it.n; i++)
          add(
            {
              x: r() * 100,
              y: r() * it.top,
              s: 0.7 + r() * 1.3,
              d: 0.95 + r() * 0.05,
            },
            starSVG(T.star),
            1,
            { cls: "twinkle", wrap: true, fade: !!it.fade, dl: -r() * 3 },
          );
      else if (it.k === "petals")
        for (let i = 0; i < it.n; i++)
          add(
            {
              x: r() * 100,
              y: r() * 100,
              s: 0.9 + r() * 1,
              d: 0.6 + r() * 0.4,
            },
            "",
            1,
            {
              cls: "petal",
              wrap: true,
              fall: 60 + r() * 80,
              spin: (r() - 0.5) * 2,
              col: r() > 0.5 ? "#f5b0c0" : "#fcd3db",
              dl: -r() * 4,
            },
          );
    }
    return { el, items, def, view: views[j], op: -1, t0: 0, t1: 1 };
  });

  function place(
    L: SkyLayer,
    it: SkyItem,
    cam: SkyView,
    local: number,
    vw: number,
    vh: number,
  ): P2 {
    const v = L.view,
      sx = (cam.azim - v.azim) * vw * (0.35 + 0.45 * it.d),
      sy = -(cam.elev - v.elev) * vh * (1.1 + 0.5 * it.d);
    const x =
      (it.x / 100) * vw + sx + it.drift * (local - 0.5) * vw * 0.12 * it.d;
    let y = (it.y / 100) * vh + sy + ((it.sink * local) / 100) * vh;
    if (it.fall) y = ((((it.y + local * it.fall) % 112) - 6) / 100) * vh + sy;
    return [x, y];
  }

  function resize() {
    const vm = Math.min(innerWidth, innerHeight) / 100;
    for (const L of layers)
      for (const it of L.items) {
        it.w = it.s * vm;
        it.h = it.w * it.ratio;
        it.el.style.width = it.w.toFixed(1) + "px";
        it.el.style.height = it.h.toFixed(1) + "px";
      }
  }

  resize();
  return {
    layers,
    resize,
    update(envV: number, cam: SkyView, time: number) {
      const vw = innerWidth,
        vh = innerHeight;
      layers.forEach((L, j) => {
        const op = j ? clamp(envV - (j - 1)) : 1;
        if (op !== L.op) {
          L.el.style.opacity = op.toFixed(3);
          L.el.style.visibility = op > 0.001 ? "visible" : "hidden";
          L.op = op;
        }
        if (op <= 0.001) return;
        const local = clamp((time - L.t0) / Math.max(0.001, L.t1 - L.t0));
        for (const it of L.items) {
          const [x, y] = place(L, it, cam, local, vw, vh);
          it.el.style.transform =
            `translate3d(${(x - it.w / 2).toFixed(1)}px,${(y - it.h / 2).toFixed(1)}px,0)` +
            (it.fall
              ? ` rotate(${(local * 300 * (it.spin ?? 0)).toFixed(1)}deg)`
              : "");
          if (it.fade) {
            const o = smooth(0.25, 0.65, local).toFixed(3);
            if (it.lastO !== o) {
              it.el.style.opacity = o;
              it.lastO = o;
            }
          }
        }
      });
    },
    /* draws one layer into a 2D canvas, for the still (reduced-motion) version */
    async paint(
      ctx: CanvasRenderingContext2D,
      j: number,
      w: number,
      h: number,
      cam: SkyView,
    ) {
      const L = layers[j];
      paintGrad(ctx, L.def.grad, w, h);
      const vm = Math.min(w, h) / 100;
      for (const it of L.items) {
        if (it.fall) continue;
        const img = new Image();
        img.src =
          "data:image/svg+xml;charset=utf-8," + encodeURIComponent(it.svg);
        try {
          await img.decode();
        } catch {
          continue;
        }
        const iw = it.s * vm,
          ih = iw * it.ratio;
        const [x, y] = place(L, it, cam, 0.5, w, h);
        ctx.globalAlpha = it.fade ? 0.8 : 1;
        ctx.drawImage(img, x - iw / 2, y - ih / 2, iw, ih);
        ctx.globalAlpha = 1;
      }
    },
    dispose() {
      for (const L of layers) L.el.remove();
    },
  };
}
