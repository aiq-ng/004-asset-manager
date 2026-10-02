import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // BullMQ and ioredis are long-lived connection pools rather than
  // bundleable libraries; bundling them breaks their dynamic requires.
  serverExternalPackages: ["bullmq", "ioredis"],
  experimental: {
    // Enables `forbidden()`, so a page whose whole route is off-limits renders a
    // real 403 instead of an empty shell. The API already answers 403 through
    // `permissionRoute`; this closes the same gap on the pages.
    authInterrupts: true,
  },
};

export default nextConfig;
