import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // No image host is configured yet (STORAGE_BUCKET is empty) — add
    // remotePatterns here once a licensed media library/CDN is connected.
    remotePatterns: [],
  },
};

export default nextConfig;
