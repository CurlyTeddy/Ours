/* =====================================================================
   THE COUPLE — low-poly paper figures, one rig each, reused in every scene.
   Her: long dark hair, navy-gingham wrap dress, tan sandals.
   Him: short dark side-parted hair, navy short-sleeve shirt, cream chinos, grey slip-ons.
   Units: feet at y = 0, him ≈ 0.62 tall. L = screen-left (−x), R = screen-right (+x).
   ===================================================================== */
import * as THREE from "three";
import {
  G,
  type Vec3,
  cachedMat,
  canvas,
  ctx2d,
  lerp,
  part,
  tex,
} from "@/features/storybook/three/core";

export const COL = {
  skin: "#efc6a6",
  shirt: "#2f4468",
  shirtDk: "#26385a",
  pants: "#e9dfc8",
  belt: "#6d5544",
  shoe: "#a7adb5",
  sole: "#f1ede6",
  sandal: "#c3986a",
  himHair: "#2a201d",
  herHair: "#2e211c",
  eye: "#2b211d",
  lip: "#c27272",
  blush: "#eda39b",
  button: "#efe8dc",
};

function gingMat() {
  return cachedMat("ging", () => {
    const c = canvas(128, 128),
      x = ctx2d(c);
    x.fillStyle = "#f4f1ea";
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = "rgba(40,58,98,.55)";
    for (let i = 0; i < 128; i += 32) {
      x.fillRect(i, 0, 16, 128);
      x.fillRect(0, i, 128, 16);
    }
    const t = tex(c, { repeat: [1, 1] });
    return new THREE.MeshStandardMaterial({
      map: t,
      vertexColors: true,
      flatShading: true,
      roughness: 0.95,
      metalness: 0,
    });
  });
}
function uvScale(g: THREE.BufferGeometry, sx: number, sy: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return g;
}

function limb(
  len: number,
  r1: number,
  r2: number,
  hex: string,
  seed: number,
  mat?: THREE.Material,
) {
  const g = G.cyl(r1, r2, len, 6, 1);
  g.translate(0, -len / 2, 0);
  return part(g, hex, { j: r1 * 0.1, seed, keepBase: false, mat });
}

/* ellipsoid head surface, for placing features exactly on the face */
function faceZ(r: number, x: number, y: number) {
  return (
    0.94 *
    r *
    Math.sqrt(Math.max(0, 1 - (x / (0.9 * r)) ** 2 - (y / (1.08 * r)) ** 2))
  );
}

function faceParts(head: THREE.Group, r: number, H: boolean) {
  for (const sd of [-1, 1]) {
    const ex = sd * r * 0.36,
      ey = r * 0.04;
    head.add(
      part(G.box(r * 0.24, 0.0034, 0.006), COL.eye, {
        p: [ex, ey, faceZ(r, ex, ey) - 0.0015],
        r: [0, sd * 0.38, -sd * 0.14],
        j: 0,
        vary: 0,
        cast: false,
      }),
    );
    const bx = sd * r * 0.38,
      by = r * 0.3;
    head.add(
      part(G.box(r * 0.24, 0.0028, 0.005), H ? COL.himHair : COL.herHair, {
        p: [bx, by, faceZ(r, bx, by) - 0.002],
        r: [0, sd * 0.38, sd * 0.1],
        j: 0,
        vary: 0,
        cast: false,
      }),
    );
    const cx = sd * r * 0.5,
      cy = -r * 0.22;
    const b = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.15, 7),
      new THREE.MeshBasicMaterial({
        color: COL.blush,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    b.position.set(cx, cy, faceZ(r, cx, cy) + 0.0008);
    b.rotation.y = sd * 0.62;
    head.add(b);
  }
  head.add(
    part(G.cone(r * 0.11, r * 0.22, 4), COL.skin, {
      p: [0, -r * 0.1, faceZ(r, 0, -r * 0.1) + 0.002],
      r: [Math.PI / 2, 0, 0],
      j: 0,
      vary: 0.05,
    }),
  );
  head.add(
    part(G.box(r * 0.26, 0.0028, 0.005), COL.lip, {
      p: [0, -r * 0.44, faceZ(r, 0, -r * 0.44) - 0.0015],
      j: 0,
      vary: 0,
      cast: false,
    }),
  );
}

function hairCap(
  r: number,
  front: number,
  side: number,
  back: number,
  partSide: number,
) {
  const g = G.ico(r, 1);
  g.scale(0.97, 1.04, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i),
      zn = z / r,
      xn = x / r;
    let cut = zn >= 0 ? lerp(side, front, zn) : lerp(side, back, -zn);
    cut += partSide * xn * Math.max(0, zn);
    if (y < cut * r) p.setY(i, cut * r);
  }
  return g;
}

