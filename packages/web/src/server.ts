import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import path from "path";
import app from "./index";

const port = Number(process.env.PORT) || 3000;

// Resolve dist/ relative to this file's location (packages/web/src/ → packages/web/dist/)
const distDir = path.resolve(import.meta.dirname, "../dist");

// In production, wrap the API app with static file serving for the React build
const server = new Hono()
  // API routes first
  .route("/", app)
  // Serve static assets from Vite build output
  .use(
    "/assets/*",
    serveStatic({ root: path.relative(process.cwd(), distDir) })
  )
  .use(
    "/logo.png",
    serveStatic({ root: path.relative(process.cwd(), distDir) })
  )
  .use(
    "/favicon.ico",
    serveStatic({ root: path.relative(process.cwd(), distDir) })
  )
  .use(
    "/runable.js",
    serveStatic({ root: path.relative(process.cwd(), distDir) })
  )
  // SPA fallback — all non-API routes serve index.html
  .get(
    "*",
    serveStatic({
      path: path.relative(process.cwd(), path.join(distDir, "index.html")),
    })
  );

console.log(`HydraForge server running on http://localhost:${port}`);
console.log(`Serving static files from: ${distDir}`);

serve({
  fetch: server.fetch,
  port,
});
