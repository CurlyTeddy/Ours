import { Duration } from "luxon";
import { env } from "@/lib/env";
import { youTubeVideosResponseSchema } from "@/features/music/models/responses";

// The video's length in whole seconds, or null when YouTube no longer has it.
async function fetchVideoDurationSeconds(
  videoId: string,
): Promise<number | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", env.YOUTUBE_DATA_API_KEY);

  // A hung YouTube answer must not hold the save; the abort throws, which callers answer as 502.
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`YouTube videos.list answered ${response.status}`);
  }

  const { items = [] } = youTubeVideosResponseSchema.parse(
    await response.json(),
  );
  if (items.length === 0) {
    return null;
  }

  const duration = Duration.fromISO(items[0].contentDetails?.duration ?? "");
  if (!duration.isValid) {
    throw new Error(`YouTube video ${videoId} has no parsable duration`);
  }
  return Math.floor(duration.as("seconds"));
}

export { fetchVideoDurationSeconds };
