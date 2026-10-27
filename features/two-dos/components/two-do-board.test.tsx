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
import { cropImage } from "@/lib/crop-image";
import type { TodoDto } from "@/features/two-dos/models/responses";
import type { TripDto } from "@/features/two-dos/models/trip";

vi.mock("react-easy-crop");
vi.mock("@/lib/crop-image", () => ({ cropImage: vi.fn() }));
vi.mock("next/font/google", () => {
  const font = () => () => ({ className: "f", variable: "f", style: {} });
  return {
    Nunito: font(),
    Caveat: font(),
    Homemade_Apple: font(),
    Playpen_Sans: font(),
  };
});
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
  Toaster: () => null,
}));
vi.mock("@vis.gl/react-google-maps", () => ({
  useMapsLibrary: () => null,
  APIProvider: ({ children }: { children: ReactNode }) => children,
}));

// jsdom has no native drag events, so drags are driven through the captured monitor
interface DropTargetArgs {
  element: Element;
  getData: (args: {
    input: unknown;
    element: Element;
  }) => Record<string, unknown>;
  canDrop: (args: { source: { data: Record<string, unknown> } }) => boolean;
}
type Monitor = Record<
  "onDragStart" | "onDrag" | "onDrop",
  (args: unknown) => void
> & { canMonitor: (args: unknown) => boolean };
const dnd = vi.hoisted(() => ({
  monitor: null as Monitor | null,
  targets: new Set<DropTargetArgs>(),
}));
vi.mock("@atlaskit/pragmatic-drag-and-drop/element/adapter", () => ({
  draggable: () => () => undefined,
  dropTargetForElements: (target: DropTargetArgs) => {
    dnd.targets.add(target);
    return () => {
      dnd.targets.delete(target);
    };
  },
  monitorForElements: (monitor: Monitor) => {
    dnd.monitor = monitor;
    return () => {
      if (dnd.monitor === monitor) dnd.monitor = null;
    };
  },
}));

// The URL lives in a tiny store so push/replace re-render the board like Next does.
const nav = vi.hoisted(() => {
  let search = "";
  const listeners = new Set<() => void>();
  const go = (url: string) => {
    const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    search = query;
    listeners.forEach((listener) => listener());
  };
  return {
    set: (value: string) => {
      search = value;
    },
    get: () => search,
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
    new URLSearchParams(useSyncExternalStore(nav.subscribe, nav.get, nav.get)),
  usePathname: () => "/twodo",
}));

import { TwoDoBoard } from "@/features/two-dos/components/two-do-board";

// ---------- viewport ----------

