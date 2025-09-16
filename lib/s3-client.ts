import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

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

export default s3Client;
