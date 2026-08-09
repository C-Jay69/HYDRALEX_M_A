import { Hono } from "hono";
import { db } from "../database.js";
import { writeAudit } from "../middleware/audit.js";
import * as schema from "../database/schema.js";
import { eq, desc, and } from "drizzle-orm";
import {
  getOpenRouterClient,
  runAnalyst,
  runCritic,
  runAdjudicator,
  parseReportMetadata,
  reconcilePipelineOutput,
  formatReconcilerResult,
  renderDealTypeSection,
  resolveSuppressions,
  type ReviewPerspective,
  type ReconcilerInput,
  type ReconcilerSuppression,
  type ReconcilerFinding,
  type ResolvedSuppression,
  type DealTypeState,
  stripScaffolding,
} from "../lib/openrouter.js";
import {
  runKnowledgeGraph,
  renderKnowledgeGraph,
  runCrossDocConsistency,
  renderCrossDoc,
  runRedFlagEngine,
  renderRedFlag,
  runRegulatoryAnalysis,
  renderRegulatory,
  runLitigationRisk,
  renderLitigation,
  type DocInput,
} from "../lib/analysis-modules.js";
import { authMiddleware, requireAuth } from "../middleware/auth.js";
import { getQuotaUsage, incrementAnalysisUsage } from "../lib/quota.js";
import { userMeta } from "../database/schema.js";
import { createHash } from "crypto";

/** Returns true if the user is an admin — admins bypass all quota checks. */
async function isAdmin(userId: string): Promise<boolean> {
  const [meta] = await db
    .select({ isAdmin: userMeta.isAdmin })
    .from(userMeta)
    .where(eq(userMeta.userId, userId))
    .limit(1);
  return meta?.isAdmin === true;
}

// Auto-promote admin@hydraforge.tech to admin on first analysis attempt
async function ensureAdminPromoted(userId: string, userEmail: string): Promise<void> {
  const ADMIN_EMAIL = "admin@hydraforge.tech";
  if (userEmail !== ADMIN_EMAIL) return;
  
  const [meta] = await db
    .select({ isAdmin: userMeta.isAdmin })
    .from(userMeta)
    .where(eq(userMeta.userId, userId))
    .limit(1);
  
  if (!meta?.isAdmin) {
    await db
      .insert(userMeta)
      .values({ userId, isAdmin: true, docsUsedThisMonth: 0, plan: "enterprise" })
      .onConflictDoUpdate({
        target: userMeta.userId,
        set: { isAdmin: true, plan: "enterprise", docsUsedThisMonth: 0 },
      });
    console.log(`[AUTO-ADMIN] Promoted ${ADMIN_EMAIL} to admin`);
  }
}

