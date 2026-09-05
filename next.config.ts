import type { NextConfig } from "next";

// CSP started from a pragmatic App-Router baseline (Next injects inline
// hydration/RSC-streaming <script> tags without a nonce-based setup, so
// script-src needs 'unsafe-inline' here) and then verified live: dev server
// run end-to-end across public + admin pages with the browser console
// checked for CSP violation reports. One real violation showed up —
// React's OWN development-mode debugging tooling (stack-trace
// reconstruction) calls eval(), and says so explicitly in the console
// message it produces ("React will never use eval() in production mode").
// So 'unsafe-eval' is added ONLY in development, never in the production
// policy actually served to real traffic — not a blanket "make the error
// go away" addition. See the Phase 5 report for what was tested.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://plausible.io${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://plausible.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: CSP },
];

const nextConfig: NextConfig = {
  images: {
    // Narrow allowlist: only our own object stores get real next/image
    // optimization — Vercel Blob (STORAGE_PROVIDER=vercel-blob) and
    // Cloudflare R2's public subdomain (STORAGE_PROVIDER=r2). Every other
    // external URL (RSS-sourced images, an editor-pasted URL) is handled
    // safely via lib/image-src.ts's isOptimizableImageSrc, which falls back
    // to `unoptimized` instead of crashing the page — never add a bare "*"
    // hostname here.
    //
    // Keep this in step with isOptimizableImageSrc: the two encode the same
    // allowlist, and a host trusted in one but not the other either crashes
    // the page or silently skips optimization.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "*.r2.dev" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
