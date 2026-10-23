import { describe, expect, test } from "vitest";

// Set before the module loads: it builds its start date in local time at import
process.env.TZ = "Asia/Taipei";
const { getDaysTogether, getUpcomingSpecialDays } = await import(
  "@/features/moments/anniversary"
);

const taipei = (iso: string) => new Date(`${iso}+08:00`).getTime();
// Local midnight of that calendar day
const local = (year: number, month: number, d: number) =>
  new Date(year, month - 1, d);
const day = (
  specialDayId: string,
  name: string,
  month: number,
  d: number,
  year: number | null = null,
) => ({ specialDayId, name, month, day: d, year });
const names = (timestamp: number, days: ReturnType<typeof day>[]) =>
  getUpcomingSpecialDays(timestamp, days).map((u) => u.name);

describe("R24: built-in anniversary", () => {
  test("with no custom days, only the anniversary is returned, each field set", () => {
    expect(getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [])).toEqual([
      {
        specialDayId: null,
        name: "4th Anniversary",
        date: local(2026, 11, 1),
        daysLeft: 15,
        year: null,
      },
    ]);
  });

  test("has no label field any more", () => {
    const [anniversary] = getUpcomingSpecialDays(
      taipei("2026-10-17T12:00:00"),
      [],
    );
    expect(anniversary).not.toHaveProperty("label");
  });

  test("the day before at 23:59 says 1 day left", () => {
    const [anniversary] = getUpcomingSpecialDays(
      taipei("2026-10-31T23:59:00"),
      [],
    );
    expect(anniversary.daysLeft).toBe(1);
  });

  test.each([
    "2026-11-01T00:00:00",
    "2026-11-01T07:59:00",
    "2026-11-01T23:59:00",
  ])("the anniversary itself (%s) says 0 days left", (time) => {
    expect(getUpcomingSpecialDays(taipei(time), [])).toEqual([
      {
        specialDayId: null,
        name: "4th Anniversary",
        date: local(2026, 11, 1),
        daysLeft: 0,
        year: null,
      },
    ]);
  });

  test("the day after rolls over to next year", () => {
    expect(getUpcomingSpecialDays(taipei("2026-11-02T00:00:00"), [])).toEqual([
      {
        specialDayId: null,
        name: "5th Anniversary",
        date: local(2027, 11, 1),
        daysLeft: 364,
        year: null,
      },
    ]);
  });

  test.each([
    [2023, "1st"],
    [2024, "2nd"],
    [2025, "3rd"],
    [2033, "11th"],
    [2034, "12th"],
    [2035, "13th"],
    [2043, "21st"],
    [2044, "22nd"],
    [2045, "23rd"],
    [2122, "100th"],
    [2133, "111th"],
  ])("in %i it is the %s Anniversary", (year, ordinal) => {
    const [anniversary] = getUpcomingSpecialDays(
      taipei(`${year.toString()}-10-01T12:00:00`),
      [],
    );
    expect(anniversary.name).toBe(`${ordinal} Anniversary`);
  });

  test("is always included, even when custom days are closer", () => {
    const upcoming = getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [
      day("a", "Tomorrow", 10, 18),
    ]);
    expect(upcoming).toHaveLength(2);
    expect(upcoming.filter((u) => u.specialDayId === null)).toHaveLength(1);
  });
});

describe("R24: yearly custom days, closest first", () => {
  test("a closer custom day sorts before the anniversary, each field set", () => {
    expect(
      getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [
        day("h", "Halloween", 10, 31),
      ]),
    ).toEqual([
      {
        specialDayId: "h",
        name: "Halloween",
        date: local(2026, 10, 31),
        daysLeft: 14,
        year: null,
      },
      {
        specialDayId: null,
        name: "4th Anniversary",
        date: local(2026, 11, 1),
        daysLeft: 15,
        year: null,
      },
    ]);
  });

  test("a day falling today has 0 days left until local midnight", () => {
    const days = [day("t", "Today", 10, 17)];
    expect(
      getUpcomingSpecialDays(taipei("2026-10-17T00:00:00"), days)[0],
    ).toMatchObject({ daysLeft: 0, date: local(2026, 10, 17) });
    expect(
      getUpcomingSpecialDays(taipei("2026-10-17T23:59:59"), days)[0],
    ).toMatchObject({ daysLeft: 0, date: local(2026, 10, 17) });
  });

  test("after local midnight, today's day rolls to next year", () => {
    const upcoming = getUpcomingSpecialDays(taipei("2026-10-18T00:00:00"), [
      day("t", "Yesterday", 10, 17),
    ]);
    expect(upcoming.find((u) => u.specialDayId === "t")).toEqual({
      specialDayId: "t",
      name: "Yesterday",
      date: local(2027, 10, 17),
      daysLeft: 364,
      year: null,
    });
  });

  test("Jan 1 seen from Dec 31 is next year's", () => {
    const [first] = getUpcomingSpecialDays(taipei("2026-12-31T12:00:00"), [
      day("n", "New Year", 1, 1),
    ]);
    expect(first).toMatchObject({
      specialDayId: "n",
      daysLeft: 1,
      date: local(2027, 1, 1),
    });
  });

  test("sorts by days left across the year boundary", () => {
    expect(
      names(taipei("2026-12-01T12:00:00"), [
        day("j", "Jan", 1, 1),
        day("d", "Dec", 12, 1),
        day("o", "Oct", 10, 1),
      ]),
    ).toEqual(["Dec", "Jan", "Oct", "5th Anniversary"]);
  });

  test("passes CJK and emoji names through unchanged", () => {
    const [first] = getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [
      day("c", "生日 🎂", 10, 20),
    ]);
    expect(first.name).toBe("生日 🎂");
  });

  test("does not mutate the input array", () => {
    const days = [day("b", "B", 12, 25), day("a", "A", 10, 20, 2026)];
    const copy = structuredClone(days);
    getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), days);
    expect(days).toEqual(copy);
  });
});

