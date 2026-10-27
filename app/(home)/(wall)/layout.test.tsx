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

import Layout from "@/app/(home)/(wall)/layout";
import MomentsPage from "@/app/(home)/(wall)/moments/page";
import MapPage from "@/app/(home)/(wall)/map/page";

describe("R23: /moments and /map share one wall", () => {
  test("the layout renders one MomentsWall inside the Google Maps provider", () => {
    render(<Layout>{null}</Layout>);

    const maps = screen.getByTestId("maps");
    expect(screen.getAllByTestId("wall")).toHaveLength(1);
    expect(maps.contains(screen.getByTestId("wall"))).toBe(true);
  });

  test("both pages render nothing of their own", () => {
    expect(MomentsPage()).toBeNull();
    expect(MapPage()).toBeNull();
  });
});
