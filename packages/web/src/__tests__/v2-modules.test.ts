/**
 * v2-modules.test.ts
 * Validates the reviewer-driven v2 improvements against a 2-page M&A stress-test
 * contract (the scenario both external reviews analyzed):
 *   - Ghost / undefined obligor ("Seller shall indemnify…" with no defined Seller)
 *   - Regulatory hallucination (no SEC/ITAR/HIPAA on a private all-cash deal)
 *   - Stage-9 vs synthesis contradiction (not_assessable + elevation unification)
 *   - Execution-readiness gate caps score on missing operative documents
 *   - KG tokenizer noise ("December", "THE MERGER Target")
 *   - Escrow/survival mismatch
 *   - Sensational-terminology sanitization + scorecard consistency
 */
import {
  runPartyIntegrity,
  runReadinessGate,
  runRegulatoryAnalysis,
  detectEscrowSurvivalMismatch,
  runKnowledgeGraph,
  runLitigationRisk,
  deriveLitigationElevations,
  renderReadinessGate,
  renderPartyIntegrity,
} from "../lib/analysis-modules.js";
import { sanitizeTerminology, checkScorecardConsistency } from "../lib/qa-guardrails.js";

const STRESS = `AGREEMENT AND PLAN OF MERGER

This Agreement and Plan of Merger (this "Agreement") is entered into as of December 15, 2025 by and among Acquiror Inc. ('Buyer'), TargetCo Inc. ('Target'), and the Seller.

THE MERGER Target shall become the Surviving Corporation. The Seller shall indemnify the Buyer for breaches of the Fundamental Representations.

The Purchase Price is $50,000,000 plus an earnout of up to $3,000,000 measured by Buyer's sole discretion. A portion of the Purchase Price equal to $5,000,000 shall be deposited into an escrow for 12 months. The indemnification obligations survive for 18 months (General) and 6 years (Fundamental and Tax), with fraud being without limitation.

The Seller's principals shall be bound by a non-compete for 3 years. This Agreement shall be governed by the laws of the State of Delaware. The Plan of Merger is attached as Exhibit A.

IN WITNESS WHEREOF, the Buyer Co and Target Co have caused this Agreement to be executed.

By: Buyer Co
By: Target Co`;

describe("v2 structural gates — reviewer stress contract", () => {
  test("party integrity flags ghost obligor (Seller never defined) as critical", () => {
    const p = runPartyIntegrity(STRESS);
    const ghost = p.findings.find((f) => f.category === "ghost_obligor");
    expect(ghost).toBeDefined();
    expect(ghost!.severity).toBe("critical");
  });

  test("readiness gate returns FAIL when a ghost obligor is present", () => {
    const p = runPartyIntegrity(STRESS);
    const kg = runKnowledgeGraph(STRESS);
    const readiness = runReadinessGate({
      partyFindings: p.findings,
      undefinedControllingTerms: kg.undefinedControllingTerms,
      text: STRESS,
    });
    expect(readiness.status).toBe("FAIL");
    expect(readiness.capsScore).toBe(true);
    expect(renderReadinessGate(readiness)).toContain("FAIL");
  });

  test("regulatory engine does NOT hallucinate SEC/ITAR/HIPAA on a private all-cash deal", () => {
    const reg = runRegulatoryAnalysis(STRESS);
    const names = reg.frameworks.map((f) => f.name);
    expect(names).not.toContain("Federal Securities Law");
    expect(names).not.toContain("Export Controls (EAR / ITAR)");
    expect(names).not.toContain("HIPAA (Health Data)");
    // Delaware should appear, reframed as a statutory filing (not a discretionary approval).
    const del = reg.frameworks.find((f) => f.name === "Delaware Corporate Law");
    expect(del).toBeDefined();
    expect(del!.status).toBe("statutory_filing");
    expect(del!.approvalRequired).toBe(false);
  });

  test("escrow/survival mismatch detected (escrow 12mo < survival 18mo, fraud unlimited)", () => {
    const m = detectEscrowSurvivalMismatch(STRESS);
    expect(m.present).toBe(true);
    expect(m.escrowMonths).toBe(12);
    expect(m.survivalMonths).toBe(18);
    expect(m.fraudUnlimited).toBe(true);
  });

  test("KG does not surface tokenizer noise ('December', 'THE MERGER Target')", () => {
    const kg = runKnowledgeGraph(STRESS);
    expect(kg.undefinedTerms).not.toContain("December");
    expect(kg.undefinedTerms.some((t) => t.includes("THE MERGER Target") || t.includes("MERGER Target"))).toBe(false);
    // A controlling term actually referenced but not defined should surface.
    expect(kg.undefinedControllingTerms).toContain("Fundamental Representations");
  });

  test("litigation Stage 9 unifies with synthesis via elevations (no LOW contradiction)", () => {
    const p = runPartyIntegrity(STRESS);
    const kg = runKnowledgeGraph(STRESS);
    const escrow = detectEscrowSurvivalMismatch(STRESS);
    const elev = deriveLitigationElevations({
      ghostObligor: p.findings.some((f) => f.category === "ghost_obligor"),
      escrowSurvivalMismatch: escrow,
      statutoryMergerNoEnvRep: p.isMerger,
      undefinedControllingTerms: kg.undefinedControllingTerms,
      earnoutBuyerSoleDiscretion: true,
    });
    const lit = runLitigationRisk(STRESS, { hasEscrow: true, hasIndemnificationCap: true, elevations: elev });
    const fraud = lit.areas.find((a) => a.area === "Fraud Allegations");
    const env = lit.areas.find((a) => a.area === "Environmental Claims");
    const earn = lit.areas.find((a) => a.area === "Earnout Disputes");
    expect(fraud!.level).toBe("high");
    expect(env!.level).toBe("moderate");
    // Buyer-controlled earnout → elevated to HIGH with HIGH confidence (the
    // substantive analysis and Stage 9 must agree, not contradict).
    expect(earn!.level).toBe("high");
    expect(earn!.confidence).toBe("high");
  });
});

describe("terminology + scorecard sanitization", () => {
  test("sanitizeTerminology replaces sensational coinage", () => {
    const md = "The Buyer Suicide Pill and the Roach Motel were identified.";
    const out = sanitizeTerminology(md);
    expect(out).toContain("Liability–Recourse Mismatch");
    expect(out).toContain("Asymmetrical Termination Trap");
    expect(out).not.toContain("Suicide Pill");
    expect(out).not.toContain("Roach Motel");
  });

  test("checkScorecardConsistency flags score/level/recommendation drift", () => {
    const ok = checkScorecardConsistency("Risk Score: **20**\nRisk Level: **CRITICAL**\nRecommendation: **DO NOT PROCEED**");
    expect(ok).toHaveLength(0);
    const drift = checkScorecardConsistency("Risk Score: **20**\nRisk Level: **LOW**\nRecommendation: **PROCEED**");
    expect(drift.length).toBeGreaterThan(0);
  });
});
