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
  summary: { totalNodes: number; totalEdges: number; byType: Record<string, number> };
}

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
const SCHEDULE_RE = /\b(?:Schedule|Exhibit|Annex|Appendix)\s+([A-Z]?\d+[a-z]?)\b/gi;
const SCHEDULE_REF_RE = /\b(?:pursuant\s+to|as\s+set\s+forth\s+in|referenced\s+in|set\s+forth\s+on|attached\s+as)\s+(?:Schedule|Exhibit|Annex|Appendix)\s+([A-Z]?\d+[a-z]?)\b/gi;

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

  // Missing links: defined terms never referenced elsewhere
  const missingLinks: string[] = [];
  for (const n of nodes) {
    if (n.entityType === "defined_term" && n.occurrences <= 1) {
      missingLinks.push(`${n.name} (defined but never referenced)`);
    }
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
  ]);
  const undefinedTerms: string[] = [];
  const capRe = /\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){0,3})\b/g;
  const seen = new Set<string>();
  let cm2: RegExpExecArray | null;
  while ((cm2 = capRe.exec(text)) !== null) {
    const w = cm2[1].trim();
    const low = w.toLowerCase();
    if (seen.has(low) || skip.has(w) || definedTermNames.has(low)) continue;
    seen.add(low);
    if (w.length < 4 || w.length > 40) continue;
    undefinedTerms.push(w);
  }

  const byType: Record<string, number> = {};
  for (const n of nodes) byType[n.entityType] = (byType[n.entityType] || 0) + 1;

  return {
    nodes,
    edges,
    missingLinks: missingLinks.slice(0, 25),
    undefinedTerms: undefinedTerms.slice(0, 25),
    summary: { totalNodes: nodes.length, totalEdges: edges.length, byType },
  };
}

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
  const schRe = /\b(?:Schedule|Exhibit|Annex|Appendix)\s+([A-Z]?\d+[a-z]?)\b/gi;
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
    const attachRe = /\b(?:Schedule|Exhibit|Annex|Appendix)\s+([A-Z]?\d+[a-z]?)\s*[:—-]/gi;
    while ((am = attachRe.exec(meta.text)) !== null) attachedLabels.add(am[1].trim().toUpperCase());

    const refRe = /\b(?:pursuant\s+to|as\s+set\s+forth\s+in|referenced\s+in|set\s+forth\s+on|attached\s+as|see)\s+(?:Schedule|Exhibit|Annex|Appendix)\s+([A-Z]?\d+[a-z]?)\b/gi;
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
    patterns: [/\bBuyer\s+(?:shall\s+)?indemnif\w*\s+(?:the\s+)?Seller\b/i, /\bindemnif\w*\s+(?:the\s+)?Seller\s+for\s+(?:the\s+)?Seller'?s\b/i],
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

export interface RegulatoryFrameworkT {
  name: string;
  severity: Severity;
  approvalRequired: boolean;
  jurisdiction: string;
  notes: string;
  checklist: string[];
}

interface FrameworkDef {
  name: string;
  description: string;
  agency: string;
  jurisdiction: string;
  approvalRequired: boolean;
  triggerKeywords: string[];
  checklist: string[];
}

const FRAMEWORKS: FrameworkDef[] = [
  {
    name: "Delaware Corporate Law",
    description: "DGCL governs internal affairs of Delaware entities (merger procedure, appraisal rights, fiduciary duties).",
    agency: "Delaware Secretary of State",
    jurisdiction: "Delaware, USA",
    approvalRequired: true,
    triggerKeywords: ["delaware", "dgcl", "section 251", "section 262", "appraisal rights", "surviving corporation", "certificate of merger"],
    checklist: ["File Certificate of Merger", "Obtain board & shareholder approval", "Provide appraisal rights notice"],
  },
  {
    name: "Federal Securities Law",
    description: "Securities Act / Exchange Act disclosure, anti-fraud (Rule 10b-5), beneficial ownership.",
    agency: "SEC",
    jurisdiction: "USA",
    approvalRequired: true,
    triggerKeywords: ["sec", "securities act", "exchange act", "rule 10b-5", "schedule 13d", "form s-4", "proxy statement", "public company", "tender offer"],
    checklist: ["File registration statement (S-4/S-3)", "Prepare proxy DEF 14A", "Beneficial ownership reports"],
  },
  {
    name: "HSR Antitrust (Pre-Merger Notification)",
    description: "Hart-Scott-Rodino requires pre-merger notification & waiting period above size thresholds.",
    agency: "FTC / DOJ Antitrust Division",
    jurisdiction: "USA",
    approvalRequired: true,
    triggerKeywords: ["hsr", "hart-scott-rodino", "pre-merger notification", "waiting period", "second request", "antitrust"],
    checklist: ["File HSR Form", "Pay filing fee", "Observe waiting period", "Prepare for second request"],
  },
  {
    name: "CFIUS (Foreign Investment)",
    description: "Committee on Foreign Investment reviews foreign investment in U.S. businesses for national security.",
    agency: "CFIUS (Treasury-led)",
    jurisdiction: "USA",
    approvalRequired: true,
    triggerKeywords: ["cfius", "foreign person", "foreign investment", "national security", "foreign government"],
    checklist: ["File declaration/notification", "Observe review period", "Negotiate mitigation if required"],
  },
  {
    name: "OFAC Sanctions",
    description: "Office of Foreign Assets Control administers economic sanctions programs.",
    agency: "OFAC / Treasury",
    jurisdiction: "USA",
    approvalRequired: false,
    triggerKeywords: ["ofac", "sanctions", "sdn list", "blocked party", "embargo"],
    checklist: ["Screen parties against SDN list", "Confirm no blocked-person dealing"],
  },
  {
    name: "FCPA (Anti-Bribery)",
    description: "Foreign Corrupt Practices Act prohibits bribery of foreign officials; books & records requirements.",
    agency: "DOJ / SEC",
    jurisdiction: "USA (extraterritorial)",
    approvalRequired: false,
    triggerKeywords: ["fcpa", "foreign official", "bribery", "anti-bribery", "books and records"],
    checklist: ["Implement FCPA compliance program", "Third-party due diligence", "Accurate books & records"],
  },
  {
    name: "Export Controls (EAR / ITAR)",
    description: "Export Administration Regulations and ITAR control exports of goods, tech, and defense articles.",
    agency: "BIS / DDTC",
    jurisdiction: "USA",
    approvalRequired: true,
    triggerKeywords: ["ear", "itar", "export control", "eccn", "usml", "dual-use", "technical data"],
    checklist: ["Classify under ECCN/USML", "Determine license need", "Screen denied persons"],
  },
  {
    name: "GDPR (Data Privacy)",
    description: "General Data Protection Regulation governs processing of EEA personal data.",
    agency: "EU Data Protection Authorities",
    jurisdiction: "European Economic Area",
    approvalRequired: false,
    triggerKeywords: ["gdpr", "eea", "eu data", "European Union", "data subject", "personal data"],
    checklist: ["Appoint DPO if required", "Conduct DPIA", "Ensure cross-border transfer mechanisms"],
  },
  {
    name: "CCPA / CPRA (California Privacy)",
    description: "California Consumer Privacy Act grants consumers rights over personal information.",
    agency: "California Privacy Protection Agency",
    jurisdiction: "California, USA",
    approvalRequired: false,
    triggerKeywords: ["ccpa", "cpra", "california consumer", "california resident", "sale of personal information"],
    checklist: ["Update privacy policy", "Implement consumer request procedures", "Maintain opt-out mechanism"],
  },
  {
    name: "HIPAA (Health Data)",
    description: "Health Insurance Portability and Accountability Act protects patient health information.",
    agency: "HHS Office for Civil Rights",
    jurisdiction: "USA",
    approvalRequired: false,
    triggerKeywords: ["hipaa", "protected health information", "phi", "covered entity", "business associate"],
    checklist: ["Risk analysis", "Safeguards", "Business associate agreements", "Breach notification"],
  },
  {
    name: "Employment Law",
    description: "Federal/state employment statutes: WARN Act, anti-discrimination, ERISA, non-compete enforceability.",
    agency: "DOL / EEOC",
    jurisdiction: "USA",
    approvalRequired: false,
    triggerKeywords: ["warn act", "employment", "non-compete", "erisa", "benefit plan", "worker adjustment"],
    checklist: ["WARN Act notice assessment", "Benefit plan review", "Non-compete enforceability check"],
  },
  {
    name: "Tax Law",
    description: "Federal/state tax consequences: §1060 asset allocation, §338(h)(10) elections, withholding.",
    agency: "IRS",
    jurisdiction: "USA",
    approvalRequired: false,
    triggerKeywords: ["section 1060", "section 338", "tax allocation", "step transaction", "tax withholding"],
    checklist: ["Confirm §1060 allocation mechanics", "Review entity-level tax exposure"],
  },
  {
    name: "Environmental Law",
    description: "CERCLA, Clean Air/Water Acts, RCRA govern environmental liability in asset/deal transactions.",
    agency: "EPA",
    jurisdiction: "USA",
    approvalRequired: false,
    triggerKeywords: ["cercla", "superfund", "clean air act", "clean water act", "rcra", "environmental liability", "hazardous"],
    checklist: ["Phase I/II environmental assessment", "Allocate pre-closing environmental liability"],
  },
];

export function runRegulatoryAnalysis(text: string): { frameworks: RegulatoryFrameworkT[] } {
  const lower = text.toLowerCase();
  const frameworks: RegulatoryFrameworkT[] = [];
  for (const fw of FRAMEWORKS) {
    const hit = fw.triggerKeywords.some((k) => lower.includes(k.toLowerCase()));
    if (hit) {
      frameworks.push({
        name: fw.name,
        severity: fw.approvalRequired ? "high" : "moderate",
        approvalRequired: fw.approvalRequired,
        jurisdiction: fw.jurisdiction,
        notes: fw.description,
        checklist: fw.checklist,
      });
    }
  }
  return { frameworks };
}

export function renderRegulatory(result: { frameworks: RegulatoryFrameworkT[] }): string {
  const lines: string[] = [];
  lines.push("### REGULATORY ANALYSIS (STAGE 8)");
  lines.push("");
  if (!result.frameworks.length) {
    lines.push("_No specific regulatory framework triggers detected in the provided text._");
    lines.push("");
    return lines.join("\n");
  }
  lines.push(`**${result.frameworks.length}** potentially applicable framework(s):`);
  lines.push("");
  for (const f of result.frameworks) {
    const approval = f.approvalRequired ? "⚠ Approval/notification likely required" : "No prior approval typically required";
    lines.push(`- **${f.name}** (${f.jurisdiction}) — ${approval}`);
    lines.push(`  - ${f.notes}`);
    if (f.checklist.length) lines.push(`  - Key steps: ${f.checklist.join("; ")}.`);
  }
  lines.push("");
  lines.push("_Never assume regulatory approval. Confirm thresholds, exemptions, and filing timelines with counsel._");
  lines.push("");
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 9 — LITIGATION RISK ASSESSMENT
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = "critical" | "high" | "moderate" | "low";
export type Confidence = "high" | "medium" | "low";

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

export function runLitigationRisk(
  text: string,
  context?: { hasIndemnificationCap?: boolean; hasEscrow?: boolean; hasRWI?: boolean; hasDisclosureSchedules?: boolean; hasFinancialStatements?: boolean; hasRegulatoryFilings?: boolean }
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
      level = "low";
      confidence = "low";
    }

    // Escalate to critical when strong, repeated indicators exist
    if (evidence.length >= 5) level = "critical";

    const mitigatingFactors = [...rule.mitigators];
    if (ctxObj.hasIndemnificationCap) mitigatingFactors.push("Indemnification cap limits exposure");
    if (ctxObj.hasEscrow) mitigatingFactors.push("Escrow provides recovery mechanism");
    if (ctxObj.hasRWI) mitigatingFactors.push("RWI policy provides additional coverage");

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
  const flagged = result.areas.filter((a) => a.level !== "low");
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
