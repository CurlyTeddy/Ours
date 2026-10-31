import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
    Caveat: font("Caveat"),
    Homemade_Apple: font("Homemade Apple"),
    Playpen_Sans: font("Playpen"),
  };
});
vi.mock("@/features/auth/actions", () => ({ authenticate: vi.fn() }));

import StorybookLoginDialog from "@/features/auth/components/storybook-login-dialog";
import { authenticate } from "@/features/auth/actions";

const auth = vi.mocked(authenticate);
const empty = "Enter both your email and your password.";

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue("Invalid credential.");
});

async function open() {
  // Radix sets pointer-events: none on body while the modal is open.
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<StorybookLoginDialog />);
  await user.click(screen.getByRole("button", { name: "Log in" }));
  const dialog = await screen.findByRole("dialog");
  return { user, dialog };
}

const submit = () => screen.getByRole("button", { name: "Log in" });
const status = () => screen.getByRole("status");
const expectStatus = (text: string) =>
  waitFor(() => expect(status().textContent).toBe(text));
const lastForm = () => auth.mock.calls.at(-1)?.[1] as FormData;

describe("R10: login dialog", () => {
  test("trigger has a heart icon and opens the dialog", async () => {
    render(<StorybookLoginDialog />);
    const trigger = screen.getByRole("button", { name: "Log in" });
    expect(trigger.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("shows title, subtitle, fields and buttons", async () => {
    const { dialog } = await open();
    expect(screen.getByRole("heading", { name: "Welcome home" })).toBeDefined();
    expect(
      screen.getByText("The rest of our little world is behind this page."),
    ).toBeDefined();

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.type).toBe("email");
    expect(email.name).toBe("email");
    expect(email.autocomplete).toBe("username");
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.type).toBe("password");
    expect(password.name).toBe("password");
    expect(password.autocomplete).toBe("current-password");

    const redirect = dialog.querySelector<HTMLInputElement>(
      'input[name="redirectTo"]',
    );
    expect(redirect?.type).toBe("hidden");
    expect(redirect?.value).toBe("/moments");
    expect(dialog.querySelector("form")?.noValidate).toBe(true);
    expect(status().getAttribute("aria-live")).toBe("polite");
    expect(status().textContent).toBe("");

    expect(
      screen.getByRole("button", { name: "Back to the book" }),
    ).toBeDefined();
    expect((submit() as HTMLButtonElement).type).toBe("submit");
  });

  test('"Back to the book" closes it', async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Back to the book" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("Escape closes it", async () => {
    const { user } = await open();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("clicking the backdrop closes it", async () => {
    const { user } = await open();
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("reopens after closing", async () => {
    const { user } = await open();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("dialog")).toBeDefined();
  });
});

describe("R12: empty fields", () => {
  test.each([
    ["both empty", "", ""],
    ["email empty", "", "password123"],
    ["password empty", "me@example.com", ""],
    ["email whitespace-only", "   ", "password123"],
  ])("%s: message shown, authenticate not called", async (_, email, pw) => {
    const { user } = await open();
    if (email) await user.type(screen.getByLabelText("Email"), email);
    if (pw) await user.type(screen.getByLabelText("Password"), pw);
    await user.click(submit());
    await expectStatus(empty);
    expect(auth).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  test("whitespace-only password counts as non-empty", async () => {
    const { user } = await open();
    await user.type(screen.getByLabelText("Email"), "me@example.com");
    await user.type(screen.getByLabelText("Password"), "   ");
    await user.click(submit());
    await waitFor(() => expect(auth).toHaveBeenCalledTimes(1));
    expect(status().textContent).not.toBe(empty);
  });
});

describe("R11: submit", () => {
  test("calls authenticate with the form and redirectTo=/moments", async () => {
    const { user } = await open();
    await user.type(screen.getByLabelText("Email"), "me@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(submit());
    await waitFor(() => expect(auth).toHaveBeenCalledTimes(1));
    expect(auth.mock.calls[0][0]).toBeUndefined();
    const form = lastForm();
    expect(form.get("email")).toBe("me@example.com");
    expect(form.get("password")).toBe("password123");
    expect(form.get("redirectTo")).toBe("/moments");
  });

  test("CJK and emoji pass through untouched", async () => {
    const { user } = await open();
    await user.type(screen.getByLabelText("Email"), "me@example.com");
    await user.type(screen.getByLabelText("Password"), "密碼🐻密碼🐻");
    await user.click(submit());
    await waitFor(() => expect(auth).toHaveBeenCalledTimes(1));
    expect(lastForm().get("password")).toBe("密碼🐻密碼🐻");
  });

  test.each([
    "Invalid credential.",
    "Invalid credential format.",
    "Too many requests. Wait 10 minutes to make another attempt.",
  ])("failure %s is shown verbatim and the dialog stays open", async (msg) => {
    auth.mockResolvedValue(msg);
    const { user } = await open();
    await user.type(screen.getByLabelText("Email"), "me@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(submit());
    await expectStatus(msg);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  test("pending: button disabled and busy", async () => {
    let finish!: (v: string) => void;
    auth.mockReturnValue(
      new Promise<string>((r) => {
        finish = r;
      }),
    );
    const { user } = await open();
    await user.type(screen.getByLabelText("Email"), "me@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(submit());

    await waitFor(() =>
      expect((submit() as HTMLButtonElement).disabled).toBe(true),
    );
    expect(submit().getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      finish("Invalid credential.");
    });
    await expectStatus("Invalid credential.");

    expect((submit() as HTMLButtonElement).disabled).toBe(false);
  });

  test("an empty-field error clears once a later submit fails on the server", async () => {
    const { user } = await open();
    await user.click(submit());
    await expectStatus(empty);
    await user.type(screen.getByLabelText("Email"), "me@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(submit());
    await expectStatus("Invalid credential.");
    expect(status().textContent).not.toBe(empty);
  });
});

describe("R10/R12: closing resets the card", () => {
  test("reopening shows empty fields and an empty status line", async () => {
    const { user } = await open();
    await user.type(screen.getByLabelText("Email"), "me@example.com");
    await user.click(submit());
    await expectStatus(empty);
    await user.click(screen.getByRole("button", { name: "Back to the book" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByRole("dialog");
    expect(status().textContent).toBe("");
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("");
  });

  test("no default close (X) button besides Back to the book", async () => {
    await open();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});

const renderWith = (callbackUrl?: string) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(<StorybookLoginDialog callbackUrl={callbackUrl} />);
  return user;
};
const redirectInput = () =>
  screen
    .getByRole("dialog")
    .querySelector<HTMLInputElement>('input[name="redirectTo"]');

describe("R8: redirectTo follows callbackUrl", () => {
  test.each(["/twodo", "/twodo/abc/edit", "/旅行🐻", "https://evil.example"])(
    "callbackUrl %j is the hidden redirectTo, untouched",
    async (callbackUrl) => {
      renderWith(callbackUrl);
      await screen.findByRole("dialog");
      expect(redirectInput()?.type).toBe("hidden");
      expect(redirectInput()?.value).toBe(callbackUrl);
    },
  );

  test("absent callbackUrl falls back to /moments", async () => {
    const user = renderWith(undefined);
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByRole("dialog");
    expect(redirectInput()?.value).toBe("/moments");
  });

  test("submit sends callbackUrl as redirectTo", async () => {
    const user = renderWith("/twodo");
    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText("Email"), "me@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(submit());
    await waitFor(() => expect(auth).toHaveBeenCalledTimes(1));
    expect(lastForm().get("redirectTo")).toBe("/twodo");
  });

  test("redirectTo survives close and reopen", async () => {
    const user = renderWith("/map");
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await screen.findByRole("dialog");
    expect(redirectInput()?.value).toBe("/map");
  });
});

describe("R9: dialog starts open only with a callbackUrl", () => {
  test("open on first render when callbackUrl is present", () => {
    renderWith("/twodo");
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Welcome home" })).toBeDefined();
  });

  test('empty-string callbackUrl opens it, with redirectTo ""', () => {
    renderWith("");
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(redirectInput()?.value).toBe("");
  });

  test("closed on first render when callbackUrl is absent", () => {
    renderWith(undefined);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test('"Back to the book" closes the auto-opened dialog', async () => {
    const user = renderWith("/twodo");
    await user.click(screen.getByRole("button", { name: "Back to the book" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("Escape closes the auto-opened dialog, and Log in reopens it", async () => {
    const user = renderWith("/twodo");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("dialog")).toBeDefined();
  });
});

describe("R10: signup link under the buttons", () => {
  test.each([
    ["with callbackUrl", "/twodo"],
    ["without callbackUrl", undefined],
  ])("%s: shows the invite line linking to /signup", async (_, callbackUrl) => {
    const user = renderWith(callbackUrl);
    if (!callbackUrl) {
      await user.click(screen.getByRole("button", { name: "Log in" }));
    }
    const dialog = await screen.findByRole("dialog");
    const link = screen.getByRole("link", { name: "Create an account" });

    expect(dialog.contains(link)).toBe(true);
    expect(link.getAttribute("href")).toBe("/signup");
    expect(link.parentElement?.textContent).toBe(
      "Have an invite code? Create an account",
    );
    // "under the buttons": the link comes after both dialog buttons in document order.
    for (const name of ["Back to the book", "Log in"]) {
      const button = screen.getByRole("button", { name });
      expect(
        button.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  test("uses the dialog palette", async () => {
    renderWith("/twodo");
    const link = screen.getByRole("link", { name: "Create an account" });
    const line = link.parentElement as HTMLElement;

    expect(line.className).toContain("--f-ui");
    expect(line.className).toContain("#6d6156");
    expect(link.className).toContain("#2f4468");
    expect(link.className).toContain("underline");
  });
});
