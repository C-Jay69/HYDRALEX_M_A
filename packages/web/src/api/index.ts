import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth";
import { analyses } from "./routes/analyses";
import { admin } from "./routes/admin";

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
  .get("/health", (c) => c.json({ status: "ok" }, 200))
  .route("/analyses", analyses)
  .route("/admin", admin);

export type AppType = typeof app;
export default app;