export const JOINTS = [
  "spine",
  "neck",
  "head",
  "hipL",
  "hipR",
  "kneeL",
  "kneeR",
  "shL",
  "shR",
  "elL",
  "elR",
  "skirt",
] as const;
export type Joint = (typeof JOINTS)[number];
/* Poses are joint rotations [x, y, z] in radians; `drop` lowers the body (sitting). */
export type Pose = Partial<Record<Joint, Vec3>> & { drop?: number };
type Rig = Partial<Record<Joint | "pelvis", THREE.Group>> & {
  fig: THREE.Group;
};

export function figure(who: "him" | "her") {
  const H = who === "him",
    seed = H ? 11 : 23;
  const root = new THREE.Group(),
    fig = new THREE.Group();
  root.add(fig);
  const J: Rig = { fig };
  const pelvis = new THREE.Group();
  pelvis.position.y = H ? 0.29 : 0.27;
  fig.add(pelvis);
  J.pelvis = pelvis;

  // legs and feet
  const L = H
    ? {
        hx: 0.034,
        tl: 0.14,
        t1: 0.035,
        t2: 0.029,
        sl: 0.13,
        s1: 0.028,
        s2: 0.022,
        col: COL.pants,
      }
    : {
        hx: 0.026,
        tl: 0.13,
        t1: 0.028,
        t2: 0.022,
        sl: 0.125,
        s1: 0.021,
        s2: 0.016,
        col: COL.skin,
      };
  for (const sd of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.x = sd * L.hx;
    pelvis.add(hip);
    hip.add(limb(L.tl, L.t1, L.t2, L.col, seed + sd));
    const knee = new THREE.Group();
    knee.position.y = -L.tl;
    hip.add(knee);
    knee.add(limb(L.sl, L.s1, L.s2, L.col, seed + 5 + sd));
    const ank = new THREE.Group();
    ank.position.y = -L.sl;
    knee.add(ank);
    if (H) {
      ank.add(
        part(G.box(0.05, 0.032, 0.1, 1, 1, 2), COL.shoe, {
          p: [0, -0.004, 0.02],
          j: 0.002,
          seed,
        }),
      );
      ank.add(
        part(G.box(0.052, 0.008, 0.104), COL.sole, {
          p: [0, -0.019, 0.02],
          j: 0.001,
        }),
      );
    } else {
      ank.add(
        part(G.box(0.03, 0.018, 0.075), COL.skin, {
          p: [0, -0.004, 0.018],
          j: 0.002,
        }),
      );
      ank.add(
        part(G.box(0.04, 0.007, 0.088), COL.sandal, {
          p: [0, -0.0125, 0.018],
          j: 0.001,
        }),
      );
      ank.add(
        part(G.box(0.034, 0.006, 0.012), COL.sandal, {
          p: [0, 0.004, 0.036],
          j: 0,
        }),
      );
    }
    J[sd < 0 ? "hipL" : "hipR"] = hip;
    J[sd < 0 ? "kneeL" : "kneeR"] = knee;
  }

  // hips: chinos, or the gingham skirt on its own joint so it can drape when she sits
  if (H) {
    const g = G.cyl(0.064, 0.062, 0.075, 7);
    g.scale(1, 1, 0.74);
    pelvis.add(part(g, COL.pants, { p: [0, -0.01, 0], j: 0.002, seed }));
    const b = G.cyl(0.066, 0.066, 0.012, 7);
    b.scale(1, 1, 0.76);
    pelvis.add(part(b, COL.belt, { p: [0, 0.026, 0], j: 0.001 }));
  } else {
    const skirt = new THREE.Group();
    skirt.position.y = 0.02;
    pelvis.add(skirt);
    J.skirt = skirt;
    const g = uvScale(G.cyl(0.05, 0.104, 0.165, 10, 2), 14, 5);
    g.translate(0, -0.0825, 0);
    g.scale(1, 1, 0.8);
    skirt.add(
      part(g, "#ffffff", {
        j: 0.004,
        seed,
        keepBase: false,
        mat: gingMat(),
        vary: 0.07,
      }),
    );
  }

  // torso
  const spine = new THREE.Group();
  spine.position.y = 0.015;
  pelvis.add(spine);
  J.spine = spine;
  const top = H ? 0.17 : 0.15;
  if (H) {
    const g = G.cyl(0.078, 0.064, top, 7, 2);
    g.translate(0, top / 2, 0);
    g.scale(1, 1, 0.62);
    spine.add(part(g, COL.shirt, { j: 0.003, seed, keepBase: false }));
    for (let k = 0; k < 4; k++) {
      const y = 0.03 + k * 0.035;
      spine.add(
        part(G.box(0.007, 0.007, 0.004), COL.button, {
          p: [0, y, lerp(0.0405, 0.0485, y / top) + 0.001],
          j: 0,
          vary: 0,
          cast: false,
        }),
      );
    }
    for (const sd of [-1, 1])
      spine.add(
        part(G.box(0.034, 0.024, 0.006), COL.shirtDk, {
          p: [sd * 0.016, top - 0.006, 0.043],
          r: [-0.35, sd * 0.2, sd * 0.55],
          j: 0.001,
        }),
      );
  } else {
    const g = uvScale(G.cyl(0.064, 0.05, top, 8, 2), 10, 4);
    g.translate(0, top / 2, 0);
    g.scale(1, 1, 0.62);
    spine.add(
      part(g, "#ffffff", {
        j: 0.0025,
        seed,
        keepBase: false,
        mat: gingMat(),
        vary: 0.06,
      }),
    );
    const v = new THREE.Shape();
    v.moveTo(-0.021, top);
    v.lineTo(0.021, top);
    v.lineTo(0, top - 0.045);
    v.closePath();
    spine.add(
      part(new THREE.ShapeGeometry(v), COL.skin, {
        p: [0, 0, 0.0402],
        j: 0,
        vary: 0,
        double: true,
      }),
    );
    const b = G.cyl(0.054, 0.054, 0.014, 9);
    b.scale(1, 1, 0.66);
    spine.add(part(b, "#2f3f66", { p: [0, 0.006, 0], j: 0.001 }));
    spine.add(
      part(G.box(0.03, 0.016, 0.008), "#2f3f66", {
        p: [0.04, 0.008, 0.03],
        r: [0, 0.5, 0.4],
        j: 0.001,
      }),
    );
    spine.add(
      part(G.box(0.012, 0.06, 0.006), "#2f3f66", {
        p: [0.044, -0.026, 0.032],
        r: [0, 0.5, 0.12],
        j: 0.001,
      }),
    );
  }

  // arms
  const SX = H ? 0.078 : 0.062,
    aU = H ? 0.115 : 0.105,
    aF = H ? 0.105 : 0.097;
  for (const sd of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(sd * SX, top - 0.024, 0);
    spine.add(sh);
    sh.add(
      H
        ? limb(0.072, 0.032, 0.029, COL.shirt, seed + 9)
        : limb(0.05, 0.03, 0.027, "#ffffff", seed + 9, gingMat()),
    );
    sh.add(limb(aU, H ? 0.02 : 0.017, H ? 0.018 : 0.015, COL.skin, seed + 12));
    const el = new THREE.Group();
    el.position.y = -aU;
    sh.add(el);
    el.add(limb(aF, H ? 0.018 : 0.015, H ? 0.015 : 0.013, COL.skin, seed + 14));
    el.add(
      part(G.ico(H ? 0.021 : 0.018, 0), COL.skin, {
        p: [0, -aF - 0.012, 0],
        j: 0.002,
      }),
    );
    J[sd < 0 ? "shL" : "shR"] = sh;
    J[sd < 0 ? "elL" : "elR"] = el;
  }

  // neck, head, hair
  const neck = new THREE.Group();
  neck.position.y = top;
  spine.add(neck);
  J.neck = neck;
  neck.add(
    part(G.cyl(0.019, 0.021, 0.036, 6), COL.skin, {
      p: [0, 0.018, 0],
      j: 0.001,
    }),
  );
  const r = H ? 0.055 : 0.05;
  const head = new THREE.Group();
  head.position.y = 0.03 + r;
  neck.add(head);
  J.head = head;
  const hg = G.ico(r, 1);
  hg.scale(0.9, 1.08, 0.94);
  head.add(
    part(hg, COL.skin, { j: 0.0018, seed, keepBase: false, vary: 0.05 }),
  );
  faceParts(head, r, H);
  if (H) {
    for (const sd of [-1, 1])
      head.add(
        part(G.ico(0.012, 0), COL.skin, {
          p: [sd * r * 0.88, 0, -0.004],
          s: [0.6, 1, 1],
          j: 0,
        }),
      );
    head.add(
      part(hairCap(r * 1.1, 0.4, 0.02, -0.55, 0.22), COL.himHair, {
        p: [0, r * 0.05, -r * 0.04],
        j: 0.002,
        seed,
        keepBase: false,
        vary: 0.14,
      }),
    );
    head.add(
      part(G.box(0.06, 0.016, 0.034), COL.himHair, {
        p: [-0.012, r * 0.66, r * 0.56],
        r: [-0.55, 0, 0.32],
        j: 0.002,
        vary: 0.14,
      }),
    );
  } else {
    head.add(
      part(G.box(0.118, 0.17, 0.042, 2, 3, 1), COL.herHair, {
        p: [0, -r * 1.05, -r * 0.62],
        j: 0.006,
        seed,
        keepBase: false,
        vary: 0.15,
      }),
    );
    for (const sd of [-1, 1])
      head.add(
        part(G.box(0.024, 0.13, 0.022, 1, 3, 1), COL.herHair, {
          p: [sd * r * 0.9, -r * 1.05, r * 0.12],
          r: [0.14, 0, sd * 0.1],
          j: 0.003,
          seed: seed + sd,
          keepBase: false,
          vary: 0.15,
        }),
      );
    head.add(
      part(hairCap(r * 1.12, 0.44, -0.25, -0.6, 0), COL.herHair, {
        p: [0, r * 0.04, -r * 0.04],
        j: 0.002,
        seed,
        keepBase: false,
        vary: 0.14,
      }),
    );
  }

  root.userData.J = J;
  return root;
}

const NEUTRAL: Partial<Record<Joint, Vec3>> = {
  shL: [0, 0, -0.07],
  shR: [0, 0, 0.07],
};
export function applyPose(figRoot: THREE.Object3D, P: Pose, b: number) {
  const J = figRoot.userData.J as Rig;
  for (const k of JOINTS) {
    const j = J[k];
    if (!j) continue;
    const n = NEUTRAL[k] || [0, 0, 0],
      t = P[k] || n;
    j.rotation.set(
      lerp(n[0], t[0], b),
      lerp(n[1], t[1], b),
      lerp(n[2], t[2], b),
    );
  }
  J.fig.position.y = lerp(0, P.drop || 0, b);
}
