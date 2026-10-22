import { describe, expect, test, vi } from "vitest";
import * as THREE from "three";
import {
  D,
  EPS,
  HB,
  OVER,
  TB,
  W,
  Y0,
  canvas,
  clamp,
  ctx2d,
  paperMat,
  part,
  resetMaterialCache,
  shade,
  tex,
  hash3,
  lerp,
  rng,
  smooth,
} from "@/features/storybook/three/core";

describe("R2/R4: core math keeps the handoff numbers", () => {
  test("book constants", () => {
    expect([W, D, TB, HB, EPS, OVER]).toEqual([
      1, 1.3, 0.02, 0.034, 0.0016, 0.022,
    ]);
    expect(Y0).toBeCloseTo(0.054, 10);
  });

  test("lerp", () => {
    expect(lerp(2, 6, 0)).toBe(2);
    expect(lerp(2, 6, 1)).toBe(6);
    expect(lerp(2, 6, 0.25)).toBe(3);
  });

  test("clamp defaults to 0..1 and accepts bounds", () => {
    expect(clamp(-0.5)).toBe(0);
    expect(clamp(1.5)).toBe(1);
    expect(clamp(0.3)).toBe(0.3);
    expect(clamp(5, 2, 4)).toBe(4);
    expect(clamp(1, 2, 4)).toBe(2);
  });

  test("smooth is a clamped smoothstep", () => {
    expect(smooth(0.7, 0.985, 0.7)).toBe(0);
    expect(smooth(0.7, 0.985, 0.5)).toBe(0);
    expect(smooth(0.7, 0.985, 0.985)).toBe(1);
    expect(smooth(0.7, 0.985, 1)).toBe(1);
    expect(smooth(0, 1, 0.5)).toBe(0.5);
    expect(smooth(0, 1, 0.25)).toBeCloseTo(0.15625, 10);
  });

  test("rng is deterministic per seed and stays in [0, 1)", () => {
    const a = rng(42);
    const b = rng(42);
    const seqA = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(seqA);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(rng(43)()).not.toBe(rng(42)());
  });

  test("hash3 is deterministic and in [0, 1)", () => {
    const h = hash3(0.1, 0.2, 0.3, 1);
    expect(hash3(0.1, 0.2, 0.3, 1)).toBe(h);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(1);
  });
});

describe("R5: per-boot material cache (white-box)", () => {
  test("paperMat is cached per key until the cache is reset", () => {
    resetMaterialCache();
    const a = paperMat();
    expect(paperMat()).toBe(a);
    expect(a.vertexColors).toBe(true);
    const twoSided = paperMat("v2");
    expect(twoSided.side).toBe(THREE.DoubleSide);
    expect(paperMat("plain").vertexColors).toBe(false);
    resetMaterialCache();
    expect(paperMat()).not.toBe(a);
  });
});

describe("R2: core helpers (white-box)", () => {
  test("part: shadows, double-sided material, transforms", () => {
    resetMaterialCache();
    const m = part(new THREE.BoxGeometry(1, 1, 1), "#ff0000", {
      double: true,
      cast: false,
      p: [1, 2, 3],
      r: [0.1, 0.2, 0.3],
      s: [2, 2, 2],
    });
    expect(m.castShadow).toBe(false);
    expect(m.receiveShadow).toBe(true);
    expect(m.material).toBe(paperMat("v2"));
    expect(m.position.toArray()).toEqual([1, 2, 3]);
    expect(m.scale.toArray()).toEqual([2, 2, 2]);
    expect(m.geometry.getAttribute("color")).toBeDefined();
  });

  test("part with j: 0 skips the jitter", () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const before = Array.from(
      (box.attributes.position as THREE.BufferAttribute).array,
    );
    part(box, "#ffffff", { j: 0 });
    expect(
      Array.from((box.attributes.position as THREE.BufferAttribute).array),
    ).toEqual(before);
  });

  test("ctx2d throws when the browser has no 2D canvas", () => {
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);
    expect(() => ctx2d(canvas(4, 4))).toThrow(
      "This browser cannot draw on a 2D canvas.",
    );
    spy.mockRestore();
  });

  test("canvas sets size; tex repeats only when asked", () => {
    const c = canvas(8, 4);
    expect([c.width, c.height]).toEqual([8, 4]);
    const plain = tex(c);
    expect(plain.anisotropy).toBe(8);
    expect(plain.wrapS).toBe(THREE.ClampToEdgeWrapping);
    const tiled = tex(c, { repeat: [4, 2] });
    expect(tiled.wrapS).toBe(THREE.RepeatWrapping);
    expect(tiled.repeat.toArray()).toEqual([4, 2]);
  });

  test("shade scales a colour", () => {
    expect(shade("#808080", 1)).toBe("#808080");
    expect(shade("#ffffff", 0)).toBe("#000000");
  });
});
