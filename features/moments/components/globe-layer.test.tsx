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

  test("R27: a dashed segment links two places", () => {
    layer({ route: [{ from: taipei, to: tokyo, solid: false }] });

    expect(calls).toContainEqual(["setLineDash", [[4, 8]]]);
    expect(calls.some(([name]) => name === "lineTo")).toBe(true);
  });

  test("R27: a solid segment draws without a dash", () => {
    layer({ route: [{ from: taipei, to: tokyo, solid: true }] });

    expect(calls).not.toContainEqual(["setLineDash", [[4, 8]]]);
    expect(calls.some(([name]) => name === "lineTo")).toBe(true);
  });

  test("R27: mixed segments draw both styles", () => {
    const osaka = { lon: 135.5, lat: 34.7 };
    layer({
      route: [
        { from: taipei, to: tokyo, solid: true },
        { from: tokyo, to: osaka, solid: false },
      ],
    });

    expect(calls).toContainEqual(["setLineDash", [[4, 8]]]);
    // The solid segment is drawn with no dash at some point
    const dashes = calls
      .filter(([name]) => name === "setLineDash")
      .map(([, [dash]]) => dash);
    expect(dashes).toContainEqual([]);
    expect(calls.some(([name]) => name === "lineTo")).toBe(true);
  });

  test("no segments draw no route", () => {
    layer({ route: [] });

    expect(calls.some(([name]) => name === "lineTo")).toBe(false);
    expect(calls).not.toContainEqual(["setLineDash", [[4, 8]]]);
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

describe("R27: to-do pins (white-box)", () => {
  const todoPin = (
    name: string,
    mark: "idea" | "done" | number,
    extra: Record<string, unknown> = {},
  ) => ({ ...pin(name), mark, ...extra });
  const dots = () =>
    Array.from(document.querySelectorAll(".pin-dot")).map((el) => ({
      text: el.textContent,
      className: el.className,
    }));

  test("✦ for an idea, ✓ when done, the number for an undone stop", () => {
    layer({
      pins: [
        todoPin("Ramen", "idea"),
        todoPin("Temple", "done"),
        todoPin("Food", 2),
      ],
    });

    expect(dots().map((d) => d.text)).toEqual(["✦", "✓", "2"]);
    expect(dots()[0].className).toContain("bg-[#FAEDBE]");
    expect(dots()[1].className).toContain("bg-[#4F70A8]");
    expect(dots()[2].className).toContain("bg-white");
    expect(
      Array.from(document.querySelectorAll(".pin-label")).map(
        (el) => el.textContent,
      ),
    ).toEqual(["Ramen", "Temple", "Food"]);
  });

  test("a to-do pin has no note count", () => {
    layer({ pins: [todoPin("Ramen", "idea")] });

    expect(screen.queryByText(/· 2/)).toBeNull();
  });

  test("near the right edge the label flips to the left", () => {
    layer({
      pins: [
        todoPin("Left", 1, { labelLeft: true }),
        todoPin("Right", 2, { labelLeft: false }),
      ],
    });

    const wrappers = Array.from(document.querySelectorAll(".pin-dot")).map(
      (el) => (el.parentElement as HTMLElement).className,
    );
    expect(wrappers[0]).toContain("flex-row-reverse");
    expect(wrappers[1]).not.toContain("flex-row-reverse");
  });

  test("a to-do pin on the far side is hidden", () => {
    layer({ pins: [todoPin("Far", "done", { visible: false })] });

    const wrapper = document.querySelector(".pin-dot")
      ?.parentElement as HTMLElement;
    expect(wrapper.style.visibility).toBe("hidden");
  });
});
