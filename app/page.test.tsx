import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/font/google", () => {
  const font = () => () => ({ className: "f", variable: "f", style: {} });
  return {
    Corben: font(),
    Gaegu: font(),
    Nunito: font(),
    Caveat: font(),
    Homemade_Apple: font(),
    Playpen_Sans: font(),
  };
});
vi.mock("@/features/storybook/components/storybook", () => ({
  default: ({ login }: { login: ReactNode }) => (
    <div data-testid="storybook">{login}</div>
  ),
}));
vi.mock("@/features/auth/components/storybook-login-dialog", () => ({
  default: (props: { callbackUrl?: string }) => (
    <button type="button" data-callback={JSON.stringify(props)}>
      login-dialog
    </button>
  ),
}));

import Home from "@/app/page";

type Params = Record<string, string | string[] | undefined>;
const renderHome = async (params: Params) =>
  render(await Home({ searchParams: Promise.resolve(params) }));
const dialogProps = () =>
  JSON.parse(
    screen.getByRole("button", { name: "login-dialog" }).dataset.callback ??
      "null",
  ) as { callbackUrl?: string };

describe("R1: landing page", () => {
  test("renders only the storybook, with the login dialog in its slot", async () => {
    const { container } = await renderHome({});
    const book = screen.getByTestId("storybook");
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(book);
    expect(book.textContent).toBe("login-dialog");
  });
});

describe("R7: landing page passes callbackUrl to the login dialog", () => {
  test.each(["/twodo", "/twodo/abc/edit", "/旅行🐻", ""])(
    "single string %j is passed through",
    async (callbackUrl) => {
      await renderHome({ callbackUrl });
      expect(dialogProps().callbackUrl).toBe(callbackUrl);
    },
  );

  test("an off-site value is passed through unvalidated", async () => {
    await renderHome({ callbackUrl: "https://evil.example" });
    expect(dialogProps().callbackUrl).toBe("https://evil.example");
  });

  test("missing counts as absent", async () => {
    await renderHome({});
    expect(dialogProps().callbackUrl).toBeUndefined();
  });

  test("explicit undefined counts as absent", async () => {
    await renderHome({ callbackUrl: undefined });
    expect(dialogProps().callbackUrl).toBeUndefined();
  });

  test.each([[["/twodo", "/moments"]], [["/twodo"]], [[]]])(
    "array %j counts as absent",
    async (callbackUrl) => {
      await renderHome({ callbackUrl });
      expect(dialogProps().callbackUrl).toBeUndefined();
    },
  );

  test("other params are ignored", async () => {
    await renderHome({ redirectTo: "/twodo", next: "/map" });
    expect(dialogProps().callbackUrl).toBeUndefined();
  });
});
