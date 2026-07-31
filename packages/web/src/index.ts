import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth.js";
import { analyses } from "./routes/analyses.js";
import { admin } from "./routes/admin.js";
import { authMiddleware, requireAuth } from "./middleware/auth.js";
import { rateLimit, keyByUser, GENERAL_PER_MIN, AUTH_PER_MIN, ANALYSIS_PER_MIN } from "./middleware/ratelimit.js";
import { db } from "./database.js";
import { userMeta } from "./database/schema.js";
import { eq } from "drizzle-orm";

const app = new Hono()
  .use(
    cors({
      origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ],
      credentials: true,
      exposeHeaders: ["set-auth-token"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    })
  )
  // Global rate limit: 60 requests/min per user (or IP) across all API routes.
  .use("*", rateLimit({ windowMs: 60_000, max: GENERAL_PER_MIN }))
  // Stricter limit on auth endpoints to blunt credential-stuffing / brute force.
  .use("/api/auth/*", rateLimit({ windowMs: 60_000, max: AUTH_PER_MIN, errorMessage: "Too many authentication attempts. Please wait a minute." }))
  // Analysis creation is the most expensive operation — tighten further.
  .use("/api/analyses", rateLimit({ windowMs: 60_000, max: ANALYSIS_PER_MIN, keyFrom: (c) => `${keyByUser(c)}:analysis`, errorMessage: "Analysis rate limit reached. Please wait before submitting another document." }))
  .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  .basePath("api")
  .get("/health", (c) => c.json({ status: "ok", ts: Date.now() }, 200))
  // Current user profile + isAdmin flag
  .get("/me", authMiddleware, requireAuth, async (c) => {
    const user = (c as any).get("user") as any;
    const [meta] = await db.select().from(userMeta).where(eq(userMeta.userId, user.id)).limit(1);
    return c.json({
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: meta?.isAdmin ?? false,
    }, 200);
  })
  .route("/analyses", analyses)
  .route("/admin", admin);

export type AppType = typeof app;
export default app;