const viewport = { width: 1440 };
const setViewport = (width: number) => {
  viewport.width = width;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  window.matchMedia = (query: string) =>
    ({
      matches: (() => {
        const max = /max-width:\s*([\d.]+)px/.exec(query);
        const min = /min-width:\s*([\d.]+)px/.exec(query);
        if (max) return viewport.width <= Number(max[1]);
        if (min) return viewport.width >= Number(min[1]);
        return false;
      })(),
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

const place = (name: string, latitude: number, longitude: number) => ({
  name,
  address: `${name}, Japan`,
  placeId: `place-${name}`,
  latitude,
  longitude,
});
const tokyo = place("Tokyo", 35.68, 139.69);
const kyoto = place("Kyoto", 35.01, 135.77);
const osaka = place("Osaka", 34.69, 135.5);
const past = "2025-01-10T12:00:00.000Z";

const dto = (id: string, title: string, patch: Partial<TodoDto>): TodoDto => ({
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

const japan: TripDto = {
  id: "trip1",
  name: "Japan",
  startDate: "2025-12-20",
  endDate: "2026-01-05",
  position: 1,
};
const taipei: TripDto = {
  id: "trip2",
  name: "Taipei weekend",
  startDate: null,
  endDate: null,
  position: 2,
};
const fixtures = () => ({
  trips: [structuredClone(japan), structuredClone(taipei)],
  todos: [
    dto("i1", "Ramen class", {
      priority: 1,
      location: tokyo,
      description: "Learn tonkotsu",
    }),
    dto("i2", "Sunset hike", {
      priority: 5,
      createdBy: { name: "ruru", imageUrl: null },
    }),
    dto("s1", "Kyoto temple", {
      tripId: "trip1",
      doneAt: past,
      priority: 2,
      location: kyoto,
      images: [{ key: "kyoto.jpg-1", url: "https://cdn.test/kyoto.jpg" }],
    }),
    dto("s2", "Osaka food", {
      tripId: "trip1",
      priority: 3,
      location: osaka,
    }),
    dto("s3", "Nara deer", { tripId: "trip1", priority: 4 }),
    dto("u1", "Night market", { doneAt: past, priority: 6 }),
  ],
});

// ---------- server ----------

let db = fixtures();
const requests: { method: string; path: string; body: unknown }[] = [];
const sent = (method: string, path: string | RegExp) =>
  requests.filter(
    (r) =>
      r.method === method &&
      (typeof path === "string" ? r.path === path : path.test(r.path)),
  );
const bodies = (method: string, path: string | RegExp) =>
  sent(method, path).map((r) => r.body as Record<string, unknown>);
const record = async (request: Request) => {
  const text = await request.clone().text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  requests.push({
    method: request.method,
    path: new URL(request.url).pathname,
    body,
  });
  return (body ?? {}) as Record<string, unknown>;
};
const maxPriority = () => Math.max(0, ...db.todos.map((t) => t.priority));
let nextId = 0;

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

const handlers = () => [
  http.get("/api/todos", () => HttpResponse.json({ todos: db.todos })),
  http.get("/api/trips", () =>
    HttpResponse.json({
      trips: [...db.trips].sort((a, b) => a.position - b.position),
    }),
  ),
  http.get("/api/profile", () =>
    HttpResponse.json({
      id: "u1",
      name: "Teddy",
      email: "t@example.com",
      imageKey: null,
      imageUrl: null,
    }),
  ),
  http.post("/api/trips", async ({ request }) => {
    const body = await record(request);
    nextId += 1;
    const trip: TripDto = {
      id: `trip-new${String(nextId)}`,
      name: String(body.name).trim(),
      startDate: (body.startDate as string | null) ?? null,
      endDate: (body.endDate as string | null) ?? null,
      position: Math.max(0, ...db.trips.map((t) => t.position)) + 1,
    };
    db.trips = [...db.trips, trip];
    return HttpResponse.json({ trip }, { status: 201 });
  }),
  http.patch("/api/trips/:tripId", async ({ request, params }) => {
    const body = await record(request);
    const index = db.trips.findIndex((t) => t.id === params.tripId);
    db.trips[index] = { ...db.trips[index], ...body };
    return HttpResponse.json({ trip: db.trips[index] });
  }),
  http.delete("/api/trips/:tripId", async ({ request, params }) => {
    await record(request);
    db.trips = db.trips.filter((t) => t.id !== params.tripId);
    db.todos = db.todos.map((t) =>
      t.tripId === params.tripId ? { ...t, tripId: null } : t,
    );
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/todos", async ({ request }) => {
    const body = await record(request);
    nextId += 1;
    const todo = dto(`new${String(nextId)}`, String(body.title), {
      description: (body.description as string | undefined) ?? null,
      tripId: (body.tripId as string | null) ?? null,
      location: (body.location as TodoDto["location"]) ?? null,
      priority: maxPriority() + 1,
    });
    db.todos = [...db.todos, todo];
    return HttpResponse.json({
      todo,
      signedUrls: ((body.imageNames as string[] | undefined) ?? []).map(
        (_, i) => `https://r2.test/up${String(i)}`,
      ),
    });
  }),
  http.put("/api/todos/:id", async ({ request, params }) => {
    const body = await record(request);
    const index = db.todos.findIndex((t) => t.id === params.id);
    const current = db.todos[index];
    const tripId = (body.tripId as string | null) ?? null;
    db.todos[index] = {
      ...current,
      title: String(body.title),
      description: (body.description as string | null) ?? null,
      location: (body.location as TodoDto["location"]) ?? null,
      tripId,
      priority:
        tripId === current.tripId ? current.priority : maxPriority() + 1,
    };
    return HttpResponse.json({ todo: db.todos[index], imagesToUpload: [] });
  }),
  http.patch("/api/todos/:id", async ({ request, params }) => {
    const body = await record(request);
    const index = db.todos.findIndex((t) => t.id === params.id);
    const current = db.todos[index];
    const next = { ...current };
    if (body.done === true && current.doneAt === null) {
      next.doneAt = new Date(Date.now() - 1000).toISOString();
    }
    if (body.done === false) next.doneAt = null;
    if ("tripId" in body) {
      next.tripId = body.tripId as string | null;
      if (!("priority" in body) && next.tripId !== current.tripId) {
        next.priority = maxPriority() + 1;
      }
    }
    if (typeof body.priority === "number") next.priority = body.priority;
    db.todos[index] = next;
    return HttpResponse.json({ todo: next });
  }),
  http.delete("/api/todos/:id", async ({ request, params }) => {
    await record(request);
    db.todos = db.todos.filter((t) => t.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.put("https://r2.test/:name", async ({ request }) => {
    requests.push({ method: "PUT", path: "r2", body: await request.text() });
    return new HttpResponse(null, { status: 200 });
  }),
];

beforeEach(() => {
  db = fixtures();
  requests.length = 0;
  nextId = 0;
  nav.set("");
  setViewport(1440);
  vi.clearAllMocks();
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.mocked(cropImage).mockImplementation(
    async (file) =>
      new File([`cropped-${file.name}`], file.name, { type: file.type }),
  );
  server.use(...handlers());
});

afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});

// ---------- helpers ----------

const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);
const renderBoard = async (list?: string) => {
  nav.set(list === undefined ? "" : `list=${list}`);
  const user = userEvent.setup();
  const view = render(<TwoDoBoard />, { wrapper });
  // Data is in once the sidebar shows a trip
  await screen.findAllByText("Japan");
  return { user, ...view };
};
const sidebar = () => screen.getByRole("complementary", { name: "Trips" });
const sideRow = (name: RegExp) =>
  within(sidebar())
    .getAllByRole("button")
    .find(
      (b) =>
        name.test(b.textContent ?? "") &&
        !b.getAttribute("aria-label")?.startsWith("Drag"),
    ) as HTMLElement;
const sideRowOrNull = (name: RegExp) =>
  within(sidebar())
    .queryAllByRole("button")
    .find(
      (b) =>
        name.test(b.textContent ?? "") &&
        !b.getAttribute("aria-label")?.startsWith("Drag"),
    ) ?? null;
const main = (title: string) => screen.getByRole("region", { name: title });
const rows = (label: string) =>
  within(screen.getByRole("list", { name: label })).getAllByRole("listitem");
const rowTitles = (label: string) =>
  rows(label).map(
    (row) =>
      within(row)
        .getByRole("button", { name: /^Edit / })
        .getAttribute("aria-label")
        ?.replace(/^Edit /, "") ?? "",
  );
const rowOf = (title: string) =>
  screen
    .getByRole("button", { name: `Edit ${title}` })
    .closest("li") as HTMLElement;
const check = (name: string) => screen.getByRole("button", { name });
const currentList = () => new URLSearchParams(nav.get()).get("list");

interface ToastCall {
  message: string;
  options: {
    action?: { label: string; onClick: (event: unknown) => void };
    duration?: number;
  };
}
const toastCalls = (): ToastCall[] =>
  [
    vi.mocked(toast),
    toast.success,
    toast.info,
    toast.message,
    toast.warning,
    toast.error,
  ].flatMap((fn) =>
    vi.mocked(fn).mock.calls.map(([message, options]) => ({
      message: String(message),
      options: (options ?? {}) as ToastCall["options"],
    })),
  );
const findToast = (message: string) =>
  waitFor(() => {
    const call = toastCalls().find((c) => c.message === message);
    expect(call, `toast "${message}"`).toBeDefined();
    return call as ToastCall;
  });
const expectUndoToast = async (message: string) => {
  const call = await findToast(message);
  expect(call.options.action?.label).toBe("Undo");
  expect(call.options.duration).toBe(5000);
  return call;
};
const undo = async (message: string) => {
  const call = await expectUndoToast(message);
  await act(async () => {
    call.options.action?.onClick({ preventDefault: () => undefined });
  });
};
const confirmIfAsked = async (user: ReturnType<typeof userEvent.setup>) => {
  const alert = screen.queryByRole("alertdialog");
  if (!alert) return;
  await user.click(
    within(alert)
      .getAllByRole("button")
      .find((b) => b.textContent !== "Cancel") as HTMLElement,
  );
};
const openTripMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Trip options" }));
  return screen.findByRole("menu");
};
const tripField = () => screen.getByLabelText("Trip");
const tripOptions = async (user: ReturnType<typeof userEvent.setup>) => {
  const field = tripField();
  if (field.tagName === "SELECT") {
    return within(field)
      .getAllByRole("option")
      .map((o) => o.textContent);
  }
  await user.click(field);
  const options = (await screen.findAllByRole("option")).map(
    (o) => o.textContent,
  );
  await user.keyboard("{Escape}");
  return options;
};
const tripValue = () => {
  const field = tripField();
  if (field instanceof HTMLSelectElement) {
    return field.selectedOptions[0]?.textContent;
  }
  return field.textContent;
};
const pickTrip = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) => {
  const field = tripField();
  if (field instanceof HTMLSelectElement) {
    const option = within(field)
      .getAllByRole("option")
      .find((o) => o.textContent === name) as HTMLOptionElement;
    await user.selectOptions(field, option);
    return;
  }
  await user.click(field);
  await user.click(await screen.findByRole("option", { name }));
};
// next/image serves through /_next/image?url=…; compare the source URL
const imgSrc = (el: Element | null) => {
  const src = el?.querySelector("img")?.getAttribute("src");
  if (!src) return null;
  const url = new URL(src, "http://localhost");
  return url.pathname === "/_next/image" ? url.searchParams.get("url") : src;
};
const jpg = (name: string, size = 0) =>
  new File([size ? new Uint8Array(size) : name], name, { type: "image/jpeg" });

// ---------- R5: sidebar ----------

describe("R5: sidebar", () => {
  test("shows the heading, lists in order, trips and both New trip buttons", async () => {
    await renderBoard();

    expect(screen.getByRole("heading", { name: "Our Trips" })).toBeDefined();
    expect(
      within(sidebar()).getAllByRole("button", { name: "New trip" }),
    ).toHaveLength(2);
    const inspiration = sideRow(/Inspiration/);
    const unsorted = sideRow(/Unsorted/);
    const japanRow = sideRow(/Japan/);
    const taipeiRow = sideRow(/Taipei weekend/);
    expect(inspiration.textContent).toMatch(/2/);
    expect(unsorted.textContent).toMatch(/1/);
    // The "Trips" label (the heading also has a "Trips" span)
    expect(within(sidebar()).getAllByText("Trips").length).toBeGreaterThan(1);
    expect(within(sidebar()).getByText(/Drag to reorder/)).toBeDefined();
    const order = [inspiration, unsorted, japanRow, taipeiRow];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  test("trip rows show a handle, dates or No dates yet, and done/total", async () => {
    await renderBoard();

    expect(
      within(sidebar()).getByRole("button", { name: "Drag to reorder Japan" }),
    ).toBeDefined();
    expect(
      within(sidebar()).getByRole("button", {
        name: "Drag to reorder Taipei weekend",
      }),
    ).toBeDefined();
    const japanRow = sideRow(/Japan/);
    expect(japanRow.textContent).toContain("2025.12.20 – 2026.01.05");
    expect(japanRow.textContent).toContain("1/3");
    const taipeiRow = sideRow(/Taipei weekend/);
    expect(taipeiRow.textContent).toContain("No dates yet");
    expect(taipeiRow.textContent).toContain("0/0");
  });

  test("Unsorted is hidden when empty and not selected", async () => {
    db.todos = db.todos.filter((t) => t.id !== "u1");
    await renderBoard();

    expect(sideRowOrNull(/Unsorted/)).toBeNull();
  });

  test("Unsorted stays when empty but selected", async () => {
    db.todos = db.todos.filter((t) => t.id !== "u1");
    await renderBoard("unsorted");

    expect(sideRow(/Unsorted/).getAttribute("aria-current")).toBe("page");
  });

  test("R16: a trip's cover is the first image among its stops, in order", async () => {
    await renderBoard();

    expect(imgSrc(sideRow(/Japan/))).toBe("https://cdn.test/kyoto.jpg");
    expect(imgSrc(sideRow(/Taipei weekend/))).toBeNull();
  });

  test("R16: the cover follows the itinerary, not the image order", async () => {
    db.todos = db.todos.map((t) =>
      t.id === "s2"
        ? {
            ...t,
            priority: 1.5,
            images: [{ key: "o", url: "https://cdn.test/osaka.jpg" }],
          }
        : t,
    );
    await renderBoard();

    expect(imgSrc(sideRow(/Japan/))).toBe("https://cdn.test/osaka.jpg");
  });

  test("R18: the old data table is gone", async () => {
    await renderBoard();

    expect(screen.queryByRole("table")).toBeNull();
  });
});

// ---------- R6: selection in the URL ----------

describe("R6: the selected list is in the URL", () => {
  test.each([
    [undefined, /Inspiration/, "Inspiration"],
    ["inspiration", /Inspiration/, "Inspiration"],
    ["unsorted", /Unsorted/, "Unsorted"],
    ["trip1", /Japan/, "Japan"],
    ["bogus", /Inspiration/, "Inspiration"],
    ["", /Inspiration/, "Inspiration"],
  ])("?list=%s selects %s", async (list, row, title) => {
    await renderBoard(list);

    expect(sideRow(row).getAttribute("aria-current")).toBe("page");
    expect(main(title)).toBeDefined();
    const current = within(sidebar())
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
  });

  test("clicking a trip row writes ?list=<tripId>", async () => {
    const { user } = await renderBoard();

    await user.click(sideRow(/Japan/));

    await waitFor(() => expect(currentList()).toBe("trip1"));
    expect(sideRow(/Japan/).getAttribute("aria-current")).toBe("page");
    expect(main("Japan")).toBeDefined();
  });

  test("clicking Unsorted then Inspiration", async () => {
    const { user } = await renderBoard("trip1");

    await user.click(sideRow(/Unsorted/));
    await waitFor(() => expect(currentList()).toBe("unsorted"));
    await user.click(sideRow(/Inspiration/));
    await waitFor(() =>
      expect(sideRow(/Inspiration/).getAttribute("aria-current")).toBe("page"),
    );
  });
});

// ---------- R7: headers ----------

describe("R7/R30: main card header", () => {
  test("trip header", async () => {
    await renderBoard("trip1");
    const card = main("Japan");

    expect(
      within(card).getByText("Trip · 3 stops · 2025.12.20 – 2026.01.05"),
    ).toBeDefined();
    expect(
      within(card).getByRole("heading", { level: 2, name: "Japan" }),
    ).toBeDefined();
    expect(
      within(card).getByText(
        "The order is the itinerary — drag stops to plan the route. Ticked stops stay in place.",
      ),
    ).toBeDefined();
    expect(
      within(card)
        .getByRole("link", { name: /Show on map/ })
        .getAttribute("href"),
    ).toBe("/map?layer=trip1");
    expect(
      within(card).getByRole("button", { name: /Add to this trip/ }),
    ).toBeDefined();
    expect(within(card).getByText("1 of 3 done")).toBeDefined();
  });

  test("the ⋯ menu has Edit trip and Delete trip", async () => {
    const { user } = await renderBoard("trip1");

    const menu = await openTripMenu(user);

    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent?.trim()),
    ).toEqual(["Edit trip", "Delete trip"]);
  });

  test("a one-stop trip with no dates", async () => {
    db.todos = [
      ...db.todos,
      dto("t9", "Night view", { tripId: "trip2", priority: 9 }),
    ];
    await renderBoard("trip2");

    expect(
      within(main("Taipei weekend")).getByText("Trip · 1 stop · No dates yet"),
    ).toBeDefined();
    expect(
      within(main("Taipei weekend")).getByText("0 of 1 done"),
    ).toBeDefined();
  });

  test("Inspiration header", async () => {
    await renderBoard("inspiration");
    const card = main("Inspiration");

    expect(within(card).getByText("Ideas · 2")).toBeDefined();
    expect(
      within(card).getByText(
        "Things we want to do someday. Only undone items live here — tick one and pick the trip you did it on.",
      ),
    ).toBeDefined();
    expect(
      within(card)
        .getByRole("link", { name: /Show on map/ })
        .getAttribute("href"),
    ).toBe("/map?layer=inspiration");
    expect(
      within(card).getByRole("button", { name: /Add idea/ }),
    ).toBeDefined();
    expect(
      within(card).queryByRole("button", { name: "Trip options" }),
    ).toBeNull();
  });

  test("Unsorted header has no map link", async () => {
    await renderBoard("unsorted");
    const card = main("Unsorted");

    expect(within(card).getByText("Done · 1")).toBeDefined();
    expect(
      within(card).getByText(
        "Done before trips existed. Drag each one onto a trip on the left, or use “Move to…”. This list disappears once it is empty.",
      ),
    ).toBeDefined();
    expect(
      within(card).queryByRole("link", { name: /Show on map/ }),
    ).toBeNull();
    expect(
      within(card).getByRole("button", { name: /Add to Inspiration/ }),
    ).toBeDefined();
  });
});

// ---------- R8: rows ----------

describe("R8: rows", () => {
  test("a trip lists its stops by priority with numbers or checks", async () => {
    await renderBoard("trip1");

    expect(rowTitles("Japan itinerary")).toEqual([
      "Kyoto temple",
      "Osaka food",
      "Nara deer",
    ]);
    const [kyotoRow, osakaRow, naraRow] = rows("Japan itinerary");
    // Done stops show a check instead of their number
    expect(within(kyotoRow).queryByText("1")).toBeNull();
    expect(within(osakaRow).getByText("2")).toBeDefined();
    expect(within(naraRow).getByText("3")).toBeDefined();
  });

  test("a row shows handle, thumb, title, place, creator, date, description", async () => {
    await renderBoard("inspiration");
    const row = rowOf("Ramen class");

    expect(
      within(row).getByRole("button", {
        name: "Drag Ramen class to reorder or move",
      }),
    ).toBeDefined();
    expect(within(row).getByText("Ramen class")).toBeDefined();
    expect(within(row).getByText("Tokyo")).toBeDefined();
    expect(within(row).getByText("T")).toBeDefined();
    expect(within(row).getByText(/2026\.01\.02/)).toBeDefined();
    expect(within(row).getByText("Learn tonkotsu")).toBeDefined();
  });

  test("no location and no description", async () => {
    await renderBoard("inspiration");
    const row = rowOf("Sunset hike");

    expect(within(row).getByText("No location yet")).toBeDefined();
    expect(within(row).getByText("—")).toBeDefined();
    expect(within(row).getByText("R")).toBeDefined();
  });

  test("the thumb is the first image", async () => {
    await renderBoard("trip1");

    expect(imgSrc(rowOf("Kyoto temple"))).toBe("https://cdn.test/kyoto.jpg");
    expect(imgSrc(rowOf("Osaka food"))).toBeNull();
  });

  test("check buttons: trip labels and aria-pressed", async () => {
    await renderBoard("trip1");

    expect(
      check("Mark “Kyoto temple” not done").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(check("Mark “Osaka food” done").getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.queryByRole("button", { name: "Move to…" })).toBeNull();
  });

  test("check buttons: Inspiration labels", async () => {
    await renderBoard();

    expect(
      check("Mark “Ramen class” done and pick its trip").getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
    expect(rowTitles("Inspiration ideas")).toEqual([
      "Ramen class",
      "Sunset hike",
    ]);
  });

  test("Unsorted rows: number, Move to…, untick label", async () => {
    await renderBoard("unsorted");
    const row = rowOf("Night market");

    expect(rowTitles("Unsorted items")).toEqual(["Night market"]);
    expect(within(row).getByRole("button", { name: "Move to…" })).toBeDefined();
    expect(
      check("Untick “Night market” (moves back to Inspiration)").getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
  });
});

// ---------- R20: empty states ----------

describe("R20: empty lists", () => {
  test("a trip with no stops", async () => {
    await renderBoard("trip2");

    expect(screen.getByText("No stops yet")).toBeDefined();
    expect(
      screen.getByText(
        "Drag ideas from Inspiration onto this trip in the list on the left, or add a to-do here.",
      ),
    ).toBeDefined();
  });

  test("no ideas", async () => {
    db.todos = db.todos.filter((t) => !t.id.startsWith("i"));
    await renderBoard();

    expect(screen.getByText("No ideas right now")).toBeDefined();
    expect(
      screen.getByText("Add the next thing you two want to do together."),
    ).toBeDefined();
  });

  test("Unsorted, all sorted", async () => {
    db.todos = db.todos.filter((t) => t.id !== "u1");
    await renderBoard("unsorted");

    expect(screen.getByText("All sorted")).toBeDefined();
    expect(
      screen.getByText("Everything done now lives inside a trip."),
    ).toBeDefined();
  });
});

// ---------- R10: ticking ----------

describe("R10/R13: ticking an idea", () => {
  test("opens Which trip was it on? with the trips and the new-trip field", async () => {
    const { user } = await renderBoard();

    await user.click(check("Mark “Ramen class” done and pick its trip"));
    const dialog = await screen.findByRole("dialog", {
      name: "Which trip was it on?",
    });

    const japanOption = within(dialog).getByRole("button", { name: /Japan/ });
    expect(japanOption.textContent).toContain(
      "2025.12.20 – 2026.01.05 · 3 stops",
    );
    const taipeiOption = within(dialog).getByRole("button", {
      name: /Taipei weekend/,
    });
    expect(taipeiOption.textContent).toContain("No dates yet · 0 stops");
    expect(within(dialog).getByLabelText("Or start a new trip")).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Create & move" }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("button", {
        name: "Not yet — keep it unticked",
      }),
    ).toBeDefined();
    expect(sent("PATCH", /todos/)).toHaveLength(0);
  });

  test("a one-stop trip says 1 stop", async () => {
    db.todos = [
      ...db.todos,
      dto("t9", "Night view", { tripId: "trip2", priority: 9 }),
    ];
    const { user } = await renderBoard();

    await user.click(check("Mark “Ramen class” done and pick its trip"));
    const dialog = await screen.findByRole("dialog", {
      name: "Which trip was it on?",
    });

    expect(
      within(dialog).getByRole("button", { name: /Taipei weekend/ })
        .textContent,
    ).toContain("No dates yet · 1 stop");
  });

  test("picking a trip marks it done and moves it there; Undo puts it back", async () => {
    const { user } = await renderBoard();

    await user.click(check("Mark “Ramen class” done and pick its trip"));
    const dialog = await screen.findByRole("dialog", {
      name: "Which trip was it on?",
    });
    await user.click(within(dialog).getByRole("button", { name: /Japan/ }));

    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/i1")).toEqual([
        { tripId: "trip1", done: true },
      ]),
    );
    await waitFor(() =>
      expect(rowTitles("Inspiration ideas")).toEqual(["Sunset hike"]),
    );
    expect(
      screen.queryByRole("dialog", { name: "Which trip was it on?" }),
    ).toBeNull();
    expect(sideRow(/Japan/).textContent).toContain("2/4");

    requests.length = 0;
    await undo("Done · moved to Japan");

    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/i1")).toEqual([
        {
          tripId: null,
          done: false,
          priority: 1,
        },
      ]),
    );
    await waitFor(() =>
      expect(rowTitles("Inspiration ideas")).toEqual([
        "Ramen class",
        "Sunset hike",
      ]),
    );
  });

  test("Not yet keeps it unticked and sends nothing", async () => {
    const { user } = await renderBoard();

    await user.click(check("Mark “Ramen class” done and pick its trip"));
    const dialog = await screen.findByRole("dialog", {
      name: "Which trip was it on?",
    });
    await user.click(
      within(dialog).getByRole("button", {
        name: "Not yet — keep it unticked",
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Which trip was it on?" }),
      ).toBeNull(),
    );
    expect(
      check("Mark “Ramen class” done and pick its trip").getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
    expect(sent("PATCH", /todos/)).toHaveLength(0);
  });

  test("Create & move makes a trip and moves it; Undo also deletes the trip", async () => {
    const { user } = await renderBoard();

    await user.click(check("Mark “Ramen class” done and pick its trip"));
    const dialog = await screen.findByRole("dialog", {
      name: "Which trip was it on?",
    });
    await user.type(
      within(dialog).getByLabelText("Or start a new trip"),
      "  Kyushu 2027  ",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create & move" }),
    );

    await waitFor(() => expect(sent("POST", "/api/trips")).toHaveLength(1));
    expect(bodies("POST", "/api/trips")[0]).toMatchObject({
      name: "Kyushu 2027",
    });
    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/i1")).toEqual([
        { tripId: "trip-new1", done: true },
      ]),
    );

    await undo("Done · moved to Kyushu 2027");

    await waitFor(() =>
      expect(sent("DELETE", "/api/trips/trip-new1")).toHaveLength(1),
    );
    expect(bodies("PATCH", "/api/todos/i1").at(-1)).toEqual({
      tripId: null,
      done: false,
      priority: 1,
    });
  });

  test.each([
    ["blank", ""],
    ["whitespace-only", "   "],
  ])("Create & move with a %s name does nothing", async (_, name) => {
    const { user } = await renderBoard();

    await user.click(check("Mark “Ramen class” done and pick its trip"));
    const dialog = await screen.findByRole("dialog", {
      name: "Which trip was it on?",
    });
    if (name) {
      await user.type(
        within(dialog).getByLabelText("Or start a new trip"),
        name,
      );
    }
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create & move" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sent("POST", "/api/trips")).toHaveLength(0);
    expect(sent("PATCH", /todos/)).toHaveLength(0);
    expect(
      screen.getByRole("dialog", { name: "Which trip was it on?" }),
    ).toBeDefined();
  });
});

