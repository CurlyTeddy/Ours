/* =====================================================================
   STAGE — renderer, table, light, camera, and the scroll timeline.
   The timeline only moves numbers (leaf angles, camera, light); frame()
   turns those numbers into the scene, so every step reverses exactly.
   ===================================================================== */
import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { corben, gaegu } from "@/components/ui/storybook-fonts";
import { nunito } from "@/components/ui/fonts";
import { buildSky } from "@/features/storybook/sky";
import { ENVS, STORY, envIndices } from "@/features/storybook/story";
import { Book } from "@/features/storybook/three/book";
import {
  D,
  W,
  canvas,
  ctx2d,
  clamp,
  lerp,
  resetMaterialCache,
  smooth,
  tex,
} from "@/features/storybook/three/core";
import {
  PRINTS,
  radialCanvas,
  tableCanvas,
} from "@/features/storybook/three/prints";
import { PopSpread, SCENES } from "@/features/storybook/three/scenes";

export interface StageElements {
  canvas: HTMLCanvasElement;
  skyHost: HTMLElement;
  scrollTrack: HTMLElement;
  intro: HTMLElement[];
  heads: HTMLElement[];
  caps: HTMLElement[];
  endHead: HTMLElement;
  endCap: HTMLElement;
}

export type StageResult =
  | { kind: "animated"; dispose(): void }
  | { kind: "stills"; images: string[] }
  | { kind: "no-webgl" };

const AZ = [-0.12, 0.1, -0.05];

export async function bootStage(
  els: StageElements,
  opts: { reduced: boolean },
): Promise<StageResult> {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: els.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: opts.reduced,
    });
  } catch {
    return { kind: "no-webgl" };
  }
  try {
    return await buildStage(renderer, els, opts);
  } catch (error) {
    // Free the GL context before the caller falls back to the text-only version.
    renderer.dispose();
    renderer.forceContextLoss();
    resetMaterialCache();
    throw error;
  }
}

