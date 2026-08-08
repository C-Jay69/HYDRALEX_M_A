#!/usr/bin/env bun
/**
 * make-admin.ts
 * Ensures admin@hydraforge.tech is an admin user
 *
 * Usage from packages/web/:
 *   bun --env-file=../../.env scripts/make-admin.ts
 */

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { user, userMeta } from "../database/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set. Pass --env-file=../../.env");
  process.exit(1);
}

const client = createClient({ url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN });
const db = drizzle(client);

const adminEmail = "admin@hydraforge.tech";

console.log(`\n🔍 Looking up user: ${adminEmail}`);

// First check if user exists
const [found] = await db
  .select({ id: user.id, name: user.name, email: user.email })
  .from(user)
  .where(eq(user.email, adminEmail))
  .limit(1);

if (!found) {
  console.error(`❌ No user found with email "${adminEmail}".`);
  console.log(`   User must register first at: http://localhost:5173/sign-up`);
  process.exit(1);
}

console.log(`✅ Found: ${found.name} (id=${found.id})`);

// Check current admin status
const [meta] = await db
  .select({ isAdmin: userMeta.isAdmin })
  .from(userMeta)
  .where(eq(userMeta.userId, found.id))
  .limit(1);

if (meta?.isAdmin) {
  console.log(`✅ ${adminEmail} is already an admin!`);
  process.exit(0);
}

// Make user admin
console.log(`👑 Promoting ${adminEmail} to admin...`);

await db
  .insert(userMeta)
  .values({ 
    userId: found.id, 
    isAdmin: true, 
    docsUsedThisMonth: 0,
    plan: "enterprise" 
  })
  .onConflictDoUpdate({
    target: userMeta.userId,
    set: { isAdmin: true, plan: "enterprise", docsUsedThisMonth: 0 },
  });

console.log(`✅ ${adminEmail} is now an admin with enterprise plan!\n`);
process.exit(0);
