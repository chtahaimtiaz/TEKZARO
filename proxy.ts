import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";

// Proxy always runs on the Node.js runtime (unlike the old Edge-first
// middleware convention), so it can reach Postgres directly here — the same
// session check every Server Action independently re-runs, done here first
// so anonymous visitors never even start rendering an admin page.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
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
