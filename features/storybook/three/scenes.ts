/* =====================================================================
   POP-UP SCENES — positions are spread coordinates:
   X ∈ [−1, 1] (left page negative), Z ∈ [−0.65 head, 0.65 foot].
   split:true pieces stand across the gutter and are cut in two, one half per page.
   fold: 'fwd' lays a piece toward the reader, 'back' toward the head of the page.
   delay: 0 rises first … 0.4 rises last.
   ===================================================================== */
import * as THREE from "three";
import type { Book } from "@/features/storybook/three/book";
import { smooth } from "@/features/storybook/three/core";
import {
  COL,
  type Pose,
  applyPose,
  figure,
} from "@/features/storybook/three/figures";
import { PC, PROPS, half } from "@/features/storybook/three/props";
import type { PRINTS } from "@/features/storybook/three/prints";

type Fold = "fwd" | "back";
type SceneItem = {
  X: number;
  Z: number;
  split?: boolean;
  yaw?: number;
  fold?: Fold;
  delay?: number;
} & (
  | { build: () => THREE.Object3D; fig?: undefined }
  | { fig: "him" | "her"; pose: Pose }
);
export interface SceneDef {
  print: keyof typeof PRINTS;
  items: SceneItem[];
}

function hills(list: [number, number, number, string, number?][], z = 0) {
  const g = new THREE.Group();
  list.forEach(([x, h, r, hex, flat = 0.5], i) => {
    const m = PROPS.mountain(h, r, hex, 40 + i, 7, flat);
    m.position.set(x, 0, z);
    g.add(m);
  });
  return g;
}

