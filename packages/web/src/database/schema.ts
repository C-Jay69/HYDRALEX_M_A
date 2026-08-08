import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const analyses = sqliteTable("analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id"), // Link to the deal project
  userId: text("user_id"),
  filename: text("filename"),
  contractText: text("contract_text").notNull(),
  contentHash: text("content_hash"),
  status: text("status").notNull().default("pending"),
  step: text("step"),
  score: integer("score"),
  riskLevel: text("risk_level"),
  recommendation: text("recommendation"),
  executiveSummary: text("executive_summary"),
  reportMarkdown: text("report_markdown"),
  llm1Output: text("llm1_output"),
  llm2Output: text("llm2_output"),
  errorMessage: text("error_message"),
  reviewPerspective: text("review_perspective").default("BUYER"),
  // Multi-document support for cross-document consistency analysis.
  // JSON array of { filename, text } for every uploaded/pasted document.
  documents: text("documents"),
  // Structured outputs from the deterministic analysis modules (Stages 3/6/7/8/9).
  kgData: text("kg_data"),
  crossDocData: text("cross_doc_data"),
  redFlagData: text("red_flag_data"),
  regulatoryData: text("regulatory_data"),
  litigationData: text("litigation_data"),
  // Structured outputs from Stages 1/2/10/11.
  inventoryData: text("inventory_data"),
  transactionMappingData: text("transaction_mapping_data"),
  negotiationData: text("negotiation_data"),
  qaData: text("qa_data"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(), // e.g. "Project Apollo"
  status: text("status").default("active"), // active | archived | completed
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const project_documents = sqliteTable("project_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  analysisId: integer("analysis_id"), // Link to the processed text
  filename: text("filename").notNull(),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" })
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