describe("R10: ticking a trip stop", () => {
  test("toggles done in place, with no move and no toast", async () => {
    const { user } = await renderBoard("trip1");

    await user.click(check("Mark “Osaka food” done"));

    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/s2")).toHaveLength(1),
    );
    const body = bodies("PATCH", "/api/todos/s2")[0];
    expect(body.done).toBe(true);
    expect(body.tripId === undefined || body.tripId === "trip1").toBe(true);
    await waitFor(() =>
      expect(
        check("Mark “Osaka food” not done").getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    expect(rowTitles("Japan itinerary")).toEqual([
      "Kyoto temple",
      "Osaka food",
      "Nara deer",
    ]);
    expect(screen.getByText("2 of 3 done")).toBeDefined();
    expect(toastCalls().filter((c) => c.options.action)).toEqual([]);
  });

  test("unticking a done stop", async () => {
    const { user } = await renderBoard("trip1");

    await user.click(check("Mark “Kyoto temple” not done"));

    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/s1")[0]).toMatchObject({
        done: false,
      }),
    );
    await waitFor(() => expect(screen.getByText("0 of 3 done")).toBeDefined());
    expect(rowTitles("Japan itinerary")[0]).toBe("Kyoto temple");
  });
});

describe("R10/R13: unticking in Unsorted", () => {
  test("moves it back to Inspiration; Undo restores it", async () => {
    const { user } = await renderBoard("unsorted");

    await user.click(
      check("Untick “Night market” (moves back to Inspiration)"),
    );

    await waitFor(() =>
      expect(
        Object.assign({}, ...bodies("PATCH", "/api/todos/u1")),
      ).toMatchObject({
        done: false,
      }),
    );
    await waitFor(() =>
      expect(sideRow(/Inspiration/).textContent).toMatch(/3/),
    );

    requests.length = 0;
    await undo("Unticked — back in Inspiration");

    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/u1")).toEqual([
        {
          tripId: null,
          done: true,
          priority: 6,
        },
      ]),
    );
  });
});

// ---------- R11: Move to… ----------

describe("R11/R13: Move to…", () => {
  test("opens the move dialog with the trips and Cancel", async () => {
    const { user } = await renderBoard("unsorted");

    await user.click(
      within(rowOf("Night market")).getByRole("button", { name: "Move to…" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Move to which trip?",
    });

    expect(
      within(dialog).getByText("Which trip was “Night market” on?"),
    ).toBeDefined();
    expect(within(dialog).getByRole("button", { name: /Japan/ })).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: /Taipei weekend/ }),
    ).toBeDefined();
    expect(within(dialog).getByLabelText("Or start a new trip")).toBeDefined();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Move to which trip?" }),
      ).toBeNull(),
    );
    expect(sent("PATCH", /todos/)).toHaveLength(0);
  });

  test("picking a trip moves it; Undo moves it back", async () => {
    const { user } = await renderBoard("unsorted");

    await user.click(
      within(rowOf("Night market")).getByRole("button", { name: "Move to…" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Move to which trip?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: /Taipei weekend/ }),
    );

    await waitFor(() =>
      expect(
        Object.assign({}, ...bodies("PATCH", "/api/todos/u1")),
      ).toMatchObject({
        tripId: "trip2",
      }),
    );
    expect(
      Object.assign({}, ...bodies("PATCH", "/api/todos/u1")).done,
    ).not.toBe(false);
    await waitFor(() =>
      expect(sideRow(/Taipei weekend/).textContent).toContain("1/1"),
    );

    requests.length = 0;
    await undo("Moved to Taipei weekend");

    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/u1")).toEqual([
        {
          tripId: null,
          done: true,
          priority: 6,
        },
      ]),
    );
  });

  test("Create & move from the move dialog", async () => {
    const { user } = await renderBoard("unsorted");

    await user.click(
      within(rowOf("Night market")).getByRole("button", { name: "Move to…" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Move to which trip?",
    });
    await user.type(
      within(dialog).getByLabelText("Or start a new trip"),
      "Tainan",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create & move" }),
    );

    await expectUndoToast("Moved to Tainan");
    expect(bodies("POST", "/api/trips")[0]).toMatchObject({ name: "Tainan" });
    expect(
      Object.assign({}, ...bodies("PATCH", "/api/todos/u1")),
    ).toMatchObject({
      tripId: "trip-new1",
    });
  });
});

