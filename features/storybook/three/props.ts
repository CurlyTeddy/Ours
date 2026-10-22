/* =====================================================================
   PAPER SCENERY — every piece sits on y = 0 so it can hinge up off a page.
   ===================================================================== */
import * as THREE from "three";
import {
  G,
  clamp,
  jitter,
  paperMat,
  part,
  rng,
} from "@/features/storybook/three/core";

export const PC = {
  grass: "#84b96c",
  grassDk: "#6ea35c",
  mount: "#79b265",
  mountDk: "#5f9a52",
  trunk: "#8a6248",
  blossom: "#f2b2c2",
  blossomLt: "#f8cdd7",
  wall: "#f3ead9",
  roof: "#e9824a",
  white: "#f4f1ea",
  red: "#d8594a",
  lamp: "#f6d27a",
  stone: "#cfcac0",
  wood: "#b8875c",
  woodDk: "#94683f",
  cloud: "#fbfaf6",
  stem: "#5f9a4e",
  tulip: "#f3c63f",
  heart: "#e2606b",
  heartLt: "#f39aa6",
  post: "#3c5a4a",
  sea: "#6f92bd",
  wicker: "#c39457",
};
export function grp(...ms: (THREE.Object3D | null | undefined)[]) {
  const g = new THREE.Group();
  ms.forEach((m) => m && g.add(m));
  return g;
}

/* Cuts an object at the gutter (x = 0) and keeps one side, so it can stand across both pages. */
export function half(obj: THREE.Object3D, side: number) {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(),
    out = new THREE.Group();
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o as THREE.Mesh;
    const g = m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const p = g.attributes.position as THREE.BufferAttribute;
    let keep = false;
    for (let i = 0; i < p.count; i++) {
      if (p.getX(i) * side < 0) p.setX(i, 0);
      else if (Math.abs(p.getX(i)) > 1e-4) keep = true;
    }
    if (!keep) return;
    const mm = new THREE.Mesh(g, m.material);
    mm.castShadow = m.castShadow;
    mm.receiveShadow = true;
    mm.renderOrder = m.renderOrder;
    out.add(mm);
  });
  return out;
}

