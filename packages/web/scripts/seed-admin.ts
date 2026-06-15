#!/usr/bin/env bun
/**
 * seed-admin.ts
 *
 * Promotes a registered user to admin by upserting their user_meta row.
 *
 * Usage (from packages/web/):
 *   bun --env-file=../../.env scripts/seed-admin.ts admin@hydraforge.com
 *
 * The user MUST already be registered before running this.
 */

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";

// ── Schema inline (avoids circular imports) ─────────────────────────────────

const authUser = sqliteTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
});

const userMeta = sqliteTable("user_meta", {
  userId: text("user_id").primaryKey(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  docsUsedThisMonth: integer("docs_used_this_month").notNull().default(0),
});

// ── DB ───────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN;

if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL not set. Pass --env-file=.env");
  process.exit(1);
}

const client = createClient({ url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN });
const db = drizzle(client);

// ── Main ─────────────────────────────────────────────────────────────────────

const email = process.argv[2]?.trim();

if (!email) {
  console.error("Usage: bun --env-file=../../.env scripts/seed-admin.ts <email>");
  process.exit(1);
}

console.log(`\n🔍  Looking up user: ${email}`);

const [found] = await db
  .select({ id: authUser.id, name: authUser.name })
  .from(authUser)
  .where(eq(authUser.email, email))
  .limit(1);

if (!found) {
  console.error(`❌  No user found with email "${email}". Register first, then re-run.`);
  process.exit(1);
}

console.log(`✅  Found: ${found.name} (id=${found.id})`);

await db
  .insert(userMeta)
  .values({ userId: found.id, isAdmin: true, docsUsedThisMonth: 0 })
  .onConflictDoUpdate({
    target: userMeta.userId,
    set: { isAdmin: true },
  });

console.log(`🛡️   ${email} is now an admin.\n`);
process.exit(0);
