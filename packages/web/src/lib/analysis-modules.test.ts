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
  deriveLitigationElevations,
  runPartyIntegrity,
  analyzeAppraisalRights,
  renderAppraisalRights,
  runDgclExecutionMechanics,
  renderDgclExecutionMechanics,
  runFiduciaryDuty,
  renderFiduciaryDuty,
  runHsrAntitrust,
  renderHsrAntitrust,
  type DocInput,
} from "./analysis-modules.js";

// STRESS_03 — skeleton/DNP merger engineered to expose false-positive traps.
const STRESS_03 = `
AGREEMENT AND PLAN OF MERGER
This Agreement is made between BuyerCo Inc. ("Buyer") and TargetCo Inc. ("Target").
1. THE MERGER
Target shall merge with and into Buyer pursuant to Section 251 of the Delaware General Corporation Law, with Buyer continuing as the surviving corporation. At the Effective Time, all liabilities of Target shall vest in the surviving corporation by operation of law.
2. PURCHASE PRICE
The total purchase price shall be $50,000,000, payable in cash at Closing.
3. DUE DILIGENCE
Buyer accepts the business "as is, where is," and confirms that no further information is required from Target. Buyer waives any recourse for matters discoverable through diligence.
4. INDEMNIFICATION
There shall be no indemnification under this Agreement. Buyer accepts all liabilities of Target, known and unknown.
5. TERMINATION
Seller may terminate this Agreement at any time prior to Closing for convenience.
7. GOVERNING LAW
This Agreement is governed by the laws of the State of Delaware.
The following standard provisions are not addressed in this Agreement: representations and warranties; defined terms / definitions section; working capital adjustment; Material Adverse Effect; escrow or holdback; survival of claims; schedules and exhibits.
IN WITNESS WHEREOF, the parties have executed this Agreement.
Buyer Co: _________________     Target Co: _________________
`;

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

// ── STRESS_03 regression: the six source-code fixes ─────────────────────────

test("Red Flag: affirmative indemnification waiver not misread as missing mechanics", () => {
  const rf = runRedFlagEngine(STRESS_03);
  const cats = rf.flags.map((f) => f.category);
  expect(cats).toContain("Affirmative Indemnification Waiver");
  expect(cats).not.toContain("Indemnification Limitation Missing");
});

test("Red Flag: R&W omission disclosure not misread as missing disclosure schedule", () => {
  const rf = runRedFlagEngine(STRESS_03);
  const cats = rf.flags.map((f) => f.category);
  expect(cats).toContain("Representations & Warranties Absent (Confirmed)");
  expect(cats).not.toContain("No Disclosure Schedule Mechanism");
});

test("Party Integrity: signature block present-but-unsigned is not 'missing'", () => {
  const party = runPartyIntegrity(STRESS_03);
  expect(party.signatureState).toBe("PRESENT_UNSIGNED");
  expect(party.findings.some((f) => f.category === "missing_signature_block")).toBe(false);
  expect(party.findings.some((f) => f.category === "signature_present_unsigned")).toBe(true);
});

test("Appraisal Rights: DGCL §251 merger yields HIGH risk for STRESS_03", () => {
  const ap = analyzeAppraisalRights(STRESS_03, "STATUTORY_MERGER", "DELAWARE");
  expect(ap.isMerger).toBe(true);
  expect(ap.riskLevel).toBe("HIGH");
  const rendered = renderAppraisalRights(ap);
  expect(rendered).toContain("APPRAISAL RIGHTS ANALYSIS");
});

test("DGCL Mechanics: STRESS_03 merger missing core execution mechanics", () => {
  const dg = runDgclExecutionMechanics(STRESS_03);
  expect(dg.isMerger).toBe(true);
  expect(dg.defectsFound.length).toBeGreaterThanOrEqual(3);
  const rendered = renderDgclExecutionMechanics(dg);
  expect(rendered).toContain("DGCL §251 EXECUTION MECHANICS");
});

test("Appraisal Rights: asset purchase is not applicable", () => {
  const ap = analyzeAppraisalRights("Seller sells all assets to Buyer for $50,000,000.", "ASSET_PURCHASE", "DELAWARE");
  expect(ap.isMerger).toBe(false);
  expect(ap.riskLevel).toBe("NOT_APPLICABLE");
});

// ── Review omissions 2 & 4: fiduciary duty + HSR/antitrust ───────────────────

test("Fiduciary Duty: STRESS_03 merger lacks board safeguards -> HIGH", () => {
  const fid = runFiduciaryDuty(STRESS_03, "STATUTORY_MERGER");
  expect(fid.isApplicable).toBe(true);
  expect(fid.riskLevel).toBe("HIGH");
  expect(fid.flags.some((f) => /board recommendation absent/i.test(f))).toBe(true);
  const rendered = renderFiduciaryDuty(fid);
  expect(rendered).toContain("FIDUCIARY DUTY ANALYSIS");
});

test("Fiduciary Duty: non-change-of-control is not applicable", () => {
  const fid = runFiduciaryDuty("A services agreement between Buyer and Seller.", "SERVICES");
  expect(fid.isApplicable).toBe(false);
  expect(fid.riskLevel).toBe("NOT_APPLICABLE");
});

test("HSR/Antitrust: STRESS_03 below threshold -> NOT_REQUIRED / LOW", () => {
  const hsr = runHsrAntitrust(STRESS_03, "STATUTORY_MERGER");
  expect(hsr.isCoveredTransaction).toBe(true);
  expect(hsr.hsrFilingRequired).toBe("NOT_REQUIRED");
  expect(hsr.antitrustRiskLevel).toBe("LOW");
  const rendered = renderHsrAntitrust(hsr);
  expect(rendered).toContain("HSR / ANTITRUST ANALYSIS");
});