export const PROPS = {
  mountain(
    h: number,
    r: number,
    hex = PC.mount,
    seed = 1,
    seg = 7,
    flat = 0.5,
  ) {
    const g = G.cone(r, h, seg, 3);
    g.translate(0, h / 2, 0);
    g.scale(1, 1, flat);
    return grp(part(g, hex, { j: r * 0.07, seed, vary: 0.15 }));
  },
  cherry(seed = 1, s = 1) {
    const t = rng(seed),
      g = new THREE.Group();
    g.add(
      part(G.cyl(0.011 * s, 0.019 * s, 0.19 * s, 5), PC.trunk, {
        p: [0, 0.095 * s, 0],
        seed,
      }),
    );
    g.add(
      part(G.cyl(0.005 * s, 0.008 * s, 0.09 * s, 4), PC.trunk, {
        p: [0.03 * s, 0.17 * s, 0],
        r: [0, 0, -0.7],
        seed: seed + 1,
      }),
    );
    for (const [x, y, z, r] of [
      [0, 0.25, 0, 0.085],
      [-0.065, 0.22, 0.02, 0.062],
      [0.07, 0.225, -0.015, 0.066],
      [0.005, 0.3, -0.01, 0.058],
      [0.02, 0.2, 0.05, 0.05],
    ])
      g.add(
        part(G.ico(r * s, 0), t() > 0.5 ? PC.blossom : PC.blossomLt, {
          p: [x * s, y * s, z * s],
          j: 0.006 * s,
          seed: seed + x * 100,
          keepBase: false,
          vary: 0.12,
        }),
      );
    return g;
  },
  roundTree(seed = 1, s = 1, hex = PC.grass) {
    return grp(
      part(G.cyl(0.01 * s, 0.016 * s, 0.14 * s, 5), PC.trunk, {
        p: [0, 0.07 * s, 0],
        seed,
      }),
      part(G.ico(0.075 * s, 0), hex, {
        p: [0, 0.19 * s, 0],
        s: [1, 1.15, 1],
        j: 0.006 * s,
        seed,
        keepBase: false,
        vary: 0.14,
      }),
    );
  },
  pine(seed = 1, s = 1) {
    const g = grp(
      part(G.cyl(0.008 * s, 0.012 * s, 0.06 * s, 5), PC.trunk, {
        p: [0, 0.03 * s, 0],
        seed,
      }),
    );
    [
      [0.06, 0.1, 0.09],
      [0.048, 0.09, 0.15],
      [0.034, 0.08, 0.2],
    ].forEach(([r, h, y], i) =>
      g.add(
        part(G.cone(r * s, h * s, 6), PC.mountDk, {
          p: [0, y * s, 0],
          j: 0.004 * s,
          seed: seed + i,
          vary: 0.14,
        }),
      ),
    );
    return g;
  },
  bush(r: number, hex = PC.grassDk, seed = 1) {
    return grp(
      part(G.ico(r, 0), hex, {
        p: [0, r * 0.62, 0],
        s: [1.2, 0.85, 1],
        j: r * 0.1,
        seed,
        vary: 0.15,
      }),
    );
  },
  house(w = 0.08, h = 0.06, d = 0.07, seed = 1) {
    const rr = (d * 1.18) / 1.732;
    const roof = new THREE.CylinderGeometry(
      rr,
      rr,
      w * 1.16,
      3,
      1,
      false,
      Math.PI / 2,
    );
    roof.rotateZ(Math.PI / 2);
    return grp(
      part(G.box(w, h, d), PC.wall, { p: [0, h / 2, 0], j: 0.002, seed }),
      part(roof, PC.roof, {
        p: [0, h + rr * 0.5, 0],
        j: 0.002,
        seed: seed + 1,
        vary: 0.12,
      }),
      part(G.box(w * 0.22, h * 0.45, 0.004), "#7a5a48", {
        p: [w * 0.18, h * 0.22, d / 2 + 0.001],
        j: 0,
      }),
      part(G.box(w * 0.2, h * 0.22, 0.004), "#9fc3d6", {
        p: [-w * 0.2, h * 0.58, d / 2 + 0.001],
        j: 0,
      }),
    );
  },
  lighthouse(s = 1) {
    return grp(
      part(G.cyl(0.022 * s, 0.034 * s, 0.2 * s, 8), PC.white, {
        p: [0, 0.1 * s, 0],
        j: 0.002,
      }),
      part(G.cyl(0.03 * s, 0.031 * s, 0.03 * s, 8), PC.red, {
        p: [0, 0.06 * s, 0],
        j: 0.001,
      }),
      part(G.cyl(0.025 * s, 0.026 * s, 0.028 * s, 8), PC.red, {
        p: [0, 0.14 * s, 0],
        j: 0.001,
      }),
      part(G.cyl(0.032 * s, 0.032 * s, 0.008 * s, 8), "#e9e3d6", {
        p: [0, 0.204 * s, 0],
        j: 0,
      }),
      part(G.cyl(0.018 * s, 0.018 * s, 0.03 * s, 8), PC.lamp, {
        p: [0, 0.223 * s, 0],
        j: 0,
      }),
      part(G.cone(0.026 * s, 0.036 * s, 8), PC.red, {
        p: [0, 0.256 * s, 0],
        j: 0.001,
      }),
    );
  },
  pagoda(s = 1) {
    const g = grp(
      part(G.cyl(0.065 * s, 0.075 * s, 0.03 * s, 8), PC.stone, {
        p: [0, 0.015 * s, 0],
        j: 0.002,
      }),
    );
    let y = 0.03 * s,
      rb = 0.048 * s;
    for (let i = 0; i < 6; i++) {
      const h = 0.046 * s * (1 - i * 0.05);
      g.add(
        part(G.cyl(rb * 0.92, rb, h, 8), PC.white, {
          p: [0, y + h / 2, 0],
          j: 0.0015,
          seed: i,
        }),
      );
      y += h;
      g.add(
        part(G.cyl(rb * 0.7, rb * 1.32, 0.016 * s, 8), "#dcd5c6", {
          p: [0, y + 0.006 * s, 0],
          j: 0.001,
          seed: i + 7,
        }),
      );
      y += 0.012 * s;
      rb *= 0.86;
    }
    g.add(
      part(G.cone(0.012 * s, 0.08 * s, 6), "#e9e3d6", {
        p: [0, y + 0.04 * s, 0],
        j: 0,
      }),
    );
    return g;
  },
  gate(s = 1) {
    return grp(
      part(G.box(0.026 * s, 0.12 * s, 0.026 * s), PC.stone, {
        p: [-0.04 * s, 0.06 * s, 0],
        j: 0.002,
        seed: 2,
      }),
      part(G.box(0.026 * s, 0.12 * s, 0.026 * s), PC.stone, {
        p: [0.04 * s, 0.06 * s, 0],
        j: 0.002,
        seed: 3,
      }),
      part(G.box(0.12 * s, 0.022 * s, 0.034 * s), "#bdb7ab", {
        p: [0, 0.128 * s, 0],
        j: 0.002,
        seed: 4,
      }),
    );
  },
  boat(s = 1, seed = 1) {
    const hull = new THREE.Shape();
    hull.moveTo(-0.04, 0);
    hull.lineTo(0.04, 0);
    hull.lineTo(0.065, 0.026);
    hull.lineTo(0, 0.016);
    hull.lineTo(-0.065, 0.026);
    hull.closePath();
    const hg = new THREE.ExtrudeGeometry(hull, {
      depth: 0.034,
      bevelEnabled: false,
    });
    hg.translate(0, 0, -0.017);
    const sail = new THREE.Shape();
    sail.moveTo(-0.03, 0.016);
    sail.lineTo(0.03, 0.016);
    sail.lineTo(0, 0.07);
    sail.closePath();
    const sg = new THREE.ExtrudeGeometry(sail, {
      depth: 0.004,
      bevelEnabled: false,
    });
    sg.translate(0, 0, -0.002);
    const g = grp(
      part(hg, PC.white, { j: 0.001, seed, vary: 0.08 }),
      part(sg, "#ffffff", { j: 0.001, seed: seed + 1, vary: 0.06 }),
    );
    g.scale.setScalar(s);
    return g;
  },
  cloud(h: number, s = 1, seed = 1) {
    const g = grp(
      part(G.cyl(0.0022, 0.0022, h, 4), "#e2ddd2", { p: [0, h / 2, 0], j: 0 }),
    );
    [
      [0, 0, 0.05],
      [-0.05, -0.008, 0.036],
      [0.052, -0.006, 0.04],
      [0.02, 0.02, 0.034],
    ].forEach(([x, y, r], i) =>
      g.add(
        part(G.ico(r * s, 0), PC.cloud, {
          p: [x * s, h + y * s, 0],
          s: [1.3, 0.8, 0.55],
          j: 0.004 * s,
          seed: seed + i,
          keepBase: false,
          vary: 0.06,
        }),
      ),
    );
    return g;
  },
  heart(h: number, s = 1, hex = PC.heart) {
    const sh = new THREE.Shape();
    sh.moveTo(0, -0.03);
    sh.bezierCurveTo(-0.05, 0.0, -0.035, 0.04, 0, 0.022);
    sh.bezierCurveTo(0.035, 0.04, 0.05, 0.0, 0, -0.03);
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: 0.01,
      bevelEnabled: false,
      curveSegments: 4,
    });
    g.translate(0, 0, -0.005);
    return grp(
      part(G.cyl(0.0018, 0.0018, h, 4), "#d9d2c6", { p: [0, h / 2, 0], j: 0 }),
      part(g, hex, {
        p: [0, h + 0.03 * s, 0],
        s: [s, s, s],
        j: 0.0008,
        keepBase: false,
        vary: 0.08,
      }),
    );
  },
  bench(w = 0.36) {
    const g = new THREE.Group();
    g.add(
      part(G.box(w, 0.014, 0.08, 4, 1, 1), PC.wood, {
        p: [0, 0.163, 0],
        j: 0.0015,
        vary: 0.1,
      }),
    );
    g.add(
      part(G.box(w, 0.045, 0.01, 4, 1, 1), PC.wood, {
        p: [0, 0.225, -0.038],
        j: 0.0015,
        vary: 0.1,
      }),
    );
    for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) {
      for (const z of [-0.03, 0.03])
        g.add(
          part(G.box(0.012, 0.156, 0.012), PC.woodDk, {
            p: [x, 0.078, z],
            j: 0.001,
          }),
        );
      g.add(
        part(G.box(0.012, 0.07, 0.012), PC.woodDk, {
          p: [x, 0.2, -0.038],
          j: 0.001,
        }),
      );
    }
    return g;
  },
  lamp(h = 0.34) {
    return grp(
      part(G.cyl(0.006, 0.009, h, 6), PC.post, { p: [0, h / 2, 0], j: 0 }),
      part(G.box(0.03, 0.04, 0.03), "#fff1c9", {
        p: [0, h + 0.02, 0],
        j: 0.001,
      }),
      part(G.cone(0.026, 0.025, 4), PC.post, {
        p: [0, h + 0.052, 0],
        r: [0, Math.PI / 4, 0],
        j: 0,
      }),
    );
  },
  tulips(n = 3, seed = 1, s = 1) {
    const t = rng(seed),
      g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const x = (t() - 0.5) * 0.07 * s,
        z = (t() - 0.5) * 0.05 * s,
        h = (0.07 + t() * 0.05) * s;
      g.add(
        part(G.cyl(0.0025, 0.0035, h, 4), PC.stem, { p: [x, h / 2, z], j: 0 }),
      );
      g.add(
        part(G.ico(0.013 * s, 0), PC.tulip, {
          p: [x, h + 0.008 * s, z],
          s: [1, 1.3, 1],
          j: 0.0015,
          seed: seed + i,
          keepBase: false,
        }),
      );
      g.add(
        part(G.cone(0.009 * s, 0.055 * s, 3), PC.stem, {
          p: [x + 0.01 * s, 0.026 * s, z],
          r: [0, t() * 3, -0.35],
          j: 0.001,
        }),
      );
    }
    return g;
  },
  skyPanel(w = 2, h = 0.8) {
    const g = new THREE.PlaneGeometry(w, h, 10, 5);
    g.translate(0, h / 2, 0);
    jitter(g, 0.018, 31, true);
    const n = g.toNonIndexed(),
      p = n.attributes.position as THREE.BufferAttribute,
      col = new Float32Array(p.count * 3),
      r = rng(5),
      c = new THREE.Color();
    const stops: [number, string][] = [
      [0, "#f8c98b"],
      [0.3, "#f2a18c"],
      [0.62, "#d58aa5"],
      [1, "#9a86c0"],
    ];
    for (let i = 0; i < p.count; i += 3) {
      const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 / h;
      let k = 0;
      while (k < stops.length - 2 && y > stops[k + 1][0]) k++;
      const a = stops[k],
        b = stops[k + 1];
      c.set(a[1])
        .lerp(new THREE.Color(b[1]), clamp((y - a[0]) / (b[0] - a[0])))
        .multiplyScalar(1 + (r() - 0.5) * 0.12);
      for (let j = 0; j < 3; j++) {
        col[(i + j) * 3] = Math.min(1, c.r);
        col[(i + j) * 3 + 1] = Math.min(1, c.g);
        col[(i + j) * 3 + 2] = Math.min(1, c.b);
      }
    }
    n.setAttribute("color", new THREE.BufferAttribute(col, 3));
    n.computeVertexNormals();
    const m = new THREE.Mesh(n, paperMat("v2"));
    m.castShadow = true;
    m.receiveShadow = true;
    return grp(m);
  },
  sun(r = 0.15) {
    const g = new THREE.CircleGeometry(r, 9, 0, Math.PI);
    return grp(
      part(g, "#f7b24c", { j: 0, vary: 0.1, double: true }),
      part(new THREE.CircleGeometry(r * 0.7, 7, 0, Math.PI), "#fbd27a", {
        p: [0, 0, 0.003],
        j: 0,
        vary: 0.08,
        double: true,
      }),
    );
  },
  waves(w: number, h: number, hex: string, seed = 1) {
    const t = rng(seed),
      sh = new THREE.Shape(),
      n = 14;
    sh.moveTo(-w / 2, 0);
    sh.lineTo(w / 2, 0);
    for (let i = n; i >= 0; i--)
      sh.lineTo(
        -w / 2 + (w * i) / n,
        h + (i % 2 ? 0.014 : -0.004) + (t() - 0.5) * 0.01,
      );
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: 0.006,
      bevelEnabled: false,
    });
    g.translate(0, 0, -0.003);
    return grp(part(g, hex, { j: 0, vary: 0.08 }));
  },
  sailboat(s = 1) {
    const hull = new THREE.Shape();
    hull.moveTo(-0.035, 0);
    hull.lineTo(0.035, 0);
    hull.lineTo(0.05, 0.02);
    hull.lineTo(-0.05, 0.02);
    hull.closePath();
    const hg = new THREE.ExtrudeGeometry(hull, {
      depth: 0.012,
      bevelEnabled: false,
    });
    hg.translate(0, 0, -0.006);
    const sail = new THREE.Shape();
    sail.moveTo(0, 0.022);
    sail.lineTo(0.034, 0.022);
    sail.lineTo(0, 0.1);
    sail.closePath();
    const sg = new THREE.ExtrudeGeometry(sail, {
      depth: 0.003,
      bevelEnabled: false,
    });
    const g = grp(
      part(hg, "#e9785f", { j: 0 }),
      part(sg, "#fff8ee", { j: 0, p: [0.002, 0, -0.0015] }),
      part(G.cyl(0.0015, 0.0015, 0.09, 4), PC.woodDk, {
        p: [0, 0.065, 0],
        j: 0,
      }),
    );
    g.scale.setScalar(s);
    return g;
  },
  gull(h: number) {
    return grp(
      part(G.cyl(0.0016, 0.0016, h, 4), "#d9d2c6", { p: [0, h / 2, 0], j: 0 }),
      part(G.box(0.03, 0.003, 0.008), "#f1ede6", {
        p: [-0.013, h + 0.006, 0],
        r: [0, 0, 0.35],
        j: 0,
      }),
      part(G.box(0.03, 0.003, 0.008), "#f1ede6", {
        p: [0.013, h + 0.006, 0],
        r: [0, 0, -0.35],
        j: 0,
      }),
    );
  },
  basket() {
    const t = new THREE.TorusGeometry(0.03, 0.0035, 4, 8, Math.PI);
    return grp(
      part(G.cyl(0.042, 0.034, 0.045, 8), PC.wicker, {
        p: [0, 0.0225, 0],
        j: 0.0015,
      }),
      part(G.box(0.07, 0.006, 0.05), "#f2c7c7", {
        p: [0, 0.046, 0],
        r: [0, 0.3, 0.08],
        j: 0.001,
      }),
      part(t, PC.woodDk, { p: [0, 0.046, 0], j: 0 }),
    );
  },
  mug(hex: string) {
    return grp(
      part(G.cyl(0.013, 0.012, 0.028, 7), hex, { p: [0, 0.014, 0], j: 0.0008 }),
      part(new THREE.TorusGeometry(0.007, 0.002, 4, 6), hex, {
        p: [0.014, 0.015, 0],
        j: 0,
      }),
    );
  },
  rock(r: number, seed = 1) {
    return grp(
      part(G.dodec(r), "#b9b2a6", {
        p: [0, r * 0.5, 0],
        s: [1.3, 0.7, 1],
        j: r * 0.12,
        seed,
        vary: 0.14,
      }),
    );
  },
};