// ---------- R14/R15: trip dialog ----------

describe("R14: New trip", () => {
  test("the dialog has Name, From, To, the hint, Cancel and Create trip", async () => {
    const { user } = await renderBoard();

    await user.click(
      within(sidebar()).getAllByRole("button", { name: "New trip" })[0],
    );
    const dialog = await screen.findByRole("dialog", { name: "New trip" });

    expect(within(dialog).getByLabelText("Name")).toBeDefined();
    expect(within(dialog).getByLabelText("From")).toBeDefined();
    expect(within(dialog).getByLabelText("To")).toBeDefined();
    expect(
      within(dialog).getByText(
        "Dates are optional — leave them empty while it is still a plan.",
      ),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Create trip" }),
    ).toBeDefined();
  });

  test("creates a trip with dates, appends it last and selects it", async () => {
    const { user } = await renderBoard();

    await user.click(
      within(sidebar()).getAllByRole("button", { name: "New trip" })[1],
    );
    const dialog = await screen.findByRole("dialog", { name: "New trip" });
    await user.type(within(dialog).getByLabelText("Name"), "  Hokkaido  ");
    fireEvent.change(within(dialog).getByLabelText("From"), {
      target: { value: "2026-02-01" },
    });
    fireEvent.change(within(dialog).getByLabelText("To"), {
      target: { value: "2026-02-05" },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Create trip" }),
    );

    await waitFor(() => expect(sent("POST", "/api/trips")).toHaveLength(1));
    expect(bodies("POST", "/api/trips")[0]).toEqual({
      name: "Hokkaido",
      startDate: "2026-02-01",
      endDate: "2026-02-05",
    });
    const created = await findToast("Trip created");
    expect(created.options.action).toBeUndefined();
    await waitFor(() => expect(currentList()).toBe("trip-new1"));
    const hokkaido = await waitFor(() => sideRow(/Hokkaido/));
    expect(hokkaido.getAttribute("aria-current")).toBe("page");
    expect(
      sideRow(/Taipei weekend/).compareDocumentPosition(hokkaido) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(hokkaido.textContent).toContain("2026.02.01 – 02.05");
  });

  test("dates are optional", async () => {
    const { user } = await renderBoard();

    await user.click(
      within(sidebar()).getAllByRole("button", { name: "New trip" })[0],
    );
    const dialog = await screen.findByRole("dialog", { name: "New trip" });
    await user.type(within(dialog).getByLabelText("Name"), "Someday");
    await user.click(
      within(dialog).getByRole("button", { name: "Create trip" }),
    );

    await waitFor(() => expect(sent("POST", "/api/trips")).toHaveLength(1));
    expect(bodies("POST", "/api/trips")[0]).toEqual({
      name: "Someday",
      startDate: null,
      endDate: null,
    });
  });

  test.each([
    ["blank", ""],
    ["whitespace-only", "   "],
  ])("a %s name does nothing", async (_, name) => {
    const { user } = await renderBoard();

    await user.click(
      within(sidebar()).getAllByRole("button", { name: "New trip" })[0],
    );
    const dialog = await screen.findByRole("dialog", { name: "New trip" });
    if (name) await user.type(within(dialog).getByLabelText("Name"), name);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create trip" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sent("POST", "/api/trips")).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "New trip" })).toBeDefined();
  });

  test("an end before the start is refused", async () => {
    const { user } = await renderBoard();

    await user.click(
      within(sidebar()).getAllByRole("button", { name: "New trip" })[0],
    );
    const dialog = await screen.findByRole("dialog", { name: "New trip" });
    await user.type(within(dialog).getByLabelText("Name"), "Backwards");
    fireEvent.change(within(dialog).getByLabelText("From"), {
      target: { value: "2026-02-05" },
    });
    fireEvent.change(within(dialog).getByLabelText("To"), {
      target: { value: "2026-02-01" },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Create trip" }),
    );

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("The trip can’t end before it starts");
    // Shown under the To field
    expect(
      within(dialog).getByLabelText("To").compareDocumentPosition(alert) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(sent("POST", "/api/trips")).toHaveLength(0);
  });

  test("Cancel sends nothing", async () => {
    const { user } = await renderBoard();

    await user.click(
      within(sidebar()).getAllByRole("button", { name: "New trip" })[0],
    );
    const dialog = await screen.findByRole("dialog", { name: "New trip" });
    await user.type(within(dialog).getByLabelText("Name"), "Nope");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "New trip" })).toBeNull(),
    );
    expect(sent("POST", "/api/trips")).toHaveLength(0);
  });

  test("R22: a failed create shows the server message", async () => {
    server.use(
      http.post("/api/trips", () =>
        HttpResponse.json(
          { message: "Failed to create a trip. Please try again later." },
          { status: 500 },
        ),
      ),
    );
    const { user } = await renderBoard();

    await user.click(
      within(sidebar()).getAllByRole("button", { name: "New trip" })[0],
    );
    const dialog = await screen.findByRole("dialog", { name: "New trip" });
    await user.type(within(dialog).getByLabelText("Name"), "Broken");
    await user.click(
      within(dialog).getByRole("button", { name: "Create trip" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to create a trip"),
      ),
    );
    // The dialog may stay open (hiding the page from a11y queries), so read the DOM
    expect(document.querySelector("aside")?.textContent).not.toContain(
      "Broken",
    );
  });
});

describe("R15: Edit trip", () => {
  test("pre-fills the dialog, saves and renames in the sidebar", async () => {
    const { user } = await renderBoard("trip1");

    const menu = await openTripMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Edit trip" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit trip" });

    const name = within(dialog).getByLabelText("Name") as HTMLInputElement;
    expect(name.value).toBe("Japan");
    expect(
      (within(dialog).getByLabelText("From") as HTMLInputElement).value,
    ).toBe("2025-12-20");
    expect(
      (within(dialog).getByLabelText("To") as HTMLInputElement).value,
    ).toBe("2026-01-05");
    await user.clear(name);
    await user.type(name, "Kansai");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        Object.assign({}, ...bodies("PATCH", "/api/trips/trip1")),
      ).toMatchObject({
        name: "Kansai",
      }),
    );
    await findToast("Saved");
    await waitFor(() => expect(sideRow(/Kansai/)).toBeDefined());
    expect(sideRowOrNull(/^Japan/)).toBeNull();
  });
});

// ---------- R19: delete trip ----------

describe("R19/R13: Delete trip", () => {
  test("stops split into Inspiration and Unsorted; Undo re-creates the trip", async () => {
    const { user } = await renderBoard("trip1");

    const menu = await openTripMenu(user);
    await user.click(
      within(menu).getByRole("menuitem", { name: "Delete trip" }),
    );
    // No confirm: Undo is the safety net
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await waitFor(() =>
      expect(sent("DELETE", "/api/trips/trip1")).toHaveLength(1),
    );
    await waitFor(() =>
      expect(sideRow(/Inspiration/).getAttribute("aria-current")).toBe("page"),
    );
    expect(currentList() === null || currentList() === "inspiration").toBe(
      true,
    );
    await waitFor(() =>
      expect(rowTitles("Inspiration ideas")).toEqual([
        "Ramen class",
        "Osaka food",
        "Nara deer",
        "Sunset hike",
      ]),
    );
    expect(sideRow(/Unsorted/).textContent).toMatch(/2/);
    expect(sideRowOrNull(/Japan/)).toBeNull();

    requests.length = 0;
    await undo("Trip deleted");

    await waitFor(() => expect(sent("POST", "/api/trips")).toHaveLength(1));
    expect(bodies("POST", "/api/trips")[0]).toEqual({
      name: "Japan",
      startDate: "2025-12-20",
      endDate: "2026-01-05",
    });
    await waitFor(() =>
      expect(bodies("PATCH", "/api/trips/trip-new1")).toContainEqual({
        position: 1,
      }),
    );
    // One placement PATCH per to-do, restoring trip, done state and priority
    await waitFor(() => {
      expect(bodies("PATCH", "/api/todos/s1")).toEqual([
        { tripId: "trip-new1", done: true, priority: 2 },
      ]);
      expect(bodies("PATCH", "/api/todos/s2")).toEqual([
        { tripId: "trip-new1", done: false, priority: 3 },
      ]);
      expect(bodies("PATCH", "/api/todos/s3")).toEqual([
        { tripId: "trip-new1", done: false, priority: 4 },
      ]);
    });
    await waitFor(() => expect(sideRow(/Japan/).textContent).toContain("1/3"));
  });
});

// ---------- R17: to-do dialog ----------