/** SHA-256 of text content used for dedup. */
function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export const analyses = new Hono()
  .use(authMiddleware)

  // ── List analyses (scoped to current user) ──────────────────────────────────
  .get("/", requireAuth, async (c) => {
    const user = c.get("user") as any;
    const rows = await db
      .select({
        id: schema.analyses.id,
        filename: schema.analyses.filename,
        status: schema.analyses.status,
        score: schema.analyses.score,
        riskLevel: schema.analyses.riskLevel,
        recommendation: schema.analyses.recommendation,
        executiveSummary: schema.analyses.executiveSummary,
        reviewPerspective: schema.analyses.reviewPerspective,
        createdAt: schema.analyses.createdAt,
      })
      .from(schema.analyses)
      .where(eq(schema.analyses.userId, user.id))
      .orderBy(desc(schema.analyses.createdAt));
    return c.json({ analyses: rows }, 200);
  })

  // ── Get single analysis ─────────────────────────────────────────────────────
  .get("/:id", requireAuth, async (c) => {
    const id = parseInt(c.req.param("id"));
    const user = c.get("user") as any;
    const [row] = await db
      .select()
      .from(schema.analyses)
      .where(and(eq(schema.analyses.id, id), eq(schema.analyses.userId, user.id)));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ analysis: row }, 200);
  })

  // ── Submit new analysis (text) ──────────────────────────────────────────────
  .post("/", requireAuth, async (c) => {
    const user = c.get("user") as any;
    // Auto-promote admin@hydraforge.tech to admin
    await ensureAdminPromoted(user.id, user.email);

    // Quota check (admins bypass)
    if (!(await isAdmin(user.id))) {
      const quota = await getQuotaUsage(user.id);
      if (!quota.unlimited && quota.used >= (quota.limit ?? 0)) {
        return c.json({ error: "Monthly analysis quota reached. Upgrade your plan to continue.", upgrade: true }, 402);
      }
    }

    const body = await c.req.json();
    const { contractText, filename, reviewPerspective } = body as {
      contractText: string;
      filename?: string;
      reviewPerspective?: ReviewPerspective;
    };

    if (!contractText || contractText.trim().length < 100) {
      return c.json({ error: "Contract text too short or missing" }, 400);
    }

    const trimmed = contractText.trim();
    const perspective: ReviewPerspective = reviewPerspective === "SELLER" ? "SELLER" : "BUYER";
    const documents: DocInput[] = [{ filename: filename ?? "Pasted Contract", text: trimmed }];
    const contentHash = sha256(documents.map((d) => d.text).join("||") + "|" + perspective);

    // SHA-256 dedup: return existing completed analysis if same content + perspective
    const [existing] = await db
      .select({ id: schema.analyses.id, status: schema.analyses.status })
      .from(schema.analyses)
      .where(and(
        eq(schema.analyses.contentHash, contentHash),
        eq(schema.analyses.userId, user.id),
        eq(schema.analyses.status, "complete"),
      ))
      .limit(1);

    if (existing) {
      return c.json({ id: existing.id, status: existing.status, cached: true }, 200);
    }

    const [inserted] = await db
      .insert(schema.analyses)
      .values({
        userId: user.id,
        filename: filename ?? "Pasted Contract",
        contractText: trimmed,
        documents: JSON.stringify(documents),
        contentHash,
        status: "analyzing",
        step: "analyst",
        reviewPerspective: perspective,
      })
      .returning();

    if (user) {
      incrementAnalysisUsage(user.id)
        .catch((e) => console.warn(`[Quota] Usage increment failed for ${user.id}:`, e.message));
    }

    runPipeline(inserted.id, documents, perspective).catch(async (err) => {
      console.error("Pipeline error:", err);
      await db.update(schema.analyses).set({ status: "error", errorMessage: err.message }).where(eq(schema.analyses.id, inserted.id));
    });

    return c.json({ id: inserted.id, status: "analyzing" }, 201);
  })

  // ── Upload PDF ──────────────────────────────────────────────────────────────
  .post("/upload", requireAuth, async (c) => {
    const user = c.get("user") as any;
    // Auto-promote admin@hydraforge.tech to admin
    await ensureAdminPromoted(user.id, user.email);

    if (!(await isAdmin(user.id))) {
      const quota = await getQuotaUsage(user.id);
      if (!quota.unlimited && quota.used >= (quota.limit ?? 0)) {
        return c.json({ error: "Monthly analysis quota reached. Upgrade your plan to continue.", upgrade: true }, 402);
      }
    }

    const formData = await c.req.formData();
    const files = (formData.getAll("file") as (File | null)[]).filter(Boolean) as File[];
    if (files.length === 0) return c.json({ error: "No file provided" }, 400);

    const documents: DocInput[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = await extractFileText(file);
      } catch (err: any) {
        const isUnreadable = err.message === "PDF_UNREADABLE";
        return c.json(
          isUnreadable
            ? { error: "PDF_UNREADABLE", message: "This PDF appears to be a scan or image. Please upload a text-based PDF, a .txt file, or a .docx version for accurate analysis." }
            : { error: err.message ?? "Failed to parse file" },
          isUnreadable ? 422 : 400
        );
      }
      if (text.trim().length < 100) {
        return c.json({ error: `File '${file.name}' contains insufficient extractable text.` }, 400);
      }
      documents.push({ filename: file.name, text: text.trim() });
    }

    const primary = documents[0];
    const perspectiveHeader = c.req.header("X-Review-Perspective");
    const uploadPerspective: ReviewPerspective = perspectiveHeader === "SELLER" ? "SELLER" : "BUYER";
    const contentHash = sha256(documents.map((d) => d.text).join("||") + "|" + uploadPerspective);

    // Dedup check
    const [existing] = await db
      .select({ id: schema.analyses.id, status: schema.analyses.status })
      .from(schema.analyses)
      .where(and(
        eq(schema.analyses.contentHash, contentHash),
        eq(schema.analyses.userId, user.id),
        eq(schema.analyses.status, "complete"),
      ))
      .limit(1);

    if (existing) {
      return c.json({ id: existing.id, status: existing.status, cached: true }, 200);
    }

    const [inserted] = await db
      .insert(schema.analyses)
      .values({
        userId: user.id,
        filename: primary.filename,
        contractText: primary.text,
        documents: JSON.stringify(documents),
        contentHash,
        status: "analyzing",
        step: "analyst",
        reviewPerspective: uploadPerspective,
      })
      .returning();

    if (user) {
      incrementAnalysisUsage(user.id)
        .catch((e) => console.warn(`[Quota] Usage increment failed for ${user.id}:`, e.message));
    }

    runPipeline(inserted.id, documents, uploadPerspective).catch(async (err) => {
      console.error("Pipeline error:", err);
      await db.update(schema.analyses).set({ status: "error", errorMessage: err.message }).where(eq(schema.analyses.id, inserted.id));
    });

    return c.json({ id: inserted.id, status: "analyzing" }, 201);
  })

  // ── Delete analysis ─────────────────────────────────────────────────────────
  .delete("/:id", requireAuth, async (c) => {
    const id = parseInt(c.req.param("id"));
    const user = c.get("user") as any;
    await db.delete(schema.analyses).where(and(
      eq(schema.analyses.id, id),
      eq(schema.analyses.userId, user.id),
    ));
    return c.json({ success: true }, 200);
  });

