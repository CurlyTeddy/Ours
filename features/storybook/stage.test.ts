import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type Mock,
} from "vitest";
import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

interface FakeRenderer {
  opts: Record<string, unknown>;
  setPixelRatio: Mock;
  setSize: Mock;
  render: Mock;
  dispose: Mock;
  forceContextLoss: Mock;
}
const gl = vi.hoisted(() => ({
  fail: false,
  instances: [] as FakeRenderer[],
}));

vi.mock("next/font/google", () => {
  const font = (name: string) => () => ({
    className: name,
    variable: name,
    style: { fontFamily: `'${name}'` },
  });
  return {
    Corben: font("Corben"),
    Gaegu: font("Gaegu"),
    Nunito: font("Nunito"),
    Playpen_Sans: font("Playpen"),
  };
});
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class FakeWebGLRenderer {
    opts: Record<string, unknown>;
    domElement: HTMLCanvasElement;
    shadowMap = { enabled: false, type: 0 };
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    setClearColor = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    forceContextLoss = vi.fn();
    constructor(opts: Record<string, unknown>) {
      if (gl.fail) throw new Error("Error creating WebGL context.");
      this.opts = opts;
      this.domElement = opts.canvas as HTMLCanvasElement;
      gl.instances.push(this);
    }
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

import { bootStage, type StageElements } from "@/features/storybook/stage";
import { STORY } from "@/features/storybook/story";

// jsdom has no 2D canvas: a recorder that accepts every call the prints and sky make.
const drawn: string[] = [];
function fakeCtx(canvas: HTMLCanvasElement) {
  const props: Record<string | symbol, unknown> = { canvas };
  return new Proxy(props, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "getImageData")
        return (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
        });
      if (key === "measureText") return () => ({ width: 10 });
      if (
        key === "createLinearGradient" ||
        key === "createRadialGradient" ||
        key === "createPattern"
      )
        return () => ({ addColorStop: () => undefined });
      return () => {
        drawn.push(String(key));
      };
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
}

function makeEls(): StageElements {
  const div = () => document.body.appendChild(document.createElement("div"));
  return {
    canvas: document.body.appendChild(document.createElement("canvas")),
    skyHost: div(),
    scrollTrack: div(),
    intro: [div(), div()],
    heads: STORY.chapters.map(div),
    caps: STORY.chapters.map(div),
    endHead: div(),
    endCap: div(),
  };
}

function setViewport(w: number, h: number, dpr = 3) {
  Object.assign(window, {
    innerWidth: w,
    innerHeight: h,
    devicePixelRatio: dpr,
  });
}

const last = () => gl.instances[gl.instances.length - 1];
function keyLight() {
  const scene = last().render.mock.calls[0][0] as THREE.Scene;
  let key: THREE.DirectionalLight | undefined;
  scene.traverse((o) => {
    if (o instanceof THREE.DirectionalLight && o.castShadow) key = o;
  });
  return key as THREE.DirectionalLight;
}

beforeEach(() => {
  gl.fail = false;
  gl.instances.length = 0;
  drawn.length = 0;
  document.body.innerHTML = "";
  setViewport(1440, 900, 3);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement, type: string) {
      return type === "2d" ? (fakeCtx(this) as never) : null;
    } as never,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,AAAA",
  );
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load: vi.fn(() => Promise.resolve([])) },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const st of ScrollTrigger.getAll()) st.kill();
});

describe("R7: no WebGL", () => {
  test("renderer creation throws: no-webgl and nothing added to the sky host", async () => {
    gl.fail = true;
    const els = makeEls();
    await expect(bootStage(els, { reduced: false })).resolves.toEqual({
      kind: "no-webgl",
    });
    expect(els.skyHost.children).toHaveLength(0);
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });
});

describe("R14: font wait", () => {
  test("loads the next/font family names", async () => {
    const r = await bootStage(makeEls(), { reduced: false });
    const load = vi.mocked(document.fonts.load);
    expect(load.mock.calls.map((c) => c[0])).toEqual([
      "400 80px 'Corben'",
      "400 40px 'Gaegu'",
      "700 20px 'Nunito'",
    ]);
    if (r.kind === "animated") r.dispose();
  });

  test("a failing font load does not stop the boot", async () => {
    vi.mocked(document.fonts.load).mockRejectedValue(new Error("offline"));
    const r = await bootStage(makeEls(), { reduced: false });
    expect(r.kind).toBe("animated");
    if (r.kind === "animated") r.dispose();
  });
});

