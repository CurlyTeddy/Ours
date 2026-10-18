import { describe, expect, test } from "vitest";

// Set before the module loads: it builds its start date in local time at import
process.env.TZ = "Asia/Taipei";
const { getDaysTogether, getUpcomingSpecialDays } = await import(
  "@/features/moments/anniversary"
);

const taipei = (iso: string) => new Date(`${iso}+08:00`).getTime();
const day = (specialDayId: string, name: string, month: number, d: number) => ({
  specialDayId,
  name,
  month,
  day: d,
});
const names = (timestamp: number, days: ReturnType<typeof day>[]) =>
  getUpcomingSpecialDays(timestamp, days).map((u) => u.name);

describe("R3: built-in anniversary", () => {
  test("with no custom days, only the anniversary is returned", () => {
    expect(getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [])).toEqual([
      {
        specialDayId: null,
        name: "4th Year Anniversary",
        daysLeft: 15,
        label: "November 1, 2026",
      },
    ]);
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
        name: "4th Year Anniversary",
        daysLeft: 0,
        label: "November 1, 2026",
      },
    ]);
  });

  test("the day after rolls over to next year", () => {
    expect(getUpcomingSpecialDays(taipei("2026-11-02T00:00:00"), [])).toEqual([
      {
        specialDayId: null,
        name: "5th Year Anniversary",
        daysLeft: 364,
        label: "November 1, 2027",
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
  ])("in %i it is the %s Year Anniversary", (year, ordinal) => {
    const [anniversary] = getUpcomingSpecialDays(
      taipei(`${year.toString()}-10-01T12:00:00`),
      [],
    );
    expect(anniversary.name).toBe(`${ordinal} Year Anniversary`);
  });

  test("is always included, even when custom days are closer", () => {
    const upcoming = getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [
      day("a", "Tomorrow", 10, 18),
    ]);
    expect(upcoming).toHaveLength(2);
    expect(upcoming.filter((u) => u.specialDayId === null)).toHaveLength(1);
  });
});

describe("R2/R4: custom days repeat yearly, closest first", () => {
  test("a closer custom day sorts before the anniversary, each field set", () => {
    expect(
      getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [
        day("h", "Halloween", 10, 31),
      ]),
    ).toEqual([
      {
        specialDayId: "h",
        name: "Halloween",
        daysLeft: 14,
        label: "October 31, 2026",
      },
      {
        specialDayId: null,
        name: "4th Year Anniversary",
        daysLeft: 15,
        label: "November 1, 2026",
      },
    ]);
  });

  test("a day falling today has 0 days left until local midnight", () => {
    const days = [day("t", "Today", 10, 17)];
    expect(
      getUpcomingSpecialDays(taipei("2026-10-17T00:00:00"), days)[0],
    ).toMatchObject({ daysLeft: 0, label: "October 17, 2026" });
    expect(
      getUpcomingSpecialDays(taipei("2026-10-17T23:59:59"), days)[0],
    ).toMatchObject({ daysLeft: 0, label: "October 17, 2026" });
  });

  test("after local midnight, today's day rolls to next year", () => {
    const upcoming = getUpcomingSpecialDays(taipei("2026-10-18T00:00:00"), [
      day("t", "Yesterday", 10, 17),
    ]);
    expect(upcoming.find((u) => u.specialDayId === "t")).toEqual({
      specialDayId: "t",
      name: "Yesterday",
      daysLeft: 364,
      label: "October 17, 2027",
    });
  });

  test("Jan 1 seen from Dec 31 is next year's", () => {
    const [first] = getUpcomingSpecialDays(taipei("2026-12-31T12:00:00"), [
      day("n", "New Year", 1, 1),
    ]);
    expect(first).toEqual({
      specialDayId: "n",
      name: "New Year",
      daysLeft: 1,
      label: "January 1, 2027",
    });
  });

  test("Dec 31 seen from Jan 1 is 364 days away", () => {
    const upcoming = getUpcomingSpecialDays(taipei("2026-01-01T12:00:00"), [
      day("e", "Eve", 12, 31),
    ]);
    expect(upcoming.find((u) => u.specialDayId === "e")).toMatchObject({
      daysLeft: 364,
      label: "December 31, 2026",
    });
  });

  test("sorts by days left across the year boundary", () => {
    expect(
      names(taipei("2026-12-01T12:00:00"), [
        day("j", "Jan", 1, 1),
        day("d", "Dec", 12, 1),
        day("o", "Oct", 10, 1),
      ]),
    ).toEqual(["Dec", "Jan", "Oct", "5th Year Anniversary"]);
  });

  test("passes CJK and emoji names through unchanged", () => {
    const [first] = getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [
      day("c", "生日 🎂", 10, 20),
    ]);
    expect(first.name).toBe("生日 🎂");
  });

  test("does not mutate the input array", () => {
    const days = [day("b", "B", 12, 25), day("a", "A", 10, 20)];
    const copy = structuredClone(days);
    getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), days);
    expect(days).toEqual(copy);
  });
});

