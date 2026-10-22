import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

import StorybookStill from "@/features/storybook/components/storybook-still";
import { STORY } from "@/features/storybook/story";

const images = ["data:a", "data:b", "data:c", "data:d"];
const login = <button type="button">login-slot</button>;

function expectStoryText() {
  expect(screen.getByText(STORY.intro.kicker)).toBeDefined();
  for (const ch of STORY.chapters) {
    expect(screen.getByText(ch.number)).toBeDefined();
    expect(screen.getByRole("heading", { name: ch.title })).toBeDefined();
    expect(screen.getByText(ch.caption)).toBeDefined();
  }
  expect(
    screen.getByRole("heading", { name: STORY.ending.title }),
  ).toBeDefined();
  expect(screen.getByText(STORY.ending.line)).toBeDefined();
  expect(screen.getByRole("button", { name: "login-slot" })).toBeDefined();
}

describe("R6: still version", () => {
  test("shows intro, chapters and ending with one image per moment", () => {
    render(<StorybookStill images={images} login={login} />);
    expectStoryText();

    const imgs = screen.getAllByRole("img") as HTMLImageElement[];
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual(images);
    expect(imgs.map((i) => i.alt)).toEqual([
      "The closed storybook lying on a table.",
      ...STORY.chapters.map((ch) => ch.alt),
    ]);
  });

  test("renders the login slot exactly once", () => {
    render(<StorybookStill images={images} login={login} />);
    expect(screen.getAllByRole("button", { name: "login-slot" })).toHaveLength(
      1,
    );
  });

  test("sections follow story order: intro, chapters, ending", () => {
    const { container } = render(
      <StorybookStill images={images} login={login} />,
    );
    const text = container.textContent;
    const order = [
      STORY.intro.kicker,
      ...STORY.chapters.map((ch) => ch.title),
      STORY.ending.line,
    ].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("R8: still version alt text", () => {
  test("each chapter image carries its chapter alt", () => {
    render(<StorybookStill images={images} login={login} />);
    for (const ch of STORY.chapters) {
      expect(screen.getByAltText(ch.alt)).toBeDefined();
    }
  });
});

describe("R7: text-only version", () => {
  test("images null: same text, no images", () => {
    render(<StorybookStill images={null} login={login} />);
    expectStoryText();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(document.querySelector("img")).toBeNull();
  });
});