async function buildStage(
  renderer: THREE.WebGLRenderer,
  els: StageElements,
  opts: { reduced: boolean },
): Promise<StageResult> {
  const N = STORY.chapters.length;
  const envIdx = envIndices;
  const envList = envIdx.map((i) => ENVS[i]);
  try {
    await Promise.race([
      Promise.all(
        [
          `400 80px ${corben.style.fontFamily}`,
          `400 40px ${gaegu.style.fontFamily}`,
          `700 20px ${nunito.style.fontFamily}`,
        ].map((f) => document.fonts.load(f)),
      ),
      new Promise((r) => setTimeout(r, 1800)),
    ]);
  } catch {
    // Fonts are a nicety for the printed cover; render with fallbacks.
  }

  // From here to the end of the build nothing awaits, so this boot owns the material cache.
  resetMaterialCache();
  const small = Math.min(innerWidth, innerHeight) < 640;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.6);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.castShadow = true;
  key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(key.shadow.camera, {
    left: -1.8,
    right: 1.8,
    top: 1.8,
    bottom: -1.8,
    near: 0.1,
    far: 9,
  });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xfff6ee, 0.16);
  fill.position.set(-2, 1.2, 2.5);
  scene.add(fill);

  // tabletop, fading into the backdrop
  const tableTex = tex(tableCanvas(), { repeat: [4, 4] });
  const fade = new THREE.CanvasTexture(
    radialCanvas("#ffffff", "#000000", 512, 0.27, 0.62),
  );
  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshStandardMaterial({
      map: tableTex,
      alphaMap: fade,
      transparent: true,
      roughness: 0.9,
      depthWrite: false,
    }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.001;
  table.receiveShadow = true;
  scene.add(table);
  const blobTex = new THREE.CanvasTexture(
    radialCanvas("rgba(40,28,18,.5)", "rgba(40,28,18,0)", 256),
  );
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: blobTex,
      transparent: true,
      depthWrite: false,
    }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = -0.0004;
  blob.renderOrder = 1;
  scene.add(blob);

  // book and pop-ups
  const prints = STORY.chapters.map((ch) => PRINTS[SCENES[ch.scene].print]());
  const book = new Book(prints);
  scene.add(book.g);
  const pops = STORY.chapters.map(
    (ch, k) => new PopSpread(book, k, SCENES[ch.scene], book.g),
  );

  // the sky behind the book: one layer per moment, composed for that moment's camera
  const views = envIdx.map((_, j) =>
    j === 0
      ? { azim: 0.3, elev: 0.95 }
      : j === N + 1
        ? { azim: -0.26, elev: 0.95 }
        : { azim: AZ[(j - 1) % 3], elev: 0.17 },
  );
  const sky = buildSky(els.skyHost, envIdx, views);
  let skyTime = 0;
  const envC = envList.map((e) => ({
    key: new THREE.Color(e.key),
    sky: new THREE.Color(e.sky),
    ground: new THREE.Color(e.ground),
    keyI: e.keyI,
    hemiI: e.hemiI,
    amb: e.amb,
    sun: new THREE.Vector3(...e.sun).normalize(),
  }));

  // state moved by the timeline
  const leaf = Array.from({ length: N + 1 }, () => ({ p: 0 }));
  const env = { v: 0 };
  const cam = { elev: 0.95, azim: 0.3, fit: 0, tx: W / 2, ty: 0.05, tz: 0.05 };
  const sunTmp = new THREE.Vector3(),
    tgt = new THREE.Vector3();

  function fitDist(open: boolean) {
    const a = camera.aspect,
      t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const k = clamp((a - 0.45) / 0.8);
    return open
      ? Math.max(lerp(1.3, 2.3, k) / 2 / (t * a), 1.68 / 2 / t)
      : Math.max(lerp(1.75, 1.7, k) / 2 / (t * a), 2.2 / 2 / t);
  }
  function frame() {
    book.update(leaf.map((l) => l.p));
    for (const p of pops) p.update();
    // light and backdrop
    const i = Math.min(envC.length - 2, Math.floor(env.v)),
      f = env.v - i,
      A = envC[i],
      B = envC[i + 1];
    key.color.copy(A.key).lerp(B.key, f);
    key.intensity = lerp(A.keyI, B.keyI, f);
    hemi.color.copy(A.sky).lerp(B.sky, f);
    hemi.groundColor.copy(A.ground).lerp(B.ground, f);
    hemi.intensity = lerp(A.hemiI, B.hemiI, f);
    amb.intensity = lerp(A.amb, B.amb, f);
    sunTmp.copy(A.sun).lerp(B.sun, f).normalize();
    // camera
    const dist = lerp(fitDist(false), fitDist(true), cam.fit);
    tgt.set(cam.tx, cam.ty, cam.tz);
    camera.position.set(
      tgt.x + dist * Math.cos(cam.elev) * Math.sin(cam.azim),
      tgt.y + dist * Math.sin(cam.elev),
      tgt.z + dist * Math.cos(cam.elev) * Math.cos(cam.azim),
    );
    camera.lookAt(tgt);
    key.target.position.set(cam.tx * 0.5, 0, 0);
    key.position.copy(key.target.position).addScaledVector(sunTmp, 4);
    // soft contact shadow under the book's footprint
    const fo = smooth(0, 1, leaf[0].p),
      go = smooth(0, 1, leaf[N].p);
    blob.position.x = (W / 2) * (1 - fo) - (W / 2) * go;
    blob.scale.set(W * (1 + fo - go) + 0.32, D + 0.34, 1);
    renderer.render(scene, camera);
    sky.update(env.v, cam, skyTime);
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    sky.resize();
  }
  function disposeScene() {
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      for (const m of [o.material].flat() as THREE.MeshStandardMaterial[]) {
        m.map?.dispose();
        m.alphaMap?.dispose();
        m.dispose();
      }
    });
    // dispose() first removes three's context-lost listener, so losing the context logs nothing.
    renderer.dispose();
    renderer.forceContextLoss();
    resetMaterialCache();
    sky.dispose();
  }

  // reduced motion: render one still per chapter instead of animating
  if (opts.reduced) {
    renderer.setPixelRatio(1);
    renderer.setSize(1400, 900, false);
    camera.aspect = 1400 / 900;
    camera.updateProjectionMatrix();
    const shots: string[] = [],
      out = canvas(1400, 900),
      octx = ctx2d(out);
    for (let s = 0; s <= N; s++) {
      leaf.forEach((l, i) => {
        l.p = s > 0 && i < s ? 1 : 0;
      });
      env.v = s;
      Object.assign(
        cam,
        s === 0
          ? { elev: 0.95, azim: 0.3, fit: 0, tx: W / 2, ty: 0.05, tz: 0.05 }
          : {
              elev: 0.17,
              azim: AZ[(s - 1) % 3],
              fit: 1,
              tx: 0,
              ty: 0.42,
              tz: -0.08,
            },
      );
      pops.forEach((p) => (p.lastU = -1));
      octx.clearRect(0, 0, 1400, 900);
      await sky.paint(octx, s, 1400, 900, cam);
      frame();
      octx.drawImage(renderer.domElement, 0, 0, 1400, 900);
      shots.push(out.toDataURL("image/jpeg", 0.9));
    }
    disposeScene();
    return { kind: "stills", images: shots };
  }

  // the timeline
  gsap.registerPlugin(ScrollTrigger);
  let dirty = true;
  let tl!: gsap.core.Timeline;
  const setLen = () => {
    els.scrollTrack.style.height =
      Math.round(innerHeight + tl.duration() * innerHeight * 0.55) + "px";
  };
  const ctx = gsap.context(() => {
    tl = gsap.timeline({
      defaults: { ease: "none" },
      onUpdate: () => {
        dirty = true;
        skyTime = tl.time();
      },
    });
    const { intro, heads: headEls, caps: capEls, endHead, endCap } = els;
    const OPEN = 2.8,
      TURN = 2.1,
      HOLD = 1.6,
      az = AZ;
    const envStart = [0],
      envDur = [0];
    let t = 0.6;
    tl.to(
      intro,
      { autoAlpha: 0, y: -10, duration: 0.45, ease: "power1.in" },
      t,
    );
    tl.to(leaf[0], { p: 1, duration: OPEN, ease: "power2.inOut" }, t);
    tl.to(
      cam,
      {
        elev: 0.17,
        azim: az[0],
        fit: 1,
        tx: 0,
        ty: 0.42,
        tz: -0.08,
        duration: OPEN,
        ease: "power2.inOut",
      },
      t,
    );
    tl.to(env, { v: 1, duration: OPEN * 0.8, ease: "sine.inOut" }, t + 0.4);
    envStart.push(t + 0.4);
    envDur.push(OPEN * 0.8);
    for (let k = 0; k < N; k++) {
      const settle = t + (k === 0 ? OPEN : TURN);
      tl.fromTo(
        headEls[k],
        { autoAlpha: 0, y: 16 },
        { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out" },
        settle - 0.35,
      );
      tl.fromTo(
        capEls[k],
        { autoAlpha: 0, y: 16 },
        { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out" },
        settle - 0.2,
      );
      const hold = HOLD * (k === N - 1 ? 1.5 : 1);
      tl.to(
        cam,
        { azim: az[k % 3] + 0.08, duration: hold + 0.4, ease: "sine.inOut" },
        settle,
      );
      const out = settle + hold + 0.45;
      tl.to(
        [headEls[k], capEls[k]],
        { autoAlpha: 0, y: -10, duration: 0.4, ease: "power1.in" },
        out,
      );
      if (k < N - 1) {
        const s = out + 0.1;
        tl.to(leaf[k + 1], { p: 1, duration: TURN, ease: "power1.inOut" }, s);
        tl.to(
          cam,
          { elev: 0.3, azim: 0.46, duration: TURN / 2, ease: "sine.inOut" },
          s,
        );
        tl.to(
          cam,
          {
            elev: 0.17,
            azim: az[(k + 1) % 3],
            duration: TURN / 2,
            ease: "sine.inOut",
          },
          s + TURN / 2,
        );
        tl.to(env, { v: k + 2, duration: TURN, ease: "sine.inOut" }, s + 0.2);
        envStart.push(s + 0.2);
        envDur.push(TURN);
        t = s;
      } else {
        const c = out + 0.1;
        tl.to(leaf[N], { p: 1, duration: OPEN, ease: "power2.inOut" }, c);
        tl.to(
          cam,
          {
            elev: 0.95,
            azim: -0.26,
            fit: 0,
            tx: -W / 2,
            ty: 0.05,
            tz: 0.05,
            duration: OPEN,
            ease: "power2.inOut",
          },
          c,
        );
        tl.to(
          env,
          { v: N + 1, duration: OPEN * 0.8, ease: "sine.inOut" },
          c + 0.4,
        );
        envStart.push(c + 0.4);
        envDur.push(OPEN * 0.8);
        tl.fromTo(
          endHead,
          { autoAlpha: 0, y: 18 },
          { autoAlpha: 1, y: 0, duration: 0.7, ease: "power2.out" },
          c + OPEN + 0.05,
        );
        tl.fromTo(
          endCap,
          { autoAlpha: 0, y: 18, scale: 0.94 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.7,
            ease: "back.out(1.6)",
          },
          c + OPEN + 0.4,
        );
        tl.to({}, { duration: 0.9 }, c + OPEN + 1.1);
      }
    }

    sky.layers.forEach((L, j) => {
      L.t0 = envStart[j];
      L.t1 =
        j + 1 < envStart.length
          ? envStart[j + 1] + envDur[j + 1]
          : tl.duration();
    });

    setLen();
    resize();
    ScrollTrigger.config({ ignoreMobileResize: true });
    ScrollTrigger.addEventListener("refreshInit", setLen);
    ScrollTrigger.create({
      trigger: els.scrollTrack,
      start: "top top",
      end: "bottom bottom",
      scrub: 1,
      animation: tl,
    });
  });
  const onResize = () => {
    resize();
    dirty = true;
  };
  const tick = () => {
    if (dirty) {
      dirty = false;
      frame();
    }
  };
  addEventListener("resize", onResize);
  gsap.ticker.add(tick);
  frame();

  return {
    kind: "animated",
    dispose() {
      gsap.ticker.remove(tick);
      removeEventListener("resize", onResize);
      ScrollTrigger.removeEventListener("refreshInit", setLen);
      ctx.revert();
      disposeScene();
    },
  };
}