describe("R6: reduced motion", () => {
  test("renders one 1400x900 JPEG per moment, then frees the renderer", async () => {
    const toDataURL = vi.mocked(HTMLCanvasElement.prototype.toDataURL);
    const els = makeEls();
    const r = await bootStage(els, { reduced: true });

    expect(r).toEqual({
      kind: "stills",
      images: Array(STORY.chapters.length + 1).fill(
        "data:image/jpeg;base64,AAAA",
      ),
    });
    expect(toDataURL.mock.calls.every((c) => c[0] === "image/jpeg")).toBe(true);
    const renderer = last();
    expect(renderer.opts.preserveDrawingBuffer).toBe(true);
    expect(renderer.setSize).toHaveBeenLastCalledWith(1400, 900, false);
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1);
    expect(renderer.render).toHaveBeenCalledTimes(STORY.chapters.length + 1);
    expect(
      drawn.filter((k) => k === "drawImage").length,
    ).toBeGreaterThanOrEqual(STORY.chapters.length + 1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(els.skyHost.children).toHaveLength(0);
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });
});

describe("R13: renderer sizing", () => {
  test("desktop: shadow map 2048, pixel ratio capped at 2", async () => {
    setViewport(1440, 900, 3);
    const r = await bootStage(makeEls(), { reduced: false });
    expect(last().setPixelRatio).toHaveBeenCalledWith(2);
    expect(keyLight().shadow.mapSize.toArray()).toEqual([2048, 2048]);
    expect(last().opts.preserveDrawingBuffer).toBe(false);
    if (r.kind === "animated") r.dispose();
  });

  test.each([
    [390, 844],
    [375, 667],
    [900, 639],
  ])(
    "small %ix%i: shadow map 1024, pixel ratio capped at 1.5",
    async (w, h) => {
      setViewport(w, h, 3);
      const r = await bootStage(makeEls(), { reduced: false });
      expect(last().setPixelRatio).toHaveBeenCalledWith(1.5);
      expect(keyLight().shadow.mapSize.toArray()).toEqual([1024, 1024]);
      if (r.kind === "animated") r.dispose();
    },
  );

  test("640 exactly counts as large; low dpr is kept", async () => {
    setViewport(640, 640, 1);
    const r = await bootStage(makeEls(), { reduced: false });
    expect(last().setPixelRatio).toHaveBeenCalledWith(1);
    expect(keyLight().shadow.mapSize.x).toBe(2048);
    if (r.kind === "animated") r.dispose();
  });
});

describe("R2/R3: animated timeline", () => {
  test("one scrubbed ScrollTrigger on the track; track length from the formula", async () => {
    const els = makeEls();
    const r = await bootStage(els, { reduced: false });
    const triggers = ScrollTrigger.getAll();
    expect(triggers).toHaveLength(1);
    const st = triggers[0];
    expect(st.vars.scrub).toBe(1);
    expect(st.vars.trigger).toBe(els.scrollTrack);
    expect(st.vars.start).toBe("top top");
    expect(st.vars.end).toBe("bottom bottom");
    const duration = st.animation?.duration() ?? 0;
    // handoff: OPEN 2.8, TURN 2.1, HOLD 1.6 over three chapters
    expect(duration).toBeCloseTo(19.65, 5);
    expect(els.scrollTrack.style.height).toBe(
      `${Math.round(900 + duration * 900 * 0.55)}px`,
    );
    expect(els.skyHost.children).toHaveLength(STORY.chapters.length + 2);
    if (r.kind === "animated") r.dispose();
  });

  test("renders on demand: once at boot, again only after the timeline moves", async () => {
    const add = vi.spyOn(gsap.ticker, "add");
    const els = makeEls();
    const r = await bootStage(els, { reduced: false });
    const tick = add.mock.calls[0][0] as () => void;
    const render = last().render;
    const tl = ScrollTrigger.getAll()[0].animation as gsap.core.Timeline;

    tick(); // the boot frame left the scene dirty once
    const base = render.mock.calls.length;
    tick();
    tick();
    expect(render.mock.calls.length).toBe(base);

    tl.progress(0.5);
    tick();
    expect(render.mock.calls.length).toBe(base + 1);
    tick();
    expect(render.mock.calls.length).toBe(base + 1);
    if (r.kind === "animated") r.dispose();
  });

  test("window resize resizes the renderer and re-renders", async () => {
    const add = vi.spyOn(gsap.ticker, "add");
    const r = await bootStage(makeEls(), { reduced: false });
    const tick = add.mock.calls[0][0] as () => void;
    tick();
    const renders = last().render.mock.calls.length;
    setViewport(800, 600, 1);
    window.dispatchEvent(new Event("resize"));
    expect(last().setSize).toHaveBeenLastCalledWith(800, 600, false);
    tick();
    expect(last().render.mock.calls.length).toBe(renders + 1);
    if (r.kind === "animated") r.dispose();
  });

  test("scrolling to the end and back reverses the overlay", async () => {
    const els = makeEls();
    const r = await bootStage(els, { reduced: false });
    const tl = ScrollTrigger.getAll()[0].animation as gsap.core.Timeline;
    const shown = (el: HTMLElement) => el.style.visibility !== "hidden";

    tl.progress(1);
    expect(els.intro.some(shown)).toBe(false);
    expect(shown(els.endHead)).toBe(true);
    expect(shown(els.endCap)).toBe(true);
    expect(els.heads.some(shown)).toBe(false);

    tl.progress(0);
    expect(els.intro.every(shown)).toBe(true);
    expect(shown(els.endHead)).toBe(false);
    expect(shown(els.endCap)).toBe(false);
    if (r.kind === "animated") r.dispose();
  });
});

