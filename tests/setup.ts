import "dotenv/config";
import { vi } from "vitest";

// The real `server-only` package throws unconditionally under Vite/vitest's
// module resolution (Next's bundler is what normally swaps in a harmless
// stub for genuine server code) — neutralize it so server-only-marked lib
// modules can be imported directly in tests.
vi.mock("server-only", () => ({}));

// In-memory stand-in for the request-scoped cookie jar `next/headers`
// normally provides — real `cookies()` only works inside a Next.js request,
// not a plain vitest process, so tests control it directly via
// `mockCookieStore` (see tests/helpers.ts).
export const mockCookieStore = new Map<string, string>();

// Same idea as mockCookieStore, for code (lib/rate-limit.ts's getClientIp)
// that reads request headers via next/headers's headers() — real headers()
// only works inside a Next.js request too. Cleared between tests that use
// it via tests/helpers.ts's setMockHeader/clearMockHeaders.
export const mockHeadersStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (mockCookieStore.has(name) ? { name, value: mockCookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => {
      mockCookieStore.set(name, value);
    },
    delete: (name: string) => {
      mockCookieStore.delete(name);
    },
  }),
  headers: async () => ({
    get: (name: string) => mockHeadersStore.get(name.toLowerCase()) ?? null,
  }),
}));

// Server Actions call redirect()/notFound() from next/navigation, which
// throw special control-flow errors outside a real Next.js request — make
// them throw a recognizable, catchable error instead so tests can assert on
// "redirected" behavior without a running Next server.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    throw err;
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
