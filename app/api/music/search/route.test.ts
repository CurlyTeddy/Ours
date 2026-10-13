import { afterEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/music/search/route";

vi.mock("@/lib/env", () => ({ env: { YOUTUBE_DATA_API_KEY: "key" } }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/music/search", () => {
  test("decodes HTML entities in titles once", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            items: [
              {
                id: { videoId: "v1" },
                snippet: {
                  title: "Don&#39;t Stop &quot;Me&quot; &amp;lt;3",
                  channelTitle: "Simon &amp; Garfunkel",
                  thumbnails: { high: { url: "https://i.ytimg.com/v1.jpg" } },
                },
              },
            ],
          }),
        ),
      ),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/music/search?q=queen"),
    );
    const { results } = (await response.json()) as {
      results: { title: string; channelTitle: string }[];
    };

    expect(results[0].title).toBe('Don\'t Stop "Me" &lt;3');
    expect(results[0].channelTitle).toBe("Simon & Garfunkel");
  });
});
