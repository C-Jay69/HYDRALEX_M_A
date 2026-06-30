import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import app from "./index";

const port = Number(process.env.PORT) || 3000;

// dist/ is built to packages/web/dist/
// server runs from packages/web/ as cwd (set in nixpacks + Dockerfile WORKDIR)
const server = new Hono()
  // API routes first
  .route("/", app)
  // Static assets from Vite build
  .use("/assets/*", serveStatic({ root: "./dist" }))
  .use("/logo.png", serveStatic({ root: "./dist" }))
  .use("/favicon.ico", serveStatic({ root: "./dist" }))
  .use("/favicon.png", serveStatic({ root: "./dist" }))
  .use("/runable.js", serveStatic({ root: "./dist" }))
  .use("/og-image.png", serveStatic({ root: "./dist" }))
  // SPA fallback — all non-API routes serve index.html
  .get("*", serveStatic({ path: "./dist/index.html" }));

console.log(`HydraForge server starting on port ${port}`);
console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? "set" : "MISSING"}`);
console.log(`DATABASE_AUTH_TOKEN: ${process.env.DATABASE_AUTH_TOKEN ? "set" : "not set (ok for local)"}`);
console.log(`OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? "set" : "MISSING"}`);
console.log(`FRONTEND_URL: ${process.env.FRONTEND_URL || "not set (defaulting to localhost)"}`);

serve({
  fetch: server.fetch,
  port,
});
