import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-*.r2.dev",
        pathname: "/two-do/**",
      },
    ],
  },
  serverExternalPackages: ["@prisma/adapter-libsql"],
};

export default nextConfig;
