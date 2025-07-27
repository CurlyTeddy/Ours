import z from "zod/v4";

const envSchema = z.object({
  environment: z.enum(["dev", "prod"]),
  r2PublicEndpoint: z.url(),
});

const parsedEnv = envSchema.safeParse({
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT,
  r2PublicEndpoint: process.env.NEXT_PUBLIC_R2_ENDPOINT,
});

if (!parsedEnv.success) {
  console.error("Missing environment variables");
  process.exit(1);
}

export const env = parsedEnv.data;