describe("R17: new to-do", () => {
  test("Add idea opens New to-do with Inspiration pre-selected", async () => {
    const { user } = await renderBoard();

    await user.click(screen.getByRole("button", { name: /Add idea/ }));
    const dialog = await screen.findByRole("dialog", { name: "New to-do" });

    expect(within(dialog).getByLabelText("Title")).toBeDefined();
    expect(within(dialog).getByLabelText("Description")).toBeDefined();
    expect(tripValue()).toContain("Inspiration · Ideas for someday");
    expect(await tripOptions(user)).toEqual([
      "Inspiration · Ideas for someday",
      "Japan",
      "Taipei weekend",
    ]);
    expect(
      within(dialog).queryByRole("button", { name: "Delete to-do" }),
    ).toBeNull();
  });

  test("saves to Inspiration; Undo deletes it", async () => {
    const { user } = await renderBoard();

    await user.click(screen.getByRole("button", { name: /Add idea/ }));
    const dialog = await screen.findByRole("dialog", { name: "New to-do" });
    await user.type(within(dialog).getByLabelText("Title"), "  Picnic  ");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(sent("POST", "/api/todos")).toHaveLength(1));
    expect(bodies("POST", "/api/todos")[0]).toMatchObject({
      title: "Picnic",
      tripId: null,
      location: null,
      imageNames: [],
    });
    await waitFor(() =>
      expect(rowTitles("Inspiration ideas")).toContain("Picnic"),
    );
    expect(rowTitles("Inspiration ideas").at(-1)).toBe("Picnic");

    await undo("Added to Inspiration");

    await waitFor(() =>
      expect(sent("DELETE", "/api/todos/new1")).toHaveLength(1),
    );
  });

  test("Add to this trip pre-selects the trip and appends there", async () => {
    const { user } = await renderBoard("trip1");

    await user.click(screen.getByRole("button", { name: /Add to this trip/ }));
    const dialog = await screen.findByRole("dialog", { name: "New to-do" });
    expect(tripValue()).toContain("Japan");
    await user.type(within(dialog).getByLabelText("Title"), "Onsen");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(bodies("POST", "/api/todos")[0]).toMatchObject({
        title: "Onsen",
        tripId: "trip1",
      }),
    );
    await expectUndoToast("Added to Japan");
    await waitFor(() =>
      expect(rowTitles("Japan itinerary").at(-1)).toBe("Onsen"),
    );
  });

  test("Unsorted's Add to Inspiration pre-selects Inspiration, without an Unsorted option", async () => {
    const { user } = await renderBoard("unsorted");

    await user.click(
      screen.getByRole("button", { name: /Add to Inspiration/ }),
    );
    await screen.findByRole("dialog", { name: "New to-do" });

    expect(tripValue()).toContain("Inspiration · Ideas for someday");
    expect(await tripOptions(user)).not.toContain(
      "Unsorted · waiting for a trip",
    );
  });

  test("picking another trip saves there and selects that list", async () => {
    const { user } = await renderBoard();

    await user.click(screen.getByRole("button", { name: /Add idea/ }));
    const dialog = await screen.findByRole("dialog", { name: "New to-do" });
    await user.type(within(dialog).getByLabelText("Title"), "Snow");
    await pickTrip(user, "Taipei weekend");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(bodies("POST", "/api/todos")[0]).toMatchObject({
        tripId: "trip2",
      }),
    );
    await expectUndoToast("Added to Taipei weekend");
    await waitFor(() => expect(currentList()).toBe("trip2"));
  });

  test.each([
    ["blank", ""],
    ["whitespace-only", "   "],
  ])("a %s title shows Give it a title first", async (_, title) => {
    const { user } = await renderBoard();

    await user.click(screen.getByRole("button", { name: /Add idea/ }));
    const dialog = await screen.findByRole("dialog", { name: "New to-do" });
    if (title) await user.type(within(dialog).getByLabelText("Title"), title);
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    expect(
      await within(dialog).findByText("Give it a title first"),
    ).toBeDefined();
    expect(sent("POST", "/api/todos")).toHaveLength(0);
  });

  test("CJK and emoji titles are sent as typed", async () => {
    const { user } = await renderBoard();

    await user.click(screen.getByRole("button", { name: /Add idea/ }));
    const dialog = await screen.findByRole("dialog", { name: "New to-do" });
    await user.type(within(dialog).getByLabelText("Title"), "夜市 🍢");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(bodies("POST", "/api/todos")[0]).toMatchObject({
        title: "夜市 🍢",
      }),
    );
  });

  test("an image is cropped, sent as 0-<name> and uploaded", async () => {
    const { user } = await renderBoard();

    await user.click(screen.getByRole("button", { name: /Add idea/ }));
    const dialog = await screen.findByRole("dialog", { name: "New to-do" });
    await user.type(within(dialog).getByLabelText("Title"), "Photo walk");
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      jpg("a.jpg"),
    );
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Crop image" }),
      ).getByRole("button", { name: "Apply" }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Image uploaded successfully!",
      ),
    );
    await user.click(
      within(screen.getByRole("dialog", { name: "New to-do" })).getByRole(
        "button",
        { name: "Add" },
      ),
    );

    await waitFor(() =>
      expect(bodies("POST", "/api/todos")[0]).toMatchObject({
        imageNames: ["0-a.jpg"],
      }),
    );
    await waitFor(() =>
      expect(sent("PUT", "r2").map((r) => r.body)).toEqual(["cropped-a.jpg"]),
    );
  });

  test("an image over 5 MB is refused", async () => {
    const { user } = await renderBoard();

    await user.click(screen.getByRole("button", { name: /Add idea/ }));
    await screen.findByRole("dialog", { name: "New to-do" });
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      jpg("big.jpg", 5 * 1024 * 1024 + 1),
    );

    expect(toast.info).toHaveBeenCalledWith(
      "Images size need to be smaller than 5 MB.",
    );
    expect(screen.queryByRole("dialog", { name: "Crop image" })).toBeNull();
  });
});

