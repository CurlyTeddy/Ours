import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const theme = vi.hoisted(() => ({
  current: "light",
  setTheme: (() => undefined) as (value: string) => void,
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: theme.current,
    resolvedTheme: theme.current,
    systemTheme: "light",
    themes: ["light", "dark"],
    setTheme: theme.setTheme,
  }),
}));

beforeEach(() => {
  theme.setTheme = vi.fn();
});

describe("R2: ThemeToggle", () => {
  test("in light mode it offers dark mode and switches to it", async () => {
    theme.current = "light";
    render(<ThemeToggle />);

    const button = await screen.findByRole("button", {
      name: "Switch to dark mode",
    });
    await userEvent.click(button);

    expect(theme.setTheme).toHaveBeenCalledTimes(1);
    expect(theme.setTheme).toHaveBeenCalledWith("dark");
  });

  test("in dark mode it offers light mode and switches to it", async () => {
    theme.current = "dark";
    render(<ThemeToggle />);

    const button = await screen.findByRole("button", {
      name: "Switch to light mode",
    });
    await userEvent.click(button);

    expect(theme.setTheme).toHaveBeenCalledWith("light");
  });

  test("works from the keyboard", async () => {
    theme.current = "light";
    render(<ThemeToggle />);

    const button = await screen.findByRole("button", {
      name: "Switch to dark mode",
    });
    button.focus();
    await userEvent.keyboard("{Enter}");

    expect(theme.setTheme).toHaveBeenCalledWith("dark");
  });
});

describe("R2: ThemeToggle before the theme resolves (white-box)", () => {
  test("an unknown theme reads as light", async () => {
    theme.current = undefined as unknown as string;
    render(<ThemeToggle />);

    expect(
      await screen.findByRole("button", { name: "Switch to dark mode" }),
    ).toBeDefined();
  });

  test("the icon is hidden from assistive tech", async () => {
    theme.current = "light";
    render(<ThemeToggle />);

    const button = await screen.findByRole("button");
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});
