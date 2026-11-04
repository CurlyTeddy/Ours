import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  SongClipPicker,
  effectiveSongClip,
  formatClipTime,
} from "@/features/moments/components/song-clip-picker";
import type { NoteSongClip } from "@/features/moments/models/requests";

// Every box is 400 px wide from x = 0, so with a 400 s song 1 px is 1 s.
const trackWidth = 400;
beforeAll(() => {
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      width: trackWidth,
      height: 64,
      right: trackWidth,
      bottom: 64,
      toJSON: () => ({}),
    }) as DOMRect;
  for (const key of ["clientWidth", "offsetWidth"] as const) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get: () => trackWidth,
    });
  }
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
});

const onChange = vi.fn<(clip: NoteSongClip) => void>();
const onCommit = vi.fn<(clip: NoteSongClip) => void>();
beforeEach(() => {
  onChange.mockClear();
  onCommit.mockClear();
});

// The parent owns the clip, as the editor does.
function Harness({
  durationSeconds,
  initial,
}: {
  durationSeconds: number;
  initial: NoteSongClip;
}) {
  const [clip, setClip] = useState(initial);
  return (
    <SongClipPicker
      durationSeconds={durationSeconds}
      clip={clip}
      onChange={(next) => {
        onChange(next);
        setClip(next);
      }}
      onCommit={onCommit}
    />
  );
}
const renderPicker = (
  durationSeconds: number,
  startSeconds: number,
  endSeconds: number,
) => {
  const user = userEvent.setup();
  const view = render(
    <Harness
      durationSeconds={durationSeconds}
      initial={{ startSeconds, endSeconds }}
    />,
  );
  return { user, ...view };
};
const windowSlider = () =>
  screen.getByRole("slider", { name: "Move the part that plays" });
const startHandle = () =>
  screen.getByRole("slider", { name: "Start of the part" });
const endHandle = () => screen.getByRole("slider", { name: "End of the part" });
const lastChange = () => onChange.mock.calls.at(-1)?.[0];
const lastCommit = () => onCommit.mock.calls.at(-1)?.[0];
const sliderState = (slider: HTMLElement) => ({
  min: Number(slider.getAttribute("aria-valuemin")),
  max: Number(slider.getAttribute("aria-valuemax")),
  now: Number(slider.getAttribute("aria-valuenow")),
  text: slider.getAttribute("aria-valuetext"),
});
// Text of one element, not of a parent that also contains it
const exactText = (text: string) => (_: string, element: Element | null) =>
  element?.textContent === text &&
  Array.from(element.children).every((child) => child.textContent !== text);
const hasClass = (element: Element, name: string) =>
  element.className.toString().split(/\s+/).includes(name);
const bars = () => {
  const track = windowSlider().parentElement as HTMLElement;
  return Array.from(track.querySelectorAll<HTMLElement>("*")).filter(
    (el) =>
      el.getAttribute("aria-hidden") === "true" &&
      el.getAttribute("role") !== "slider" &&
      el.style.height.endsWith("%"),
  );
};
const isClipColored = (bar: HTMLElement) => {
  const value =
    `${bar.style.background} ${bar.style.backgroundColor} ${bar.className.toString()}`.toLowerCase();
  return value.includes("#4f70a8") || value.includes("rgb(79, 112, 168)");
};

// Press at x, move by dx, and (optionally) release
const press = async (
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement,
  x: number,
) => {
  await user.pointer({
    keys: "[MouseLeft>]",
    target,
    coords: { clientX: x, clientY: 30 },
  });
};
const moveTo = async (
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement,
  x: number,
) => {
  await user.pointer({ target, coords: { clientX: x, clientY: 30 } });
};
const release = async (
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement,
  x: number,
) => {
  await user.pointer({
    keys: "[/MouseLeft]",
    target,
    coords: { clientX: x, clientY: 30 },
  });
};
const drag = async (
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement,
  from: number,
  to: number,
) => {
  await press(user, target, from);
  await moveTo(user, target, (from + to) / 2);
  await moveTo(user, target, to);
  await release(user, target, to);
};

describe("R12: formatClipTime", () => {
  test.each([
    [0, "0:00"],
    [5, "0:05"],
    [42, "0:42"],
    [60, "1:00"],
    [72, "1:12"],
    [92, "1:32"],
    [725, "12:05"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3725, "1:02:05"],
    [36_000, "10:00:00"],
  ])("%d s is %s", (seconds, text) => {
    expect(formatClipTime(seconds)).toBe(text);
  });
});

