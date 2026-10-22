import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { StageElements, StageResult } from "@/features/storybook/stage";

vi.mock("next/font/google", () => {
  const font = (name: string) => () => ({
    className: name,
    variable: name,
    style: { fontFamily: name },
  });
  return {
    Corben: font("Corben"),
    Gaegu: font("Gaegu"),
    Nunito: font("Nunito"),
    Playpen_Sans: font("Playpen"),
  };
});
vi.mock("@/features/storybook/stage", () => ({ bootStage: vi.fn() }));

import Storybook from "@/features/storybook/components/storybook";
import { bootStage } from "@/features/storybook/stage";
import { STORY } from "@/features/storybook/story";

const boot = vi.mocked(bootStage);
const login = <button type="button">login-slot</button>;
const images = ["data:a", "data:b", "data:c", "data:d"];

let reduced = false;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.clearAllMocks();
  reduced = false;
  window.matchMedia = (query: string) =>
    ({
      matches: reduced && query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
  // jsdom has no WebGL; pretend it does so the component reaches bootStage.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as RenderingContext,
  );
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

function deferred() {
  let resolve!: (r: StageResult) => void;
  const promise = new Promise<StageResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("R1/R8: animated version", () => {
  test("renders overlay text as JSX with hidden alt next to each caption", async () => {
    const dispose = vi.fn();
    boot.mockResolvedValue({ kind: "animated", dispose });
    render(<Storybook login={login} />);
    await waitFor(() => expect(boot).toHaveBeenCalled());

    expect(screen.getByText(STORY.intro.kicker)).toBeDefined();
    expect(screen.getByText(STORY.intro.hint)).toBeDefined();
    for (const ch of STORY.chapters) {
      expect(screen.getByText(ch.number)).toBeDefined();
      expect(screen.getByRole("heading", { name: ch.title })).toBeDefined();
      expect(screen.getByText(ch.caption)).toBeDefined();
      expect(screen.getByText(ch.alt).tagName).toBe("P");
    }
    expect(
      screen.getByRole("heading", { name: STORY.ending.title }),
    ).toBeDefined();
    expect(screen.getByText(STORY.ending.line)).toBeDefined();
    expect(screen.getAllByRole("button", { name: "login-slot" })).toHaveLength(
      1,
    );
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  test("passes the stage elements; canvas and sky host are aria-hidden", async () => {
    boot.mockResolvedValue({ kind: "animated", dispose: vi.fn() });
    render(<Storybook login={login} />);
    await waitFor(() => expect(boot).toHaveBeenCalled());

    const [els, opts] = boot.mock.calls[0] as [
      StageElements,
      { reduced: boolean },
    ];
    expect(opts).toEqual({ reduced: false });
    expect(els.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(els.canvas.getAttribute("aria-hidden")).toBe("true");
    expect(els.skyHost.getAttribute("aria-hidden")).toBe("true");
    expect(els.heads).toHaveLength(STORY.chapters.length);
    expect(els.caps).toHaveLength(STORY.chapters.length);
    expect(els.intro.length).toBeGreaterThan(0);
    for (const el of [els.scrollTrack, els.endHead, els.endCap, ...els.intro]) {
      expect(el.isConnected).toBe(true);
    }
    expect(els.endCap.textContent).toContain("login-slot");
    expect(els.heads[1].textContent).toContain(STORY.chapters[1].title);
    expect(els.caps[2].textContent).toContain(STORY.chapters[2].caption);
  });
});

describe("R9: veil", () => {
  test("shows while the scene builds", async () => {
    const d = deferred();
    boot.mockReturnValue(d.promise);
    render(<Storybook login={login} />);
    expect(screen.getByText("unfolding the paper…")).toBeDefined();
    await act(async () => {
      d.resolve({ kind: "animated", dispose: vi.fn() });
      await d.promise;
    });
  });
});

describe("R6: reduced motion", () => {
  test("asks the stage for stills and shows the still version", async () => {
    reduced = true;
    boot.mockResolvedValue({ kind: "stills", images });
    render(<Storybook login={login} />);

    const imgs = (await screen.findAllByRole("img")) as HTMLImageElement[];
    expect(boot.mock.calls[0][1]).toEqual({ reduced: true });
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual(images);
    expect(imgs.map((i) => i.alt)).toEqual([
      "The closed storybook lying on a table.",
      ...STORY.chapters.map((ch) => ch.alt),
    ]);
    expect(screen.getAllByRole("button", { name: "login-slot" })).toHaveLength(
      1,
    );
    expect(
      screen.getByRole("heading", { name: STORY.ending.title }),
    ).toBeDefined();
  });
});

describe("R7: no WebGL", () => {
  test("stage reports no-webgl: text-only version, no images", async () => {
    boot.mockResolvedValue({ kind: "no-webgl" });
    render(<Storybook login={login} />);
    await waitFor(() => expect(boot).toHaveBeenCalled());

    for (const ch of STORY.chapters) {
      expect(
        await screen.findByRole("heading", { name: ch.title }),
      ).toBeDefined();
      expect(screen.getByText(ch.caption)).toBeDefined();
    }
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "login-slot" })).toHaveLength(
      1,
    );
  });

  test("browser has no WebGL context: text-only version", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    boot.mockResolvedValue({ kind: "no-webgl" });
    render(<Storybook login={login} />);

    expect(
      await screen.findByRole("heading", { name: STORY.chapters[0].title }),
    ).toBeDefined();
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "login-slot" }),
      ).toHaveLength(1),
    );
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});