describe("R17: edit to-do", () => {
  test("clicking a row opens Edit to-do, pre-filled", async () => {
    const { user } = await renderBoard("trip1");

    await user.click(screen.getByRole("button", { name: "Edit Osaka food" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit to-do" });

    expect(
      (within(dialog).getByLabelText("Title") as HTMLInputElement).value,
    ).toBe("Osaka food");
    expect(tripValue()).toContain("Japan");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Delete to-do" }),
    ).toBeDefined();
  });

  test("saving the same trip: PUT and Saved, no Undo", async () => {
    const { user } = await renderBoard("trip1");

    await user.click(screen.getByRole("button", { name: "Edit Osaka food" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit to-do" });
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Osaka street food");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sent("PUT", "/api/todos/s2")).toHaveLength(1));
    const body = bodies("PUT", "/api/todos/s2")[0];
    expect(body).toMatchObject({
      title: "Osaka street food",
      tripId: "trip1",
      location: osaka,
      imageNames: [],
    });
    expect("doneAt" in body).toBe(false);
    const saved = await findToast("Saved");
    expect(saved.options.action).toBeUndefined();
    await waitFor(() =>
      expect(rowTitles("Japan itinerary")[1]).toBe("Osaka street food"),
    );
  });

  test("changing the trip: Saved · moved to <name> + Undo", async () => {
    const { user } = await renderBoard("trip1");

    await user.click(screen.getByRole("button", { name: "Edit Osaka food" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit to-do" });
    await pickTrip(user, "Taipei weekend");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(bodies("PUT", "/api/todos/s2")[0]).toMatchObject({
        tripId: "trip2",
      }),
    );
    await waitFor(() =>
      expect(rowTitles("Japan itinerary")).toEqual([
        "Kyoto temple",
        "Nara deer",
      ]),
    );

    requests.length = 0;
    await undo("Saved · moved to Taipei weekend");

    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/s2")).toEqual([
        {
          tripId: "trip1",
          done: false,
          priority: 3,
        },
      ]),
    );
  });

  test("a done stop can't go to Inspiration", async () => {
    const { user } = await renderBoard("trip1");

    await user.click(screen.getByRole("button", { name: "Edit Kyoto temple" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit to-do" });
    await pickTrip(user, "Inspiration · Ideas for someday");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await within(dialog).findByText(
        "Inspiration can’t hold done items — pick a trip, or untick it first",
      ),
    ).toBeDefined();
    expect(sent("PUT", /todos/)).toHaveLength(0);
  });

  test("an Unsorted to-do lists and pre-selects Unsorted", async () => {
    const { user } = await renderBoard("unsorted");

    await user.click(screen.getByRole("button", { name: "Edit Night market" }));
    await screen.findByRole("dialog", { name: "Edit to-do" });

    expect(tripValue()).toContain("Unsorted · waiting for a trip");
    expect(await tripOptions(user)).toEqual([
      "Inspiration · Ideas for someday",
      "Unsorted · waiting for a trip",
      "Japan",
      "Taipei weekend",
    ]);
  });

  test("Delete to-do asks first, then deletes", async () => {
    const { user } = await renderBoard("trip1");

    await user.click(screen.getByRole("button", { name: "Edit Nara deer" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit to-do" });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete to-do" }),
    );
    expect(await screen.findByRole("alertdialog")).toBeDefined();
    expect(sent("DELETE", /todos/)).toHaveLength(0);
    await confirmIfAsked(user);

    await waitFor(() =>
      expect(sent("DELETE", "/api/todos/s3")).toHaveLength(1),
    );
    await waitFor(() =>
      expect(rowTitles("Japan itinerary")).toEqual([
        "Kyoto temple",
        "Osaka food",
      ]),
    );
  });
});

// ---------- R12: drag affordances ----------

describe("R12: drag handles", () => {
  test("every row and trip has its own handle", async () => {
    await renderBoard("trip1");

    for (const title of ["Kyoto temple", "Osaka food", "Nara deer"]) {
      expect(
        screen.getByRole("button", {
          name: `Drag ${title} to reorder or move`,
        }),
      ).toBeDefined();
    }
    expect(
      screen.getByRole("button", { name: "Drag to reorder Japan" }),
    ).toBeDefined();
  });
});

// ---------- R21: phone ----------

describe("R21: phone layout", () => {
  beforeEach(() => setViewport(375));

  test("the lists become chips; tapping one switches the list", async () => {
    const user = userEvent.setup();
    render(<TwoDoBoard />, { wrapper });

    const japanChip = await screen.findByRole("button", {
      name: /Japan.*1\/3/,
    });
    expect(
      screen.getByRole("button", { name: /Inspiration.*2/ }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: /Unsorted.*1/ })).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Taipei weekend.*0\/0/ }),
    ).toBeDefined();
    expect(
      screen.getAllByRole("button", { name: "New trip" }).length,
    ).toBeGreaterThan(0);

    await user.click(japanChip);

    await waitFor(() => expect(currentList()).toBe("trip1"));
    expect(
      await screen.findByRole("list", { name: "Japan itinerary" }),
    ).toBeDefined();
  });

  test("ticking an idea still opens the trip picker", async () => {
    const user = userEvent.setup();
    render(<TwoDoBoard />, { wrapper });

    await user.click(
      await screen.findByRole("button", {
        name: "Mark “Ramen class” done and pick its trip",
      }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Which trip was it on?" }),
    ).toBeDefined();
  });
});

// ---------- R22: loading and failures ----------

describe("R22: loading and failures", () => {
  test("shows skeletons while loading", async () => {
    server.use(
      http.get("/api/todos", async () => {
        await delay(200);
        return HttpResponse.json({ todos: db.todos });
      }),
    );
    render(<TwoDoBoard />, { wrapper });

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="skeleton"], [aria-busy="true"]'),
      ).not.toBeNull(),
    );
    expect(
      await screen.findByRole("button", { name: "Edit Ramen class" }),
    ).toBeDefined();
  });

  test("a failed tick toasts the error and rolls back", async () => {
    server.use(
      http.patch("/api/todos/:id", () =>
        HttpResponse.json(
          { message: "Failed to update todo. Please try again later." },
          { status: 500 },
        ),
      ),
    );
    const { user } = await renderBoard("trip1");

    await user.click(check("Mark “Osaka food” done"));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await waitFor(() =>
      expect(check("Mark “Osaka food” done").getAttribute("aria-pressed")).toBe(
        "false",
      ),
    );
    expect(screen.getByText("1 of 3 done")).toBeDefined();
  });

  test("a failed move rolls the row back into its list", async () => {
    server.use(
      http.patch("/api/todos/:id", () =>
        HttpResponse.json(
          { message: "Failed to update todo. Please try again later." },
          { status: 500 },
        ),
      ),
    );
    const { user } = await renderBoard("unsorted");

    await user.click(
      within(rowOf("Night market")).getByRole("button", { name: "Move to…" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Move to which trip?",
    });
    await user.click(within(dialog).getByRole("button", { name: /Japan/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // The dialog may stay open after a failure, so query hidden elements too
    await waitFor(() =>
      expect(
        screen.getByRole("list", { name: "Unsorted items", hidden: true })
          .textContent,
      ).toContain("Night market"),
    );
  });

  test("a failed load toasts the error", async () => {
    server.use(
      http.get("/api/trips", () =>
        HttpResponse.json(
          { message: "Failed to fetch trips. Please try again later." },
          { status: 500 },
        ),
      ),
    );
    render(<TwoDoBoard />, { wrapper });

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});

// ---------- white-box: drag and drop, driven through the captured monitor ----------

interface Source {
  kind: "todo" | "trip";
  id: string;
}
type TargetMatch = (data: Record<string, unknown>) => boolean;
const onRows: TargetMatch = (data) => data.target === "rows";
const onTrips: TargetMatch = (data) => data.target === "trips";
const onList =
  (list: string): TargetMatch =>
  (data) =>
    data.target === "list" && data.list === list;
const location = (matches: TargetMatch[], clientY: number) => {
  const input = { clientX: 0, clientY };
  const all = Array.from(dnd.targets).map((target) => ({
    element: target.element,
    data: target.getData({ input, element: target.element }),
  }));
  const dropTargets = matches.map((match) => {
    const hit = all.find((target) => match(target.data));
    expect(hit, "drop target").toBeDefined();
    return hit as (typeof all)[number];
  });
  const current = { input, dropTargets };
  return { current, initial: current, previous: { dropTargets } };
};
const dragOver = async (
  source: Source,
  matches: TargetMatch[],
  clientY = 0,
) => {
  const args = {
    source: { data: source },
    location: location(matches, clientY),
  };
  await act(async () => {
    dnd.monitor?.onDragStart(args);
  });
  await act(async () => {
    dnd.monitor?.onDrag(args);
  });
  return args;
};
const dragAndDrop = async (
  source: Source,
  matches: TargetMatch[],
  clientY = 0,
) => {
  const args = await dragOver(source, matches, clientY);
  await act(async () => {
    dnd.monitor?.onDrop(args);
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
const lineOf = (title: string) => {
  const line = rowOf(title).querySelector<HTMLElement>(
    'span[aria-hidden="true"].border-l-2',
  );
  if (!line) return null;
  return line.className.includes("border-solid") ? "solid" : "dashed";
};

describe("R9: itinerary lines (white-box)", () => {
  test("dashed unless both ends are done; none after the last stop", async () => {
    await renderBoard("trip1");

    expect(lineOf("Kyoto temple")).toBe("dashed");
    expect(lineOf("Osaka food")).toBe("dashed");
    expect(lineOf("Nara deer")).toBeNull();
  });

  test("solid when both ends are done", async () => {
    db.todos = db.todos.map((t) =>
      t.id === "s2" ? { ...t, doneAt: past } : t,
    );
    await renderBoard("trip1");

    expect(lineOf("Kyoto temple")).toBe("solid");
    expect(lineOf("Osaka food")).toBe("dashed");
  });

  test("hidden while dragging", async () => {
    await renderBoard("trip1");

    await dragOver({ kind: "todo", id: "s2" }, [onRows], 100);

    expect(lineOf("Kyoto temple")).toBeNull();
    expect(lineOf("Osaka food")).toBeNull();
  });

  test("Inspiration rows have no line", async () => {
    await renderBoard();

    expect(lineOf("Ramen class")).toBeNull();
  });
});

describe("R12: reorder inside a list (white-box)", () => {
  test("to the top: priority before the first", async () => {
    await renderBoard("trip1");

    await dragAndDrop({ kind: "todo", id: "s3" }, [onRows], 10);

    await waitFor(() =>
      // Ramen class holds 1, so the slot narrows to between 1 and 2
      expect(bodies("PATCH", "/api/todos/s3")).toEqual([{ priority: 1.5 }]),
    );
    await waitFor(() =>
      expect(rowTitles("Japan itinerary")).toEqual([
        "Nara deer",
        "Kyoto temple",
        "Osaka food",
      ]),
    );
    expect(toastCalls().filter((c) => c.options.action)).toEqual([]);
  });

  test("to the middle: the midpoint", async () => {
    await renderBoard("trip1");

    await dragAndDrop({ kind: "todo", id: "s1" }, [onRows], 100);

    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/s1")).toEqual([{ priority: 3.5 }]),
    );
  });

  test("to the end: after the last", async () => {
    await renderBoard("trip1");

    await dragAndDrop({ kind: "todo", id: "s1" }, [onRows], 5000);

    await waitFor(() =>
      // Sunset hike holds 5, so the slot narrows to between 4 and 5
      expect(bodies("PATCH", "/api/todos/s1")).toEqual([{ priority: 4.5 }]),
    );
  });

  test("while dragging, the other rows slide to open the slot", async () => {
    await renderBoard("trip1");
    const slotOf = (title: string) => rowOf(title).getAttribute("style");
    const before = slotOf("Kyoto temple");

    await dragOver({ kind: "todo", id: "s3" }, [onRows], 10);

    expect(slotOf("Kyoto temple")).not.toBe(before);
  });

  test("the same slot sends nothing", async () => {
    await renderBoard("trip1");

    await dragAndDrop({ kind: "todo", id: "s2" }, [onRows], 100);
    await settle();

    expect(sent("PATCH", /todos/)).toHaveLength(0);
  });

  test("dropped outside every target sends nothing", async () => {
    await renderBoard("trip1");
    await dragOver({ kind: "todo", id: "s3" }, [onRows], 10);

    await act(async () => {
      dnd.monitor?.onDrop({
        source: { data: { kind: "todo", id: "s3" } },
        location: location([], 10),
      });
    });
    await settle();

    expect(sent("PATCH", /todos/)).toHaveLength(0);
  });

  test("a failed reorder toasts the error and rolls back", async () => {
    server.use(
      http.patch("/api/todos/:id", () =>
        HttpResponse.json({ message: "Failed" }, { status: 500 }),
      ),
    );
    await renderBoard("trip1");

    await dragAndDrop({ kind: "todo", id: "s3" }, [onRows], 10);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await waitFor(() =>
      expect(rowTitles("Japan itinerary")).toEqual([
        "Kyoto temple",
        "Osaka food",
        "Nara deer",
      ]),
    );
  });
});

describe("R12/R13: drop onto another list (white-box)", () => {
  test("onto a sidebar trip: appended there, toast with Undo", async () => {
    await renderBoard("trip1");

    await dragAndDrop(
      { kind: "todo", id: "s2" },
      [onList("trip2"), onRows],
      100,
    );

    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/s2")).toEqual([{ tripId: "trip2" }]),
    );
    await waitFor(() =>
      expect(rowTitles("Japan itinerary")).toEqual([
        "Kyoto temple",
        "Nara deer",
      ]),
    );

    requests.length = 0;
    await undo("Moved to Taipei weekend");

    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/s2")).toEqual([
        { tripId: "trip1", done: false, priority: 3 },
      ]),
    );
  });

  test("an idea onto a trip keeps it undone", async () => {
    await renderBoard();

    await dragAndDrop({ kind: "todo", id: "i1" }, [onList("trip1")], 0);

    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/i1")).toEqual([{ tripId: "trip1" }]),
    );
    await expectUndoToast("Moved to Japan");
  });

  test("an undone stop onto Inspiration", async () => {
    await renderBoard("trip1");

    await dragAndDrop({ kind: "todo", id: "s3" }, [onList("inspiration")], 0);

    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/s3")).toEqual([{ tripId: null }]),
    );
    await expectUndoToast("Moved to Inspiration");
  });

  test("a done stop onto Inspiration is refused with the warn toast", async () => {
    await renderBoard("trip1");

    await dragAndDrop({ kind: "todo", id: "s1" }, [onList("inspiration")], 0);
    await settle();

    expect(sent("PATCH", /todos/)).toHaveLength(0);
    const warning = await findToast(
      "Inspiration only holds things you haven’t done yet — drop it on a trip instead",
    );
    expect(warning.options.duration).toBe(3200);
    expect(warning.options.action).toBeUndefined();
  });

  test("an Unsorted item onto Inspiration is refused too", async () => {
    await renderBoard("unsorted");

    await dragAndDrop({ kind: "todo", id: "u1" }, [onList("inspiration")], 0);
    await settle();

    expect(sent("PATCH", /todos/)).toHaveLength(0);
  });

  test("hovering a target marks it; a refused one gets its own state", async () => {
    await renderBoard("trip1");
    const inspirationClass = () => sideRow(/Inspiration/).className;
    const plain = inspirationClass();

    await dragOver({ kind: "todo", id: "s1" }, [onList("inspiration")], 0);

    expect(inspirationClass()).not.toBe(plain);
    expect(inspirationClass()).toContain("animate-nope");
  });

  test("dropping on the list it came from does nothing", async () => {
    await renderBoard("trip1");

    await dragAndDrop(
      { kind: "todo", id: "s2" },
      [onList("trip1"), onRows],
      100,
    );
    await settle();

    expect(sent("PATCH", /todos/)).toHaveLength(0);
    expect(toastCalls()).toEqual([]);
  });

  test("Unsorted is never a drop target", async () => {
    await renderBoard("trip1");

    // Only targets that accept a dragged to-do count
    const todoSource = { source: { data: { kind: "todo", id: "s2" } } };
    const lists = Array.from(dnd.targets)
      .filter((t) => t.canDrop(todoSource))
      .map((t) => t.getData({ input: {}, element: t.element }))
      .filter((data) => data.target === "list")
      .map((data) => data.list);
    expect(lists).toEqual(
      expect.arrayContaining(["inspiration", "trip1", "trip2"]),
    );
    expect(lists).not.toContain("unsorted");
  });
});

describe("R12: trip reorder (white-box)", () => {
  test("a trip dragged above another gets a position before it, no toast", async () => {
    await renderBoard();

    await dragAndDrop({ kind: "trip", id: "trip2" }, [onTrips], 10);

    await waitFor(() =>
      expect(bodies("PATCH", "/api/trips/trip2")).toEqual([{ position: 0 }]),
    );
    expect(toastCalls()).toEqual([]);
  });

  test("a trip dropped where it was sends nothing", async () => {
    await renderBoard();

    await dragAndDrop({ kind: "trip", id: "trip1" }, [onTrips], 10);
    await settle();

    expect(sent("PATCH", /trips/)).toHaveLength(0);
  });

  test("a failed trip reorder toasts the error", async () => {
    server.use(
      http.patch("/api/trips/:tripId", () =>
        HttpResponse.json({ message: "Failed" }, { status: 500 }),
      ),
    );
    await renderBoard();

    await dragAndDrop({ kind: "trip", id: "trip2" }, [onTrips], 10);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  test("anything that is not a to-do or trip is ignored", async () => {
    await renderBoard();

    expect(
      dnd.monitor?.canMonitor({ source: { data: { kind: "file" } } }),
    ).toBe(false);
    expect(
      dnd.monitor?.canMonitor({ source: { data: { kind: "todo", id: "i1" } } }),
    ).toBe(true);
  });
});

// ---------- white-box: dialogs ----------

const openNewTodo = async (
  user: ReturnType<typeof userEvent.setup>,
  button = /Add idea/,
) => {
  await user.click(screen.getByRole("button", { name: button }));
  return screen.findByRole("dialog", { name: "New to-do" });
};
const openEditTodo = async (
  user: ReturnType<typeof userEvent.setup>,
  title: string,
) => {
  await user.click(screen.getByRole("button", { name: `Edit ${title}` }));
  return screen.findByRole("dialog", { name: "Edit to-do" });
};
const fileInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;
const gifFile = (name: string) =>
  new File([`gif-${name}`], name, { type: "image/gif" });

describe("R17: TodoDialog (white-box)", () => {
  test("an empty description is left out of a new to-do", async () => {
    const { user } = await renderBoard();
    const dialog = await openNewTodo(user);

    await user.type(within(dialog).getByLabelText("Title"), "Picnic");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(sent("POST", "/api/todos")).toHaveLength(1));
    expect("description" in bodies("POST", "/api/todos")[0]).toBe(false);
  });

  test("a description is sent with a new to-do", async () => {
    const { user } = await renderBoard();
    const dialog = await openNewTodo(user);

    await user.type(within(dialog).getByLabelText("Title"), "Picnic");
    await user.type(within(dialog).getByLabelText("Description"), "bring tea");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(bodies("POST", "/api/todos")[0]).toMatchObject({
        description: "bring tea",
      }),
    );
  });

  test("clearing a description on edit sends null", async () => {
    const { user } = await renderBoard();
    const dialog = await openEditTodo(user, "Ramen class");

    await user.clear(within(dialog).getByLabelText("Description"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(bodies("PUT", "/api/todos/i1")[0]).toMatchObject({
        description: null,
        location: tokyo,
        tripId: null,
      }),
    );
  });

  test("a failed create shows the server message and keeps the dialog", async () => {
    server.use(
      http.post("/api/todos", () =>
        HttpResponse.json(
          { message: "Failed to create a todo. Please try again later." },
          { status: 500 },
        ),
      ),
    );
    const { user } = await renderBoard();
    const dialog = await openNewTodo(user);

    await user.type(within(dialog).getByLabelText("Title"), "Picnic");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    expect(
      await within(dialog).findByText(
        "Failed to create a todo. Please try again later.",
      ),
    ).toBeDefined();
    expect(toastCalls().filter((c) => c.options.action)).toEqual([]);
    expect(screen.getByRole("dialog", { name: "New to-do" })).toBeDefined();
  });

  test("a failed image upload deletes the new to-do", async () => {
    server.use(
      http.put(
        "https://r2.test/:name",
        () => new HttpResponse("<Error/>", { status: 500 }),
      ),
    );
    const { user } = await renderBoard();
    const dialog = await openNewTodo(user);
    await user.type(within(dialog).getByLabelText("Title"), "Photo walk");
    await user.upload(fileInput(), gifFile("fun.gif"));
    await within(dialog).findByAltText("fun.gif");

    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(sent("DELETE", "/api/todos/new1")).toHaveLength(1),
    );
    expect(screen.getByRole("dialog", { name: "New to-do" })).toBeDefined();
    expect(
      screen.getByRole("list", { name: "Inspiration ideas", hidden: true })
        .textContent,
    ).not.toContain("Photo walk");
  });

  test("edit keeps existing image keys and adds new names", async () => {
    const { user } = await renderBoard("trip1");
    const dialog = await openEditTodo(user, "Kyoto temple");

    await user.upload(fileInput(), gifFile("fun.gif"));
    await within(dialog).findByAltText("fun.gif");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(bodies("PUT", "/api/todos/s1")[0]).toMatchObject({
        imageNames: ["kyoto.jpg-1", "0-fun.gif"],
        tripId: "trip1",
      }),
    );
  });

  test("a failed upload on edit saves again with the existing images only", async () => {
    server.use(
      http.put("/api/todos/:id", async ({ request, params }) => {
        const body = await record(request);
        const todo = db.todos.find((t) => t.id === params.id) as TodoDto;
        return HttpResponse.json({
          todo,
          imagesToUpload: (body.imageNames as string[])
            .filter((name) => name.startsWith("0-"))
            .map((name) => ({ name, signedUrl: `https://r2.test/${name}` })),
        });
      }),
      http.put(
        "https://r2.test/:name",
        () => new HttpResponse("<Error/>", { status: 500 }),
      ),
    );
    const { user } = await renderBoard("trip1");
    const dialog = await openEditTodo(user, "Kyoto temple");

    await user.upload(fileInput(), gifFile("fun.gif"));
    await within(dialog).findByAltText("fun.gif");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(bodies("PUT", "/api/todos/s1")).toHaveLength(2));
    expect(bodies("PUT", "/api/todos/s1").map((b) => b.imageNames)).toEqual([
      ["kyoto.jpg-1", "0-fun.gif"],
      ["kyoto.jpg-1"],
    ]);
    expect(screen.getByRole("dialog", { name: "Edit to-do" })).toBeDefined();
  });

  test("5 images is the limit", async () => {
    db.todos = db.todos.map((t) =>
      t.id === "s1"
        ? {
            ...t,
            images: Array.from({ length: 4 }, (_, i) => ({
              key: `k${String(i)}`,
              url: `https://cdn.test/${String(i)}.jpg`,
            })),
          }
        : t,
    );
    const { user } = await renderBoard("trip1");
    await openEditTodo(user, "Kyoto temple");

    await user.upload(fileInput(), [gifFile("a.gif"), gifFile("b.gif")]);

    expect(toast.info).toHaveBeenCalledWith(
      "A twodo can only have at most five images.",
    );
  });

  test("an Unsorted item saved in Unsorted keeps no trip: Saved, no move", async () => {
    const { user } = await renderBoard("unsorted");
    const dialog = await openEditTodo(user, "Night market");

    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Night market food");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(bodies("PUT", "/api/todos/u1")[0]).toMatchObject({ tripId: null }),
    );
    const saved = await findToast("Saved");
    expect(saved.options.action).toBeUndefined();
  });

  test("an Unsorted item can't go to Inspiration", async () => {
    const { user } = await renderBoard("unsorted");
    const dialog = await openEditTodo(user, "Night market");

    await pickTrip(user, "Inspiration · Ideas for someday");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await within(dialog).findByText(
        "Inspiration can’t hold done items — pick a trip, or untick it first",
      ),
    ).toBeDefined();
    expect(sent("PUT", /todos/)).toHaveLength(0);
  });

  test("an undone stop may move to Inspiration", async () => {
    const { user } = await renderBoard("trip1");
    const dialog = await openEditTodo(user, "Osaka food");

    await pickTrip(user, "Inspiration · Ideas for someday");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(bodies("PUT", "/api/todos/s2")[0]).toMatchObject({ tripId: null }),
    );
    await expectUndoToast("Saved · moved to Inspiration");
  });

  test("Cancel sends nothing", async () => {
    const { user } = await renderBoard();
    const dialog = await openNewTodo(user);

    await user.type(within(dialog).getByLabelText("Title"), "Nope");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "New to-do" })).toBeNull(),
    );
    expect(sent("POST", /todos/)).toHaveLength(0);
  });

  test("a failed delete toasts and keeps the row", async () => {
    server.use(
      http.delete("/api/todos/:id", () =>
        HttpResponse.json(
          { message: "Failed to delete todo. Please try again later." },
          { status: 500 },
        ),
      ),
    );
    const { user } = await renderBoard("trip1");
    const dialog = await openEditTodo(user, "Nara deer");

    await user.click(
      within(dialog).getByRole("button", { name: "Delete to-do" }),
    );
    await confirmIfAsked(user);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(
      screen.getByRole("list", { name: "Japan itinerary", hidden: true })
        .textContent,
    ).toContain("Nara deer");
  });
});