export const SCENES: Record<"spring" | "lake" | "sunset", SceneDef> = {
  spring: {
    print: "spring",
    items: [
      {
        split: true,
        X: 0,
        Z: -0.46,
        delay: 0,
        build: () =>
          hills([
            [-0.66, 0.4, 0.34, "#8cc27a"],
            [-0.22, 0.52, 0.32, PC.mount],
            [0.24, 0.46, 0.34, "#86bb70"],
            [0.68, 0.38, 0.3, "#8cc27a"],
          ]),
      },
      { X: -0.72, Z: -0.18, delay: 0.08, build: () => PROPS.cherry(3, 1.25) },
      { X: -0.42, Z: -0.3, delay: 0.1, build: () => PROPS.cherry(7, 1.0) },
      { X: 0.56, Z: -0.24, delay: 0.1, build: () => PROPS.cherry(9, 1.15) },
      { X: 0.84, Z: -0.1, delay: 0.12, build: () => PROPS.roundTree(4, 1.05) },
      {
        X: -0.62,
        Z: 0.08,
        yaw: 0.35,
        delay: 0.16,
        build: () => PROPS.bench(0.28),
      },
      { X: -0.3, Z: -0.04, delay: 0.16, build: () => PROPS.lamp(0.32) },
      {
        X: -0.94,
        Z: 0.16,
        delay: 0.2,
        build: () => PROPS.bush(0.045, PC.grassDk, 2),
      },
      {
        X: 0.93,
        Z: 0.24,
        delay: 0.2,
        build: () => PROPS.bush(0.05, PC.grassDk, 6),
      },
      {
        X: -0.84,
        Z: 0.44,
        fold: "back",
        delay: 0.3,
        build: () => PROPS.tulips(4, 2, 1),
      },
      {
        X: 0.46,
        Z: 0.34,
        fold: "back",
        delay: 0.3,
        build: () => PROPS.tulips(3, 5, 1),
      },
      {
        X: 0.8,
        Z: 0.46,
        fold: "back",
        delay: 0.32,
        build: () => PROPS.tulips(4, 8, 1.1),
      },
      {
        fig: "him",
        X: -0.14,
        Z: 0.14,
        yaw: 0.22,
        fold: "back",
        delay: 0.26,
        pose: {
          hipL: [-0.28, 0, 0],
          kneeL: [0.12, 0, 0],
          hipR: [0.22, 0, 0],
          kneeR: [0.38, 0, 0],
          shL: [0.25, 0, -0.1],
          elL: [-0.2, 0, 0],
          shR: [-0.15, 0, 0.3],
          elR: [-0.15, 0, 0],
          head: [0.05, 0.35, -0.05],
          spine: [0, 0.05, 0],
        },
      },
      {
        fig: "her",
        X: 0.14,
        Z: 0.14,
        yaw: -0.22,
        fold: "back",
        delay: 0.28,
        pose: {
          hipL: [0.2, 0, 0],
          kneeL: [0.35, 0, 0],
          hipR: [-0.26, 0, 0],
          kneeR: [0.1, 0, 0],
          shL: [-0.15, 0, -0.36],
          elL: [-0.45, 0, 0],
          shR: [-0.3, 0, 0.12],
          elR: [-0.9, 0, 0],
          head: [0.08, -0.4, 0.1],
          spine: [0, -0.05, 0],
        },
      },
      { X: -0.03, Z: -0.03, delay: 0.36, build: () => PROPS.heart(0.64, 1) },
      {
        X: 0.06,
        Z: -0.07,
        delay: 0.38,
        build: () => PROPS.heart(0.72, 0.7, PC.heartLt),
      },
    ],
  },
  lake: {
    print: "lake",
    items: [
      {
        split: true,
        X: 0,
        Z: -0.47,
        delay: 0,
        build: () =>
          hills([
            [-0.64, 0.48, 0.34, "#86bb70", 0.45],
            [0, 0.86, 0.6, PC.mount, 0.33],
            [0.64, 0.54, 0.36, "#7fb46a", 0.45],
          ]),
      },
      {
        X: -0.8,
        Z: -0.22,
        yaw: 0.3,
        delay: 0.1,
        build: () => PROPS.house(0.08, 0.06, 0.07, 3),
      },
      {
        X: -0.67,
        Z: -0.32,
        yaw: -0.2,
        delay: 0.11,
        build: () => PROPS.house(0.07, 0.055, 0.065, 5),
      },
      {
        X: -0.9,
        Z: -0.38,
        yaw: 0.1,
        delay: 0.12,
        build: () => PROPS.house(0.075, 0.05, 0.06, 7),
      },
      { X: -0.56, Z: -0.2, delay: 0.12, build: () => PROPS.lighthouse(1.25) },
      { X: -0.93, Z: -0.05, delay: 0.14, build: () => PROPS.lighthouse(0.75) },
      {
        X: -0.74,
        Z: -0.06,
        delay: 0.16,
        build: () => PROPS.bush(0.04, PC.grassDk, 9),
      },
      { X: 0.72, Z: -0.24, delay: 0.1, build: () => PROPS.pagoda(1.3) },
      { X: 0.9, Z: -0.08, delay: 0.16, build: () => PROPS.pine(5, 1.1) },
      { X: 0.55, Z: 0.2, delay: 0.18, build: () => PROPS.gate(1) },
      { X: -0.3, Z: -0.1, yaw: 0.4, delay: 0.2, build: () => PROPS.boat(1, 2) },
      {
        X: 0.22,
        Z: -0.2,
        yaw: -0.3,
        delay: 0.22,
        build: () => PROPS.boat(1.1, 4),
      },
      {
        X: 0.42,
        Z: 0.0,
        yaw: 0.2,
        delay: 0.24,
        build: () => PROPS.boat(0.8, 6),
      },
      {
        X: 0.82,
        Z: 0.38,
        fold: "back",
        delay: 0.3,
        build: () => PROPS.tulips(5, 3, 1.2),
      },
      {
        X: 0.66,
        Z: 0.5,
        fold: "back",
        delay: 0.32,
        build: () => PROPS.tulips(3, 9, 1.1),
      },
      {
        X: -0.8,
        Z: 0.42,
        fold: "back",
        delay: 0.3,
        build: () => PROPS.bush(0.05, PC.grassDk, 12),
      },
      {
        fig: "her",
        X: -0.11,
        Z: 0.3,
        yaw: 0.15,
        fold: "back",
        delay: 0.26,
        pose: {
          shL: [-0.2, 0, -1.95],
          elL: [0, 0, -2.23],
          shR: [-0.1, 0, 0.2],
          elR: [-0.35, 0, 0],
          head: [0.1, -0.45, 0.12],
          spine: [0, -0.1, 0.03],
          hipL: [-0.08, 0, 0],
          kneeL: [0.1, 0, 0],
          hipR: [0.06, 0, -0.04],
        },
      },
      {
        fig: "him",
        X: 0.11,
        Z: 0.3,
        yaw: -0.12,
        fold: "back",
        delay: 0.28,
        pose: {
          shR: [-0.1, 0, 0.79],
          elR: [0, 0, -1.72],
          shL: [0.25, 0, -0.32],
          elL: [-0.3, 0, 0],
          head: [0, -0.35, -0.06],
          hipR: [0, 0, 0.06],
          hipL: [-0.05, 0, 0],
        },
      },
    ],
  },
  sunset: {
    print: "sunset",
    items: [
      {
        split: true,
        X: 0,
        Z: -0.37,
        delay: 0,
        build: () => PROPS.waves(2, 0.1, "#6f8fbf", 3),
      },
      {
        split: true,
        X: 0,
        Z: -0.28,
        delay: 0.1,
        build: () => PROPS.waves(2, 0.075, "#819ecb", 5),
      },
      {
        split: true,
        X: 0,
        Z: -0.19,
        delay: 0.14,
        build: () => PROPS.waves(2, 0.05, "#97afd4", 7),
      },
      { X: 0.55, Z: -0.32, delay: 0.12, build: () => PROPS.sailboat(1.25) },
      { X: 0.86, Z: -0.04, delay: 0.18, build: () => PROPS.rock(0.05, 3) },
      { X: -0.86, Z: 0.06, delay: 0.18, build: () => PROPS.rock(0.06, 5) },
      { X: -0.46, Z: 0.1, delay: 0.2, build: () => PROPS.lamp(0.36) },
      {
        split: true,
        X: 0,
        Z: 0.1,
        fold: "back",
        delay: 0.2,
        build: () => {
          const g = PROPS.bench(0.38);
          const m1 = PROPS.mug(COL.shirt);
          m1.position.set(-0.165, 0.17, 0.012);
          g.add(m1);
          const m2 = PROPS.mug("#e98e88");
          m2.position.set(0.165, 0.17, 0.01);
          g.add(m2);
          return g;
        },
      },
      { X: 0.42, Z: 0.22, delay: 0.28, build: () => PROPS.basket() },
      {
        X: 0.76,
        Z: 0.46,
        fold: "back",
        delay: 0.3,
        build: () => PROPS.tulips(4, 4, 1.1),
      },
      {
        fig: "him",
        X: -0.095,
        Z: 0.1,
        fold: "back",
        delay: 0.26,
        pose: {
          drop: -0.105,
          hipL: [-1.5, 0, -0.04],
          hipR: [-1.5, 0, 0.04],
          kneeL: [1.45, 0, 0],
          kneeR: [1.45, 0, 0],
          spine: [0.06, 0, -0.04],
          neck: [0, 0, -0.05],
          head: [0.05, 0.15, -0.16],
          shL: [-0.5, 0, -0.08],
          elL: [-1.0, 0, 0],
          shR: [-0.25, 0, 0.22],
          elR: [-0.5, 0, 0],
        },
      },
      {
        fig: "her",
        X: 0.085,
        Z: 0.1,
        fold: "back",
        delay: 0.28,
        pose: {
          drop: -0.085,
          hipL: [-1.5, 0, -0.04],
          hipR: [-1.5, 0, 0.04],
          kneeL: [1.42, 0, 0],
          kneeR: [1.42, 0, 0],
          skirt: [-1.25, 0, 0],
          spine: [0.05, 0, 0.15],
          neck: [0, 0, 0.1],
          head: [0.1, -0.15, 0.3],
          shL: [-0.3, 0, -0.18],
          elL: [-0.55, 0, 0],
          shR: [-0.5, 0, 0.06],
          elR: [-1.05, 0, 0],
        },
      },
      { X: 0.02, Z: -0.02, delay: 0.38, build: () => PROPS.heart(0.6, 0.8) },
    ],
  },
};

