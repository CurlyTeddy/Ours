import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { env } from "@/lib/env";
import { createClient } from "redis";

const globalDbClient = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  redis: ReturnType<typeof createClient> | undefined;
};

const prisma =
  globalDbClient.prisma ??
  new PrismaClient({
    adapter: new PrismaLibSQL({
      url: env.LIBSQL_DATABASE_URL,
      authToken: env.LIBSQL_DATABASE_TOKEN,
    }),
  });

const redis =
  globalDbClient.redis ??
  // Without an error listener node-redis throws on any error and kills the process.
  createClient({ url: env.REDIS_URL }).on("error", (error) => {
    console.error("Redis error:", error);
  });
if (!redis.isOpen) {
  // Not awaited: Redis is only a cache, so its outage must not block startup.
  redis.connect().catch((error: unknown) => {
    console.error("Redis connect failed:", error);
  });
}

if (env.NEXT_PUBLIC_ENVIRONMENT !== "prod") {
  globalDbClient.prisma = prisma;
  globalDbClient.redis = redis;
}

export { prisma, redis };
