/**
 * qa-guardrails.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic, prompt-agnostic QA checks on the FINAL report markdown against
 * the source contract. These catch the mechanical failure modes called out in the
 * training brief (Option 2 "analysis_qa"):
 *   - governing-law misidentification (e.g. citing Delaware when it doesn't govern)
 *   - "fraud is capped" misstatement when fraud is carved out but trapped elsewhere
 *   - misuse of "materiality scrape" for preserved materiality qualifiers
 *   - schedule-reference truncation (report says "Schedule 1", contract says "1.1(a)")
 *   - false "unused / never-referenced" defined-term findings
 *
 * Output is ADVISORY: issues are logged + audited and surfaced in the report so a
 * human reviewer can confirm. They do NOT trigger a full LLM regeneration.
 */

const KNOWN_LIVELY_TERMS = [
  "Acquired Assets",
  "Assumed Liabilities",
  "Excluded Liabilities",
  "Material Adverse Effect",
  "Earnout Period",
  "Closing Date",
  "Purchased Assets",
  "Included Assets",
];

export interface QaGuardrailResult {
  issues: string[];
}

function extractGeneralGoverningLaw(text: string): string {
  // Prefer the dedicated "Governing Law" clause if one exists, so a stray
  // "laws of the State of X" buried in a recital doesn't mislead the check.
  const govSection = text.match(
    /governing\s+law\.?([\s\S]{0,900}?)(?=\n\s*\d+\.\d+\s+[A-Z]|\n[A-Z][a-z]{3,}:\s*$|\n\s*$)/i
  );
  const haystack = govSection ? govSection[1] : text;
  const m = haystack.match(/laws\s+of\s+(?:the\s+State\s+of\s+)?([A-Za-z]+)/i);
  return m ? m[1].toLowerCase() : "unknown";
}

export function runQaGuardrail(contractText: string, reportMarkdown: string): QaGuardrailResult {
  const issues: string[] = [];

  // 1. Governing-law misidentification
  const gov = extractGeneralGoverningLaw(contractText);
  if (gov !== "delaware" && gov !== "unknown") {
    if (/(delaware|akorn|fresenius)/i.test(reportMarkdown)) {
      issues.push(
        `Report cites Delaware doctrine, but the general governing law appears to be ${gov}. ` +
          `Label Delaware as non-governing market guidance or remove it.`
      );
    }
  }

  // 2. "Fraud is capped" misstatement
  const fraudCarveout = /shall not apply.{0,200}fraud/i.test(contractText);
  if (fraudCarveout && /fraud .{0,40}(capped|subject to .{0,30}(cap|basket))/i.test(reportMarkdown)) {
    issues.push(
      `Report may state fraud is capped/basketed despite a fraud carve-out from limitations. ` +
        `If fraud is also forced into the exclusive remedy / anti-reliance stack, say exactly that — do not say "fraud is capped".`
    );
  }

  // 3. Materiality-scrape misuse
  const noScrape =
    /in all material respects.{0,150}giving effect to all materiality and knowledge qualifiers/i.test(contractText);
  if (noScrape && /materiality scrape/i.test(reportMarkdown)) {
    issues.push(
      `Contract preserves materiality + Knowledge qualifiers (no scrape / double-materiality protection). ` +
        `Do not label this a "materiality scrape".`
    );
  }

  // 4. Schedule / Exhibit reference truncation — generalized to ANY base number
  //    (the old check only caught "Schedule 1" and "Schedule 3").
  const seen = new Set<string>();
  const schedRe = /\b(Schedule|Exhibit)\s+(\d+)(?![.\d(a-zA-Z)])/gi;
  let sm: RegExpExecArray | null;
  const truncated: string[] = [];
  while ((sm = schedRe.exec(reportMarkdown)) !== null) {
    const label = sm[1];
    const num = sm[2];
    if (seen.has(`${label} ${num}`)) continue;
    seen.add(`${label} ${num}`);
    const hasDetail = new RegExp(`\\b${label}\\s+${num}\\.\\d`, "i").test(contractText);
    const hasLetter = new RegExp(`\\b${label}\\s+${num}\\(\\w\\)`, "i").test(contractText);
    if (hasDetail || hasLetter) truncated.push(`${label} ${num}`);
  }
  if (truncated.length) {
    issues.push(
      `Possible schedule/exhibit truncation: the report references "${truncated.join(
        '", "'
      )}" without sub-numbering, but the contract uses detailed sub-references ` +
        `(e.g. "${truncated[0]}.1(a)"). Preserve full schedule/exhibit sub-numbering.`
    );
  }

  // 5. False "unused / never-referenced" defined terms
  for (const term of KNOWN_LIVELY_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const usage = (contractText.match(new RegExp(`\\b${escaped}\\b`, "gi")) || []).length;
    if (usage > 1) {
      const flaggedUnused =
        new RegExp(`${escaped}.{0,40}(never referenced|unused|dead definition|not referenced)`, "i").test(reportMarkdown);
      if (flaggedUnused) {
        issues.push(
          `"${term}" is flagged as unused/never-referenced, but it appears ${usage} times in the contract. ` +
            `This is a parser false positive — count all body uses (including unquoted) before flagging a dead definition.`
        );
      }
    }
  }

  // 6. Citation validator — every §N / Section N cited must resolve to a section
  //    that actually exists in the parsed contract. Phantom citations (e.g. §21 in
  //    a 14-section document, or template residue like "Standard 18-Month Rep
  //    Survival") destroy client trust and are the easiest class of error to catch.
  const allowedSections = new Set<number>();
  const secRe = /(?:^|\n)\s*(?:Section|Article|§)\s*(\d{1,3})\b/g;
  let secm: RegExpExecArray | null;
  while ((secm = secRe.exec(contractText)) !== null) allowedSections.add(parseInt(secm[1], 10));
  if (allowedSections.size >= 3) {
    const maxSec = Math.max(...allowedSections);
    const citeRe = /\b(?:Section|§)\s*(\d{1,3})\b/g;
    const badCites = new Set<number>();
    let cm2: RegExpExecArray | null;
    while ((cm2 = citeRe.exec(reportMarkdown)) !== null) {
      const n = parseInt(cm2[1], 10);
      if (!allowedSections.has(n)) badCites.add(n);
    }
    if (badCites.size) {
      issues.push(
        `Citation integrity: the report references section(s) ${[...badCites]
          .sort((a, b) => a - b)
          .join(", ")} which do not exist in the parsed contract (highest real section is §${maxSec}). ` +
          `Validate every §N against the parsed section index before delivery — do not let finding IDs leak into section slots.`
      );
    }
  }

  return { issues };
}

