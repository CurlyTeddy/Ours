import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_ENVIRONMENT: "dev", YOUTUBE_DATA_API_KEY: "yt-key" },
}));

import { fetchVideoDurationSeconds } from "@/features/music/video-duration";
import { youTubeVideosResponseSchema } from "@/features/music/models/responses";

let fetchSpy: ReturnType<typeof vi.spyOn>;
const respond = (body: unknown, status = 200) =>
  fetchSpy.mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
const withDuration = (duration: string) => ({
  items: [{ contentDetails: { duration } }],
});
const requestedUrl = () => {
  const [input] = fetchSpy.mock.calls[0] as [RequestInfo | URL];
  return new URL(input instanceof Request ? input.url : String(input));
};

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("R3: fetchVideoDurationSeconds request", () => {
  test("GETs videos.list with part=contentDetails, the id and the server key", async () => {
    respond(withDuration("PT3M32S"));

    await fetchVideoDurationSeconds("dQw4w9WgXcQ");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = requestedUrl();
    expect(url.origin).toBe("https://www.googleapis.com");
    expect(url.pathname).toBe("/youtube/v3/videos");
    expect(url.searchParams.get("part")).toBe("contentDetails");
    expect(url.searchParams.get("id")).toBe("dQw4w9WgXcQ");
    expect(url.searchParams.get("key")).toBe("yt-key");
    const [, init] = fetchSpy.mock.calls[0] as [unknown, RequestInit?];
    expect((init?.method ?? "GET").toUpperCase()).toBe("GET");
  });
});

describe("R3: fetchVideoDurationSeconds result", () => {
  test.each([
    ["PT3M32S", 212],
    ["PT1M32S", 92],
    ["PT45S", 45],
    ["PT5S", 5],
    ["PT1H2M3S", 3723],
    ["PT10M", 600],
    ["P1DT1S", 86_401],
  ])("%s is %d seconds", async (duration, seconds) => {
    respond(withDuration(duration));

    expect(await fetchVideoDurationSeconds("v")).toBe(seconds);
  });

  test("a fractional length is floored", async () => {
    respond(withDuration("PT3M32.9S"));

    expect(await fetchVideoDurationSeconds("v")).toBe(212);
  });

  test("an empty items list answers null", async () => {
    respond({ items: [] });

    expect(await fetchVideoDurationSeconds("gone")).toBeNull();
  });

  test("a body with no items key answers null, like an empty list", async () => {
    respond({ kind: "youtube#videoListResponse" });

    expect(await fetchVideoDurationSeconds("gone")).toBeNull();
  });

  test("a zero length is 0, not a failure", async () => {
    respond(withDuration("P0D"));

    expect(await fetchVideoDurationSeconds("live")).toBe(0);
  });

  test("only the first item counts", async () => {
    respond({
      items: [
        { contentDetails: { duration: "PT1M" } },
        { contentDetails: { duration: "PT9M" } },
      ],
    });

    expect(await fetchVideoDurationSeconds("v")).toBe(60);
  });

  test("extra YouTube fields are ignored", async () => {
    respond({
      kind: "youtube#videoListResponse",
      etag: "x",
      items: [
        {
          kind: "youtube#video",
          id: "v",
          contentDetails: { duration: "PT2M", definition: "hd" },
        },
      ],
      pageInfo: { totalResults: 1 },
    });

    expect(await fetchVideoDurationSeconds("v")).toBe(120);
  });
});

describe("R3: fetchVideoDurationSeconds failures throw", () => {
  test("the request carries an abort signal, so a hung YouTube cannot hang the route", async () => {
    respond(withDuration("PT3M"));

    await fetchVideoDurationSeconds("v");

    const [, init] = fetchSpy.mock.calls[0] as [unknown, RequestInit?];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("a timeout throws", async () => {
    fetchSpy.mockRejectedValue(
      new DOMException("The operation timed out.", "TimeoutError"),
    );

    await expect(fetchVideoDurationSeconds("v")).rejects.toThrow();
  });

  test("a network error throws", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));

    await expect(fetchVideoDurationSeconds("v")).rejects.toThrow();
  });

  test.each([400, 403, 404, 500, 503])(
    "a %d response throws, even with a valid body",
    async (status) => {
      respond(withDuration("PT3M"), status);

      await expect(fetchVideoDurationSeconds("v")).rejects.toThrow();
    },
  );

  test("a body that is not JSON throws", async () => {
    respond("<html>oops</html>");

    await expect(fetchVideoDurationSeconds("v")).rejects.toThrow();
  });

  test.each([
    ["items is not a list", { items: "x" }],
    ["an item without contentDetails", { items: [{}] }],
    ["an item without a duration", { items: [{ contentDetails: {} }] }],
    ["a duration that is not a string", withDuration(212 as never)],
    ["a duration that is not ISO 8601", withDuration("3:32")],
    ["an empty duration", withDuration("")],
  ])("%s throws", async (_, body) => {
    respond(body);

    await expect(fetchVideoDurationSeconds("v")).rejects.toThrow();
  });
});

describe("R3: youTubeVideosResponseSchema", () => {
  test("accepts the documented shape, with every level optional", () => {
    for (const value of [
      {},
      { items: [] },
      { items: [{}] },
      { items: [{ contentDetails: {} }] },
      withDuration("PT1S"),
    ]) {
      expect(youTubeVideosResponseSchema.safeParse(value).success).toBe(true);
    }
  });

  test("rejects wrong types", () => {
    for (const value of [
      { items: "x" },
      { items: [{ contentDetails: "x" }] },
      withDuration(5 as never),
    ]) {
      expect(youTubeVideosResponseSchema.safeParse(value).success).toBe(false);
    }
  });
});
