import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { SongField } from "@/features/moments/components/song-field";
import type {
  Note,
  NoteSong,
  NoteSongClip,
} from "@/features/moments/models/responses";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

const server = setupServer();
// msw 3 renamed onUnhandledRequest; the old key type-errors and only warns
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

const playingGod: NoteSong = {
  videoId: "vid-god",
  title: "Playing God",
  channelTitle: "Polyphia",
  thumbnailUrl: "https://i.ytimg.com/vi/god/hq.jpg",
};
const inferno: NoteSong = {
  videoId: "vid-inferno",
  title: "Inferno",
  channelTitle: "Mrs. GREEN APPLE",
  thumbnailUrl: "https://i.ytimg.com/vi/inferno/hq.jpg",
};
const base: Note = {
  noteId: "",
  text: "",
  color: "mist",
  pattern: "plain",
  photoKey: null,
  photoUrl: null,
  song: null,
  songClip: null,
  place: null,
  date: null,
  x: 0,
  y: 0,
  rotation: 0,
  z: 0,
  author: { id: "u1", name: "Teddy", imageUrl: null },
  createdAt: "2026-10-01T00:00:00.000Z",
};
const clip = { startSeconds: 42, endSeconds: 72 };
const ready = (durationSeconds: number) => ({
  status: "ready" as const,
  durationSeconds,
});
type Duration = Parameters<typeof SongField>[0]["duration"];

const onChange =
  vi.fn<(song: NoteSong | null, clip: NoteSongClip | null) => void>();
const onClipChange = vi.fn<(clip: NoteSongClip) => void>();
const onClipCommit = vi.fn<(clip: NoteSongClip) => void>();
const onTogglePreview = vi.fn<() => void>();
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
});

const renderField = ({
  song = playingGod as NoteSong | null,
  songClip = clip as NoteSongClip | null,
  duration = ready(92) as Duration,
  notes = [] as Note[],
  previewing = false,
} = {}) => {
  const user = userEvent.setup();
  const props = {
    song,
    songClip,
    duration,
    labelColor: "#F4E4A1",
    notes,
    previewing,
    onChange,
    onClipChange,
    onClipCommit,
    onTogglePreview,
  };
  const view = render(<SongField {...props} />, { wrapper });
  return {
    user,
    ...view,
    rerenderWith: (patch: Partial<typeof props>) =>
      view.rerender(<SongField {...props} {...patch} />),
  };
};
// Text of one element, not of a parent that also contains it
const exactText = (text: string) => (_: string, element: Element | null) =>
  element?.textContent === text &&
  Array.from(element.children).every((child) => child.textContent !== text);
const follows = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const search = () => screen.getByLabelText("Search YouTube Music");
const loadError = "Couldn't load this song — pick another";
const shortError = "This song is shorter than 5 seconds — pick another";

