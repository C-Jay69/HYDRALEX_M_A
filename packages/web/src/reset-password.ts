#!/usr/bin/env bun
/**
 * reset-password.ts
 *
 * Resets the password for a Better Auth user directly in the DB using
 * Better Auth's own password hasher (so the hash format matches signIn).
 *
 * Usage (from packages/web/):
 *   bun --env-file=../../.env src/reset-password.ts admin@hydraforge.tech "NewPass123!"
 */

import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";

const authUser = sqliteTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
});

const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull(),
  password: text("password"),
});

const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
});

const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN;

if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL not set. Pass --env-file=.env");
  process.exit(1);
}

const email = process.argv[2]?.trim();
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error(
    "Usage: bun --env-file=../../.env src/reset-password.ts <email> <newPassword>",
  );
  process.exit(1);
}

if (newPassword.length < 8) {
  console.error("❌  Password must be at least 8 characters.");
  process.exit(1);
}

const client = createClient({ url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN });
const db = drizzle(client);

const [found] = await db
  .select({ id: authUser.id, name: authUser.name })
  .from(authUser)
  .where(eq(authUser.email, email))
  .limit(1);

if (!found) {
  console.error(`❌  No user found with email "${email}".`);
  process.exit(1);
}

console.log(`✅  Found user: ${found.name} (id=${found.id})`);

const hashed = await hashPassword(newPassword);

const [existing] = await db
  .select({ id: account.id })
  .from(account)
  .where(eq(account.userId, found.id))
  .limit(1);

if (existing) {
  await db
    .update(account)
    .set({ password: hashed })
    .where(eq(account.userId, found.id));
  console.log("🔑  Updated existing credential account password.");
} else {
  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: found.id,
    providerId: "credential",
    userId: found.id,
    password: hashed,
  });
  console.log("🔑  Created credential account with new password.");
}

// Force re-login by revoking all active sessions
await db.delete(session).where(eq(session.userId, found.id));
console.log("🚪  Revoked all existing sessions.");

console.log(`\n✅  Password for ${email} has been reset.\n`);
process.exit(0);
