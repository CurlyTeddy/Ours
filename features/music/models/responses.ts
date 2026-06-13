import z from "zod/v4";

interface SharedMusic {
  selectedById: string;
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  selectedBy: string | null;
  updatedAt: string;
}

interface MusicResponse {
  shared: SharedMusic[];
}

interface MusicSelectionResponse {
  music: SharedMusic;
}

interface MusicSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
}

interface MusicSearchResponse {
  results: MusicSearchResult[];
}

const youTubeSearchItemSchema = z.object({
  id: z
    .object({
      videoId: z.string().optional(),
    })
    .optional(),
  snippet: z
    .object({
      title: z.string().optional(),
      channelTitle: z.string().optional(),
      thumbnails: z
        .object({
          high: z.object({ url: z.string().optional() }).optional(),
          medium: z.object({ url: z.string().optional() }).optional(),
          default: z.object({ url: z.string().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
});

const youTubeSearchResponseSchema = z.object({
  items: z.array(youTubeSearchItemSchema).optional(),
  error: z
    .object({
      message: z.string().optional(),
      errors: z
        .array(
          z.object({
            reason: z.string().optional(),
            message: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export type {
  SharedMusic,
  MusicResponse,
  MusicSelectionResponse,
  MusicSearchResult,
  MusicSearchResponse,
};

export { youTubeSearchItemSchema, youTubeSearchResponseSchema };
