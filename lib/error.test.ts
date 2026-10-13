import { describe, expect, test } from "vitest";
import { HTTPError, type NormalizedOptions } from "ky";
import { getErrorMessage } from "@/lib/error";

const httpError = (body: string, type: string) =>
  new HTTPError(
    new Response(body, { status: 500, headers: { "Content-Type": type } }),
    new Request("https://r2.test/x"),
    {} as NormalizedOptions,
  );

describe("getErrorMessage", () => {
  test("uses the message of our API payload", async () => {
    const error = httpError(
      '{"message":"Title is required"}',
      "application/json",
    );

    expect(await getErrorMessage(error, "fallback")).toBe("Title is required");
  });

  test.each([
    [
      "an XML body (R2)",
      "<Error><Code>AccessDenied</Code></Error>",
      "application/xml",
    ],
    ["an HTML body (gateway)", "<!DOCTYPE html><p>504</p>", "text/html"],
    ["JSON without a message", "{}", "application/json"],
  ])("falls back for %s", async (_, body, type) => {
    expect(await getErrorMessage(httpError(body, type), "fallback")).toBe(
      "fallback",
    );
  });

  test("falls back for errors that are not HTTP errors", async () => {
    expect(await getErrorMessage(new TypeError("offline"), "fallback")).toBe(
      "fallback",
    );
  });
});