interface PopItem {
  anchorG: THREE.Group;
  hingeG: THREE.Group;
  obj: THREE.Object3D;
  pose: Pose | null;
  fold: Fold;
  delay: number;
  leaf: number;
  surf: "front" | "back";
  s: number;
  z: number;
  side: number;
}

/* One spread's pop-up pieces, hinged to the two page surfaces they stand on. */
export class PopSpread {
  items: PopItem[] = [];
  lastU = -1;

  constructor(
    public book: Book,
    public k: number,
    def: SceneDef,
    parent: THREE.Object3D,
  ) {
    for (const it of def.items) {
      const obj = it.fig ? figure(it.fig) : it.build();
      const pose = it.fig ? it.pose : null;
      const box = new THREE.Box3().setFromObject(obj);
      const fold = it.fold || "fwd";
      const pivot = new THREE.Vector3(
        0,
        box.min.y,
        fold === "fwd" ? box.max.z : box.min.z,
      );
      const parts: [number, THREE.Object3D][] = it.split
        ? [
            [-1, half(obj, -1)],
            [1, half(obj, 1)],
          ]
        : [[it.X < 0 ? -1 : 1, obj]];
      for (const [side, o] of parts) {
        const anchorG = new THREE.Group(),
          yawG = new THREE.Group(),
          hingeG = new THREE.Group();
        yawG.rotation.y = it.split ? 0 : it.yaw || 0;
        hingeG.position.copy(pivot);
        o.position.sub(pivot);
        anchorG.add(yawG);
        yawG.add(hingeG);
        hingeG.add(o);
        parent.add(anchorG);
        anchorG.visible = false;
        this.items.push({
          anchorG,
          hingeG,
          obj: o,
          pose,
          fold,
          delay: it.delay || 0,
          leaf: side < 0 ? k : k + 1,
          surf: side < 0 ? "back" : "front",
          s: it.split ? 0 : Math.abs(it.X),
          z: it.Z,
          side,
        });
      }
    }
  }
  update() {
    const u = smooth(0.7, 0.985, this.book.spreadOpen(this.k));
    const moving =
      this.book.p[this.k] % 1 !== 0 || this.book.p[this.k + 1] % 1 !== 0;
    if (u === this.lastU && !moving) return;
    this.lastU = u;
    for (const e of this.items) {
      const ue = smooth(e.delay, e.delay + 0.6, u);
      e.anchorG.visible = ue > 0.004;
      if (!e.anchorG.visible) continue;
      const a = this.book.anchor(e.leaf, e.surf, e.s, e.z);
      e.anchorG.position.set(a.x, a.y, a.z);
      e.anchorG.rotation.z = a.psi;
      e.hingeG.rotation.x =
        (((e.fold === "fwd" ? 1 : -1) * (1 - ue) * Math.PI) / 2) * 0.995;
      if (e.pose) applyPose(e.obj, e.pose, smooth(0.5, 1, ue));
    }
  }
}