describe("R5: Song field order", () => {
  test("card, header row, track, footer row, then the search box", () => {
    renderField();

    const card = screen.getByText("Playing God");
    const header = screen.getByText(exactText("Part that plays"));
    const track = screen.getByRole("slider", {
      name: "Move the part that plays",
    });
    const footer = screen.getByText(exactText("0:00"));

    expect(follows(card, header)).toBe(true);
    expect(follows(header, track)).toBe(true);
    expect(follows(track, footer)).toBe(true);
    expect(follows(footer, search())).toBe(true);
  });

  test("with no song there is no picker", () => {
    renderField({
      song: null,
      songClip: null,
      duration: { status: "idle", durationSeconds: null },
    });

    expect(screen.queryByText(exactText("Part that plays"))).toBeNull();
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(screen.queryByText(/Loading song/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(search()).toBeDefined();
  });

  test("the picker shows the clip it is given", () => {
    renderField();

    expect(screen.getByText(exactText("0:42 – 1:12"))).toBeDefined();
    expect(screen.getByText(exactText("30s"))).toBeDefined();
    expect(screen.getByText(exactText("1:32"))).toBeDefined();
    expect(
      screen
        .getByRole("slider", { name: "Start of the part" })
        .getAttribute("aria-valuenow"),
    ).toBe("42");
  });
});

describe("R6: song card", () => {
  test("with a clip the subtitle is the channel, a dot and the clip times", () => {
    renderField();

    expect(screen.getByText(exactText("Polyphia · 0:42–1:12"))).toBeDefined();
  });

  test("without a clip the subtitle is the channel alone", () => {
    renderField({ songClip: null });

    expect(screen.getByText(exactText("Polyphia"))).toBeDefined();
    expect(screen.queryByText(/·\s*\d/)).toBeNull();
  });

  test("the subtitle uses h:mm:ss from one hour on", () => {
    renderField({
      songClip: { startSeconds: 3590, endSeconds: 3610 },
      duration: ready(4000),
    });

    expect(
      screen.getByText(exactText("Polyphia · 59:50–1:00:10")),
    ).toBeDefined();
  });

  test("the subtitle follows the clip", () => {
    const { rerenderWith } = renderField();

    rerenderWith({ songClip: { startSeconds: 50, endSeconds: 80 } });

    expect(screen.getByText(exactText("Polyphia · 0:50–1:20"))).toBeDefined();
  });

  test("Preview reads Preview this part when idle and toggles", async () => {
    const { user } = renderField();

    await user.click(screen.getByRole("button", { name: "Preview this part" }));

    expect(onTogglePreview).toHaveBeenCalledTimes(1);
  });

  test("Preview reads Pause preview while previewing", async () => {
    const { user } = renderField({ previewing: true });

    expect(
      screen.queryByRole("button", { name: "Preview this part" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Pause preview" }));

    expect(onTogglePreview).toHaveBeenCalledTimes(1);
  });
});

describe("R13: while the length loads", () => {
  const loading = { status: "loading" as const, durationSeconds: null };

  test("the header shows Loading song… instead of the range and pill", () => {
    renderField({ duration: loading, songClip: null });

    const text = screen.getByText(exactText("Loading song…"));
    expect(text.className.toString()).toContain("text-us-muted");
    expect(screen.getByText(exactText("Part that plays"))).toBeDefined();
    expect(screen.queryByText(/ – /)).toBeNull();
    expect(screen.queryByText(exactText("30s"))).toBeNull();
  });

  test("the bars show dimmed, with no window and no handles", () => {
    renderField({ duration: loading, songClip: null });

    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    const dimmed = Array.from(document.querySelectorAll<HTMLElement>("*")).some(
      (el) =>
        el.style.opacity === "0.5" ||
        el.className.toString().split(/\s+/).includes("opacity-50"),
    );
    expect(dimmed).toBe(true);
    const bars = Array.from(document.querySelectorAll<HTMLElement>("*")).filter(
      (el) => el.style.height.endsWith("%"),
    );
    expect(bars).toHaveLength(48);
  });

  test("the footer row is hidden", () => {
    renderField({ duration: loading, songClip: null });

    expect(
      screen.queryByText(exactText("Drag to move · pull the edges, up to 30s")),
    ).toBeNull();
    expect(screen.queryByText(exactText("0:00"))).toBeNull();
  });

  test("loading with a stored clip still shows no window", () => {
    renderField({ duration: loading });

    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(screen.getByText(exactText("Loading song…"))).toBeDefined();
  });
});

describe("R14: when the song cannot be measured", () => {
  const error = { status: "error" as const, durationSeconds: null };

  test("a player error or timeout replaces the picker with an alert", () => {
    renderField({ duration: error, songClip: null });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(loadError);
    expect(screen.queryByText(exactText("Part that plays"))).toBeNull();
    expect(screen.queryByText(/Loading song/)).toBeNull();
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(
      screen.queryByText(exactText("Drag to move · pull the edges, up to 30s")),
    ).toBeNull();
  });

  test.each([0, 1, 4])(
    "a %d s song says it is shorter than 5 seconds",
    (seconds) => {
      renderField({ duration: ready(seconds), songClip: null });

      expect(screen.getByRole("alert").textContent).toBe(shortError);
      expect(screen.queryAllByRole("slider")).toHaveLength(0);
      expect(screen.queryByText(exactText("Part that plays"))).toBeNull();
    },
  );

  test("a 5 s song is long enough", () => {
    renderField({
      duration: ready(5),
      songClip: { startSeconds: 0, endSeconds: 5 },
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("slider")).toHaveLength(3);
  });

  test("the card, Remove and search stay usable", async () => {
    server.use(
      http.get("/api/music/search", () =>
        HttpResponse.json({ results: [inferno] }),
      ),
    );
    const { user } = renderField({ duration: error, songClip: null });

    expect(screen.getByText("Playing God")).toBeDefined();
    await user.type(search(), "Inferno");
    await user.click(await screen.findByRole("button", { name: /^Inferno/ }));
    expect(onChange).toHaveBeenLastCalledWith(inferno, null);

    await user.click(screen.getByRole("button", { name: "Remove song" }));
    expect(onChange).toHaveBeenLastCalledWith(null, null);
  });
});

describe("R19: Preview needs a clip", () => {
  test.each([
    ["loading", { status: "loading" as const, durationSeconds: null }],
    ["ready, before the default is set", ready(92)],
    ["an error", { status: "error" as const, durationSeconds: null }],
  ])("is disabled with no clip while %s", (_, duration) => {
    renderField({ duration, songClip: null });

    const preview = screen.getByRole("button", { name: "Preview this part" });
    expect((preview as HTMLButtonElement).disabled).toBe(true);
  });

  test("is enabled with a clip", () => {
    renderField();

    expect(
      (
        screen.getByRole("button", {
          name: "Preview this part",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});

describe("R17/R18: picking and removing", () => {
  const notes: Note[] = [
    {
      ...base,
      noteId: "old",
      song: playingGod,
      songClip: { startSeconds: 10, endSeconds: 20 },
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    {
      ...base,
      noteId: "newest",
      song: playingGod,
      songClip: { startSeconds: 60, endSeconds: 85 },
      createdAt: "2026-10-09T00:00:00.000Z",
    },
    {
      ...base,
      noteId: "middle",
      song: playingGod,
      songClip: { startSeconds: 30, endSeconds: 40 },
      createdAt: "2026-10-05T00:00:00.000Z",
    },
    {
      ...base,
      noteId: "other",
      song: inferno,
      songClip: null,
      createdAt: "2026-10-03T00:00:00.000Z",
    },
  ];
  const empty = {
    song: null,
    songClip: null,
    duration: { status: "idle" as const, durationSeconds: null },
  };

  test("a shared song copies the clip of the newest note with that song", async () => {
    const { user } = renderField({ ...empty, notes });

    expect(screen.getByText("From your shared list")).toBeDefined();
    await user.click(screen.getByRole("button", { name: /^Playing God/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(playingGod, {
      startSeconds: 60,
      endSeconds: 85,
    });
  });

  test("a shared song whose newest note has no clip passes null", async () => {
    const { user } = renderField({
      ...empty,
      notes: [
        ...notes,
        {
          ...base,
          noteId: "newer",
          song: playingGod,
          songClip: null,
          createdAt: "2026-10-20T00:00:00.000Z",
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: /^Playing God/ }));

    expect(onChange).toHaveBeenCalledWith(playingGod, null);
  });

  test("a shared song with no clip on any note passes null", async () => {
    const { user } = renderField({ ...empty, notes });

    await user.click(screen.getByRole("button", { name: /^Inferno/ }));

    expect(onChange).toHaveBeenCalledWith(inferno, null);
  });

  test("a search result passes no clip", async () => {
    server.use(
      http.get("/api/music/search", () =>
        HttpResponse.json({ results: [playingGod] }),
      ),
    );
    // Even when a note already clips this song: only the shared list copies clips
    const { user } = renderField({ ...empty, notes });

    await user.type(search(), "Playing");
    const results = await screen.findByText("Results");
    const list = results.nextElementSibling as HTMLElement;
    await user.click(
      within(list).getByRole("button", { name: /^Playing God/ }),
    );

    expect(onChange).toHaveBeenCalledWith(playingGod, null);
  });

  test("swapping to another song from search replaces the clip", async () => {
    server.use(
      http.get("/api/music/search", () =>
        HttpResponse.json({ results: [inferno] }),
      ),
    );
    const { user } = renderField({ notes });

    await user.type(search(), "Inferno");
    await user.click(await screen.findByRole("button", { name: /^Inferno/ }));

    expect(onChange).toHaveBeenCalledWith(inferno, null);
  });

  test("✕ removes the song and its clip", async () => {
    const { user } = renderField();

    await user.click(screen.getByRole("button", { name: "Remove song" }));

    expect(onChange).toHaveBeenCalledWith(null, null);
  });
});

describe("R10/R19: clip changes go to the parent", () => {
  test("a key press on a slider calls onClipChange and onClipCommit", async () => {
    const { user } = renderField();
    screen.getByRole("slider", { name: "Move the part that plays" }).focus();

    await user.keyboard("{ArrowRight}");

    expect(onClipChange).toHaveBeenLastCalledWith({
      startSeconds: 43,
      endSeconds: 73,
    });
    expect(onClipCommit).toHaveBeenLastCalledWith({
      startSeconds: 43,
      endSeconds: 73,
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("R13/R14/R19: Song field states (white-box)", () => {
  test("ready with no clip yet still looks like loading", () => {
    renderField({ duration: ready(92), songClip: null });

    expect(screen.getByText(exactText("Loading song…"))).toBeDefined();
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("an error wins over a stored clip", () => {
    renderField({ duration: { status: "error", durationSeconds: null } });

    expect(screen.getByRole("alert").textContent).toBe(loadError);
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
  });

  test("Pause preview stays usable even with no clip", async () => {
    const { user } = renderField({ songClip: null, previewing: true });

    const pause = screen.getByRole("button", {
      name: "Pause preview",
    }) as HTMLButtonElement;
    expect(pause.disabled).toBe(false);
    await user.click(pause);

    expect(onTogglePreview).toHaveBeenCalledTimes(1);
  });

  test("the alert is gone once the song is removed", () => {
    const { rerenderWith } = renderField({
      duration: { status: "error", durationSeconds: null },
      songClip: null,
    });

    rerenderWith({
      song: null,
      songClip: null,
      duration: { status: "idle", durationSeconds: null },
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Loading song/)).toBeNull();
  });
});
