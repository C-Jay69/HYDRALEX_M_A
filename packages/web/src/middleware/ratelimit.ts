/**
 * ratelimit.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * In-memory fixed-window rate limiting middleware for the Hono API.
 *
 * Keyed by authenticated user id (falls back to client IP). Limits are
 * configurable per tier via environment variables.
 *
 * NOTE: this uses an in-process Map, so it is correct for a single-instance
 * deployment. For multi-instance / serverless scaling, back this with Redis or
 * a shared store (e.g. Upstash Ratelimit) — the factory signature would be
 * unchanged.
 */

import type { Context, MiddlewareHandler, Next } from "hono";

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  keyFrom?: (c: Context) => string;
  errorMessage?: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Build a stable key for a request: authenticated user id, else client IP. */
export function keyByUser(c: Context): string {
  const user = c.get("user") as { id?: string } | null;
  if (user?.id) return `u:${user.id}`;
  const fwd = c.req.header("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0].trim() : "") || c.req.header("x-real-ip") || "anon";
  return `ip:${ip}`;
}

export function rateLimit(opts: RateLimitOptions = {}): MiddlewareHandler {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 60;
  const keyFrom = opts.keyFrom ?? keyByUser;
  const errorMessage = opts.errorMessage ?? "Rate limit exceeded. Please slow down and try again shortly.";

  return async (c: Context, next: Next) => {
    const key = `${c.req.path}:${keyFrom(c)}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count++;

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(max));
      c.header("X-RateLimit-Remaining", "0");
      return c.json({ error: errorMessage, retryAfter }, 429);
    }

    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    await next();
  };
}

// ── Environment-configured tiers ──────────────────────────────────────────────
const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const GENERAL_PER_MIN = num(process.env.RATE_LIMIT_GENERAL_PER_MIN, 60);
export const AUTH_PER_MIN = num(process.env.RATE_LIMIT_AUTH_PER_MIN, 10);
export const ANALYSIS_PER_MIN = num(process.env.RATE_LIMIT_ANALYSIS_PER_MIN, 5);
