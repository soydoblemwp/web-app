/**
 * In-process sliding-window rate limiter. Sufficient for a single Vercel
 * function instance / low-cost stage. If the app scales to multiple
 * concurrent instances, replace the store with a shared backend (e.g. Redis /
 * Upstash) behind this same `checkRateLimit` signature — callers don't change.
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: windowMs - (now - bucket.windowStart),
    };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterMs: 0 };
}

// Periodically forget stale buckets so this doesn't grow unbounded in a long-lived process.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.windowStart > 10 * 60_000) buckets.delete(key);
  }
}, 5 * 60_000).unref?.();