describe("R5: cleanup", () => {
  test("unmount disposes the animated stage once", async () => {
    const dispose = vi.fn();
    boot.mockResolvedValue({ kind: "animated", dispose });
    const { unmount } = render(<Storybook login={login} />);
    await waitFor(() => expect(boot).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(dispose).not.toHaveBeenCalled();
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test("a boot that resolves after unmount is disposed at once", async () => {
    const d = deferred();
    const dispose = vi.fn();
    boot.mockReturnValue(d.promise);
    const { unmount } = render(<Storybook login={login} />);
    await waitFor(() => expect(boot).toHaveBeenCalled());
    unmount();
    await act(async () => {
      d.resolve({ kind: "animated", dispose });
      await d.promise;
    });
    await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
  });

  test("Strict Mode leaves exactly one live stage, none after unmount", async () => {
    const disposes: ReturnType<typeof vi.fn>[] = [];
    boot.mockImplementation(async () => {
      const dispose = vi.fn();
      disposes.push(dispose);
      return { kind: "animated", dispose };
    });
    const { unmount } = render(
      <StrictMode>
        <Storybook login={login} />
      </StrictMode>,
    );
    await waitFor(() => expect(boot).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const live = () => disposes.filter((d) => d.mock.calls.length === 0).length;
    expect(live()).toBe(1);
    expect(disposes.every((d) => d.mock.calls.length <= 1)).toBe(true);
    expect(document.querySelectorAll("canvas").length).toBeLessThanOrEqual(1);

    unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(live()).toBe(0);
  });

  test("remounting boots a fresh stage", async () => {
    const first = vi.fn();
    const second = vi.fn();
    boot
      .mockResolvedValueOnce({ kind: "animated", dispose: first })
      .mockResolvedValueOnce({ kind: "animated", dispose: second });
    const a = render(<Storybook login={login} />);
    await waitFor(() => expect(boot).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    a.unmount();
    expect(first).toHaveBeenCalledTimes(1);

    const b = render(<Storybook login={login} />);
    await waitFor(() => expect(boot).toHaveBeenCalledTimes(2));
    await act(async () => {
      await Promise.resolve();
    });
    expect(second).not.toHaveBeenCalled();
    expect(document.querySelectorAll("canvas")).toHaveLength(1);
    b.unmount();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("R5: boot timing (white-box)", () => {
  test("unmount before the boot frame: the stage never boots", async () => {
    boot.mockResolvedValue({ kind: "animated", dispose: vi.fn() });
    const { unmount } = render(<Storybook login={login} />);
    unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(boot).not.toHaveBeenCalled();
  });

  test("stills that arrive after unmount are dropped quietly", async () => {
    const d = deferred();
    boot.mockReturnValue(d.promise);
    const error = vi.spyOn(console, "error");
    const { unmount, container } = render(<Storybook login={login} />);
    await waitFor(() => expect(boot).toHaveBeenCalled());
    unmount();
    await act(async () => {
      d.resolve({ kind: "stills", images });
      await d.promise;
    });
    expect(container.querySelector("img")).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("R9/R14: veil and fonts (white-box)", () => {
  test("veil and canvas switch class once the first frame is ready", async () => {
    const d = deferred();
    boot.mockReturnValue(d.promise);
    const { container } = render(<Storybook login={login} />);
    const veil = screen.getByText("unfolding the paper…").parentElement;
    const canvas = container.querySelector("canvas");
    const before = [veil?.className, canvas?.className];
    await waitFor(() => expect(boot).toHaveBeenCalled());
    await act(async () => {
      d.resolve({ kind: "animated", dispose: vi.fn() });
      await d.promise;
    });
    expect(veil?.className).not.toBe(before[0]);
    expect(canvas?.className).not.toBe(before[1]);
  });

  test("veil also clears for the still version", async () => {
    const d = deferred();
    boot.mockReturnValue(d.promise);
    render(<Storybook login={login} />);
    const veil = screen.getByText("unfolding the paper…").parentElement;
    const before = veil?.className;
    await waitFor(() => expect(boot).toHaveBeenCalled());
    await act(async () => {
      d.resolve({ kind: "no-webgl" });
      await d.promise;
    });
    expect(veil?.className).not.toBe(before);
  });

  test("root carries the three font variables", () => {
    boot.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<Storybook login={login} />);
    const root = container.firstElementChild as HTMLElement;
    for (const name of ["Corben", "Gaegu", "Nunito"])
      expect(root.classList.contains(name)).toBe(true);
  });
});

describe("R7: boot failure falls back to text-only", () => {
  test("bootStage rejects: text-only version, veil cleared, error logged", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    boot.mockRejectedValue(new Error("shader compile failed"));
    render(<Storybook login={login} />);
    const veil = screen.getByText("unfolding the paper…").parentElement;
    const before = veil?.className;
    await waitFor(() => expect(boot).toHaveBeenCalled());

    await waitFor(() => expect(veil?.className).not.toBe(before));
    for (const ch of STORY.chapters) {
      expect(screen.getByRole("heading", { name: ch.title })).toBeDefined();
      expect(screen.getByText(ch.caption)).toBeDefined();
    }
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("canvas")).toBeNull();
    expect(screen.getAllByRole("button", { name: "login-slot" })).toHaveLength(
      1,
    );
    expect(error).toHaveBeenCalled();
  });
});
