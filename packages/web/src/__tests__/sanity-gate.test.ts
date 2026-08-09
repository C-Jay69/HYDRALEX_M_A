import { describe, test, expect } from "bun:test";
import {
  validateFinalReport,
  mayPublishAsMaterialFinding,
  type ContractEvidence,
  type RiskFinding,
} from "../lib/openrouter";

const NOW = new Date("2026-08-09T00:00:00Z");

describe("validateFinalReport", () => {
  test("flags an expired proposed closing date", () => {
    const report = "The Closing Date shall occur on December 31, 2025.";
    const errors = validateFinalReport(report, "", NOW, []);
    expect(errors.some((e) => e.includes("expired proposed transaction date"))).toBe(true);
  });

  test("does not flag a future proposed closing date", () => {
    const report = "The Closing Date shall occur on December 31, 2027.";
    expect(validateFinalReport(report, "", NOW, [])).toHaveLength(0);
  });

  test("flags a numeric claim not present in the contract", () => {
    const report = "This creates 30-50% value erosion risk.";
    const errors = validateFinalReport(report, "short contract", NOW, []);
    expect(errors.some((e) => e.includes("Numeric assertion"))).toBe(true);
  });

  test("allows a numeric claim that appears in the contract", () => {
    const contract = "The indemnification cap is 10% of the purchase price.";
    const report = "Indemnification is capped at 10%.";
    const errors = validateFinalReport(report, contract, NOW, []);
    expect(errors.some((e) => e.includes("Numeric assertion") && e.includes("10%"))).toBe(false);
  });

  test("allows $240M shorthand when contract states $240,000,000", () => {
    const contract = "The Purchase Price is $240,000,000, paid in cash.";
    const report = "Total consideration of $240M at closing.";
    const errors = validateFinalReport(report, contract, NOW, []);
    expect(errors.some((e) => e.includes("Numeric assertion") && e.includes("$240M"))).toBe(false);
  });

  test("still flags $240M when contract uses a different figure", () => {
    const contract = "The Purchase Price is $30,000,000.";
    const report = "Total consideration of $240M at closing.";
    const errors = validateFinalReport(report, contract, NOW, []);
    expect(errors.some((e) => e.includes("Numeric assertion") && e.includes("$240M"))).toBe(true);
  });

  test("flags dangerous categorical legal language", () => {
    const report = "The buyer has no legal remedy under this agreement.";
    const errors = validateFinalReport(report, "", NOW, []);
    expect(errors.some((e) => e.includes("High-risk categorical legal assertion"))).toBe(true);
  });

  test("flags invented Seller obligor when Seller is not defined", () => {
    const report = "Seller shall indemnify Buyer.";
    const errors = validateFinalReport(report, "no seller definition", NOW, []);
    expect(errors.some((e) => e.includes("Seller is not a validated defined party"))).toBe(true);
  });

  test("allows Seller obligation when Seller is a defined party", () => {
    const report = "Seller shall indemnify Buyer.";
    const contract = '"Seller" means the existing shareholders.';
    const errors = validateFinalReport(report, contract, NOW, ["Seller"]);
    expect(errors.some((e) => e.includes("Seller is not a validated defined party"))).toBe(false);
  });
});

describe("mayPublishAsMaterialFinding", () => {
  const ledger: ContractEvidence[] = [
    { id: "E1", sourceType: "CONTRACT", section: "6.1", exactQuote: "No indemnification will be available.", proposition: "indemnity excluded", confidence: 1, status: "EXPRESS", entities: ["Buyer"] },
    { id: "E2", sourceType: "CONTRACT", proposition: "escrow absent", confidence: 0.8, status: "OMITTED", entities: [] },
    { id: "E3", sourceType: "EXTERNAL_AUTHORITY", proposition: "HSR threshold", confidence: 0.7, status: "EXPRESS", entities: [] },
  ];

  const finding = (over: Partial<RiskFinding>): RiskFinding => ({
    id: "R1",
    title: "t",
    evidenceIds: ["E1"],
    classification: "EXPRESS",
    severity: "HIGH",
    confidence: "HIGH",
    legalEffect: "",
    unknowns: [],
    recommendation: "",
    humanReviewRequired: false,
    ...over,
  });

  test("HIGH finding with no evidence is blocked", () => {
    expect(mayPublishAsMaterialFinding(finding({ evidenceIds: [] }), ledger)).toBe(false);
  });

  test("HIGH finding with EXPRESS contract evidence passes", () => {
    expect(mayPublishAsMaterialFinding(finding({}), ledger)).toBe(true);
  });

  test("HIGH finding with OMITTED contract evidence passes", () => {
    expect(mayPublishAsMaterialFinding(finding({ evidenceIds: ["E2"] }), ledger)).toBe(true);
  });

  test("HIGH finding with only non-contract evidence is blocked", () => {
    expect(mayPublishAsMaterialFinding(finding({ evidenceIds: ["E3"] }), ledger)).toBe(false);
  });

  test("EXTERNAL_FACT_REQUIRED without external authority is blocked", () => {
    expect(
      mayPublishAsMaterialFinding(finding({ classification: "EXTERNAL_FACT_REQUIRED", evidenceIds: ["E1"] }), ledger)
    ).toBe(false);
  });

  test("LOW severity findings always pass", () => {
    expect(mayPublishAsMaterialFinding(finding({ severity: "LOW", evidenceIds: [] }), ledger)).toBe(true);
  });
});
