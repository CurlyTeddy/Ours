import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { env } from "@/lib/env";

const globalPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaLibSQL({
  url: env.LIBSQL_DATABASE_URL,
  authToken: env.LIBSQL_DATABASE_TOKEN,
});

const prisma = globalPrisma.prisma ?? new PrismaClient({ adapter });
if (env.NEXT_PUBLIC_ENVIRONMENT !== "prod") {
  globalPrisma.prisma = prisma;
}

export default prisma;
