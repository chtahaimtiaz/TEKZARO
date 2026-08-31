import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";

// Proxy always runs on the Node.js runtime (unlike the old Edge-first
// middleware convention), so it can reach Postgres directly here — the same
// session check every Server Action independently re-runs, done here first
// so anonymous visitors never even start rendering an admin page.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Both are reachable by a signed-out visitor by design: login obviously,
  // and set-password because it establishes identity via a single-use
  // emailed token (lib/password-reset.ts), not a session cookie — a user
  // who has never logged in before (a fresh invite) has no session yet.
  if (pathname === "/admin/login" || pathname === "/admin/set-password") {
    return NextResponse.next();
  }

  const user = await getSessionUser();
  if (!user) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
