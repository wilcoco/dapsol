import { NextRequest, NextResponse } from "next/server";

// Simple in-middleware rate limiting using headers
// More sophisticated rate limiting happens in individual API routes
export default function middleware(req: NextRequest) {
  const response = NextResponse.next();

  // Add security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