test("HSR/Antitrust: large merger triggers LIKELY filing", () => {
  const hsr = runHsrAntitrust("Buyer acquires Target for $200,000,000 in a statutory merger.", "STATUTORY_MERGER");
  expect(hsr.isCoveredTransaction).toBe(true);
  expect(hsr.hsrFilingRequired).toBe("LIKELY");
});

// ── STRESS FIXTURE 01 (CLEAN) — used for assessment-driven regression tests ──
const CLEAN = `
AGREEMENT AND PLAN OF MERGER
This Agreement and Plan of Merger (the "Agreement") is made between Acquiror Inc. ("Buyer") and TargetCo Inc. ("Target").
1. THE MERGER
Target shall merge with and into Buyer pursuant to Section 251 of the Delaware General Corporation Law, with Buyer continuing as the surviving corporation (the "Merger"). The Plan of Merger is attached as Exhibit A. At the Effective Time, all assets, rights, and liabilities of Target shall vest in the surviving corporation by operation of law.
2. PURCHASE PRICE
Total consideration shall be $50,000,000: (a) $42,000,000 in cash at Closing; (b) $5,000,000 deposited into escrow; and (c) up to $3,000,000 as Earnout Consideration. The Earnout shall be payable if the surviving entity achieves Adjusted EBITDA of no less than $8,000,000. "Adjusted EBITDA" means net income before interest, taxes, depreciation, and amortization, computed in accordance with GAAP applied consistently with Target's audited historical financial statements. Buyer covenants to operate the business in good faith and shall not take any action the primary purpose of which is to frustrate the Earnout. Buyer shall deliver an Earnout Statement within sixty (60) days following the Earnout Period; disputes shall be referred to an independent nationally recognized accounting firm.
3. ESCROW & WORKING CAPITAL
$5,000,000 shall be held in escrow for eighteen (18) months. The Purchase Price shall be adjusted dollar-for-dollar for the difference between Closing Net Working Capital and a target of $4,000,000, determined under a defined true-up procedure.
4. REPRESENTATIONS AND WARRANTIES
Target represents and warrants as to organization, authority, capitalization, financial statements, taxes, litigation, compliance, and intellectual property. "Knowledge" means the actual knowledge of the named executive officers.
5. INDEMNIFICATION
Seller shall indemnify Buyer for breaches of representations, warranties, and covenants, for pre-Closing taxes, and for specified matters. General representations survive eighteen (18) months; fundamental and tax representations survive six (6) years. The aggregate cap for general representation claims is 10% of the Purchase Price; fundamental and tax claims are capped at 100%. A deductible basket of 0.75% applies to general claims. The escrow is the first source of recovery.
6. MATERIAL ADVERSE EFFECT
"Material Adverse Effect" is defined with customary carve-outs, subject to a disproportionate-effect carve-back. A bring-down of representations and the absence of a Material Adverse Effect are conditions to Closing.
7. TERMINATION
This Agreement may be terminated by mutual written consent; by either party upon an uncured material breach; or by either party if the Closing has not occurred by the Outside Date, except this right is unavailable to a party whose breach was the primary cause. Customary termination fees apply to each party symmetrically.
8. GOVERNING LAW
This Agreement is governed by the laws of the State of Delaware.
IN WITNESS WHEREOF, the parties have executed this Agreement.
Buyer Co: _________________
Target Co: _________________
`;

test("Litigation cross-feed: earnout + undefined working capital elevate Stage 9 (fix 2.3)", () => {
  const elevations = deriveLitigationElevations({
    earnoutBuyerControlsCalc: true,
    undefinedControllingTerms: ["Net Working Capital"],
    ghostObligor: false,
  });
  const lit = runLitigationRisk(CLEAN, { elevations });
  const earnout = lit.areas.find((a) => a.area === "Earnout Disputes");
  expect(earnout?.level).toBe("high");
  expect(earnout?.confidence).toBe("high");
  const ppa = lit.areas.find((a) => a.area === "Purchase Price Adjustment Disputes");
  expect(["moderate", "high"]).toContain(ppa?.level);
  expect(ppa?.confidence).toBe("high");
});

test("Knowledge Graph: party aliases merge + relationships extracted (fix 2.8)", () => {
  const kg = runKnowledgeGraph(CLEAN);
  const partyNames = kg.nodes.filter((n) => n.entityType === "party").map((n) => n.name);
  expect(partyNames).toContain("Buyer");
  expect(partyNames).toContain("Target");
  expect(partyNames).not.toContain("Acquiror Inc");
  expect(partyNames).not.toContain("TargetCo Inc");
  expect(partyNames).not.toContain("Buyer Co");
  expect(kg.edges.some((e) => e.relationship === "merges_with_into" || e.relationship === "executes")).toBe(true);
});

test("Red Flag depth: termination fee, specified matters, WC timeline, EBITDA GAAP (fixes 2.4-2.10)", () => {
  const rf = runRedFlagEngine(CLEAN);
  const cats = rf.flags.map((f) => f.category);
  expect(cats).toContain("Termination Fee Undefined (Likely Unenforceable)");
  expect(cats).toContain("Undefined 'Specified Matters' Placeholder");
  expect(cats).toContain("Working Capital True-Up Timeline Missing");
  expect(cats).toContain("Adjusted EBITDA Defined as GAAP (Contradictory)");
});

test("Fiduciary Duty: clean merger missing safeguards is HIGH, never CRITICAL (fix 2.2)", () => {
  const fid = runFiduciaryDuty(CLEAN, "STATUTORY_MERGER");
  expect(fid.isApplicable).toBe(true);
  expect(fid.riskLevel).toBe("HIGH");
  expect(fid.riskLevel).not.toBe("CRITICAL");
});
