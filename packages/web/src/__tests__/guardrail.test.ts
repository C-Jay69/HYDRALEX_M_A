import { describe, test, expect } from "bun:test";
import { validateCriticOutput } from "../lib/openrouter";

describe("validateCriticOutput", () => {
  test("flags all four contradiction types", () => {
    const bad = {
      reconciliation: [
        { issue: "x", agent1_detected: true, issue_type: "true_missed_item", new_information: "", evidence: "", requires_verification: false, confidence: "HIGH" },
        { issue: "y", agent1_detected: false, agent1_match: "A1-002", issue_type: "assessment_refinement", new_information: "", evidence: "", requires_verification: false, confidence: "HIGH" },
        { issue: "z", agent1_detected: false, issue_type: "severity_disagreement", new_information: "", evidence: "", requires_verification: false, confidence: "HIGH" },
        { issue: "w", agent1_detected: false, agent1_match: "A1-004", issue_type: "true_missed_item", new_information: "", evidence: "", requires_verification: false, confidence: "HIGH" },
      ],
    };
    expect(validateCriticOutput(bad).length).toBe(5);
  });

  test("accepts a coherent reconciliation", () => {
    const good = {
      reconciliation: [
        { issue: "MAE", agent1_detected: true, agent1_match: "A1-003", matched_finding_ids: ["A1-003"], issue_type: "severity_disagreement", new_information: "", evidence: "", requires_verification: true, confidence: "HIGH" },
      ],
    };
    expect(validateCriticOutput(good).length).toBe(0);
  });

  test("tolerates missing reconciliation key", () => {
    expect(validateCriticOutput({}).length).toBe(0);
  });
});
