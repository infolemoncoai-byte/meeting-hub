import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow the login page + endpoint, and Next static assets.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Allow script/automation clients to hit API endpoints without a browser cookie.
  // This avoids issues with `Secure` cookies when the service is served over plain HTTP.
  // Note: UI routes are still protected by the session cookie.
  const client = (req.headers.get("x-meeting-hub-client") || "").toLowerCase();
  if (client === "script" && pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("meeting_hub");
  if (!cookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
