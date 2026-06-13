import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { env } from "@/lib/env";
import { HttpErrorPayload } from "@/lib/error";
import {
  MusicSearchResponse,
  youTubeSearchResponseSchema,
} from "@/features/music/models/responses";

const searchParamsSchema = z.object({
  q: z.string().trim().min(1).max(120),
});

async function GET(
  request: NextRequest,
): Promise<NextResponse<MusicSearchResponse | HttpErrorPayload>> {
  const parsedSearch = searchParamsSchema.safeParse({
    q: request.nextUrl.searchParams.get("q"),
  });

  if (!parsedSearch.success) {
    return NextResponse.json(
      { message: "Search query is required." },
      { status: 400 },
    );
  }

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoEmbeddable", "true");
  searchUrl.searchParams.set("videoCategoryId", "10");
  searchUrl.searchParams.set("maxResults", "6");
  searchUrl.searchParams.set("q", parsedSearch.data.q);
  searchUrl.searchParams.set("key", env.YOUTUBE_DATA_API_KEY);

  try {
    const response = await fetch(searchUrl);
    const payload = youTubeSearchResponseSchema.parse(await response.json());

    if (!response.ok) {
      const reason = payload.error?.errors?.[0]?.reason;
      const message = payload.error?.message ?? "Failed to search YouTube.";
      console.error("YouTube search failed:", { reason, message });

      return NextResponse.json(
        {
          message:
            reason === "accessNotConfigured"
              ? "YouTube Data API is not enabled for this API key."
              : message,
        },
        { status: 502 },
      );
    }

    const results =
      payload.items
        ?.map((item) => {
          const videoId = item.id?.videoId;
          const title = item.snippet?.title;
          const channelTitle = item.snippet?.channelTitle;
          const thumbnailUrl =
            item.snippet?.thumbnails?.high?.url ??
            item.snippet?.thumbnails?.medium?.url ??
            item.snippet?.thumbnails?.default?.url;

          if (!videoId || !title || !channelTitle || !thumbnailUrl) {
            return null;
          }

          return {
            videoId,
            title,
            channelTitle,
            thumbnailUrl,
          };
        })
        .filter((result) => result !== null) ?? [];

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error searching YouTube:", error);
    return NextResponse.json(
      { message: "Failed to search YouTube." },
      { status: 500 },
    );
  }
}

export { GET };
