import { NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export const RATE_LIMITS = {
  chat: { windowMs: 60_000, maxRequests: 5 },      // 5/min
  api: { windowMs: 60_000, maxRequests: 30 },       // 30/min
  invest: { windowMs: 60_000, maxRequests: 10 },    // 10/min
  search: { windowMs: 60_000, maxRequests: 20 },    // 20/min
} as const;

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = identifier;
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  entry.count++;
  if (entry.count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

export function rateLimitResponse(resetAt: number): NextResponse {
  return NextResponse.json(
    { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
        "X-RateLimit-Reset": String(resetAt),
      },
    }
  );
}
