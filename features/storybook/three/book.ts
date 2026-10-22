/* =====================================================================
   THE BOOK — hinged at the spine (x = 0, y = Y0), lying on the table.
   leaf 0      : front board + first page block (rigid)
   leaf 1..N-1 : paper leaves that bend as they turn
   leaf N      : back board + last page block (rigid)
   Spread k shows the back of leaf k (left) and the front of leaf k+1 (right).
   ===================================================================== */
import * as THREE from "three";
import {
  D,
  EPS,
  HB,
  OVER,
  TB,
  W,
  Y0,
  clamp,
  lerp,
  smooth,
  tex,
} from "@/features/storybook/three/core";
import {
  backCanvas,
  coverCanvas,
  edgeCanvas,
} from "@/features/storybook/three/prints";

function surfGeo(nx: number) {
  const g = new THREE.BufferGeometry(),
    pos = new Float32Array((nx + 1) * 2 * 3),
    uv = new Float32Array((nx + 1) * 2 * 2),
    idx: number[] = [];
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j < 2; j++) {
      const k = i * 2 + j,
        s = (i / nx) * W,
        z = j ? D / 2 : -D / 2;
      pos[k * 3] = s;
      pos[k * 3 + 1] = 0;
      pos[k * 3 + 2] = z;
      uv[k * 2] = i / nx;
      uv[k * 2 + 1] = j ? 0 : 1;
    }
  for (let i = 0; i < nx; i++) {
    const a = i * 2,
      b = a + 2,
      c = a + 1,
      d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  g.setIndex(idx);
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
/* page texture for one half of a spread; `left` halves are mirrored for back faces */
function halfTex(canvasEl: HTMLCanvasElement, left: boolean) {
  const t = tex(canvasEl);
  t.anisotropy = 8;
  if (left) {
    t.repeat.set(-0.5, 1);
    t.offset.set(0.5, 0);
  } else {
    t.repeat.set(0.5, 1);
    t.offset.set(0.5, 0);
  }
  return t;
}
function pageMat(t: THREE.Texture, side: THREE.Side) {
  return new THREE.MeshStandardMaterial({
    map: t,
    roughness: 0.9,
    metalness: 0,
    side,
    shadowSide: THREE.DoubleSide,
  });
}

type Leaf =
  | { rigid: true; g: THREE.Group; ly: number }
  | {
      rigid: false;
      geo: THREE.BufferGeometry;
      f: THREE.Mesh;
      b: THREE.Mesh;
      lastP?: number;
    };

export class Book {
  N: number;
  g = new THREE.Group();
  p: number[];
  th: number[];
  bend: number[];
  py: number[];
  leaves: Leaf[] = [];
  spine: THREE.Mesh;

  constructor(prints: HTMLCanvasElement[]) {
    const N = prints.length;
    this.N = N;
    this.p = new Array(N + 1).fill(0);
    this.th = new Array(N + 1).fill(0);
    this.bend = new Array(N + 1).fill(0);
    this.py = new Array(N + 1).fill(Y0);
    const cloth = new THREE.MeshStandardMaterial({
      color: "#3e5878",
      roughness: 0.96,
    });
    const edgeT = tex(edgeCanvas(), { repeat: [1, 1] });
    const edge = new THREE.MeshStandardMaterial({
      map: edgeT,
      roughness: 0.95,
    });
    const plain = new THREE.MeshStandardMaterial({
      color: "#f2ebdd",
      roughness: 0.95,
    });
    const coverM = new THREE.MeshStandardMaterial({
      map: tex(coverCanvas()),
      roughness: 0.92,
    });
    const bt = tex(backCanvas());
    bt.center.set(0.5, 0.5);
    bt.rotation = Math.PI;
    const backM = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.92 });
    const shadowed = (m: THREE.Mesh) => {
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    const blockGeo = new THREE.BoxGeometry(W - 0.004, HB, D),
      boardGeo = new THREE.BoxGeometry(W + OVER, TB, D + 2 * OVER);

    // front unit
    {
      const u = new THREE.Group();
      const blk = shadowed(
        new THREE.Mesh(blockGeo, [edge, edge, plain, plain, edge, edge]),
      );
      blk.position.set(0.002 + W / 2, HB / 2, 0);
      const brd = shadowed(
        new THREE.Mesh(boardGeo, [cloth, cloth, coverM, cloth, cloth, cloth]),
      );
      brd.position.set((W + OVER) / 2, HB + TB / 2, 0);
      const surf = shadowed(
        new THREE.Mesh(
          surfGeo(1),
          pageMat(halfTex(prints[0], true), THREE.BackSide),
        ),
      );
      surf.position.y = -0.0006;
      u.add(blk, brd, surf);
      this.g.add(u);
      this.leaves.push({ rigid: true, g: u, ly: -0.0006 });
    }
    // paper leaves
    for (let i = 1; i < N; i++) {
      const geo = surfGeo(30);
      const f = shadowed(
        new THREE.Mesh(
          geo,
          pageMat(halfTex(prints[i - 1], false), THREE.FrontSide),
        ),
      );
      const b = shadowed(
        new THREE.Mesh(geo, pageMat(halfTex(prints[i], true), THREE.BackSide)),
      );
      f.frustumCulled = b.frustumCulled = false;
      this.g.add(f, b);
      this.leaves.push({ rigid: false, geo, f, b });
    }
    // back unit
    {
      const u = new THREE.Group();
      const blk = shadowed(
        new THREE.Mesh(blockGeo, [edge, edge, plain, plain, edge, edge]),
      );
      blk.position.set(0.002 + W / 2, -HB / 2, 0);
      const brd = shadowed(
        new THREE.Mesh(boardGeo, [cloth, cloth, cloth, backM, cloth, cloth]),
      );
      brd.position.set((W + OVER) / 2, -HB - TB / 2, 0);
      const surf = shadowed(
        new THREE.Mesh(
          surfGeo(1),
          pageMat(halfTex(prints[N - 1], false), THREE.FrontSide),
        ),
      );
      surf.position.y = 0.0006;
      u.add(blk, brd, surf);
      this.g.add(u);
      this.leaves.push({ rigid: true, g: u, ly: 0.0006 });
    }
    // spine
    this.spine = shadowed(
      new THREE.Mesh(new THREE.BoxGeometry(0.018, 1, D + 2 * OVER), cloth),
    );
    this.g.add(this.spine);
    this.update(this.p);
  }

  /* point on leaf i at distance s from the spine, before the stack-height offset */
  curve(i: number, s: number): [number, number, number] {
    const th = this.th[i],
      b = this.bend[i];
    if (b < 1e-4) return [s * Math.cos(th), s * Math.sin(th), th];
    const c = -b / W;
    return [
      (Math.sin(th + c * s) - Math.sin(th)) / c,
      (Math.cos(th) - Math.cos(th + c * s)) / c,
      th + c * s,
    ];
  }

  update(p: number[]) {
    const N = this.N;
    for (let i = 0; i <= N; i++) {
      this.p[i] = p[i];
      this.th[i] = Math.PI * p[i];
      const sm = smooth(0, 1, p[i]);
      if (i === 0) this.py[i] = lerp(Y0 + N * EPS, Y0, sm);
      else if (i === N) this.py[i] = lerp(Y0, Y0 + N * EPS, sm);
      else this.py[i] = lerp(Y0 + (N - i) * EPS, Y0 + i * EPS, sm);
      this.bend[i] = i > 0 && i < N ? Math.sin(Math.PI * p[i]) * 0.62 : 0;
      const L = this.leaves[i];
      if (L.rigid) {
        L.g.position.set(0, this.py[i], 0);
        L.g.rotation.z = this.th[i];
        continue;
      }
      if (L.lastP === p[i]) continue;
      L.lastP = p[i];
      const pos = L.geo.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        const s = ((k >> 1) / 30) * W,
          q = this.curve(i, s);
        pos.setX(k, q[0]);
        pos.setY(k, this.py[i] + q[1]);
      }
      pos.needsUpdate = true;
      L.geo.computeVertexNormals();
      L.geo.computeBoundingSphere();
    }
    // spine: a wall on the left of the closed book, flattening under the gutter when open
    const f = p[0],
      g = p[N],
      open = smooth(0, 0.6, f) * (1 - smooth(0.4, 1, g));
    const h = lerp(2 * Y0 + N * EPS, Y0 - 0.004, open);
    this.spine.scale.y = h;
    this.spine.position.set(
      lerp(-0.009, 0, smooth(0, 0.5, f)) + lerp(0, 0.009, smooth(0.5, 1, g)),
      h / 2,
      0,
    );
  }

  /* world frame (in book space) of a point on a page surface */
  anchor(i: number, side: "front" | "back", s: number, z: number) {
    const L = this.leaves[i];
    let x: number, y: number, ang: number;
    if (L.rigid) {
      const th = this.th[i],
        c = Math.cos(th),
        sn = Math.sin(th);
      x = s * c - L.ly * sn;
      y = this.py[i] + s * sn + L.ly * c;
      ang = th;
    } else {
      const q = this.curve(i, s);
      x = q[0];
      y = this.py[i] + q[1];
      ang = q[2];
      const n = side === "front" ? 1 : -1;
      x += -Math.sin(ang) * 0.0005 * n;
      y += Math.cos(ang) * 0.0005 * n;
    }
    return { x, y, z, psi: side === "front" ? ang : ang + Math.PI };
  }

  /* how far spread k is opened, 0 (closed) .. 1 (flat) */
  spreadOpen(k: number) {
    return clamp((this.th[k] - this.th[k + 1]) / Math.PI);
  }
}
