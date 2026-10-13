import { describe, expect, test } from "vitest";
import { formatTime } from "@/lib/utils";

describe("formatTime", () => {
  test.each([
    [0, "0 seconds"],
    [1, "1 second"],
    [1.4, "1 second"],
    [59.4, "59 seconds"],
    [59.6, "1 minute"],
    [90, "2 minutes"],
    [3599, "1 hour"],
    [7200, "2 hours"],
    [86399, "1 day"],
    [3 * 86400, "3 days"],
  ])("%d seconds reads %j", (seconds, text) => {
    expect(formatTime(seconds)).toBe(text);
  });
});
