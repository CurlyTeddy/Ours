import type { NextConfig } from "next";
import { env } from "@/lib/env";

const getRemotePatterns = () => {
  if (env.NEXT_PUBLIC_ENVIRONMENT === "dev") {
    return [
      {
        protocol: "https" as const,
        hostname: "pub-*.r2.dev",
      },
    ];
  }

  return [
    {
      protocol: "https" as const,
      hostname: "*curlyteddy.com",
    },
  ];
};

const nextConfig: NextConfig = {
  images: {
    remotePatterns: getRemotePatterns(),
  },
  serverExternalPackages: ["@prisma/adapter-libsql"],
};

export default nextConfig;
