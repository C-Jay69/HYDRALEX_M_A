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

  return { issues };
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