// ── Helpers ──────────────────────────────────────────────────────────────────

// OpenRouter returns rate-limit info via headers on 429s:
//   Retry-After / Retry-After-Ms  → seconds/milliseconds until the limit resets
//   X-RateLimit-Reset             → unix timestamp (seconds) of the reset
function rateLimitHeader(err: any, name: string): string | undefined {
  const h = err?.headers;
  if (!h) return undefined;
  if (typeof h.get === "function") {
    return h.get(name) ?? undefined;
  }
  return h[name] ?? h[name.toLowerCase()] ?? h[name.toUpperCase()];
}

function isRateLimitError(err: any): boolean {
  return (
    err?.status === 429 ||
    err?.message?.includes("429") ||
    err?.message?.toLowerCase().includes("rate limit") ||
    err?.message?.toLowerCase().includes("provider returned error") ||
    err?.message?.toLowerCase().includes("too many requests")
  );
}

function isTransientError(err: any): boolean {
  if (isRateLimitError(err)) return true;
  if (err?.status >= 500 && err?.status < 600) return true;
  // NOTE: do NOT retry on APITimeoutError/APIConnectionError — a slow free-tier
  // request would otherwise loop for 5min × attempts before failing.
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 6): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (!isTransientError(err) || attempt === maxAttempts) throw err;

      // Honor the server's retry timing when available.
      const retryAfterMsRaw = rateLimitHeader(err, "retry-after-ms") ?? rateLimitHeader(err, "retry-after");
      const retryAfterMs = retryAfterMsRaw
        ? (rateLimitHeader(err, "retry-after-ms") ? parseFloat(retryAfterMsRaw) : parseFloat(retryAfterMsRaw) * 1000)
        : 0;
      const resetSec = rateLimitHeader(err, "x-ratelimit-reset");
      const resetMs = resetSec ? parseFloat(resetSec) * 1000 - Date.now() : 0;
      const requestedWaitMs = Math.max(retryAfterMs, resetMs, 0);

      // If the quota resets more than 10 minutes out (e.g. the 50/day free
      // limit, which resets at UTC midnight), retrying will never succeed —
      // fail fast with a clear message instead of hanging and burning quota.
      const MAX_WAIT_MS = 10 * 60 * 1000;
      if (requestedWaitMs > MAX_WAIT_MS) {
        const mins = Math.max(1, Math.round(requestedWaitMs / 60000));
        throw new Error(
          `${label} — OpenRouter free-model rate limit will not reset for ~${mins} minute(s). ` +
          `Free models are capped at 50 requests/day (or 1000/day after adding $10+ of credits at ` +
          `https://openrouter.ai/settings/credits), and failed attempts count against that quota. ` +
          `Wait for the daily reset or add credits, then retry.`
        );
      }

      // Exponential backoff with jitter, floor 30s, but never wait less than
      // the server's requested delay.
      const backoffMs = 30000 * Math.pow(2, attempt - 1);
      const waitMs = Math.max(backoffMs, requestedWaitMs) + Math.random() * 5000;
      console.warn(`[${label}] 429 rate limit — attempt ${attempt}/${maxAttempts}, retrying in ${Math.round(waitMs / 1000)}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Extract text from an uploaded File. Throws with a clear message on failure. */
async function extractFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const { extractPdfText } = await import("../lib/pdf.js");
      const text = await extractPdfText(buffer);
      if (text.trim().length < 200) throw new Error("PDF_UNREADABLE");
      return text;
    } catch (err: any) {
      if (err.message === "PDF_UNREADABLE") throw err;
      throw new Error(err.message ?? "Failed to parse PDF");
    }
  }
  return await file.text();
}

async function runPipeline(id: number, documents: DocInput[], perspective: ReviewPerspective = "BUYER") {
  const contractText = documents[0]?.text ?? "";
  const client = getOpenRouterClient();
  const _pipelineStart = Date.now();
  console.log(`[PIPELINE] Analysis #${id} started — ${contractText.length.toLocaleString()} chars, ${perspective} perspective`);

  // Step 1: Analyst
  await db.update(schema.analyses).set({ step: "analyst" }).where(eq(schema.analyses.id, id));
  const llm1Start = Date.now();
  console.log(`[PIPELINE] Analysis #${id} → step=analyst`);
  const llm1Raw = await withRetry(() => runAnalyst(client, contractText, perspective), "Analyst");
  await writeAudit({ action: "analyst", resourceType: "analysis", resourceId: id, metadata: { model: "analyst", status: "complete", ms: Date.now() - llm1Start, perspective } });
  await db.update(schema.analyses).set({ llm1Output: llm1Raw, step: "critic" }).where(eq(schema.analyses.id, id));
  await sleep(20000); // Increased from 10s to 20s to avoid rate limits

  // Step 2: Critic
  const llm2Start = Date.now();
  console.log(`[PIPELINE] Analysis #${id} → step=critic`);
  const llm2Raw = await withRetry(() => runCritic(client, contractText, llm1Raw, perspective), "Critic");
  await writeAudit({ action: "critic", resourceType: "analysis", resourceId: id, metadata: { model: "critic", status: "complete", ms: Date.now() - llm2Start } });
  await db.update(schema.analyses).set({ llm2Output: llm2Raw, step: "adjudicator" }).where(eq(schema.analyses.id, id));
  await sleep(30000); // Increased from 15s to 30s to avoid rate limits

  // Step 3: Adjudicator
  const adjStart = Date.now();
  console.log(`[PIPELINE] Analysis #${id} → step=adjudicator`);
  let reportMarkdown = await withRetry(() => runAdjudicator(client, llm1Raw, llm2Raw, contractText, perspective), "Adjudicator");
  await writeAudit({ action: "adjudicator", resourceType: "analysis", resourceId: id, metadata: { model: "adjudicator", status: "complete", ms: Date.now() - adjStart } });
  console.log(`[LLM TIMING] Total pipeline (LLM net + 25s sleeps): ${Date.now() - _pipelineStart}ms`);

  // Scaffolding leak guard
  const { cleaned: reportCleaned, leaks: scaffoldLeaks } = stripScaffolding(reportMarkdown);
  if (scaffoldLeaks.length > 0) {
    console.warn(`[SCAFFOLD LEAK] ${scaffoldLeaks.length} fragment(s) stripped:`, scaffoldLeaks);
  }
  reportMarkdown = reportCleaned;

  const meta = parseReportMetadata(reportMarkdown);

  // Cross-layer reconciler
  try {
    const analystJson = JSON.parse(llm1Raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());

    const rawSuppressions: ReconcilerSuppression[] = (analystJson.suppressions ?? []).map(
      (s: { rule?: string; item?: string; suppression_status?: string; applied?: boolean; rationale?: string }) => ({
        item: s.rule ?? s.item ?? "Unknown",
        applied: s.suppression_status === "SUPPRESSED" || s.applied === true,
        rationale: s.rationale ?? "",
      })
    );

    const rawFindings: ReconcilerFinding[] = (analystJson.findings ?? []).map(
      (f: { category?: string; topic?: string; section?: string; severity?: string; disposition?: string }) => ({
        topic: f.category ?? f.topic ?? f.section ?? "Unknown",
        severity: ((f.severity ?? "").toUpperCase()) as ReconcilerFinding["severity"],
        disposition: (f.disposition ?? "OMITTED") as ReconcilerFinding["disposition"],
      })
    );

    const recRaw = (meta.recommendation ?? "").toUpperCase();
    const recommendation: ReconcilerInput["recommendation"] =
      recRaw.includes("NOT") || recRaw.includes("DO NOT") ? "DO_NOT_PROCEED"
      : recRaw.includes("CONDITION") || recRaw.includes("REVISION") || recRaw.includes("RENEGOTIATE") ? "PROCEED_WITH_CONDITIONS"
      : "PROCEED";

    const bumpMatch = reportMarkdown.match(/Net tier adjustment:\s*\+?(\d+)/i);
    const netTierBump = bumpMatch?.[1] != null ? parseInt(bumpMatch[1], 10) : 0;

    const dealType = (analystJson.deal_type ?? "EQUITY_PURCHASE") as ReconcilerInput["dealType"];
    const classificationConfidence = (analystJson.classification_confidence ?? "UNKNOWN") as ReconcilerInput["classificationConfidence"];
    const resolved: ResolvedSuppression[] = resolveSuppressions(dealType, classificationConfidence);

    const reconcilerInput: ReconcilerInput = {
      dealType,
      classificationConfidence,
      suppressions: rawSuppressions,
      findings: rawFindings,
      netTierBump,
      recommendation,
      resolved,
    };

    const reconcilerResult = reconcilePipelineOutput(reconcilerInput);
    const reconcilerTable = formatReconcilerResult(reconcilerResult);

    if (!reconcilerResult.clean) {
      console.warn(`[RECONCILER] ${reconcilerResult.conflicts.length} conflict(s) on analysis ${id}`);
    }

    const l3bSectionRe = /(### CROSS-LAYER PREMISE CONFLICTS \(L3-B\))\n[\s\S]*?(?=\n###|\n---|\n#\s|$)/;
    const reconcilerMd = ["```", reconcilerTable, "```"].join("\n");
    if (l3bSectionRe.test(reportMarkdown)) {
      reportMarkdown = reportMarkdown.replace(l3bSectionRe, `$1\n${reconcilerMd}\n`);
    } else {
      reportMarkdown += `\n\n### CROSS-LAYER PREMISE CONFLICTS (L3-B)\n${reconcilerMd}\n`;
    }

    const candidateStructures: string[] | undefined = analystJson.candidate_structures?.length
      ? analystJson.candidate_structures : undefined;
    const dealTypeState: DealTypeState = { dealType, classificationConfidence, candidateStructures };
    const renderedDealTypeSection = renderDealTypeSection(dealTypeState);

    const dealTypeSectionRe = /(### DEAL-TYPE CLASSIFICATION)\n[\s\S]*?(?=\n###|\n---|\n#\s|$)/;
    if (dealTypeSectionRe.test(reportMarkdown)) {
      reportMarkdown = reportMarkdown.replace(dealTypeSectionRe, `$1\n${renderedDealTypeSection}\n`);
    } else {
      const industryRe = /(### INDUSTRY DETECTED[\s\S]*?)(?=\n###|\n---|\n#\s|$)/;
      if (industryRe.test(reportMarkdown)) {
        reportMarkdown = reportMarkdown.replace(industryRe, `$1\n\n### DEAL-TYPE CLASSIFICATION\n${renderedDealTypeSection}\n`);
      } else {
        reportMarkdown = `### DEAL-TYPE CLASSIFICATION\n${renderedDealTypeSection}\n\n` + reportMarkdown;
      }
    }
  } catch (err) {
    console.warn("[RECONCILER] Could not run cross-layer reconciliation:", err);
  }

  // ── Deterministic analysis modules (Stages 3/6/7/8/9) ───────────────────────
  let kgData: unknown = null;
  let crossDocData: unknown = null;
  let redFlagData: unknown = null;
  let regData: unknown = null;
  let litData: unknown = null;
  const moduleSections: string[] = [];
  try {
    const kg = runKnowledgeGraph(contractText);
    kgData = kg;
    await writeAudit({ action: "knowledge_graph", resourceType: "analysis", resourceId: id, metadata: { nodes: kg.summary.totalNodes, edges: kg.summary.totalEdges } });

    const cross = runCrossDocConsistency(documents);
    crossDocData = cross;
    await writeAudit({ action: "cross_doc", resourceType: "analysis", resourceId: id, metadata: { documents: documents.length, findings: cross.findings.length } });

    const rf = runRedFlagEngine(contractText);
    redFlagData = rf;
    await writeAudit({ action: "red_flag", resourceType: "analysis", resourceId: id, metadata: { flags: rf.flags.length } });

    const reg = runRegulatoryAnalysis(contractText);
    regData = reg;
    await writeAudit({ action: "regulatory", resourceType: "analysis", resourceId: id, metadata: { frameworks: reg.frameworks.length } });

    const litCtx = {
      hasIndemnificationCap: /\bcap\b/i.test(contractText) && /indemnif/i.test(contractText),
      hasEscrow: /\bescrow\b/i.test(contractText),
      hasRWI: /\brwi\b|representations\s+and\s+warranties\s+insurance/i.test(contractText),
      hasDisclosureSchedules: /\bschedule\b|\bdisclosure\s+schedules?\b/i.test(contractText),
      hasFinancialStatements: /\bfinancial\s+statements?\b/i.test(contractText),
      hasRegulatoryFilings: /\bhsr\b|\bcfius\b|\bregulatory\s+filing/i.test(contractText),
    };
    const lit = runLitigationRisk(contractText, litCtx);
    litData = lit;
    await writeAudit({ action: "litigation", resourceType: "analysis", resourceId: id, metadata: { areas: lit.areas.length } });

    moduleSections.push(renderRegulatory(reg));
    moduleSections.push(renderCrossDoc(cross));
    moduleSections.push(renderLitigation(lit));
    moduleSections.push(renderKnowledgeGraph(kg));
    moduleSections.push(renderRedFlag(rf));

    reportMarkdown += "\n\n" + moduleSections.join("\n");
  } catch (err) {
    console.error("[MODULES] analysis-module error (non-fatal):", err);
  }

  await db.update(schema.analyses).set({
    status: "complete",
    step: null,
    reportMarkdown,
    score: meta.score,
    riskLevel: meta.riskLevel,
    recommendation: meta.recommendation,
    executiveSummary: meta.executiveSummary,
    kgData: kgData ? JSON.stringify(kgData) : null,
    crossDocData: crossDocData ? JSON.stringify(crossDocData) : null,
    redFlagData: redFlagData ? JSON.stringify(redFlagData) : null,
    regulatoryData: regData ? JSON.stringify(regData) : null,
    litigationData: litData ? JSON.stringify(litData) : null,
  }).where(eq(schema.analyses.id, id));
}
