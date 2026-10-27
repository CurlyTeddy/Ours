import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionNav } from "@/components/section-nav";

const route = vi.hoisted(() => ({ pathname: "/moments" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const current = () =>
  screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);

describe("R23: header section nav", () => {
  test("links Moments, Two Do and Map, in that order, in a labelled nav", () => {
    render(<SectionNav />);

    expect(screen.getByRole("navigation", { name: "Sections" })).toBeDefined();
    expect(
      screen
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Moments", "/moments"],
      ["Two Do", "/twodo"],
      ["Map", "/map"],
    ]);
  });

  test.each([
    ["/moments", ["Moments"]],
    ["/twodo", ["Two Do"]],
    ["/map", ["Map"]],
    ["/moments/anything", ["Moments"]],
    ["/map/anything", ["Map"]],
    ["/profile", []],
    ["/momentsx", []],
    ["/mapx", []],
    ["/", []],
  ])("on %s the current link is %j", (pathname, expected) => {
    route.pathname = pathname;
    render(<SectionNav />);

    expect(current()).toEqual(expected);
  });
});
