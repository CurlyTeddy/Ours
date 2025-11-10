import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https" as const,
        hostname: "pub-*.r2.dev",
      },
      {
        protocol: "https" as const,
        hostname: "*curlyteddy.com",
      },
      {
        protocol: "https" as const,
        hostname: "*r2.cloudflarestorage.com",
      },
    ],
  },
  serverExternalPackages: ["@prisma/adapter-libsql"],
};

export default nextConfig;
