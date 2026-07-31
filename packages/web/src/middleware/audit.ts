/**
 * audit.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Helper to write audit log entries for the analysis pipeline.
 * Inserts rows into the `audit_logs` table (append‑only).
 */

import { db } from "../database.js";
import { auditLogs } from "../database/schema.js";

/**
 * Write an audit log entry.
 *
 * @param action   Short name of the action, e.g. "analyst", "critic", "adjudicator",
 *                 "knowledge_graph", "cross_doc", "red_flag", "regulatory", "litigation".
 * @param resourceType Typically "analysis".
 * @param resourceId   The analysis primary key (number) – useful for querying.
 * @param metadata     Any serializable extra data (model name, token usage, step status, etc.).
 * @param userId       Optional user id; if omitted we try to pull from context (not used here).
 */
export async function writeAudit({
  action,
  resourceType,
  resourceId,
  metadata,
  userId = null,
}: {
  action: string;
  resourceType: string;
  resourceId: number | null;
  metadata: Record<string, unknown>;
  userId?: number | string | null;
}) {
  try {
    await db.insert(auditLogs).values({
      userId: userId ? String(userId) : null,
      action,
      resourceType,
      resourceId: resourceId ? String(resourceId) : null,
      metadata: JSON.stringify(metadata),
      ipAddress: null, // we don't have request context here; leave null
    });
  } catch (err) {
    // Never let audit logging break the main flow – just log to console.
    console.error("[AUDIT] Failed to write audit log:", err);
  }
}