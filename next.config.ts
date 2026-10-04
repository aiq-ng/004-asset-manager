import type { NextConfig } from "next";

import { IMAGE_UPLOAD_MAX_BYTES } from "./src/lib/config";

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
    serverActions: {
      // Next defaults this to 1MB, which is below the image cap the upload forms
      // advertise — so every photo over 1MB was refused by the framework with a
      // raw body-size error, before `parseUploadedImage` could answer for it in
      // the form's own words.
      //
      // It has to sit *above* `IMAGE_UPLOAD_MAX_BYTES`, not equal it: the limit
      // covers the whole raw request, and the `multipart/form-data` envelope —
      // boundaries, part headers, the other fields — counts toward the same
      // total. Next documents 10–20KB as typical for that overhead; 256KB leaves
      // roughly ten times that, so a maximum-size image still gets through.
      //
      // Derived from the constant rather than written as "6mb" so the transport
      // limit and the cap the UI promises cannot drift apart again.
      bodySizeLimit: IMAGE_UPLOAD_MAX_BYTES + 256 * 1024,
    },
  },
};

export default nextConfig;
