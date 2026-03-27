import { env } from "@/lib/env";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { redis } from "@/lib/database-client";
import { RequestPresigningArguments } from "@smithy/types";

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

/**
 * @summary Wrapper around AWS SDK's getSignedUrl that caches results in Redis.
 *
 * @description If no expired time is provided in options, default cached time is 5 minutes.
 *
 * @param client - S3 client instance
 * @param command - S3 command (GetObjectCommand or PutObjectCommand)
 * @param options - Options including expiresIn (in seconds)
 * @returns Promise resolving to signed URL
 *
 * @example
 * ```typescript
 * const url = await getCachedSignedUrl(
 *   s3Client,
 *   new GetObjectCommand({
 *     Bucket: 'my-bucket',
 *     Key: 'path/to/file.jpg'
 *   }),
 *   { expiresIn: 300 }
 * );
 * ```
 */
async function getCachedSignedUrl(
  client: S3Client,
  command: GetObjectCommand,
  options: RequestPresigningArguments = { expiresIn: 300 },
): Promise<string> {
  const expireTime = options.expiresIn;
  if (expireTime === undefined || expireTime < 60) {
    throw RangeError("Expire time needs to be at least 60 seconds.");
  }

  const cacheKey = `presigned:${command.input.Key}`;

  const cachedUrl = await redis.get(cacheKey);
  if (cachedUrl !== null) {
    return cachedUrl;
  }

  const signedUrl = await getSignedUrl(client, command, options);

  // Cache with TTL (use slightly shorter TTL than expiresIn to be safe)
  await redis.setEx(cacheKey, expireTime - 10, signedUrl);

  return signedUrl;
}

export { getCachedSignedUrl };

export default s3Client;
