import z from "zod/v4";
import { createEnv } from "@t3-oss/env-nextjs";

export const env = createEnv({
  server: {
    R2_ENDPOINT: z.url(),
    DATABASE_URL: z.string().min(1),
    R2_ACCESS_KEY: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    TURSO_AUTH_TOKEN: z
      .string()
      .refine(
        (token) =>
          process.env.NEXT_PUBLIC_ENVIRONMENT === "dev" || token.length > 0,
      ),
  },
  client: {
    NEXT_PUBLIC_ENVIRONMENT: z.enum(["dev", "prod"]),
    NEXT_PUBLIC_R2_ENDPOINT: z.url(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT,
    NEXT_PUBLIC_R2_ENDPOINT: process.env.NEXT_PUBLIC_R2_ENDPOINT,
  },
});
