import { test, expect } from "bun:test";
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
} from "./analysis-modules.js";

const SAMPLE = `
MERGER AGREEMENT

This Agreement is made as of January 15, 2024 between Buyer Corp ("Buyer") and Seller Inc ("Seller").

"Material Adverse Effect" means any effect that is materially adverse to the business.

The purchase price shall be $100,000,000 subject to a working capital adjustment. An escrow of $10,000,000 shall be established. Seller represents that there are no pending litigations.

The transaction is subject to HSR pre-merger notification and CFIUS review if applicable. Buyer shall indemnify Seller for Seller's pre-closing environmental liabilities.

Buyer and Seller shall comply with GDPR and CCPA with respect to personal data. The closing date shall be March 1, 2024.

Pursuant to Schedule 4.1, the disclosure schedules are attached. As set forth on Schedule 9.2, the intellectual property is owned.

Pursuant to Schedule 7.9, the tax representations are set forth in detail.

See Schedule 12.5 for the cap. [Identical to Clean Contract 2]
`;

const DOC_A = `
MERGER AGREEMENT between Buyer Corp and Seller Inc.
"Working Capital" means current assets minus current liabilities.
The purchase price is $100,000,000. Closing date is March 1, 2024.
Pursuant to Schedule 4.1 the disclosures apply.
`;

const DOC_B = `
STOCK PURCHASE AGREEMENT between Buyer Corp and Seller Inc.
"Working Capital" means cash plus receivables only.
The purchase price is $90,000,000. Closing date is April 1, 2024.
`;

test("Knowledge Graph extracts entities, edges, and flags", () => {
  const kg = runKnowledgeGraph(SAMPLE);
  expect(kg.summary.totalNodes).toBeGreaterThan(0);
  expect(kg.nodes.some((n) => n.entityType === "defined_term")).toBe(true);
  expect(kg.nodes.some((n) => n.name === "Buyer")).toBe(true);
  const rendered = renderKnowledgeGraph(kg);
  expect(rendered).toContain("### KNOWLEDGE GRAPH");
});

test("Cross-doc detects intra-doc ghost reference and duplicate cross-doc terms", () => {
  const docs: DocInput[] = [
    { filename: "agreement.txt", text: SAMPLE },
    { filename: "a.txt", text: DOC_A },
    { filename: "b.txt", text: DOC_B },
  ];
  const res = runCrossDocConsistency(docs);
  expect(res.documentsAnalyzed).toBe(3);
  // Ghost reference [Identical to Clean Contract 2] in SAMPLE
  expect(res.findings.some((f) => f.type === "ghost_reference")).toBe(true);
  // Broken ref: Schedule 12.5 referenced in SAMPLE but not enumerated
  expect(res.findings.some((f) => f.type === "cross_reference_broken")).toBe(true);
  // Defined-term mismatch: Working Capital defined differently in A vs B
  expect(res.findings.some((f) => f.type === "defined_term_mismatch")).toBe(true);
  // Date inconsistency: March 1 vs April 1
  expect(res.findings.some((f) => f.type === "date_inconsistency")).toBe(true);
  const rendered = renderCrossDoc(res);
  expect(rendered).toContain("### CROSS-DOCUMENT CONSISTENCY");
});

test("Red Flag Engine returns categorized flags", () => {
  const rf = runRedFlagEngine(SAMPLE);
  expect(rf.flags.length).toBeGreaterThan(0);
  expect(rf.flags.some((f) => f.category === "Sanctions" || f.category === "Corruption" || f.category === "Indemnity Direction Reversal")).toBe(true);
  const rendered = renderRedFlag(rf);
  expect(rendered).toContain("### RED FLAG ENGINE");
});

test("Regulatory Analysis identifies frameworks", () => {
  const reg = runRegulatoryAnalysis(SAMPLE);
  expect(reg.frameworks.length).toBeGreaterThan(0);
  expect(reg.frameworks.some((f) => f.name === "HSR Antitrust (Pre-Merger Notification)")).toBe(true);
  expect(reg.frameworks.some((f) => f.name === "GDPR (Data Privacy)")).toBe(true);
  const rendered = renderRegulatory(reg);
  expect(rendered).toContain("### REGULATORY ANALYSIS");
});

test("Litigation Risk assesses all areas", () => {
  const lit = runLitigationRisk(SAMPLE, { hasEscrow: true, hasIndemnificationCap: true });
  expect(lit.areas.length).toBeGreaterThanOrEqual(10);
  expect(lit.areas.some((a) => a.area === "Antitrust Challenges")).toBe(true);
  const rendered = renderLitigation(lit);
  expect(rendered).toContain("### LITIGATION RISK ASSESSMENT");
});
