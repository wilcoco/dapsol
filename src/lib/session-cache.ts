/**
 * Simple TTL cache for session user data.
 * Reduces DB queries in the NextAuth session callback.
 *
 * On balance changes (invest, uninvest, share), call invalidate(userId).
 */

interface CachedUserData {
  balance: number;
  hubScore: number;
  authorityScore: number;
  trustLevel: number;
  onboardingCompleted: boolean;
  cachedAt: number;
}

const cache = new Map<string, CachedUserData>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SIZE = 1000;

export function get(userId: string): CachedUserData | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    cache.delete(userId);
    return null;
  }
  return entry;
}

export function set(userId: string, data: Omit<CachedUserData, "cachedAt">): void {
  // Evict oldest if at capacity
  if (cache.size >= MAX_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(userId, { ...data, cachedAt: Date.now() });
}

export function invalidate(userId: string): void {
  cache.delete(userId);
}