describe("R7: header row", () => {
  test("shows the label, the range with a spaced en dash, and the length pill", () => {
    renderPicker(92, 42, 72);

    const label = screen.getByText(exactText("Part that plays"));
    const range = screen.getByText(exactText("0:42 – 1:12"));
    const pill = screen.getByText(exactText("30s"));
    const row = label.parentElement as HTMLElement;

    expect(row.contains(range)).toBe(true);
    expect(row.contains(pill)).toBe(true);
    expect(row.getAttribute("aria-hidden")).toBe("true");
    // label, then range, then pill
    expect(
      label.compareDocumentPosition(range) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      range.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("uses the design's tokens", () => {
    renderPicker(92, 42, 72);

    const label = screen.getByText(exactText("Part that plays"));
    const range = screen.getByText(exactText("0:42 – 1:12"));
    const pill = screen.getByText(exactText("30s"));
    expect(hasClass(label, "uppercase")).toBe(true);
    expect(hasClass(label, "text-us-muted")).toBe(true);
    expect(hasClass(range, "ml-auto")).toBe(true);
    expect(hasClass(range, "text-us-ink")).toBe(true);
    expect(hasClass(range, "tabular-nums")).toBe(true);
    expect(hasClass(pill, "bg-us-subtle")).toBe(true);
    expect(hasClass(pill, "rounded-full")).toBe(true);
  });

  test.each([
    [0, 5, "0:00 – 0:05", "5s"],
    [0, 30, "0:00 – 0:30", "30s"],
    [3590, 3610, "59:50 – 1:00:10", "20s"],
  ])("clip %d–%d reads %s, %s", (start, end, range, pill) => {
    renderPicker(4000, start, end);

    expect(screen.getByText(exactText(range))).toBeDefined();
    expect(screen.getByText(exactText(pill))).toBeDefined();
  });
});

describe("R11: footer row", () => {
  test("shows 0:00 and the song length, with no hint between", () => {
    renderPicker(92, 42, 72);

    const start = screen.getByText(exactText("0:00"));
    const end = screen.getByText(exactText("1:32"));
    const row = start.parentElement as HTMLElement;

    expect(row.contains(end)).toBe(true);
    expect(Array.from(row.children)).toEqual([start, end]);
    expect(screen.queryByText(/Drag to move/)).toBeNull();
    expect(screen.queryByText(/pull the edges/)).toBeNull();
    expect(row.getAttribute("aria-hidden")).toBe("true");
    expect(hasClass(row, "justify-between")).toBe(true);
    expect(hasClass(row, "text-us-muted")).toBe(true);
    expect(hasClass(row, "tabular-nums")).toBe(true);
    expect(hasClass(row, "whitespace-nowrap")).toBe(true);
    expect(
      start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("an hour-long song shows h:mm:ss", () => {
    renderPicker(3725, 0, 30);

    expect(screen.getByText(exactText("1:02:05"))).toBeDefined();
  });

  test("the rows come in order: header, track, footer", () => {
    renderPicker(92, 42, 72);

    const header = screen.getByText(exactText("Part that plays"));
    const footer = screen.getByText(exactText("0:00"));
    expect(
      header.compareDocumentPosition(windowSlider()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      windowSlider().compareDocumentPosition(footer) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("R8: track", () => {
  const heights = [
    40, 58, 59, 52, 47, 55, 52, 67, 56, 69, 67, 67, 48, 53, 63, 65, 54, 50, 65,
    55, 62, 65, 58, 59, 59, 54, 57, 64, 50, 70, 64, 69, 74, 52, 68, 65, 73, 67,
    69, 58, 64, 55, 63, 58, 53, 38, 45, 42,
  ];

  test("draws 48 decorative bars with the reference heights", () => {
    renderPicker(400, 100, 130);

    const drawn = bars();
    expect(drawn).toHaveLength(48);
    expect(drawn.map((bar) => parseFloat(bar.style.height))).toEqual(heights);
  });

  test("the bars are the same for every song", () => {
    const { unmount } = renderPicker(400, 100, 130);
    const first = bars().map((bar) => bar.style.height);
    unmount();

    renderPicker(37, 0, 30);
    expect(bars().map((bar) => bar.style.height)).toEqual(first);
  });

  test("only bars whose center is inside the clip take the clip color", () => {
    // 400 s over 48 bars: centers at 4.17, 12.5, …; 100–130 holds bars 12 to 15
    renderPicker(400, 100, 130);

    const colored = bars().flatMap((bar, index) =>
      isClipColored(bar) ? [index] : [],
    );
    expect(colored).toEqual([12, 13, 14, 15]);
  });

  test("the bars recolor as the clip moves", async () => {
    renderPicker(400, 100, 130);
    windowSlider().focus();

    // 0–30 holds bars 0 to 3
    fireEvent.keyDown(windowSlider(), { key: "Home" });

    const colored = bars().flatMap((bar, index) =>
      isClipColored(bar) ? [index] : [],
    );
    expect(colored).toEqual([0, 1, 2, 3]);
  });

  test("the window sits at start/length and spans clip/length", () => {
    renderPicker(400, 100, 130);

    const { style } = windowSlider();
    expect(parseFloat(style.left)).toBeCloseTo(25, 3);
    expect(parseFloat(style.width)).toBeCloseTo(7.5, 3);
  });

  test("the track does not let the browser pan", () => {
    renderPicker(400, 100, 130);

    const track = windowSlider().parentElement as HTMLElement;
    expect(
      track.style.touchAction === "none" || hasClass(track, "touch-none"),
    ).toBe(true);
    expect(hasClass(track, "bg-us-subtle")).toBe(true);
  });
});

describe("R10: slider roles and values", () => {
  test("window, start and end are focusable sliders with the table's values", () => {
    renderPicker(92, 42, 72);

    for (const slider of [windowSlider(), startHandle(), endHandle()]) {
      expect(slider.tabIndex).toBe(0);
    }
    expect(sliderState(windowSlider())).toEqual({
      min: 0,
      max: 62,
      now: 42,
      text: "0:42 to 1:12, 30 seconds",
    });
    expect(sliderState(startHandle())).toEqual({
      min: 0,
      max: 67,
      now: 42,
      text: "Starts at 0:42, 30 seconds long",
    });
    expect(sliderState(endHandle())).toEqual({
      min: 47,
      max: 92,
      now: 72,
      text: "Ends at 1:12, 30 seconds long",
    });
  });

  test("a short clip near 0:00 clamps the start handle at 0", () => {
    renderPicker(92, 0, 12);

    expect(sliderState(startHandle())).toMatchObject({ min: 0, max: 7 });
    expect(sliderState(endHandle())).toMatchObject({ min: 5, max: 92 });
    expect(sliderState(windowSlider())).toMatchObject({
      min: 0,
      max: 80,
      text: "0:00 to 0:12, 12 seconds",
    });
  });

  test("near the song's end, the end handle's max is the song length", () => {
    renderPicker(92, 80, 90);

    expect(sliderState(endHandle())).toMatchObject({ min: 85, max: 92 });
  });

  test("each slider has the editor's focus-visible outline", () => {
    renderPicker(92, 42, 72);

    for (const slider of [windowSlider(), startHandle(), endHandle()]) {
      const names = slider.className.toString();
      expect(names).toContain("focus-visible:outline-3");
      expect(names).toContain("focus-visible:outline-[#4F70A8]");
    }
  });

  test("the handles take pointer presses above the window", () => {
    renderPicker(92, 42, 72);

    const z = (el: HTMLElement) => {
      const fromStyle = Number(el.style.zIndex);
      const fromClass = /(?:^|\s)z-(?:\[)?(\d+)/.exec(el.className.toString());
      return fromStyle || Number(fromClass?.[1] ?? 0);
    };
    expect(z(startHandle())).toBeGreaterThan(z(windowSlider()));
    expect(z(endHandle())).toBeGreaterThan(z(windowSlider()));
  });
});

describe("R10: keyboard on the window", () => {
  test.each([
    ["ArrowRight", 43, 73],
    ["ArrowUp", 43, 73],
    ["ArrowLeft", 41, 71],
    ["ArrowDown", 41, 71],
    ["PageUp", 47, 77],
    ["PageDown", 37, 67],
    ["Home", 0, 30],
    ["End", 62, 92],
  ])("%s moves the clip to %d–%d and commits", (key, start, end) => {
    renderPicker(92, 42, 72);

    const notPrevented = fireEvent.keyDown(windowSlider(), { key });

    expect(notPrevented).toBe(false);
    const expected = { startSeconds: start, endSeconds: end };
    expect(lastChange()).toEqual(expected);
    expect(lastCommit()).toEqual(expected);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  test("moving keeps the length and clamps at both ends", async () => {
    const { user } = renderPicker(92, 2, 32);
    windowSlider().focus();

    await user.keyboard("{PageDown}");
    expect(lastChange()).toEqual({ startSeconds: 0, endSeconds: 30 });
    await user.keyboard("{ArrowLeft}");
    expect(lastChange()).toEqual({ startSeconds: 0, endSeconds: 30 });

    await user.keyboard("{End}{ArrowRight}{PageUp}");
    expect(lastChange()).toEqual({ startSeconds: 62, endSeconds: 92 });
    expect(sliderState(windowSlider()).now).toBe(62);
  });

  test("each key press commits once", async () => {
    const { user } = renderPicker(92, 42, 72);
    windowSlider().focus();

    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");

    expect(onCommit).toHaveBeenCalledTimes(3);
    expect(lastCommit()).toEqual({ startSeconds: 45, endSeconds: 75 });
  });

  test("other keys do nothing and are not swallowed", () => {
    renderPicker(92, 42, 72);

    const notPrevented = fireEvent.keyDown(windowSlider(), { key: "a" });

    expect(notPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("R10: keyboard on the start handle", () => {
  test.each([
    ["ArrowRight", 43],
    ["ArrowUp", 43],
    ["ArrowLeft", 41],
    ["ArrowDown", 41],
    ["PageUp", 47],
    ["PageDown", 37],
    ["Home", 0],
    ["End", 55],
  ])("%s sets the start to %d", (key, start) => {
    // 42–60: the start ranges over [0, 60 − 5] = [0, 55]
    renderPicker(92, 42, 60);

    const notPrevented = fireEvent.keyDown(startHandle(), { key });

    expect(notPrevented).toBe(false);
    const expected = { startSeconds: start, endSeconds: 60 };
    expect(lastChange()).toEqual(expected);
    expect(lastCommit()).toEqual(expected);
  });

  test("the flow-3 walk: → ×3, PageUp, Home", async () => {
    const { user } = renderPicker(200, 0, 30);
    startHandle().focus();

    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(lastChange()).toEqual({ startSeconds: 3, endSeconds: 30 });
    await user.keyboard("{PageUp}");
    expect(lastChange()).toEqual({ startSeconds: 8, endSeconds: 30 });
    expect(startHandle().getAttribute("aria-valuetext")).toBe(
      "Starts at 0:08, 22 seconds long",
    );
    await user.keyboard("{Home}");
    expect(lastChange()).toEqual({ startSeconds: 0, endSeconds: 30 });
  });

  test("cannot make the clip shorter than 5 s, but can make it longer than 30 s", async () => {
    const { user } = renderPicker(200, 40, 50);
    startHandle().focus();

    await user.keyboard("{PageUp}{PageUp}{ArrowRight}");
    expect(lastChange()).toEqual({ startSeconds: 45, endSeconds: 50 });
    expect(screen.getByText(exactText("5s"))).toBeDefined();

    await user.keyboard(
      "{PageDown}{PageDown}{PageDown}{PageDown}{PageDown}{PageDown}{ArrowLeft}",
    );
    expect(lastChange()).toEqual({ startSeconds: 14, endSeconds: 50 });
    expect(screen.getByText(exactText("36s"))).toBeDefined();
  });

  test("never goes below 0:00", async () => {
    const { user } = renderPicker(200, 2, 12);
    startHandle().focus();

    await user.keyboard("{PageDown}");

    expect(lastChange()).toEqual({ startSeconds: 0, endSeconds: 12 });
  });
});

describe("R10: keyboard on the end handle", () => {
  test.each([
    ["ArrowRight", 61],
    ["ArrowUp", 61],
    ["ArrowLeft", 59],
    ["ArrowDown", 59],
    ["PageUp", 65],
    ["PageDown", 55],
    ["Home", 47],
    ["End", 92],
  ])("%s sets the end to %d", (key, end) => {
    renderPicker(92, 42, 60);

    const notPrevented = fireEvent.keyDown(endHandle(), { key });

    expect(notPrevented).toBe(false);
    const expected = { startSeconds: 42, endSeconds: end };
    expect(lastChange()).toEqual(expected);
    expect(lastCommit()).toEqual(expected);
  });

  test("End stops at the song's end", () => {
    renderPicker(92, 80, 86);

    fireEvent.keyDown(endHandle(), { key: "End" });

    expect(lastChange()).toEqual({ startSeconds: 80, endSeconds: 92 });
  });

  test("cannot make the clip shorter than 5 s, but can make it longer than 30 s", async () => {
    const { user } = renderPicker(200, 40, 50);
    endHandle().focus();

    await user.keyboard("{PageDown}{PageDown}{ArrowLeft}");
    expect(lastChange()).toEqual({ startSeconds: 40, endSeconds: 45 });

    await user.keyboard(
      "{PageUp}{PageUp}{PageUp}{PageUp}{PageUp}{PageUp}{ArrowRight}",
    );
    expect(lastChange()).toEqual({ startSeconds: 40, endSeconds: 76 });
    expect(screen.getByText(exactText("36s"))).toBeDefined();
  });
});

describe("R9: dragging the window", () => {
  test("moves the clip and keeps its length, committing once on release", async () => {
    // 400 s on a 400 px track; the window covers 100–130 px
    const { user } = renderPicker(400, 100, 130);
    const target = windowSlider();

    await press(user, target, 115);
    await moveTo(user, target, 125);
    await moveTo(user, target, 135);

    expect(lastChange()).toEqual({ startSeconds: 120, endSeconds: 150 });
    expect(onCommit).not.toHaveBeenCalled();

    await release(user, target, 135);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(lastCommit()).toEqual({ startSeconds: 120, endSeconds: 150 });
  });

  test("captures the pointer so the drag continues off the track", async () => {
    const capture = vi.spyOn(Element.prototype, "setPointerCapture");
    const { user } = renderPicker(400, 100, 130);

    await press(user, windowSlider(), 115);

    expect(capture).toHaveBeenCalled();
    await release(user, windowSlider(), 115);
    capture.mockRestore();
  });

  test("snaps to whole seconds", async () => {
    const { user } = renderPicker(400, 100, 130);

    await drag(user, windowSlider(), 115, 127.4);

    const clip = lastCommit() as NoteSongClip;
    expect(Number.isInteger(clip.startSeconds)).toBe(true);
    expect(Number.isInteger(clip.endSeconds)).toBe(true);
    expect(clip).toEqual({ startSeconds: 112, endSeconds: 142 });
  });

  test("clamps at 0:00", async () => {
    const { user } = renderPicker(400, 10, 40);

    await drag(user, windowSlider(), 25, -200);

    expect(lastCommit()).toEqual({ startSeconds: 0, endSeconds: 30 });
  });

  test("clamps at the song's end", async () => {
    const { user } = renderPicker(400, 360, 390);

    await drag(user, windowSlider(), 375, 900);

    expect(lastCommit()).toEqual({ startSeconds: 370, endSeconds: 400 });
  });

  test("a press without a move changes nothing", async () => {
    const { user } = renderPicker(400, 100, 130);

    await press(user, windowSlider(), 115);
    await release(user, windowSlider(), 115);

    for (const [clip] of onChange.mock.calls) {
      expect(clip).toEqual({ startSeconds: 100, endSeconds: 130 });
    }
  });
});

describe("R9: dragging the handles", () => {
  test("the start handle sets the start", async () => {
    const { user } = renderPicker(400, 100, 120);

    await drag(user, startHandle(), 100, 95);

    expect(lastCommit()).toEqual({ startSeconds: 95, endSeconds: 120 });
  });

  test("the start handle goes past 30 s long", async () => {
    const { user } = renderPicker(400, 100, 120);

    await drag(user, startHandle(), 100, 40);

    expect(lastCommit()).toEqual({ startSeconds: 40, endSeconds: 120 });
  });

  test("the start handle stops at 5 s long", async () => {
    const { user } = renderPicker(400, 100, 120);

    await drag(user, startHandle(), 100, 160);

    expect(lastCommit()).toEqual({ startSeconds: 115, endSeconds: 120 });
  });

  test("the start handle stops at 0:00", async () => {
    const { user } = renderPicker(400, 10, 30);

    await drag(user, startHandle(), 10, -50);

    expect(lastCommit()).toEqual({ startSeconds: 0, endSeconds: 30 });
  });

  test("the end handle sets the end", async () => {
    const { user } = renderPicker(400, 100, 120);

    await drag(user, endHandle(), 120, 125);

    expect(lastCommit()).toEqual({ startSeconds: 100, endSeconds: 125 });
  });

  test("the end handle goes past 30 s long", async () => {
    const { user } = renderPicker(400, 100, 120);

    await drag(user, endHandle(), 120, 200);

    expect(lastCommit()).toEqual({ startSeconds: 100, endSeconds: 200 });
  });

  test("the end handle stops at 5 s long", async () => {
    const { user } = renderPicker(400, 100, 120);

    await drag(user, endHandle(), 120, 60);

    expect(lastCommit()).toEqual({ startSeconds: 100, endSeconds: 105 });
  });

  test("the end handle stops at the song's end", async () => {
    const { user } = renderPicker(400, 380, 390);

    await drag(user, endHandle(), 390, 700);

    expect(lastCommit()).toEqual({ startSeconds: 380, endSeconds: 400 });
  });

  test("a handle drag commits only on release", async () => {
    const { user } = renderPicker(400, 100, 120);

    await press(user, endHandle(), 120);
    await moveTo(user, endHandle(), 124);
    expect(lastChange()).toEqual({ startSeconds: 100, endSeconds: 124 });
    expect(onCommit).not.toHaveBeenCalled();

    await release(user, endHandle(), 124);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  test("dragging a handle does not also move the window", async () => {
    const { user } = renderPicker(400, 100, 120);

    await drag(user, endHandle(), 120, 125);

    for (const [clip] of onChange.mock.calls) {
      expect(clip.startSeconds).toBe(100);
    }
  });
});

describe("R9: the bare track", () => {
  test("a press and drag outside the window does nothing", async () => {
    const { user } = renderPicker(400, 100, 130);
    const track = windowSlider().parentElement as HTMLElement;

    await drag(user, track, 300, 350);

    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("R8/R9/R10: picker edge cases (white-box)", () => {
  test("a bar centered exactly on an edge is inside the clip", () => {
    // 480 s over 48 bars: centers at 5, 15, 25, …; 15–45 holds bars 1 to 4
    renderPicker(480, 15, 45);

    const colored = bars().flatMap((bar, index) =>
      isClipColored(bar) ? [index] : [],
    );
    expect(colored).toEqual([1, 2, 3, 4]);
  });

  test("a cancelled drag keeps what it showed but does not commit", async () => {
    const { user } = renderPicker(400, 100, 130);
    const target = windowSlider();

    await press(user, target, 115);
    await moveTo(user, target, 125);
    expect(lastChange()).toEqual({ startSeconds: 110, endSeconds: 140 });
    fireEvent.pointerCancel(target, { pointerId: 1 });
    await release(user, target, 125);

    expect(onCommit).not.toHaveBeenCalled();
    expect(sliderState(windowSlider()).now).toBe(110);
  });

  test("a press and release without moving does not commit", async () => {
    const { user } = renderPicker(400, 100, 130);

    await press(user, windowSlider(), 115);
    await release(user, windowSlider(), 115);

    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  test("a drag back to where it started does not commit", async () => {
    const { user } = renderPicker(400, 100, 130);

    await press(user, endHandle(), 130);
    await moveTo(user, endHandle(), 120);
    await moveTo(user, endHandle(), 130);
    await release(user, endHandle(), 130);

    expect(onCommit).not.toHaveBeenCalled();
  });

  test("moves within the same second do not repeat onChange", async () => {
    const { user } = renderPicker(400, 100, 130);

    await press(user, windowSlider(), 115);
    await moveTo(user, windowSlider(), 120);
    await moveTo(user, windowSlider(), 120.2);
    await moveTo(user, windowSlider(), 120.4);

    expect(onChange).toHaveBeenCalledTimes(1);
    await release(user, windowSlider(), 120.4);
  });

  test("moves from another pointer are ignored", async () => {
    const { user } = renderPicker(400, 100, 130);

    await press(user, windowSlider(), 115);
    fireEvent.pointerMove(windowSlider(), { pointerId: 99, clientX: 200 });
    fireEvent.pointerUp(windowSlider(), { pointerId: 99, clientX: 200 });

    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    await release(user, windowSlider(), 115);
  });

  test("moves are ignored without a pressed slider", () => {
    renderPicker(400, 100, 130);

    fireEvent.pointerMove(windowSlider(), { pointerId: 1, clientX: 200 });
    fireEvent.pointerUp(windowSlider(), { pointerId: 1, clientX: 200 });

    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  test("a track with no width ignores moves", async () => {
    const rect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () =>
      ({ ...rect.call(document.body), width: 0 }) as DOMRect;
    try {
      const { user } = renderPicker(400, 100, 130);

      await drag(user, windowSlider(), 115, 200);

      expect(onChange).not.toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.getBoundingClientRect = rect;
    }
  });

  test("the window shows grabbing only while dragged", async () => {
    const { user } = renderPicker(400, 100, 130);
    expect(hasClass(windowSlider(), "cursor-grab")).toBe(true);

    await press(user, windowSlider(), 115);
    expect(hasClass(windowSlider(), "cursor-grabbing")).toBe(true);

    await release(user, windowSlider(), 115);
    expect(hasClass(windowSlider(), "cursor-grab")).toBe(true);
  });

  test("a key at its limit commits without a change", () => {
    renderPicker(92, 0, 30);

    fireEvent.keyDown(windowSlider(), { key: "Home" });
    fireEvent.keyDown(windowSlider(), { key: "ArrowLeft" });

    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(lastCommit()).toEqual({ startSeconds: 0, endSeconds: 30 });
  });

  test("a whole-song 5 s clip cannot move", () => {
    renderPicker(5, 0, 5);

    expect(sliderState(windowSlider())).toMatchObject({ min: 0, max: 0 });
    expect(sliderState(startHandle())).toMatchObject({ min: 0, max: 0 });
    expect(sliderState(endHandle())).toMatchObject({ min: 5, max: 5 });
  });
});

describe("R16: effectiveSongClip", () => {
  const song = {
    videoId: "vid1",
    title: "Playing God",
    channelTitle: "Polyphia",
    thumbnailUrl: "https://i.ytimg.com/vi/vid1/hq.jpg",
  };
  const stored = { startSeconds: 42, endSeconds: 72 };
  const ready = (durationSeconds: number) =>
    ({ status: "ready", durationSeconds }) as const;
  const notReady = (status: "idle" | "loading" | "error") =>
    ({ status, durationSeconds: null }) as const;

  test("no song gives null, even with a clip and a length", () => {
    expect(effectiveSongClip(null, stored, ready(200))).toBeNull();
    expect(effectiveSongClip(null, null, notReady("idle"))).toBeNull();
  });

  test.each(["idle", "loading", "error"] as const)(
    "%s gives null, even with a stored clip",
    (status) => {
      expect(effectiveSongClip(song, stored, notReady(status))).toBeNull();
      expect(effectiveSongClip(song, null, notReady(status))).toBeNull();
    },
  );

  test.each([
    ["well inside the song", 200],
    ["ending exactly at the song's end", 72],
  ])("a stored clip %s is kept", (_, length) => {
    expect(effectiveSongClip(song, stored, ready(length))).toEqual(stored);
  });

  test.each([
    [200, 200],
    [31, 31],
    [30, 30],
    [12, 12],
    [6, 6],
    [5, 5],
    [3725, 3725],
  ])("no clip on a %d s song defaults to 0–%d", (length, end) => {
    expect(effectiveSongClip(song, null, ready(length))).toEqual({
      startSeconds: 0,
      endSeconds: end,
    });
  });

  test.each([
    [71, 71],
    [50, 50],
    [20, 20],
  ])("a clip past the end of a %d s song defaults to 0–%d", (length, end) => {
    expect(effectiveSongClip(song, stored, ready(length))).toEqual({
      startSeconds: 0,
      endSeconds: end,
    });
  });

  test.each([4, 1, 0])("a %d s song gives null", (length) => {
    expect(effectiveSongClip(song, null, ready(length))).toBeNull();
    expect(
      effectiveSongClip(
        song,
        { startSeconds: 0, endSeconds: 5 },
        ready(length),
      ),
    ).toBeNull();
  });
});

describe("remove-hints R10: footer without the drag hint", () => {
  test.each([
    [5, 0, 5, "0:05"],
    [30, 0, 30, "0:30"],
    [92, 42, 72, "1:32"],
    [3725, 0, 30, "1:02:05"],
  ])(
    "a %d s song: footer is just 0:00 and %s",
    (duration, start, end, length) => {
      renderPicker(duration, start, end);

      const first = screen.getByText(exactText("0:00"));
      const row = first.parentElement as HTMLElement;
      expect(
        Array.from(row.children).map((child) => child.textContent),
      ).toEqual(["0:00", length]);
      expect(row.getAttribute("aria-hidden")).toBe("true");
      expect(hasClass(row, "justify-between")).toBe(true);
      expect(screen.queryByText(/Drag to move/)).toBeNull();
      expect(screen.queryByText(/up to 30s/)).toBeNull();
    },
  );

  test("there is no 30 s cap on either handle", () => {
    renderPicker(400, 100, 110);

    // a 10 s clip can grow to the song end or back to 0:00
    expect(sliderState(endHandle()).max).toBe(400);
    expect(sliderState(startHandle()).min).toBe(0);
  });
});

describe("no-clip-cap R3: effectiveSongClip defaults to the whole song", () => {
  const song = {
    videoId: "vid1",
    title: "Playing God",
    channelTitle: "Polyphia",
    thumbnailUrl: "https://i.ytimg.com/vi/vid1/hq.jpg",
  };
  const ready = (durationSeconds: number) =>
    ({ status: "ready", durationSeconds }) as const;

  test("a picked 3-minute song with no clip gives 0–180", () => {
    expect(effectiveSongClip(song, null, ready(180))).toEqual({
      startSeconds: 0,
      endSeconds: 180,
    });
  });

  test("a stored 30 s clip on a longer song is kept unchanged (flow 5)", () => {
    const clip = { startSeconds: 0, endSeconds: 30 };
    expect(effectiveSongClip(song, clip, ready(180))).toBe(clip);
  });

  test("a stored clip longer than 30 s that fits is kept", () => {
    const clip = { startSeconds: 0, endSeconds: 90 };
    expect(effectiveSongClip(song, clip, ready(180))).toBe(clip);
  });

  test("a stored whole-song clip ending at the song's end is kept", () => {
    const clip = { startSeconds: 0, endSeconds: 180 };
    expect(effectiveSongClip(song, clip, ready(180))).toBe(clip);
  });

  test("a stored clip one second past the end resets to the whole song", () => {
    expect(
      effectiveSongClip(song, { startSeconds: 0, endSeconds: 181 }, ready(180)),
    ).toEqual({ startSeconds: 0, endSeconds: 180 });
  });

  test("R6: a song under 5 s still gives no clip", () => {
    expect(effectiveSongClip(song, null, ready(4))).toBeNull();
  });
});

describe("no-clip-cap R4: handle ranges without a maximum length", () => {
  test("flow 3: a whole 3-minute song shows 0:00 – 3:00 and 180s", () => {
    renderPicker(180, 0, 180);

    expect(screen.getByText(exactText("0:00 – 3:00"))).toBeDefined();
    expect(screen.getByText(exactText("180s"))).toBeDefined();
    expect(sliderState(startHandle())).toMatchObject({ min: 0, max: 175 });
    expect(sliderState(endHandle())).toMatchObject({ min: 5, max: 180 });
    expect(sliderState(windowSlider())).toMatchObject({ min: 0, max: 0 });
  });

  test("flow 3: drag the end handle in to 1:30", async () => {
    // 180 s on a 400 px track; 1:30 sits at 200 px
    const { user } = renderPicker(180, 0, 180);

    await drag(user, endHandle(), 400, 200);

    expect(lastCommit()).toEqual({ startSeconds: 0, endSeconds: 90 });
    expect(screen.getByText(exactText("0:00 – 1:30"))).toBeDefined();
    expect(screen.getByText(exactText("90s"))).toBeDefined();
  });

  test("flow 4: the end handle drags past 0:30 up to the song end", async () => {
    const { user } = renderPicker(400, 0, 10);

    await press(user, endHandle(), 10);
    await moveTo(user, endHandle(), 31);
    expect(lastChange()).toEqual({ startSeconds: 0, endSeconds: 31 });
    await moveTo(user, endHandle(), 1000);
    await release(user, endHandle(), 1000);

    expect(lastCommit()).toEqual({ startSeconds: 0, endSeconds: 400 });
  });

  test("flow 5: a stored 30 s clip can be stretched longer by keyboard", async () => {
    const { user } = renderPicker(180, 0, 30);
    endHandle().focus();

    await user.keyboard("{ArrowRight}");
    expect(lastChange()).toEqual({ startSeconds: 0, endSeconds: 31 });
    await user.keyboard("{End}");
    expect(lastCommit()).toEqual({ startSeconds: 0, endSeconds: 180 });
    expect(screen.getByText(exactText("180s"))).toBeDefined();
  });

  test("Home on the start handle goes to 0:00 however long the clip gets", () => {
    renderPicker(400, 300, 310);

    fireEvent.keyDown(startHandle(), { key: "Home" });

    expect(lastCommit()).toEqual({ startSeconds: 0, endSeconds: 310 });
  });

  test("End on the start handle stops 5 s before the end", () => {
    renderPicker(400, 0, 310);

    fireEvent.keyDown(startHandle(), { key: "End" });

    expect(lastCommit()).toEqual({ startSeconds: 305, endSeconds: 310 });
  });

  test("Home on the end handle stops 5 s after the start", () => {
    renderPicker(400, 100, 400);

    fireEvent.keyDown(endHandle(), { key: "Home" });

    expect(lastCommit()).toEqual({ startSeconds: 100, endSeconds: 105 });
  });

  test("the start handle drags from the song end back to 0:00", async () => {
    const { user } = renderPicker(400, 390, 400);

    await drag(user, startHandle(), 390, -100);

    expect(lastCommit()).toEqual({ startSeconds: 0, endSeconds: 400 });
  });

  test("the window keeps its range for a long clip and moves it whole", async () => {
    const { user } = renderPicker(400, 50, 250);
    expect(sliderState(windowSlider())).toMatchObject({ min: 0, max: 200 });

    windowSlider().focus();
    await user.keyboard("{End}");
    expect(lastCommit()).toEqual({ startSeconds: 200, endSeconds: 400 });
    await user.keyboard("{Home}");
    expect(lastCommit()).toEqual({ startSeconds: 0, endSeconds: 200 });
  });

  test("an hour-long song lets the end reach the last second", () => {
    renderPicker(3725, 0, 30);

    expect(sliderState(endHandle()).max).toBe(3725);
    fireEvent.keyDown(endHandle(), { key: "End" });
    expect(lastCommit()).toEqual({ startSeconds: 0, endSeconds: 3725 });
  });
});

describe("no-clip-cap R4: long-clip edge cases (white-box)", () => {
  test("a long window dragged far right clamps at the song end", async () => {
    const { user } = renderPicker(400, 0, 200);

    await drag(user, windowSlider(), 100, 900);

    expect(lastCommit()).toEqual({ startSeconds: 200, endSeconds: 400 });
  });

  test("a whole-song clip's window cannot move but both handles can", () => {
    renderPicker(400, 0, 400);

    fireEvent.keyDown(windowSlider(), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
    expect(lastCommit()).toEqual({ startSeconds: 0, endSeconds: 400 });

    fireEvent.keyDown(startHandle(), { key: "PageUp" });
    expect(lastChange()).toEqual({ startSeconds: 5, endSeconds: 400 });
  });

  test("a 5 s clip at the song end: the end is pinned, the start reaches 0:00", () => {
    renderPicker(400, 395, 400);

    expect(sliderState(endHandle())).toMatchObject({ min: 400, max: 400 });
    expect(sliderState(startHandle())).toMatchObject({ min: 0, max: 395 });
  });

  test("End on the end handle of a clip already at the song end commits without a change", () => {
    renderPicker(400, 100, 400);

    fireEvent.keyDown(endHandle(), { key: "End" });

    expect(onChange).not.toHaveBeenCalled();
    expect(lastCommit()).toEqual({ startSeconds: 100, endSeconds: 400 });
  });
});
