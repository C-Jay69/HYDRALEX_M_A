import type { Context, Next } from "hono";
import { auth } from "../auth";

/**
 * Populates c.get("user") from Bearer token or cookie session.
 * Does NOT block unauthenticated requests — use requireAuth for that.
 */
export async function authMiddleware(c: Context, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  return next();
}

/**
 * Blocks unauthenticated requests with 401.
 * Chain after authMiddleware.
 */
export async function requireAuth(c: Context, next: Next) {
  const user = c.get("user");
  if (!user) return c.json({ message: "Unauthorized" }, 401);
  return next();
}
