import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionNav } from "@/components/section-nav";

const route = vi.hoisted(() => ({ pathname: "/moments" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));

const current = () =>
  screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);

describe("R2: header section nav", () => {
  test("links Moments and Two Do in a labelled nav", () => {
    render(<SectionNav />);

    expect(screen.getByRole("navigation", { name: "Sections" })).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Moments" }).getAttribute("href"),
    ).toBe("/moments");
    expect(
      screen.getByRole("link", { name: "Two Do" }).getAttribute("href"),
    ).toBe("/twodo");
  });

  test.each([
    ["/moments", ["Moments"]],
    ["/twodo", ["Two Do"]],
    ["/twodo/abc/edit", ["Two Do"]],
    ["/moments/anything", ["Moments"]],
    ["/profile", []],
    ["/momentsx", []],
    ["/", []],
  ])("on %s the current link is %j", (pathname, expected) => {
    route.pathname = pathname;
    render(<SectionNav />);

    expect(current()).toEqual(expected);
  });
});
