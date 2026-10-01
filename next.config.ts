import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // BullMQ and ioredis are long-lived connection pools rather than
  // bundleable libraries; bundling them breaks their dynamic requires.
  serverExternalPackages: ["bullmq", "ioredis"],
};

export default nextConfig;
