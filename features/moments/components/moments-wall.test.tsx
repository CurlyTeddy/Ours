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
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { setupServer } from "msw/node";
import { SWRConfig } from "swr";
import { useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { cropper } from "@/__mocks__/react-easy-crop";
import type { Note } from "@/features/moments/models/responses";

vi.mock("react-easy-crop");
// jsdom decodes nothing; every picked file counts as decodable
vi.mock("@/lib/decode-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/decode-image")>()),
  toDecodable: vi.fn(async (file: File) => file),
}));
vi.mock("next/font/google", () => {
  const font = () => () => ({ className: "f", variable: "f", style: {} });
  return {
    Nunito: font(),
    Caveat: font(),
    Homemade_Apple: font(),
    Playpen_Sans: font(),
  };
});
// The URL lives in a store so push/replace re-render the wall the way the shared
// (wall) layout does when the route changes.
const nav = vi.hoisted(() => {
  let pathname = "/moments";
  let search = "";
  let params = new URLSearchParams();
  const listeners = new Set<() => void>();
  const go = (url: string) => {
    const [path, query = ""] = url.split("?");
    pathname = path || pathname;
    search = query;
    params = new URLSearchParams(query);
    listeners.forEach((listener) => listener());
  };
  return {
    go,
    reset: () => {
      pathname = "/moments";
      search = "";
      params = new URLSearchParams();
    },
    path: () => pathname,
    search: () => search,
    params: () => params,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    push: vi.fn((url: string) => go(url)),
    replace: vi.fn((url: string) => go(url)),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: nav.push,
    replace: nav.replace,
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () =>
    useSyncExternalStore(nav.subscribe, nav.params, nav.params),
  usePathname: () => useSyncExternalStore(nav.subscribe, nav.path, nav.path),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
  }),
}));

// Google Places: `null` means Maps is unavailable
const maps = vi.hoisted(() => ({ places: null as unknown }));
vi.mock("@vis.gl/react-google-maps", () => ({
  useMapsLibrary: () => maps.places,
  APIProvider: ({ children }: { children: ReactNode }) => children,
}));

// One shared fake player, so every caller of useSongPlayer sees the same song
const songPlayer = vi.hoisted(() => {
  let playing: string | null = null;
  const listeners = new Set<() => void>();
  const set = (value: string | null) => {
    playing = value;
    listeners.forEach((listener) => listener());
  };
  return {
    play: vi.fn((videoId: string) => set(videoId)),
    stop: vi.fn(() => set(null)),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => playing,
    reset: () => set(null),
  };
});
vi.mock("@/features/moments/hooks/use-song-player", () => ({
  useSongPlayer: () => ({
    play: songPlayer.play,
    stop: songPlayer.stop,
    playingVideoId: useSyncExternalStore(
      songPlayer.subscribe,
      songPlayer.get,
      songPlayer.get,
    ),
  }),
}));

import { MomentsWall } from "@/features/moments/components/moments-wall";

// ---------- viewport ----------

const viewport = { width: 1440, height: 900 };
const evaluateQuery = (query: string) => {
  const max = /max-width:\s*([\d.]+)px/.exec(query);
  const min = /min-width:\s*([\d.]+)px/.exec(query);
  if (max) return viewport.width <= Number(max[1]);
  if (min) return viewport.width >= Number(min[1]);
  return false; // prefers-reduced-motion, color scheme…
};
class SizedResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe = (target: Element) => {
    const size = { inlineSize: viewport.width, blockSize: viewport.height };
    this.callback(
      [
        {
          target,
          contentRect: {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            width: viewport.width,
            height: viewport.height,
            right: viewport.width,
            bottom: viewport.height,
          },
          borderBoxSize: [size],
          contentBoxSize: [size],
          devicePixelContentBoxSize: [size],
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  };
  unobserve = () => undefined;
  disconnect = () => undefined;
}
// Any canvas call returns the same chainable no-op
const canvasContext: unknown = new Proxy(() => canvasContext, {
  get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : canvasContext),
  set: () => true,
  apply: () => canvasContext,
});

beforeAll(() => {
  const sized = (key: "width" | "height") => ({
    configurable: true,
    get: () => viewport[key],
  });
  Object.defineProperties(HTMLElement.prototype, {
    clientWidth: sized("width"),
    clientHeight: sized("height"),
    offsetWidth: sized("width"),
    offsetHeight: sized("height"),
  });
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      width: viewport.width,
      height: viewport.height,
      right: viewport.width,
      bottom: viewport.height,
      toJSON: () => ({}),
    }) as DOMRect;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => undefined;
  HTMLCanvasElement.prototype.getContext = (() =>
    canvasContext) as unknown as HTMLCanvasElement["getContext"];
  URL.createObjectURL = () => "blob:photo";
  URL.revokeObjectURL = () => undefined;
});

const setViewport = (width: number, height: number) => {
  viewport.width = width;
  viewport.height = height;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
  window.matchMedia = (query: string) =>
    ({
      matches: evaluateQuery(query),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
};

// ---------- fixtures ----------

const inferno = {
  videoId: "vid-inferno",
  title: "Inferno",
  channelTitle: "Mrs. GREEN APPLE",
  thumbnailUrl: "https://i.ytimg.com/vi/inferno/hq.jpg",
};
const lavie = {
  videoId: "vid-lavie",
  title: "Lavie en rose forever",
  channelTitle: "ruru0527",
  thumbnailUrl: "https://i.ytimg.com/vi/lavie/hq.jpg",
};
const taipei = {
  name: "Taipei",
  address: "Taipei City, Taiwan",
  placeId: "place-taipei",
  latitude: 25.03,
  longitude: 121.56,
};
const tokyo = {
  name: "Tokyo",
  address: "Tokyo, Japan",
  placeId: "place-tokyo",
  latitude: 35.68,
  longitude: 139.69,
};
const teddy = { id: "u1", name: "Teddy", imageUrl: null };
const ruru = { id: "u2", name: "ruru", imageUrl: "https://signed/ruru.jpg" };
const zoe = { id: "u3", name: "zoe", imageUrl: null };
const base: Note = {
  noteId: "",
  text: "",
  color: "mist",
  pattern: "plain",
  photoKey: null,
  photoUrl: null,
  song: null,
  place: null,
  date: null,
  x: 0,
  y: 600,
  rotation: 0,
  z: 0,
  author: teddy,
  createdAt: "2026-10-01T00:00:00.000Z",
};
const n1: Note = {
  ...base,
  noteId: "n1",
  text: "hello\nwall",
  color: "butter",
  pattern: "grid",
  date: "2026-10-12",
  song: inferno,
  place: taipei,
  x: 100,
  z: 1,
  createdAt: "2026-10-01T00:00:00.000Z",
};
const n2: Note = {
  ...base,
  noteId: "n2",
  author: ruru,
  x: 400,
  z: 2,
  createdAt: "2026-10-02T00:00:00.000Z",
};
const n3: Note = {
  ...base,
  noteId: "n3",
  text: "beach day",
  photoKey: "notes/abcdefghij0123456789abcd",
  photoUrl: "https://signed/notes/beach.jpg",
  song: lavie,
  place: tokyo,
  author: ruru,
  x: 700,
  z: 3,
  createdAt: "2026-10-05T00:00:00.000Z",
};
const n4: Note = {
  ...base,
  noteId: "n4",
  text: "zoe was here",
  color: "lilac",
  pattern: "lines",
  song: lavie,
  author: zoe,
  x: 1000,
  z: 4,
  createdAt: "2026-10-07T00:00:00.000Z",
};
const halloween = {
  specialDayId: "sd1",
  name: "Halloween",
  month: 10,
  day: 31,
  year: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

// ---------- server ----------

const db = {
  notes: [] as Note[],
  specialDays: [] as (typeof halloween | Record<string, unknown>)[],
  todos: [] as Record<string, unknown>[],
  trips: [] as Record<string, unknown>[],
};
const requests: { method: string; path: string; body: unknown }[] = [];
const sent = (method: string, path: string | RegExp) =>
  requests.filter(
    (r) =>
      r.method === method &&
      (typeof path === "string" ? r.path === path : path.test(r.path)),
  );
const record = async (request: Request) => {
  const text = await request.clone().text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // binary upload
  }
  requests.push({
    method: request.method,
    path: new URL(request.url).pathname,
    body,
  });
  return body as Record<string, unknown>;
};

const server = setupServer();
// msw 3 renamed onUnhandledRequest; the old key type-errors and only warns
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

const serverKey = "notes/tz4a98xxat96iws9zmbrgj3a";
const uploadUrl = "https://r2.test/upload?sig=1";
const defaultHandlers = () => [
  http.get("/api/profile", () =>
    HttpResponse.json({
      id: "u1",
      name: "Teddy",
      email: "t@example.com",
      imageKey: null,
      imageUrl: null,
    }),
  ),
  http.get("/api/moments/notes", () => HttpResponse.json({ notes: db.notes })),
  http.get("/api/todos", () => HttpResponse.json({ todos: db.todos })),
  http.get("/api/trips", () => HttpResponse.json({ trips: db.trips })),
  http.post("/api/moments/notes", async ({ request }) => {
    const { photo, ...body } = (await record(request)) as Record<
      string,
      unknown
    >;
    const photoKey = photo === "new" ? serverKey : null;
    const note: Note = {
      ...base,
      ...(body as Partial<Note>),
      noteId: `new${String(db.notes.length)}`,
      photoKey,
      photoUrl: photoKey ? "https://signed/new.jpg" : null,
      z: Math.max(0, ...db.notes.map((n) => n.z + 1)),
      author: teddy,
      createdAt: "2026-10-22T04:00:00.000Z",
    };
    db.notes = [...db.notes, note];
    return HttpResponse.json({
      note,
      uploadUrl: photo === "new" ? uploadUrl : null,
    });
  }),
  http.put("/api/moments/notes/:noteId", async ({ request, params }) => {
    const { photo, ...body } = (await record(request)) as Record<
      string,
      unknown
    >;
    const index = db.notes.findIndex((n) => n.noteId === params.noteId);
    const current = db.notes[index];
    const photoKey =
      photo === "keep" ? current.photoKey : photo === "new" ? serverKey : null;
    db.notes[index] = {
      ...current,
      ...(body as Partial<Note>),
      photoKey,
      photoUrl:
        photo === "keep"
          ? current.photoUrl
          : photoKey
            ? "https://signed/new.jpg"
            : null,
    };
    return HttpResponse.json({
      note: db.notes[index],
      uploadUrl: photo === "new" ? uploadUrl : null,
    });
  }),
  http.patch("/api/moments/notes/:noteId", async ({ request, params }) => {
    const body = await record(request);
    const index = db.notes.findIndex((n) => n.noteId === params.noteId);
    db.notes[index] = { ...db.notes[index], ...(body as Partial<Note>) };
    return HttpResponse.json(db.notes[index]);
  }),
  http.delete("/api/moments/notes/:noteId", async ({ request, params }) => {
    await record(request);
    db.notes = db.notes.filter((n) => n.noteId !== params.noteId);
    return HttpResponse.json({ success: true });
  }),
  http.put("https://r2.test/upload", async ({ request }) => {
    requests.push({
      method: "PUT",
      path: "r2",
      body: request.headers.get("content-type"),
    });
    return new HttpResponse(null, { status: 200 });
  }),
  http.get("/api/music/search", ({ request }) => {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    requests.push({ method: "GET", path: "/api/music/search", body: q });
    return HttpResponse.json({
      results: q.toLowerCase().startsWith("inf")
        ? [
            inferno,
            {
              videoId: "vid-other",
              title: "Inferno (Live)",
              channelTitle: "Live",
              thumbnailUrl: "https://i.ytimg.com/vi/other/hq.jpg",
            },
          ]
        : [],
    });
  }),
  http.get("/api/moments/special-days", () =>
    HttpResponse.json({ specialDays: db.specialDays }),
  ),
  http.post("/api/moments/special-days", async ({ request }) => {
    const body = await record(request);
    const day = {
      specialDayId: `sd${String(db.specialDays.length + 10)}`,
      createdAt: "2026-10-22T04:00:00.000Z",
      ...body,
    };
    db.specialDays = [...db.specialDays, day];
    return HttpResponse.json(day);
  }),
  http.delete(
    "/api/moments/special-days/:specialDayId",
    async ({ request, params }) => {
      await record(request);
      db.specialDays = db.specialDays.filter(
        (d) => d.specialDayId !== params.specialDayId,
      );
      return HttpResponse.json({ success: true });
    },
  ),
  // 4×2 mask: some land in the north
  http.get(/\/moments\/land-mask\.json$/, () =>
    HttpResponse.json({
      w: 4,
      h: 2,
      res: 90,
      rle: btoa("\x03\x01\x02\x01\x01\x04"),
    }),
  ),
];

// Local noon on Thu 2026-10-22: anniversary (Nov 1) in 10 days, Halloween in 9
const now = new Date(2026, 9, 22, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(now);
  setViewport(1440, 900);
  globalThis.ResizeObserver =
    SizedResizeObserver as unknown as typeof ResizeObserver;
  db.notes = structuredClone([n1, n2, n3, n4]);
  db.specialDays = [structuredClone(halloween)];
  db.todos = [];
  db.trips = [];
  nav.reset();
  requests.length = 0;
  maps.places = null;
  songPlayer.reset();
  vi.clearAllMocks();
  try {
    localStorage.setItem("moments-calendar-day", "2026-10-22");
  } catch {
    // ignore
  }
  server.use(...defaultHandlers());
});

afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

// ---------- helpers ----------

const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);
const renderWall = async () => {
  const user = userEvent.setup();
  const view = render(<MomentsWall />, { wrapper });
  await screen.findByRole("button", { name: /^hello wall, by Teddy/ });
  return { user, ...view };
};
const noteButton = (name: RegExp) => screen.getByRole("button", { name });
const allNotes = () =>
  screen.queryAllByRole("button", { name: /\. Press to edit$/ });
const editor = () => screen.getByRole("dialog", { name: "Edit note" });
const pad = () => screen.getByRole("button", { name: /^New note/ });
const calendarButton = () =>
  screen.getByRole("button", { name: /Press to manage special days$/ });
const specialDialog = () =>
  screen.getByRole("dialog", { name: "Special days" });
