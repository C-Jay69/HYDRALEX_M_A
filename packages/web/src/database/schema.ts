import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const analyses = sqliteTable("analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id"), // nullable for legacy — links to user.id
  filename: text("filename"),
  contractText: text("contract_text").notNull(),
  contentHash: text("content_hash"), // SHA-256 of contractText for dedup
  status: text("status").notNull().default("pending"), // pending | analyzing | complete | error
  step: text("step"), // analyst | critic | adjudicator
  score: integer("score"),
  riskLevel: text("risk_level"), // Low | Moderate | High | Critical
  recommendation: text("recommendation"),
  executiveSummary: text("executive_summary"),
  reportMarkdown: text("report_markdown"),
  llm1Output: text("llm1_output"),
  llm2Output: text("llm2_output"),
  errorMessage: text("error_message"),
  reviewPerspective: text("review_perspective").default("BUYER"), // BUYER | SELLER
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Extra columns on the Better Auth user table
// These are applied via db:push alongside the auth-schema
export const userMeta = sqliteTable("user_meta", {
  userId: text("user_id").primaryKey(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  docsUsedThisMonth: integer("docs_used_this_month").notNull().default(0),
  monthResetAt: integer("month_reset_at", { mode: "timestamp" }),
});

// Audit log — append-only
export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id"),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  ipAddress: text("ip_address"),
  metadata: text("metadata"), // JSON string
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export * from "./auth-schema.js";
