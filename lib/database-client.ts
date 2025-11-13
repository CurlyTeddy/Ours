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
  (await createClient({ url: env.REDIS_URL }).connect());

if (env.NEXT_PUBLIC_ENVIRONMENT !== "prod") {
  globalDbClient.prisma = prisma;
  globalDbClient.redis = redis;
}

export { prisma, redis };