const hasColor = (element: HTMLElement | null, hex: string) => {
  const rgb = `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  for (let el = element; el; el = el.parentElement) {
    if (
      el.style.backgroundColor === rgb ||
      el.style.background.includes(rgb) ||
      el.className.toString().toLowerCase().includes(hex.toLowerCase())
    ) {
      return true;
    }
    if (el.tagName === "BUTTON") return false;
  }
  return false;
};
const exactText = (text: string) => (_: string, element: Element | null) =>
  element?.textContent === text &&
  Array.from(element.children).every((child) => child.textContent !== text);
const openEditorFor = async (
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) => {
  await user.click(noteButton(name));
  return screen.findByRole("dialog", { name: "Edit note" });
};
// Route changes go through the nav store, like the header tabs do
const goTo = async (url: string) => {
  await act(async () => {
    nav.go(url);
  });
};
const zoomLabel = () =>
  screen.getByRole("button", {
    name: /^Zoom (level: .+\. Show the whole globe|\d+%\. Reset to 100%)$/,
  });

// ---------- tests ----------

describe("R4/R6: wall content", () => {
  test("shows the chips, title, subtitle, legend and controls", async () => {
    await renderWall();

    expect(screen.getByText("Since 2022")).toBeDefined();
    expect(screen.getByText("Day 1451")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Our Moments" })).toBeDefined();
    expect(
      screen.getByText(
        "A shared home for our photos, notes, plans, and the small moments that keep adding up.",
      ),
    ).toBeDefined();
    expect(screen.getByText("Tap to open")).toBeDefined();
    expect(screen.getByText("Hold to hear its song")).toBeDefined();
    expect(screen.getByText("Drag the wall to look around")).toBeDefined();
    expect(pad()).toBeDefined();
    expect(calendarButton()).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Open Love Map: 2 places" }),
    ).toBeDefined();
    // R23: the bottom Wall/Map toggle is gone; the header tabs switch modes
    expect(screen.queryByRole("button", { name: "Wall" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Map" })).toBeNull();
    expect(allNotes()).toHaveLength(4);
  });
});

describe("R7/R8/R9: notes", () => {
  test("each note is a button with the spec's label", async () => {
    await renderWall();

    expect(noteButton(/^hello wall, by Teddy/).getAttribute("aria-label")).toBe(
      "hello wall, by Teddy, at Taipei. Hold to play Inferno. Press to edit",
    );
    expect(noteButton(/^Empty note/).getAttribute("aria-label")).toBe(
      "Empty note, by ruru. Press to edit",
    );
    expect(noteButton(/^beach day/).getAttribute("aria-label")).toBe(
      "beach day, by ruru, at Tokyo. Hold to play Lavie en rose forever. Press to edit",
    );
    expect(noteButton(/^zoe was here/).getAttribute("aria-label")).toBe(
      "zoe was here, by zoe. Hold to play Lavie en rose forever. Press to edit",
    );
    expect(noteButton(/^hello wall/).tagName).toBe("BUTTON");
  });

  test("a plain note shows its date as yyyy.MM.dd, song, text, author and place", async () => {
    await renderWall();
    const note = within(noteButton(/^hello wall/));

    expect(note.getByText("2026.10.12")).toBeDefined();
    expect(note.getByText("Inferno")).toBeDefined();
    expect(note.getByText("Teddy")).toBeDefined();
    expect(note.getByText("Taipei")).toBeDefined();
    expect(note.getByText(/hello\s*wall/)).toBeDefined();
  });

  test("a note without a date shows no date", async () => {
    await renderWall();

    expect(
      within(noteButton(/^Empty note/)).queryByText(/^\d{4}\.\d{2}\.\d{2}$/),
    ).toBeNull();
  });

  test("a song title over 12 chars is ellipsized to 11 + …", async () => {
    await renderWall();

    expect(
      within(noteButton(/^zoe was here/)).getByText("Lavie en ro…"),
    ).toBeDefined();
  });

  test("a photo note shows its photo, caption, place and song", async () => {
    await renderWall();
    const note = noteButton(/^beach day/);

    const sources = Array.from(note.querySelectorAll("img")).map((img) =>
      decodeURIComponent(img.getAttribute("src") ?? ""),
    );
    expect(
      sources.some((src) => src.includes("https://signed/notes/beach.jpg")),
    ).toBe(true);
    expect(within(note).getByText("beach day")).toBeDefined();
    expect(within(note).getByText("Tokyo")).toBeDefined();
    expect(within(note).getByText("Lavie en ro…")).toBeDefined();
  });

  test("the viewer's badge is blue with their initial", async () => {
    await renderWall();

    await waitFor(() =>
      expect(
        hasColor(within(noteButton(/^hello wall/)).getByText("T"), "#4F70A8"),
      ).toBe(true),
    );
  });

  test("another author's badge is rose with the initial uppercased", async () => {
    await renderWall();

    await waitFor(() =>
      expect(
        hasColor(within(noteButton(/^zoe was here/)).getByText("Z"), "#A8505F"),
      ).toBe(true),
    );
  });

  test("an author with a profile image shows the image instead of a letter", async () => {
    await renderWall();
    const note = noteButton(/^Empty note/);

    const sources = Array.from(note.querySelectorAll("img")).map((img) =>
      decodeURIComponent(img.getAttribute("src") ?? ""),
    );
    expect(sources.some((src) => src.includes("https://signed/ruru.jpg"))).toBe(
      true,
    );
    expect(within(note).queryByText("R")).toBeNull();
  });
});

describe("R10/R11: gestures on a note", () => {
  test("a quick press opens the editor for that note", async () => {
    const { user } = await renderWall();

    const dialog = await openEditorFor(user, /^hello wall/);

    expect(
      within(dialog).getByRole("heading", { name: "Edit note" }),
    ).toBeDefined();
  });

  test("holding a note with a song plays it until release", async () => {
    const { user } = await renderWall();
    const note = noteButton(/^hello wall/);

    await user.pointer({ keys: "[MouseLeft>]", target: note });
    await waitFor(() =>
      expect(songPlayer.play).toHaveBeenCalledWith("vid-inferno"),
    );
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("status")
          .some((status) => status.textContent?.includes("Playing Inferno")),
      ).toBe(true),
    );

    await user.pointer({ keys: "[/MouseLeft]", target: note });

    await waitFor(() => expect(songPlayer.stop).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull();
  });

  test("holding a note without a song shows the bubble and does not open the editor", async () => {
    const { user } = await renderWall();
    const note = noteButton(/^Empty note/);

    await user.pointer({ keys: "[MouseLeft>]", target: note });
    expect(
      await screen.findByText("No song yet · tap to add one", undefined, {
        timeout: 1500,
      }),
    ).toBeDefined();
    await user.pointer({ keys: "[/MouseLeft]", target: note });

    expect(songPlayer.play).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull();
  });

  test("dragging a note saves x, y, z and does not open the editor", async () => {
    const { user } = await renderWall();
    const note = noteButton(/^hello wall/);

    await user.pointer([
      {
        keys: "[MouseLeft>]",
        target: note,
        coords: { clientX: 200, clientY: 300 },
      },
      { target: note, coords: { clientX: 230, clientY: 300 } },
      { target: note, coords: { clientX: 300, clientY: 300 } },
      {
        keys: "[/MouseLeft]",
        target: note,
        coords: { clientX: 300, clientY: 300 },
      },
    ]);

    await waitFor(() =>
      expect(sent("PATCH", "/api/moments/notes/n1")).toHaveLength(1),
    );
    const body = sent("PATCH", "/api/moments/notes/n1")[0].body as Record<
      string,
      number
    >;
    expect(Object.keys(body).sort()).toEqual(["x", "y", "z"]);
    expect(body.x).toBeGreaterThan(n1.x);
    expect(body.y).toBeCloseTo(n1.y);
    expect(body.z).toBe(5);
    expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull();
  });

  test("a move under 6px is still a tap", async () => {
    const { user } = await renderWall();
    const note = noteButton(/^hello wall/);

    await user.pointer([
      {
        keys: "[MouseLeft>]",
        target: note,
        coords: { clientX: 200, clientY: 300 },
      },
      { target: note, coords: { clientX: 203, clientY: 302 } },
      {
        keys: "[/MouseLeft]",
        target: note,
        coords: { clientX: 203, clientY: 302 },
      },
    ]);

    expect(
      await screen.findByRole("dialog", { name: "Edit note" }),
    ).toBeDefined();
    expect(sent("PATCH", /notes/)).toHaveLength(0);
  });

  test("a failed move toasts", async () => {
    server.use(
      http.patch("/api/moments/notes/:noteId", () =>
        HttpResponse.json(
          { message: "Failed to update note" },
          { status: 500 },
        ),
      ),
    );
    const { user } = await renderWall();
    const note = noteButton(/^hello wall/);

    await user.pointer([
      {
        keys: "[MouseLeft>]",
        target: note,
        coords: { clientX: 200, clientY: 300 },
      },
      { target: note, coords: { clientX: 300, clientY: 300 } },
      {
        keys: "[/MouseLeft]",
        target: note,
        coords: { clientX: 300, clientY: 300 },
      },
    ]);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to move note"),
    );
  });

  test("the context menu is suppressed on notes and the pad", async () => {
    await renderWall();

    expect(fireEvent.contextMenu(noteButton(/^hello wall/))).toBe(false);
    expect(fireEvent.contextMenu(pad())).toBe(false);
  });
});

describe("R13: the pad", () => {
  test("a tap adds a blank note and opens the editor for it", async () => {
    const { user } = await renderWall();

    await user.click(pad());

    const dialog = await screen.findByRole("dialog", { name: "Edit note" });
    expect(
      within(dialog).getByRole("heading", { name: "New note" }),
    ).toBeDefined();
    expect(
      (within(dialog).getByLabelText("Note text") as HTMLTextAreaElement).value,
    ).toBe("");
    expect(
      within(dialog)
        .getByRole("button", { name: "Mist" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(dialog)
        .getByRole("button", { name: "Plain" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      (within(dialog).getByLabelText("Date") as HTMLInputElement).value,
    ).toBe("2026-10-22");
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Remove song" }),
    ).toBeNull();
  });

  test("Enter and Space on the pad also add a note", async () => {
    const { user } = await renderWall();

    pad().focus();
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("dialog", { name: "Edit note" }),
    ).toBeDefined();
    await user.click(within(editor()).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );

    pad().focus();
    await user.keyboard(" ");
    expect(
      await screen.findByRole("dialog", { name: "Edit note" }),
    ).toBeDefined();
  });

  test("Stick it posts the new note with the defaults", async () => {
    const { user } = await renderWall();

    await user.click(pad());
    const dialog = await screen.findByRole("dialog", { name: "Edit note" });
    await user.type(within(dialog).getByLabelText("Note text"), "hello again");
    await user.click(within(dialog).getByRole("button", { name: "Stick it" }));

    await waitFor(() =>
      expect(sent("POST", "/api/moments/notes")).toHaveLength(1),
    );
    const body = sent("POST", "/api/moments/notes")[0].body as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      text: "hello again",
      color: "mist",
      pattern: "plain",
      photo: "none",
      song: null,
      place: null,
      date: "2026-10-22",
    });
    expect(Number.isInteger(body.rotation)).toBe(true);
    expect(body.rotation as number).toBeGreaterThanOrEqual(-4);
    expect(body.rotation as number).toBeLessThanOrEqual(4);
    expect(typeof body.x).toBe("number");
    expect(typeof body.y).toBe("number");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );
    expect(
      await screen.findByRole("button", { name: /^hello again, by Teddy/ }),
    ).toBeDefined();
  });

  test("Cancel removes the new note without saving", async () => {
    const { user } = await renderWall();

    await user.click(pad());
    const dialog = await screen.findByRole("dialog", { name: "Edit note" });
    // The modal editor hides the wall from the a11y tree
    expect(
      screen.getAllByRole("button", { name: /. Press to edit$/, hidden: true }),
    ).toHaveLength(5);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );
    expect(allNotes()).toHaveLength(4);
    expect(sent("POST", "/api/moments/notes")).toHaveLength(0);
  });

  test("dragging the pad pulls a new note and opens the editor on release", async () => {
    const { user } = await renderWall();
    const sheet = pad();

    await user.pointer([
      {
        keys: "[MouseLeft>]",
        target: sheet,
        coords: { clientX: 1300, clientY: 100 },
      },
      { target: sheet, coords: { clientX: 1200, clientY: 300 } },
      { target: sheet, coords: { clientX: 900, clientY: 500 } },
      {
        keys: "[/MouseLeft]",
        target: sheet,
        coords: { clientX: 900, clientY: 500 },
      },
    ]);

    const dialog = await screen.findByRole("dialog", { name: "Edit note" });
    expect(
      within(dialog).getByRole("heading", { name: "New note" }),
    ).toBeDefined();
  });
});

describe("R14/R18/R19/R30: the editor", () => {
  test("opens an existing note with its content", async () => {
    const { user } = await renderWall();

    const dialog = await openEditorFor(user, /^hello wall/);

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(
      within(dialog).getByRole("heading", { name: "Edit note" }),
    ).toBeDefined();
    const text = within(dialog).getByLabelText(
      "Note text",
    ) as HTMLTextAreaElement;
    expect(text.value).toBe("hello\nwall");
    expect(text.maxLength).toBe(200);
    expect(text.placeholder).toBe("Write something…");
    expect(
      within(dialog)
        .getByRole("button", { name: "Butter" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(dialog)
        .getByRole("button", { name: "Mist" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      within(dialog)
        .getByRole("button", { name: "Grid" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      (within(dialog).getByLabelText("Date") as HTMLInputElement).type,
    ).toBe("date");
    expect(
      (within(dialog).getByLabelText("Date") as HTMLInputElement).value,
    ).toBe("2026-10-12");
    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Close editor" }),
    ).toBeDefined();
  });

  test("a photo note's textarea asks for a caption", async () => {
    const { user } = await renderWall();

    const dialog = await openEditorFor(user, /^beach day/);

    expect(
      (within(dialog).getByLabelText("Note text") as HTMLTextAreaElement)
        .placeholder,
    ).toBe("Write a caption…");
  });

  test("Stick it PUTs the content fields only", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);

    const text = within(dialog).getByLabelText("Note text");
    await user.clear(text);
    await user.type(text, "edited");
    await user.click(within(dialog).getByRole("button", { name: "Lilac" }));
    await user.click(within(dialog).getByRole("button", { name: "Lines" }));
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Stick it" }));

    await waitFor(() =>
      expect(sent("PUT", "/api/moments/notes/n1")).toHaveLength(1),
    );
    expect(sent("PUT", "/api/moments/notes/n1")[0].body).toEqual({
      text: "edited",
      color: "lilac",
      pattern: "lines",
      photo: "none",
      photoFile: null,
      song: inferno,
      place: taipei,
      date: null,
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );
    expect(
      await screen.findByRole("button", { name: /^edited, by Teddy/ }),
    ).toBeDefined();
  });

  test("Stick it is disabled while saving", async () => {
    let release: () => void = () => undefined;
    server.use(
      http.put("/api/moments/notes/:noteId", async ({ request }) => {
        await record(request);
        await new Promise<void>((resolve) => (release = resolve));
        return HttpResponse.json({ note: n1, uploadUrl: null });
      }),
    );
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);

    await user.click(within(dialog).getByRole("button", { name: "Stick it" }));

    await waitFor(() =>
      expect(
        (
          within(dialog).getByRole("button", {
            name: "Stick it",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    // Finish the save while the wall is still mounted, so SWR's mutate has a live provider
    act(() => release());
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );
  });

  test.each([
    [
      "the server message",
      { message: "Photo already used by another note" },
      409,
      "Photo already used by another note",
    ],
    ["a fallback", null, 500, "Failed to save note"],
  ])(
    "a failed save keeps the draft and toasts %s",
    async (_, payload, status, message) => {
      server.use(
        http.put("/api/moments/notes/:noteId", () =>
          payload
            ? HttpResponse.json(payload, { status })
            : new HttpResponse("<html>", { status }),
        ),
      );
      const { user } = await renderWall();
      const dialog = await openEditorFor(user, /^hello wall/);
      const text = within(dialog).getByLabelText("Note text");
      await user.clear(text);
      await user.type(text, "keep me");

      await user.click(
        within(dialog).getByRole("button", { name: "Stick it" }),
      );

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
      expect(screen.getByRole("dialog", { name: "Edit note" })).toBeDefined();
      expect(
        (within(editor()).getByLabelText("Note text") as HTMLTextAreaElement)
          .value,
      ).toBe("keep me");
    },
  );

  test.each([
    [
      "Cancel",
      (user: ReturnType<typeof userEvent.setup>) =>
        user.click(within(editor()).getByRole("button", { name: "Cancel" })),
    ],
    [
      "Close editor",
      (user: ReturnType<typeof userEvent.setup>) =>
        user.click(
          within(editor()).getByRole("button", { name: "Close editor" }),
        ),
    ],
    [
      "Escape",
      (user: ReturnType<typeof userEvent.setup>) => user.keyboard("{Escape}"),
    ],
  ])("%s discards the draft", async (_, close) => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);
    await user.type(within(dialog).getByLabelText("Note text"), " changed");

    await close(user);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );
    expect(sent("PUT", /notes/)).toHaveLength(0);
    expect(noteButton(/^hello wall, by Teddy/)).toBeDefined();
  });

  test("focus moves into the editor and returns to the note on close", async () => {
    const { user } = await renderWall();
    const note = noteButton(/^hello wall/);

    note.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Edit note" });
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(document.activeElement).toBe(noteButton(/^hello wall/)),
    );
  });
});

describe("R15/R36: background and photo", () => {
  test("swatches are labelled and pressed one at a time", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    for (const name of ["Mist", "Butter", "Blush", "Mint", "Lilac", "Paper"]) {
      expect(within(dialog).getByRole("button", { name })).toBeDefined();
    }
    await user.click(within(dialog).getByRole("button", { name: "Blush" }));

    expect(
      within(dialog)
        .getByRole("button", { name: "Blush" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(dialog)
        .getByRole("button", { name: "Mist" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(within(dialog).getByText("Upload")).toBeDefined();
  });

  test("on a photo note, a swatch turns the photo off and Photo turns it back on", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^beach day/);

    expect(within(dialog).getByText("Change")).toBeDefined();
    await user.click(within(dialog).getByRole("button", { name: "Grid" }));
    expect(within(dialog).getByText("Photo")).toBeDefined();
    await user.click(within(dialog).getByText("Photo"));
    expect(within(dialog).getByText("Change")).toBeDefined();

    await user.click(within(dialog).getByRole("button", { name: "Paper" }));
    await user.click(within(dialog).getByRole("button", { name: "Stick it" }));

    await waitFor(() =>
      expect(sent("PUT", "/api/moments/notes/n3")).toHaveLength(1),
    );
    expect(sent("PUT", "/api/moments/notes/n3")[0].body).toMatchObject({
      color: "paper",
      photo: "none",
    });
    expect(sent("PUT", "r2")).toHaveLength(0);
  });

  test("the upload input takes one image and crops it square", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);
    const input = within(dialog).getByLabelText(
      /background image/,
    ) as HTMLInputElement;

    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/*,.heic,.heif");
    expect(input.multiple).toBe(false);
    await user.upload(
      input,
      new File(["png"], "me.png", { type: "image/png" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
    await waitFor(() => expect(cropper.props.aspect).toBe(1));
  });

  test("a GIF skips cropping; Stick it saves first, then uploads to the returned URL", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.upload(within(dialog).getByLabelText(/background image/), gif());
    await waitFor(() =>
      expect(within(editor()).getByText("Change")).toBeDefined(),
    );
    await user.click(
      within(editor()).getByRole("button", { name: "Stick it" }),
    );

    await waitFor(() => expect(sent("PUT", "r2")).toHaveLength(1));
    const order = requests.map((r) => `${r.method} ${r.path}`);
    expect(order.indexOf("PUT /api/moments/notes/n2")).toBeGreaterThanOrEqual(
      0,
    );
    expect(order.indexOf("PUT r2")).toBeGreaterThan(
      order.indexOf("PUT /api/moments/notes/n2"),
    );
    expect(sent("PUT", "r2")[0].body).toBe("image/gif");
    expect(sent("PUT", "/api/moments/notes/n2")).toHaveLength(1);
    expect(sent("PUT", "/api/moments/notes/n2")[0].body).toMatchObject({
      photo: "new",
    });
    expect(sent("PUT", "/api/moments/notes/n2")[0].body).not.toHaveProperty(
      "photoKey",
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("a failed upload toasts, drops the photo with a second save, and closes", async () => {
    server.use(
      http.put(
        "https://r2.test/upload",
        () => new HttpResponse("<Error/>", { status: 500 }),
      ),
    );
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);
    await user.type(within(dialog).getByLabelText("Note text"), "with pic");

    await user.upload(within(dialog).getByLabelText(/background image/), gif());
    await waitFor(() =>
      expect(within(editor()).getByText("Change")).toBeDefined(),
    );
    await user.click(
      within(editor()).getByRole("button", { name: "Stick it" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to upload photo"),
    );
    await waitFor(() =>
      expect(sent("PUT", "/api/moments/notes/n2")).toHaveLength(2),
    );
    const [first, second] = sent("PUT", "/api/moments/notes/n2").map(
      (r) => r.body as Record<string, unknown>,
    );
    expect(first.photo).toBe("new");
    expect(first.photoFile).toEqual({ size: 3, type: "image/gif" });
    expect(second).toEqual({ ...first, photo: "none", photoFile: null });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );
    const note = await screen.findByRole("button", {
      name: /^with pic, by ruru/,
    });
    const sources = Array.from(note.querySelectorAll("img")).map((img) =>
      img.getAttribute("src"),
    );
    expect(sources).not.toContain("https://signed/new.jpg");
  });
});

describe("R16: song", () => {
  test("with no song and no query, lists the shared songs, distinct, newest note first", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    expect(within(dialog).getByText("From your shared list")).toBeDefined();
    const search = within(dialog).getByLabelText(
      "Search YouTube Music",
    ) as HTMLInputElement;
    expect(search.placeholder).toBe("Search YouTube Music…");
    const titles = within(dialog)
      .getAllByRole("button", { name: /Inferno|Lavie en rose forever/ })
      .map((b) => b.textContent);
    expect(titles).toHaveLength(2);
    expect(titles[0]).toContain("Lavie en rose forever");
    expect(titles[1]).toContain("Inferno");
  });

  test("searching shows results; picking one sets the song and clears the query", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);
    const search = within(dialog).getByLabelText("Search YouTube Music");

    await user.type(search, "Inferno");
    expect(await within(dialog).findByText("Results")).toBeDefined();
    expect(sent("GET", "/api/music/search").map((r) => r.body)).toEqual([
      "Inferno",
    ]);
    await user.click(
      within(dialog).getByRole("button", { name: /Inferno \(Live\)/ }),
    );

    expect(
      (
        within(dialog).getByLabelText(
          "Search YouTube Music",
        ) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(within(dialog).getByText("Inferno (Live)")).toBeDefined();
    expect(within(dialog).getByText("Live")).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Preview song" }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Remove song" }),
    ).toBeDefined();
    expect(
      (
        within(dialog).getByLabelText(
          "Search YouTube Music",
        ) as HTMLInputElement
      ).placeholder,
    ).toBe("Swap song · Search YouTube Music…");

    await user.click(within(dialog).getByRole("button", { name: "Stick it" }));
    await waitFor(() =>
      expect(sent("PUT", "/api/moments/notes/n2")).toHaveLength(1),
    );
    expect((sent("PUT", "/api/moments/notes/n2")[0].body as Note).song).toEqual(
      {
        videoId: "vid-other",
        title: "Inferno (Live)",
        channelTitle: "Live",
        thumbnailUrl: "https://i.ytimg.com/vi/other/hq.jpg",
      },
    );
  });

  test("an empty search says nothing was found", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.type(
      within(dialog).getByLabelText("Search YouTube Music"),
      "zzz",
    );

    expect(
      await within(dialog).findByText("Nothing found for “zzz”"),
    ).toBeDefined();
  });

  test("a search error toasts its message", async () => {
    server.use(
      http.get("/api/music/search", () =>
        HttpResponse.json(
          { message: "YouTube Data API is not enabled for this API key." },
          { status: 502 },
        ),
      ),
    );
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.type(
      within(dialog).getByLabelText("Search YouTube Music"),
      "Inferno",
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "YouTube Data API is not enabled for this API key.",
      ),
    );
  });

  test("preview plays through the song player and toggles to pause", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);

    await user.click(
      within(dialog).getByRole("button", { name: "Preview song" }),
    );

    expect(songPlayer.play).toHaveBeenCalledWith("vid-inferno");
    await user.click(
      await within(dialog).findByRole("button", { name: "Pause preview" }),
    );
    expect(songPlayer.stop).toHaveBeenCalled();
  });

  test("Remove song clears it", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);

    await user.click(
      within(dialog).getByRole("button", { name: "Remove song" }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Stick it" }));

    await waitFor(() =>
      expect(sent("PUT", "/api/moments/notes/n1")).toHaveLength(1),
    );
    expect(
      (sent("PUT", "/api/moments/notes/n1")[0].body as Note).song,
    ).toBeNull();
  });
});

describe("R17: place", () => {
  test("chips list None and each used place; picking one saves it", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    expect(
      within(dialog)
        .getByRole("button", { name: "None" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(dialog).getByRole("button", { name: "Taipei" }),
    ).toBeDefined();
    expect(within(dialog).getByRole("button", { name: "Tokyo" })).toBeDefined();
    await user.click(within(dialog).getByRole("button", { name: "Taipei" }));
    expect(
      within(dialog)
        .getByRole("button", { name: "Taipei" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(within(dialog).getByRole("button", { name: "Stick it" }));

    await waitFor(() =>
      expect(sent("PUT", "/api/moments/notes/n2")).toHaveLength(1),
    );
    expect(
      (sent("PUT", "/api/moments/notes/n2")[0].body as Note).place,
    ).toEqual(taipei);
  });

  test("None clears the place", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);

    expect(
      within(dialog)
        .getByRole("button", { name: "Taipei" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(within(dialog).getByRole("button", { name: "None" }));
    await user.click(within(dialog).getByRole("button", { name: "Stick it" }));

    await waitFor(() =>
      expect(sent("PUT", "/api/moments/notes/n1")).toHaveLength(1),
    );
    expect(
      (sent("PUT", "/api/moments/notes/n1")[0].body as Note).place,
    ).toBeNull();
  });

  test("without Maps the search says it is not available; chips still work", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await waitFor(() => {
      const search = within(dialog).queryByLabelText("Search a place");
      expect(
        within(dialog).queryByText("Place search is not available.") ??
          (search?.getAttribute("placeholder") ===
          "Place search is not available."
            ? search
            : null),
      ).not.toBeNull();
    });
    await user.click(within(dialog).getByRole("button", { name: "Tokyo" }));
    expect(
      within(dialog)
        .getByRole("button", { name: "Tokyo" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  describe("with Google Places", () => {
    const fetchFields = vi.fn();
    const sessionTokens: unknown[] = [];
    const fetchSuggestions = vi.fn();

    beforeEach(() => {
      sessionTokens.length = 0;
      fetchFields.mockReset().mockResolvedValue({});
      fetchSuggestions
        .mockReset()
        .mockImplementation(({ input }: { input: string }) =>
          Promise.resolve({
            suggestions: input.toLowerCase().startsWith("kyo")
              ? [
                  {
                    placePrediction: {
                      placeId: "place-kyoto",
                      text: { text: "Kyoto, Japan" },
                      mainText: { text: "Kyoto" },
                      secondaryText: { text: "Japan" },
                      toPlace: () => ({
                        id: "place-kyoto",
                        displayName: "Kyoto City",
                        formattedAddress: "Kyoto, Japan",
                        location: { lat: () => 35.01, lng: () => 135.76 },
                        fetchFields,
                      }),
                    },
                  },
                ]
              : [],
          }),
        );
      maps.places = {
        AutocompleteSessionToken: function AutocompleteSessionToken(
          this: unknown,
        ) {
          sessionTokens.push(this);
        },
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: fetchSuggestions,
        },
      };
    });

    test("picking a prediction sets the place with Google's display name", async () => {
      const { user } = await renderWall();
      const dialog = await openEditorFor(user, /^Empty note/);

      const search = within(dialog).getByLabelText(
        "Search a place",
      ) as HTMLInputElement;
      expect(search.placeholder).toBe("Search a place…");
      await user.type(search, "Kyoto");
      await user.click(
        await within(dialog).findByRole("button", { name: /Kyoto/ }),
      );
      await waitFor(() => expect(fetchFields).toHaveBeenCalled());
      expect(fetchFields).toHaveBeenCalledWith({
        fields: ["id", "formattedAddress", "location"],
      });
      expect(
        fetchSuggestions.mock.calls.every(
          ([request]) =>
            (request as { sessionToken: unknown }).sessionToken ===
            sessionTokens[0],
        ),
      ).toBe(true);
      await waitFor(() =>
        expect(
          within(dialog)
            .getByRole("button", { name: "Kyoto" })
            .getAttribute("aria-pressed"),
        ).toBe("true"),
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Stick it" }),
      );

      await waitFor(() =>
        expect(sent("PUT", "/api/moments/notes/n2")).toHaveLength(1),
      );
      expect(
        (sent("PUT", "/api/moments/notes/n2")[0].body as Note).place,
      ).toEqual({
        name: "Kyoto",
        address: "Kyoto, Japan",
        placeId: "place-kyoto",
        latitude: 35.01,
        longitude: 135.76,
      });
    });

    test("no match says nothing was found", async () => {
      const { user } = await renderWall();
      const dialog = await openEditorFor(user, /^Empty note/);

      await user.type(
        within(dialog).getByLabelText("Search a place"),
        "Atlantis",
      );

      expect(
        await within(dialog).findByText("Nothing found for “Atlantis”"),
      ).toBeDefined();
    });
  });
});

describe("R35: delete", () => {
  test("confirming deletes the note, toasts and closes the editor", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    const alert = await screen.findByRole("alertdialog");
    expect(within(alert).getByText("Delete this note?")).toBeDefined();
    expect(within(alert).getByText("This can't be undone.")).toBeDefined();
    const confirm = within(alert)
      .getAllByRole("button")
      .find((b) => b.textContent !== "Cancel");
    await user.click(confirm as HTMLElement);

    await waitFor(() =>
      expect(sent("DELETE", "/api/moments/notes/n1")).toHaveLength(1),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Note deleted"),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: /^hello wall/ })).toBeNull();
  });

  test("a failed delete puts the note back and toasts", async () => {
    server.use(
      http.delete("/api/moments/notes/:noteId", () =>
        HttpResponse.json(
          { message: "Failed to delete note" },
          { status: 500 },
        ),
      ),
    );
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    const alert = await screen.findByRole("alertdialog");
    await user.click(
      within(alert)
        .getAllByRole("button")
        .find((b) => b.textContent !== "Cancel") as HTMLElement,
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to delete note"),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: /^hello wall, by Teddy/,
          hidden: true,
        }),
      ).toBeDefined(),
    );
    expect(toast.success).not.toHaveBeenCalledWith("Note deleted");
  });
});

describe("R20/R21: calendar", () => {
  test("counts down to the next special day", async () => {
    await renderWall();

    expect(calendarButton().getAttribute("aria-label")).toBe(
      "9 days to Halloween. Press to manage special days",
    );
    const calendar = within(calendarButton());
    expect(calendar.getByText("9")).toBeDefined();
    expect(calendar.getByText("days to go")).toBeDefined();
    expect(calendar.getByText("Halloween")).toBeDefined();
    expect(calendar.getByText("31")).toBeDefined();
    expect(calendar.getByText(/^oct/i)).toBeDefined();
    expect(calendar.getByText(/^sat/i)).toBeDefined();
  });

  test("one day left says day to go", async () => {
    db.specialDays = [{ ...halloween, month: 10, day: 23 }];
    await renderWall();

    await waitFor(() =>
      expect(within(calendarButton()).getByText("day to go")).toBeDefined(),
    );
  });

  test("tied days join their names, anniversary first", async () => {
    db.specialDays = [
      { ...halloween, specialDayId: "a", name: "Pizza day", month: 11, day: 1 },
      {
        ...halloween,
        specialDayId: "b",
        name: "Dance",
        month: 11,
        day: 1,
        year: 2026,
      },
    ];
    await renderWall();

    await waitFor(() =>
      expect(
        within(calendarButton()).getByText(
          "4th Anniversary & Pizza day & Dance",
        ),
      ).toBeDefined(),
    );
  });

  test("on the day itself it says TODAY and Happy {name}!", async () => {
    vi.setSystemTime(new Date(2026, 10, 1, 9));
    localStorage.setItem("moments-calendar-day", "2026-11-01");
    await renderWall();

    await waitFor(() =>
      expect(calendarButton().getAttribute("aria-label")).toBe(
        "Today is 4th Anniversary. Press to manage special days",
      ),
    );
    expect(within(calendarButton()).getByText("TODAY")).toBeDefined();
    expect(
      within(calendarButton()).getByText("Happy 4th Anniversary!"),
    ).toBeDefined();
  });

  test("a new day tears off yesterday's page and stores today", async () => {
    localStorage.setItem("moments-calendar-day", "2026-10-21");
    await renderWall();

    await waitFor(() =>
      expect(screen.getAllByText("10").length).toBeGreaterThan(0),
    );
    expect(localStorage.getItem("moments-calendar-day")).toBe("2026-10-22");
  });

  test("a first visit (no key) also tears and stores today", async () => {
    localStorage.removeItem("moments-calendar-day");
    await renderWall();

    await waitFor(() =>
      expect(screen.getAllByText("10").length).toBeGreaterThan(0),
    );
    expect(localStorage.getItem("moments-calendar-day")).toBe("2026-10-22");
  });

  test("the same day does not tear", async () => {
    await renderWall();

    expect(screen.queryByText("10")).toBeNull();
  });

  test("storage that throws means no tear and no crash", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await renderWall();

    expect(calendarButton()).toBeDefined();
    expect(screen.queryByText("10")).toBeNull();
  });

  test("on the day itself nothing tears", async () => {
    vi.setSystemTime(new Date(2026, 10, 1, 9));
    localStorage.setItem("moments-calendar-day", "2026-10-31");
    await renderWall();

    await waitFor(() =>
      expect(within(calendarButton()).getByText("TODAY")).toBeDefined(),
    );
    expect(screen.queryByText("day to go")).toBeNull();
    expect(localStorage.getItem("moments-calendar-day")).toBe("2026-11-01");
  });
});

describe("R22/R23: special days dialog", () => {
  test("lists upcoming days in order with sub lines and chips", async () => {
    db.specialDays = [
      halloween,
      {
        ...halloween,
        specialDayId: "sd2",
        name: "Trip",
        month: 10,
        day: 23,
        year: 2026,
      },
      {
        ...halloween,
        specialDayId: "sd3",
        name: "Now",
        month: 10,
        day: 22,
        year: 2026,
      },
    ];
    const { user } = await renderWall();

    await user.click(calendarButton());
    const dialog = await screen.findByRole("dialog", { name: "Special days" });

    expect(
      within(dialog).getByRole("heading", { name: "Special days" }),
    ).toBeDefined();
    expect(
      within(dialog).getByText(
        "The calendar on the wall counts down to the next one.",
      ),
    ).toBeDefined();
    const text = dialog.textContent ?? "";
    const order = ["Now", "Trip", "Halloween", "4th Anniversary"].map((n) =>
      text.indexOf(n),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(within(dialog).getByText("Today")).toBeDefined();
    expect(within(dialog).getByText("Tomorrow")).toBeDefined();
    expect(within(dialog).getByText("in 9 days")).toBeDefined();
    expect(within(dialog).getByText("in 10 days")).toBeDefined();
    expect(within(dialog).getAllByText("One time · 2026")).toHaveLength(2);
    // The Halloween row and the add form's checkbox label
    expect(within(dialog).getAllByText("Every year")).toHaveLength(2);
    expect(within(dialog).getByText("Every year · since 2022")).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Remove Halloween" }),
    ).toBeDefined();
    expect(
      within(dialog).queryByRole("button", { name: /^Remove 4th Anniversary/ }),
    ).toBeNull();
  });

  test("adding a one-time day posts it, toasts, resets and refreshes", async () => {
    const { user } = await renderWall();
    await user.click(calendarButton());
    const dialog = await screen.findByRole("dialog", { name: "Special days" });
    const add = within(dialog).getByRole("button", {
      name: "Add to calendar",
    }) as HTMLButtonElement;
    const name = within(dialog).getByLabelText("Name") as HTMLInputElement;
    const yearly = within(dialog).getByRole("checkbox", {
      name: "Every year",
    }) as HTMLInputElement;

    expect(name.placeholder).toBe("Name · e.g. her birthday");
    expect(yearly.checked).toBe(true);
    expect(add.disabled).toBe(true);
    await user.type(name, "Test day");
    expect(add.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2026-10-27" },
    });
    await user.click(yearly);
    await waitFor(() => expect(add.disabled).toBe(false));
    await user.click(add);

    await waitFor(() =>
      expect(sent("POST", "/api/moments/special-days")).toHaveLength(1),
    );
    expect(sent("POST", "/api/moments/special-days")[0].body).toEqual({
      name: "Test day",
      month: 10,
      day: 27,
      year: 2026,
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Special day added"),
    );
    await waitFor(() => expect(name.value).toBe(""));
    const row = await waitFor(() => {
      const match = within(dialog)
        .getAllByRole("listitem")
        .find((item) => within(item).queryByText("Test day"));
      expect(match).toBeDefined();
      return match as HTMLElement;
    });
    expect(within(row).getByText("in 5 days")).toBeDefined();
    expect(within(row).getByText("One time · 2026")).toBeDefined();
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", {
            name: /Press to manage special days$/,
            hidden: true,
          })
          .getAttribute("aria-label"),
      ).toBe("5 days to Test day. Press to manage special days"),
    );
  });

  test("a yearly day posts year null", async () => {
    const { user } = await renderWall();
    await user.click(calendarButton());
    const dialog = await screen.findByRole("dialog", { name: "Special days" });

    await user.type(within(dialog).getByLabelText("Name"), "  Bday  ");
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "1995-03-04" },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Add to calendar" }),
    );

    await waitFor(() =>
      expect(sent("POST", "/api/moments/special-days")).toHaveLength(1),
    );
    expect(sent("POST", "/api/moments/special-days")[0].body).toEqual({
      name: "Bday",
      month: 3,
      day: 4,
      year: null,
    });
  });

  test("a whitespace-only name keeps Add disabled", async () => {
    const { user } = await renderWall();
    await user.click(calendarButton());
    const dialog = await screen.findByRole("dialog", { name: "Special days" });

    await user.type(within(dialog).getByLabelText("Name"), "   ");
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2026-10-27" },
    });

    expect(
      (
        within(dialog).getByRole("button", {
          name: "Add to calendar",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test.each([
    [
      "the server message",
      { message: "Invalid special day" },
      "Invalid special day",
    ],
    ["a fallback", null, "Failed to add special day"],
  ])("a failed add toasts %s", async (_, payload, message) => {
    server.use(
      http.post("/api/moments/special-days", () =>
        payload
          ? HttpResponse.json(payload, { status: 400 })
          : new HttpResponse("oops", { status: 500 }),
      ),
    );
    const { user } = await renderWall();
    await user.click(calendarButton());
    const dialog = await screen.findByRole("dialog", { name: "Special days" });

    await user.type(within(dialog).getByLabelText("Name"), "Test day");
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2026-10-27" },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Add to calendar" }),
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    expect(
      (within(dialog).getByLabelText("Name") as HTMLInputElement).value,
    ).toBe("Test day");
  });

  test("removing a day deletes it and toasts", async () => {
    const { user } = await renderWall();
    await user.click(calendarButton());
    const dialog = await screen.findByRole("dialog", { name: "Special days" });

    await user.click(
      within(dialog).getByRole("button", { name: "Remove Halloween" }),
    );

    await waitFor(() =>
      expect(sent("DELETE", "/api/moments/special-days/sd1")).toHaveLength(1),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Special day removed"),
    );
    await waitFor(() =>
      expect(within(dialog).queryByText("Halloween")).toBeNull(),
    );
  });

  test.each([
    [
      "Done",
      (user: ReturnType<typeof userEvent.setup>) =>
        user.click(
          within(specialDialog()).getByRole("button", { name: "Done" }),
        ),
    ],
    [
      "Close special days",
      (user: ReturnType<typeof userEvent.setup>) =>
        user.click(
          within(specialDialog()).getByRole("button", {
            name: "Close special days",
          }),
        ),
    ],
    [
      "Escape",
      (user: ReturnType<typeof userEvent.setup>) => user.keyboard("{Escape}"),
    ],
  ])("%s closes and returns focus to the calendar", async (_, close) => {
    const { user } = await renderWall();
    calendarButton().focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Special days" });
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );

    await close(user);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Special days" })).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(calendarButton()));
  });
});

describe("R5: wall zoom bar", () => {
  test("starts at clamp(width / 1440) and steps by 1.25", async () => {
    const { user } = await renderWall();

    expect(zoomLabel().getAttribute("aria-label")).toBe(
      "Zoom 100%. Reset to 100%",
    );
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    await waitFor(() =>
      expect(zoomLabel().getAttribute("aria-label")).toBe(
        "Zoom 125%. Reset to 100%",
      ),
    );
    await user.click(zoomLabel());
    await waitFor(() =>
      expect(zoomLabel().getAttribute("aria-label")).toBe(
        "Zoom 100%. Reset to 100%",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    await waitFor(() =>
      expect(zoomLabel().getAttribute("aria-label")).toBe(
        "Zoom 80%. Reset to 100%",
      ),
    );
  });

  test("clamps at 250%", async () => {
    const { user } = await renderWall();

    for (let i = 0; i < 8; i++) {
      await user.click(screen.getByRole("button", { name: "Zoom in" }));
      await new Promise((resolve) => setTimeout(resolve, 450));
    }

    await waitFor(() =>
      expect(zoomLabel().getAttribute("aria-label")).toBe(
        "Zoom 250%. Reset to 100%",
      ),
    );
  }, 10000);

  test("a narrow board starts at the 50% floor", async () => {
    setViewport(600, 900);
    await renderWall();

    expect(zoomLabel().getAttribute("aria-label")).toBe(
      "Zoom 50%. Reset to 100%",
    );
  });

  test("Ctrl + wheel zooms the wall", async () => {
    await renderWall();

    fireEvent.wheel(screen.getByText("Since 2022"), {
      deltaY: -200,
      ctrlKey: true,
      clientX: 700,
      clientY: 400,
    });

    await waitFor(() =>
      expect(zoomLabel().getAttribute("aria-label")).not.toBe(
        "Zoom 100%. Reset to 100%",
      ),
    );
  });

  test("has a fit button", async () => {
    const { user } = await renderWall();

    await user.click(
      screen.getByRole("button", { name: "Fit everything on screen" }),
    );

    await waitFor(() => expect(zoomLabel()).toBeDefined());
  });
});

describe("R25/R26/R27: map mode", () => {
  test("the Love Map card shows the place count and opens the map", async () => {
    const { user } = await renderWall();
    const card = screen.getByRole("button", {
      name: "Open Love Map: 2 places",
    });

    expect(within(card).getByText("Love Map")).toBeDefined();
    expect(within(card).getByText("2 places · tap to open")).toBeDefined();
    await user.click(card);

    // R23: the card navigates to /map
    await waitFor(() => expect(nav.path()).toBe("/map"));
    expect(await screen.findByRole("heading", { name: "Map" })).toBeDefined();
  });

  test("Map shows pins, counts, controls and the info chip", async () => {
    await renderWall();

    await goTo("/map");

    expect(await screen.findByRole("heading", { name: "Map" })).toBeDefined();
    expect(
      await screen.findAllByText(exactText("Taipei · 1")),
    ).not.toHaveLength(0);
    expect(screen.getAllByText(exactText("Tokyo · 1"))).not.toHaveLength(0);
    expect(
      screen.getAllByText(exactText("2 places · 2 notes")),
    ).not.toHaveLength(0);
    expect(
      screen.getByText("Drag to spin · scroll or pinch to zoom"),
    ).toBeDefined();
    expect(
      screen.getAllByText(exactText("2 places · 2 notes on the map")),
    ).not.toHaveLength(0);
    // R28: only to-do layers link to Two Do
    expect(screen.queryByRole("link", { name: /Open in Two Do/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Fit our places" }),
    ).toBeDefined();
    expect(zoomLabel().getAttribute("aria-label")).toMatch(
      /^Zoom level: (Globe|Continent|Country|City|Neighborhood|Street)\. Show the whole globe$/,
    );
  });

  test("the level button shows the whole globe; + zooms past it", async () => {
    const { user } = await renderWall();
    await goTo("/map");
    await screen.findByRole("heading", { name: "Map" });

    await user.click(zoomLabel());
    await waitFor(
      () =>
        expect(zoomLabel().getAttribute("aria-label")).toBe(
          "Zoom level: Globe. Show the whole globe",
        ),
      { timeout: 2000 },
    );
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole("button", { name: "Zoom in" }));
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    await waitFor(() =>
      expect(zoomLabel().getAttribute("aria-label")).not.toBe(
        "Zoom level: Globe. Show the whole globe",
      ),
    );
  }, 10000);

  test("tapping a note in map mode opens the editor", async () => {
    const { user } = await renderWall();
    await goTo("/map");
    await screen.findByRole("heading", { name: "Map" });

    await user.click(noteButton(/^hello wall/));

    expect(
      await screen.findByRole("dialog", { name: "Edit note" }),
    ).toBeDefined();
  });

  test("notes don't drag in map mode", async () => {
    const { user } = await renderWall();
    await goTo("/map");
    await screen.findByRole("heading", { name: "Map" });
    const note = noteButton(/^hello wall/);

    await user.pointer([
      {
        keys: "[MouseLeft>]",
        target: note,
        coords: { clientX: 200, clientY: 300 },
      },
      { target: note, coords: { clientX: 300, clientY: 300 } },
      {
        keys: "[/MouseLeft]",
        target: note,
        coords: { clientX: 300, clientY: 300 },
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(sent("PATCH", /notes/)).toHaveLength(0);
  });

  test("returning to the wall restores the wall camera", async () => {
    const { user } = await renderWall();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    await waitFor(() =>
      expect(zoomLabel().getAttribute("aria-label")).toBe(
        "Zoom 125%. Reset to 100%",
      ),
    );

    await goTo("/map");
    await screen.findByRole("heading", { name: "Map" });
    await goTo("/moments");

    expect(
      await screen.findByRole("heading", { name: "Our Moments" }),
    ).toBeDefined();
    await waitFor(() =>
      expect(zoomLabel().getAttribute("aria-label")).toBe(
        "Zoom 125%. Reset to 100%",
      ),
    );
  });

  test("with no places the card says 0 places", async () => {
    db.notes = [n2];
    render(<MomentsWall />, { wrapper });

    expect(
      await screen.findByRole("button", { name: "Open Love Map: 0 places" }),
    ).toBeDefined();
  });
});

describe("R28: phone layout", () => {
  beforeEach(() => setViewport(390, 844));

  test("shows the phone hint and New pad, and no mode toggle", async () => {
    await renderWall();

    expect(
      screen.getByText("Hold a note to hear its song · pinch to zoom"),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Wall" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Map" })).toBeNull();
    expect(within(pad()).getByText("New")).toBeDefined();
    expect(zoomLabel().getAttribute("aria-label")).toBe(
      "Zoom 50%. Reset to 100%",
    );
  });

  test("the pad opens the full-screen editor sheet; Cancel discards", async () => {
    const { user } = await renderWall();

    await user.click(pad());
    const dialog = await screen.findByRole("dialog", { name: "Edit note" });

    expect(
      within(dialog).getByRole("heading", { name: "New note" }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Stick it" }),
    ).toBeDefined();
    expect(
      within(dialog).queryByRole("button", { name: "Delete note" }),
    ).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );
    expect(allNotes()).toHaveLength(4);
  });

  test("an existing note's sheet has Delete note", async () => {
    const { user } = await renderWall();

    const dialog = await openEditorFor(user, /^hello wall/);

    expect(
      within(dialog).getByRole("button", { name: "Delete note" }),
    ).toBeDefined();
  });

  test("map mode shows the layer chips, the phone hint and a Globe fit", async () => {
    await renderWall();

    await goTo("/map");

    expect(
      await screen.findByText("Drag to spin · pinch to zoom"),
    ).toBeDefined();
    const chips = screen.getByRole("group", { name: "Show on map" });
    expect(
      within(chips)
        .getByRole("button", { name: /Notes/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: /^Zoom level: .+\. Fit our places$/ }),
    ).toBeDefined();
  });
});

describe("R31: loading", () => {
  test("a failed notes load toasts and shows the wall without notes", async () => {
    server.use(
      http.get("/api/moments/notes", () =>
        HttpResponse.json(
          { message: "Failed to fetch notes" },
          { status: 500 },
        ),
      ),
    );
    render(<MomentsWall />, { wrapper });

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Our Moments" })).toBeDefined();
    expect(allNotes()).toHaveLength(0);
  });

  test("slow notes still render once loaded", async () => {
    server.use(
      http.get("/api/moments/notes", async () => {
        await delay(50);
        return HttpResponse.json({ notes: db.notes });
      }),
    );
    render(<MomentsWall />, { wrapper });

    expect(
      await screen.findByRole("button", { name: /^hello wall/ }),
    ).toBeDefined();
  });
});

// ---------- white-box ----------

const board = () => screen.getByRole("region", { name: "Moments wall" });
const wrapperOf = (note: HTMLElement) => note.parentElement as HTMLElement;
const backgroundPosition = () => board().style.backgroundPosition;
const mouse = { pointerId: 1, pointerType: "mouse", button: 0 };
const confirmIn = (alert: HTMLElement) =>
  within(alert)
    .getAllByRole("button")
    .find((b) => b.textContent !== "Cancel") as HTMLElement;
const gif = () => new File(["gif"], "fun.gif", { type: "image/gif" });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("R10: an edited note stays on top", () => {
  test("saving keeps the raised local z, not the server's older z", async () => {
    const { user } = await renderWall();

    const dialog = await openEditorFor(user, /^hello wall/);
    await user.type(within(dialog).getByLabelText("Note text"), "!");
    await user.click(within(dialog).getByRole("button", { name: "Stick it" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );
    // The PUT answered z 1 (the stored value)
    expect(db.notes.find((note) => note.noteId === "n1")?.z).toBe(1);
    const others = ["Empty note", "beach day", "zoe was here"].map((name) =>
      Number(
        (noteButton(new RegExp(`^${name}`)).parentElement as HTMLElement).style
          .zIndex,
      ),
    );
    const edited = Number(
      (noteButton(/^hello wall!/).parentElement as HTMLElement).style.zIndex,
    );
    expect(edited).toBeGreaterThan(Math.max(...others));
  });
});

describe("R9: stacking order", () => {
  test("each note stacks at its z", async () => {
    await renderWall();

    expect(wrapperOf(noteButton(/^hello wall/)).style.zIndex).toBe("1");
    expect(wrapperOf(noteButton(/^Empty note/)).style.zIndex).toBe("2");
    expect(wrapperOf(noteButton(/^beach day/)).style.zIndex).toBe("3");
    expect(wrapperOf(noteButton(/^zoe was here/)).style.zIndex).toBe("4");
  });

  test("notes render in the order the API gives (z ascending)", async () => {
    await renderWall();

    expect(
      allNotes().map((n) => n.getAttribute("aria-label")?.split(",")[0]),
    ).toEqual(["hello wall", "Empty note", "beach day", "zoe was here"]);
  });

  test("pressing a note raises it to max + 1 locally, without saving", async () => {
    await renderWall();

    fireEvent.pointerDown(noteButton(/^hello wall/), mouse);

    await waitFor(() =>
      expect(wrapperOf(noteButton(/^hello wall/)).style.zIndex).toBe("5"),
    );
    fireEvent.pointerUp(noteButton(/^hello wall/), mouse);
    expect(sent("PATCH", /notes/)).toHaveLength(0);
  });

  test("pressing the top note keeps its z", async () => {
    await renderWall();

    fireEvent.pointerDown(noteButton(/^zoe was here/), mouse);

    expect(wrapperOf(noteButton(/^zoe was here/)).style.zIndex).toBe("4");
    fireEvent.pointerUp(noteButton(/^zoe was here/), mouse);
  });

  test("a playing note lifts above every other note", async () => {
    const { user } = await renderWall();
    const note = noteButton(/^hello wall/);

    await user.pointer({ keys: "[MouseLeft>]", target: note });
    await waitFor(() => expect(songPlayer.play).toHaveBeenCalled());

    expect(
      Number(wrapperOf(noteButton(/^hello wall/)).style.zIndex),
    ).toBeGreaterThan(5);
    await user.pointer({ keys: "[/MouseLeft]", target: note });
  });
});

describe("R10: gesture edge cases (white-box)", () => {
  test("a cancelled pointer does not open the editor on the click that follows", async () => {
    await renderWall();
    const note = noteButton(/^hello wall/);

    fireEvent.pointerDown(note, mouse);
    fireEvent.pointerCancel(note, mouse);
    fireEvent.click(note);

    await pause(50);
    expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull();
  });

  test("a right-button press starts no hold", async () => {
    await renderWall();
    const note = noteButton(/^hello wall/);

    fireEvent.pointerDown(note, { ...mouse, button: 2 });
    await pause(550);

    expect(songPlayer.play).not.toHaveBeenCalled();
    fireEvent.pointerUp(note, mouse);
  });

  test("a click long after a drag opens the editor again", async () => {
    const { user } = await renderWall();
    const note = noteButton(/^hello wall/);

    await user.pointer([
      {
        keys: "[MouseLeft>]",
        target: note,
        coords: { clientX: 200, clientY: 300 },
      },
      { target: note, coords: { clientX: 300, clientY: 300 } },
      {
        keys: "[/MouseLeft]",
        target: note,
        coords: { clientX: 300, clientY: 300 },
      },
    ]);
    await waitFor(() =>
      expect(sent("PATCH", "/api/moments/notes/n1")).toHaveLength(1),
    );
    // The faked clock lags real time, so step it past the 400ms quiet window
    vi.setSystemTime(Date.now() + 500);
    await user.click(noteButton(/^hello wall/));

    expect(
      await screen.findByRole("dialog", { name: "Edit note" }),
    ).toBeDefined();
  });

  test("a drag follows the pointer in world space (÷ zoom)", async () => {
    setViewport(720, 900);
    const { user } = await renderWall();
    const note = noteButton(/^hello wall/);

    await user.pointer([
      {
        keys: "[MouseLeft>]",
        target: note,
        coords: { clientX: 200, clientY: 300 },
      },
      { target: note, coords: { clientX: 250, clientY: 330 } },
      {
        keys: "[/MouseLeft]",
        target: note,
        coords: { clientX: 250, clientY: 330 },
      },
    ]);

    // 720 / 1440 → zoom 0.5, so 50px on screen is 100 on the wall
    await waitFor(() =>
      expect(sent("PATCH", "/api/moments/notes/n1")).toHaveLength(1),
    );
    const body = sent("PATCH", "/api/moments/notes/n1")[0].body as Record<
      string,
      number
    >;
    expect(body.x).toBeCloseTo(n1.x + 100);
    expect(body.y).toBeCloseTo(n1.y + 60);
  });

  test("a hold stops when the view switches to the map", async () => {
    const { user } = await renderWall();
    const note = noteButton(/^hello wall/);

    await user.pointer({ keys: "[MouseLeft>]", target: note });
    await waitFor(() => expect(songPlayer.play).toHaveBeenCalled());
    await goTo("/map");

    await waitFor(() => expect(songPlayer.stop).toHaveBeenCalled());
  });

  test("the bubble goes away after 1.7s", async () => {
    const { user } = await renderWall();
    const note = noteButton(/^Empty note/);

    await user.pointer({ keys: "[MouseLeft>]", target: note });
    await screen.findByText("No song yet · tap to add one");
    await user.pointer({ keys: "[/MouseLeft]", target: note });

    await waitFor(
      () =>
        expect(screen.queryByText("No song yet · tap to add one")).toBeNull(),
      { timeout: 2500 },
    );
  }, 8000);
});

describe("R13: pad edge cases (white-box)", () => {
  test("a tap places the note at the view center ±20", async () => {
    const { user } = await renderWall();

    await user.click(pad());
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Edit note" }),
      ).getByRole("button", { name: "Stick it" }),
    );

    await waitFor(() =>
      expect(sent("POST", "/api/moments/notes")).toHaveLength(1),
    );
    const body = sent("POST", "/api/moments/notes")[0].body as Record<
      string,
      number
    >;
    // Board 1440×900 at zoom 1: center minus half a note
    expect(Math.abs(body.x - 615)).toBeLessThanOrEqual(20);
    expect(Math.abs(body.y - 345)).toBeLessThanOrEqual(20);
  });

  test("a pad drag drops the new note under the pointer", async () => {
    const { user } = await renderWall();
    const sheet = pad();

    await user.pointer([
      {
        keys: "[MouseLeft>]",
        target: sheet,
        coords: { clientX: 1300, clientY: 100 },
      },
      { target: sheet, coords: { clientX: 1200, clientY: 300 } },
      { target: sheet, coords: { clientX: 900, clientY: 500 } },
      {
        keys: "[/MouseLeft]",
        target: sheet,
        coords: { clientX: 900, clientY: 500 },
      },
    ]);
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Edit note" }),
      ).getByRole("button", { name: "Stick it" }),
    );

    await waitFor(() =>
      expect(sent("POST", "/api/moments/notes")).toHaveLength(1),
    );
    expect(sent("POST", "/api/moments/notes")[0].body).toMatchObject({
      x: 795,
      y: 395,
    });
  });

  test("a right-button press on the pad adds nothing", async () => {
    await renderWall();

    fireEvent.pointerDown(pad(), { ...mouse, button: 2 });
    fireEvent.pointerUp(pad(), { ...mouse, button: 2 });

    await pause(50);
    expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull();
  });

  test("a cancelled pointer on the pad is not a tap", async () => {
    await renderWall();

    fireEvent.pointerDown(pad(), mouse);
    fireEvent.pointerCancel(pad(), mouse);

    await pause(50);
    expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull();
    expect(allNotes()).toHaveLength(4);
  });

  test("a mouse click on the pad adds exactly one note", async () => {
    const { user } = await renderWall();

    await user.click(pad());
    await screen.findByRole("dialog", { name: "Edit note" });

    expect(
      screen.getAllByRole("button", {
        name: /^Empty note, by Teddy/,
        hidden: true,
      }),
    ).toHaveLength(1);
  });
});

describe("R5: panning and zooming the wall (white-box)", () => {
  test("dragging empty wall pans the camera and the dot grid", async () => {
    await renderWall();

    fireEvent.pointerDown(board(), { ...mouse, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(board(), { ...mouse, clientX: 560, clientY: 520 });
    fireEvent.pointerUp(board(), { ...mouse, clientX: 560, clientY: 520 });

    expect(backgroundPosition()).toBe("60px 20px");
  });

  test("the middle button also pans; the right button does not", async () => {
    await renderWall();

    fireEvent.pointerDown(board(), {
      ...mouse,
      button: 2,
      clientX: 500,
      clientY: 500,
    });
    fireEvent.pointerMove(board(), {
      ...mouse,
      button: 2,
      clientX: 560,
      clientY: 500,
    });
    fireEvent.pointerUp(board(), { ...mouse, button: 2 });
    expect(backgroundPosition()).toBe("0px 0px");

    fireEvent.pointerDown(board(), {
      ...mouse,
      button: 1,
      clientX: 500,
      clientY: 500,
    });
    fireEvent.pointerMove(board(), {
      ...mouse,
      button: 1,
      clientX: 540,
      clientY: 500,
    });
    fireEvent.pointerUp(board(), { ...mouse, button: 1 });
    expect(backgroundPosition()).toBe("40px 0px");
  });

  test("one-finger touch pans", async () => {
    await renderWall();
    const touch = { pointerId: 7, pointerType: "touch", button: 0 };

    fireEvent.pointerDown(board(), { ...touch, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(board(), { ...touch, clientX: 280, clientY: 350 });
    fireEvent.pointerUp(board(), touch);

    expect(backgroundPosition()).toBe("-20px 50px");
  });

  const finger = (pointerId: number, clientX: number) => ({
    pointerId,
    pointerType: "touch",
    button: 0,
    clientX,
    clientY: 400,
  });

  test("a two-finger pinch zooms", async () => {
    await renderWall();

    fireEvent.pointerDown(board(), finger(1, 600));
    fireEvent.pointerDown(board(), finger(2, 800));
    fireEvent.pointerMove(board(), finger(2, 1000));
    fireEvent.pointerUp(board(), finger(2, 1000));
    fireEvent.pointerUp(board(), finger(1, 600));

    expect(zoomLabel().getAttribute("aria-label")).toBe(
      "Zoom 200%. Reset to 100%",
    );
  });

  test("a pinch clamps at 25%", async () => {
    await renderWall();

    fireEvent.pointerDown(board(), finger(1, 100));
    fireEvent.pointerDown(board(), finger(2, 1100));
    fireEvent.pointerMove(board(), finger(2, 110));
    fireEvent.pointerUp(board(), finger(2, 110));
    fireEvent.pointerUp(board(), finger(1, 100));

    expect(zoomLabel().getAttribute("aria-label")).toBe(
      "Zoom 25%. Reset to 100%",
    );
  });

  test("dragging from a control does not pan", async () => {
    await renderWall();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Zoom in" }), {
      ...mouse,
      clientX: 500,
      clientY: 500,
    });
    fireEvent.pointerMove(board(), { ...mouse, clientX: 600, clientY: 500 });
    fireEvent.pointerUp(board(), mouse);

    expect(backgroundPosition()).toBe("0px 0px");
  });

  test("wheel scroll pans; line-mode deltas count 16px a line", async () => {
    await renderWall();

    fireEvent.wheel(board(), { deltaX: 30, deltaY: 100 });
    expect(backgroundPosition()).toBe("-30px -100px");

    fireEvent.wheel(board(), { deltaY: 3, deltaMode: 1 });
    expect(backgroundPosition()).toBe("-30px -148px");
  });

  test("⌘ + wheel zooms like Ctrl + wheel", async () => {
    await renderWall();

    fireEvent.wheel(board(), {
      deltaY: -60,
      metaKey: true,
      clientX: 720,
      clientY: 450,
    });

    // exp(0.6) ≈ 1.82
    expect(zoomLabel().getAttribute("aria-label")).toBe(
      "Zoom 182%. Reset to 100%",
    );
  });

  test("Ctrl + wheel zoom keeps the point under the pointer", async () => {
    await renderWall();

    fireEvent.wheel(board(), {
      deltaY: -60,
      ctrlKey: true,
      clientX: 0,
      clientY: 0,
    });

    // Zooming at the top-left corner leaves the origin in place
    expect(backgroundPosition()).toBe("0px 0px");
    expect(zoomLabel().getAttribute("aria-label")).not.toBe(
      "Zoom 100%. Reset to 100%",
    );
  });

  test("wheel over the zoom bar does nothing", async () => {
    await renderWall();

    fireEvent.wheel(screen.getByRole("button", { name: "Zoom in" }), {
      deltaY: 100,
    });

    expect(backgroundPosition()).toBe("0px 0px");
  });

  test("the wall does not move while the editor is open", async () => {
    const { user } = await renderWall();
    await openEditorFor(user, /^hello wall/);

    fireEvent.wheel(board(), { deltaY: 100 });
    fireEvent.pointerDown(board(), { ...mouse, clientX: 500, clientY: 500 });
    fireEvent.pointerMove(board(), { ...mouse, clientX: 600, clientY: 500 });

    expect(backgroundPosition()).toBe("0px 0px");
  });

  test("fit frames every note and fixed piece", async () => {
    const { user } = await renderWall();

    await user.click(
      screen.getByRole("button", { name: "Fit everything on screen" }),
    );

    // Content spans 1214×770 world px; (900 − 40 − 96) / 770 ≈ 0.99
    expect(zoomLabel().getAttribute("aria-label")).toBe(
      "Zoom 99%. Reset to 100%",
    );
  });

  test("the zoom-out step clamps at 25%", async () => {
    const { user } = await renderWall();

    for (let i = 0; i < 8; i++) {
      await user.click(screen.getByRole("button", { name: "Zoom out" }));
    }

    expect(zoomLabel().getAttribute("aria-label")).toBe(
      "Zoom 25%. Reset to 100%",
    );
  });
});

describe("R25/R26: map details (white-box)", () => {
  const openMap = async () => {
    const view = await renderWall();
    await goTo("/map");
    await screen.findByRole("heading", { name: "Map" });
    return view;
  };
  const renderMap = async (firstNote: RegExp) => {
    render(<MomentsWall />, { wrapper });
    await screen.findByRole("button", { name: firstNote });
    await goTo("/map");
    await screen.findByRole("heading", { name: "Map" });
  };
  const level = () => zoomLabel().getAttribute("aria-label");

  test("the map opens at the whole-globe level", async () => {
    await openMap();

    expect(level()).toBe("Zoom level: Globe. Show the whole globe");
  });

  test("notes without a place leave the tab order; placed ones stay", async () => {
    await openMap();

    expect(noteButton(/^Empty note/).tabIndex).toBe(-1);
    expect(noteButton(/^zoe was here/).tabIndex).toBe(-1);
    expect(noteButton(/^hello wall/).tabIndex).toBe(0);
  });

  test("wall-only pieces leave the a11y tree in map mode", async () => {
    await openMap();

    // inert takes them out of focus and the a11y tree in browsers
    expect(
      screen
        .getByRole("button", { name: /^New note/, hidden: true })
        .closest("[inert]"),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("button", {
          name: /Press to manage special days$/,
          hidden: true,
        })
        .closest("[inert]"),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: /^Open Love Map/, hidden: true })
        .closest("[inert]"),
    ).not.toBeNull();
    expect(screen.queryByText("Tap to open")).toBeNull();
  });

  test("double-click zooms ×2.5", async () => {
    await openMap();

    fireEvent.doubleClick(board(), { clientX: 720, clientY: 450 });

    // 6371000 / (378 × 2.5) ≈ 6741 m/px
    await waitFor(
      () => expect(level()).toBe("Zoom level: Continent. Show the whole globe"),
      { timeout: 2000 },
    );
  });

  test("double-click on the wall does not zoom", async () => {
    await renderWall();

    fireEvent.doubleClick(board(), { clientX: 720, clientY: 450 });

    expect(zoomLabel().getAttribute("aria-label")).toBe(
      "Zoom 100%. Reset to 100%",
    );
  });

  test("ctrl + wheel zooms the globe", async () => {
    await openMap();

    fireEvent.wheel(board(), {
      deltaY: -120,
      ctrlKey: true,
      clientX: 720,
      clientY: 450,
    });

    // exp(1.44) ≈ 4.2× → 6371000 / 1597 ≈ 3990 m/px
    expect(level()).toBe("Zoom level: Continent. Show the whole globe");
  });

  test("the globe can't zoom out past min(w, h) × 0.3", async () => {
    await openMap();

    for (let i = 0; i < 5; i++) {
      fireEvent.wheel(board(), {
        deltaY: 120,
        ctrlKey: true,
        clientX: 720,
        clientY: 450,
      });
    }

    expect(level()).toBe("Zoom level: Globe. Show the whole globe");
  });

  test("fit with one place flies to city level", async () => {
    db.notes = [n1, n2];
    await renderMap(/^hello wall/);

    fireEvent.click(screen.getByRole("button", { name: "Fit our places" }));

    await waitFor(
      () => expect(level()).toBe("Zoom level: City. Show the whole globe"),
      { timeout: 2500 },
    );
  });

  test("fit with places on opposite sides stays at the whole globe", async () => {
    // Three places 120° apart: some are always on the far side
    const at = (name: string, longitude: number) => ({
      name,
      address: `${name} street`,
      placeId: name,
      latitude: 0,
      longitude,
    });
    db.notes = [
      { ...n1, place: at("A", 0) },
      { ...n3, place: at("B", 120) },
      { ...n4, place: at("C", -120) },
    ];
    await renderMap(/^hello wall/);

    fireEvent.click(screen.getByRole("button", { name: "Fit our places" }));
    await pause(900);

    expect(level()).toBe("Zoom level: Globe. Show the whole globe");
  });

  test("fit with nearby places zooms past the globe", async () => {
    await openMap();

    fireEvent.click(screen.getByRole("button", { name: "Fit our places" }));

    await waitFor(
      () => expect(level()).not.toBe("Zoom level: Globe. Show the whole globe"),
      { timeout: 2500 },
    );
  });

  test("with no places the map still opens and counts zero", async () => {
    db.notes = [n2];
    await renderMap(/^Empty note/);

    expect(
      screen.getAllByText(exactText("0 places · 0 notes")),
    ).not.toHaveLength(0);
  });

  test("several notes at one place share one pin with their count", async () => {
    db.notes = [n1, { ...n2, place: taipei }, n3];
    await openMap();

    expect(screen.getAllByText(exactText("Taipei · 2"))).not.toHaveLength(0);
    expect(
      screen.getAllByText(exactText("2 places · 3 notes")),
    ).not.toHaveLength(0);
  });

  test("phone: the Globe button fits our places", async () => {
    setViewport(390, 844);
    await renderWall();
    await goTo("/map");
    await screen.findByText("Drag to spin · pinch to zoom");

    fireEvent.click(
      screen.getByRole("button", { name: /^Zoom level: .+\. Fit our places$/ }),
    );

    await waitFor(
      () =>
        expect(
          screen
            .getByRole("button", { name: /^Zoom level: .+\. Fit our places$/ })
            .getAttribute("aria-label"),
        ).not.toBe("Zoom level: Globe. Fit our places"),
      { timeout: 2500 },
    );
  });
});

describe("R7/R9: note content edge cases (white-box)", () => {
  test("whitespace-only text reads as an empty note", async () => {
    db.notes = [{ ...n1, text: "  \n " }];
    render(<MomentsWall />, { wrapper });

    expect(
      await screen.findByRole("button", { name: /^Empty note, by Teddy/ }),
    ).toBeDefined();
  });

  test("a 12-char song title is shown whole; 13 chars is ellipsized", async () => {
    db.notes = [
      { ...n1, song: { ...inferno, title: "abcdefghijkl" } },
      { ...n2, song: { ...inferno, videoId: "v2", title: "abcdefghijklm" } },
    ];
    render(<MomentsWall />, { wrapper });

    const first = await screen.findByRole("button", { name: /^hello wall/ });
    expect(within(first).getByText("abcdefghijkl")).toBeDefined();
    expect(
      within(noteButton(/^Empty note/)).getByText("abcdefghijk…"),
    ).toBeDefined();
  });

  test("the day counter follows the clock when the window regains focus", async () => {
    await renderWall();

    vi.setSystemTime(new Date(2026, 9, 23, 9));
    fireEvent.focus(window);

    expect(await screen.findByText("Day 1452")).toBeDefined();
  });
});

describe("R15/R19/R36: editor edge cases (white-box)", () => {
  test("a failed note save toasts and uploads nothing", async () => {
    server.use(
      http.put("/api/moments/notes/:noteId", () =>
        HttpResponse.json(
          { message: "Failed to update note" },
          { status: 500 },
        ),
      ),
    );
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.upload(within(dialog).getByLabelText(/background image/), gif());
    await waitFor(() =>
      expect(within(editor()).getByText("Change")).toBeDefined(),
    );
    await user.click(
      within(editor()).getByRole("button", { name: "Stick it" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to update note"),
    );
    expect(sent("PUT", "r2")).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "Edit note" })).toBeDefined();
    expect(within(editor()).getByText("Change")).toBeDefined();
  });

  test("a new photo note whose upload fails is saved again without its photo", async () => {
    server.use(
      http.put(
        "https://r2.test/upload",
        () => new HttpResponse("<Error/>", { status: 500 }),
      ),
    );
    const { user } = await renderWall();
    await user.click(pad());
    const dialog = await screen.findByRole("dialog", { name: "Edit note" });

    await user.upload(within(dialog).getByLabelText(/background image/), gif());
    await waitFor(() =>
      expect(within(editor()).getByText("Change")).toBeDefined(),
    );
    await user.click(
      within(editor()).getByRole("button", { name: "Stick it" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to upload photo"),
    );
    await waitFor(() =>
      expect(sent("PUT", /^\/api\/moments\/notes\/new/)).toHaveLength(1),
    );
    const created = sent("POST", "/api/moments/notes")[0].body as Record<
      string,
      unknown
    >;
    const content = Object.fromEntries(
      Object.entries(created).filter(
        ([key]) => !["x", "y", "rotation"].includes(key),
      ),
    );
    expect(sent("PUT", /^\/api\/moments\/notes\/new/)[0].body).toEqual({
      ...content,
      photo: "none",
      photoFile: null,
    });
    expect(content.photoFile).toEqual({ size: 3, type: "image/gif" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );
  });

  test("a new note whose upload and fallback save both fail still closes, saved once", async () => {
    server.use(
      http.put(
        "https://r2.test/upload",
        () => new HttpResponse("<Error/>", { status: 500 }),
      ),
      http.put("/api/moments/notes/:noteId", async ({ request }) => {
        await record(request);
        return HttpResponse.json(
          { message: "Failed to update note" },
          { status: 500 },
        );
      }),
    );
    const { user } = await renderWall();
    await user.click(pad());
    const dialog = await screen.findByRole("dialog", { name: "Edit note" });
    await user.type(within(dialog).getByLabelText("Note text"), "beach pic");

    await user.upload(within(dialog).getByLabelText(/background image/), gif());
    await waitFor(() =>
      expect(within(editor()).getByText("Change")).toBeDefined(),
    );
    await user.click(
      within(editor()).getByRole("button", { name: "Stick it" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );
    expect(sent("POST", "/api/moments/notes")).toHaveLength(1);
    expect(sent("PUT", /^\/api\/moments\/notes\/new/)).toHaveLength(1);
    expect(
      await screen.findByRole("button", { name: /^beach pic, by Teddy/ }),
    ).toBeDefined();
    expect(toast.error).toHaveBeenCalledWith("Failed to upload photo");
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  test("a save that answers no upload URL uploads nothing", async () => {
    server.use(
      http.put("/api/moments/notes/:noteId", async ({ request }) => {
        await record(request);
        return HttpResponse.json({ note: n2, uploadUrl: null });
      }),
    );
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.upload(within(dialog).getByLabelText(/background image/), gif());
    await waitFor(() =>
      expect(within(editor()).getByText("Change")).toBeDefined(),
    );
    await user.click(
      within(editor()).getByRole("button", { name: "Stick it" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit note" })).toBeNull(),
    );
    expect(sent("PUT", "r2")).toHaveLength(0);
  });

  test('a new photo note posts photo "new", then uploads the file', async () => {
    const { user } = await renderWall();
    await user.click(pad());
    const dialog = await screen.findByRole("dialog", { name: "Edit note" });

    await user.upload(within(dialog).getByLabelText(/background image/), gif());
    await waitFor(() =>
      expect(within(editor()).getByText("Change")).toBeDefined(),
    );
    expect(
      (within(editor()).getByLabelText("Note text") as HTMLTextAreaElement)
        .placeholder,
    ).toBe("Write a caption…");
    await user.click(
      within(editor()).getByRole("button", { name: "Stick it" }),
    );

    await waitFor(() =>
      expect(sent("POST", "/api/moments/notes")).toHaveLength(1),
    );
    expect(sent("POST", "/api/moments/notes")[0].body).toMatchObject({
      photo: "new",
    });
    await waitFor(() => expect(sent("PUT", "r2")).toHaveLength(1));
    expect(sent("PUT", "r2")[0].body).toBe("image/gif");
  });

  test("cancelling the crop keeps the note without a photo", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.upload(
      within(dialog).getByLabelText(/background image/),
      new File(["png"], "me.png", { type: "image/png" }),
    );
    const crop = await screen.findByRole("dialog", { name: "Crop image" });
    await user.click(within(crop).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Crop image" })).toBeNull(),
    );
    expect(within(editor()).getByText("Upload")).toBeDefined();
  });

  test("R12: a HEIC with an empty type gets through to the crop dialog", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    fireEvent.change(within(dialog).getByLabelText(/background image/), {
      target: { files: [new File(["h"], "IMG_0001.HEIC", { type: "" })] },
    });

    expect(
      await screen.findByRole("dialog", { name: "Crop image" }),
    ).toBeDefined();
  });

  test("R15: a new photo sends its size and type with photo new", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.upload(within(dialog).getByLabelText(/background image/), gif());
    await waitFor(() =>
      expect(within(editor()).getByText("Change")).toBeDefined(),
    );
    await user.click(
      within(editor()).getByRole("button", { name: "Stick it" }),
    );

    await waitFor(() => expect(sent("PUT", "r2")).toHaveLength(1));
    expect(sent("PUT", "/api/moments/notes/n2")[0].body).toMatchObject({
      photo: "new",
      photoFile: { size: 3, type: "image/gif" },
    });
  });

  test("a non-image file is ignored", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    fireEvent.change(within(dialog).getByLabelText(/background image/), {
      target: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] },
    });

    await pause(50);
    expect(screen.queryByRole("dialog", { name: "Crop image" })).toBeNull();
    expect(within(editor()).getByText("Upload")).toBeDefined();
  });

  test("on a photo note, a pattern turns the photo off too", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^beach day/);

    expect(
      within(dialog)
        .getByRole("button", { name: "Mist" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      within(dialog)
        .getByRole("button", { name: "Plain" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    await user.click(within(dialog).getByRole("button", { name: "Lines" }));

    expect(
      within(dialog)
        .getByRole("button", { name: "Lines" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(dialog)
        .getByRole("button", { name: "Mist" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      (within(dialog).getByLabelText("Note text") as HTMLTextAreaElement)
        .placeholder,
    ).toBe("Write something…");
  });

  test('an unchanged photo note sends photo "keep" and uploads nothing', async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^beach day/);

    await user.click(within(dialog).getByRole("button", { name: "Stick it" }));

    await waitFor(() =>
      expect(sent("PUT", "/api/moments/notes/n3")).toHaveLength(1),
    );
    expect(sent("PUT", "/api/moments/notes/n3")[0].body).toMatchObject({
      photo: "keep",
    });
    expect(sent("PUT", "r2")).toHaveLength(0);
  });

  test("the editor preview shows a status while the song plays", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);

    await user.click(
      within(dialog).getByRole("button", { name: "Preview song" }),
    );

    await waitFor(() =>
      expect(within(dialog).getByRole("status").textContent).toContain(
        "Playing Inferno",
      ),
    );
  });

  test("closing the editor stops a preview", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);
    await user.click(
      within(dialog).getByRole("button", { name: "Preview song" }),
    );
    songPlayer.stop.mockClear();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(songPlayer.stop).toHaveBeenCalled());
  });

  test("removing a song while previewing stops it", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);
    await user.click(
      within(dialog).getByRole("button", { name: "Preview song" }),
    );
    songPlayer.stop.mockClear();

    await user.click(
      within(dialog).getByRole("button", { name: "Remove song" }),
    );

    expect(songPlayer.stop).toHaveBeenCalled();
    expect(
      within(dialog).queryByRole("button", { name: /preview/i }),
    ).toBeNull();
  });

  test("another video playing does not count as this note's preview", async () => {
    songPlayer.play("vid-other");
    const { user } = await renderWall();

    const dialog = await openEditorFor(user, /^hello wall/);

    expect(
      within(dialog).getByRole("button", { name: "Preview song" }),
    ).toBeDefined();
  });

  test("the delete confirm can be cancelled", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    const alert = await screen.findByRole("alertdialog");
    await user.click(within(alert).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(sent("DELETE", /notes/)).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "Edit note" })).toBeDefined();
  });

  test("the confirm button says Delete", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    const alert = await screen.findByRole("alertdialog");

    expect(confirmIn(alert).textContent).toBe("Delete");
  });
});

describe("R16: song field edge cases (white-box)", () => {
  test("with a song set the shared list is hidden", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);

    expect(within(dialog).queryByText("From your shared list")).toBeNull();
  });

  test("a whitespace query searches nothing and keeps the shared list", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.type(
      within(dialog).getByLabelText("Search YouTube Music"),
      "   ",
    );
    await pause(400);

    expect(sent("GET", "/api/music/search")).toHaveLength(0);
    expect(within(dialog).getByText("From your shared list")).toBeDefined();
  });

  test("typing hides the shared list", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.type(within(dialog).getByLabelText("Search YouTube Music"), "x");

    expect(within(dialog).queryByText("From your shared list")).toBeNull();
  });

  test("picking a shared song sets it", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.click(
      within(dialog).getByRole("button", { name: /^Lavie en rose forever/ }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Stick it" }));

    await waitFor(() =>
      expect(sent("PUT", "/api/moments/notes/n2")).toHaveLength(1),
    );
    expect((sent("PUT", "/api/moments/notes/n2")[0].body as Note).song).toEqual(
      lavie,
    );
  });

  test("the query is trimmed and URL-encoded", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.type(
      within(dialog).getByLabelText("Search YouTube Music"),
      "  AC/DC & me ",
    );

    await waitFor(() =>
      expect(sent("GET", "/api/music/search")).toHaveLength(1),
    );
    expect(sent("GET", "/api/music/search")[0].body).toBe("AC/DC & me");
  });

  test("a search error without a message toasts the fallback", async () => {
    server.use(
      http.get(
        "/api/music/search",
        () => new HttpResponse("<html>", { status: 500 }),
      ),
    );
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.type(
      within(dialog).getByLabelText("Search YouTube Music"),
      "Inferno",
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to search YouTube."),
    );
  });
});

describe("R17: place search edge cases (white-box)", () => {
  type Suggest = (request: {
    input: string;
    sessionToken: unknown;
  }) => Promise<unknown>;
  const tokens: unknown[] = [];
  const prediction = (
    name: string,
    place: Record<string, unknown>,
    mainText: { text: string } | null = { text: name },
  ) => ({
    placePrediction: {
      placeId: `id-${name}`,
      text: { text: `${name}, Somewhere` },
      mainText: mainText ?? undefined,
      secondaryText: { text: "Somewhere" },
      toPlace: () => ({
        id: `id-${name}`,
        formattedAddress: `${name} Road, Somewhere`,
        location: { lat: () => 1, lng: () => 2 },
        fetchFields: () => Promise.resolve({}),
        ...place,
      }),
    },
  });
  const install = (suggest: Suggest) => {
    tokens.length = 0;
    const fetchAutocompleteSuggestions = vi.fn(suggest);
    maps.places = {
      AutocompleteSessionToken: function AutocompleteSessionToken(
        this: unknown,
      ) {
        tokens.push(this);
      },
      AutocompleteSuggestion: { fetchAutocompleteSuggestions },
    };
    return fetchAutocompleteSuggestions;
  };
  const placeSearch = (dialog: HTMLElement) =>
    within(dialog).getByLabelText("Search a place") as HTMLInputElement;

  test("without Maps the search field is disabled", async () => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    expect(placeSearch(dialog).disabled).toBe(true);
  });

  test("a failed search says so, not that nothing was found", async () => {
    install(() => Promise.reject(new Error("quota")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.type(placeSearch(dialog), "Kyoto");

    expect(
      await within(dialog).findByText("Place search failed. Try again."),
    ).toBeDefined();
    expect(within(dialog).queryByText(/Nothing found/)).toBeNull();
  });

  test("a failed pick says it could not read the place and keeps the old one", async () => {
    install(() =>
      Promise.resolve({
        suggestions: [
          prediction("Kyoto", {
            fetchFields: () => Promise.reject(new Error("network")),
          }),
        ],
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^hello wall/);

    await user.type(placeSearch(dialog), "Kyo");
    await user.click(
      await within(dialog).findByRole("button", { name: /^Kyoto/ }),
    );

    expect(
      await within(dialog).findByText("Could not read that location."),
    ).toBeDefined();
    expect(
      within(dialog)
        .getByRole("button", { name: "Taipei" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(within(dialog).getByRole("button", { name: "Stick it" }));
    await waitFor(() =>
      expect(sent("PUT", "/api/moments/notes/n1")).toHaveLength(1),
    );
    expect(
      (sent("PUT", "/api/moments/notes/n1")[0].body as Note).place,
    ).toEqual(taipei);
  });

  test("a place without a location changes nothing", async () => {
    install(() =>
      Promise.resolve({
        suggestions: [prediction("Nowhere", { location: null })],
      }),
    );
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.type(placeSearch(dialog), "Now");
    await user.click(
      await within(dialog).findByRole("button", { name: /^Nowhere/ }),
    );
    await pause(50);

    expect(
      within(dialog)
        .getByRole("button", { name: "None" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(dialog).queryByRole("button", { name: "Nowhere" }),
    ).toBeNull();
  });

  const pickAndSave = async (query: string, button: RegExp) => {
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);
    await user.type(placeSearch(dialog), query);
    await user.click(
      await within(dialog).findByRole("button", { name: button }),
    );
    await waitFor(() =>
      expect(
        within(dialog)
          .getByRole("button", { name: "None" })
          .getAttribute("aria-pressed"),
      ).toBe("false"),
    );
    await user.click(within(dialog).getByRole("button", { name: "Stick it" }));
    await waitFor(() =>
      expect(sent("PUT", "/api/moments/notes/n2")).toHaveLength(1),
    );
    return (sent("PUT", "/api/moments/notes/n2")[0].body as Note).place;
  };

  test("name is the main text cut to 100 chars; address is formattedAddress cut to 300", async () => {
    const long = "L".repeat(120);
    install(() =>
      Promise.resolve({
        suggestions: [prediction(long, { formattedAddress: "A".repeat(320) })],
      }),
    );

    expect(await pickAndSave("LLL", new RegExp(`^${long}`))).toEqual({
      name: "L".repeat(100),
      address: "A".repeat(300),
      placeId: `id-${long}`,
      latitude: 1,
      longitude: 2,
    });
  });

  test("without main text the name is the prediction's full text", async () => {
    install(() =>
      Promise.resolve({
        suggestions: [prediction("Kyoto", {}, null)],
      }),
    );

    expect(await pickAndSave("Kyo", /^Kyoto, Somewhere/)).toMatchObject({
      name: "Kyoto, Somewhere",
      address: "Kyoto Road, Somewhere",
    });
  });

  test("without formattedAddress the address is the prediction's full text", async () => {
    install(() =>
      Promise.resolve({
        suggestions: [prediction("Kyoto", { formattedAddress: undefined })],
      }),
    );

    expect(await pickAndSave("Kyo", /^Kyoto/)).toMatchObject({
      name: "Kyoto",
      address: "Kyoto, Somewhere",
    });
  });

  test("a full-text fallback longer than 100 or 300 chars is cut too", async () => {
    const long = "T".repeat(310);
    install(() =>
      Promise.resolve({
        suggestions: [prediction(long, { formattedAddress: undefined }, null)],
      }),
    );

    const place = await pickAndSave("TTT", /^T{310}/);
    expect(place?.name).toBe("T".repeat(100));
    expect(place?.address).toBe("T".repeat(300));
  });

  test("a whitespace-only main text falls back to the trimmed full text", async () => {
    install(() =>
      Promise.resolve({
        suggestions: [prediction("Kyoto", {}, { text: "   " })],
      }),
    );

    expect(await pickAndSave("Kyo", /Somewhere/)).toMatchObject({
      name: "Kyoto, Somewhere",
    });
  });

  test("main text and address are trimmed", async () => {
    install(() =>
      Promise.resolve({
        suggestions: [
          prediction(
            "Kyoto",
            { formattedAddress: "  Kyoto Road, Japan  " },
            { text: "  Kyoto  " },
          ),
        ],
      }),
    );

    expect(await pickAndSave("Kyo", /Kyoto/)).toMatchObject({
      name: "Kyoto",
      address: "Kyoto Road, Japan",
    });
  });

  test.each([
    ["empty", ""],
    ["whitespace-only", "   "],
  ])(
    "an %s formattedAddress falls back to the full text",
    async (_, formattedAddress) => {
      install(() =>
        Promise.resolve({
          suggestions: [prediction("Kyoto", { formattedAddress })],
        }),
      );

      expect(await pickAndSave("Kyo", /^Kyoto/)).toMatchObject({
        name: "Kyoto",
        address: "Kyoto, Somewhere",
      });
    },
  );

  test("only the Essentials fields are fetched", async () => {
    const fetchFields = vi.fn(() => Promise.resolve({}));
    install(() =>
      Promise.resolve({ suggestions: [prediction("Kyoto", { fetchFields })] }),
    );

    await pickAndSave("Kyo", /^Kyoto/);

    expect(fetchFields).toHaveBeenCalledWith({
      fields: ["id", "formattedAddress", "location"],
    });
  });

  test("picking a place clears the query and the next search starts a new session", async () => {
    const suggest = install(({ input }) =>
      Promise.resolve({
        suggestions: [prediction(input, {})],
      }),
    );
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.type(placeSearch(dialog), "Kyoto");
    await user.click(
      await within(dialog).findByRole("button", { name: /^Kyoto/ }),
    );
    await waitFor(() => expect(placeSearch(dialog).value).toBe(""));
    await user.type(placeSearch(dialog), "Osaka");
    await within(dialog).findByRole("button", { name: /^Osaka/ });

    expect(tokens).toHaveLength(2);
    expect(suggest.mock.calls.at(-1)?.[0].sessionToken).toBe(tokens[1]);
  });

  test("a slow answer for an older query never replaces the newer list", async () => {
    let releaseOld: () => void = () => undefined;
    install(({ input }) =>
      input === "Ky"
        ? new Promise((resolve) => {
            releaseOld = () =>
              resolve({
                suggestions: [prediction("Kyiv", {})],
              });
          })
        : Promise.resolve({
            suggestions: [prediction("Kyoto", {})],
          }),
    );
    const { user } = await renderWall();
    const dialog = await openEditorFor(user, /^Empty note/);

    await user.type(placeSearch(dialog), "Ky");
    await pause(400);
    await user.type(placeSearch(dialog), "oto");
    await within(dialog).findByRole("button", { name: /^Kyoto/ });
    act(() => releaseOld());
    await pause(50);

    expect(within(dialog).queryByRole("button", { name: /^Kyiv/ })).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: /^Kyoto/ }),
    ).toBeDefined();
  });

  test("the draft's own place gets a chip even if no other note uses it", async () => {
    db.notes = [
      { ...n1, place: { ...taipei, placeId: "own", name: "Own spot" } },
    ];
    render(<MomentsWall />, { wrapper });
    const user = userEvent.setup();
    await screen.findByRole("button", { name: /^hello wall/ });
    const dialog = await openEditorFor(user, /^hello wall/);
    // Switch away so the chip can only come from the draft
    await user.click(within(dialog).getByRole("button", { name: "None" }));

    expect(
      within(dialog).getByRole("button", { name: "Own spot" }),
    ).toBeDefined();
  });
});

describe("R21/R22/R23: calendar and special days edge cases (white-box)", () => {
  test("the torn page falls away after 2.7s", async () => {
    localStorage.setItem("moments-calendar-day", "2026-10-21");
    await renderWall();
    await waitFor(() =>
      expect(screen.getAllByText("10").length).toBeGreaterThan(0),
    );

    await waitFor(() => expect(screen.queryByText("10")).toBeNull(), {
      timeout: 3500,
    });
  }, 8000);

  test("the torn page counts from the loaded special days", async () => {
    localStorage.setItem("moments-calendar-day", "2026-10-21");
    server.use(
      http.get("/api/moments/special-days", async () => {
        await delay(200);
        return HttpResponse.json({ specialDays: db.specialDays });
      }),
    );
    await renderWall();

    // Halloween is 9 days out, so yesterday's page said 10 (the anniversary alone would say 11)
    await waitFor(() =>
      expect(screen.getAllByText("10").length).toBeGreaterThan(0),
    );
    expect(screen.queryByText("11")).toBeNull();
  });

  test("hearts float up on the day itself, inside a reduced-motion guard", async () => {
    vi.setSystemTime(new Date(2026, 10, 1, 9));
    const { container } = await renderWall();

    await waitFor(() =>
      expect(container.querySelectorAll(".animate-float-up")).toHaveLength(12),
    );
    const layer = container.querySelector(".animate-float-up")
      ?.parentElement as HTMLElement;
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.className).toContain("motion-reduce:hidden");
  });

  test("no hearts on other days", async () => {
    const { container } = await renderWall();

    expect(container.querySelectorAll(".animate-float-up")).toHaveLength(0);
  });

  test("a failed remove toasts and keeps the row", async () => {
    server.use(
      http.delete("/api/moments/special-days/:id", () =>
        HttpResponse.json(
          { message: "Special day not found." },
          { status: 404 },
        ),
      ),
    );
    const { user } = await renderWall();
    await user.click(calendarButton());
    const dialog = await screen.findByRole("dialog", { name: "Special days" });

    await user.click(
      within(dialog).getByRole("button", { name: "Remove Halloween" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Special day not found."),
    );
    expect(
      within(dialog).getByRole("button", { name: "Remove Halloween" }),
    ).toBeDefined();
  });

  test("Enter in the name field submits the form", async () => {
    const { user } = await renderWall();
    await user.click(calendarButton());
    const dialog = await screen.findByRole("dialog", { name: "Special days" });

    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2026-12-24" },
    });
    await user.type(within(dialog).getByLabelText("Name"), "Eve{Enter}");

    await waitFor(() =>
      expect(sent("POST", "/api/moments/special-days")).toHaveLength(1),
    );
    expect(sent("POST", "/api/moments/special-days")[0].body).toEqual({
      name: "Eve",
      month: 12,
      day: 24,
      year: null,
    });
  });

  test("Enter with an invalid form posts nothing", async () => {
    const { user } = await renderWall();
    await user.click(calendarButton());
    const dialog = await screen.findByRole("dialog", { name: "Special days" });

    await user.type(within(dialog).getByLabelText("Name"), "Eve{Enter}");

    await pause(50);
    expect(sent("POST", "/api/moments/special-days")).toHaveLength(0);
  });

  test("Add is disabled while the request is pending", async () => {
    let release: () => void = () => undefined;
    server.use(
      http.post("/api/moments/special-days", async ({ request }) => {
        const body = await record(request);
        await new Promise<void>((resolve) => (release = resolve));
        return HttpResponse.json({ ...halloween, ...body, specialDayId: "x" });
      }),
    );
    const { user } = await renderWall();
    await user.click(calendarButton());
    const dialog = await screen.findByRole("dialog", { name: "Special days" });
    await user.type(within(dialog).getByLabelText("Name"), "Eve");
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: "2026-12-24" },
    });
    const add = within(dialog).getByRole("button", {
      name: "Add to calendar",
    }) as HTMLButtonElement;

    await user.click(add);

    await waitFor(() => expect(add.disabled).toBe(true));
    act(() => release());
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Special day added"),
    );
  });

  test("the name field caps at 50 characters", async () => {
    const { user } = await renderWall();
    await user.click(calendarButton());
    const dialog = await screen.findByRole("dialog", { name: "Special days" });

    expect(
      (within(dialog).getByLabelText("Name") as HTMLInputElement).maxLength,
    ).toBe(50);
  });

  test("only the first row is highlighted", async () => {
    const { user } = await renderWall();
    await user.click(calendarButton());
    const dialog = await screen.findByRole("dialog", { name: "Special days" });

    const rows = within(dialog).getAllByRole("listitem");
    expect(rows[0].className).toContain("bg-us-subtle");
    expect(rows[1].className).not.toContain("bg-us-subtle");
  });
});

// ---------- map layers (trips & map tab) ----------

const kyotoPlace = {
  name: "Kyoto",
  address: "Kyoto, Japan",
  placeId: "place-kyoto",
  latitude: 35.01,
  longitude: 135.77,
};
const osakaPlace = {
  name: "Osaka",
  address: "Osaka, Japan",
  placeId: "place-osaka",
  latitude: 34.69,
  longitude: 135.5,
};
const todoDto = (
  id: string,
  title: string,
  patch: Record<string, unknown>,
): Record<string, unknown> => ({
  id,
  title,
  description: null,
  location: null,
  tripId: null,
  createdAt: "2026-01-02T12:00:00.000Z",
  updatedAt: "2026-01-02T12:00:00.000Z",
  doneAt: null,
  priority: 1,
  images: [],
  createdBy: { name: "Teddy", imageUrl: null },
  ...patch,
});
const japanTrip = {
  id: "trip1",
  name: "Japan",
  startDate: "2025-12-20",
  endDate: "2026-01-05",
  position: 1,
};
const taipeiTrip = {
  id: "trip2",
  name: "Taipei weekend",
  startDate: null,
  endDate: null,
  position: 2,
};
const donePast = "2025-01-10T12:00:00.000Z";
const seedTodos = () => {
  db.trips = [structuredClone(japanTrip), structuredClone(taipeiTrip)];
  db.todos = [
    todoDto("i1", "Ramen class", { priority: 1, location: tokyo }),
    todoDto("i2", "Sunset hike", { priority: 5 }),
    todoDto("s1", "Kyoto temple", {
      tripId: "trip1",
      doneAt: donePast,
      priority: 2,
      location: kyotoPlace,
    }),
    todoDto("s2", "Osaka food", {
      tripId: "trip1",
      priority: 3,
      location: osakaPlace,
    }),
    todoDto("s3", "Nara deer", { tripId: "trip1", priority: 4 }),
    todoDto("u1", "Night market", {
      doneAt: donePast,
      priority: 6,
      location: taipei,
    }),
  ];
};
const renderMapAt = async (url: string) => {
  nav.go(url);
  const user = userEvent.setup();
  const view = render(<MomentsWall />, { wrapper });
  await screen.findByRole("heading", { name: "Map" });
  await screen.findByRole("button", { name: /Japan/ });
  return { user, ...view };
};
const layersCard = () => screen.getByRole("group", { name: "Show on map" });
const layerRow = (name: RegExp) =>
  within(layersCard()).getByRole("button", { name });
const pinLabels = () =>
  Array.from(document.querySelectorAll(".pin-label")).map((el) =>
    el.textContent?.trim(),
  );
const globeLevel = () => zoomLabel().getAttribute("aria-label");

describe("R25: the Show on map card", () => {
  beforeEach(seedTodos);

  test("lists Notes, Inspiration, Unsorted, the Trips label and each trip", async () => {
    await renderMapAt("/map");

    const notes = layerRow(/^Notes/);
    expect(notes.textContent).toContain("2 places · 2 notes");
    expect(layerRow(/^Inspiration/).textContent).toContain(
      "2 ideas · no trip yet",
    );
    expect(layerRow(/^Unsorted/).textContent).toContain(
      "1 done · waiting for a trip",
    );
    expect(within(layersCard()).getByText("Trips")).toBeDefined();
    expect(layerRow(/^Japan/).textContent).toContain("3 stops · 1 done");
    const taipeiRow = layerRow(/^Taipei weekend/);
    expect(taipeiRow.textContent).toContain("0 stops");
    expect(taipeiRow.textContent).not.toContain("done");
    const order = [
      notes,
      layerRow(/^Inspiration/),
      layerRow(/^Unsorted/),
      layerRow(/^Japan/),
      taipeiRow,
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  test("Notes is active on plain /map", async () => {
    await renderMapAt("/map");

    expect(layerRow(/^Notes/).getAttribute("aria-pressed")).toBe("true");
    for (const name of [/^Inspiration/, /^Unsorted/, /^Japan/]) {
      expect(layerRow(name).getAttribute("aria-pressed")).toBe("false");
    }
  });

  test("one idea is singular; no Unsorted row when it is empty", async () => {
    db.todos = db.todos.filter((t) => t.id !== "i2" && t.id !== "u1");
    await renderMapAt("/map");

    expect(layerRow(/^Inspiration/).textContent).toContain(
      "1 idea · no trip yet",
    );
    expect(
      within(layersCard()).queryByRole("button", { name: /^Unsorted/ }),
    ).toBeNull();
  });

  test("R24: an unknown layer falls back to Notes", async () => {
    await renderMapAt("/map?layer=bogus");

    expect(layerRow(/^Notes/).getAttribute("aria-pressed")).toBe("true");
  });

  test("R24: picking a layer replaces the URL without scrolling", async () => {
    const { user } = await renderMapAt("/map");

    await user.click(layerRow(/^Inspiration/));

    await waitFor(() =>
      expect(layerRow(/^Inspiration/).getAttribute("aria-pressed")).toBe(
        "true",
      ),
    );
    expect(nav.push).not.toHaveBeenCalled();
    const [url, options] = nav.replace.mock.calls.at(-1) as unknown as [
      string,
      { scroll?: boolean } | undefined,
    ];
    expect(new URL(url, "http://x").searchParams.get("layer")).toBe(
      "inspiration",
    );
    expect(new URL(url, "http://x").pathname).toBe("/map");
    expect(options?.scroll).toBe(false);
  });

  test("R24: picking Notes clears the layer", async () => {
    const { user } = await renderMapAt("/map?layer=trip1");

    await user.click(layerRow(/^Notes/));

    await waitFor(() =>
      expect(layerRow(/^Notes/).getAttribute("aria-pressed")).toBe("true"),
    );
    const params = new URLSearchParams(nav.search());
    expect([null, "notes"]).toContain(params.get("layer"));
  });

  test("the active trip lists its stops: marker, title, place", async () => {
    await renderMapAt("/map?layer=trip1");

    expect(layerRow(/^Japan/).getAttribute("aria-pressed")).toBe("true");
    const stops = within(
      screen.getByRole("list", { name: "Japan stops" }),
    ).getAllByRole("listitem");
    expect(stops).toHaveLength(3);
    expect(within(stops[0]).getByText("Kyoto temple")).toBeDefined();
    expect(within(stops[0]).getByText("Kyoto")).toBeDefined();
    expect(within(stops[1]).getByText("Osaka food")).toBeDefined();
    expect(within(stops[1]).getByText("Osaka")).toBeDefined();
    expect(within(stops[2]).getByText("Nara deer")).toBeDefined();
    expect(within(stops[0]).getByText("✓")).toBeDefined();
    expect(within(stops[1]).getByText("2")).toBeDefined();
    expect(within(stops[2]).getByText("3")).toBeDefined();
    expect(within(stops[2]).getByRole("button")).toHaveProperty(
      "disabled",
      true,
    );
    expect(within(stops[1]).getByRole("button")).toHaveProperty(
      "disabled",
      false,
    );
  });

  test("an inactive trip shows no stops", async () => {
    await renderMapAt("/map");

    expect(screen.queryByRole("list", { name: "Japan stops" })).toBeNull();
  });

  test("a located stop flies the globe to it", async () => {
    const { user } = await renderMapAt("/map?layer=trip1");
    await user.click(zoomLabel());
    await waitFor(
      () =>
        expect(globeLevel()).toBe("Zoom level: Globe. Show the whole globe"),
      { timeout: 2500 },
    );

    await user.click(
      within(screen.getByRole("list", { name: "Japan stops" })).getByRole(
        "button",
        { name: /Osaka food/ },
      ),
    );

    await waitFor(
      () =>
        expect(globeLevel()).not.toBe(
          "Zoom level: Globe. Show the whole globe",
        ),
      { timeout: 2500 },
    );
  }, 10000);
});

describe("R26/R27: layers on the globe", () => {
  beforeEach(seedTodos);

  test("Notes: note pins, no to-do pins", async () => {
    await renderMapAt("/map");

    expect(noteButton(/^hello wall/).tabIndex).toBe(0);
    expect(pinLabels()).not.toContain("Ramen class");
  });

  test("Inspiration: notes step aside; located ideas become pins", async () => {
    await renderMapAt("/map?layer=inspiration");

    await waitFor(() => expect(pinLabels()).toEqual(["Ramen class"]));
    expect(noteButton(/^hello wall/).tabIndex).toBe(-1);
    expect(noteButton(/^beach day/).tabIndex).toBe(-1);
  });

  test("Unsorted: done pins", async () => {
    await renderMapAt("/map?layer=unsorted");

    await waitFor(() => expect(pinLabels()).toEqual(["Night market"]));
  });

  test("a trip: one pin per located stop, numbered or checked", async () => {
    await renderMapAt("/map?layer=trip1");

    await waitFor(() =>
      expect(pinLabels()).toEqual(["Kyoto temple", "Osaka food"]),
    );
    const dots = Array.from(document.querySelectorAll(".pin-dot")).map((el) =>
      el.textContent?.trim(),
    );
    expect(dots).toEqual(["✓", "2"]);
  });

  test("a layer with no pins keeps the current view", async () => {
    db.todos = db.todos.filter((t) => t.tripId !== "trip1");
    const { user } = await renderMapAt("/map");
    const before = globeLevel();

    await user.click(layerRow(/^Japan/));
    await pause(900);

    expect(globeLevel()).toBe(before);
    expect(pinLabels()).toEqual([]);
  });
});

describe("R28/R30: map chips and the fit button", () => {
  beforeEach(seedTodos);

  test.each([
    ["/map", "2 places · 2 notes on the map", "Fit our places", null],
    [
      "/map?layer=inspiration",
      "Inspiration · 2 ideas not on a trip yet",
      "Fit these places",
      "/twodo?list=inspiration",
    ],
    [
      "/map?layer=unsorted",
      "Unsorted · 1 done, waiting for a trip",
      "Fit these places",
      "/twodo?list=unsorted",
    ],
    [
      "/map?layer=trip1",
      "Japan · 3 stops in itinerary order",
      "Fit this trip",
      "/twodo?list=trip1",
    ],
  ])("%s: info, hint, fit and Two Do link", async (url, info, fit, href) => {
    await renderMapAt(url);

    expect(screen.getAllByText(exactText(info))).not.toHaveLength(0);
    expect(
      screen.getByText("Drag to spin · scroll or pinch to zoom"),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: fit })).toBeDefined();
    const link = screen.queryByRole("link", { name: /Open in Two Do/ });
    expect(link?.getAttribute("href") ?? null).toBe(href);
  });

  test("one idea is singular in the info chip", async () => {
    db.todos = db.todos.filter((t) => t.id !== "i2");
    await renderMapAt("/map?layer=inspiration");

    expect(
      screen.getAllByText(exactText("Inspiration · 1 idea not on a trip yet")),
    ).not.toHaveLength(0);
  });
});

describe("R29: phone map chips", () => {
  beforeEach(() => {
    seedTodos();
    setViewport(390, 844);
  });

  test("a chip per layer, no stops, no info chip", async () => {
    await renderMapAt("/map?layer=trip1");

    const chips = layersCard();
    expect(
      within(chips)
        .getByRole("button", { name: /Japan/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(within(chips).getByRole("button", { name: /Notes/ })).toBeDefined();
    expect(
      within(chips).getByRole("button", { name: /Inspiration/ }),
    ).toBeDefined();
    expect(screen.queryByRole("list", { name: "Japan stops" })).toBeNull();
    expect(screen.queryByText("Japan · 3 stops in itinerary order")).toBeNull();
    expect(screen.getByText("Drag to spin · pinch to zoom")).toBeDefined();
  });

  test("tapping a chip switches the layer", async () => {
    const { user } = await renderMapAt("/map");

    await user.click(
      within(layersCard()).getByRole("button", { name: /Inspiration/ }),
    );

    await waitFor(() =>
      expect(new URLSearchParams(nav.search()).get("layer")).toBe(
        "inspiration",
      ),
    );
  });
});

describe("R23: Moments and Map share one wall", () => {
  test("Moments → Map → Moments keeps the wall mounted and its camera", async () => {
    const { user } = await renderWall();
    const note = noteButton(/^hello wall/);
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    await waitFor(() =>
      expect(zoomLabel().getAttribute("aria-label")).toBe(
        "Zoom 125%. Reset to 100%",
      ),
    );

    await goTo("/map");
    await screen.findByRole("heading", { name: "Map" });
    await goTo("/moments");

    expect(
      await screen.findByRole("heading", { name: "Our Moments" }),
    ).toBeDefined();
    // Same element: the wall was not remounted
    expect(noteButton(/^hello wall/)).toBe(note);
    await waitFor(() =>
      expect(zoomLabel().getAttribute("aria-label")).toBe(
        "Zoom 125%. Reset to 100%",
      ),
    );
  });
});

describe("R24–R28: map layers (white-box)", () => {
  beforeEach(seedTodos);

  test("an active trip with no stops lists none", async () => {
    await renderMapAt("/map?layer=trip2");

    expect(layerRow(/^Taipei weekend/).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(
      screen.queryByRole("list", { name: "Taipei weekend stops" }),
    ).toBeNull();
    expect(
      screen.getAllByText(
        exactText("Taipei weekend · 0 stops in itinerary order"),
      ),
    ).not.toHaveLength(0);
  });

  test("picking a layer with pins flies to fit them", async () => {
    const { user } = await renderMapAt("/map");
    await user.click(zoomLabel());
    await waitFor(
      () =>
        expect(globeLevel()).toBe("Zoom level: Globe. Show the whole globe"),
      { timeout: 2500 },
    );

    await user.click(layerRow(/^Inspiration/));

    // One located idea: framed at ~1200 m/px
    await waitFor(
      () =>
        expect(globeLevel()).not.toBe(
          "Zoom level: Globe. Show the whole globe",
        ),
      { timeout: 2500 },
    );
  }, 10000);

  test("the fit button on a trip frames its stops", async () => {
    const { user } = await renderMapAt("/map?layer=trip1");
    await user.click(zoomLabel());
    await waitFor(
      () =>
        expect(globeLevel()).toBe("Zoom level: Globe. Show the whole globe"),
      { timeout: 2500 },
    );

    await user.click(screen.getByRole("button", { name: "Fit this trip" }));

    await waitFor(
      () =>
        expect(globeLevel()).not.toBe(
          "Zoom level: Globe. Show the whole globe",
        ),
      { timeout: 2500 },
    );
  }, 10000);

  test("a stop without a place can't fly", async () => {
    const { user } = await renderMapAt("/map?layer=trip1");
    // Let the fit-on-entry flight finish first
    await pause(1500);
    const before = globeLevel();

    await user.click(
      within(screen.getByRole("list", { name: "Japan stops" })).getByRole(
        "button",
        { name: /Nara deer/ },
      ),
    );
    await pause(600);

    expect(globeLevel()).toBe(before);
  });

  test("a trip layer while trips are still loading shows Notes, then the trip", async () => {
    server.use(
      http.get("/api/trips", async () => {
        await delay(150);
        return HttpResponse.json({ trips: db.trips });
      }),
    );
    nav.go("/map?layer=trip1");
    render(<MomentsWall />, { wrapper });

    expect(
      await screen.findByRole("button", { name: /^Japan/ }, { timeout: 2000 }),
    ).toBeDefined();
    await waitFor(() =>
      expect(layerRow(/^Japan/).getAttribute("aria-pressed")).toBe("true"),
    );
  });

  test("a to-do pin keeps its title and the notes leave the tab order", async () => {
    await renderMapAt("/map?layer=unsorted");

    await waitFor(() => expect(pinLabels()).toEqual(["Night market"]));
    expect(
      Array.from(document.querySelectorAll(".pin-dot")).map((el) =>
        el.textContent?.trim(),
      ),
    ).toEqual(["✓"]);
    for (const note of allNotes()) expect(note.tabIndex).toBe(-1);
  });

  test("an idea pin is ✦", async () => {
    await renderMapAt("/map?layer=inspiration");

    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll(".pin-dot")).map((el) =>
          el.textContent?.trim(),
        ),
      ).toEqual(["✦"]),
    );
  });

  test("the Two Do link encodes the layer", async () => {
    db.trips = [{ ...japanTrip, id: "a b" }];
    db.todos = db.todos.map((t) =>
      t.tripId === "trip1" ? { ...t, tripId: "a b" } : t,
    );
    await renderMapAt("/map?layer=a%20b");

    expect(
      screen.getByRole("link", { name: /Open in Two Do/ }).getAttribute("href"),
    ).toBe("/twodo?list=a%20b");
  });

  test("leaving the map hides the layer card", async () => {
    await renderMapAt("/map?layer=trip1");

    await goTo("/moments");

    expect(
      await screen.findByRole("heading", { name: "Our Moments" }),
    ).toBeDefined();
    expect(screen.queryByRole("group", { name: "Show on map" })).toBeNull();
  });

  test("a failed to-do load still shows the notes layer", async () => {
    server.use(
      http.get("/api/todos", () =>
        HttpResponse.json({ message: "Failed" }, { status: 500 }),
      ),
    );
    nav.go("/map");
    render(<MomentsWall />, { wrapper });

    expect(await screen.findByRole("heading", { name: "Map" })).toBeDefined();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(layerRow(/^Notes/).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("R23/R26: map mode hides the wall header", () => {
  test("no Our Places text; the title group is aria-hidden behind a Map heading", async () => {
    await renderWall();

    await goTo("/map");

    expect(await screen.findByRole("heading", { name: "Map" })).toBeDefined();
    expect(screen.queryByText(/Our Places/)).toBeNull();
    // The title always reads "Our Moments"; in map mode it is out of the a11y tree
    expect(screen.queryByRole("heading", { name: "Our Moments" })).toBeNull();
    const title = screen.getByRole("heading", {
      name: "Our Moments",
      hidden: true,
    });
    expect(title.closest('[aria-hidden="true"]')).not.toBeNull();
    for (const text of ["Since 2022", "Day 1451"]) {
      expect(
        screen.getByText(text).closest('[aria-hidden="true"]'),
      ).not.toBeNull();
    }
  });

  test("back on Moments the title is visible again and the Map heading is gone", async () => {
    await renderWall();
    await goTo("/map");
    await screen.findByRole("heading", { name: "Map" });

    await goTo("/moments");

    const title = await screen.findByRole("heading", { name: "Our Moments" });
    expect(title.closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.queryByRole("heading", { name: "Map" })).toBeNull();
  });
});