describe("R24/R37: one-time days", () => {
  test("a future one-time day uses its year, each field set", () => {
    expect(
      getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [
        day("o", "Trip", 10, 22, 2026),
      ])[0],
    ).toEqual({
      specialDayId: "o",
      name: "Trip",
      date: local(2026, 10, 22),
      daysLeft: 5,
      year: 2026,
    });
  });

  test("a one-time day in a later year is not moved to this year", () => {
    const upcoming = getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [
      day("w", "Wedding", 3, 1, 2028),
    ]);
    expect(upcoming.map((u) => u.specialDayId)).toEqual([null, "w"]);
    expect(upcoming[1]).toMatchObject({
      date: local(2028, 3, 1),
      daysLeft: 501,
      year: 2028,
    });
  });

  test("a one-time day today is kept with 0 days left", () => {
    expect(
      getUpcomingSpecialDays(taipei("2026-10-17T23:59:00"), [
        day("o", "Today", 10, 17, 2026),
      ])[0],
    ).toMatchObject({ specialDayId: "o", daysLeft: 0, year: 2026 });
  });

  test("a one-time day is dropped the day after", () => {
    expect(
      getUpcomingSpecialDays(taipei("2026-10-18T00:00:00"), [
        day("o", "Yesterday", 10, 17, 2026),
      ]).map((u) => u.specialDayId),
    ).toEqual([null]);
  });

  test("a one-time day in a past year is dropped even if its month/day is ahead", () => {
    expect(
      getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [
        day("o", "Old", 12, 25, 2025),
      ]).map((u) => u.specialDayId),
    ).toEqual([null]);
  });

  test("one-time Feb 29 of a leap year stays on Feb 29", () => {
    expect(
      getUpcomingSpecialDays(taipei("2028-02-01T12:00:00"), [
        day("l", "Leap", 2, 29, 2028),
      ]).find((u) => u.specialDayId === "l"),
    ).toMatchObject({ date: local(2028, 2, 29), daysLeft: 28 });
  });

  test("yearly and one-time days mix, sorted by days left", () => {
    expect(
      names(taipei("2026-10-17T12:00:00"), [
        day("y", "Yearly", 12, 25),
        day("o", "Once", 10, 20, 2026),
        day("p", "Past", 1, 1, 2026),
      ]),
    ).toEqual(["Once", "4th Anniversary", "Yearly"]);
  });
});

describe("R24: Feb 29 yearly", () => {
  const leapDay = [day("l", "Leap", 2, 29)];
  const leap = (iso: string) =>
    getUpcomingSpecialDays(taipei(iso), leapDay).find(
      (u) => u.specialDayId === "l",
    );

  test("falls on Feb 28 in a non-leap year", () => {
    expect(leap("2026-02-01T12:00:00")).toMatchObject({
      daysLeft: 27,
      date: local(2026, 2, 28),
    });
  });

  test("falls on Feb 29 in a leap year", () => {
    expect(leap("2028-02-01T12:00:00")).toMatchObject({
      daysLeft: 28,
      date: local(2028, 2, 29),
    });
  });

  test("is today on Feb 28 of a non-leap year", () => {
    expect(leap("2026-02-28T23:59:00")).toMatchObject({
      daysLeft: 0,
      date: local(2026, 2, 28),
    });
  });

  test("rolls from Mar 1 before a leap year to Feb 29", () => {
    expect(leap("2027-03-01T00:00:00")).toMatchObject({
      daysLeft: 365,
      date: local(2028, 2, 29),
    });
  });

  test("rolls from Mar 1 of a leap year to next Feb 28", () => {
    expect(leap("2028-03-01T00:00:00")).toMatchObject({
      daysLeft: 364,
      date: local(2029, 2, 28),
    });
  });
});

describe("R24: ties keep the anniversary first, then input order", () => {
  test("a custom day on Nov 1 follows the anniversary", () => {
    const upcoming = getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [
      day("o", "Our Day", 11, 1),
    ]);
    expect(upcoming.map((u) => [u.specialDayId, u.daysLeft])).toEqual([
      [null, 15],
      ["o", 15],
    ]);
  });

  test("a one-time day on the anniversary also follows it", () => {
    expect(
      names(taipei("2026-10-17T12:00:00"), [
        day("x", "Xmas", 12, 25),
        day("b", "B", 11, 1, 2026),
        day("a", "A", 11, 1),
      ]),
    ).toEqual(["4th Anniversary", "B", "A", "Xmas"]);
  });

  test("tied custom days ahead of the anniversary keep input order", () => {
    expect(
      names(taipei("2026-10-17T12:00:00"), [
        day("2", "Second", 10, 20),
        day("1", "First", 10, 20, 2026),
      ]),
    ).toEqual(["Second", "First", "4th Anniversary"]);
  });
});

describe("R4: getDaysTogether in Taipei", () => {
  test("ticks at local midnight", () => {
    expect(getDaysTogether(taipei("2022-11-01T00:00:00"))).toBe(0);
    expect(getDaysTogether(taipei("2022-11-01T23:59:00"))).toBe(0);
    expect(getDaysTogether(taipei("2022-11-02T00:00:00"))).toBe(1);
  });
});
