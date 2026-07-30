import { test, expect } from "bun:test";
import { Hono } from "hono";
import { rateLimit } from "./ratelimit.js";

function makeApp(max: number) {
  const app = new Hono();
  app.use("*", rateLimit({ windowMs: 1000, max, errorMessage: "slow down" }));
  app.get("/*", (c) => c.json({ ok: true }));
  return app;
}

test("rate limit allows up to the cap then returns 429", async () => {
  const app = makeApp(2);
  expect((await app.request("/ping")).status).toBe(200);
  expect((await app.request("/ping")).status).toBe(200);
  const blocked = await app.request("/ping");
  expect(blocked.status).toBe(429);
  const body = (await blocked.json()) as { error: string };
  expect(body.error).toBe("slow down");
  expect(blocked.headers.get("Retry-After")).toBeTruthy();
});

test("separate paths have independent buckets", async () => {
  const app = makeApp(1);
  expect((await app.request("/a")).status).toBe(200);
  expect((await app.request("/b")).status).toBe(200);
  expect((await app.request("/a")).status).toBe(429);
});
