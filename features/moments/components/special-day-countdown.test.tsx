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
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { SpecialDay } from "@/features/moments/models/responses";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

// Set before the modules load: anniversary.ts builds its start date in local time at import
process.env.TZ = "Asia/Taipei";
const { SpecialDayCountdown } = await import(
  "@/features/moments/components/special-day-countdown"
);

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

const key = "/api/moments/special-days";
const now = new Date("2026-10-17T12:00:00+08:00").getTime();
let seq = 0;
const specialDay = (name: string, month: number, day: number): SpecialDay => {
  seq += 1;
  return {
    specialDayId: `sd${seq.toString()}`,
    name,
    month,
    day,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(),
  };
};

let days: SpecialDay[];
let posted: unknown[];
let deleted: string[];

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  days = [];
  posted = [];
  deleted = [];
  server.use(
    http.get(key, () => HttpResponse.json({ specialDays: days })),
    http.post(key, async ({ request }) => {
      const body = (await request.json()) as {
        name: string;
        month: number;
        day: number;
      };
      posted.push(body);
      const created = specialDay(body.name, body.month, body.day);
      days = [...days, created];
      return HttpResponse.json(created);
    }),
    http.delete(`${key}/:specialDayId`, ({ params }) => {
      const id = params.specialDayId as string;
      deleted.push(id);
      days = days.filter((d) => d.specialDayId !== id);
      return HttpResponse.json({ success: true });
    }),
  );
});

const card = () =>
  screen
    .getByText("Next Special Day")
    .closest('[data-slot="card"]') as HTMLElement;

async function renderCard() {
  const user = userEvent.setup();
  render(<SpecialDayCountdown now={now} />, { wrapper });
  return { user };
}

async function openManage() {
  const { user } = await renderCard();
  await user.click(await screen.findByRole("button", { name: "Manage" }));
  const dialog = await screen.findByRole("dialog", { name: "Special Days" });
  return { user, dialog };
}