describe("R14/R15: TripDialog (white-box)", () => {
  test("the name field stops at 80 characters", async () => {
    const { user } = await renderBoard();
    await user.click(
      within(sidebar()).getAllByRole("button", { name: "New trip" })[0],
    );
    const dialog = await screen.findByRole("dialog", { name: "New trip" });

    await user.type(within(dialog).getByLabelText("Name"), "a".repeat(85));

    expect(
      (within(dialog).getByLabelText("Name") as HTMLInputElement).value,
    ).toHaveLength(80);
  });

  test("Create trip looks disabled while the name is blank", async () => {
    const { user } = await renderBoard();
    await user.click(
      within(sidebar()).getAllByRole("button", { name: "New trip" })[0],
    );
    const dialog = await screen.findByRole("dialog", { name: "New trip" });
    const create = within(dialog).getByRole("button", { name: "Create trip" });

    expect(create.getAttribute("aria-disabled")).toBe("true");
    await user.type(within(dialog).getByLabelText("Name"), "Osaka");
    expect(create.getAttribute("aria-disabled")).toBe("false");
  });

  test("editing a field clears the date error", async () => {
    const { user } = await renderBoard();
    await user.click(
      within(sidebar()).getAllByRole("button", { name: "New trip" })[0],
    );
    const dialog = await screen.findByRole("dialog", { name: "New trip" });
    await user.type(within(dialog).getByLabelText("Name"), "Backwards");
    fireEvent.change(within(dialog).getByLabelText("From"), {
      target: { value: "2026-02-05" },
    });
    fireEvent.change(within(dialog).getByLabelText("To"), {
      target: { value: "2026-02-01" },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Create trip" }),
    );
    await within(dialog).findByRole("alert");

    fireEvent.change(within(dialog).getByLabelText("To"), {
      target: { value: "2026-02-09" },
    });

    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  test("Escape closes the dialog and sends nothing", async () => {
    const { user } = await renderBoard();
    await user.click(
      within(sidebar()).getAllByRole("button", { name: "New trip" })[0],
    );
    await screen.findByRole("dialog", { name: "New trip" });

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "New trip" })).toBeNull(),
    );
    expect(sent("POST", /trips/)).toHaveLength(0);
  });

  test("Edit trip sends the three fields and clears a date", async () => {
    const { user } = await renderBoard("trip1");
    const menu = await openTripMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Edit trip" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit trip" });

    fireEvent.change(within(dialog).getByLabelText("To"), {
      target: { value: "" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(bodies("PATCH", "/api/trips/trip1")).toEqual([
        { name: "Japan", startDate: "2025-12-20", endDate: null },
      ]),
    );
    await waitFor(() =>
      expect(sideRow(/Japan/).textContent).toContain("2025.12.20"),
    );
    expect(sideRow(/Japan/).textContent).not.toContain("2026.01.05");
  });

  test("a failed edit toasts, keeps the dialog and rolls the name back", async () => {
    server.use(
      http.patch("/api/trips/:tripId", () =>
        HttpResponse.json(
          { message: "Failed to update the trip. Please try again later." },
          { status: 500 },
        ),
      ),
    );
    const { user } = await renderBoard("trip1");
    const menu = await openTripMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Edit trip" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit trip" });
    const name = within(dialog).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Kansai");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole("dialog", { name: "Edit trip" })).toBeDefined();
    await waitFor(() =>
      expect(document.querySelector("aside")?.textContent).toContain("Japan"),
    );
    expect(toastCalls().map((c) => c.message)).not.toContain("Saved");
  });
});

