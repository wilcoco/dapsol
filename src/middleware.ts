import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Routes that require authentication
const PROTECTED_API_ROUTES = [
  "/api/chat",
  "/api/qa-sets",
  "/api/investments",
  "/api/opinions",
  "/api/notifications",
  "/api/clusters/generate",
  "/api/hits/recalculate",
  "/api/onboarding",
  "/api/contributions",
  "/api/admin",
];

// Routes that are always public
const PUBLIC_ROUTES = [
  "/api/auth",
  "/api/health",
  "/api/debug",
  "/api/graph",
  "/api/clusters",
  "/api/leaderboard",
  "/api/tags",
  "/api/decay",
  "/api/cron",
  "/api/activity-feed",
  "/login",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Skip public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check protected API routes
  if (pathname.startsWith("/api/")) {
    const isProtected = PROTECTED_API_ROUTES.some((route) => pathname.startsWith(route));
    if (isProtected && !req.auth) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
  }

  // Add security headers
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
});

export const config = {
  matcher: [
    // Match all routes except static files and _next
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