describe("R5: dispose", () => {
  test("removes ticker, listeners, ScrollTrigger, renderer, sky and GPU objects", async () => {
    // Warm-up boot: ScrollTrigger adds its own app-wide window listeners once, on first use.
    const warm = await bootStage(makeEls(), { reduced: false });
    if (warm.kind === "animated") warm.dispose();
    const tickerAdd = vi.spyOn(gsap.ticker, "add");
    const tickerRemove = vi.spyOn(gsap.ticker, "remove");
    const winAdd = vi.spyOn(window, "addEventListener");
    const winRemove = vi.spyOn(window, "removeEventListener");
    const stAdd = vi.spyOn(ScrollTrigger, "addEventListener");
    const stRemove = vi.spyOn(ScrollTrigger, "removeEventListener");
    const geoDispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    const matDispose = vi.spyOn(THREE.Material.prototype, "dispose");
    const texDispose = vi.spyOn(THREE.Texture.prototype, "dispose");

    const els = makeEls();
    const r = await bootStage(els, { reduced: false });
    expect(r.kind).toBe("animated");
    if (r.kind !== "animated") return;
    const renderer = last();
    r.dispose();

    expect(tickerRemove).toHaveBeenCalledWith(tickerAdd.mock.calls[0][0]);
    // GSAP's own viewport resize handler is app-wide and deduped; GSAP never removes it by design.
    const added = winAdd.mock.calls
      .filter((c) => (c[1] as { name?: string } | null)?.name !== "_onResize")
      .map((c) => [c[0], c[1]]);
    expect(added.length).toBeGreaterThan(0);
    for (const [type, fn] of added)
      expect(winRemove).toHaveBeenCalledWith(type, fn);
    const refresh = stAdd.mock.calls.find((c) => c[0] === "refreshInit");
    expect(refresh).toBeDefined();
    expect(stRemove).toHaveBeenCalledWith("refreshInit", refresh?.[1]);
    expect(ScrollTrigger.getAll()).toHaveLength(0);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(geoDispose).toHaveBeenCalled();
    expect(matDispose).toHaveBeenCalled();
    expect(texDispose).toHaveBeenCalled();
    expect(els.skyHost.children).toHaveLength(0);

    // a resize after dispose no longer reaches the renderer
    const sizes = renderer.setSize.mock.calls.length;
    window.dispatchEvent(new Event("resize"));
    expect(renderer.setSize.mock.calls.length).toBe(sizes);
  });

  test("a second boot after dispose works and owns the only ScrollTrigger", async () => {
    const first = await bootStage(makeEls(), { reduced: false });
    if (first.kind === "animated") first.dispose();
    const els = makeEls();
    const second = await bootStage(els, { reduced: false });
    expect(second.kind).toBe("animated");
    expect(ScrollTrigger.getAll()).toHaveLength(1);
    expect(els.skyHost.children).toHaveLength(STORY.chapters.length + 2);
    expect(gl.instances).toHaveLength(2);
    if (second.kind === "animated") second.dispose();
    expect(ScrollTrigger.getAll()).toHaveLength(0);
  });

  test("materials are not shared between boots", async () => {
    const mats = (scene: THREE.Scene) => {
      const s = new Set<THREE.Material>();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh)
          for (const m of [o.material].flat()) s.add(m);
      });
      return s;
    };
    const a = await bootStage(makeEls(), { reduced: false });
    const sceneA = last().render.mock.calls[0][0] as THREE.Scene;
    if (a.kind === "animated") a.dispose();
    const b = await bootStage(makeEls(), { reduced: false });
    const sceneB = last().render.mock.calls[0][0] as THREE.Scene;
    const shared = [...mats(sceneB)].filter((m) => mats(sceneA).has(m));
    expect(shared).toHaveLength(0);
    if (b.kind === "animated") b.dispose();
  });
});
