import { test, expect } from "bun:test";
import { runAnalysisPipeline } from "../routes/analyses"; // we need to expose runPipeline or create a wrapper
import { OpenAI } from "openai";

// Mock OpenAI client that returns deterministic stubs
class MockOpenAI {
  chat = {
    completions: {
      create: async () => ({
        choices: [{ message: { content: "STUB RESPONSE" } }],
      }),
    },
  };
}

// Override getOpenRouterClient in the module scope is tricky; instead we can test the deterministic modules directly.
// For simplicity, test that the deterministic modules run and produce output.
import {
  runKnowledgeGraph,
  runCrossDocConsistency,
  runRedFlagEngine,
  runRegulatoryAnalysis,
  runLitigationRisk,
} from "../lib/analysis-modules";

const SAMPLE_CONTRACT = `
MERGER AGREEMENT

This Agreement is made as of January 1, 2024 between Acquirer Corp ("Buyer") and Target Inc ("Seller").

"Material Adverse Effect" means any effect that is materially adverse to the business.

The purchase price shall be $50,000,000 subject to a working capital adjustment. An escrow of $5,000,000 shall be established. Seller represents that there are no pending litigations.

The transaction is subject to HSR pre-merger notification and CFIUS review if applicable.

Buyer shall indemnify Seller for Seller's pre-closing environmental liabilities.

Buyer and Seller shall comply with GDPR and CCPA with respect to personal data. The closing date shall be March 1, 2024.

Pursuant to Schedule 4.1, the disclosure schedules are attached. As set forth on Schedule 9.2, the intellectual property is owned.

See Schedule 12.5 for the cap.
`;

test("deterministic modules produce output on sample contract", async () => {
  const kg = runKnowledgeGraph(SAMPLE_CONTRACT);
  expect(kg.summary.totalNodes).toBeGreaterThan(0);

  const cross = runCrossDocConsistency([{ filename: "sample.txt", text: SAMPLE_CONTRACT }]);
  expect(cross.documentsAnalyzed).toBe(1);

  const rf = runRedFlagEngine(SAMPLE_CONTRACT);
  expect(rf.flags.length).toBeGreaterThan(0);

  const reg = runRegulatoryAnalysis(SAMPLE_CONTRACT);
  expect(reg.frameworks.length).toBeGreaterThan(0);

  const lit = runLitigationRisk(SAMPLE_CONTRACT, {
    hasEscrow: true,
    hasIndemnificationCap: true,
  });
  expect(lit.areas.length).toBeGreaterThan(0);
});