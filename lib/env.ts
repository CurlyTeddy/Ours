import z from "zod/v4";
import { createEnv } from "@t3-oss/env-nextjs";

export const env = createEnv({
  server: {
    R2_ENDPOINT: z.url(),
    R2_ACCESS_KEY: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    LIBSQL_DATABASE_URL: z.string().min(1),
    LIBSQL_DATABASE_TOKEN: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_ENVIRONMENT: z.enum(["dev", "prod"]),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT,
  },
});
