import { afterEach, describe, expect, test } from "vitest";
import { SKIES, buildSky, skyCSS } from "@/features/storybook/sky";

const views = [
  { azim: 0.3, elev: 0.95 },
  { azim: -0.12, elev: 0.17 },
  { azim: 0.1, elev: 0.17 },
  { azim: -0.05, elev: 0.17 },
  { azim: -0.26, elev: 0.95 },
];
const cam = { elev: 0.95, azim: 0.3, fit: 0, tx: 0.5, ty: 0.05, tz: 0.05 };

describe("R6: skyCSS", () => {
  test("radial gradient for the intro", () => {
    expect(skyCSS(SKIES[0].grad)).toBe(
      "radial-gradient(120% 90% at 50% 40%,#f4ede3 0%,#e9e0d3 55%,#d9ccbb 100%)",
    );
  });

  test("linear gradient for the spring chapter", () => {
    expect(skyCSS(SKIES[1].grad)).toBe(
      "linear-gradient(180deg,#b9d6ec 0%,#ecdbe6 40%,#f7e4e0 66%,#efe3d8 100%)",
    );
  });

  test("five skies: intro, spring, lake, sunset, ending", () => {
    expect(SKIES).toHaveLength(5);
  });
});

describe("R2/R5: buildSky", () => {
  test("adds one layer per moment to the host", () => {
    const host = document.createElement("div");
    const sky = buildSky(host, [0, 1, 2, 3, 4], views);
    expect(sky.layers).toHaveLength(5);
    expect(host.children).toHaveLength(5);
    sky.dispose();
  });

  test("crossfades layers with env.v", () => {
    const host = document.createElement("div");
    const sky = buildSky(host, [0, 1, 2, 3, 4], views);
    const layer = (j: number) => host.children[j] as HTMLElement;

    sky.update(0, cam, 0);
    expect(Number(layer(0).style.opacity)).toBe(1);
    expect(layer(1).style.visibility).toBe("hidden");

    sky.update(1.5, cam, 0);
    expect(Number(layer(1).style.opacity)).toBe(1);
    expect(Number(layer(2).style.opacity)).toBe(0.5);
    expect(layer(3).style.visibility).toBe("hidden");

    sky.update(0, cam, 0);
    expect(layer(1).style.visibility).toBe("hidden");
    sky.dispose();
  });

  test("dispose removes only what it added", () => {
    const host = document.createElement("div");
    const own = document.createElement("span");
    host.appendChild(own);
    const sky = buildSky(host, [0, 1, 2, 3, 4], views);
    sky.dispose();
    expect([...host.children]).toEqual([own]);
  });

  test("a second build after dispose starts clean", () => {
    const host = document.createElement("div");
    buildSky(host, [0, 1, 2, 3, 4], views).dispose();
    const sky = buildSky(host, [0, 1, 2, 3, 4], views);
    expect(host.children).toHaveLength(5);
    sky.dispose();
  });
});

describe("R6: buildSky paint (stills)", () => {
  function recorder() {
    const calls: { op: string; alpha: number }[] = [];
    let alpha = 1;
    const gradient = { addColorStop: () => undefined };
    const ctx = {
      get globalAlpha() {
        return alpha;
      },
      set globalAlpha(v: number) {
        alpha = v;
      },
      fillStyle: "",
      save: () => undefined,
      restore: () => undefined,
      translate: () => undefined,
      scale: () => undefined,
      createRadialGradient: () => gradient,
      createLinearGradient: () => gradient,
      fillRect: () => calls.push({ op: "fillRect", alpha }),
      drawImage: () => calls.push({ op: "drawImage", alpha }),
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  }
  const decode = HTMLImageElement.prototype.decode;
  afterEach(() => {
    HTMLImageElement.prototype.decode = decode;
  });

  test("paints the gradient and every non-falling item; fading stars at .8", async () => {
    HTMLImageElement.prototype.decode = () => Promise.resolve();
    const host = document.createElement("div");
    const sky = buildSky(host, [0, 1, 2, 3, 4], views);
    const { ctx, calls } = recorder();
    // sunset layer: 30 fading stars + sun + 4 clouds + 2 birds
    await sky.paint(ctx, 3, 1400, 900, cam);
    expect(calls[0].op).toBe("fillRect");
    const draws = calls.filter((c) => c.op === "drawImage");
    expect(draws).toHaveLength(37);
    expect(draws.filter((c) => c.alpha === 0.8)).toHaveLength(30);
    expect(ctx.globalAlpha).toBe(1);
    sky.dispose();
  });

  test("skips falling petals", async () => {
    HTMLImageElement.prototype.decode = () => Promise.resolve();
    const host = document.createElement("div");
    const sky = buildSky(host, [0, 1, 2, 3, 4], views);
    const { ctx, calls } = recorder();
    // spring layer: sun + 5 clouds + 2 birds + 18 petals
    await sky.paint(ctx, 1, 1400, 900, cam);
    expect(calls.filter((c) => c.op === "drawImage")).toHaveLength(8);
    sky.dispose();
  });

  test("an image that fails to decode is skipped, the gradient still paints", async () => {
    HTMLImageElement.prototype.decode = () => Promise.reject(new Error("bad"));
    const host = document.createElement("div");
    const sky = buildSky(host, [0, 1, 2, 3, 4], views);
    const { ctx, calls } = recorder();
    await sky.paint(ctx, 2, 1400, 900, cam);
    expect(calls.map((c) => c.op)).toEqual(["fillRect"]);
    sky.dispose();
  });
});

describe("R2: sky items move with time and camera", () => {
  test("fading stars fade in over the layer's local time; petals rotate", () => {
    const host = document.createElement("div");
    const sky = buildSky(host, [0, 1, 2, 3, 4], views);
    for (const L of sky.layers) {
      L.t0 = 0;
      L.t1 = 10;
    }
    const star = host.children[3].querySelector(".twinkle") as HTMLElement;
    sky.update(4, cam, 0);
    expect(Number(star.style.opacity)).toBe(0);
    sky.update(4, cam, 10);
    expect(Number(star.style.opacity)).toBe(1);

    const petal = host.children[1].querySelector(".petal") as HTMLElement;
    sky.update(1, cam, 5);
    expect(petal.style.transform).toMatch(/rotate\(/);
    sky.dispose();
  });

  test("items shift when the camera moves", () => {
    const host = document.createElement("div");
    const sky = buildSky(host, [0, 1, 2, 3, 4], views);
    const sun = host.children[1].querySelector(".sk") as HTMLElement;
    sky.update(1, { ...cam, elev: 0.17, azim: -0.12 }, 0);
    const a = sun.style.transform;
    sky.update(1, { ...cam, elev: 0.3, azim: 0.46 }, 0);
    expect(sun.style.transform).not.toBe(a);
    sky.dispose();
  });
});
