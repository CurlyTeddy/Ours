import { env } from "@/lib/env";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { redis } from "@/lib/database-client";

const globalS3 = globalThis as unknown as {
  s3Client: S3Client | undefined;
};

const s3Client =
  globalS3.s3Client ??
  new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

if (env.NEXT_PUBLIC_ENVIRONMENT !== "prod") {
  globalS3.s3Client = s3Client;
}

const bucket = `images-${env.NEXT_PUBLIC_ENVIRONMENT}`;
const signedUrlSeconds = 300;

// Cached so repeat loads get the same URL, which lets browsers and next/image reuse the image.
async function getCachedSignedUrl(key: string): Promise<string> {
  const sign = () =>
    getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: signedUrlSeconds,
    });

  // Commands sent while disconnected wait in the offline queue, so skip the cache instead.
  if (!redis.isReady) {
    return sign();
  }

  const cacheKey = `presigned:${key}`;

  const cachedUrl = await redis.get(cacheKey);
  if (cachedUrl !== null) {
    return cachedUrl;
  }

  const signedUrl = await sign();

  // Half the lifetime, so every URL served from cache still has at least half left
  await redis.setEx(cacheKey, signedUrlSeconds / 2, signedUrl);

  return signedUrl;
}

export { bucket, getCachedSignedUrl };

export default s3Client;
