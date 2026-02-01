import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow larger uploads when using Next.js proxy/middleware conventions.
    // Default is 10MB which breaks `.m4a` uploads.
    proxyClientMaxBodySize: "250mb",

    // Lift Server Actions body limit just in case any future UI uses them.
    serverActions: {
      bodySizeLimit: "250mb",
    },
  },
};

export default nextConfig;