function expectInOrder(container: HTMLElement, texts: string[]) {
  const nodes = texts.map((text) => within(container).getByText(text));
  for (let i = 1; i < nodes.length; i++) {
    expect(
      nodes[i - 1].compareDocumentPosition(nodes[i]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }
}

async function addDay(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  name: string,
  date: string,
) {
  if (name) {
    await user.click(within(dialog).getByLabelText("Name"));
    await user.paste(name);
  }
  if (date) await user.type(within(dialog).getByLabelText("Date"), date);
  await user.click(within(dialog).getByRole("button", { name: "Add" }));
}

describe("R7: card text", () => {
  test("default state counts down to the anniversary", async () => {
    await renderCard();

    const c = card();
    expect(await within(c).findByText("15")).toBeDefined();
    expect(within(c).getByText("Days Left")).toBeDefined();
    expect(within(c).getByText("November 1, 2026")).toBeDefined();
    expect(within(c).getByText("4th Year Anniversary")).toBeDefined();
    expect(within(c).getByRole("button", { name: "Manage" })).toBeDefined();
  });

  test("a closer custom day replaces the anniversary", async () => {
    days = [specialDay("Halloween", 10, 31)];
    await renderCard();

    const c = card();
    expect(await within(c).findByText("Halloween")).toBeDefined();
    expect(within(c).getByText("14")).toBeDefined();
    expect(within(c).getByText("October 31, 2026")).toBeDefined();
    expect(within(c).queryByText("4th Year Anniversary")).toBeNull();
  });

  test("a day falling today shows 0", async () => {
    days = [specialDay("Today", 10, 17)];
    await renderCard();

    const c = card();
    expect(await within(c).findByText("Today")).toBeDefined();
    expect(within(c).getByText("0")).toBeDefined();
    expect(within(c).getByText("October 17, 2026")).toBeDefined();
  });
});

describe("R6: ties", () => {
  test("a custom day on Nov 1 joins the anniversary with ' & '", async () => {
    days = [specialDay("Our Day", 11, 1)];
    await renderCard();

    expect(
      await within(card()).findByText("4th Year Anniversary & Our Day"),
    ).toBeDefined();
    expect(within(card()).getByText("15")).toBeDefined();
  });

  test("several tied custom days follow creation order", async () => {
    days = [
      specialDay("Older", 11, 1),
      specialDay("Xmas", 12, 25),
      specialDay("Newer", 11, 1),
    ];
    await renderCard();

    expect(
      await within(card()).findByText("4th Year Anniversary & Older & Newer"),
    ).toBeDefined();
  });

  test("tied custom days ahead of the anniversary follow creation order", async () => {
    days = [specialDay("Older", 10, 20), specialDay("Newer", 10, 20)];
    await renderCard();

    expect(await within(card()).findByText("Older & Newer")).toBeDefined();
    expect(within(card()).getByText("3")).toBeDefined();
  });

  test("duplicates (same name and date) both show (R13)", async () => {
    days = [specialDay("Dup", 10, 20), specialDay("Dup", 10, 20)];
    await renderCard();

    expect(await within(card()).findByText("Dup & Dup")).toBeDefined();
  });
});

describe("R8: loading", () => {
  test("while loading, the number, date line and name line are skeletons", async () => {
    server.use(
      http.get(key, async () => {
        await delay("infinite");
        return HttpResponse.json({ specialDays: [] });
      }),
    );
    await renderCard();

    const c = card();
    expect(c.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
    expect(within(c).queryByText("15")).toBeNull();
    expect(within(c).queryByText("November 1, 2026")).toBeNull();
    expect(within(c).queryByText("4th Year Anniversary")).toBeNull();
    expect(within(c).getByText("Next Special Day")).toBeDefined();
  });

  test("a failed fetch toasts and counts down to the anniversary only", async () => {
    server.use(
      http.get(key, () =>
        HttpResponse.json(
          { message: "Failed to fetch special days" },
          { status: 500 },
        ),
      ),
    );
    await renderCard();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const c = card();
    expect(await within(c).findByText("15")).toBeDefined();
    expect(within(c).getByText("4th Year Anniversary")).toBeDefined();
    expect(within(c).getByText("November 1, 2026")).toBeDefined();
    expect(c.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
  });
});

describe("R9: Manage dialog", () => {
  test("lists every candidate in occurrence order with its date", async () => {
    days = [
      specialDay("Xmas", 12, 25),
      specialDay("Our Day", 11, 1),
      specialDay("Halloween", 10, 31),
    ];
    const { dialog } = await openManage();

    await within(dialog).findByText("Xmas");
    expectInOrder(dialog, [
      "Halloween",
      "4th Year Anniversary",
      "Our Day",
      "Xmas",
    ]);
    expect(within(dialog).getByText("October 31, 2026")).toBeDefined();
    expect(within(dialog).getAllByText("November 1, 2026")).toHaveLength(2);
    expect(within(dialog).getByText("December 25, 2026")).toBeDefined();
  });

  test("every custom row has a delete button and the anniversary has none", async () => {
    days = [specialDay("Halloween", 10, 31), specialDay("Xmas", 12, 25)];
    const { dialog } = await openManage();

    expect(
      await within(dialog).findByRole("button", { name: "Delete Halloween" }),
    ).toBeDefined();
    expect(
      within(dialog).getByRole("button", { name: "Delete Xmas" }),
    ).toBeDefined();
    expect(
      within(dialog).queryByRole("button", { name: /4th Year Anniversary/ }),
    ).toBeNull();
    expect(
      within(dialog).getAllByRole("button", { name: /^Delete / }),
    ).toHaveLength(2);
  });

  test("with no custom days, only the anniversary row shows, with no delete button", async () => {
    const { dialog } = await openManage();

    expect(
      await within(dialog).findByText("4th Year Anniversary"),
    ).toBeDefined();
    expect(within(dialog).getByText("November 1, 2026")).toBeDefined();
    expect(
      within(dialog).queryAllByRole("button", { name: /^Delete / }),
    ).toHaveLength(0);
  });

  test("duplicate days each get a row and a delete button (R13)", async () => {
    days = [specialDay("Dup", 10, 20), specialDay("Dup", 10, 20)];
    const { dialog } = await openManage();

    await waitFor(() =>
      expect(
        within(dialog).getAllByRole("button", { name: "Delete Dup" }),
      ).toHaveLength(2),
    );
  });
});

describe("R10: Add", () => {
  test("adds a closer day: toast, reset form, list and card update", async () => {
    const { user, dialog } = await openManage();

    await addDay(user, dialog, "Halloween", "Oct 31, 2025");

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Special day added"),
    );
    expect(posted).toEqual([{ name: "Halloween", month: 10, day: 31 }]);
    await waitFor(() =>
      expect(
        within(dialog).getByLabelText<HTMLInputElement>("Name").value,
      ).toBe(""),
    );
    expect(within(dialog).getByLabelText<HTMLInputElement>("Date").value).toBe(
      "",
    );
    await within(dialog).findByText("Halloween");
    expectInOrder(dialog, ["Halloween", "4th Year Anniversary"]);
    const c = card();
    expect(await within(c).findByText("14")).toBeDefined();
    expect(within(c).getByText("October 31, 2026")).toBeDefined();
    expect(within(c).getByText("Halloween")).toBeDefined();
  });

  test("adding a tie on Nov 1 joins the name line", async () => {
    const { user, dialog } = await openManage();

    await addDay(user, dialog, "Our Day", "Nov 01, 2030");

    expect(
      await within(card()).findByText("4th Year Anniversary & Our Day"),
    ).toBeDefined();
    expect(posted).toEqual([{ name: "Our Day", month: 11, day: 1 }]);
  });

  test("Feb 29 is stored as month 2, day 29", async () => {
    const { user, dialog } = await openManage();

    await addDay(user, dialog, "Leap", "Feb 29, 2024");

    await waitFor(() =>
      expect(posted).toEqual([{ name: "Leap", month: 2, day: 29 }]),
    );
  });

  test("a CJK and emoji name is sent unchanged", async () => {
    const { user, dialog } = await openManage();

    await addDay(user, dialog, "生日 🎂", "May 20, 2026");

    await waitFor(() =>
      expect(posted).toEqual([{ name: "生日 🎂", month: 5, day: 20 }]),
    );
  });

  test("a 50-character name is accepted", async () => {
    const { user, dialog } = await openManage();

    await addDay(user, dialog, "a".repeat(50), "Jan 01, 2026");

    await waitFor(() =>
      expect(posted).toEqual([{ name: "a".repeat(50), month: 1, day: 1 }]),
    );
  });

  test("Add is disabled while the request is pending", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(key, async ({ request }) => {
        posted.push(await request.json());
        await gate;
        return HttpResponse.json(specialDay("Halloween", 10, 31));
      }),
    );
    const { user, dialog } = await openManage();

    await addDay(user, dialog, "Halloween", "Oct 31, 2026");

    const add = within(dialog).getByRole("button", { name: "Add" });
    await waitFor(() => expect(add).toHaveProperty("disabled", true));
    release();
    await waitFor(() => expect(add).toHaveProperty("disabled", false));
    expect(posted).toHaveLength(1);
  });

  test.each([
    [
      "the server's message",
      () =>
        HttpResponse.json(
          { message: "Failed to create special day" },
          { status: 500 },
        ),
      "Failed to create special day",
    ],
    [
      "the fallback for a non-JSON body",
      () => new HttpResponse("<html>Bad Gateway</html>", { status: 502 }),
      "Failed to add special day",
    ],
    [
      "the fallback for a network error",
      () => HttpResponse.error(),
      "Failed to add special day",
    ],
  ])(
    "a failed add toasts %s and keeps the form values",
    async (_, resolver, message) => {
      server.use(http.post(key, resolver));
      const { user, dialog } = await openManage();

      await addDay(user, dialog, "Halloween", "Oct 31, 2026");

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
      expect(toast.success).not.toHaveBeenCalled();
      expect(
        within(dialog).getByRole("button", { name: "Add" }),
      ).toHaveProperty("disabled", false);
      expect(
        within(dialog).getByLabelText<HTMLInputElement>("Name").value,
      ).toBe("Halloween");
      expect(
        within(dialog).getByLabelText<HTMLInputElement>("Date").value,
      ).toBe("Oct 31, 2026");
      expect(within(card()).getByText("4th Year Anniversary")).toBeDefined();
    },
  );

  test("a date picked from the calendar stores its month and day", async () => {
    const { user, dialog } = await openManage();

    await user.click(within(dialog).getByLabelText("Name"));
    await user.paste("Picked");
    await user.click(
      within(dialog).getByRole("button", { name: "Select date" }),
    );
    const fifteenth = await waitFor(() => {
      const button = [
        ...document.querySelectorAll<HTMLButtonElement>("button[data-day]"),
      ].find((b) => b.textContent === "15");
      if (!button) throw new Error("calendar not open");
      return button;
    });
    await user.click(fifteenth);
    await waitFor(() =>
      expect(
        within(dialog).getByLabelText<HTMLInputElement>("Date").value,
      ).not.toBe(""),
    );
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    // The calendar opens on the real current month
    await waitFor(() =>
      expect(posted).toEqual([
        { name: "Picked", month: new Date().getMonth() + 1, day: 15 },
      ]),
    );
  });
});

describe("R10: form validation", () => {
  test("an empty form shows both messages and sends nothing", async () => {
    const { user, dialog } = await openManage();

    await addDay(user, dialog, "", "");

    expect(await within(dialog).findByText("Name is required")).toBeDefined();
    expect(within(dialog).getByText("Pick a date")).toBeDefined();
    expect(posted).toEqual([]);
  });

  test("a whitespace-only name says Name is required", async () => {
    const { user, dialog } = await openManage();

    await addDay(user, dialog, "   ", "Oct 31, 2026");

    expect(await within(dialog).findByText("Name is required")).toBeDefined();
    expect(posted).toEqual([]);
  });

  test("a 51-character name says it is too long", async () => {
    const { user, dialog } = await openManage();

    await addDay(user, dialog, "a".repeat(51), "Oct 31, 2026");

    expect(
      await within(dialog).findByText("Name must be 50 characters or fewer"),
    ).toBeDefined();
    expect(posted).toEqual([]);
  });

  test("an unparseable date says Pick a date", async () => {
    const { user, dialog } = await openManage();

    await addDay(user, dialog, "Halloween", "someday");

    expect(await within(dialog).findByText("Pick a date")).toBeDefined();
    expect(posted).toEqual([]);
  });
});

describe("R11: Delete", () => {
  test("confirming removes the day: toast, list and card update", async () => {
    days = [specialDay("Halloween", 10, 31)];
    const { user, dialog } = await openManage();

    await user.click(
      await within(dialog).findByRole("button", { name: "Delete Halloween" }),
    );
    const alert = await screen.findByRole("alertdialog", {
      name: "Delete special day?",
    });
    expect(
      within(alert).getByText(
        '"Halloween" will be removed from the countdown.',
      ),
    ).toBeDefined();
    await user.click(within(alert).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Special day removed"),
    );
    expect(deleted).toEqual(["sd1"]);
    await waitFor(() =>
      expect(within(dialog).queryByText("Halloween")).toBeNull(),
    );
    const c = card();
    expect(await within(c).findByText("15")).toBeDefined();
    expect(within(c).getByText("4th Year Anniversary")).toBeDefined();
  });

  test("deletes only the chosen duplicate", async () => {
    days = [specialDay("Dup", 10, 20), specialDay("Dup", 10, 20)];
    const { user, dialog } = await openManage();

    const buttons = await within(dialog).findAllByRole("button", {
      name: "Delete Dup",
    });
    await user.click(buttons[1]);
    const alert = await screen.findByRole("alertdialog");
    await user.click(within(alert).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleted).toEqual(["sd2"]));
  });

  test("cancelling sends nothing", async () => {
    days = [specialDay("Halloween", 10, 31)];
    const { user, dialog } = await openManage();

    await user.click(
      await within(dialog).findByRole("button", { name: "Delete Halloween" }),
    );
    const alert = await screen.findByRole("alertdialog");
    await user.click(within(alert).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(deleted).toEqual([]);
    expect(toast.success).not.toHaveBeenCalled();
  });

  test("a failed delete toasts the server's message", async () => {
    days = [specialDay("Halloween", 10, 31)];
    server.use(
      http.delete(`${key}/:specialDayId`, () =>
        HttpResponse.json(
          { message: "Special day not found." },
          { status: 404 },
        ),
      ),
    );
    const { user, dialog } = await openManage();

    await user.click(
      await within(dialog).findByRole("button", { name: "Delete Halloween" }),
    );
    const alert = await screen.findByRole("alertdialog");
    await user.click(within(alert).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Special day not found."),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});
