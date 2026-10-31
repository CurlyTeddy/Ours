import { z } from "zod/v4";

// Client-safe on purpose: the signing half, presignImagePut, lives in lib/s3-client.ts.
const maxImageBytes = 5 * 1024 * 1024;

const uploadImageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const imageUploadSchema = z.object({
  size: z
    .number()
    .int()
    .min(1)
    .max(maxImageBytes, "Images must be 5 MB or smaller"),
  type: z.enum(uploadImageTypes, {
    error: "Only JPEG, PNG, WebP or GIF images can be uploaded",
  }),
});

type ImageUpload = z.infer<typeof imageUploadSchema>;

export { imageUploadSchema, maxImageBytes, uploadImageTypes };
export type { ImageUpload };