/**
 * stripInternalTags — code-level sanitizer that removes pipeline-internal
 * annotations from the client-facing report (e.g. "FINDING-021", "Agent 1",
 * "true_missed_item", "L3-A", "RISK-ASIS-...", "★ NEW", "[RECONCILER] ...").
 * These are emitted by the LLM or injected by the reconciler and must never
 * reach a deliverable. Idempotent and safe to run repeatedly.
 */
const INTERNAL_TAG_PATTERNS: RegExp[] = [
  /\[RECONCILER\][^\n]*/gi,
  /\[RECONCILER OUTPUT INJECTED[^\]]*\]/gi,
  /\bFINDING-\d+\b/gi,
  /\bA1-\d{3}\b/gi,
  /\btrue_missed_item\b/gi,
  /\bInvariant\s+\d+/gi,
  /\bL3-[A-D]\b/gi,
  /RISK-ASIS-[A-Z-]+/gi,
  /★\s*NEW/gi,
  /\bAgent\s*1\b/gi,
  /\bSpecialist\s*#\s*[12]\b/gi,
  /\bCRITIC\s*\/\s*RECONCILER\b/gi,
];

export function stripInternalTags(markdown: string): string {
  let out = markdown;
  for (const p of INTERNAL_TAG_PATTERNS) out = out.replace(p, "");
  out = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

export function renderQaGuardrail(issues: string[]): string {
  if (!issues.length) return "";
  const lines: string[] = ["### DETERMINISTIC QA GUARDRAIL (ADVISORY)"];
  lines.push("");
  lines.push(
    "Automated prompt-compliance checks flagged the following for human review. " +
      "These are advisory and do not change the legal conclusions above."
  );
  lines.push("");
  for (const i of issues) lines.push(`- ${i}`);
  return lines.join("\n");
}

/**
 * Sensational / non-standard terminology → precise M&A vernacular. The external
 * reviews flagged "Buyer Suicide Pill" (a poison pill is a takeover defense,
 * not an indemnity-recourse mismatch) and "Roach Motel" as analyst coinage that
 * undermines credibility. These are replaced everywhere they appear.
 */
export const TERMINOLOGY_REPLACEMENTS: [RegExp, string][] = [
  [/\bBuyer\s+Suicide\s+Pill\b/gi, "Liability–Recourse Mismatch"],
  [/\bsuicide\s+pill\b/gi, "liability-recourse mismatch"],
  [/\bRoach\s+Motel\b/gi, "Asymmetrical Termination Trap"],
];

/** Replace sensational terminology in client-facing markdown. Idempotent. */
export function sanitizeTerminology(markdown: string): string {
  let out = markdown;
  for (const [re, repl] of TERMINOLOGY_REPLACEMENTS) out = out.replace(re, repl);
  return out;
}

/**
 * Scorecard consistency check: the report's stated score, risk level, and
 * recommendation must agree with the L3-C mapping the prompt mandates
 * (0-33 → CRITICAL/DO NOT PROCEED; 34-66 → MODERATE/PROCEED WITH CONDITIONS;
 * 67-100 → LOW/PROCEED). Flags any drift between the three fields for human
 * review (advisory, does not recompute the score).
 */
export function checkScorecardConsistency(report: string): string[] {
  const issues: string[] = [];
  const scoreM = report.match(/risk\s+score\s*[:\s]+\*\*?(\d{1,3})\*\*?/i) ||
    report.match(/risk\s+score[:\s]+(\d{1,3})/i);
  const levelM = report.match(/risk\s+level\s*[:\s]+\*\*?(CRITICAL|HIGH|MODERATE|LOW)\*\*?/i) ||
    report.match(/risk\s+level[:\s]+(CRITICAL|HIGH|MODERATE|LOW)/i);
  const recM = report.match(/recommendation\s*[:\s]+\*\*?([^\n*]+?)\*\*?/i) ||
    report.match(/recommendation[:\s]+([^\n]+)/i);

  if (!scoreM || !levelM || !recM) return issues; // partial report; nothing to check

  const score = parseInt(scoreM[1], 10);
  const level = levelM[1].toUpperCase();
  const rec = recM[1].toUpperCase();

  const expectedLevel = score <= 33 ? "CRITICAL" : score <= 66 ? "MODERATE" : "LOW";
  if (level !== expectedLevel) {
    issues.push(
      `Scorecard drift: score ${score} implies risk level ${expectedLevel}, but the report states ${level}. Reconcile the two.`
    );
  }
  const expectedRec = score <= 33 ? "DO NOT PROCEED" : score <= 66 ? "PROCEED WITH CONDITIONS" : "PROCEED";
  if (!rec.includes(expectedRec)) {
    issues.push(
      `Scorecard drift: score ${score} implies recommendation "${expectedRec}", but the report states "${rec.trim()}". Reconcile the two.`
    );
  }
  return issues;
}
