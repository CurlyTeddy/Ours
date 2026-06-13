import z from "zod/v4";

const musicSelectionRequestSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().min(1),
  channelTitle: z.string().min(1),
  thumbnailUrl: z.url(),
});

export { musicSelectionRequestSchema };
