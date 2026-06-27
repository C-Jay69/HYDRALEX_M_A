import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth";
import { analyses } from "./routes/analyses";
import { admin } from "./routes/admin";
import { authMiddleware, requireAuth } from "./middleware/auth";
import { db } from "./database";
import { userMeta } from "./database/schema";
import { eq } from "drizzle-orm";

const app = new Hono()
  .use(
    cors({
      origin: (origin) => origin ?? "*",
      credentials: true,
      exposeHeaders: ["set-auth-token"],
    })
  )
  .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  .basePath("api")
  .get("/health", (c) => c.json({ status: "ok", ts: Date.now() }, 200))
  // Current user profile + isAdmin flag
  .get("/me", authMiddleware, requireAuth, async (c) => {
    const user = c.get("user") as any;
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