describe("R5: Feb 29", () => {
  const leapDay = [day("l", "Leap", 2, 29)];
  const leap = (iso: string) =>
    getUpcomingSpecialDays(taipei(iso), leapDay).find(
      (u) => u.specialDayId === "l",
    );

  test("falls on Feb 28 in a non-leap year", () => {
    expect(leap("2026-02-01T12:00:00")).toMatchObject({
      daysLeft: 27,
      label: "February 28, 2026",
    });
  });

  test("falls on Feb 29 in a leap year", () => {
    expect(leap("2028-02-01T12:00:00")).toMatchObject({
      daysLeft: 28,
      label: "February 29, 2028",
    });
  });

  test("is today on Feb 28 of a non-leap year", () => {
    expect(leap("2026-02-28T23:59:00")).toMatchObject({
      daysLeft: 0,
      label: "February 28, 2026",
    });
  });

  test("on Feb 28 of a leap year it is tomorrow", () => {
    expect(leap("2028-02-28T12:00:00")).toMatchObject({
      daysLeft: 1,
      label: "February 29, 2028",
    });
  });

  test("rolls from Mar 1 of a non-leap year to next Feb 28", () => {
    expect(leap("2026-03-01T00:00:00")).toMatchObject({
      daysLeft: 364,
      label: "February 28, 2027",
    });
  });

  test("rolls from Mar 1 before a leap year to Feb 29", () => {
    expect(leap("2027-03-01T00:00:00")).toMatchObject({
      daysLeft: 365,
      label: "February 29, 2028",
    });
  });

  test("rolls from Mar 1 of a leap year to next Feb 28", () => {
    expect(leap("2028-03-01T00:00:00")).toMatchObject({
      daysLeft: 364,
      label: "February 28, 2029",
    });
  });

  test("Feb 28 and Feb 29 tie in a non-leap year, in input order", () => {
    expect(
      getUpcomingSpecialDays(taipei("2026-02-01T12:00:00"), [
        day("l", "Leap", 2, 29),
        day("e", "Eight", 2, 28),
      ])
        .slice(0, 2)
        .map((u) => [u.name, u.daysLeft]),
    ).toEqual([
      ["Leap", 27],
      ["Eight", 27],
    ]);
  });
});

describe("R6/R9: ties keep the anniversary first, then input order", () => {
  test("a custom day on Nov 1 follows the anniversary", () => {
    const upcoming = getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [
      day("o", "Our Day", 11, 1),
    ]);
    expect(upcoming.map((u) => [u.specialDayId, u.daysLeft])).toEqual([
      [null, 15],
      ["o", 15],
    ]);
  });

  test("several tied custom days keep their input order", () => {
    expect(
      names(taipei("2026-10-17T12:00:00"), [
        day("x", "Xmas", 12, 25),
        day("b", "B", 11, 1),
        day("a", "A", 11, 1),
      ]),
    ).toEqual(["4th Year Anniversary", "B", "A", "Xmas"]);
  });

  test("tied custom days ahead of the anniversary keep input order", () => {
    expect(
      names(taipei("2026-10-17T12:00:00"), [
        day("2", "Second", 10, 20),
        day("1", "First", 10, 20),
      ]),
    ).toEqual(["Second", "First", "4th Year Anniversary"]);
  });

  test("duplicates (same name and date) are both kept (R13)", () => {
    expect(
      getUpcomingSpecialDays(taipei("2026-10-17T12:00:00"), [
        day("1", "Dup", 10, 20),
        day("2", "Dup", 10, 20),
      ]).map((u) => u.specialDayId),
    ).toEqual(["1", "2", null]);
  });
});

describe("getDaysTogether in Taipei", () => {
  test("ticks at local midnight", () => {
    expect(getDaysTogether(taipei("2022-11-01T00:00:00"))).toBe(0);
    expect(getDaysTogether(taipei("2022-11-01T23:59:00"))).toBe(0);
    expect(getDaysTogether(taipei("2022-11-02T00:00:00"))).toBe(1);
  });
});
