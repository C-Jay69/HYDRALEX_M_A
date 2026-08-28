#!/usr/bin/env bun
/**
 * ensure-local-admin.ts
 * Creates (or updates) the admin@hydraforge.tech user in whatever DB is
 * pointed to by DATABASE_URL, with the given password and admin flag.
 * Idempotent: if the user already exists it just (re)sets the password + admin.
 *
 * Usage (local SQLite example):
 *   DATABASE_URL="file:local.db" bun src/scripts/ensure-local-admin.ts "AdminHydra1234!"
 */

import { hashPassword } from "better-auth/crypto";
import { createClient } from "@libsql/client";
import { randomUUID } from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN || undefined;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set.");
  process.exit(1);
}

const email = "admin@hydraforge.tech";
const name = "Simon Cleary";
const password = process.argv[2] || "AdminHydra1234!";

if (password.length < 8) {
  console.error("❌ Password must be at least 8 characters.");
  process.exit(1);
}

const client = createClient({ url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN });

// 1) user row
let [u] = (await client.execute({
  sql: `SELECT id FROM "user" WHERE email = ?`,
  args: [email],
})).rows as { id: string }[];

let userId: string;
if (!u) {
  userId = randomUUID();
  await client.execute({
    sql: `INSERT INTO "user" (id, name, email, email_verified) VALUES (?, ?, ?, 0)`,
    args: [userId, name, email],
  });
  console.log("➕ Created user:", email, `(id=${userId})`);
} else {
  userId = u.id;
  console.log("✅ User already exists:", email, `(id=${userId})`);
}

// 2) credential account + password
const hashed = await hashPassword(password);
const [acct] = (await client.execute({
  sql: `SELECT id FROM account WHERE user_id = ? AND provider_id = 'credential'`,
  args: [userId],
})).rows as { id: string }[];

if (acct) {
  await client.execute({
    sql: `UPDATE account SET password = ?, updated_at = unixepoch('subsecond') * 1000 WHERE id = ?`,
    args: [hashed, acct.id],
  });
  console.log("🔑 Updated credential password.");
} else {
  await client.execute({
    sql: `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
          VALUES (?, ?, 'credential', ?, ?, unixepoch('subsecond') * 1000, unixepoch('subsecond') * 1000)`,
    args: [randomUUID(), userId, userId, hashed],
  });
  console.log("🔑 Created credential account + password.");
}

// 3) admin flag
await client.execute({
  sql: `INSERT INTO user_meta (user_id, is_admin, plan, docs_used_this_month)
        VALUES (?, 1, 'enterprise', 0)
        ON CONFLICT(user_id) DO UPDATE SET is_admin = 1, plan = 'enterprise'`,
  args: [userId],
});
console.log("🛡️  Admin flag set (plan=enterprise).");

// 4) revoke stale sessions
await client.execute({ sql: `DELETE FROM session WHERE user_id = ?`, args: [userId] });

console.log(`\n✅ admin@hydraforge.tech ready (password: "${password}").\n`);
process.exit(0);