describe("R10/R11: PickTripDialog (white-box)", () => {
  test("with no trips only the new-trip field shows", async () => {
    db.trips = [];
    db.todos = db.todos.filter((t) => t.tripId === null);
    const user = userEvent.setup();
    render(<TwoDoBoard />, { wrapper });

    await user.click(
      await screen.findByRole("button", {
        name: "Mark “Ramen class” done and pick its trip",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Which trip was it on?",
    });

    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent?.trim()),
    ).toEqual(["Create & move", "Not yet — keep it unticked"]);
  });

  test("the pick sub names the to-do", async () => {
    const { user } = await renderBoard();

    await user.click(check("Mark “Ramen class” done and pick its trip"));
    const dialog = await screen.findByRole("dialog", {
      name: "Which trip was it on?",
    });

    expect(
      within(dialog).getByText(
        "“Ramen class” will move out of Inspiration and into that trip.",
      ),
    ).toBeDefined();
  });

  test("Enter in the name field creates and moves", async () => {
    const { user } = await renderBoard();
    await user.click(check("Mark “Ramen class” done and pick its trip"));
    const dialog = await screen.findByRole("dialog", {
      name: "Which trip was it on?",
    });

    await user.type(
      within(dialog).getByLabelText("Or start a new trip"),
      "Kyushu{Enter}",
    );

    await waitFor(() =>
      expect(bodies("POST", "/api/trips")).toEqual([
        { name: "Kyushu", startDate: null, endDate: null },
      ]),
    );
  });

  test("a failed trip create toasts and moves nothing", async () => {
    server.use(
      http.post("/api/trips", () =>
        HttpResponse.json({ message: "Failed" }, { status: 500 }),
      ),
    );
    const { user } = await renderBoard();
    await user.click(check("Mark “Ramen class” done and pick its trip"));
    const dialog = await screen.findByRole("dialog", {
      name: "Which trip was it on?",
    });

    await user.type(within(dialog).getByLabelText("Or start a new trip"), "X");
    await user.click(
      within(dialog).getByRole("button", { name: "Create & move" }),
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(sent("PATCH", /todos/)).toHaveLength(0);
    expect(
      screen.getByRole("dialog", { name: "Which trip was it on?" }),
    ).toBeDefined();
  });

  test("a failed pick toasts, offers no Undo and keeps the dialog", async () => {
    server.use(
      http.patch("/api/todos/:id", () =>
        HttpResponse.json({ message: "Failed" }, { status: 500 }),
      ),
    );
    const { user } = await renderBoard();
    await user.click(check("Mark “Ramen class” done and pick its trip"));
    const dialog = await screen.findByRole("dialog", {
      name: "Which trip was it on?",
    });

    await user.click(within(dialog).getByRole("button", { name: /Japan/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toastCalls().filter((c) => c.options.action)).toEqual([]);
    expect(
      screen.getByRole("dialog", { name: "Which trip was it on?" }),
    ).toBeDefined();
  });

  test("R21: on phones the picker is a bottom sheet with a grab bar", async () => {
    setViewport(375);
    const user = userEvent.setup();
    render(<TwoDoBoard />, { wrapper });

    await user.click(
      await screen.findByRole("button", {
        name: "Mark “Ramen class” done and pick its trip",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Which trip was it on?",
    });

    expect(dialog.className).toContain("bottom-0");
    expect(dialog.querySelector('span[aria-hidden="true"]')).not.toBeNull();
  });

  test("on desktop it is a centered card", async () => {
    const { user } = await renderBoard();

    await user.click(check("Mark “Ramen class” done and pick its trip"));
    const dialog = await screen.findByRole("dialog", {
      name: "Which trip was it on?",
    });

    expect(dialog.className).not.toContain("bottom-0");
  });
});

describe("R13/R19/R22: failures and Undo (white-box)", () => {
  test("a failed trip delete toasts and keeps the trip selected", async () => {
    server.use(
      http.delete("/api/trips/:tripId", () =>
        HttpResponse.json({ message: "Failed" }, { status: 500 }),
      ),
    );
    const { user } = await renderBoard("trip1");
    const menu = await openTripMenu(user);

    await user.click(
      within(menu).getByRole("menuitem", { name: "Delete trip" }),
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(currentList()).toBe("trip1");
    await waitFor(() => expect(sideRow(/Japan/)).toBeDefined());
    expect(toastCalls().map((c) => c.message)).not.toContain("Trip deleted");
  });

  test("a failed untick in Unsorted offers no Undo", async () => {
    server.use(
      http.patch("/api/todos/:id", () =>
        HttpResponse.json({ message: "Failed" }, { status: 500 }),
      ),
    );
    const { user } = await renderBoard("unsorted");

    await user.click(
      check("Untick “Night market” (moves back to Inspiration)"),
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toastCalls().filter((c) => c.options.action)).toEqual([]);
  });

  test("a failed Undo shows the error", async () => {
    const { user } = await renderBoard("unsorted");
    await user.click(
      check("Untick “Night market” (moves back to Inspiration)"),
    );
    await expectUndoToast("Unticked — back in Inspiration");
    server.use(
      http.patch("/api/todos/:id", () =>
        HttpResponse.json({ message: "Undo broke" }, { status: 500 }),
      ),
    );

    await undo("Unticked — back in Inspiration");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Undo broke"),
      ),
    );
  });

  test("unticking in Unsorted appends to Inspiration", async () => {
    const { user } = await renderBoard("unsorted");

    await user.click(
      check("Untick “Night market” (moves back to Inspiration)"),
    );

    await waitFor(() =>
      expect(bodies("PATCH", "/api/todos/u1")).toEqual([
        { done: false, priority: 7 },
      ]),
    );
  });

  test("Undo of an added to-do removes its row", async () => {
    const { user } = await renderBoard();
    const dialog = await openNewTodo(user);
    await user.type(within(dialog).getByLabelText("Title"), "Picnic");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(rowTitles("Inspiration ideas")).toContain("Picnic"),
    );

    await undo("Added to Inspiration");

    await waitFor(() =>
      expect(rowTitles("Inspiration ideas")).not.toContain("Picnic"),
    );
  });
});

describe("R21: phone chips (white-box)", () => {
  beforeEach(() => setViewport(375));

  test("no Unsorted chip when it is empty", async () => {
    db.todos = db.todos.filter((t) => t.id !== "u1");
    render(<TwoDoBoard />, { wrapper });

    await screen.findByRole("button", { name: /Japan.*1\/3/ });
    expect(screen.queryByRole("button", { name: /Unsorted/ })).toBeNull();
  });

  test("the selected chip is aria-current", async () => {
    nav.set("list=trip1");
    render(<TwoDoBoard />, { wrapper });

    const chip = await screen.findByRole("button", { name: /Japan.*1\/3/ });
    expect(chip.getAttribute("aria-current")).toBe("page");
    expect(
      screen
        .getByRole("button", { name: /Inspiration.*2/ })
        .getAttribute("aria-current"),
    ).not.toBe("page");
  });

  test("the New trip chip opens the dialog", async () => {
    const user = userEvent.setup();
    render(<TwoDoBoard />, { wrapper });
    await screen.findByRole("button", { name: /Japan.*1\/3/ });

    await user.click(screen.getAllByRole("button", { name: "New trip" })[0]);

    expect(
      await screen.findByRole("dialog", { name: "New trip" }),
    ).toBeDefined();
  });
});

// ---------- review round 1 regressions ----------

describe("R12: reorder keeps priority globally unique (regression)", () => {
  // Inspiration 1, 3, 5 is interleaved with other lists at 0, 2, 4 and 6
  beforeEach(() => {
    db.todos = [
      dto("i1", "Ramen class", { priority: 1 }),
      dto("i2", "Sunset hike", { priority: 3 }),
      dto("i3", "Picnic", { priority: 5 }),
      dto("u1", "Night market", { doneAt: past, priority: 2 }),
      dto("s1", "Kyoto temple", { tripId: "trip1", priority: 0 }),
      dto("s2", "Osaka food", { tripId: "trip1", priority: 4 }),
      dto("s3", "Nara deer", { tripId: "trip1", doneAt: past, priority: 6 }),
    ];
  });
  const sentPriority = async (id: string) => {
    await waitFor(() =>
      expect(bodies("PATCH", `/api/todos/${id}`)).toHaveLength(1),
    );
    return bodies("PATCH", `/api/todos/${id}`)[0].priority as number;
  };
  const taken = (id: string) =>
    db.todos.filter((t) => t.id !== id).map((t) => t.priority);

  test("between 1 and 3 it does not take Unsorted's 2", async () => {
    const takenBefore = taken("i3");
    await renderBoard();

    await dragAndDrop({ kind: "todo", id: "i3" }, [onRows], 100);

    const priority = await sentPriority("i3");
    expect(priority).toBeGreaterThan(1);
    expect(priority).toBeLessThan(3);
    expect(takenBefore).not.toContain(priority);
    await waitFor(() =>
      expect(rowTitles("Inspiration ideas")).toEqual([
        "Ramen class",
        "Picnic",
        "Sunset hike",
      ]),
    );
  });

  test("to the end it does not take another list's last + 1", async () => {
    const takenBefore = taken("i1");
    await renderBoard();

    await dragAndDrop({ kind: "todo", id: "i1" }, [onRows], 5000);

    const priority = await sentPriority("i1");
    expect(priority).toBeGreaterThan(5);
    expect(takenBefore).not.toContain(priority);
  });

  test("to the top it does not take another list's first − 1", async () => {
    const takenBefore = taken("i3");
    await renderBoard();

    await dragAndDrop({ kind: "todo", id: "i3" }, [onRows], 10);

    const priority = await sentPriority("i3");
    expect(priority).toBeLessThan(1);
    expect(takenBefore).not.toContain(priority);
  });
});

describe("R10/R11/R13: Create & move cleans up after a failed move (regression)", () => {
  test.each([
    [
      "pick",
      undefined,
      "Mark “Ramen class” done and pick its trip",
      "Which trip was it on?",
    ],
    ["move", "unsorted", null, "Move to which trip?"],
  ])(
    "%s: the new trip is deleted and leaves the sidebar",
    async (_, list, checkName, dialogName) => {
      server.use(
        http.patch("/api/todos/:id", async ({ request }) => {
          await record(request);
          return HttpResponse.json(
            { message: "Failed to update todo. Please try again later." },
            { status: 500 },
          );
        }),
      );
      const { user } = await renderBoard(list);
      if (checkName) {
        await user.click(check(checkName));
      } else {
        await user.click(
          within(rowOf("Night market")).getByRole("button", {
            name: "Move to…",
          }),
        );
      }
      const dialog = await screen.findByRole("dialog", { name: dialogName });

      await user.type(
        within(dialog).getByLabelText("Or start a new trip"),
        "Ghost trip",
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Create & move" }),
      );

      await waitFor(() => expect(sent("POST", "/api/trips")).toHaveLength(1));
      await waitFor(() => expect(sent("PATCH", /todos/)).toHaveLength(1));
      await waitFor(() =>
        expect(sent("DELETE", "/api/trips/trip-new1")).toHaveLength(1),
      );
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      await waitFor(() =>
        expect(document.querySelector("aside")?.textContent).not.toContain(
          "Ghost trip",
        ),
      );
      expect(db.trips.map((t) => t.name)).not.toContain("Ghost trip");
      expect(toastCalls().filter((c) => c.options.action)).toEqual([]);
    },
  );
});

describe("R12: dropping on the own list's sidebar row (regression)", () => {
  test.each([
    ["after hovering the row itself", true],
    ["straight from the rows", false],
  ])("%s: a stale hovered slot moves nothing", async (_, hoverOwnRow) => {
    await renderBoard("trip1");
    const source = { kind: "todo" as const, id: "s3" };

    // Hover the rows at another slot (index 0), so a landing index is set
    await dragOver(source, [onRows], 10);
    const ownRow = {
      source: { data: source },
      location: location([onList("trip1")], 0),
    };
    if (hoverOwnRow) {
      await act(async () => {
        dnd.monitor?.onDrag(ownRow);
      });
    }
    await act(async () => {
      dnd.monitor?.onDrop(ownRow);
    });
    await settle();

    expect(sent("PATCH", /todos/)).toHaveLength(0);
    expect(rowTitles("Japan itinerary")).toEqual([
      "Kyoto temple",
      "Osaka food",
      "Nara deer",
    ]);
    expect(toastCalls()).toEqual([]);
  });
});

describe("R21: touch targets", () => {
  test("Move to… is 44px tall", async () => {
    await renderBoard("unsorted");

    const move = within(rowOf("Night market")).getByRole("button", {
      name: "Move to…",
    });
    expect(move.className).toMatch(/(^|\s)(h-11|min-h-11)(\s|$)/);
  });
});
