import { S3Client } from "@aws-sdk/client-s3";

const globalS3 = globalThis as unknown as {
  s3Client: S3Client | undefined;
};

if (
  !process.env.R2_ENDPOINT ||
  !process.env.R2_ACCESS_KEY ||
  !process.env.R2_SECRET_ACCESS_KEY
) {
  throw new Error("R2 environment variables are not set.");
}

const s3Client =
  globalS3.s3Client ??
  new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
if (process.env.NODE_ENV !== "production") {
  globalS3.s3Client = s3Client;
}

export default s3Client;
