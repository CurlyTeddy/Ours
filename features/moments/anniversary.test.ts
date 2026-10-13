import { describe, expect, test } from "vitest";

// Set before the module loads: it builds its start date in local time at import
process.env.TZ = "Asia/Taipei";
const { getDaysTogether, getNextAnniversary } = await import(
  "@/features/moments/anniversary"
);

const taipei = (iso: string) => new Date(`${iso}+08:00`).getTime();

describe("getNextAnniversary in Taipei", () => {
  test("the day before at 23:59 says 1 day left", () => {
    expect(getNextAnniversary(taipei("2026-10-31T23:59:00")).daysLeft).toBe(1);
  });

  test.each([
    "2026-11-01T00:00:00",
    "2026-11-01T07:59:00",
    "2026-11-01T23:59:00",
  ])("the anniversary itself (%s) says 0 days left", (time) => {
    const anniversary = getNextAnniversary(taipei(time));

    expect(anniversary.daysLeft).toBe(0);
    expect(anniversary.label).toBe("November 1, 2026");
    expect(anniversary.yearLabel).toBe("4th Year Anniversary");
  });

  test("the day after rolls over to next year", () => {
    const anniversary = getNextAnniversary(taipei("2026-11-02T00:00:00"));

    expect(anniversary.daysLeft).toBe(364);
    expect(anniversary.yearLabel).toBe("5th Year Anniversary");
  });
});

describe("getDaysTogether in Taipei", () => {
  test("ticks at local midnight", () => {
    expect(getDaysTogether(taipei("2022-11-01T00:00:00"))).toBe(0);
    expect(getDaysTogether(taipei("2022-11-01T23:59:00"))).toBe(0);
    expect(getDaysTogether(taipei("2022-11-02T00:00:00"))).toBe(1);
  });
});
