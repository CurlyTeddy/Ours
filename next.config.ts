import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https" as const,
        hostname: "*r2.cloudflarestorage.com",
      },
      {
        protocol: "https" as const,
        hostname: "i.ytimg.com",
      },
    ],
  },
  serverExternalPackages: ["@prisma/adapter-libsql"],
};

export default nextConfig;
