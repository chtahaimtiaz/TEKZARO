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
    // No image host is configured yet (STORAGE_BUCKET is empty) — add
    // remotePatterns here once a licensed media library/CDN is connected.
    remotePatterns: [],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
