import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoveMapCard } from "@/features/moments/components/love-map-card";

const place = (name: string, latitude: number, longitude: number) => ({
  name,
  address: `${name} address`,
  placeId: `id-${name}`,
  latitude,
  longitude,
});
const pinPositions = (card: HTMLElement) =>
  Array.from(card.querySelectorAll<SVGElement>("svg")).flatMap((svg) =>
    svg.style.left
      ? [[parseFloat(svg.style.left), parseFloat(svg.style.top)]]
      : [],
  );

describe("R27: Love Map card", () => {
  test("labels the place count and opens on press", async () => {
    const onOpen = vi.fn();
    render(<LoveMapCard places={[place("Taipei", 25, 121)]} onOpen={onOpen} />);

    const card = screen.getByRole("button", {
      name: "Open Love Map: 1 places",
    });
    expect(screen.getByText("Love Map")).toBeDefined();
    expect(screen.getByText("1 places · tap to open")).toBeDefined();
    expect(card.querySelector("img")?.getAttribute("src")).toBe(
      "/moments/love-map.svg",
    );
    await userEvent.click(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test("no places means no pins", () => {
    render(<LoveMapCard places={[]} onOpen={() => undefined} />);

    const card = screen.getByRole("button", {
      name: "Open Love Map: 0 places",
    });
    expect(pinPositions(card)).toEqual([]);
  });

  test("pins use proj(): lon 100→260 and lat 66→-26 as percentages", () => {
    render(
      <LoveMapCard
        places={[
          place("Corner", 66, 100),
          place("Far", -26, 260),
          place("San Francisco", 37.8, -122.4),
          place("Taipei", 25.03, 121.56),
        ]}
        onOpen={() => undefined}
      />,
    );

    const positions = pinPositions(
      screen.getByRole("button", { name: /^Open Love Map/ }),
    );
    expect(positions).toHaveLength(4);
    const expected = [
      [0, 0],
      [100, 100],
      // Negative longitudes wrap past 180: -122.4 → 237.6
      [((237.6 - 100) / 160) * 100, ((66 - 37.8) / 92) * 100],
      [((121.56 - 100) / 160) * 100, ((66 - 25.03) / 92) * 100],
    ];
    positions.forEach(([left, top], i) => {
      expect(left).toBeCloseTo(expected[i][0], 3);
      expect(top).toBeCloseTo(expected[i][1], 3);
    });
  });
});
