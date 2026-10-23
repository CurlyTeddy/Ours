import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { GlobeLayer } from "@/features/moments/components/globe-layer";
import { decodeLandMask } from "@/features/moments/globe";

// Records every call and every style set on the 2D context.
let calls: [string, unknown[]][] = [];
let styles: [string, unknown][] = [];
const makeContext = (): unknown => {
  const target: Record<string, unknown> = {};
  const context: unknown = new Proxy(target, {
    get:
      (_, key: string) =>
      (...args: unknown[]) => {
        calls.push([key, args]);
        return key === "createRadialGradient"
          ? { addColorStop: () => undefined }
          : undefined;
      },
    set: (_, key: string, value) => {
      styles.push([key, value]);
      return true;
    },
  });
  return context;
};
const originalGetContext = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  calls = [];
  styles = [];
  HTMLCanvasElement.prototype.getContext = (() =>
    makeContext()) as unknown as HTMLCanvasElement["getContext"];
});
afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

// Land everywhere north of the equator
const landMask = decodeLandMask({
  w: 2,
  h: 2,
  rle: btoa(String.fromCharCode(2, 0, 2, 1, 2)),
});
const camera = { lon: 121, lat: 25, radius: 300 };
const taipei = { lon: 121.5, lat: 25 };
const tokyo = { lon: 139.7, lat: 35.7 };
const pin = (name: string, visible = true) => ({
  placeId: name,
  name,
  count: 2,
  x: 100,
  y: 120,
  visible,
});
const layer = (props: Partial<Parameters<typeof GlobeLayer>[0]> = {}) =>
  render(
    <GlobeLayer
      active
      pins={[]}
      camera={camera}
      width={800}
      height={600}
      dark={false}
      landMask={landMask}
      route={[]}
      {...props}
    />,
  );
const fills = () =>
  styles.filter(([key]) => key === "fillStyle").map(([, v]) => v);

describe("R25: globe layer", () => {
  test("draws the light palette: halo, disc, ocean and land dots", () => {
    layer();

    expect(fills()).toEqual(
      expect.arrayContaining([
        "#E7EDF6",
        "#E1E9F4",
        "rgba(79,112,168,.18)",
        "#A3B9DE",
      ]),
    );
    expect(calls.some(([name]) => name === "arc")).toBe(true);
  });

  test("draws the dark palette in dark mode", () => {
    layer({ dark: true });

    expect(fills()).toEqual(
      expect.arrayContaining(["#0F1828", "#152036", "#4C6A9C"]),
    );
    expect(fills()).not.toContain("#A3B9DE");
  });

  test("without a land mask every dot is ocean", () => {
    layer({ landMask: null });

    const landDots = () =>
      calls.filter(
        ([name, args]) =>
          name === "arc" &&
          (args[2] as number) > 1.6 &&
          (args[2] as number) < 4,
      );
    expect(landDots()).toHaveLength(0);
    calls = [];
    layer();
    // Land dots are 3.4px at the center, ocean dots at most 1.1px
    expect(landDots().length).toBeGreaterThan(0);
  });

  test("a dashed route links two or more places", () => {
    layer({ route: [taipei, tokyo] });

    expect(calls).toContainEqual(["setLineDash", [[4, 8]]]);
    expect(calls.some(([name]) => name === "lineTo")).toBe(true);
  });

  test("one place draws no route", () => {
    layer({ route: [taipei] });

    expect(calls.some(([name]) => name === "setLineDash")).toBe(false);
  });

  test("a radius past the screen corners fills the board instead of a disc", () => {
    layer({ camera: { ...camera, radius: 5000 } });

    expect(calls).toContainEqual(["fillRect", [0, 0, 800, 600]]);
    expect(calls.some(([name]) => name === "createRadialGradient")).toBe(false);
  });

  test("pins show '{name} · {count}' and hide on the far side", () => {
    layer({ pins: [pin("Taipei"), pin("Lima", false)] });

    const taipeiPin = screen.getByText("Taipei").closest("div") as HTMLElement;
    const limaPin = screen.getByText("Lima").closest("div") as HTMLElement;
    expect(taipeiPin.textContent).toBe("Taipei · 2");
    expect(taipeiPin.style.visibility).toBe("visible");
    expect(parseFloat(taipeiPin.style.left)).toBe(100);
    expect(limaPin.style.visibility).toBe("hidden");
  });

  test("below 60 m/px a pill points to the live map", () => {
    layer({ camera: { ...camera, radius: 6371000 / 59 } });

    expect(
      screen.getByText("Streets & buildings appear here from the live map"),
    ).toBeDefined();
  });

  test("at 60 m/px and above there is no pill", () => {
    layer({ camera: { ...camera, radius: 6371000 / 61 } });

    expect(
      screen.queryByText("Streets & buildings appear here from the live map"),
    ).toBeNull();
  });

  test("inactive: hidden from assistive tech, no pins, no drawing", () => {
    const { container } = layer({ active: false, pins: [pin("Taipei")] });

    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(screen.queryByText("Taipei")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test("the canvas is labelled", () => {
    layer();

    expect(
      screen.getByRole("img", {
        name: "Dot globe showing the places on our notes",
      }),
    ).toBeDefined();
  });
});
