import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/font/google", () => {
  const font = () => () => ({ className: "f", variable: "f", style: {} });
  return {
    Nunito: font(),
    Caveat: font(),
    Homemade_Apple: font(),
    Playpen_Sans: font(),
  };
});
vi.mock("@/components/providers/google-maps", () => ({
  GoogleMapsProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="maps">{children}</div>
  ),
}));
vi.mock("@/features/two-dos/components/two-do-board", () => ({
  TwoDoBoard: () => <div data-testid="board" />,
}));

import Page from "@/app/(home)/twodo/page";

describe("R5/R18: /twodo", () => {
  test("renders the board inside the Google Maps provider", () => {
    render(<Page />);

    expect(
      screen.getByTestId("maps").contains(screen.getByTestId("board")),
    ).toBe(true);
  });
});
