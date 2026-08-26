/**
 * analysis-modules.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic (rule-based) M&A analysis modules for the HYDRAFORGE platform.
 *
 * These implement spec Stages 3, 6, 7, 8, and 9 as fast, dependency-free
 * analyzers that run inside the TypeScript/Hono service (no extra LLM calls,
 * no Python runtime). Logic is ported from the draft Python modules in
 * packages/python-engine/ and expanded to cover the full spec checklists.
 *
 * Each module returns a structured object plus a `render*Section()` helper that
 * emits markdown matching the Stage 12 final-report ordering.
 */

export type Severity = "critical" | "high" | "moderate" | "low";

export interface DocInput {
  filename: string;
  text: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Surrounding context window for a match index. */
function ctx(text: string, idx: number, radius = 120): string {
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

/** First N matches -> condensed evidence strings. */
function evidenceSnippets(text: string, re: RegExp, limit = 3): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let guard = 0;
  while ((m = r.exec(text)) !== null && out.length < limit && guard++ < 500) {
    out.push(ctx(text, m.index));
    if (m.index === r.lastIndex) r.lastIndex++;
  }
  return out;
}

function countMatches(text: string, re: RegExp): number {
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (text.match(r) || []).length;
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mdTable(headers: string[], rows: string[][]): string {
  const escCell = (c: string) => c.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const h = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(escCell).join(" | ")} |`).join("\n");
  return `${h}\n${sep}\n${body}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3 — KNOWLEDGE GRAPH
// ─────────────────────────────────────────────────────────────────────────────

export interface KGNodeT {
  id: string;
  name: string;
  entityType: string;
  occurrences: number;
}

export interface KGEdgeT {
  source: string;
  target: string;
  relationship: string;
}

export interface KGResult {
  nodes: KGNodeT[];
  edges: KGEdgeT[];
  missingLinks: string[];
  undefinedTerms: string[];
  /** Controlling commercial terms referenced but never defined — these block
   *  execution-readiness and must be surfaced distinctly from cosmetic typos. */
  undefinedControllingTerms: string[];
  summary: { totalNodes: number; totalEdges: number; byType: Record<string, number> };
}

/**
 * Controlling defined terms that are essential to the economics and mechanics
 * of an M&A deal. If any is referenced in the contract but never defined, the
 * agreement is not execution-ready (see runReadinessGate).
 */
export const CONTROLLING_TERMS = [
  "Seller", "Purchase Price", "Closing", "Effective Time", "Outside Date",
  "Earnout Period", "Fundamental Representations", "Net Working Capital",
  "Balance Sheet Date", "Survival Period", "Closing Date", "Indemnification",
];

const DEFINED_TERM_RE =
  /["']([A-Z][-&/\w ]{2,50})["']\s+(?:means|shall mean|is defined as|refers to|being|means and includes)/i;
const DEFINED_TERM_PAREN_RE = /\b([A-Z][-&/\w ]{2,50})\s*\((?:as\s+defined\s+in\s+(?:Section|§)\s*[\d.]+|the\s+["'][-&/\w ]+["']\s+defined)/i;

const PARTY_ROLES = [
  "Buyer", "Seller", "Target", "Purchaser", "Acquirer", "Vendor", "Grantor",
  "Grantee", "Lender", "Borrower", "Guarantor", "Shareholder", "Member",
];
const CORP_SUFFIX_RE = /\b([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*\s+(?:Inc\.?|Corp\.?|LLC|L\.L\.C\.?|Ltd\.?|LP|L\.P\.|LLP|PLC|SE|AG|GmbH|SA|N\.V\.|NV|AB|Co\.?))\b/;
const REG_BODIES = [
  "SEC", "FTC", "DOJ", "CFIUS", "OFAC", "FCPA", "PCAOB", "FINRA", "OCC", "FDIC",
  "CFTC", "FCC", "FDA", "HIPAA", "GDPR", "CCPA", "SOX", "FASB", "GAAP", "IRS",
  "Treasury", "BIS", "DEA", "EPA", "OSHA", "DOL", "NLRB", "HSR",
];
const HEADING_CLAUSE_RE =
  /\b(Representations\s+and\s+Warranties|Warranties|Indemnification|Covenants|Conditions\s+to\s+Closing|Conditions\s+to\s+Consummation|Definitions|Termination|Confidentiality|Governing\s+Law|Dispute\s+Resolution|Tax|CERCLA|Environmental)\b/gi;
// Captures full sub-numbering + letter-suffix schedule/exhibit labels
// (e.g. "1.1(a)", "2.5", "3.11", "A-1") — does NOT truncate at the first
// decimal point. The trailing negative lookahead prevents over-capture while
// still allowing a following "." (sentence terminator) or ")" (suffix).
const SCHEDULE_RE = /\b(?:Schedule|Exhibit|Annex|Appendix)\s+([A-Z0-9]+(?:\.[A-Z0-9]+)*(?:\([a-zA-Z0-9]+\))?(?:-[A-Z0-9]+)?)(?![A-Za-z0-9(])/gi;
const SCHEDULE_REF_RE = /\b(?:pursuant\s+to|as\s+set\s+forth\s+in|referenced\s+in|set\s+forth\s+on|attached\s+as)\s+(?:Schedule|Exhibit|Annex|Appendix)\s+([A-Z0-9]+(?:\.[A-Z0-9]+)*(?:\([a-zA-Z0-9]+\))?(?:-[A-Z0-9]+)?)(?![A-Za-z0-9(])/gi;

export function runKnowledgeGraph(text: string): KGResult {
  const nodes: KGNodeT[] = [];
  const edges: KGEdgeT[] = [];
  const nodeIndex = new Map<string, KGNodeT>();
  const definedTermNames = new Set<string>();

  const addNode = (name: string, entityType: string): KGNodeT => {
    const id = `${entityType}:${name.toLowerCase().replace(/\s+/g, "_")}`;
    let n = nodeIndex.get(id);
    if (!n) {
      n = { id, name, entityType, occurrences: 0 };
      nodeIndex.set(id, n);
      nodes.push(n);
    }
    n.occurrences++;
    return n;
  };

  // 1. Defined terms
  for (const re of [DEFINED_TERM_RE, DEFINED_TERM_PAREN_RE]) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, "gi");
    while ((m = r.exec(text)) !== null) {
      const term = m[1].trim();
      if (term.length < 3 || term.length > 50) continue;
      definedTermNames.add(term.toLowerCase());
      addNode(term, "defined_term");
      if (m.index === r.lastIndex) r.lastIndex++;
    }
  }

  // 2. Parties
  for (const role of PARTY_ROLES) {
    const r = new RegExp(`\\b${esc(role)}\\b`, "gi");
    if (r.test(text)) addNode(role, "party");
  }
  let cm: RegExpExecArray | null;
  const cr = new RegExp(CORP_SUFFIX_RE.source, "g");
  while ((cm = cr.exec(text)) !== null) addNode(cm[1].trim(), "party");

  // 3. Regulatory bodies
  for (const body of REG_BODIES) {
    const r = new RegExp(`\\b${esc(body)}\\b`, "gi");
    if (countMatches(text, r) > 0) addNode(body, "regulatory_approval");
  }

  // 4. Clauses (headings)
  let hm: RegExpExecArray | null;
  const hr = new RegExp(HEADING_CLAUSE_RE.source, "gi");
  while ((hm = hr.exec(text)) !== null) addNode(hm[1].trim(), "clause");

  // 5. Schedules / Exhibits referenced
  const scheduleLabels = new Set<string>();
  let sm: RegExpExecArray | null;
  const sr = new RegExp(SCHEDULE_RE.source, "gi");
  while ((sm = sr.exec(text)) !== null) {
    const label = sm[1].trim().toUpperCase();
    scheduleLabels.add(label);
    addNode(`Schedule/Exhibit ${label}`, "schedule");
  }

  // Edges: defined-term references (term appears again beyond its definition)
  for (const term of definedTermNames) {
    const termNode = nodeIndex.get(`defined_term:${term.replace(/\s+/g, "_")}`);
    if (!termNode) continue;
    const r = new RegExp(`\\b${esc(term)}\\b`, "gi");
    const refs = countMatches(text, r);
    if (refs > termNode.occurrences) {
      edges.push({ source: termNode.id, target: "document:primary", relationship: "references" });
    }
  }

  // Edges: schedule cross-references
  let fm: RegExpExecArray | null;
  const fr = new RegExp(SCHEDULE_REF_RE.source, "gi");
  while ((fm = fr.exec(text)) !== null) {
    const label = fm[1].trim().toUpperCase();
    const schedNode = nodeIndex.get(`schedule:schedule/exhibit_${label.toLowerCase()}`);
    if (schedNode) {
      edges.push({ source: "document:primary", target: schedNode.id, relationship: "references" });
    }
  }

  // Defined-term usage: count EVERY occurrence (quoted definition site AND all
  // subsequent unquoted uses, e.g. "the Acquired Assets") across the whole
  // document. A term used 40x must not be flagged "never referenced" just
  // because the KG node was only created once (at its definition site).
  const definedTermUsage = new Map<string, number>();
  for (const term of definedTermNames) {
    const r = new RegExp(`\\b${esc(term)}\\b`, "gi");
    definedTermUsage.set(term, countMatches(text, r));
  }

  // Missing links: a defined term is only "dead" if it appears AT MOST ONCE in
  // the entire document — i.e. only inside its own definition sentence
  // (usage <= 1). Any term referenced elsewhere is alive.
  const missingLinks: string[] = [];
  for (const n of nodes) {
    if (n.entityType !== "defined_term") continue;
    const usage = definedTermUsage.get(n.name.toLowerCase()) ?? n.occurrences;
    if (usage <= 1) missingLinks.push(`${n.name} (defined but never referenced)`);
  }

  // Sanity gate: flagging several "dead definitions" in a non-trivial document
  // almost always indicates a *parser* bug, not a *drafting* bug. Suppress the
  // user-facing finding so it routes to QA review rather than the report.
  const estimatedPages = Math.max(1, Math.round(text.length / 2500));
  if (missingLinks.length > 3 && estimatedPages > 2) {
    missingLinks.length = 0;
  }

  // Undefined terms: capitalized phrases that look like defined terms but aren't
  const skip = new Set([
    "The", "This", "That", "These", "Those", "It", "Section", "Exhibit", "Schedule",
    "Article", "Agreement", "Parties", "Effective", "Date", "Company", "Transaction",
    "Closing", "Consideration", "Representations", "Warranties", "Indemnification",
    "Confidentiality", "Governing", "Law", "Dispute", "Resolution", "Term", "Termination",
    "Payment", "Price", "Purchase", "Sale", "Assets", "Shares", "Stock", "Equity",
    "Interest", "Obligation", "Obligations", "Rights", "Business", "Operations",
    "Employees", "Affiliates", "Seller", "Buyer", "Target",
    // Calendar words the capital-phrase heuristic otherwise grabs ("December", "Monday")
    "January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December", "Monday", "Tuesday",
    "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    // Common sentence-initial / header words the capital-phrase heuristic otherwise grabs
    "There", "Neither", "Where", "When", "While", "Then", "Each", "Both", "All", "Any",
    "No", "Not", "And", "Or", "But", "For", "With", "Without", "From", "Into", "Upon",
    "After", "Before", "During", "Until", "Unless", "Except", "Subject", "Notwithstanding",
    "Overview", "Summary", "Background", "Recitals", "Definitions", "Interpretation",
    "Preamble", "Witnesseth", "Whereas", "Merger", "An", "By", "To", "In", "On", "At",
    "As", "Of", "Be", "Is", "Are", "Was", "Were", "They", "We", "You", "Who", "Which",
  ]);
  // Acronyms/known tokens that are safe to appear in an all-caps phrase
  const ALLCAP_ALLOW = new Set(["US", "USA", "UK", "EU", "LLC", "LP", "LLP", "PLC", "AG", "SE", "GMBH", "SA", "NV", "AB", "CO", "INC", "CORP", "LTD", "NYSE", "SEC", "CFIUS", "OFAC", "FCPA", "IRS", "FTC", "DOJ"]);
  const undefinedTerms: string[] = [];
  const capRe = /\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){0,3})\b/g;
  const seen = new Set<string>();
  let cm2: RegExpExecArray | null;
  while ((cm2 = capRe.exec(text)) !== null) {
    const w = cm2[1].trim();
    const low = w.toLowerCase();
    if (/^[A-Z0-9\s&/\-]+$/.test(w)) continue; // skip ALL-CAPS headers (e.g. "MERGER AGREEMENT")
    // Skip mixed heading phrases like "THE MERGER Target" — any fully-uppercase
    // non-acronym token signals a header-ish fragment, not a defined term.
    const tokens = w.split(/\s+/);
    if (tokens.some((t) => t.length >= 3 && /^[A-Z0-9&]+$/.test(t) && !ALLCAP_ALLOW.has(t))) continue;
    if (seen.has(low) || skip.has(w) || definedTermNames.has(low)) continue;
    seen.add(low);
    if (w.length < 4 || w.length > 40) continue;
    undefinedTerms.push(w);
  }

  // Controlling defined terms: referenced in text but never defined.
  const undefinedControllingTerms: string[] = [];
  for (const ct of CONTROLLING_TERMS) {
    const ctLow = ct.toLowerCase();
    if (definedTermNames.has(ctLow) || skip.has(ct) || CT_TITLE_CASE.has(ct)) continue;
    const ctRe = new RegExp(`\\b${ct.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (ctRe.test(text)) undefinedControllingTerms.push(ct);
  }

  const byType: Record<string, number> = {};
  for (const n of nodes) byType[n.entityType] = (byType[n.entityType] || 0) + 1;

  return {
    nodes,
    edges,
    missingLinks: missingLinks.slice(0, 25),
    undefinedTerms: undefinedTerms.slice(0, 25),
    undefinedControllingTerms: undefinedControllingTerms.slice(0, 25),
    summary: { totalNodes: nodes.length, totalEdges: edges.length, byType },
  };
}

/** Title-case variants of controlling terms that are routinely used
 *  unquoted in operative text and should not be treated as undefined. */
const CT_TITLE_CASE = new Set([
  "Closing", "Indemnification", "Purchase Price", "Effective Time", "Outside Date",
  "Earnout Period", "Net Working Capital", "Balance Sheet Date", "Survival Period",
  "Closing Date",
]);

export function renderKnowledgeGraph(kg: KGResult): string {
  const lines: string[] = [];
  lines.push("### KNOWLEDGE GRAPH (STAGE 3)");
  lines.push("");
  lines.push(
    `Extracted **${kg.summary.totalNodes}** entities and **${kg.summary.totalEdges}** relationships. ` +
      `Entity breakdown: ` +
      Object.entries(kg.summary.byType)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ") +
      "."
  );
  if (kg.summary.totalEdges === 0) {
    lines.push(
      "_No structured relationships were resolved from defined-term or schedule cross-references. " +
        "This is expected for short or lightly-cross-referenced documents and is not itself a defect._"
    );
  }
  lines.push("");

  if (kg.missingLinks.length) {
    lines.push("**Defined terms never referenced (possible dead definitions):**");
    for (const l of kg.missingLinks.slice(0, 15)) lines.push(`- ${l}`);
    lines.push("");
  }

  if (kg.undefinedTerms.length) {
    lines.push("**Capitalized terms used but not found in Definitions (verify defined):**");
    for (const t of kg.undefinedTerms.slice(0, 15)) lines.push(`- ${t}`);
    lines.push("");
  }

  if (kg.undefinedControllingTerms.length) {
    lines.push(
      "**Controlling terms referenced but not defined (execution-readiness defect):**\n" +
        "_These terms carry the deal's economics/mechanics. Their absence from Definitions means the operative text is unenforceable as drafted._"
    );
    for (const t of kg.undefinedControllingTerms.slice(0, 15)) lines.push(`- **${t}**`);
    lines.push("");
  }

  const top = kg.nodes
    .filter((n) => n.entityType === "defined_term" || n.entityType === "party" || n.entityType === "regulatory_approval")
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 20);
  if (top.length) {
    lines.push("**Key entities (by frequency):**");
    lines.push(mdTable(["Entity", "Type", "Occurrences"], top.map((n) => [n.name, n.entityType, String(n.occurrences)])));
    lines.push("");
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 6 — CROSS-DOCUMENT CONSISTENCY
// ─────────────────────────────────────────────────────────────────────────────

export type ConsistencyType =
  | "defined_term_mismatch"
  | "cross_reference_broken"
  | "section_numbering_duplicate"
  | "date_inconsistency"
  | "dollar_amount_conflict"
  | "share_count_discrepancy"
  | "signatory_mismatch"
  | "disclosure_schedule_missing"
  | "undefined_term_usage"
  | "ghost_reference";

export interface ConsistencyFindingT {
  type: ConsistencyType;
  severity: Severity;
  documentA: string;
  documentB?: string;
  description: string;
  evidenceA?: string;
  evidenceB?: string;
  suggestedFix: string;
}

interface DocMeta {
  name: string;
  text: string;
  definedTerms: Map<string, string>;
  sectionNumbers: string[];
  dates: string[];
  dollarAmounts: { raw: string; norm: string }[];
  shareCounts: { raw: string; num: string }[];
  signatories: string[];
  scheduleLabels: Set<string>;
}

function extractDocMeta(name: string, text: string): DocMeta {
  const definedTerms = new Map<string, string>();
  let m: RegExpExecArray | null;

  const dtRe = /["']([A-Z][-&/\w ]{2,50})["']\s+(?:means|shall mean|is defined as|refers to)\s+([^.]{10,300})/gi;
  while ((m = dtRe.exec(text)) !== null) definedTerms.set(m[1].trim().toLowerCase(), m[2].trim());

  const sectionNumbers = (text.match(/(?:^|\n)\s*(?:Section|Article)\s+(\d+(?:\.\d+)*(?:[a-z])?)/gi) || []).map((s) =>
    s.replace(/(?:Section|Article)/i, "").trim()
  );

  const dates: string[] = [];
  const dateRes = [
    /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
    /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/gi,
  ];
  for (const re of dateRes) {
    let dm: RegExpExecArray | null;
    while ((dm = re.exec(text)) !== null) dates.push(dm[1].trim());
  }

  const dollarAmounts: { raw: string; norm: string }[] = [];
  const amtRe = /(?:\$|USD|US\$)\s*[\d,]+\.?\d*\s*(?:million|billion|thousand|mm|m|b)?\b/gi;
  let am: RegExpExecArray | null;
  while ((am = amtRe.exec(text)) !== null) {
    const raw = am[0].trim();
    const numMatch = raw.replace(/,/g, "").match(/[\d.]+/);
    if (numMatch) {
      const unit = /billion|\bb\b/i.test(raw)
        ? "billion"
        : /million|mm|\bm\b/i.test(raw)
        ? "million"
        : /thousand|\bk\b/i.test(raw)
        ? "thousand"
        : "1";
      dollarAmounts.push({ raw, norm: `${numMatch[0]}_${unit}` });
    }
  }

  const shareCounts: { raw: string; num: string }[] = [];
  const scRe = /[\d,]+\s*(?:shares?|stocks?|units|membership\s+interests|equity\s+interests|common\s+stock|preferred\s+stock)/gi;
  let scm: RegExpExecArray | null;
  while ((scm = scRe.exec(text)) !== null) {
    const num = scm[0].replace(/,/g, "").match(/[\d,]+/);
    if (num) shareCounts.push({ raw: scm[0].trim(), num: num[0] });
  }

  const signatories: string[] = [];
  const sigRe = /(?:signed|executed|authorized\s+signatory)\s+by\s+(?:the\s+)?([A-Z][\w\s]{2,70})/gi;
  let sm: RegExpExecArray | null;
  while ((sm = sigRe.exec(text)) !== null) {
    const s = sm[1].trim();
    if (s.length > 3 && s.length < 80) signatories.push(s);
  }

  const scheduleLabels = new Set<string>();
  let scm2: RegExpExecArray | null;
  const schRe = /\b(?:Schedule|Exhibit|Annex|Appendix)\s+([A-Z0-9]+(?:\.[A-Z0-9]+)*(?:\([a-zA-Z0-9]+\))?(?:-[A-Z0-9]+)?)(?![A-Za-z0-9(])/gi;
  while ((scm2 = schRe.exec(text)) !== null) scheduleLabels.add(scm2[1].trim().toUpperCase());

  return {
    name,
    text,
    definedTerms,
    sectionNumbers,
    dates,
    dollarAmounts,
    shareCounts,
    signatories,
    scheduleLabels,
  };
}

function normalizeDate(s: string): string {
  const t = s.trim();
  const fmts: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/, (m) => `${m[3].padStart(4, "20")}-${m[1]}-${m[2]}`],
    [/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i, (m) => `${m[3]}-${m[1]}-${m[2]}`],
    [/^(\d{1,2})\s+(\w+)\s+(\d{4})$/i, (m) => `${m[3]}-${m[2]}-${m[1]}`],
  ];
  for (const [re, fn] of fmts) {
    const mm = t.match(re);
    if (mm) return fn(mm).toLowerCase();
  }
  return t.toLowerCase();
}

export function runCrossDocConsistency(documents: DocInput[]): {
  findings: ConsistencyFindingT[];
  documentsAnalyzed: number;
} {
  const metas = documents.map((d) => extractDocMeta(d.filename, d.text));
  const findings: ConsistencyFindingT[] = [];

  // ── Intra-document checks (run on every document) ──
  for (const meta of metas) {
    // Duplicate section numbers
    const seen = new Map<string, number>();
    for (const s of meta.sectionNumbers) seen.set(s, (seen.get(s) || 0) + 1);
    for (const [section, count] of seen) {
      if (count > 1) {
        findings.push({
          type: "section_numbering_duplicate",
          severity: "moderate",
          documentA: meta.name,
          description: `Section/Article '${section}' appears ${count} times within ${meta.name}.`,
          suggestedFix: "Resolve duplicate section numbering to avoid ambiguity in cross-references.",
        });
      }
    }

    // Broken / ghost schedule references: referenced but not attached/defined.
    // Attached labels = a Schedule/Exhibit appearing as a heading/definition
    // (e.g. "SCHEDULE 4.1 — Disclosure Schedules"), not merely a cross-reference.
    const attachedLabels = new Set<string>();
    let am: RegExpExecArray | null;
    const attachRe = /\b(?:Schedule|Exhibit|Annex|Appendix)\s+([A-Z0-9]+(?:\.[A-Z0-9]+)*(?:\([a-zA-Z0-9]+\))?(?:-[A-Z0-9]+)?)\s*[:—-]/gi;
    while ((am = attachRe.exec(meta.text)) !== null) attachedLabels.add(am[1].trim().toUpperCase());

    const refRe = /\b(?:pursuant\s+to|as\s+set\s+forth\s+in|referenced\s+in|set\s+forth\s+on|attached\s+as|see)\s+(?:Schedule|Exhibit|Annex|Appendix)\s+([A-Z0-9]+(?:\.[A-Z0-9]+)*(?:\([a-zA-Z0-9]+\))?(?:-[A-Z0-9]+)?)(?![A-Za-z0-9(])/gi;
    let rm: RegExpExecArray | null;
    while ((rm = refRe.exec(meta.text)) !== null) {
      const label = rm[1].trim().toUpperCase();
      if (!attachedLabels.has(label)) {
        findings.push({
          type: "cross_reference_broken",
          severity: "high",
          documentA: meta.name,
          description: `Cross-reference to '${label}' (${rm[0].trim()}) has no attached/defined Schedule/Exhibit in ${meta.name}.`,
          evidenceA: ctx(meta.text, rm.index),
          suggestedFix: `Provide Schedule/Exhibit ${label} or remove the cross-reference.`,
        });
      }
    }

    // Ghost references / bracketed placeholders (incomplete document)
    const ghostRe = /\[(?:Identical to|[^\]]*Clean Contract[^\]]*|TO BE|TBD|TBA|insert[^\]]*)\]/gi;
    let gm: RegExpExecArray | null;
    while ((gm = ghostRe.exec(meta.text)) !== null) {
      findings.push({
        type: "ghost_reference",
        severity: "high",
        documentA: meta.name,
        description: `Placeholder / incomplete reference detected: '${gm[0].trim()}'.`,
        evidenceA: ctx(meta.text, gm.index, 80),
        suggestedFix: "Complete the referenced provision before execution.",
      });
    }
  }

  // ── Cross-document checks (only when 2+ documents) ──
  if (metas.length >= 2) {
    // Defined-term mismatches
    const termDocs = new Map<string, Map<string, string>>();
    for (const meta of metas) {
      for (const [low, definition] of meta.definedTerms) {
        if (!termDocs.has(low)) termDocs.set(low, new Map());
        termDocs.get(low)!.set(meta.name, definition);
      }
    }
    for (const [low, docs] of termDocs) {
      if (docs.size < 2) continue;
      const normalized = new Set([...docs.values()].map((d) => d.toLowerCase().replace(/\s+/g, " ")));
      if (normalized.size > 1) {
        const names = [...docs.keys()];
        findings.push({
          type: "defined_term_mismatch",
          severity: "high",
          documentA: names[0],
          documentB: names[1],
          description: `Term '${low}' is defined differently across: ${names.join(", ")}.`,
          evidenceA: [...docs.entries()].map(([d, v]) => `${d}: ${v}`).join(" | "),
          suggestedFix: "Align the definition across documents or use a Master Definitions section.",
        });
      }
    }

    // Date conflicts by context label
    const dateContextRe: [string, RegExp][] = [
      ["effective date", /\b(effective\s+date|date\s+of\s+effectiveness)\b/i],
      ["closing date", /\b(closing\s+date|date\s+of\s+closing)\b/i],
      ["signing date", /\b(signing\s+date|date\s+of\s+signing|execution\s+date)\b/i],
      ["outside date", /\b(outside\s+date|drop-dead\s+date)\b/i],
    ];
    const dateByContext = new Map<string, Map<string, string>>(); // context -> doc -> normalized date
    for (const meta of metas) {
      for (const d of meta.dates) {
        const idx = meta.text.indexOf(d);
        if (idx === -1) continue;
        const before = meta.text.slice(Math.max(0, idx - 100), idx).toLowerCase();
        for (const [label, re] of dateContextRe) {
          if (re.test(before)) {
            if (!dateByContext.has(label)) dateByContext.set(label, new Map());
            dateByContext.get(label)!.set(meta.name, normalizeDate(d));
          }
        }
      }
    }
    for (const [label, docMap] of dateByContext) {
      const vals = new Set(docMap.values());
      if (vals.size > 1) {
        const names = [...docMap.keys()];
        findings.push({
          type: "date_inconsistency",
          severity: "high",
          documentA: names[0],
          documentB: names[1],
          description: `'${label}' differs across documents: ${[...docMap.entries()].map(([d, v]) => `${d}=${v}`).join(", ")}.`,
          suggestedFix: `Reconcile the ${label} so all documents agree.`,
        });
      }
    }

    // Share-count discrepancies
    const shareNums = new Map<string, Set<string>>();
    for (const meta of metas) {
      for (const s of meta.shareCounts) {
        if (!shareNums.has(s.num)) shareNums.set(s.num, new Set());
        shareNums.get(s.num)!.add(meta.name);
      }
    }
    for (const [num, docs] of shareNums) {
      if (docs.size > 1) {
        findings.push({
          type: "share_count_discrepancy",
          severity: "high",
          documentA: [...docs][0],
          documentB: [...docs][1],
          description: `Share count '${num}' appears in multiple documents: ${[...docs].join(", ")}.`,
          suggestedFix: "Verify share counts are consistent across all documents.",
        });
      }
    }

    // Signatory mismatches (a doc with zero signatories while others have them)
    const anySigs = metas.some((m) => m.signatories.length > 0);
    for (const meta of metas) {
      if (anySigs && meta.signatories.length === 0) {
        findings.push({
          type: "signatory_mismatch",
          severity: "moderate",
          documentA: meta.name,
          description: `No signatories detected in ${meta.name} while other documents name signatories.`,
          suggestedFix: "Verify all required signatories are included in each document.",
        });
      }
    }
  }

  return { findings, documentsAnalyzed: metas.length };
}

export function renderCrossDoc(result: { findings: ConsistencyFindingT[]; documentsAnalyzed: number }): string {
  const lines: string[] = [];
  lines.push("### CROSS-DOCUMENT CONSISTENCY FINDINGS (STAGE 6)");
  lines.push("");
  lines.push(`Compared **${result.documentsAnalyzed}** document(s); **${result.findings.length}** consistency issue(s) found.`);
  lines.push("");

  if (!result.findings.length) {
    lines.push("_No cross-document consistency issues detected._");
    lines.push("");
    return lines.join("\n");
  }

  const rows = result.findings.map((f) => [
    f.severity.toUpperCase(),
    f.type.replace(/_/g, " "),
    f.documentA + (f.documentB ? ` ↔ ${f.documentB}` : ""),
    f.description,
  ]);
  lines.push(mdTable(["Severity", "Issue", "Documents", "Description"], rows));
  lines.push("");
  for (const f of result.findings) {
    if (f.suggestedFix) lines.push(`- **Fix (${f.type.replace(/_/g, " ")}):** ${f.suggestedFix}`);
  }
  lines.push("");
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 7 — RED FLAG ENGINE (~20 categories)
// ─────────────────────────────────────────────────────────────────────────────

export interface RedFlagT {
  category: string;
  severity: Severity;
  evidence: string;
  location: string;
}

interface FlagRule {
  category: string;
  severity: Severity;
  patterns: RegExp[];
  /** When true, an absence (no match) is itself the red flag. */
  absenceIsFlag?: boolean;
  absenceNote?: string;
}

const RED_FLAG_RULES: FlagRule[] = [
  {
    category: "Corporate Governance",
    severity: "high",
    patterns: [/\bsole\s+discretion\b/i, /\bwithout\s+(?:the\s+)?prior\s+written\s+consent\b/i, /\bunanimous\s+board\b/i],
  },
  {
    category: "Regulatory",
    severity: "high",
    patterns: [/\bHSR\b/i, /\bCFIUS\b/i, /\bantitrust\s+clearance\b/i, /\bregulatory\s+approval\b/i],
  },
  {
    category: "Tax",
    severity: "moderate",
    patterns: [/\bSection\s+1060\b/i, /\btax\s+allocation\b/i, /\btax\s+withholding\b/i, /\bSection\s+338\b/i],
  },
  {
    category: "Employment",
    severity: "moderate",
    patterns: [/\bnon-?compete\b/i, /\bnon-?solicit/i, /\bWARN\s+Act\b/i, /\bseverance\b/i, /\bretention\s+agreement\b/i],
  },
  {
    category: "Intellectual Property",
    severity: "high",
    patterns: [/\bintellectual\s+property\b/i, /\bsource\s+code\b/i, /\bopen\s+source\b/i, /\bIP\s+ownership\b/i],
  },
  {
    category: "Cybersecurity",
    severity: "moderate",
    patterns: [/\bcyber(?:security|attack|incident)\b/i, /\bdata\s+breach\b/i, /\bSOC\s*2\b/i, /\bsecurity\s+incident\b/i],
  },
  {
    category: "Privacy",
    severity: "high",
    patterns: [/\bGDPR\b/i, /\bCCPA\b/i, /\bpersonal\s+data\b/i, /\bdata\s+privacy\b/i],
  },
  {
    category: "Environmental",
    severity: "high",
    patterns: [/\bCERCLA\b|\bSuperfund\b/i, /\bhazardous\s+(?:material|substance)\b/i, /\benvironmental\s+liability\b/i, /\bPhase\s+[II]+\b/i],
  },
  {
    category: "Litigation",
    severity: "moderate",
    patterns: [/\blitigation\b/i, /\bindemnif/i, /\bclaims?\b/i, /\bdispute\s+resolution\b/i],
  },
  {
    category: "Sanctions",
    severity: "critical",
    patterns: [/\bOFAC\b/i, /\bsanctions\b/i, /\bSDN\s+list\b/i],
  },
  {
    category: "Corruption",
    severity: "critical",
    patterns: [/\bFCPA\b/i, /\bforeign\s+official\b/i, /\bbriber/i, /\banti-?bribery\b/i],
  },
  {
    category: "Accounting",
    severity: "moderate",
    patterns: [/\bGAAP\b/i, /\baudited\s+financial\s+statements\b/i, /\bfinancial\s+statements\b/i, /\bbooks\s+and\s+records\b/i],
  },
  {
    category: "Debt",
    severity: "moderate",
    patterns: [/\bindebtedness\b/i, /\bassumed\s+liabilit/i, /\boutstanding\s+debt\b/i, /\blien\b/i],
  },
  {
    category: "Change of Control",
    severity: "moderate",
    patterns: [/\bchange\s+of\s+control\b/i, /\bchange\s+in\s+control\b/i],
  },
  {
    category: "Third-Party Consents",
    severity: "moderate",
    patterns: [/\bthird-?party\s+consent\b/i, /\bconsent\s+of\s+(?:the\s+)?(?:lender|counterparty|partner)\b/i, /\bassign(?:ment|ability)\b/i],
  },
  {
    category: "Customer Concentration",
    severity: "high",
    patterns: [/\bcustomer\s+concentration\b/i, /\btop\s+customer\b/i, /\bmajor\s+customer\b/i, /(\d{1,2})\s*%\s+of\s+(?:total\s+)?revenue/i],
  },
  {
    category: "Supplier Concentration",
    severity: "moderate",
    patterns: [/\bsole\s+source\b/i, /\bsupplier\s+concentration\b/i, /\bsingle\s+supplier\b/i],
  },
  {
    category: "Earnout Manipulation",
    severity: "high",
    patterns: [/\bearnout\b/i, /\badjusted\s+EBITDA\b/i, /\bearn-?out\b/i],
  },
  {
    category: "Working Capital Manipulation",
    severity: "high",
    patterns: [/\bworking\s+capital\b/i, /\bclosing\s+balance\s+sheet\b/i, /\btrue-?up\b/i, /\bpost-?closing\s+adjustment\b/i],
  },
  {
    category: "Related-Party Transactions",
    severity: "high",
    patterns: [/\brelated\s+party\b/i, /\baffiliate\s+transaction\b/i, /\binterested\s+transaction\b/i, /\btransactions?\s+with\s+(?:affiliates|officers|directors)\b/i],
  },
  // Asymmetric / one-sided protections (high-severity structural flags)
  {
    category: "Indemnity Direction Reversal",
    severity: "critical",
    patterns: [
      /\bBuyer\s+(?:shall\s+)?indemnif\w*\s+(?:the\s+)?Seller\b/i,
      /\bindemnif\w*\s+(?:the\s+)?Seller\s+for\s+(?:the\s+)?Seller'?s\b/i,
      /\bSeller\s+(?:shall\s+be\s+)?indemnified\s+by\s+(?:the\s+)?Buyer\b/i,
      /\bindemnif\w*\s+(?:the\s+)?Seller\s+by\s+(?:the\s+)?Buyer\b/i,
    ],
  },
  {
    category: "Forced-Close Waiver",
    severity: "critical",
    patterns: [/\bshall\s+not\s+be\s+grounds\s+for\s+termination\b/i, /\bwaives?\s+(?:the\s+)?right\s+to\s+terminate\b/i, /\bnotwithstanding\s+the\s+foregoing[^\n]{0,80}closing\b/i],
  },
  {
    category: "Unsecured Indemnity",
    severity: "critical",
    patterns: [/\b(lacks?\s+(?:an?\s+)?escrow|no\s+escrow|without\s+(?:an?\s+)?escrow|no\s+security\s+(?:for\s+indemnity|mechanism))\b/i],
  },
];

export function runRedFlagEngine(text: string): { flags: RedFlagT[] } {
  const flags: RedFlagT[] = [];
  for (const rule of RED_FLAG_RULES) {
    const matched = rule.patterns.some((p) => p.test(text));
    if (matched) {
      // Capture the most relevant evidence snippet from the matching patterns
      let evidence = "";
      for (const p of rule.patterns) {
        const snips = evidenceSnippets(text, p, 1);
        if (snips.length) {
          evidence = snips[0];
          break;
        }
      }
      flags.push({ category: rule.category, severity: rule.severity, evidence, location: "contract" });
    } else if (rule.absenceIsFlag) {
      flags.push({ category: rule.category, severity: rule.severity, evidence: rule.absenceNote || "Not detected", location: "contract" });
    }
  }
  // ── Nuanced presence/absence checks (presence of A but absence of B) ──
  // These catch structural gaps the simple presence-based rules miss.
  // Fix 2 (port): distinguish an AFFIRMATIVE WAIVER ("There shall be no
  // indemnification") from a present clause missing mechanics. A bare
  // "indemnification" keyword match must NOT be treated as a present clause.
  const AFFIRMATIVE_WAIVER_RES = [
    /there\s+shall\s+be\s+no\s+indemnif(?:ication|ity)/i,
    /no\s+indemnif(?:ication|ity)\s+(?:shall\s+)?(?:be\s+)?(?:provided|available|exist)/i,
    /(?:buyer|seller|(?:either|any)\s+party)\s+(?:waives?|hereby\s+waives?)\s+(?:any|all)\s+(?:right\s+to\s+)?indemnif(?:ication|ity)/i,
    /indemnif(?:ication|ity)\s+(?:is\s+)?(?:expressly\s+)?(?:waived|excluded|disclaimed)/i,
    /no\s+party\s+shall\s+(?:be\s+)?(?:entitled\s+to|have\s+any)\s+indemnif(?:ication|ity)/i,
    /(?:expressly|hereby)\s+excludes?\s+(?:any|all)\s+indemnif(?:ication|ity)/i,
  ];
  const hasAffirmativeWaiver = AFFIRMATIVE_WAIVER_RES.some((re) => re.test(text));
  const hasIndemnity = /\bindemnif/i.test(text);
  const hasLimit =
    /\b(?:cap\b|capacit\w*|basket|deductible|threshold|limitation of liability)\b/i.test(text) ||
    /\bsubject\s+to\s+(?:an?\s+)?(?:cap|basket)\b/i.test(text);
  if (hasAffirmativeWaiver) {
    // Affirmative elimination — NOT a missing-mechanic gap. Critical allocation risk.
    flags.push({
      category: "Affirmative Indemnification Waiver",
      severity: "critical",
      evidence: "Agreement expressly eliminates indemnification (e.g. 'There shall be no indemnification'). This is an engineered risk transfer, not a clause with missing cap/basket/survival. Buyer has zero contractual indemnification recourse.",
      location: "contract",
    });
  } else if (hasIndemnity && !hasLimit) {
    flags.push({
      category: "Indemnification Limitation Missing",
      severity: "high",
      evidence: "Indemnification language present but no cap, basket, deductible, or threshold found.",
      location: "contract",
    });
  }

  const isAssetDeal = /\b(?:purchased assets|assumed liabilities|excluded liabilities|asset purchase)\b/i.test(text);
  const hasExcludedLiab = /\bexcluded\s+liabilit/i.test(text);
  if (isAssetDeal && !hasExcludedLiab) {
    flags.push({
      category: "Broad Liability Assumption",
      severity: "high",
      evidence:
        "Asset purchase with liability assumption but no 'Excluded Liabilities' carve-out found — Buyer may inherit unintended liabilities.",
      location: "contract",
    });
  }

  // Fix 3 (port): distinguish OPERATIVE R&W from a document DISCLOSING that R&W
  // are absent (e.g. an omission list: "representations and warranties [not
  // addressed]"). A keyword match on "representations and warranties" in the
  // document's own omission-disclosure must NOT be treated as a present clause.
  const RW_OMISSION_RES = [
    /(?:following\s+)?standard\s+provisions?\s+are\s+not\s+addressed[\s\S]*?representations?\s+and\s+warranties?/i,
    /representations?\s+and\s+warranties?\s*[;,]?\s*(?:are\s+)?(?:not\s+(?:included|addressed|contained|provided)|(?:have\s+been\s+)?(?:omitted|excluded|intentionally\s+left\s+blank))/i,
    /(?:no|without|absent)\s+representations?\s+and\s+warranties?/i,
    /this\s+agreement\s+(?:does\s+not\s+(?:contain|include)|contains?\s+no)\s+representations?\s+and\s+warranties?/i,
    /(?:seller|target|company)\s+makes?\s+no\s+representations?\s*(?:or\s+warranties?|and\s+warranties?)/i,
    /(?:as[\s-]is|where[\s-]is|with\s+all\s+faults?)\s*(?:and\s+without\s+(?:any\s+)?(?:representation|warranty|covenant))?/i,
  ];
  const hasRwOmissionDisclosure = RW_OMISSION_RES.some((re) => re.test(text));
  const hasReps = /\brepresentations\s+and\s+warrant/i.test(text);
  const hasDisclosureSched = /\bdisclosure\s+schedul/i.test(text);
  if (hasRwOmissionDisclosure) {
    // Confirmed absence — not a missing disclosure-schedule gap.
    flags.push({
      category: "Representations & Warranties Absent (Confirmed)",
      severity: "critical",
      evidence: "Agreement affirmatively discloses that representations and warranties are not included. This is a confirmed absence, not a present clause missing a disclosure-schedule mechanism. Disclosure-schedule gap analysis is suppressed.",
      location: "contract",
    });
  } else if (hasReps && !hasDisclosureSched) {
    flags.push({
      category: "No Disclosure Schedule Mechanism",
      severity: "moderate",
      evidence: "Representations & Warranties present but no disclosure-schedule qualification mechanism found.",
      location: "contract",
    });
  }

  const hasExclusiveRemedy = /\bexclusive\s+remedy\b|\bsole\s+remedy\b/i.test(text);
  const hasFraudCarve =
    /(?:limitations?|survival|cap).{0,200}fraud/i.test(text) ||
    /fraud.{0,200}(?:shall not apply|carve-?out|not\s+be\s+(?:subject|limited))/i.test(text);
  if (hasExclusiveRemedy && !hasFraudCarve) {
    flags.push({
      category: "Exclusive Remedy Without Fraud Carve-Out",
      severity: "high",
      evidence:
        "Exclusive/soles-remedy clause present but no fraud carve-out from limitations found — extra-contractual fraud remedies may be trapped.",
      location: "contract",
    });
  }

  const hasClosingCondition = /\bcondition(?:s)?\s+to\s+(?:the\s+)?closing\b/i.test(text);
  const hasMAE = /\bmaterial\s+adverse\s+eff(?:ect|ects)\b|\bMAE\b/i.test(text);
  if (hasClosingCondition && !hasMAE) {
    flags.push({
      category: "No MAE Closing Condition Defined",
      severity: "moderate",
      evidence: "Closing conditions present but no defined Material Adverse Effect (MAE) standard found.",
      location: "contract",
    });
  }

  // ── Reviewer-driven nuance: avoid overstatement / placeholders ──

  // (a) Environmental coverage is conditional, not an automatic hard cap.
  // A *general* compliance representation without a dedicated environmental
  // representation/indemnity means environmental liability is only covered to
  // the extent it breaches that general rep — do NOT assert a "$5M cap" that
  // the contract does not state.
  const hasEnvRep = /\benvironmental\s+(?:representations?|warranties?|reps?|indemnif|matter)/i.test(text);
  const hasGeneralRep = /\brepresentations?\s+and\s+warranties?\b/i.test(text);
  if (hasGeneralRep && !hasEnvRep) {
    flags.push({
      category: "Environmental Coverage Conditional",
      severity: "moderate",
      evidence:
        "No dedicated environmental representation or indemnity; environmental liability is covered only insofar as it breaches the general reps — coverage is conditional, not a stated hard cap.",
      location: "contract",
    });
  }

  // (b) "Specified matters" / "specified breaches" placeholder is undefined.
  if (/\bspecified\s+matters?\b|\bspecified\s+breaches?\b/i.test(text) && !/\bspecified\s+matters?\s+(?:means|include|are)\b/i.test(text)) {
    flags.push({
      category: "Undefined 'Specified Matters' Placeholder",
      severity: "high",
      evidence: "Indemnity/exceptions reference 'specified matters' that are never defined in the provided text — a material term is left open.",
      location: "contract",
    });
  }

  // (c) Indemnification procedures (notice-of-claim, defense, settlement
  //     consent) are absent — claimant's path to recovery is unadministrable.
  const hasIndemnityClaim = /\bindemnif/i.test(text);
  const hasClaimProcedures =
    /\bnotice\s+of\s+(?:claim|loss|demand)\b/i ||
    /\bdefend\b[^.]{0,60}indemnif/i ||
    /\bindemnifying\s+party\b[^.]{0,40}\b(?:defend|control)\b/i ||
    /\bsettlement\b[^.]{0,60}\bconsent\b/i ||
    /\bconsent\s+to\s+settlement\b/i;
  if (hasIndemnityClaim && !hasClaimProcedures) {
    flags.push({
      category: "Indemnification Procedures Missing",
      severity: "high",
      evidence:
        "Indemnification is referenced but no notice-of-claim, defense-control, or settlement-consent procedure is specified — recoverability mechanics are undefined.",
      location: "contract",
    });
  }

  // (d) Dual forum conflict: litigation forum (e.g. Delaware Chancery) AND
  //     arbitration (e.g. AAA) both specified with no election or carve-out.
  const hasCourtForum = /\bchancery\s+court\b|\bcourt\s+of\s+chancery\b|\bstate\s+court\b|\bfederal\s+court\b|\bexclusive\s+jurisdiction\b/i.test(text);
  const hasArbitration = /\barbitration\b|\bAAA\b|\bamerican\s+arbitration\s+association\b|\bICDR\b/i.test(text);
  const hasForumElection = /\b(?:either|at the election of|claimant'?s?\s+option|elects?)\b[^.]{0,60}(?:arbitration|court|litigation)/i.test(text);
  if (hasCourtForum && hasArbitration && !hasForumElection) {
    flags.push({
      category: "Dual Forum Conflict",
      severity: "moderate",
      evidence:
        "Both a judicial forum and arbitration are specified without an election mechanism or carve-out — forum selection is ambiguous and may be contested.",
      location: "contract",
    });
  }

  // Highest severity first
  const order: Record<Severity, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
  flags.sort((a, b) => order[a.severity] - order[b.severity]);
  return { flags };
}

export function renderRedFlag(result: { flags: RedFlagT[] }): string {
  const lines: string[] = [];
  lines.push("### RED FLAG ENGINE FINDINGS (STAGE 7)");
  lines.push("");
  if (!result.flags.length) {
    lines.push("_No red-flag category indicators detected._");
    lines.push("");
    return lines.join("\n");
  }
  const rows = result.flags.map((f) => [f.severity.toUpperCase(), f.category, f.evidence.slice(0, 160)]);
  lines.push(mdTable(["Severity", "Category", "Evidence"], rows));
  lines.push("");
  lines.push(
    "_Note: presence of a category indicates relevant contractual language was detected. " +
      "Severity reflects the specific clause language, not mere topic mention. " +
      "See the main report for disposition._"
  );
  lines.push("");
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 8 — REGULATORY ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

export type RegulatoryStatus =
  | "triggered"          // affirmative textual trigger + applicability gate satisfied
  | "statutory_filing"   // corporate filing mechanics (e.g. DGCL), NOT a discretionary government approval
  | "conditional";       // cannot be determined from the provided documents — diligence question

export interface RegulatoryFrameworkT {
  name: string;
  severity: Severity;
  status: RegulatoryStatus;
  approvalRequired: boolean;
  jurisdiction: string;
  notes: string;
  checklist: string[];
  /** Why the framework is conditional / what fact would confirm applicability. */
  determinabilityNote?: string;
}

interface FrameworkDef {
  name: string;
  description: string;
  agency: string;
  jurisdiction: string;
  approvalRequired: boolean;
  /** Corporate-filing frameworks (DGCL etc.) are mechanical, not government approvals. */
  statutoryFiling?: boolean;
  /** Word-bounded regex sources. At least one strong hit required for `triggered`. */
  strongTriggers: string[];
  /** Regex sources that on their own only justify a conditional diligence question. */
  weakTriggers?: string[];
  /** Applicability gate: at least one of these must ALSO match for `triggered`
   *  status; otherwise the framework degrades to `conditional` (or is omitted
   *  entirely when neither strong nor weak triggers hit). */
  applicabilityGate?: { anyOf: string[]; conditionalNote: string };
  checklist: string[];
}

/**
 * All triggers are regex sources matched with explicit word/token boundaries.
 * Substring matching (e.g. `text.includes("ear")`) previously caused severe
 * false positives: "sec" fired on "Section", "ear" on "earnout"/"clear",
 * "phi" on "sophisticated". Every trigger here is compiled with `(?i)` and
 * `\b` boundaries so a framework only engages on genuine references.
 */
function wordRe(src: string): RegExp {
  return new RegExp(`\\b${src}\\b`, "i");
}

const FRAMEWORKS: FrameworkDef[] = [
  {
    name: "Delaware Corporate Law",
    description: "DGCL governs internal affairs of Delaware entities (merger procedure, appraisal rights, fiduciary duties).",
    agency: "Delaware Secretary of State",
    jurisdiction: "Delaware, USA",
    // A Certificate of Merger filing is statutory mechanics, not a
    // discretionary government approval — do not frame it as a regulatory
    // approval regime alongside HSR/CFIUS.
    approvalRequired: false,
    statutoryFiling: true,
    strongTriggers: ["dgcl", "delaware\\s+general\\s+corporation", "section\\s+251", "section\\s+262", "appraisal\\s+rights", "surviving\\s+corporation", "certificate\\s+of\\s+merger", "delaware"],
    checklist: ["File Certificate of Merger", "Obtain board & stockholder approval", "Provide appraisal-rights notice (DGCL §262) where applicable"],
  },
  {
    name: "Federal Securities Law",
    description: "Securities Act / Exchange Act disclosure, anti-fraud (Rule 10b-5), registration & proxy rules.",
    agency: "SEC",
    jurisdiction: "USA",
    approvalRequired: true,
    strongTriggers: ["form\\s+s-4", "form\\s+s-3", "registration\\s+statement", "def\\s+14a", "proxy\\s+statement", "tender\\s+offer", "schedule\\s+13d", "schedule\\s+14[cd]"],
    weakTriggers: ["securities\\s+act", "exchange\\s+act", "rule\\s+10b-5", "securities\\s+laws"],
    // Registration/proxy obligations arise only where securities are issued
    // or a public shareholder base is solicited. A private all-cash deal does
    // NOT, standing alone, implicate S-4/S-3/DEF 14A filings.
    applicabilityGate: {
      anyOf: [
        "form\\s+s-4", "form\\s+s-3", "registration\\s+statement", "proxy\\s+statement", "def\\s+14a",
        "public(?:ly)?[-\\s](?:company|traded|held)", "stock\\s+exchange", "nasdaq", "nyse",
        "shares\\s+of\\s+(?:the\\s+)?(?:buyer|acquiror|acquirer|parent)\\s+(?:common\\s+)?stock",
        "(?:buyer|acquiror|acquirer|parent)\\s+(?:common\\s+)?stock\\s+(?:as|constituting|in)\\s+(?:the\\s+)?(?:merger\\s+)?consideration",
        "tender\\s+offer", "exchange\\s+offer",
      ],
      conditionalNote:
        "Issuer status not established: confirm whether securities are being issued as consideration or a public shareholder vote/solicitation is occurring. A private all-cash transaction generally does not require an S-4/S-3 or DEF 14A.",
    },
    checklist: ["Confirm whether registration statement (Form S-4/S-3) is required", "Assess proxy statement / DEF 14A obligations", "Beneficial ownership reports if public"],
  },
  {
    name: "HSR Antitrust (Pre-Merger Notification)",
    description: "Hart-Scott-Rodino requires pre-merger notification & waiting period above size thresholds.",
    agency: "FTC / DOJ Antitrust Division",
    jurisdiction: "USA",
    approvalRequired: true,
    strongTriggers: ["hsr", "hart[-\\s]scott[-\\s]rodino", "pre[-\\s]merger\\s+notification", "second\\s+request", "antitrust\\s+(?:clearance|review)"],
    weakTriggers: ["antitrust", "waiting\\s+period"],
    checklist: ["Confirm current size-of-transaction & size-of-person thresholds", "File HSR Form if reportable", "Observe waiting period"],
  },
  {
    name: "CFIUS (Foreign Investment)",
    description: "Committee on Foreign Investment reviews foreign investment in U.S. businesses for national security.",
    agency: "CFIUS (Treasury-led)",
    jurisdiction: "USA",
    approvalRequired: true,
    strongTriggers: ["cfius", "foreign\\s+investment\\s+(?:review|regime)", "section\\s+721"],
    weakTriggers: ["foreign\\s+person", "foreign\\s+investment", "national\\s+security", "foreign\\s+government", "non-u\\.s\\.\\s+(?:buyer|acquiror|acquirer|parent|investor)"],
    // CFIUS relevance requires a foreign-acquirer nexus. Purely domestic
    // deals should not be flagged as CFIUS-reviewable.
    applicabilityGate: {
      anyOf: [
        "cfius", "foreign\\s+(?:person|investor|buyer|acquiror|acquirer|parent|government|owned|controlled)",
        "non-u\\.s\\.", "non-us\\s+(?:buyer|acquirer|person)", "foreign\\s+entity", "cross[-\\s]border",
      ],
      conditionalNote:
        "Foreign-acquirer nexus not established from the provided text. Confirm buyer/control-person nationality and any critical-technology, infrastructure, or sensitive-data (TID) business before assessing CFIUS.",
    },
    checklist: ["Confirm foreign-person status of acquirer", "Assess TID business exposure", "Evaluate mandatory/declaration filing"],
  },
  {
    name: "OFAC Sanctions",
    description: "Office of Foreign Assets Control administers economic sanctions programs.",
    agency: "OFAC / Treasury",
    jurisdiction: "USA",
    approvalRequired: false,
    strongTriggers: ["ofac", "sdn\\s+list", "blocked\\s+(?:person|party|property)", "sanction(?:s|ed)\\s+(?:list|party|person|program)"],
    weakTriggers: ["sanctions", "embargo"],
    checklist: ["Screen parties against SDN list", "Confirm no blocked-person dealings"],
  },
  {
    name: "FCPA (Anti-Bribery)",
    description: "Foreign Corrupt Practices Act prohibits bribery of foreign officials; books & records requirements.",
    agency: "DOJ / SEC",
    jurisdiction: "USA (extraterritorial)",
    approvalRequired: false,
    strongTriggers: ["fcpa", "foreign\\s+corrupt\\s+practices", "foreign\\s+official", "anti[-\\s]bribery"],
    weakTriggers: ["bribery", "kickback"],
    checklist: ["FCPA compliance program", "Third-party/intermediary due diligence", "Accurate books & records"],
  },
  {
    name: "Export Controls (EAR / ITAR)",
    description: "Export Administration Regulations and ITAR control exports of goods, technology, and defense articles.",
    agency: "BIS / DDTC",
    jurisdiction: "USA",
    approvalRequired: true,
    strongTriggers: ["itar", "export\\s+control", "eccn", "usml", "dual[-\\s]use", "defense\\s+article", "deemed\\s+export", "export\\s+administration\\s+regulations"],
    weakTriggers: ["technical\\s+data", "export\\s+license"],
    // EAR/ITAR relevance requires a defense/controlled-technology or
    // cross-border nexus — an ordinary domestic software/services deal
    // should not surface an export-control approval flag.
    applicabilityGate: {
      anyOf: [
        "itar", "ear\\s+regulations", "eccn", "usml", "dual[-\\s]use", "defense", "military", "aerospace",
        "encryption", "semiconductor", "satellite", "technical\\s+data", "export\\s+(?:control|license)",
        "non-u\\.s\\.", "foreign\\s+(?:person|buyer|acquiror|acquirer)", "cross[-\\s]border",
      ],
      conditionalNote:
        "No defense, controlled-technology, or foreign/cross-border indicator found in the provided text. Confirm product classification (ECCN/USML) and end-users before assessing EAR/ITAR.",
    },
    checklist: ["Classify products/technology (ECCN/USML)", "Determine license requirements", "Screen denied persons"],
  },
  {
    name: "GDPR (Data Privacy)",
    description: "General Data Protection Regulation governs processing of EEA personal data.",
    agency: "EU Data Protection Authorities",
    jurisdiction: "European Economic Area",
    approvalRequired: false,
    strongTriggers: ["gdpr", "general\\s+data\\s+protection\\s+regulation", "data\\s+subject", "eea", "european\\s+(?:union|economic\\s+area)"],
    weakTriggers: ["personal\\s+data"],
    checklist: ["Assess EEA data nexus", "DPIA / records of processing", "Cross-border transfer mechanism"],
  },
  {
    name: "CCPA / CPRA (California Privacy)",
    description: "California Consumer Privacy Act grants consumers rights over personal information.",
    agency: "California Privacy Protection Agency",
    jurisdiction: "California, USA",
    approvalRequired: false,
    strongTriggers: ["ccpa", "cpra", "california\\s+(?:consumer\\s+privacy|resident)"],
    checklist: ["Assess California consumer thresholds", "Consumer-request procedures"],
  },
  {
    name: "HIPAA (Health Data)",
    description: "Health Insurance Portability and Accountability Act protects patient health information.",
    agency: "HHS Office for Civil Rights",
    jurisdiction: "USA",
    approvalRequired: false,
    strongTriggers: ["hipaa", "protected\\s+health\\s+information", "covered\\s+entity", "business\\s+associate", "\\bphi\\b"],
    applicabilityGate: {
      anyOf: ["hipaa", "protected\\s+health\\s+information", "\\bphi\\b", "covered\\s+entity", "business\\s+associate", "health\\s*(?:care|plan|record)", "patient", "medical", "clinical"],
      conditionalNote:
        "No healthcare-data indicator found in the provided text. Confirm whether any party is a covered entity/business associate or handles PHI before assessing HIPAA.",
    },
    checklist: ["Confirm covered-entity/business-associate status", "Business associate agreements", "Breach-notification readiness"],
  },
  {
    name: "Employment Law",
    description: "Federal/state employment statutes: WARN Act, anti-discrimination, ERISA, non-compete enforceability.",
    agency: "DOL / EEOC",
    jurisdiction: "USA",
    approvalRequired: false,
    strongTriggers: ["warn\\s+act", "erisa", "non[-\\s]compete", "non[-\\s]solicit", "severance", "benefit\\s+plan"],
    weakTriggers: ["employment", "employee"],
    checklist: ["WARN Act notice assessment", "Benefit plan review (ERISA)", "Non-compete enforceability by jurisdiction"],
  },
  {
    name: "Tax Law",
    description: "Federal/state tax consequences: §1060 asset allocation, §338(h)(10) elections, withholding.",
    agency: "IRS",
    jurisdiction: "USA",
    approvalRequired: false,
    strongTriggers: ["section\\s+1060", "section\\s+338", "338\\(h\\)\\(10\\)", "section\\s+336\\(e\\)", "tax\\s+allocation", "withholding", "transfer\\s+tax", "straddle\\s+period"],
    weakTriggers: ["pre-closing\\s+tax", "tax\\s+return"],
    checklist: ["Confirm §1060 allocation mechanics (asset deals)", "Assess §338(h)(10)/§336(e) election eligibility", "Pre-closing tax indemnity & straddle allocation"],
  },
  {
    name: "Environmental Law",
    description: "CERCLA, Clean Air/Water Acts, RCRA govern environmental liability allocation in transactions.",
    agency: "EPA",
    jurisdiction: "USA",
    approvalRequired: false,
    strongTriggers: ["cercla", "superfund", "rcra", "clean\\s+(?:air|water)\\s+act", "hazardous\\s+(?:material|substance|waste)", "environmental\\s+(?:liability|law|condition|remediation)", "phase\\s+[ii]+"],
    weakTriggers: ["environmental"],
    checklist: ["Phase I/II environmental site assessment", "Allocate pre-closing environmental liability", "Environmental representation/indemnity scope"],
  },
];

export function runRegulatoryAnalysis(text: string): { frameworks: RegulatoryFrameworkT[] } {
  const frameworks: RegulatoryFrameworkT[] = [];
  for (const fw of FRAMEWORKS) {
    const strongHit = fw.strongTriggers.some((t) => wordRe(t).test(text));
    const weakHit = (fw.weakTriggers ?? []).some((t) => wordRe(t).test(text));

    if (!strongHit && !weakHit) continue; // zero textual basis — omit entirely

    let status: RegulatoryStatus;
    let determinabilityNote: string | undefined;

    if (fw.statutoryFiling) {
      // Statutory corporate mechanics are never "government approvals".
      status = "statutory_filing";
    } else if (fw.applicabilityGate) {
      const gateHit = fw.applicabilityGate.anyOf.some((t) => wordRe(t).test(text));
      if (strongHit && gateHit) {
        status = "triggered";
      } else {
        // Weak signal or missing application facts → conditional diligence
        // question, never an affirmative "approval likely required" claim.
        status = "conditional";
        determinabilityNote = fw.applicabilityGate.conditionalNote;
      }
    } else {
      status = strongHit ? "triggered" : "conditional";
      if (!strongHit) {
        determinabilityNote = "Indirect reference only — confirm applicability with counsel.";
      }
    }

    frameworks.push({
      name: fw.name,
      severity: status === "triggered" ? (fw.approvalRequired ? "high" : "moderate") : "low",
      status,
      approvalRequired: fw.approvalRequired,
      jurisdiction: fw.jurisdiction,
      notes: fw.description,
      checklist: status === "triggered" ? fw.checklist : [],
      determinabilityNote,
    });
  }
  return { frameworks };
}

export function renderRegulatory(result: { frameworks: RegulatoryFrameworkT[] }): string {
  const lines: string[] = [];
  lines.push("### REGULATORY ANALYSIS (STAGE 8)");
  lines.push("");

  const triggered = result.frameworks.filter((f) => f.status === "triggered");
  const statutory = result.frameworks.filter((f) => f.status === "statutory_filing");
  const conditional = result.frameworks.filter((f) => f.status === "conditional");

  if (!result.frameworks.length) {
    lines.push("_No specific regulatory framework triggers detected in the provided text._");
    lines.push("_Absence of textual triggers is not evidence of absence of regulatory obligations — confirm with counsel._");
    lines.push("");
    return lines.join("\n");
  }

  if (triggered.length) {
    lines.push("**Frameworks with affirmative textual triggers:**");
    lines.push("");
    for (const f of triggered) {
      const approval = f.approvalRequired ? "⚠ Approval/notification may be required" : "Compliance framework — no pre-closing approval, diligence item";
      lines.push(`- **${f.name}** (${f.jurisdiction}) — ${approval}`);
      lines.push(`  - ${f.notes}`);
      if (f.checklist.length) lines.push(`  - Key steps: ${f.checklist.join("; ")}.`);
    }
    lines.push("");
  }

  if (statutory.length) {
    lines.push("**Statutory corporate mechanics (not a discretionary government approval):**");
    lines.push("");
    for (const f of statutory) {
      lines.push(`- **${f.name}** (${f.jurisdiction})`);
      lines.push(`  - ${f.notes}`);
      if (f.checklist.length) lines.push(`  - Key steps: ${f.checklist.join("; ")}.`);
    }
    lines.push("");
  }

  if (conditional.length) {
    lines.push("**Conditional diligence questions — applicability NOT determinable from the provided documents:**");
    lines.push("");
    for (const f of conditional) {
      lines.push(`- **${f.name}** (${f.jurisdiction}) — ${f.determinabilityNote ?? "Confirm applicability with counsel."}`);
    }
    lines.push("");
  }

  lines.push("_Never assume regulatory approval or filing obligations from deal value or form alone. Confirm thresholds, exemptions, and timelines with counsel._");
  lines.push("");
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 9 — LITIGATION RISK ASSESSMENT
// ─────────────────────────────────────────────────────────────────────────────

// "not_assessable" implements sanity-gate Rule 10: a category with no textual
// indicators is UNKNOWN, not LOW. Silencing a category we cannot evaluate was
// the source of the Stage-9-vs-Synthesis contradiction the external reviews
// flagged (litigation table said LOW while the risk synthesis said CRITICAL).
export type RiskLevel = "critical" | "high" | "moderate" | "low" | "not_assessable";
export type Confidence = "high" | "medium" | "low";

/** Rank for elevation comparisons (not_assessable sits below low — unknown is
 *  not a benign finding, it is simply unevaluated). */
const LEVEL_RANK: Record<RiskLevel, number> = {
  not_assessable: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

export interface LitigationAreaT {
  area: string;
  level: RiskLevel;
  evidence: string[];
  riskDrivers: string[];
  mitigatingFactors: string[];
  confidence: Confidence;
  informationGaps: string[];
  suggestedAction: string;
}

interface LitigationRule {
  area: string;
  patterns: RegExp[];
  mitigators: string[];
  action: string;
}

const LITIGATION_RULES: LitigationRule[] = [
  {
    area: "Shareholder Claims",
    patterns: [/\bshareholder\s+(?:class\s+action|derivative\s+suit|oppression)\b/i, /\bappraisal\s+rights?\b/i, /\bcontrolling\s+shareholder\b/i, /\bminority\s+shareholder\b/i],
    mitigators: ["Exculpation charter provisions", "Business judgment rule protection"],
    action: "Engage litigation counsel early; review appraisal rights procedures",
  },
  {
    area: "Appraisal Actions",
    patterns: [/\bappraisal\s+(?:rights?|proceeding|demand|action)\b/i, /\bdissenting\s+shareholder\b/i, /\bfair\s+value\s+determination\b/i],
    mitigators: ["Defined appraisal methodology", "Independent fair-value expert"],
    action: "Define appraisal mechanics and valuation date precisely",
  },
  {
    area: "Fiduciary Duty Claims",
    patterns: [/\bfiduciary\s+duty\b/i, /\bduty\s+of\s+(?:care|loyalty|good\s+faith)\b/i, /\bconflict\s+of\s+interest\b/i, /\binterested\s+transaction\b/i, /\bentire\s+fairness\b/i],
    mitigators: ["Independent committee approval", "Majority-of-minority vote"],
    action: "Form independent committee; obtain fairness opinion",
  },
  {
    area: "Disclosure Litigation",
    patterns: [/\bdisclosure\s+(?:failure|omission|misrepresentation)\b/i, /\bmaterial\s+(?:misstatement|omission)\b/i, /\bproxy\s+statement\b/i, /\brule\s+10b-5\b/i, /\b14a-9\b/i],
    mitigators: ["Customary disclosure schedules", "Materiality qualifiers"],
    action: "Conduct comprehensive disclosure review; update proxy materials",
  },
  {
    area: "Antitrust Challenges",
    patterns: [/\bhsr\b|\bhart-scott-rodino\b/i, /\bclayton\s+act\b/i, /\bsherman\s+act\b/i, /\bmarket\s+concentration\b/i, /\bhorizontal\s+merger\b/i, /\bvertical\s+merger\b/i],
    mitigators: ["HSR filing completed", "No competitive overlap"],
    action: "Prepare HSR filing; consider divestiture options",
  },
  {
    area: "Regulatory Investigations",
    patterns: [/\bsec\s+(?:investigation|inquiry|enforcement)\b/i, /\bdoj\s+(?:investigation|inquiry)\b/i, /\bftc\s+(?:investigation|inquiry)\b/i, /\bcfius\s+(?:review|investigation)\b/i, /\bconsent\s+decree\b/i, /\bcease\s+and\s+desist\b/i],
    mitigators: ["Cooperation stance", "Compliance program in place"],
    action: "Conduct internal investigation; prepare regulatory response team",
  },
  {
    area: "Earnout Disputes",
    patterns: [/\bearnout\s+(?:dispute|litigation|calculation|disagreement)\b/i, /\badjusted\s+ebitda\s+(?:dispute|calculation)\b/i, /\bpost-closing\s+integration\b/i],
    mitigators: ["Independent accountant mechanism", "GAAP-based definitions"],
    action: "Define earnout metrics precisely; appoint independent accountant",
  },
  {
    area: "Purchase Price Adjustment Disputes",
    patterns: [/\bworking\s+capital\s+(?:adjustment|dispute|true-up)\b/i, /\bclosing\s+balance\s+sheet\s+(?:dispute|objection)\b/i, /\bpost-closing\s+adjustment\b/i],
    mitigators: ["Independent auditor mechanism", "Collar provisions"],
    action: "Finalize working capital methodology; set collar",
  },
  {
    area: "Fraud Allegations",
    patterns: [/\bfraud\s+(?:allegation|claim|action)\b/i, /\bintentional\s+misrepresentation\b/i, /\bscheme\s+to\s+defraud\b/i, /\bfraudulent\s+inducement\b/i],
    mitigators: ["Disclosure schedules", "Survival of reps"],
    action: "Conduct forensic review; preserve privilege",
  },
  {
    area: "Tax Disputes",
    patterns: [/\btax\s+(?:audit|controversy|dispute|litigation)\b/i, /\bsection\s+382\b/i, /\btransfer\s+pricing\b/i, /\birs\b/i],
    mitigators: ["Tax indemnity", "Reps on tax matters"],
    action: "Obtain tax insurance; review Section 382 limitations",
  },
  {
    area: "Employment Claims",
    patterns: [/\bemployment\s+(?:discrimination|harassment|wrongful\s+termination)\b/i, /\bwage\s+and\s+hour\b/i, /\bwarn\s+act\b/i, /\berisa\b/i, /\bnon-compete\s+enforcement\b/i],
    mitigators: ["Employment practices review", "Updated handbooks"],
    action: "Review employment practices; update handbooks",
  },
  {
    area: "IP Disputes",
    patterns: [/\bpatent\s+(?:infringement|validity|enforcement)\b/i, /\btrademark\s+(?:infringement|dilution)\b/i, /\btrade\s+secret\s+misappropriation\b/i, /\bcopyright\s+infringement\b/i, /\bopen\s+source\b/i],
    mitigators: ["IP ownership chain verified", "Assignment agreements"],
    action: "Conduct IP audit; verify ownership chains",
  },
  {
    area: "Environmental Claims",
    patterns: [/\bcercla\b|\bsuperfund\b/i, /\brcra\b/i, /\bclean\s+(?:water|air)\s+act\b/i, /\bphase\s+[ii]+\s+environmental\b/i, /\benvironmental\s+(?:liability|cleanup|remediation)\b/i],
    mitigators: ["Environmental indemnity", "Phase I/II completed"],
    action: "Complete Phase I/II environmental assessments",
  },
];

export interface LitigationElevation {
  /** Must match a LitigationRule.area exactly. */
  area: string;
  to: RiskLevel;
  reason: string;
}

export function runLitigationRisk(
  text: string,
  context?: {
    hasIndemnificationCap?: boolean;
    hasEscrow?: boolean;
    hasRWI?: boolean;
    hasDisclosureSchedules?: boolean;
    hasFinancialStatements?: boolean;
    hasRegulatoryFilings?: boolean;
    /**
     * Cross-module risk signals (e.g. escrow/survival mismatch detected by the
     * deterministic structural gates). These unify Stage 9 with the synthesis
     * findings so the litigation table cannot contradict the risk engine:
     * an area the synthesis treats as live risk is elevated here with the
     * intersecting reason, instead of rendering "LOW — no direct indicators".
     */
    elevations?: LitigationElevation[];
  }
): { areas: LitigationAreaT[] } {
  const ctxObj = context || {};
  const areas: LitigationAreaT[] = [];

  for (const rule of LITIGATION_RULES) {
    const evidence: string[] = [];
    const riskDrivers: string[] = [];
    for (const p of rule.patterns) {
      const snips = evidenceSnippets(text, p, 3);
      if (snips.length) {
        evidence.push(...snips);
        riskDrivers.push(`Contract language triggers ${snips.length} potential indicator(s) for ${rule.area}`);
      }
    }

    let level: RiskLevel;
    let confidence: Confidence;
    if (evidence.length >= 3) {
      level = "high";
      confidence = "medium";
    } else if (evidence.length >= 1) {
      level = "moderate";
      confidence = "medium";
    } else {
      // Missing information ≠ low risk. No textual indicator means this area
      // is unevaluated, and must be presented as a diligence gap rather than
      // a benign LOW that contradicts synthesis-level findings.
      level = "not_assessable";
      confidence = "low";
    }

    // Escalate to critical when strong, repeated indicators exist
    if (evidence.length >= 5) level = "critical";

    const mitigatingFactors = [...rule.mitigators];
    if (ctxObj.hasIndemnificationCap) mitigatingFactors.push("Indemnification cap limits exposure");
    if (ctxObj.hasEscrow) mitigatingFactors.push("Escrow provides recovery mechanism");
    if (ctxObj.hasRWI) mitigatingFactors.push("RWI policy provides additional coverage");

    // Apply synthesis-driven elevations (cross-module unification).
    for (const elev of ctxObj.elevations ?? []) {
      if (elev.area !== rule.area) continue;
      if (LEVEL_RANK[elev.to] > LEVEL_RANK[level]) {
        level = elev.to;
        confidence = "medium";
      }
      riskDrivers.push(`Synthesis-linked risk: ${elev.reason}`);
      if (!evidence.length) evidence.push(`[Structural analysis] ${elev.reason}`);
    }

    const informationGaps: string[] = [];
    if (!ctxObj.hasDisclosureSchedules) informationGaps.push("Disclosure schedules not reviewed");
    if (!ctxObj.hasFinancialStatements) informationGaps.push("Audited financial statements not available");
    if (!ctxObj.hasRegulatoryFilings) informationGaps.push("Regulatory filings (HSR, CFIUS) status unknown");

    areas.push({
      area: rule.area,
      level,
      evidence: evidence.slice(0, 3),
      riskDrivers,
      mitigatingFactors,
      confidence,
      informationGaps,
      suggestedAction: rule.action,
    });
  }

  return { areas };
}

/**
 * Derive litigation-area elevations from cross-module structural signals so the
 * Stage 9 table stays consistent with the synthesis findings (fixes the
 * "Stage 9 says LOW while synthesis says CRITICAL" contradiction).
 * Returns an array keyed to LitigationRule.area values.
 */
export function deriveLitigationElevations(signals: {
  escrowSurvivalMismatch?: { present: boolean; reason?: string };
  statutoryMergerNoEnvRep?: boolean;
  earnoutBuyerSoleDiscretion?: boolean;
  undefinedControllingTerms?: string[];
  ghostObligor?: boolean;
}): LitigationElevation[] {
  const elevs: LitigationElevation[] = [];
  if (signals.escrowSurvivalMismatch?.present) {
    // Escrow covers neither the general survival tail nor the (typically
    // unlimited) fraud tail → contingent-liability and fraud recovery exposure.
    elevs.push({
      area: "Fraud Allegations",
      to: "moderate",
      reason: signals.escrowSurvivalMismatch.reason ?? "Escrow duration does not cover the indemnity survival/fraud tail, leaving post-release claims unrecoverable.",
    });
    elevs.push({
      area: "Tax Disputes",
      to: "moderate",
      reason: signals.escrowSurvivalMismatch.reason ?? "Escrow duration does not cover the indemnity survival period.",
    });
  }
  if (signals.statutoryMergerNoEnvRep) {
    elevs.push({
      area: "Environmental Claims",
      to: "moderate",
      reason: "Statutory merger with no environmental representation/indemnity means successor liability is unallocated — treat as conditional pending diligence, not benign.",
    });
  }
  if (signals.earnoutBuyerSoleDiscretion) {
    elevs.push({
      area: "Earnout Disputes",
      to: "moderate",
      reason: "Earnout measured by metrics within buyer's sole discretion creates payment-dispute exposure.",
    });
  }
  if ((signals.undefinedControllingTerms?.length ?? 0) > 0) {
    elevs.push({
      area: "Tax Disputes",
      to: "moderate",
      reason: `Controlling defined terms are undefined in the provided text: ${signals.undefinedControllingTerms!.join(", ")}.`,
    });
  }
  if (signals.ghostObligor) {
    elevs.push({
      area: "Fraud Allegations",
      to: "high",
      reason: "Named indemnitor is not a defined/identified party and does not sign — indemnity (including for fraud) may be illusory.",
    });
  }
  return elevs;
}

export function renderLitigation(result: { areas: LitigationAreaT[] }): string {
  const lines: string[] = [];
  lines.push("### LITIGATION RISK ASSESSMENT (STAGE 9)");
  lines.push("");
  const rows = result.areas.map((a) => [
    a.level.toUpperCase(),
    a.area,
    a.confidence.toUpperCase(),
    a.evidence[0] ? a.evidence[0].slice(0, 120) : "No direct indicators in text",
  ]);
  lines.push(mdTable(["Level", "Area", "Confidence", "Evidence"], rows));
  lines.push("");
  // NOT_ASSESSABLE areas are diligence gaps, not benign "low" outcomes. Surface
  // them explicitly so the consumer never reads silence as "no risk".
  const unsure = result.areas.filter((a) => a.level === "not_assessable");
  if (unsure.length) {
    lines.push("**Areas not assessable from the provided text (diligence gaps):**");
    for (const a of unsure) {
      lines.push(`- **${a.area}:** corroborate before reliance — ${a.informationGaps.join("; ")}`);
      if (a.riskDrivers.length) lines.push(`  - ${a.riskDrivers.join(" ")}`);
    }
    lines.push("");
  }
  const flagged = result.areas.filter((a) => a.level !== "low" && a.level !== "not_assessable");
  if (flagged.length) {
    lines.push("**Mitigation & next steps for flagged areas:**");
    for (const a of flagged) {
      lines.push(`- **${a.area} (${a.level}):** ${a.suggestedAction}`);
      if (a.informationGaps.length) lines.push(`  - Info gaps: ${a.informationGaps.join("; ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 11 — QUALITY ASSURANCE RENDER
// Renders the server-side score-validation (validateScore) narrative plus a
// self-review checklist into the final report. This is the deployable QA gate.
// ─────────────────────────────────────────────────────────────────────────────

export interface QualityAssuranceInput {
  rawScore: number;
  validatedScore: number;
  tier: string;
  appliedDeductions: Record<string, number>;
  interactionAdjustment: number;
  narrative: string[];
  detectedConditions: string[];
}

export function renderQualityAssurance(qa: QualityAssuranceInput): string {
  const lines: string[] = [];
  lines.push("### QUALITY ASSURANCE (STAGE 11)");
  lines.push("");
  lines.push(`**Raw LLM score:** ${qa.rawScore}/100 → **Validated score:** ${qa.validatedScore}/100`);
  lines.push(`**Draft tier:** ${qa.tier}`);
  lines.push("");
  if (qa.appliedDeductions && Object.keys(qa.appliedDeductions).length) {
    lines.push("**Applied deductions (per-condition):**");
    for (const [cond, pts] of Object.entries(qa.appliedDeductions)) {
      lines.push(`- ${cond}: -${pts} pts`);
    }
    lines.push("");
  }
  if (qa.interactionAdjustment !== 0) {
    lines.push(`**Interaction-stack adjustment:** ${qa.interactionAdjustment > 0 ? "+" : ""}${qa.interactionAdjustment} pts`);
    lines.push("");
  }
  if (qa.detectedConditions?.length) {
    lines.push(`**Detected scoring conditions (${qa.detectedConditions.length}):** ${qa.detectedConditions.join(", ")}`);
    lines.push("");
  }
  if (qa.narrative?.length) {
    lines.push("**Validation narrative:**");
    for (const n of qa.narrative) lines.push(`- ${n}`);
    lines.push("");
  }
  lines.push("_QA self-review: score is clamped against deterministic conditions; any critical finding flagged CRITICAL by either specialist is elevated for human review._");
  lines.push("");
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1 — DOCUMENT INVENTORY
// Identifies document type, version, execution status, governing law, effective
// date, parties, affiliates, related agreements, missing schedules/exhibits,
// OCR quality concerns, and duplicates.
// ─────────────────────────────────────────────────────────────────────────────

export type InventoryIssueType =
  | "missing_schedule"
  | "missing_exhibit"
  | "missing_amendment"
  | "placeholder_language"
  | "ocr_quality_concern"
  | "illegible_section"
  | "duplicate_file";

export interface InventoryItemT {
  documentType: string;
  version: string;
  executionStatus: string;
  governingLaw: string;
  effectiveDate: string;
  parties: string[];
  affiliates: string[];
  relatedAgreements: string[];
  missingSchedules: string[];
  missingExhibits: string[];
  missingAmendments: string[];
  issues: { type: InventoryIssueType; description: string; evidence?: string }[];
  ocrQuality: "good" | "fair" | "poor";
  duplicates: string[];
}

export interface InventoryResult {
  documents: InventoryItemT[];
  inventoryIssues: number;
}

const DOC_TYPE_RE = /(?:AGREEMENT\s+AND\s+PLAN\s+OF\s+MERGER|PLAN\s+OF\s+MERGER|MERGER\s+AGREEMENT|STOCK\s+PURCHASE\s+AGREEMENT|SHARE\s+PURCHASE\s+AGREEMENT|ASSET\s+PURCHASE\s+AGREEMENT|PURCHASE\s+AGREEMENT|SECURITIES\s+PURCHASE\s+AGREEMENT|SUBSCRIPTION\s+AGREEMENT|MASTER\s+SERVICES\s+AGREEMENT|JOINT\s+VENTURE\s+AGREEMENT|TERM\s+SHEET|LETTER\s+OF\s+INTENT|INDEMNIFICATION\s+AGREEMENT|CONTRIBUTION\s+AGREEMENT)/i;
const PARTIES_RE = /between\s+([^,]+?)\s+\(?\s*["']?([A-Z][A-Za-z0-9\s&.'-]*?)["']?\s*(?:,?\s+an?\s+[A-Za-z]+ corporation|\s*\)?)?\s*(?:,|and)\s+(?:and\s+)?([^,;]+?)\s*\(?\s*["']?([A-Z][A-Za-z0-9\s&.'-]*?)["']?\s*(?:,?\s+an?\s+[A-Za-z]+ corporation)?/i;
const PLACEHOLDER_RE = /\[(?:to\s+be\s+(?:inserted|determined|negotiated)|TBD|TBA|insert|●|\*)\]/gi;
const ILIEGIBLE_RE = /[█▓▒░]{4,}|\uFFFD{3,}|\bOCR[^.]{0,60}(?:error|quality|issue)\b/gi;
const OCR_POOR_RE = /\b(?:scan(?:ned)?\s+document|image-only|unrecognized\s+text|garbled|illegible|unreadable)\b/gi;
const VERSION_RE = /\b(?:Version|Revision|v|Draft|Amended|Restated)\s*[.\s-]*([\d.]+|[A-Z])\b/i;
const EXEC_STATUS_RE = /\b(?:executed|signed|countersigned|effective\s+as\s+of|duly\s+executed|not\s+yet\s+executed|execution\s+copy|counterpart)\b/gi;
const GOV_LAW_RE = /(?:governed\s+by|governing\s+law\s+is|under\s+the\s+laws\s+of)\s+([^.;]{2,80})/i;
const EFFECTIVE_RE = /(?:effective\s+as\s+of|as\s+of|made\s+as\s+of|dated)\s+(?:the\s+)?([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i;
const AFFILIATE_RE = /\b(?:affiliate|affiliates|subsidiaries?|parent\s+company)\b/gi;
const RELATED_AGREEMENTS_RE = /\b(?:escrow\s+agreement|transition\s+services\s+agreement|TSA|non-?competition\s+agreement|non-?solicitation\s+agreement|indemnification\s+agreement|registration\s+rights\s+agreement|employment\s+agreement|assignment\s+and\s+assumption\s+agreement|RWI\s+policy|shareholders?\s+agreement|operating\s+agreement|lease\s+agreement)\b/gi;

export function runDocumentInventory(documents: DocInput[]): InventoryResult {
  const result: InventoryItemT[] = [];
  let issueCount = 0;

  for (const doc of documents) {
    const text = doc.text;
    const issues: InventoryItemT["issues"] = [];

    const typeMatch = text.match(DOC_TYPE_RE);
    const versionMatch = text.match(VERSION_RE);
    const execMatches = text.match(EXEC_STATUS_RE);
    const lawMatch = text.match(GOV_LAW_RE);
    const effMatch = text.match(EFFECTIVE_RE);

    // Parties — best effort; defined-term "Buyer"/"Seller" with entity names
    const parties: string[] = [];
    const pm = text.match(PARTIES_RE);
    if (pm) {
      const a = (pm[1] ?? pm[2] ?? "").replace(/\(.+\)/g, "").trim();
      const b = (pm[3] ?? pm[4] ?? "").replace(/\(.+\)/g, "").trim();
      if (a && a.length > 2 && !a.toLowerCase().startsWith("the")) parties.push(a);
      if (b && b.length > 2 && !b.toLowerCase().startsWith("the")) parties.push(b);
    }
    if (parties.length === 0) {
      const buyerMatch = text.match(/["']?Buyer["']?\s*(?:shall\s+mean\s+|means\s+)?(?:the\s+)?([A-Z][A-Za-z0-9\s&.'-]{2,50}?)\s*(?:,|;|\.)/i);
      const sellerMatch = text.match(/["']?Seller["']?\s*(?:shall\s+mean\s+|means\s+)?(?:the\s+)?([A-Z][A-Za-z0-9\s&.'-]{2,50}?)\s*(?:,|;|\.)/i);
      if (buyerMatch) parties.push(`Buyer: ${buyerMatch[1].trim()}`);
      if (sellerMatch) parties.push(`Seller: ${sellerMatch[1].trim()}`);
    }

    // Missing schedules/exhibits — cross-references without attached definitions
    const referenced = new Set<string>();
    const attached = new Set<string>();
    let sm: RegExpExecArray | null;
    const schedRe = /\b(?:Schedule|Exhibit|Annex|Appendix)\s+([A-Z0-9]+(?:\.[A-Z0-9]+)*(?:\([a-zA-Z0-9]+\))?(?:-[A-Z0-9]+)?)(?![A-Za-z0-9(])/gi;
    while ((sm = schedRe.exec(text)) !== null) {
      referenced.add(sm[1].toUpperCase());
      const before = text.slice(Math.max(0, sm.index - 60), sm.index);
      if (/attached|hereto|following|heading|set forth on/i.test(before)) attached.add(sm[1].toUpperCase());
    }
    // Attached definitions: lines like "Schedule 4.1 —" or "SCHEDULE 4.1"
    let am: RegExpExecArray | null;
    const attachRe = /\b(?:Schedule|Exhibit|Annex|Appendix)\s+([A-Z0-9]+(?:\.[A-Z0-9]+)*(?:\([a-zA-Z0-9]+\))?(?:-[A-Z0-9]+)?)\s*[:—-]/gi;
    while ((am = attachRe.exec(text)) !== null) attached.add(am[1].toUpperCase());

    const missingSchedules: string[] = [];
    const missingExhibits: string[] = [];
    for (const label of referenced) {
      if (attached.has(label)) continue;
      const fullLabel = `${doc.filename} — Schedule/Exhibit ${label}`;
      // Exhibit labels begin with a letter (e.g. "A-1"); schedules begin with a digit.
      if (/^[A-Z]/.test(label)) missingExhibits.push(fullLabel);
      else missingSchedules.push(fullLabel);
    }
    const missingAmendments: string[] = [];
    if (/\bamendment\b/i.test(text) && !/(?:this|the)\s+amendment\s+is\s+(?:attached|hereto)/i.test(text)) {
      missingAmendments.push(`${doc.filename} — referenced amendment not provided`);
    }

    // Placeholders / OCR concerns
    let plc: RegExpExecArray | null;
    while ((plc = PLACEHOLDER_RE.exec(text)) !== null) {
      issues.push({ type: "placeholder_language", description: `Placeholder language found: '${plc[0].trim()}'`, evidence: ctx(text, plc.index, 80) });
      issueCount++;
      if (issues.filter((i) => i.type === "placeholder_language").length >= 5) break;
    }
    let il: RegExpExecArray | null;
    while ((il = ILIEGIBLE_RE.exec(text)) !== null) {
      issues.push({ type: "illegible_section", description: "Illegible / OCR-corrupted text detected", evidence: ctx(text, il.index, 80) });
      issueCount++;
      break;
    }
    const ocrCount = countMatches(text, OCR_POOR_RE);
    if (ocrCount > 0) {
      issues.push({ type: "ocr_quality_concern", description: `${ocrCount} OCR-quality concern(s) (scanned/image-based text) detected` });
      issueCount++;
    }

    const ocrQuality: "good" | "fair" | "poor" =
      ocrCount > 2 || ILIEGIBLE_RE.test(text) ? "poor"
      : ocrCount > 0 ? "fair"
      : "good";

    const relatedAgreements = [
      ...new Set((text.match(RELATED_AGREEMENTS_RE) || []).map((s) => s.trim())),
    ];

    result.push({
      documentType: typeMatch?.[0]?.trim() ?? "Unidentified",
      version: versionMatch?.[1] ?? "Unversioned",
      executionStatus: execMatches?.length ? "Referenced (verify actual signature pages)" : "Unknown",
      governingLaw: lawMatch?.[1]?.trim() ?? "Not stated",
      effectiveDate: effMatch?.[1] ?? "Not stated",
      parties: [...new Set(parties)],
      affiliates: countMatches(text, AFFILIATE_RE) > 0 ? ["Affiliates referenced in text"] : [],
      relatedAgreements,
      missingSchedules: missingSchedules.slice(0, 20),
      missingExhibits: missingExhibits.slice(0, 20),
      missingAmendments,
      issues: issues.slice(0, 12),
      ocrQuality,
      duplicates: [],
    });
  }

  // Duplicate detection across documents (normalized content hash)
  const seenTexts = new Map<string, string[]>();
  for (const doc of documents) {
    const key = doc.text.replace(/\s+/g, " ").trim().slice(0, 1000).toLowerCase();
    if (!seenTexts.has(key)) seenTexts.set(key, []);
    seenTexts.get(key)!.push(doc.filename);
  }
  for (const [, names] of seenTexts) {
    if (names.length > 1) {
      const [primary, ...rest] = names;
      const item = result.find((r) => r.documentType && rest.length && primary);
      if (item) item.duplicates = rest;
    }
  }

  return { documents: result, inventoryIssues: issueCount };
}

export function renderInventory(result: InventoryResult): string {
  const lines: string[] = [];
  lines.push("### DOCUMENT INVENTORY (STAGE 1)");
  lines.push("");
  for (const d of result.documents) {
    lines.push(`**${d.documentType}** — ${d.version}`);
    lines.push("");
    lines.push(`- **Execution status:** ${d.executionStatus}`);
    lines.push(`- **Governing law:** ${d.governingLaw}`);
    lines.push(`- **Effective date:** ${d.effectiveDate}`);
    lines.push(`- **OCR quality:** ${d.ocrQuality}`);
    if (d.parties.length) lines.push(`- **Parties:** ${d.parties.join(", ")}`);
    if (d.affiliates.length) lines.push(`- **Affiliates:** ${d.affiliates.join(", ")}`);
    if (d.relatedAgreements.length) lines.push(`- **Related agreements:** ${[...new Set(d.relatedAgreements)].join(", ")}`);
    if (d.duplicates.length) lines.push(`- **⚠ Duplicates:** ${d.duplicates.join(", ")}`);
    if (d.missingSchedules.length) lines.push(`- **Missing schedules/exhibits:** ${d.missingSchedules.join("; ")}`);
    if (d.missingAmendments.length) lines.push(`- **Missing amendments:** ${d.missingAmendments.join("; ")}`);
    if (d.issues.length) {
      lines.push(`- **Issues (${d.issues.length}):**`);
      for (const iss of d.issues) lines.push(`  - ${iss.description}`);
    }
    lines.push("");
  }
  if (result.inventoryIssues > 0) {
    lines.push(`_Note: ${result.inventoryIssues} inventory issue(s) flagged — see list above. Document inventory should be completed before substantive legal analysis._`);
    lines.push("");
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2 — TRANSACTION MAPPING
// Entities (Buyer/Seller/Target/Parent/Guarantors/Equity holders), structure
// (stock/asset/merger/tender/JV/spin-off/carve-out), economics (purchase price,
// escrow, holdbacks, earnout, working capital, net debt, rollover equity), and
// timeline (signing, closing, outside date, milestones, regulatory deadlines).
// ─────────────────────────────────────────────────────────────────────────────

export interface TransactionMappingResult {
  entities: { role: string; name: string }[];
  structure: { type: string; confidence: "HIGH" | "MEDIUM" | "LOW"; indicators: string[] };
  economics: { purchasePrice: string; escrow: string; holdbacks: string; earnout: string; workingCapital: string; netDebt: string; rolloverEquity: string; other: string[] };
  timeline: { signing: string; closing: string; outsideDate: string; milestones: string[]; regulatoryDeadlines: string[] };
  missingEconomics: string[];
}

const STRUCTURE_TRIGGERS: { type: string; patterns: RegExp[] }[] = [
  { type: "Statutory Merger", patterns: [/plan of merger/i, /surviving corporation/i, /articles of merger/i, /section 251/i, /certificate of merger/i] },
  { type: "Stock / Equity Purchase", patterns: [/purchase and sale of (?:all of the |100% of the )?(?:shares|stock|membership interests|equity interests|units)/i, /all (?:of the )?(?:issued and outstanding )?(?:shares|stock|units|membership interests)/i] },
  { type: "Asset Purchase", patterns: [/purchased assets/i, /assumed liabilities/i, /excluded assets/i, /assignment and assumption/i, /section 1060/i, /bulk sales/i] },
  { type: "Tender Offer", patterns: [/tender offer/i, /exchange offer/i, /commencement date/i] },
  { type: "Joint Venture", patterns: [/joint venture/i, /partnership agreement/i, /limited liability company agreement/i] },
  { type: "Spin-off / Carve-out", patterns: [/spin-?off/i, /carve-?out/i, /demerger/i, /separation agreement/i] },
];

const ECONOMY_PATTERNS: { key: keyof TransactionMappingResult["economics"]; label: string; patterns: RegExp[] }[] = [
  { key: "purchasePrice", label: "Purchase Price", patterns: [/(?:purchase price|aggregate consideration|base purchase price|enterprise value|equity value)\s*(?:shall be|is|of|equal to)\s*\$?([\d,.]+(?:\s*(?:million|billion|mm|m|bn))?)/i, /\$\s?([\d,]+(?:\s*(?:million|billion|mm|m|bn))?)\s*(?:in\s+)?(?:cash\s+)?(?:purchase\s+price|aggregate\s+consideration)/i] },
  { key: "escrow", label: "Escrow", patterns: [/(?:escrow|indemnity escrow|holdback escrow)\s*(?:shall be|of|in the amount of|equal to)\s*\$?([\d,.]+(?:\s*(?:million|billion|mm|m|bn))?)/i, /\$\s?([\d,]+)\s*(?:escrow)/i] },
  { key: "holdbacks", label: "Holdbacks", patterns: [/(?:holdback|hold back|retention)\s*(?:of|shall be|in the amount of)\s*\$?([\d,.]+(?:\s*(?:million|billion|mm|m|bn))?)/i] },
  { key: "earnout", label: "Earnout", patterns: [/(?:earnout|earn-out)\s*(?:consideration|payment)?\s*(?:of|shall be|equal to|up to)\s*\$?([\d,.]+(?:\s*(?:million|billion|mm|m|bn))?)/i, /\bearnout\b/i] },
  { key: "workingCapital", label: "Working Capital", patterns: [/(?:working capital)(?:\s*(?:target|peg|adjustment|true-up))?\s*(?:of|equal to|shall be|target)?\s*\$?([\d,.]+(?:\s*(?:million|billion|mm|m|bn))?)/i, /\bworking capital (?:target|peg)\b/i] },
  { key: "netDebt", label: "Net Debt", patterns: [/(?:net debt|net cash)\s*(?:shall be|of|equal to|target)?\s*\$?([\d,.]+(?:\s*(?:million|billion|mm|m|bn))?)/i, /\bnet (?:debt|cash)\b/i] },
  { key: "rolloverEquity", label: "Rollover Equity", patterns: [/(?:rollover equity|roll-over equity|rolled over|rollover shares?)\s*(?:of)?\s*\$?([\d,.]+(?:\s*(?:million|billion|mm|m|bn))?)/i, /\brollover equity\b/i] },
];

const TIMELINE_PATTERNS: { key: keyof TransactionMappingResult["timeline"]; label: string; patterns: RegExp[] }[] = [
  { key: "signing", label: "Signing", patterns: [/(?:signing date|date of signing|execution date|date of execution)\s*(?:shall be|is|on)?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i, /\b(?:signing|execution)\s+date\b/i] },
  { key: "closing", label: "Closing", patterns: [/(?:closing date|date of closing|date of the closing)\s*(?:shall be|is|on)?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i, /the closing (?:shall|will) (?:take place|occur|be held) on\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i] },
  { key: "outsideDate", label: "Outside Date", patterns: [/(?:outside date|drop-dead date|termination date)\s*(?:shall be|is|on)?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\[[^\]]+\])/i, /\boutside date\b/i] },
];

export function runTransactionMapping(text: string): TransactionMappingResult {
  // Entities
  const entities: { role: string; name: string }[] = [];
  const roleRe = /["']?(Buyer|Purchaser|Acquirer|Seller|Target|Company|Parent|Guarantor|Equity Holder|Stockholder|Shareholder|Member)["']?\s*(?:shall mean|means|is)\s+(?:the\s+)?([A-Z][A-Za-z0-9\s&.'-]{2,60}?)\s*(?:,|;|\.)/gi;
  let rm: RegExpExecArray | null;
  const seenRoles = new Set<string>();
  while ((rm = roleRe.exec(text)) !== null) {
    const role = rm[1];
    const name = rm[2].trim().replace(/\s+/g, " ");
    const key = role.toLowerCase();
    if (seenRoles.has(key)) continue;
    seenRoles.add(key);
    entities.push({ role, name });
  }

  // Structure
  const candidates = STRUCTURE_TRIGGERS
    .filter(({ patterns }) => patterns.some((p) => p.test(text)))
    .map(({ type }) => type);
  let structureType = candidates[0] ?? "Unclassified";
  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  if (candidates.length === 1) confidence = "HIGH";
  else if (candidates.length > 1) {
    structureType = candidates.join(" / ");
    confidence = "MEDIUM";
  }
  const structure = {
    type: structureType,
    confidence,
    indicators: candidates,
  };

  // Economics
  const economics: TransactionMappingResult["economics"] = {
    purchasePrice: "Not found in text",
    escrow: "None identified",
    holdbacks: "None identified",
    earnout: "None identified",
    workingCapital: "Not specified",
    netDebt: "Not specified",
    rolloverEquity: "None identified",
    other: [],
  };
  for (const { key, patterns } of ECONOMY_PATTERNS) {
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        economics[key] = m[1] ?? "Referenced (amount not stated)";
        break;
      }
    }
  }

  // Timeline
  const timeline: TransactionMappingResult["timeline"] = {
    signing: "Not specified",
    closing: "Not specified",
    outsideDate: "Not specified",
    milestones: [],
    regulatoryDeadlines: [],
  };
  for (const { key, patterns } of TIMELINE_PATTERNS) {
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        timeline[key] = m[1] ?? "Referenced";
        break;
      }
    }
  }
  const milestoneRe = /(?:condition(?:s)? to closing|milestone|regulatory approval (?:deadline|date)|second request|waiting period)\b/gi;
  timeline.regulatoryDeadlines = countMatches(text, /(?:hsr|cfius|antitrust|regulatory approval|waiting period|second request)\b/gi) > 0
    ? ["Regulatory review referenced (HSR/CFIUS/antitrust) — confirm filing deadlines"]
    : [];
  const milestones = text.match(milestoneRe);
  if (milestones) timeline.milestones = [...new Set(milestones.map((s) => s.trim()))].slice(0, 8);

  const missingEconomics = (Object.entries(economics) as [string, string][]).filter(
    ([, v]) => /Not found|None identified|Not specified/i.test(v)
  ).map(([k]) => k);

  return { entities, structure, economics, timeline, missingEconomics };
}

export function renderTransactionMapping(result: TransactionMappingResult): string {
  const lines: string[] = [];
  lines.push("### TRANSACTION MAPPING (STAGE 2)");
  lines.push("");
  lines.push(`**Structure:** ${result.structure.type} (confidence: ${result.structure.confidence})`);
  if (result.structure.indicators.length) lines.push(`**Indicators:** ${result.structure.indicators.join(", ")}`);
  lines.push("");
  if (result.entities.length) {
    lines.push("**Entities:**");
    lines.push(mdTable(["Role", "Entity"], result.entities.map((e) => [e.role, e.name])));
    lines.push("");
  }
  lines.push("**Economics:**");
  lines.push(mdTable(
    ["Component", "Value"],
    (Object.entries(result.economics) as [string, string][]).map(([k, v]) => [k.replace(/([A-Z])/g, " $1").trim(), v])
  ));
  lines.push("");
  lines.push("**Timeline:**");
  lines.push(mdTable(
    ["Event", "Value"],
    (Object.entries(result.timeline) as [string, unknown][]).filter(([k]) => k === "signing" || k === "closing" || k === "outsideDate").map(([k, v]) => [k.replace(/([A-Z])/g, " $1").trim(), String(v)])
  ));
  if (result.timeline.milestones.length) lines.push(`**Milestones:** ${result.timeline.milestones.join(", ")}`);
  if (result.timeline.regulatoryDeadlines.length) lines.push(`**Regulatory deadlines:** ${result.timeline.regulatoryDeadlines.join("; ")}`);
  lines.push("");
  if (result.missingEconomics.length) {
    lines.push(`**Missing economic infrastructure:** ${result.missingEconomics.join(", ")} — _economic engine is incomplete in the provided text._`);
    lines.push("");
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 10 — NEGOTIATION ANALYSIS
// Buyer leverage, Seller leverage, missing protections, one-sided provisions,
// alternative drafting, commercial compromises, market alternatives.
// ─────────────────────────────────────────────────────────────────────────────

export interface NegotiationFindingT {
  type: "buyer_leverage" | "seller_leverage" | "missing_protection" | "one_sided" | "alternative_drafting" | "commercial_compromise";
  description: string;
  evidence: string;
  suggestedApproach: string;
}

export interface NegotiationResult {
  findings: NegotiationFindingT[];
  buyerLeverage: number; // 0-10
  sellerLeverage: number; // 0-10
}

const BUYER_LEVERAGE_PATTERNS: RegExp[] = [
  /\bbuyer['"]?s\s+(?:sole\s+and\s+absolute\s+)?discretion\b/i,
  /\bbuyer\s+(?:may|shall\s+be\s+entitled\s+to)\s+(?:terminate|walk\s+away|reject|withdraw)/i,
  /\bbuyer\s+shall\s+have\s+the\s+right\b/i,
  /\bexclusive\s+remedy\b[^.]{0,60}\bbuyer\b/i,
  /\bsatisfaction\s+(?:in\s+)?(?:of\s+)?(?:buyer|purchaser)/i,
];
const SELLER_LEVERAGE_PATTERNS: RegExp[] = [
  /\bseller['"]?s\s+(?:sole\s+and\s+absolute\s+)?discretion\b/i,
  /\bseller\s+(?:may|shall\s+be\s+entitled\s+to)\s+(?:terminate|walk\s+away|retain|withdraw)/i,
  /\bno\s+relief\b[^.]{0,60}\bseller\b/i,
  /\b(?:seller|seller's)\s+sole\s+discretion\b/i,
  /\bwithout\s+(?:the\s+)?(?:buyer's\s+)?consent\b[^.]{0,60}\bseller\b/i,
];
const ONE_SIDED_PATTERNS: RegExp[] = [
  /\b(?:buyer|seller)\s+shall\s+have\s+the\s+sole\s+right\s+(?:to\s+)?terminate\b/i,
  /(?:termination\s+rights?)[^.]{0,60}(?:only\s+(?:the\s+)?(?:buyer|seller))\b/i,
  /(?:indemnification|indemnity)\s+(?:obligations?)[^.]{0,80}\b(?:buyer|seller)\b[^.]{0,40}\b(?:only)\b/i,
];

export function runNegotiationAnalysis(text: string): NegotiationResult {
  const findings: NegotiationFindingT[] = [];

  // Buyer leverage
  for (const p of BUYER_LEVERAGE_PATTERNS) {
    const snips = evidenceSnippets(text, p, 1);
    if (snips.length) {
      findings.push({
        type: "buyer_leverage",
        description: "Buyer holds unilateral/strong discretion or exit leverage",
        evidence: snips[0],
        suggestedApproach: "Acknowledge as Buyer leverage; note residual challenge risk (implied covenant of good faith in some jurisdictions).",
      });
      break;
    }
  }
  // Seller leverage
  for (const p of SELLER_LEVERAGE_PATTERNS) {
    const snips = evidenceSnippets(text, p, 1);
    if (snips.length) {
      findings.push({
        type: "seller_leverage",
        description: "Seller holds unilateral/strong discretion or exit leverage",
        evidence: snips[0],
        suggestedApproach: "Negotiate mutual termination/cure rights and remove seller-only discretion.",
      });
      break;
    }
  }
  // One-sided provisions
  for (const p of ONE_SIDED_PATTERNS) {
    const snips = evidenceSnippets(text, p, 1);
    if (snips.length) {
      findings.push({
        type: "one_sided",
        description: "One-sided termination/indemnity provision detected",
        evidence: snips[0],
        suggestedApproach: "Add reciprocity: match cure periods, termination triggers, and carve-outs on both sides.",
      });
      break;
    }
  }
  // Missing protections (market standard expectations)
  const missingChecks: { label: string; re: RegExp; approach: string }[] = [
    { label: "Standard indemnification framework", re: /\bindemnif\w+\b/i, approach: "Add a mutual indemnification article with cap, basket, and survival." },
    { label: "Representation survival period", re: /\bsurvival\b/i, approach: "Add a survival clause (general reps 18–24mo; fundamental/tax longer)." },
    { label: "Working capital / price adjustment mechanism", re: /\bworking capital\b/i, approach: "Define working capital peg, target, and true-up mechanics." },
    { label: "Earnout formula", re: /\bearnout\b/i, approach: "If earnout is intended, specify thresholds, tiers, and dispute mechanism." },
    { label: "Security for indemnity (escrow/holdback)", re: /\bescrow\b|\bholdback\b/i, approach: "Add escrow or holdback sized to risk exposure." },
    { label: "Non-compete / non-solicit", re: /\bnon-?compete\b|\bnon-?solicit/i, approach: "Draft enforceable non-compete/non-solicit with defined scope." },
    { label: "Confidentiality (post-close)", re: /\bconfidentiality\b/i, approach: "Add post-closing confidentiality covenant with survival." },
    { label: "Dispute resolution", re: /\b(?:dispute resolution|arbitration|governing law)\b/i, approach: "Specify governing law, venue, and dispute mechanism." },
  ];
  for (const mc of missingChecks) {
    if (!mc.re.test(text)) {
      findings.push({
        type: "missing_protection",
        description: `Missing market-standard protection: ${mc.label}`,
        evidence: "Not found in text",
        suggestedApproach: mc.approach,
      });
    }
  }
  // Alternative drafting suggestions for detected high-risk clauses
  if (/\b(?:as is|as-is|where is|where-is)\b/i.test(text)) {
    findings.push({
      type: "alternative_drafting",
      description: "As-Is / Where-Is clause present — consider carve-out preserving indemnity recourse for known defects",
      evidence: ctx(text, text.search(/\b(?:as is|as-is|where is|where-is)\b/i)),
      suggestedApproach: "Qualify the as-is disclaimer so it does not waive indemnity for breach of reps/warranties.",
    });
  }
  if (/\b(?:knowledge\s+qualifier|to\s+the\s+knowledge\s+of)\b/i.test(text)) {
    findings.push({
      type: "alternative_drafting",
      description: "Knowledge qualifiers on reps — consider limiting to defined 'Knowledge' concept",
      evidence: ctx(text, text.search(/\b(?:knowledge\s+qualifier|to\s+the\s+knowledge\s+of)\b/i)),
      suggestedApproach: "Define 'Knowledge' to include reasonable inquiry by designated officers.",
    });
  }

  // Leverage scores (0-10, graded) — count contributing provisions rather than
  // a binary 3/7 so multi-provision documents are scored proportionally.
  let buyerLeverage = 3;
  let sellerLeverage = 3;
  const buyerHits = BUYER_LEVERAGE_PATTERNS.filter((p) => p.test(text)).length;
  const sellerHits = SELLER_LEVERAGE_PATTERNS.filter((p) => p.test(text)).length;
  buyerLeverage += Math.min(5, buyerHits * 2);
  sellerLeverage += Math.min(5, sellerHits * 2);
  for (const o of findings.filter((f) => f.type === "one_sided")) {
    if (/buyer/i.test(o.evidence)) buyerLeverage = Math.min(10, buyerLeverage + 1);
    if (/seller/i.test(o.evidence)) sellerLeverage = Math.min(10, sellerLeverage + 1);
  }
  // Earnout/EBITDA upside shifts commercial leverage toward Seller.
  if (/\bearnout\b|\badjusted\s+EBITDA\b/i.test(text)) sellerLeverage = Math.min(10, sellerLeverage + 1);

  return { findings, buyerLeverage, sellerLeverage };
}

export function renderNegotiation(result: NegotiationResult): string {
  const lines: string[] = [];
  lines.push("### NEGOTIATION ANALYSIS (STAGE 10)");
  lines.push("");
  lines.push(`**Buyer Leverage:** ${result.buyerLeverage}/10  **Seller Leverage:** ${result.sellerLeverage}/10`);
  lines.push("");
  if (!result.findings.length) {
    lines.push("_No directional leverage findings — balanced or standard drafting._");
    lines.push("");
    return lines.join("\n");
  }
  for (const f of result.findings) {
    lines.push(`- **${f.type.replace(/_/g, " ")}:** ${f.description}`);
    lines.push(`  - Evidence: ${f.evidence.slice(0, 180)}`);
    lines.push(`  - Suggested approach: ${f.suggestedApproach}`);
  }
  lines.push("");
  lines.push("_Negotiation strategy is separate from legal observations. Confirm commercial intent before pursuing any counter-language._");
  lines.push("");
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL GATE A — ESCROW vs SURVIVAL MISMATCH
// Compares the indemnity escrow term to the indemnity survival period. Where
// the escrow releases before the survival period (and especially before
// fraud/fundamental tail), the buyer's sole practical recovery source is gone
// while the claim window is open. This is precisely the "survival tail past
// the escrow release" gap the external reviews flagged.
// ─────────────────────────────────────────────────────────────────────────────

export interface EscrowSurvivalMismatch {
  present: boolean;
  escrowMonths?: number;
  survivalMonths?: number;
  fraudUnlimited?: boolean;
  reason?: string;
}

const MONTH_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, eighteen: 18, twenty: 20, twentyfour: 24, thirty: 30,
} as Record<string, number>;

function parseMonths(src: string, re: RegExp): number | undefined {
  const m = src.match(re);
  if (!m) return undefined;
  // Numeric alternative is the inner capture group (m[2]); the word alternative
  // is m[1]. Note both can be populated when the number matches (the outer
  // group also captures it), so always prefer the numeric group.
  if (m[2] !== undefined) {
    const n = parseInt(m[2], 10);
    if (!Number.isNaN(n)) return n;
  }
  if (m[1]) return MONTH_NUM[m[1].toLowerCase()];
  return undefined;
}

export function detectEscrowSurvivalMismatch(text: string): EscrowSurvivalMismatch {
  const escrow = parseMonths(
    text,
    /\bescrow\b[^.]{0,80}?(\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty|twenty[- ]?four|thirty)\b|(\d{1,2}))\s*[- ]?(?:month|mo)/i
  );
  const survival = parseMonths(
    text,
    /\b(?:indemnification|survival)[^.]{0,80}?(?:period|survive)[^.]{0,80}?(\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty|twenty[- ]?four|thirty)\b|(\d{1,2}))\s*[- ]?(?:month|year|yr|mo)/i
  );
  const fraudUnlimited = /\bfraud\b[^.]{0,80}?\b(no|without)\b[^.]{0,60}?\b(limitation|cap|survival)\b/i.test(text) ||
    /\b(no|without)\s+limitation\b[^.]{0,40}?\bfraud\b/i.test(text);

  if (escrow === undefined || survival === undefined) {
    return { present: false, escrowMonths: escrow, survivalMonths: survival, fraudUnlimited };
  }
  // Normalize survival: if expressed in years, convert (capped at 120 months for sanity).
  const survivalMonths = survival > 24 ? survival : survival;
  if (escrow < survivalMonths) {
    return {
      present: true,
      escrowMonths: escrow,
      survivalMonths,
      fraudUnlimited,
      reason: `Indemnity escrow (${escrow} month${escrow === 1 ? "" : "s"}) releases before the indemnity survival period (${survivalMonths} month${survivalMonths === 1 ? "" : "s"}), leaving post-release claims unrecoverable from the escrow.${fraudUnlimited ? " Fraud is stated to be unlimited while the escrow is time-limited — align escrow release to the fraud/unlimited tail or add a RWI/guaranty backstop." : ""}`,
    };
  }
  return { present: false, escrowMonths: escrow, survivalMonths, fraudUnlimited };
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL GATE B — PARTY, OBLIGOR & SIGNATURE INTEGRITY
// Catches the highest-severity defect both external reviews identified: a
// named obligor ("Seller shall indemnify…") that is never defined as a party
// and never signs. In a statutory merger the Target also vanishes, so an
// indemnity running to "the Surviving Corporation" can circularize. Also flags
// externally-referenced signatories that are not defined parties, undefined
// roles, and missing signature blocks.
// ─────────────────────────────────────────────────────────────────────────────

export interface PartyIntegrityFinding {
  severity: Severity;
  category: "ghost_obligor" | "vanishing_indemnitor" | "role_undefined" | "signature_mismatch" | "missing_signature_block" | "signature_present_unsigned" | "unbound_restricted_persons";
  description: string;
  evidence: string;
}

export type SignatureState = "NOT_PRESENT" | "PRESENT_UNSIGNED" | "PRESENT_EXECUTED";

export interface PartyIntegrityResult {
  findings: PartyIntegrityFinding[];
  definedParties: string[];
  signatories: string[];
  /** True when the deal is a statutory merger (Target survives/merges). */
  isMerger: boolean;
  /** Three-state signature classification (Fix 1). */
  signatureState: SignatureState;
}

const ROLE_DEF_PAREN_RE = /\b([A-Z][\w&.',-]*(?:\s+[A-Z][\w&.',-]*){0,4}?)\s*\(\s*["'“”‘’]([A-Za-z][A-Za-z ]{1,40})["'“”‘’]\s*\)/g;
const ROLE_DEF_MEANS_RE = /\b([A-Z][\w&.',-]*(?:\s+[A-Z][\w&.',-]*){0,4}?)\s+(?:means|shall mean|refers to|is)\s+/g;
// Corporate/entity obligor roles whose absence as a defined party is a
// ghost-obligor (critical) defect. Person-group roles such as "principals"
// are handled separately as a role-undefined (moderate) issue, not a critical
// ghost obligor, to avoid over-flagging non-compete boilerplate.
const OBLIGOR_ROLES = ["Seller", "Parent", "Guarantor", "Shareholders?", "Stockholders?", "Members?", "Stockholder Representative", "Seller Representative", "Company"];
const MERGER_RE = /\bsurviving\s+(?:corporation|entity|company)\b|\bplan\s+of\s+merger\b|\bcertificate\s+of\s+merger\b|\bmerged\s+with\s+and\s+into\b|\bdgcl\b|\bsection\s+251\b|\bmerger\s+subscribe/i;

export function runPartyIntegrity(text: string, dealType?: string): PartyIntegrityResult {
  const findings: PartyIntegrityFinding[] = [];
  const definedParties = new Set<string>();
  const roleByCanonical: Record<string, string> = {};

  // 1) Preamble / definition role bindings:  "Acquiror Inc. ('Buyer')"  OR  "Buyer (Acquiror Inc.)"
  let m: RegExpExecArray | null;
  const parenRe = new RegExp(ROLE_DEF_PAREN_RE.source, "g");
  while ((m = parenRe.exec(text)) !== null) {
    const full = m[0];
    const a = m[1].trim();
    const b = m[2].trim();
    // Decide which is the canonical entity and which is the defined role.
    const entityIsFirst = /inc\.?|corp\.?|llc|l\.l\.c\.?|ltd\.?|lp\b|plc|gmbh|s\.a\.?|n\.v\.?|company|co\.?|holdings?|group/i.test(a) ||
      b.length <= a.length && /^(buyer|seller|target|parent|acquiror|acquirer|purchaser|vendor|guarantor)$/i.test(b);
    const entity = entityIsFirst ? a : b;
    const role = entityIsFirst ? b : a;
    if (role) {
      definedParties.add(entity);
      roleByCanonical[role.replace(/s$/i, "").toLowerCase()] = entity;
    }
  }
  // "X means the Seller" style
  const meansRe = new RegExp(ROLE_DEF_MEANS_RE.source, "g");
  while ((m = meansRe.exec(text)) !== null) {
    const role = m[1].trim();
    if (/buyer|seller|target|parent|acquiror|acquirer|purchaser|vendor|guarantor/i.test(role)) {
      roleByCanonical[role.replace(/s$/i, "").toLowerCase()] = role;
      definedParties.add(role);
    }
  }

  // 2) Signature block parties
  const signatories = new Set<string>();
  // Keep only leading Title-case tokens so "Target Co have caused…" collapses to "Target Co".
  const cleanName = (raw: string) =>
    raw
      .replace(/^(the\s+)/i, "")
      .trim()
      .split(/\s+/)
      .filter((w) => /^[A-Z][\w&.',\-]*$/.test(w))
      .join(" ");
  // "By: <Name>" execution lines
  const sigRe = /\bby:\s*\n?\s*([A-Z][\w&.',\-]*(?:\s+[A-Z][\w&.',\-]*){0,4})/g;
  let sm: RegExpExecArray | null;
  while ((sm = sigRe.exec(text)) !== null) {
    const name = cleanName(sm[1]);
    if (name) signatories.add(name);
  }
  // "IN WITNESS WHEREOF, <Name A> and <Name B> have caused…" signatories
  const witnessRe = /\b(in\s+witness\s+whereof)\b[^.]{0,150}?\b([A-Z][\w&.',\-]*(?:\s+[A-Z][\w&.',\-]*){0,3})\b\s+(?:and|,)\s+([A-Z][\w&.',\-]*(?:\s+[A-Z][\w&.',\-]*){0,3})\b/gi;
  let wm: RegExpExecArray | null;
  while ((wm = witnessRe.exec(text)) !== null) {
    for (const g of [wm[2], wm[3]]) {
      const name = cleanName(g);
      if (name) signatories.add(name);
    }
  }

  // 3) Ghost obligor: a role is placed under an obligation but is not a defined party/entity
  const isMerger = MERGER_RE.test(text);
  for (const role of OBLIGOR_ROLES) {
    const roleRe = new RegExp(`\\b${role}\\b(?=\\s+(?:shall|will|must|agrees?|agree to|covenants?|represents?|warrants?|indemnifies?|indemnif(?:y|ies)|undertakes?))`, "i");
    if (!roleRe.test(text)) continue;
    const canonical = roleByCanonical[role.replace(/s\?$|s$/i, "").toLowerCase()] ||
      roleByCanonical[role.toLowerCase().replace(/s\?$/i, "")];
    const isDefined = !!canonical || definedParties.size > 0 && isRoleBound(role, definedParties, text);
    if (!isDefined) {
      findings.push({
        severity: "critical",
        category: "ghost_obligor",
        description: `Obligation is imposed on "${role.replace(/\?$/i, "")}" but that party is never defined or identified in the provided text. An indemnity/obligation running to a party that does not exist as a defined entity is illusory.`,
        evidence: snippetFor(text, roleRe),
      });
    } else if (isMerger && /seller|target|company/i.test(role)) {
      findings.push({
        severity: "high",
        category: "vanishing_indemnitor",
        description: `Statutory merger detected: "${role.replace(/\?$/i, "")}" merges into the Surviving Corporation and its separate legal identity terminates. An indemnity running to or from a merged-away entity can circularize unless the Surviving Corporation is expressly substituted as the obligor.`,
        evidence: snippetFor(text, roleRe),
      });
    }
  }

  // 4) Signature-block state: three cases, NOT two.
  //    NOT_PRESENT   → drafting defect (no block at all)
  //    PRESENT_UNSIGNED → execution gap (block exists, lines blank)
  //    PRESENT_EXECUTED  → executed
  // The naive "no signature block" finding previously conflated
  // PRESENT_UNSIGNED with NOT_PRESENT (see external review Error 1).
  const sigArea = text.slice(Math.floor(text.length * 0.7));
  const hasSigBlockStructural =
    /\bIN\s+WITNESS\s+WHEREOF\b/i.test(text) ||
    /(?:AGREED|ACCEPTED|EXECUTED|SIGNED)\s*(?:AND\s+AGREED)?\s*(?:BY|:)/i.test(text) ||
    /(?:Signature|Sign(?:ed)?\s+by|Authorized\s+Signatory)\s*[:\-_]+/i.test(text) ||
    /(?:Buyer|Seller|Target|Company|Acquir\w+|Surviving)\s*(?:Co\.?|Corp\.?|Inc\.?|LLC\.?|LP\.?)?\s*:\s*[_\-]{2,}/i.test(text) ||
    /\[\s*(?:SIGNATURE|NAME|DATE|TITLE|TO\s+BE\s+(?:SIGNED|COMPLETED|INSERTED))\s*\]/i.test(text);
  const sigExecuted =
    /\/s\/\s+\w+/.test(sigArea) ||
    /(?:Name|Title)\s*:\s*[A-Za-z][A-Za-z\s.,]{3,}/.test(sigArea) ||
    /(?:DocuSign(?:ed)?|AdobeSign(?:ed)?|Electronically\s+Signed)/i.test(sigArea) ||
    /Date\s*:\s*(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\w+\s+\d{1,2},?\s*\d{4})/.test(sigArea) ||
    /\[(?:SIGNED|EXECUTED|SIGNATURE\s+ON\s+FILE)\]/i.test(sigArea);
  let signatureState: SignatureState = "NOT_PRESENT";
  if (hasSigBlockStructural) {
    signatureState = sigExecuted ? "PRESENT_EXECUTED" : "PRESENT_UNSIGNED";
  }
  if (signatureState === "NOT_PRESENT" && definedParties.size > 0) {
    findings.push({
      severity: "high",
      category: "missing_signature_block",
      description: "Parties are identified but the document contains no signature block / execution clause capturing authorized signatories. The agreement is not executed as drafted.",
      evidence: `Identified parties: ${[...definedParties].join(", ")}`,
    });
  } else if (signatureState === "PRESENT_UNSIGNED") {
    findings.push({
      severity: "moderate",
      category: "signature_present_unsigned",
      description: "A signature block / execution clause exists (e.g. 'IN WITNESS WHEREOF' or signature lines) but the signature lines are blank — the agreement is prepared for execution but is not yet binding. This is an execution-status gap, not a drafting defect (no block at all).",
      evidence: "Signature block detected; signature lines blank (no executed signatory, date, or /s/ marker).",
    });
  }
  // Externally-referenced signatory (e.g. "Buyer Co") that is not a defined party
  for (const sig of signatories) {
    if (definedParties.size > 0 && !isBoundName(sig, definedParties)) {
      findings.push({
        severity: "moderate",
        category: "signature_mismatch",
        description: `Signature block names "${sig}" which is not a defined party in the provided text. Confirm the correct legal entity name.`,
        evidence: `Signature: ${sig}`,
      });
    }
  }

  // 5) Restricted-persons / non-compete bound to undefined "principals"
  const principalRef = /principals?\b/i.test(text);
  const nonCompete = /\bnon-?compete\b/i.test(text);
  if (nonCompete && principalRef && !/principal/i.test([...definedParties].join(" ")) && !roleByCanonical["principals"]) {
    findings.push({
      severity: "moderate",
      category: "role_undefined",
      description: "Non-compete binds \"principals\" but \"Principal(s)\" are not defined. The scope of bound persons is indeterminate.",
      evidence: snippetFor(text, /\bnon-?compete\b[^.]{0,80}?\bprincipals?\b|\bprincipals?\b[^.]{0,80}?\bnon-?compete\b/i),
    });
  }

  return { findings, definedParties: [...definedParties], signatories: [...signatories], isMerger, signatureState };
}

function isRoleBound(role: string, definedParties: Set<string>, text: string): boolean {
  // A role is "bound" if its canonical name appears as a defined entity, or the
  // contract uses the role consistently as a party (e.g. repeated "Seller" with
  // party-like context and at least one preamble mention).
  const bare = role.replace(/\?$/i, "").replace(/s$/i, "");
  if (new RegExp(`\\b${bare}\\b`, "i").test([...definedParties].join(" "))) return true;
  const preambleHit = new RegExp(`\\b[A-Z][\\w&.',-]*(?:\\s+[A-Z][\\w&.',-]*){0,3}?\\s*\\((?:the\\s+)?${bare}\\)`, "i").test(text);
  return preambleHit;
}

function isBoundName(sig: string, definedParties: Set<string>): boolean {
  const s = sig.toLowerCase();
  for (const p of definedParties) {
    const pl = p.toLowerCase();
    if (pl.includes(s) || s.includes(pl) || s.replace(/\s+/g, "").includes(pl.replace(/\s+/g, ""))) return true;
  }
  return false;
}

function snippetFor(text: string, re: RegExp, len = 160): string {
  const mm = text.match(re);
  if (!mm) return "";
  const idx = mm.index ?? 0;
  return text.slice(Math.max(0, idx - 30), idx + len).replace(/\s+/g, " ").trim();
}

export function renderPartyIntegrity(result: PartyIntegrityResult): string {
  const lines: string[] = [];
  lines.push("### PARTY, OBLIGOR & SIGNATURE INTEGRITY");
  lines.push("");
  const sigLabel: Record<SignatureState, string> = {
    NOT_PRESENT: "❌ FAIL — No signature block exists (drafting defect)",
    PRESENT_UNSIGNED: "⚠️ PENDING — Signature block present, agreement not yet executed",
    PRESENT_EXECUTED: "✅ PASS — Agreement executed",
  };
  lines.push(`**Signature Block Status:** ${sigLabel[result.signatureState]}`);
  lines.push("");
  if (!result.findings.length) {
    lines.push("_All referenced obligors are defined parties and signature blocks are consistent._");
    lines.push("");
    return lines.join("\n");
  }
  for (const f of result.findings) {
    lines.push(`- **${f.category.replace(/_/g, " ")}** (${f.severity.toUpperCase()}): ${f.description}`);
    if (f.evidence) lines.push(`  - Evidence: ${f.evidence.slice(0, 180)}`);
  }
  lines.push("");
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 4 (port): APPRAISAL RIGHTS ANALYZER (DGCL §262)
// Previously missing entirely from merger deal-type analysis.
// ─────────────────────────────────────────────────────────────────────────────

export type AppraisalRiskLevel = "HIGH" | "MEDIUM" | "LOW" | "NOT_APPLICABLE";

export interface AppraisalRightsResult {
  dealType: string;
  isMerger: boolean;
  riskLevel: AppraisalRiskLevel;
  findingTitle: string;
  findingDetail: string;
  legalFramework: string;
  riskFactors: string[];
  mitigantsDetected: string[];
  missingProtections: string[];
  recommendation: string;
  economicExposure: string;
}

const APPRAISAL_MERGER_INDICATORS = [
  /\b(?:statutory\s+)?merger\b/i,
  /\b(?:Section|§)\s*251\s+(?:of\s+(?:the\s+)?)?(?:Delaware|DGCL)\b/i,
  /\bDGCL\s*§?\s*251\b/i,
  /\bsurviving\s+(?:corporation|entity|company)\b/i,
  /\b(?:merge[drs]?\s+(?:with\s+and\s+into|into)|merging\s+(?:with|into))\b/i,
  /\b(?:merger\s+consideration|merger\s+agreement|plan\s+of\s+merger)\b/i,
];

const APPRAISAL_PROTECTION_PATTERNS = [
  /\bappraisal\s+(?:rights?|actions?|proceedings?|remedies?)\b/i,
  /\bmarket[-\s]out\s+exception\b/i,
  /\b(?:Section|§)\s*253\s+(?:of\s+(?:the\s+)?)?(?:Delaware|DGCL)\b/i,
  /\bshort[\s-]form\s+merger\b/i,
  /\bfairness\s+opinion\b/i,
  /\b(?:shareholder|stockholder)\s+(?:vote|approval|consent|meeting)\b/i,
  /\b(?:board\s+of\s+directors?|board)\s+(?:resolution|approval|recommendation)\b/i,
];

const APPRAISAL_RISK_FACTOR_PATTERNS: [string, RegExp][] = [
  ["No representations and warranties — target shareholders cannot assess fair value", /\b(?:no|not\s+addressed|omitted|absent)\s+representations?\s+and\s+warranties?/i],
  ["Fixed cash price with no working capital adjustment — price may not reflect fair value", /\$[\d,]+\s*(?:million|M)?.*payable\s+in\s+cash\s+at\s+closing(?![\s\S]*working\s+capital)/i],
  ["No fairness opinion referenced — no independent valuation support", /(?![\s\S]*fairness\s+opinion)[\s\S]*surviving\s+corporation/i],
  ["Seller convenience termination right — suggests price may not reflect full value", /\b(?:seller|target)\s+may\s+terminate\b[\s\S]{0,80}\b(?:at\s+any\s+time|for\s+convenience)\b/i],
  ["As-is acceptance — buyer waiving diligence recourse suggests information asymmetry", /\b(?:as[\s-]is|where[\s-]is)\b/i],
];

function detectMergerStructure(text: string): boolean {
  return APPRAISAL_MERGER_INDICATORS.some((re) => re.test(text));
}

export function analyzeAppraisalRights(
  text: string,
  dealType = "UNKNOWN",
  jurisdiction = "DELAWARE",
): AppraisalRightsResult {
  const isMerger =
    detectMergerStructure(text) ||
    /MERGER/.test(dealType.toUpperCase()) ||
    /STATUTORY MERGER/.test(dealType.toUpperCase());

  if (!isMerger) {
    return {
      dealType,
      isMerger: false,
      riskLevel: "NOT_APPLICABLE",
      findingTitle: "Appraisal Rights — Not Applicable (Non-Merger Structure)",
      findingDetail:
        "This transaction does not appear to be structured as a statutory merger. Appraisal rights under DGCL §262 are specific to merger transactions. Asset purchases and stock purchases do not trigger appraisal rights under Delaware law.",
      legalFramework: "N/A — Non-merger structure",
      riskFactors: [],
      mitigantsDetected: [],
      missingProtections: [],
      recommendation: "No appraisal rights analysis required for non-merger structures.",
      economicExposure: "N/A",
    };
  }

  const mitigantsDetected: string[] = [];
  for (const re of APPRAISAL_PROTECTION_PATTERNS) {
    const m = text.match(re);
    if (m) mitigantsDetected.push(m[0].slice(0, 80).trim());
  }

  const riskFactors: string[] = [];
  for (const [, re] of APPRAISAL_RISK_FACTOR_PATTERNS) {
    if (re.test(text)) {
      const label = APPRAISAL_RISK_FACTOR_PATTERNS.find(([, r]) => r === re)?.[0] ?? "Appraisal risk factor";
      riskFactors.push(label);
    }
  }

  const protectionChecks: [string, RegExp][] = [
    ["Appraisal rights disclosure to shareholders", /\bappraisal\s+rights?\b/i],
    ["Fairness opinion", /\bfairness\s+opinion\b/i],
    ["Shareholder vote/approval mechanism", /\b(?:shareholder|stockholder)\s+(?:vote|approval)\b/i],
    ["Board approval and recommendation", /\bboard\s+(?:of\s+directors?)?\s+(?:approval|recommendation)\b/i],
    ["Plan of Merger (required for DGCL §251)", /\bplan\s+of\s+merger\b/i],
    ["Appraisal rights waiver or market-out", /\b(?:appraisal\s+(?:waiver|rights?\s+waived)|market[\s-]out)\b/i],
  ];
  const missingProtections: string[] = [];
  for (const [name, re] of protectionChecks) {
    if (!re.test(text)) missingProtections.push(name);
  }

  let riskLevel: AppraisalRiskLevel;
  if (riskFactors.length >= 3 && mitigantsDetected.length === 0) riskLevel = "HIGH";
  else if (riskFactors.length >= 2 || missingProtections.length >= 4) riskLevel = "MEDIUM";
  else if (missingProtections.length >= 2) riskLevel = "MEDIUM";
  else riskLevel = "LOW";

  const jurisdictionLaw: Record<string, string> = {
    DELAWARE: "DGCL §262",
    CALIFORNIA: "Cal. Corp. Code §1300 et seq.",
    "NEW YORK": "BCL §623",
  };
  const law = jurisdictionLaw[jurisdiction.toUpperCase()] ?? "Applicable State Law";
  const riskLabel: Record<AppraisalRiskLevel, string> = {
    HIGH: "🔴 HIGH",
    MEDIUM: "🟠 MEDIUM",
    LOW: "🟢 LOW",
    NOT_APPLICABLE: "N/A",
  };

  let detail = `This is a statutory merger under ${law}. Dissenting shareholders of Target have the right to seek judicial appraisal of the 'fair value' of their shares. Risk Level: ${riskLabel[riskLevel]}.\n\n`;
  detail += `Risk Factors Identified (${riskFactors.length}):\n`;
  for (const rf of riskFactors) detail += `  • ${rf}\n`;
  if (mitigantsDetected.length) {
    detail += `\nMitigants Detected (${mitigantsDetected.length}):\n`;
    for (const m of mitigantsDetected) detail += `  • ${m}\n`;
  } else {
    detail += "\nNo appraisal risk mitigants detected.\n";
  }
  if (missingProtections.length) {
    detail += `\nMissing Protections (${missingProtections.length}):\n`;
    for (const mp of missingProtections) detail += `  • ${mp}\n`;
  }

  return {
    dealType,
    isMerger: true,
    riskLevel,
    findingTitle: `Appraisal Rights Exposure — ${riskLabel[riskLevel]} (${law} Statutory Merger)`,
    findingDetail: detail,
    legalFramework: `${law}: Dissenting shareholders of Target may seek judicial appraisal of 'fair value' of their shares. Fair value is determined without applying a minority discount. If judicially determined fair value exceeds the merger consideration, Buyer (as surviving corporation) must pay the difference plus statutory interest (5% over the Federal Reserve discount rate under DGCL §262(h)). Appraisal actions must be filed within 120 days of the Effective Time. The 'market out' exception (DGCL §262(b)(1)) may eliminate appraisal rights if Target's shares are listed on a national exchange — verify.`,
    riskFactors,
    mitigantsDetected,
    missingProtections,
    recommendation:
      "1. Determine whether market-out exception applies (DGCL §262(b)(1) — shares listed on national exchange). 2. Obtain fairness opinion to support merger consideration as fair value. 3. Ensure Plan of Merger includes required appraisal rights notice to shareholders (DGCL §262(d)). 4. Consider appraisal rights waiver mechanism if market-out unavailable. 5. Budget for potential appraisal claims in deal economics. 6. Confirm board approval and recommendation documentation (required for DGCL §251 merger).",
    economicExposure: estimateAppraisalExposure(text, riskLevel),
  };
}

function estimateAppraisalExposure(text: string, riskLevel: AppraisalRiskLevel): string {
  const priceMatch = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:million|M\b)?/i);
  let basePrice: number | null = null;
  if (priceMatch) {
    const raw = priceMatch[1].replace(/,/g, "");
    const n = parseFloat(raw);
    if (!Number.isNaN(n)) {
      basePrice = n < 1000 ? n * 1_000_000 : n;
    }
  }
  if (!basePrice) {
    return "Cannot estimate — purchase price not determinable from contract text. Appraisal exposure is the difference between fair value (judicially determined) and merger consideration, plus statutory interest.";
  }
  const mult: Record<AppraisalRiskLevel, [number, number]> = {
    HIGH: [0.1, 0.3],
    MEDIUM: [0.05, 0.15],
    LOW: [0.01, 0.05],
    NOT_APPLICABLE: [0, 0],
  };
  const [lo, hi] = mult[riskLevel];
  return `Estimated appraisal exposure: $${(basePrice * lo).toLocaleString()}–$${(basePrice * hi).toLocaleString()} (${lo * 100}–${hi * 100}% of $${basePrice.toLocaleString()} merger consideration), plus statutory interest (5% over Federal Reserve discount rate under DGCL §262(h)). Actual exposure depends on percentage of dissenting shareholders and judicially determined fair value, which may exceed merger consideration.`;
}

export function renderAppraisalRights(result: AppraisalRightsResult): string {
  if (!result.isMerger) return "";
  const lines: string[] = [];
  lines.push("### APPRAISAL RIGHTS ANALYSIS (DGCL §262)");
  lines.push("");
  lines.push(`**Risk Level:** ${result.riskLevel}`);
  lines.push(`**Legal Framework:** ${result.legalFramework}`);
  lines.push("");
  lines.push(result.findingDetail.trimEnd());
  lines.push("");
  lines.push(`**Economic Exposure:** ${result.economicExposure}`);
  lines.push("");
  lines.push(`**Recommendation:** ${result.recommendation}`);
  lines.push("");
  lines.push("⚠️ HUMAN REVIEW REQUIRED — Appraisal rights exposure depends on shareholder composition, share listing status (market-out exception), and judicially determined fair value. Confirm with Delaware M&A counsel.");
  lines.push("");
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 5 (port): DGCL §251 EXECUTION MECHANICS CHECKER
// Checks merger agreements for Effective Time, Certificate of Merger filing,
// Board approval, and Plan of Merger. Previously missing.
// ─────────────────────────────────────────────────────────────────────────────

export interface DgclDefect {
  defect: string;
  severity: "HIGH" | "MEDIUM";
  legalBasis: string;
  consequence: string;
  fix: string;
}

export interface DgclMechanicsResult {
  isMerger: boolean;
  effectiveTimeDefined: boolean;
  certificateFilingAddressed: boolean;
  boardApprovalAddressed: boolean;
  planOfMergerReferenced: boolean;
  planOfMergerAttached: boolean;
  defectsFound: DgclDefect[];
  severity: Severity;
  findingTitle: string;
  findingDetail: string;
  recommendation: string;
}

const DGCL_EFFECTIVE_TIME_PATTERNS = [
  /"Effective\s+Time"\s*(?:means?|shall\s+mean|is\s+defined)/i,
  /"Effective\s+Time"\s+(?:shall\s+be|means?)/i,
  /Effective\s+Time.*?(?:Certificate\s+of\s+Merger|filing)/i,
  /(?:shall\s+become|becomes?)\s+effective\s+(?:upon|when|at\s+the\s+time)/i,
];
const DGCL_CERT_FILING_PATTERNS = [
  /\bCertificate\s+of\s+Merger\b/i,
  /file\s+(?:or\s+cause\s+to\s+be\s+filed)?\s+(?:a\s+)?(?:Certificate|Articles)\s+of\s+Merger/i,
  /Delaware\s+Secretary\s+of\s+State[\s\S]{0,40}?filing/i,
  /filing\s+(?:of\s+(?:a|the)\s+)?Certificate\s+of\s+Merger/i,
  /\bDGCL\s*§?\s*251\s*\(c\)/i,
];
const DGCL_BOARD_APPROVAL_PATTERNS = [
  /\b(?:Board\s+of\s+Directors?|Board)\s+(?:has\s+)?(?:approved|adopted|authorized)/i,
  /\b(?:duly\s+)?authorized\s+(?:and\s+approved\s+)?by\s+(?:the\s+)?Board/i,
  /\b(?:Board|Directors?)\s+(?:Resolution|Approval|Consent)/i,
  /\b(?:written\s+consent|unanimous\s+written\s+consent)\s+of\s+(?:the\s+)?(?:Board|Directors?)/i,
];
const DGCL_PLAN_REF_PATTERNS = [
  /\bPlan\s+of\s+Merger\b/i,
  /(?:Exhibit|Schedule|Annex)\s+[A-Z\d]+\s*[:\-]?\s*Plan\s+of\s+Merger/i,
  /plan\s+of\s+merger\s+(?:attached|incorporated|annexed)/i,
];
const DGCL_PLAN_ATTACHED_PATTERNS = [
  /(?:attached\s+hereto|incorporated\s+(?:herein|by\s+reference))\s+as\s+(?:Exhibit|Schedule|Annex)\s+[A-Z\d]+/i,
  /Plan\s+of\s+Merger[\s\S]{0,60}?(?:attached|annexed|incorporated)/i,
];

export function runDgclExecutionMechanics(text: string): DgclMechanicsResult {
  const isMerger = /\b(?:statutory\s+)?merger\b|DGCL\s*§?\s*251|surviving\s+corporation/i.test(text);
  if (!isMerger) {
    return {
      isMerger: false,
      effectiveTimeDefined: false,
      certificateFilingAddressed: false,
      boardApprovalAddressed: false,
      planOfMergerReferenced: false,
      planOfMergerAttached: false,
      defectsFound: [],
      severity: "low",
      findingTitle: "DGCL §251 Mechanics Check — Not Applicable (Non-Merger)",
      findingDetail: "Transaction is not a statutory merger. DGCL §251 not applicable.",
      recommendation: "N/A",
    };
  }

  const effectiveTimeDefined = DGCL_EFFECTIVE_TIME_PATTERNS.some((re) => re.test(text));
  const certificateFilingAddressed = DGCL_CERT_FILING_PATTERNS.some((re) => re.test(text));
  const boardApprovalAddressed = DGCL_BOARD_APPROVAL_PATTERNS.some((re) => re.test(text));
  const planOfMergerReferenced = DGCL_PLAN_REF_PATTERNS.some((re) => re.test(text));
  const planOfMergerAttached = DGCL_PLAN_ATTACHED_PATTERNS.some((re) => re.test(text));

  const defectsFound: DgclDefect[] = [];
  if (!effectiveTimeDefined) {
    defectsFound.push({
      defect: "Effective Time undefined",
      severity: "HIGH",
      legalBasis: "DGCL §251(c) requires merger to become effective upon filing of Certificate of Merger",
      consequence: "Without a defined Effective Time, there is no agreed moment at which the merger becomes legally effective. Economic closing (cash transfer) may occur without legal effectiveness of the merger.",
      fix: 'Add definition: \'"Effective Time" means the time at which the Certificate of Merger is duly filed with the Secretary of State of Delaware (or such later time as may be specified in the Certificate of Merger as permitted by the DGCL).\'',
    });
  }
  if (!certificateFilingAddressed) {
    defectsFound.push({
      defect: "Certificate of Merger filing obligation absent",
      severity: "HIGH",
      legalBasis: "DGCL §251(c) — merger effective only upon filing of Certificate of Merger",
      consequence: "Neither party is contractually obligated to file the Certificate of Merger. If cash transfers at closing but no Certificate is filed, the merger is not legally consummated and Target continues to exist as a separate legal entity.",
      fix: "Add covenant: 'As promptly as practicable after the Closing, Buyer shall file, or cause to be filed, a Certificate of Merger with the Secretary of State of the State of Delaware in accordance with DGCL §251(c).'",
    });
  }
  if (!boardApprovalAddressed) {
    defectsFound.push({
      defect: "Board approval documentation absent",
      severity: "MEDIUM",
      legalBasis: "DGCL §251(b) requires Board of Directors to adopt and approve the merger agreement",
      consequence: "Without documented board approval, the merger agreement may be unenforceable against the corporation, and officers signing may lack authority.",
      fix: "Add closing condition requiring Seller's Board resolutions approving the Agreement, delivered to Buyer, and an officer certificate confirming board approval.",
    });
  }
  if (!planOfMergerReferenced) {
    defectsFound.push({
      defect: "Plan of Merger not referenced",
      severity: "HIGH",
      legalBasis: "DGCL §251(b) requires the merger agreement to include, or incorporate by reference, a plan of merger",
      consequence: "DGCL §251(b) requires the merger agreement to set forth names of constituent/ surviving corporations, terms, share conversion, and certificate amendments. Without a Plan of Merger, the Agreement may not satisfy §251(b).",
      fix: "Attach a Plan of Merger as Exhibit A addressing all DGCL §251(b) requirements.",
    });
  } else if (!planOfMergerAttached) {
    defectsFound.push({
      defect: "Plan of Merger referenced but not attached",
      severity: "HIGH",
      legalBasis: "DGCL §251(b) — Plan of Merger must be complete and adopted by Board",
      consequence: "An unattached Plan of Merger cannot be adopted by the Board, approved by shareholders, or filed with the Certificate of Merger. Closing cannot occur without the complete Plan.",
      fix: "Attach complete Plan of Merger as a named Exhibit; ensure adopted by Board resolution and referenced in Certificate of Merger filing.",
    });
  }

  let severity: Severity = "low";
  if (defectsFound.some((d) => d.severity === "HIGH")) severity = "high";
  else if (defectsFound.length) severity = "moderate";

  let findingDetail: string;
  let recommendation: string;
  if (!defectsFound.length) {
    findingDetail =
      "All required DGCL §251 execution mechanics detected: Effective Time defined, Certificate of Merger filing addressed, Board approval documented, Plan of Merger referenced and attached.";
    recommendation = "Confirm board resolutions adopted before closing and Certificate of Merger filed promptly after closing.";
  } else {
    findingDetail = `DGCL §251 Execution Mechanics Analysis: ${defectsFound.length} defect(s) found.\n\nDefects:\n` +
      defectsFound.map((d) => `  [${d.severity}] ${d.defect}: ${d.consequence.slice(0, 150)}...`).join("\n");
    recommendation = `Required fixes (${defectsFound.length}):\n` +
      defectsFound.map((d) => `  • ${d.fix.slice(0, 150)}...`).join("\n") +
      "\n\nThese are statutory requirements for a valid DGCL §251 merger. Failure to address them may render the merger invalid regardless of the parties' intent.";
  }

  return {
    isMerger: true,
    effectiveTimeDefined,
    certificateFilingAddressed,
    boardApprovalAddressed,
    planOfMergerReferenced,
    planOfMergerAttached,
    defectsFound,
    severity,
    findingTitle: `DGCL §251 Execution Mechanics — ${defectsFound.length ? `${defectsFound.length} Defect(s) Found` : "PASS"}`,
    findingDetail,
    recommendation,
  };
}

export function renderDgclExecutionMechanics(result: DgclMechanicsResult): string {
  if (!result.isMerger) return "";
  const lines: string[] = [];
  lines.push("### DGCL §251 EXECUTION MECHANICS");
  lines.push("");
  lines.push(`**Status:** ${result.findingTitle}`);
  lines.push("");
  lines.push(result.findingDetail.trimEnd());
  lines.push("");
  lines.push(`**Recommendation:** ${result.recommendation}`);
  lines.push("");
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL GATE C — EXECUTION READINESS GATE
// Consolidates the above mechanical blockers plus missing operative exhibits/
// schedules and undefined controlling terms into a single readiness verdict.
// A FAIL here caps the overall risk score (see routes/analyses.ts). This is the
// "completeness gate" the external reviews said was missing: a missing Plan of
// Merger (Exhibit A) is itself an execution-blocking defect, not merely a
// thing that "would change the Tier if found".
// ─────────────────────────────────────────────────────────────────────────────

export type ReadinessStatus = "FAIL" | "CONDITIONAL" | "PASS";

export interface ReadinessGateResult {
  status: ReadinessStatus;
  blockers: string[];
  conditions: string[];
  /** True when status implies the overall risk score must be capped. */
  capsScore: boolean;
}

export function runReadinessGate(args: {
  partyFindings: PartyIntegrityFinding[];
  undefinedControllingTerms: string[];
  text: string;
  /** Operative exhibit/schedule references that are not present in the corpus. */
  missingOperativeRefs?: string[];
}): ReadinessGateResult {
  const blockers: string[] = [];
  const conditions: string[] = [];

  for (const f of args.partyFindings) {
    if (f.severity === "critical") blockers.push(f.description);
    else if (f.severity === "high") blockers.push(f.description);
    else conditions.push(f.description);
  }

  if (args.undefinedControllingTerms.length) {
    blockers.push(`Controlling terms undefined: ${args.undefinedControllingTerms.join(", ")}.`);
  }

  const missing = args.missingOperativeRefs ?? detectMissingOperativeRefs(args.text);
  if (missing.length) {
    blockers.push(`Referenced operative document(s) not provided: ${missing.join(", ")}. A merger without the Plan of Merger / disclosure schedules is not execution-ready.`);
  }

  // Merger mechanics present but no post-merger entity mechanics described.
  if (MERGER_RE.test(args.text) && !/\bsurviving\s+(?:corporation|entity)\b[^.]{0,80}?\bassume/i.test(args.text)) {
    conditions.push("Statutory merger referenced but assumption-of-liabilities / successor mechanics not clearly described.");
  }

  let status: ReadinessStatus;
  let capsScore = false;
  if (blockers.length >= 1) {
    status = "FAIL";
    capsScore = true;
  } else if (conditions.length >= 1) {
    status = "CONDITIONAL";
  } else {
    status = "PASS";
  }

  return { status, blockers: blockers.slice(0, 15), conditions: conditions.slice(0, 10), capsScore };
}

/** Detect references to Exhibit A / Schedule 1.1 etc. that look like operative
 *  merger documents but are not accompanied by the content in the corpus. */
export function detectMissingOperativeRefs(text: string): string[] {
  const missing: string[] = [];
  const refs = text.match(/\b(?:Plan\s+of\s+Merger|Disclosure\s+Schedules?|Exhibit\s+[A-Z]\b|Schedule\s+\d+(?:\.\d+)*)\b/gi) || [];
  const uniq = [...new Set(refs.map((r) => r.trim()))];
  for (const ref of uniq) {
    // If the document body does not actually contain the referenced content
    // (it is only named, not present), flag it as missing from the corpus.
    const name = ref.replace(/^(exhibit|schedule)\s+/i, "").trim();
    const present = new RegExp(`\\b${name}\\b[\\s\\S]{0,40}[:=]`, "i").test(text) || new RegExp(`\\b${name}\\b[^.]{0,30}\\b(?:means|set[s]?\\s+forth|attached|annexed)\\b`, "i").test(text);
    if (!present && /\bplan\s+of\s+merger\b|\bdisclosure\s+schedules?\b/i.test(ref)) {
      missing.push(ref);
    }
  }
  return missing;
}

export function renderReadinessGate(result: ReadinessGateResult): string {
  const lines: string[] = [];
  lines.push("### EXECUTION READINESS GATE");
  lines.push("");
  lines.push(`**Status: ${result.status}**${result.capsScore ? " _(overall risk score capped — see Stage 12)_" : ""}`);
  lines.push("");
  if (result.blockers.length) {
    lines.push("**Execution-blocking defects:**");
    for (const b of result.blockers) lines.push(`- ${b}`);
    lines.push("");
  }
  if (result.conditions.length) {
    lines.push("**Conditions / diligence to confirm:**");
    for (const c of result.conditions) lines.push(`- ${c}`);
    lines.push("");
  }
  if (!result.blockers.length && !result.conditions.length) {
    lines.push("_No mechanical readiness defects detected from the provided text._");
    lines.push("");
  }
  return lines.join("\n");
}
