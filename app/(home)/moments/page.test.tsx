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
vi.mock("@/features/moments/components/moments-wall", () => ({
  MomentsWall: () => <div data-testid="wall" />,
}));

import Page from "@/app/(home)/moments/page";

describe("R1: /moments", () => {
  test("renders only the wall, inside the Google Maps provider", () => {
    const { container } = render(<Page />);

    const maps = screen.getByTestId("maps");
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(maps);
    expect(maps.children).toHaveLength(1);
    expect(maps.firstElementChild).toBe(screen.getByTestId("wall"));
  });
});
