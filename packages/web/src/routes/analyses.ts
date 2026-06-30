import { Hono } from "hono";
import { db } from "../database.js";
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
import { authMiddleware, requireAuth } from "../middleware/auth.js";
import { Autumn } from "autumn-js";
import { userMeta } from "../database/schema.js";
import { createHash } from "crypto";

const autumn = new Autumn();

/** Returns true if the user is an admin — admins bypass all quota checks. */
async function isAdmin(userId: string): Promise<boolean> {
  const [meta] = await db
    .select({ isAdmin: userMeta.isAdmin })
    .from(userMeta)
    .where(eq(userMeta.userId, userId))
    .limit(1);
  return meta?.isAdmin === true;
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

    // Quota check (admins bypass)
    if (!(await isAdmin(user.id))) {
      const { allowed } = await autumn.check({ customerId: user.id, featureId: "analyses" });
      if (!allowed) {
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
    const contentHash = sha256(trimmed + "|" + perspective);

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
        contentHash,
        status: "analyzing",
        step: "analyst",
        reviewPerspective: perspective,
      })
      .returning();

    if (user) {
      await autumn.track({ customerId: user.id, featureId: "analyses", value: 1 }).catch(() => {});
    }

    runPipeline(inserted.id, trimmed, perspective).catch(async (err) => {
      console.error("Pipeline error:", err);
      await db.update(schema.analyses).set({ status: "error", errorMessage: err.message }).where(eq(schema.analyses.id, inserted.id));
    });

    return c.json({ id: inserted.id, status: "analyzing" }, 201);
  })

  // ── Upload PDF ──────────────────────────────────────────────────────────────
  .post("/upload", requireAuth, async (c) => {
    const user = c.get("user") as any;

    if (!(await isAdmin(user.id))) {
      const { allowed } = await autumn.check({ customerId: user.id, featureId: "analyses" });
      if (!allowed) {
        return c.json({ error: "Monthly analysis quota reached. Upgrade your plan to continue.", upgrade: true }, 402);
      }
    }

    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return c.json({ error: "No file provided" }, 400);

    let contractText = "";
    const filename = file.name;

    if (file.type === "application/pdf" || filename.endsWith(".pdf")) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      try {
        const { extractPdfText } = await import("../lib/pdf");
        contractText = await extractPdfText(buffer);
      } catch (err: any) {
        return c.json({ error: err.message ?? "Failed to parse PDF" }, 400);
      }
    } else {
      contractText = await file.text();
    }

    if (!contractText || contractText.trim().length < 100) {
      return c.json({ error: "Could not extract sufficient text from file" }, 400);
    }

    const trimmed = contractText.trim();
    const perspectiveHeader = c.req.header("X-Review-Perspective");
    const uploadPerspective: ReviewPerspective = perspectiveHeader === "SELLER" ? "SELLER" : "BUYER";
    const contentHash = sha256(trimmed + "|" + uploadPerspective);

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
        filename,
        contractText: trimmed,
        contentHash,
        status: "analyzing",
        step: "analyst",
        reviewPerspective: uploadPerspective,
      })
      .returning();

    if (user) {
      await autumn.track({ customerId: user.id, featureId: "analyses", value: 1 }).catch(() => {});
    }

    runPipeline(inserted.id, trimmed, uploadPerspective).catch(async (err) => {
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

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 4): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const is429 =
        err?.status === 429 ||
        err?.message?.includes("429") ||
        err?.message?.toLowerCase().includes("rate limit") ||
        err?.message?.toLowerCase().includes("provider returned error");

      if (!is429 || attempt === maxAttempts) throw err;
      const waitMs = 15000 * Math.pow(2, attempt - 1);
      console.warn(`[${label}] 429 rate limit — attempt ${attempt}/${maxAttempts}, retrying in ${waitMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runPipeline(id: number, contractText: string, perspective: ReviewPerspective = "BUYER") {
  const client = getOpenRouterClient();
  const _pipelineStart = Date.now();

  // Step 1: Analyst
  await db.update(schema.analyses).set({ step: "analyst" }).where(eq(schema.analyses.id, id));
  const llm1Raw = await withRetry(() => runAnalyst(client, contractText, perspective), "Analyst");
  await db.update(schema.analyses).set({ llm1Output: llm1Raw, step: "critic" }).where(eq(schema.analyses.id, id));
  await sleep(10000);

  // Step 2: Critic
  const llm2Raw = await withRetry(() => runCritic(client, contractText, llm1Raw, perspective), "Critic");
  await db.update(schema.analyses).set({ llm2Output: llm2Raw, step: "adjudicator" }).where(eq(schema.analyses.id, id));
  await sleep(15000);

  // Step 3: Adjudicator
  let reportMarkdown = await withRetry(() => runAdjudicator(client, llm1Raw, llm2Raw, contractText, perspective), "Adjudicator");
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

  await db.update(schema.analyses).set({
    status: "complete",
    step: null,
    reportMarkdown,
    score: meta.score,
    riskLevel: meta.riskLevel,
    recommendation: meta.recommendation,
    executiveSummary: meta.executiveSummary,
  }).where(eq(schema.analyses.id, id));
}
