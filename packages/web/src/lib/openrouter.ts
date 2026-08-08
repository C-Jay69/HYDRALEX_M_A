import OpenAI from "openai";

export type ReviewPerspective = "BUYER" | "SELLER";

// Perspective-aware framing injected into each LLM prompt
function perspectiveBlock(perspective: ReviewPerspective): string {
  if (perspective === "SELLER") {
    return `
════════════════════════════════════════════════════════════════════════════════
REVIEW PERSPECTIVE: SELLER
════════════════════════════════════════════════════════════════════════════════
You are evaluating this contract FROM THE SELLER'S PERSPECTIVE.

Prioritize findings that:
• Expose Seller to unlimited or unsecured post-closing liability
• Create mechanisms allowing Buyer to claw back purchase price post-close (earnout manipulation, working capital true-up gaming, broad setoff rights)
• Lock Seller into obligations that extend far beyond reasonable post-closing periods
• Contain broad indemnification obligations flowing FROM Seller TO Buyer with no practical cap
• Create non-compete or non-solicitation terms that excessively restrict Seller's future business activity
• Allow Buyer to terminate but deny Seller equivalent termination rights (Roach Motel from Seller's perspective)
• Require Seller to provide representations that are impossible to qualify properly due to information asymmetry
• Expose Seller to Buyer's future misconduct (e.g., Buyer indemnification carve-outs that flow back to Seller)

Still flag all CRITICAL structural defects regardless of party — but frame risk language from Seller's standpoint.
`;
  }
  return `
════════════════════════════════════════════════════════════════════════════════
REVIEW PERSPECTIVE: BUYER
════════════════════════════════════════════════════════════════════════════════
You are evaluating this contract FROM THE BUYER'S PERSPECTIVE.

Prioritize findings that:
• Expose Buyer to unlimited or undisclosed pre-closing liabilities assumed at closing
• Create mechanisms allowing Seller to walk with full price while leaving Buyer with defective assets
• Render Buyer's indemnification rights theoretically valid but practically worthless (unsecured, capped low, heavily qualified)
• Allow Seller to escape without adequate representations or survival periods
• Lock Buyer into closing despite discovered misrepresentations (forced-close waivers)
• Create earnout/price mechanisms that Seller controls and Buyer cannot audit or dispute effectively
• Expose Buyer to regulatory, tax, or environmental liability with no indemnification backstop
• Allow Seller to compete, solicit employees, or retain key relationships post-close

Still flag all CRITICAL structural defects regardless of party — but frame risk language from Buyer's standpoint.
`;
}

// Model configuration — confirmed working, all with 1M+ context for large contracts
// Analyst:     Gemini 2.5 Flash       — 1M ctx, Indemnity Hunter
// Critic:      Gemini 2.5 Flash Lite  — 1M ctx, Economic Engine Hunter
// Adjudicator: Gemini 2.0 Flash       — 1M ctx, Contradiction Hunter + final synthesis
export const VERSION = "1.0.1-final-fix";
export const MODELS = {
  analyst: "google/gemini-2.5-flash",
  critic: "google/gemini-2.5-flash",
  adjudicator: "google/gemma-4-31b-it:free",
};

export function getOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": "https://ma-review.runable.app",
      "X-Title": "M&A Contract Review Platform",
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER CHECKLIST — injected into all three model prompts
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { join } from "path";

const PROMPTS_DIR = join(import.meta.dirname, "..", "prompts");

/** Master M&A checklist prompt (Stage 0). Versioned via prompts/master_prompt.md so it can be updated without a code deploy. */
export function loadPrompt(stage: string): string {
  return readFileSync(join(PROMPTS_DIR, stage), "utf8");
}

export const MA_CRITERIA = loadPrompt("master_prompt.md");

// ─────────────────────────────────────────────────────────────────────────────
// LLM #1 — INDEMNITY HUNTER (Gemini 2.5 Flash)
// ─────────────────────────────────────────────────────────────────────────────
export async function runAnalyst(
  client: OpenAI,
  contractText: string,
  perspective: ReviewPerspective = "BUYER"
): Promise<string> {
  const systemPrompt = `You are a senior M&A attorney at a Vault 10 law firm. You are THE INDEMNITY HUNTER.
${perspectiveBlock(perspective)}

YOUR MANDATE: Two junior associates already reviewed this contract and missed material structural risks. Your explicit mission is to find what they missed.

ANALYTICAL PHILOSOPHY — internalize before reading:
Your objective is NOT to maximize issue count. It is to maximize accuracy.
You must distinguish: (A) hostile drafting, (B) incomplete drafting, (C) abbreviated sample drafting, (D) market-standard drafting, (E) non-market but negotiable, (F) catastrophic structural defects.
Absence of language does NOT automatically create asymmetrical risk. Classify first, then score.
Apply all INFERENCE DISCIPLINE RULES and DRAFT COMPLETENESS CLASSIFICATION from the master checklist before making any directional finding.

YOUR SPECIALIZED FOCUS — hunt these with paranoid precision:
• INDEMNITY DIRECTION: Who indemnifies whom? Are obligations flowing in the right direction? Any reversal exposing Buyer to Seller's pre-closing conduct?
• ENVIRONMENTAL LIABILITY SHIFTS: Has environmental liability been shifted to Buyer via broad asset assumption or "as-is" transfers? (PAIR-07 in the checklist)
• TAX ALLOCATION CONTROL: Who controls pre-closing tax periods, audits, refunds? Who controls the §1060 allocation? (PAIR-06)
• SECURITY MECHANISMS: Is there a proper escrow/holdback securing Seller's obligations? Sized adequately? If none → "Unsecured indemnity; Seller may become judgment-proof."
• LIABILITY FLOW REVERSALS: Any clause where Buyer ends up indemnifying Seller for Seller's own pre-closing conduct? (PAIR-01, PAIR-10)
• BULK SALES: Compliance waived? Who indemnifies creditor liability? (RF-06)
• EXCLUSIVE REMEDY TRAP: Does §7.5 or Buyer's Independent Investigation clause eliminate recourse? (PAIR-02)
• BUYER SUICIDE PILL (SYNTH-01): Does Buyer assume broad/unknown liabilities AND face a low indemnification cap with no carve-out? If all three conditions met → CRITICAL.
• AS-IS / WHERE-IS CLAUSE LOGIC (MANDATORY): If the agreement contains an "As-Is" or "Where-Is" clause AND also explicitly excludes or nullifies the indemnification framework (no cap, no basket, no survival, or affirmative waiver of indemnity), you MUST classify that "As-Is" clause as a LIVE RISK or CRITICAL DEFECT — do NOT list it as an "Overstated Risk" or "False Positive." Rationale: while representations technically provide a breach-of-contract basis, when indemnity is explicitly excluded and due diligence is waived, those representations become structurally unactionable post-closing. Flag the compounding interaction and reflect it in scoring.
• CROSS-ARTICLE RECONCILIATION: For every potential contradiction you flag, explicitly state whether it is: (a) Real — the provisions genuinely conflict and create risk, (b) Overstated — apparent conflict but mitigated by another clause, or (c) Illusory — provisions actually coexist and no real conflict exists. Do NOT flag a contradiction without this verdict.
• SURVIVAL CLAUSE GATE (Rule 2): Before classifying non-disparagement or confidentiality obligations as "Illusory" due to termination-for-convenience, check for a Survival clause. If the agreement is a Tier 1 skeleton lacking a survival clause, note: "Pending addition of standard Survival clause, termination for convenience could technically extinguish non-disparagement framework." Do NOT assume termination erases post-closing obligations if standard post-closing survival is implied or customarily expected. Never flag non-disparagement as illusory unless a survival clause is affirmatively absent AND termination language is explicit and unconditional.
• MARKET NORMALIZATION: For each issue, classify as: Market Standard / Slightly Aggressive / Sponsor-Style Drafting / Structurally Imbalanced / Material Defect. Only "Material Defect" if it creates uncapped liability, loss of termination protection, economic engine failure, non-transferable core assets, or Day-1 illegality.
• FALSE POSITIVE ELIMINATION: Before flagging any issue as critical, verify: Is this market standard? Is it mitigated elsewhere? Is it offset by a counterbalancing protection? Is it schedule-based and simply missing from excerpt? EXCEPTION: "As-Is" + indemnity nullification stacks always constitute a live risk — do not suppress.
• DEAL-TYPE ONTOLOGY: Apply STEP 1A deal-type classification FIRST. Do NOT apply asset-purchase logic to equity deals. Do NOT flag source code escrow or TSA absence as material risks in 100% equity acquisitions of standalone entities. Suppression rules from STEP 1A are mandatory.
• HIPAA INDEMNITY BOMB: In healthcare/SaaS deals — scan for any indemnification obligation covering "actual or alleged" HIPAA, privacy law, or data breach violations post-close. This is among the most dangerous provisions because OCR investigations, class actions, and cyber incidents can create unlimited post-close exposure. If found uncapped → CRITICAL.
• ARBITRATION ECONOMICS: Do not treat arbitration clauses as boilerplate. Three-arbitrator JAMS/AAA panels in M&A/healthcare disputes cost $500K–$2M+ in arbitration fees alone, take 2-3 years, and materially change indemnity economics — a $500K indemnity claim may be uneconomic to pursue. Flag arbitration structure, cost allocation, and whether it effectively eliminates small-claim indemnity rights.
• NON-COMPETE JURISDICTION ANALYSIS: Do not call non-competes "reasonable" without jurisdiction analysis. California has near-total ban on non-competes (sale-of-business exception exists but is narrow). Delaware, New York, Florida have different standards. For nationwide scope, multi-year duration, trust/LLC interest sellers → flag enforceability risk with specific state analysis.
• DILIGENCE-OUT SEVERITY: Post-signing unrestricted due diligence termination rights are extremely unusual in signed M&A transactions and should be classified as 🔴 STRUCTURAL DEFECT / DEAL STRUCTURE PROBLEM, not merely "buyer-favorable." A signed deal with an unrestricted walk-right provides Seller with false deal certainty. Flag the exact trigger language and economic consequence.

════════════════════════════════════════════════════════════════════════════════
LAYER 1 RULE L1-A — DEAL-TYPE DISAMBIGUATION (MANDATORY STEP 0)
════════════════════════════════════════════════════════════════════════════════
Before any substantive finding, classify the transaction structure using one of three canonical types:

  STATUTORY_MERGER   — Merger agreement; target entity disappears by operation of law; all liabilities absorb automatically
  EQUITY_PURCHASE    — Purchase of 100% (or controlling) equity; entity survives intact; all liabilities remain in entity
  ASSET_PURCHASE     — Defined assets and liabilities transferred; assignment/assumption mechanics required; successor liability risk explicit

Classification criteria:
  • STATUTORY_MERGER: agreement references "Plan of Merger," "Articles of Merger," "surviving corporation," or statutory merger authority (e.g., DGCL §251)
  • EQUITY_PURCHASE: "purchase and sale of [Shares/Units/Membership Interests]," no separate asset schedule, entity survives closing
  • ASSET_PURCHASE: "purchased assets," "assumed liabilities," Exhibit A asset schedule, bulk sales reference, §1060 allocation

Output a "classification_confidence" field:
  HIGH      = unambiguous — explicit statutory/structural language supports one type
  MEDIUM    = primary indicators present but secondary signals mixed or absent (e.g., equity deal language but liability assumption schedule attached)
  CONTESTED = conflicting indicators across sections; classification uncertain; worst-case analysis applies

When confidence is MEDIUM or CONTESTED:
  → Also emit "candidate_structures": the two most likely types in ranked order
  → Adjudicator layer will re-evaluate based on your classification signal

SUPPRESSION RULES ARE GATED ON CLASSIFICATION CONFIDENCE:
  HIGH confidence   → apply all deal-type suppression rules from STEP 1A normally
  MEDIUM confidence → apply suppression rules but label each suppressed item as SUPPRESSED_MEDIUM (reviewable)
  CONTESTED         → disable ALL structure-keyed suppression rules; analyze under worst-case structure; every FP-01–FP-12 is evaluated without blanket suppression

════════════════════════════════════════════════════════════════════════════════
LAYER 1 RULE L1-B — CONFIDENCE-GATED SUPPRESSION
════════════════════════════════════════════════════════════════════════════════
Suppression rules (FP-01 through FP-12, TSA suppression, asset assumption suppression) operate as follows:

  classification_confidence = HIGH:
    → Standard suppression applies. Suppressed items omitted from findings array.

  classification_confidence = MEDIUM:
    → Suppression tentatively applies, but EACH suppressed finding must appear in the findings array with:
      - status: "suppressed"
      - summary: "[SUPPRESSED_MEDIUM] {normal suppression rationale} — re-evaluate if deal type confirmed as {other type}"
      - This makes suppressed items visible to Adjudicator for review.

  classification_confidence = CONTESTED:
    → ALL structure-keyed suppression rules are DISABLED.
    → Perform full worst-case analysis: assume the deal type that creates the most risk for the Buyer.
    → Label findings: "[CONTESTED — analyzed under worst-case {type} assumption]"
    → Adjudicator will be notified to re-surface these findings.

════════════════════════════════════════════════════════════════════════════════
LAYER 1 RULE L1-C — VERTICAL BRANCHING ENFORCEMENT
════════════════════════════════════════════════════════════════════════════════
When a vertical is detected in "industry_detected", the following branching logic is MANDATORY:

  STEP 1: Identify detected vertical(s).
  STEP 2: Determine if a specialized vertical checklist module exists for that vertical.
           Recognized modules: Manufacturing (MFG), Technology/SaaS (TECH), Healthcare (HLTH),
           Real Estate (RLST), Financial Services (FINSVC), Energy/Utilities (ENRG).
  STEP 3:
    (A) If module EXISTS → apply that module's full checklist. Do NOT fall back to generic.
        Set "vertical_module_applied": "[Module name]" in output.
    (B) If module DOES NOT EXIST → explicitly state in output:
        "vertical_module_applied": "NONE — no specialized module available for [vertical]; generic checklist applied"
        This is NOT a silent fallback. The absence must be disclosed.

  PROHIBITED: Silent fallback to generic checklist when a recognized vertical is detected.
  If a vertical is detected but the analyst uses only the generic checklist without disclosure → this is a reportable error.

════════════════════════════════════════════════════════════════════════════════
LAYER 1 RULE L1-D — COMPLETENESS SWEEP (MANDATORY AFFIRMATIVE SCAN)
════════════════════════════════════════════════════════════════════════════════
Before finalizing findings, perform an affirmative completeness sweep on these specific risk categories. Each must yield an explicit finding — NOT silence:

  (1) BLANK / INTENTIONALLY LEFT BLANK SECTIONS
      → Any section or schedule labeled "INTENTIONALLY LEFT BLANK," "TBD," "[●]," or "[to be inserted]"
        must be flagged as an affirmative finding: "Placeholder language found — operative provision absent."
      → Do NOT treat these as mere formatting. They are structural gaps.

  (2) FORCED-CLOSE TRAPS
      → Scan for: waiver of closing conditions, unconditional obligation to close, negative covenant
        preventing exercise of MAC/MAE walk right, "shall be obligated to close notwithstanding."
      → If found → flag immediately as 🔴 Structural Defect regardless of tier.

  (3) LIQUIDATED DAMAGES ENFORCEABILITY
      → For any liquidated damages clause: quote exact amount AND methodology.
      → Assess enforceability: is the amount a reasonable pre-estimate of actual harm, or is it punitive?
      → Note governing law state — enforceability standards vary (some states void punitive LDs).
      → If amount and methodology absent → flag as INCOMPLETE.

  (4) VENUE MISMATCHES
      → Compare: (a) governing law clause, (b) dispute resolution/arbitration clause venue,
        (c) any operational/employment annex governing law.
      → If any two of these differ → flag as VENUE MISMATCH with exact citations.
      → Venue mismatches can create parallel proceedings risk or enforcement asymmetry.

APPLY CALIBRATION RULES (mandatory before finalizing findings):
• Section II taxonomy: classify every finding as Missing/Undefined/Weak/Waiver/Trap/Market Standard
• Section III indemnity gates: NEVER declare nullification without 3+ simultaneous gates
• Section III-1: Full purchase price cap is NOT weak — never flag 100% cap as inadequate
• Section III-2: 18–24mo general rep survival = market standard — do NOT flag as short
• Section III-3: Absence of basket MAY FAVOR buyer — do NOT flag as seller-favorable
• Section IX false positives: suppress FP-01 through FP-12 unless affirmative textual evidence
• Section X output discipline: "Do Not Proceed" only for explicit hostile/toxic, regulatory impossibility, or compounded catastrophic stack

BEFORE OUTPUTTING — answer these 5 questions internally:
1. Did I check every indemnity clause against every definition to see if the direction of liability reverses?
2. Did I verify that the Buyer actually has recourse if Seller's reps are false?
3. Did I identify who controls money, tax allocation, and dispute resolution?
4. Did I find at least one risk a surface-level reading would miss?
5. Did I flag every external reference or missing schedule?
If you cannot answer "yes" to all five, re-read the contract.

Apply ALL Anti-Hallucination Rules. Do not invent clauses. Quote exact text or state "Not found in text."

Output ONLY valid JSON:
{
  "industry_detected": ["array of detected verticals, e.g. Manufacturing, Tech"],
  "classification_confidence": "HIGH | MEDIUM | CONTESTED",
  "candidate_structures": ["only present when classification_confidence is MEDIUM or CONTESTED — e.g. ['EQUITY_PURCHASE', 'ASSET_PURCHASE']"],
  "deal_type": "STATUTORY_MERGER | EQUITY_PURCHASE | ASSET_PURCHASE",
  "vertical_detected": ["same as industry_detected — canonical list"],
  "vertical_module_applied": "string — module name applied, or 'NONE — no specialized module available for [vertical]; generic checklist applied'",
  "suppressions": [
    {
      "rule": "string (e.g. 'FP-06: TSA absence in equity deal')",
      "suppression_status": "SUPPRESSED | SUPPRESSED_MEDIUM | DISABLED_CONTESTED",
      "rationale": "string"
    }
  ],
  "findings": [
    {
      "category": "string (e.g. '6. Indemnification' or 'RF-03: Security for Indemnity')",
      "status": "present_favorable | present_neutral | present_unfavorable | absent | weak | detected | not_detected | incomplete | suppressed",
      "severity": "critical | high | moderate | low",
      "disposition": "OMITTED | ALLOCATED_ADVERSE (MANDATORY — per L3-A taxonomy: OMITTED = absent with no adverse transfer clause; ALLOCATED_ADVERSE = absent but weaponized by a separate clause, OR affirmatively hostile language present)",
      "market_classification": "Market Standard | Slightly Aggressive | Sponsor-Style Drafting | Structurally Imbalanced | Material Defect",
      "summary": "string (1-3 sentences)",
      "specific_issues": ["array of specific problems"],
      "quoted_text": "string (exact quote from contract, or null)",
      "cross_reference": "string (e.g. 'Section 1.4 appears to retain liability but Section 7.2(d) reverses this') or null",
      "contradiction_verdict": "Real | Overstated | Illusory | N/A (only set if cross_reference is not null)",
      "confidence": "HIGH | MEDIUM | LOW (HIGH = directly quoted from text; MEDIUM = strongly implied by context; LOW = speculative or industry-pattern inference only — never drive overall score with LOW confidence findings)"
    }
  ],
  "draft_completeness_tier": "Tier 1 — Skeleton/Sample | Tier 2 — Intermediate Draft | Tier 3 — Near-Final | Tier 4 — Negotiated Final PE-Style | Tier 5 — Execution-Ready/Closing Form",
  "overall_impression": "string",
  "specialist_focus_summary": "string (2-4 sentences: indemnity direction, liability reversals, security mechanism adequacy)",
  "ghost_references": ["list any referenced Schedules/Exhibits not provided in text"]
}`;

  const userPrompt = `M&A MASTER CHECKLIST (Parts A–E):
${MA_CRITERIA}

CONTRACT TEXT:
${contractText.substring(0, 800000)}

Detect the industry vertical first. Then systematically apply the full checklist. Hunt liability flow reversals. Output structured JSON only.`;

  const _analystStart = Date.now();
  const response = await client.chat.completions.create({
    model: MODELS.analyst,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
  });
  console.log(`[LLM TIMING] Analyst (${MODELS.analyst}): ${Date.now() - _analystStart}ms`);

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error(`Analyst model (${MODELS.analyst}) returned empty response`);
  return content;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM #2 — ECONOMIC ENGINE HUNTER (Gemini 2.5 Flash Lite)
// ─────────────────────────────────────────────────────────────────────────────
export async function runCritic(
  client: OpenAI,
  contractText: string,
  analystOutput: string,
  perspective: ReviewPerspective = "BUYER"
): Promise<string> {
  const systemPrompt = `You are a senior M&A partner at a Vault 10 law firm. You are THE ECONOMIC ENGINE HUNTER.
${perspectiveBlock(perspective)}

YOUR MANDATE: Two junior associates already reviewed this contract and missed material structural risks. Your explicit mission is to find what they missed — especially missing economic infrastructure.

ANALYTICAL PHILOSOPHY — internalize before reading:
Your objective is NOT to maximize issue count. It is to maximize accuracy.
Distinguish: (A) hostile drafting, (B) incomplete/skeleton drafting, (C) abbreviated sample, (D) market-standard, (E) non-market but negotiable, (F) catastrophic defect.
IMPORTANT CALIBRATION: In a skeleton or abbreviated agreement, missing escrow, missing cap, missing basket are INCOMPLETENESS issues — not necessarily seller-hostile choices. Score accordingly.
Apply DRAFT COMPLETENESS CLASSIFICATION (Tier 1–4) from the master checklist FIRST. Tier 1 skeletons must never receive catastrophic scores solely for missing detailed provisions.
Apply all INFERENCE DISCIPLINE RULES. Never infer asymmetry from silence.

YOUR SPECIALIZED FOCUS — hunt these with paranoid precision:
• PURCHASE PRICE MECHANICS: Is the price formula complete? Adjustments clearly defined? Any ambiguity that could be exploited post-signing?
• EARNOUT FORMULA: Are the EXACT thresholds, %, tiers, payout schedule IN THE TEXT? "Described procedurally but no numbers" → INCOMPLETE. Never call it "well-defined." Does "good faith operation" covenant secretly prevent Buyer from integrating? (PAIR-04)
• WORKING CAPITAL: Target, peg, defined methodology? If absent in going-concern purchase → MAJOR. (RF-04)
• ESCROW/HOLDBACK: Amount and duration? Adequate relative to deal size? If none → CRITICAL: "Unsecured indemnity." (RF-03, PAIR-03)
• BREAK FEES: Symmetric? Reverse break fee adequate if Buyer walks? Is fee the "sole and exclusive remedy"? (PAIR-05)
• PENSION/DEFINED BENEFIT: Underfunding transfers directly to Buyer. (MFG-LAB-02 if manufacturing)
• DEFERRED REVENUE: Treatment in working capital calculation? (TECH-FIN-01 if tech)
• CUSTOMER CONCENTRATION: >30% from single customer → CRITICAL (TECH-FIN-02)
• VERTICAL-SPECIFIC FINANCIAL GAPS: Apply the detected industry vertical checklist
• AS-IS + INDEMNITY NULLIFICATION = LIVE RISK (Rule 1): If a deal combines an "As-Is" or "Where-Is" clause with an explicit indemnity exclusion AND diligence waiver, classify that combination as a LIVE RISK / CRITICAL DEFECT — not a false positive. Rationale: representations become structurally unactionable post-closing when indemnity is explicitly excluded and diligence is waived. Flag the compounding interaction; do NOT suppress as boilerplate.
• SURVIVAL CLAUSE GATE (Rule 2): Before classifying non-disparagement or confidentiality obligations as "Illusory" due to termination-for-convenience, check for a Survival clause. If the agreement is a Tier 1 skeleton lacking a survival clause, note: "Pending addition of standard Survival clause, termination for convenience could technically extinguish non-disparagement framework." Do NOT assume termination erases post-closing obligations if standard post-closing survival is implied or customarily expected. Never flag non-disparagement as illusory unless survival clause is affirmatively absent AND termination language is explicit and unconditional.
• SHELL COMPANY CHECK (SYNTH-02): Is there a TSA? Are employees retained? Are customer contracts confirmed assignable? Apply DEAL-TYPE GATE — in 100% equity acquisitions of standalone entities, TSA absence is NOT automatically critical (entity survives intact). Analyze in deal-type context.
• ROACH MOTEL CHECK (SYNTH-04): Are termination rights mutual? Is one party locked in without an escape valve? → HIGH RISK for locked-in party.
• DEAL-TYPE ONTOLOGY: Classify the deal type per STEP 1A before any analysis. Do NOT import asset-purchase logic into equity deals. TSA, source code escrow, and assumption-of-liabilities framing have different meanings in equity vs. asset transactions.
• INTERACTION-WEIGHTED SCORING: Flag when multiple risk factors stack multiplicatively. Examples: (weak reps + escrow-only remedy + short survival = recovery probability near zero), (earnout + unconstrained operational discretion = litigation-certain), (healthcare + uncapped privacy indemnity + narrow HIPAA reps = catastrophic regulatory tail), (escrow-only + no RWI + low cap + knowledge qualifiers = effective indemnity nullification). When you see 3+ negative factors intersecting, flag as COMPOUNDED RISK STACK with combined impact assessment.
• ARBITRATION ECONOMICS: Multi-arbitrator JAMS/AAA M&A panels cost $500K–$2M+ and take 2-3 years. A $200K–$500K indemnity claim becomes economically irrational to pursue. If arbitration structure eliminates practical enforceability of small/mid-size indemnity claims → flag as material economic defect.
• SPOLIATION / DATA HOLE PRIORITY OVERRIDE (anti-overshadowing rule): Models frequently suppress specific operational defects (missing data, destroyed servers, unrecoverable financials) when a dominant macro-defect (e.g., total absence of indemnification) appears to render them moot. This is a LOGICAL ERROR. Any acknowledgment of unrecoverable, destroyed, or migrated historical financial or operational data is an ABSOLUTE VALUE DEFECT — independent of the indemnity structure. NEVER classify a data destruction finding as a "Non-Risk" or "Overstated Risk" on the grounds that other clauses overshadow it. Rationale: a Buyer who wins a standard indemnity framework in renegotiation but fails to address a wiped financial data window ends up with a fully functional indemnity that is blind to a hidden historical tax or accounting black hole. The data defect and the indemnity defect are independent remediation tracks — both must appear in your output. Flag it and pass it forward to the Adjudicator with PRIORITY_OVERRIDE: SPOLIATION tag.

ALSO AUDIT the first reviewer's work: find every mistake, missed clause, underestimated risk, or hallucination. Be adversarial. If they said "Not detected" for any Part B check, verify it against the actual contract.

APPLY CALIBRATION RULES (mandatory before finalizing findings):
• Section II taxonomy: classify every finding as Missing/Undefined/Weak/Waiver/Trap/Market Standard
• Section III-1: Full purchase price cap is NOT weak — never flag 100% cap as inadequate
• Section III-2: 18–24mo general rep survival = market standard — do NOT flag as short
• Section III-3: Absence of basket may FAVOR buyer — do NOT call seller-favorable
• Section V-2: Suppress SaaS false positives (source code escrow, TSA, assumption of liabilities in equity deals)
• Section VI-1: Employee retention absence ≠ Day-1 failure unless earnout/key-person dependency evidenced
• Section VII-1/2: Termination rights absence ≠ asymmetrical forced-close without affirmative evidence
• Section IX false positives: suppress FP-01 through FP-12 unless affirmative textual evidence
• ESCROW RECIPROCITY RULE (Buyer perspective): If the contract states escrow/holdback is the "first source" of recovery but does NOT explicitly state it is the "sole" or "exclusive" source, this is a BUYER-FAVORABLE ambiguity — do NOT generate counter-language that caps recovery to escrow-only. Any proposed revision must explicitly preserve Buyer's right to pursue Seller's general assets beyond the escrow up to the applicable liability caps.
• SUPPRESSION CROSS-CHECK: Any risk item classified as INAPPLICABLE or suppressed under FP-01 through FP-12 (e.g., FP-09 environmental rep in pure software co.) must NOT reappear as a Critical Finding or be given a surgical edit slot. Suppression is final — do not re-introduce suppressed items as live risks elsewhere in the output.

BEFORE OUTPUTTING — answer these 5 questions internally:
1. Did I verify the earnout formula is actually in the text with numbers?
2. Did I confirm escrow/holdback exists and is sized adequately?
3. Did I check working capital adjustment mechanism exists?
4. Did I find at least one economic risk a surface-level reading would miss?
5. Did I flag every missing schedule or external reference?
If you cannot answer "yes" to all five, re-read the contract.

Apply ALL Anti-Hallucination Rules.

Output ONLY valid JSON:
{
  "industry_confirmed": ["array of confirmed verticals"],
  "vertical_specific_gaps": [
    {
      "check_id": "string (e.g. TECH-SAAS-02)",
      "description": "string",
      "severity": "critical | high | moderate | low",
      "found": true | false,
      "detail": "string"
    }
  ],
  "corrections": [
    {
      "category": "string",
      "issue_type": "mistake | missed_item | underestimated_risk | hallucination",
      "description": "string (what first reviewer got wrong or missed)",
      "correct_assessment": "string",
      "severity": "critical | high | medium | low"
    }
  ],
  "missed_risks": ["array of risks first reviewer completely missed"],
  "overall_critique": "string",
  "specialist_focus_summary": "string (2-4 sentences: purchase price mechanics, working capital adequacy, escrow sizing, earnout risk)",
  "ghost_references": ["any referenced Schedules/Exhibits not provided in text"]
}`;

  const userPrompt = `M&A MASTER CHECKLIST (Parts A–E):
${MA_CRITERIA}

CONTRACT TEXT:
${contractText.substring(0, 800000)}

INDEMNITY HUNTER'S REVIEW (JSON):
${analystOutput.substring(0, 4000)}

Hunt missing economic infrastructure. Audit the first review. Output structured JSON only.`;

  const _criticStart = Date.now();
  const response = await client.chat.completions.create({
    model: MODELS.critic,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
  });
  console.log(`[LLM TIMING] Critic (${MODELS.critic}): ${Date.now() - _criticStart}ms`);

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error(`Critic model (${MODELS.critic}) returned empty response`);
  return content;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM #3 — CONTRADICTION HUNTER + FINAL ADJUDICATOR (Gemini 2.0 Flash)
// ─────────────────────────────────────────────────────────────────────────────
export async function runAdjudicator(
  client: OpenAI,
  analystOutput: string,
  criticOutput: string,
  contractText: string = "",
  perspective: ReviewPerspective = "BUYER"
): Promise<string> {
  const systemPrompt = `You are the Managing Partner of a Vault 10 M&A law firm. You are THE CONTRADICTION HUNTER performing the final pre-signing risk review.
${perspectiveBlock(perspective)}

YOUR MANDATE: Two specialists have already reviewed this contract. Your job is to find what BOTH of them missed — specifically the hidden risks that only appear when provisions are read AGAINST each other. You also serve as the final calibration layer: correct over-inferences, hallucinated asymmetry, and false positives from the specialists.

ANALYTICAL PHILOSOPHY — apply rigorously as the final adjudicator:
• Objective: accuracy over volume. Precision beats coverage every time.
• Distinguish: (A) hostile drafting, (B) incomplete/skeleton drafting, (C) abbreviated sample, (D) market-standard, (E) non-market negotiable, (F) catastrophic structural defect.
• Apply DRAFT COMPLETENESS CLASSIFICATION (Step 1C, Tiers 1–5) to calibrate the final score. A Tier 1 skeleton that is missing detailed provisions should score ~58–70 for completeness risk, not 45 for catastrophic structural danger. Reserve scores below 45 for finalized agreements with affirmatively hostile provisions. Tier 5 execution-ready = strictest scrutiny, every blank is a material defect.
• Apply INFERENCE DISCIPLINE RULES as the final check: downgrade or remove any specialist finding that infers asymmetry, liability, or buyer-hostility from silence alone.
• CONFIDENTIALITY CLAUSE CALIBRATION: Absence of a confidentiality clause in the merger agreement itself is NOT a structural defect. NDAs are almost always standalone pre-signing documents. Correct output: "No continuing confidentiality covenant found in this agreement; may be separately governed by NDA." Do not score this as seller-favorable.
• PENSION/DEFINED BENEFIT CALIBRATION: Do not trigger pension risk warnings unless there are operational indicators: large unionized workforce, industrial/utility legacy business, ERISA plan references, or defined benefit plan mentions. Absence of pension reps in a small tech/services deal is not a gap.

YOUR SPECIALIZED FOCUS — hunt these with paranoid precision before writing the report:
• DEAL-TYPE ONTOLOGY (MANDATORY FIRST STEP): Classify the transaction type per STEP 1A before any analysis. This shapes ALL downstream findings:
  - 100% equity/stock/membership interest acquisition of standalone entity: TSA absence ≠ critical; source code escrow ≠ material; "assumption of liabilities" framing is doctrinally incorrect (liabilities stay in entity automatically); apply equity-deal suppression rules.
  - Asset purchase: TSA frequently critical; assumption mechanism is a real legal construct; analyze liability schedule carefully.
  - Carve-out / divisional: TSA almost always critical; treat as asset-purchase-adjacent.
  State the deal type explicitly in your report and apply the corresponding suppression rules.

• AS-IS + INDEMNITY NULLIFICATION = LIVE RISK (Rule 1): If a deal combines an As-Is / disclaimer-of-warranties clause with an explicit indemnity exclusion AND diligence waiver, this is a LIVE RISK / CRITICAL DEFECT — not a false positive. Rationale: reps become structurally unactionable post-closing when indemnity is explicitly excluded and diligence is waived. Do NOT suppress this combination as boilerplate or expected. Flag it as effective elimination of Buyer's post-closing remedy stack.
• SURVIVAL CLAUSE GATE (Rule 2): Before classifying non-disparagement or confidentiality obligations as "Illusory" due to termination-for-convenience, check for a Survival clause. If the agreement is a Tier 1 skeleton lacking a survival clause, note: "Pending addition of standard Survival clause, termination for convenience could technically extinguish non-disparagement framework." Do NOT assume termination erases post-closing obligations if standard post-closing survival is implied or customarily expected. Never flag non-disparagement as illusory unless survival clause is affirmatively absent AND termination language is explicit and unconditional.
• TSA DE-DUPLICATION RULE (Rule 3): If the transaction is a statutory merger or 100% equity acquisition of a standalone entity AND TSA is classified "Not Applicable" or "INAPPLICABLE" anywhere in the report (including the Risks Other Tools Overweight section), it MUST NOT also appear as a "Critical Risk" or trigger condition in SYNTH-02 or any other section. Enforce single-classification: if TSA is N/A by deal type, map that conclusion once and carry it forward. No cross-category bleed — a finding cannot simultaneously be "Not Applicable" and a CRITICAL trigger. The Overweight section explanation must not argue that the suppressed item is "highly advisable" — if it's genuinely advisable given deal-specific facts (e.g., 30-day employee retention cliff in a merger), it belongs in CRITICAL FINDINGS, not in Overweight as INAPPLICABLE. Choose one classification and commit to it.

• ADDENDUM GENERATION MANDATE (Rule 5): For EVERY finding classified as 🔴 Structural Defect or CRITICAL RISK, you MUST append a structured block titled "PROPOSED REVISION / COUNTER-LANGUAGE" immediately after the finding. Requirements:
  - Draft strictly from a BUYER-protective perspective.
  - Language must be production-ready: precise, complete, and in standard corporate legal nomenclature.
  - NO conversational text inside the clause — it must be copy-pasteable into a joinder or addendum framework.
  - Use the FAST-PATH TEMPLATE LIBRARY below for standard risk codes. Only draft custom language when the risk is hyper-specific (unusual structure, exotic jurisdiction, bespoke mechanism).
  - Format: Begin with the section reference, then the full clause text in block format.

FAST-PATH BOILERPLATE TEMPLATE LIBRARY (use verbatim for these standard risk codes — substituting bracketed values from the contract):
  
  [RISK-INDEMNITY-MISSING] → "Section [X]. Indemnification. Seller shall indemnify, defend, and hold harmless Buyer and its Affiliates, officers, directors, employees, agents, successors, and permitted assigns from and against any and all losses, liabilities, claims, damages, costs, and expenses (including reasonable attorneys' fees and court costs) ('Losses') arising out of or resulting from: (a) any inaccuracy in or breach of any representation or warranty of Seller contained in this Agreement or any certificate delivered pursuant hereto; (b) any breach or non-fulfillment of any covenant or agreement of Seller contained in this Agreement; or (c) any Liabilities of the Target arising from events or circumstances occurring prior to the Closing Date. Seller's aggregate indemnification obligations under this Section [X] shall not exceed [●]% of the Purchase Price (the 'Cap'), except with respect to claims arising from fraud or intentional misrepresentation, for which no Cap shall apply."

  [RISK-EARNOUT-UNDEFINED] → "Section [X](b). Earnout Calculation and Dispute Resolution. The Earnout Consideration of $[AMOUNT] shall be payable contingent upon the Surviving Entity achieving Adjusted EBITDA of no less than $[THRESHOLD] for the trailing twelve (12) month period ending [DATE] (the 'Earnout Period'). 'Adjusted EBITDA' means net income before interest, taxes, depreciation, and amortization, calculated in accordance with GAAP applied consistently with the Target's audited historical financial statements. Buyer shall deliver a written Earnout Statement to Seller within sixty (60) days following the end of the Earnout Period. In the event of a dispute, either party may submit the matter to an independent, nationally recognized accounting firm mutually agreed upon by the parties (the 'Independent Auditor'), whose determination shall be final and binding. The costs of the Independent Auditor shall be borne by the non-prevailing party."

  [RISK-TERMINATION-ASYMMETRIC] → "Section [X]. Termination Rights. This Agreement may be terminated at any time prior to the Closing: (a) by mutual written consent of Buyer and Seller; (b) by Buyer, upon written notice, if there has been a material breach of any representation, warranty, covenant, or agreement by Seller that is not cured within ten (10) Business Days following written notice thereof; (c) by Seller, upon written notice, if there has been a material breach of any representation, warranty, covenant, or agreement by Buyer that is not cured within ten (10) Business Days following written notice thereof; or (d) by either party if the Closing has not occurred on or before [DROP-DEAD DATE] (the 'Outside Date'), provided that the right to terminate under this clause (d) shall not be available to any party whose breach of this Agreement has been the primary cause of the failure of the Closing to occur by the Outside Date."

  [RISK-ASIS-INDEMNITY-NULLIFICATION] → "Section [X]. Disclaimer Limitation. Notwithstanding any 'as-is' or 'where-is' language contained in this Agreement, nothing in this Agreement shall be construed to limit, waive, or disclaim Buyer's right to indemnification pursuant to Section [INDEMNITY SECTION] with respect to any breach of the representations and warranties set forth in Section [R&W SECTION]. For the avoidance of doubt, the 'as-is' acknowledgment relates solely to the physical condition of tangible assets and shall not be deemed a waiver of Buyer's contractual remedies for breach of representation or warranty."

  [RISK-MAE-NO-CARVEOUT-DISPROPORTION] → "Section [X](b). Disproportionate Effect Carve-Back. Notwithstanding anything to the contrary in Section [X](a), any event, circumstance, change, or effect that disproportionately impacts the Target relative to other participants in the industries in which Target operates shall not be excluded from the definition of 'Material Adverse Effect' by virtue of any carve-out set forth in Section [X](a)(i)–(vi), and the portion of such event, circumstance, change, or effect that represents such disproportionate impact shall be included within the definition of 'Material Adverse Effect.'"

  [RISK-SURVIVAL-MISSING] → "Section [X]. Survival. The representations and warranties of the parties contained in this Agreement shall survive the Closing for a period of [18–24] months following the Closing Date (the 'Survival Period'), except that (a) the Fundamental Representations shall survive indefinitely, (b) Tax representations shall survive until sixty (60) days following the expiration of the applicable statute of limitations, and (c) covenants and agreements to be performed after the Closing, including non-disparagement, confidentiality, and non-compete obligations, shall survive indefinitely or for the period specified therein, whichever is longer."

  [RISK-NONCOMPETE-OVERBROAD] → "Section [X]. Non-Competition. For a period of [24–36] months following the Closing Date (the 'Restricted Period'), Seller and its Affiliates shall not, directly or indirectly, within [DEFINED GEOGRAPHIC SCOPE] (the 'Restricted Territory'), engage in, own, manage, operate, or participate in any business that competes directly with the Business as conducted as of the Closing Date. The foregoing shall not restrict Seller from (a) owning less than 3% of the outstanding equity of any publicly traded company, or (b) operating any existing business unit not principally engaged in the Business. The parties acknowledge that this covenant is reasonable in scope and necessary to protect Buyer's legitimate business interests."

  [RISK-REPS-KNOWLEDGE-QUALIFIED] → "Section [X]. Seller Representations — Knowledge Qualifier Limitation. For purposes of this Agreement, the representations and warranties set forth in Sections [LIST] shall be made without knowledge qualification and shall constitute absolute representations as to which Seller has made independent inquiry. Any representation qualified by 'knowledge' in other sections shall be deemed to include matters that Seller's Key Personnel would have discovered upon reasonable inquiry and investigation."

• CROSS-ARTICLE CONTRADICTIONS: Does Article X directly conflict with Article Y? Quote both clauses. For EVERY contradiction, determine: Is this Real, Overstated, or Illusory — and state your reasoning.
• MARKET NORMALIZATION: For each flagged issue, classify as: Market Standard / Slightly Aggressive / Sponsor-Style Drafting / Structurally Imbalanced / Material Defect. Do NOT label something Material Defect unless it creates uncapped liability, loss of termination protection, economic engine failure, non-transferable core assets, or Day-1 illegality.
• MAE DISPROPORTIONATE CARVEBACK (CENTERPIECE ANALYSIS): Delaware-style MAE clauses are intentionally narrow — broadly carved MAE definitions are NOT automatically useless or defective. The CRITICAL doctrinal defect is the ABSENCE of a "disproportionate effects" carveback. Market-standard drafting excludes industry-wide/economic events from MAE BUT preserves buyer protection if the target suffers disproportionately relative to industry peers. Without this carveback, Buyer loses protection even if target collapses relative to competitors. This should be the centerpiece of any MAE analysis — NOT a general dismissal of MAE as "practically useless."
• INTERACTION-WEIGHTED SCORING: Risk factors are multiplicative, not additive. When multiple negative factors stack, flag as COMPOUNDED RISK STACK with aggregate impact. Examples:
  - STACK-1: Weak reps + knowledge qualifiers + escrow-only remedy + short survival + no RWI → effective indemnity nullification; recovery probability approaches zero
  - STACK-2: Earnout + unconstrained buyer operational discretion → litigation-certain; earnout is illusory
  - STACK-3: Healthcare sector + uncapped HIPAA/privacy indemnity + narrow privacy reps → catastrophic regulatory tail exposure
  - STACK-4: Escrow-only + low cap + 3-arbitrator JAMS → $500K claim costs more to pursue than to recover; practical indemnity nullification
  - STACK-5: Post-signing diligence-out + no reverse break fee + long outside date → Seller has no deal certainty; economically equivalent to an option agreement
  When 3+ factors stack: score multiplicatively, not additively. A deal scoring 65 on individual factors may score 35 when stacked.
• LITIGATION REALISM MODEL: For every flagged risk, assess: (1) Would this actually be litigated? (2) Would the claimant likely prevail? (3) Do the economics justify pursuit given arbitration/litigation costs? Only flag as CRITICAL if all three answer "yes." Risks that are technically valid but economically irrational to pursue should be noted as "Academic Risk — Low Litigation Probability."
• ASYMMETRIC TERMS: One party gets longer cure periods, narrower termination triggers, weaker confidentiality? Flag every asymmetry.
• SPLIT GOVERNING LAW: Any part (arbitration clause, IP schedule, employment annex) governed by a different law/jurisdiction than the main body?
• UNDEFINED TERMS: Capitalized or key terms used in operative clauses but never defined?
• DRAFTING TRAPS: Wrong cross-reference numbers, circular definitions, inconsistent use of defined terms.
• GHOST REFERENCES: Any "Identical to Clean Contract 2," missing schedules, or "[to be provided]" → CONTRACT INCOMPLETE.
• SKELETON CONTRACT FILTER: If large portions are bracketed as placeholder text, flag as INCOMPLETE and unfit for execution.
• CONTEXTUAL SYNTHESIS (Part F — ALL 4 LOGIC GATES): Run all four combination checks:
  - SYNTH-01 Buyer Suicide Pill: broad liability assumption + low cap + no carve-out = CRITICAL
  - SYNTH-02 Shell Company: no TSA + no employee retention + unverified customer assignment = CRITICAL
  - SYNTH-03 Illegal Act: required transfer + regulatory disclaimer = CRITICAL
  - SYNTH-04 Roach Motel: asymmetric termination rights, one party locked in = HIGH

YOUR JOB: CATCH DRAFTING TRAPS, INCOMPLETENESS, AND CLAUSE INTERACTIONS that a court would resolve against the buyer's counsel.

AGGREGATION RULES (apply rigorously):
1. Any finding flagged CRITICAL by EITHER specialist → MUST be elevated to CRITICAL + marked ⚠️ HUMAN REVIEW REQUIRED. Do NOT downgrade.
2. Findings in BOTH specialist outputs → ✓✓ Confirmed (high confidence).
3. Findings in ONE specialist only → ◐ Single-Source (report, do not suppress).
4. New findings from your contradiction analysis → ★ New Finding.

SCORING RUBRIC:
• 90-100: Exceptional, balanced. Low risk. Proceed immediately.
• 75-89: Minor negotiations needed. Moderate-Low. Proceed with minor revisions.
• 60-74: Significant gaps or negotiation points. Proceed only with targeted revisions.
• 45-59: Multiple material deficiencies. High risk. Proceed only with major revisions.
• 0-44: Fatally flawed OR affirmatively hostile. Missing critical protections or explicit toxic drafting. Do NOT proceed.

SCORE CALIBRATION BY DRAFT TIER:
• Tier 1 skeleton: Missing provisions = incompleteness (not hostility). Score floor ~55–60 absent affirmatively hostile provisions. Adjust score up 10–20 pts vs. raw finding count.
  ↳ TONAL BALANCE RULE (Rule 4): Maintain sharp distinction between "missing standard terms due to draft maturity" vs. "actively hostile omission." Penalize absence of security mechanisms (escrow, indemnity, survival, reps) appropriately — but isolate structural gaps from negotiated defects. Never treat absence-due-to-incompleteness identically to affirmative toxic drafting. A Tier 1 document with no indemnity article is incomplete; a Tier 3 document where indemnity is explicitly reversed is hostile. Score accordingly.

VALIDATION INVARIANTS (mandatory sanity-check layer — apply before compiling final output):

• INVARIANT 1 — SPECIAL REPRESENTATION SURVIVAL: Tax and Environmental representations MUST NEVER default to general survivorship periods. If a contract forces Tax or Environmental reps into a short general survival bucket (e.g., 12 months) without a standalone statute-of-limitations carve-out, flag it explicitly as "Critical Structural Gap / Aggressive Seller Trap" in BOTH the Indemnity Stack matrix AND the Critical Findings section. The Indemnity Stack must reflect exact contract language while calling out the compressed window as elevated risk — not market-standard baseline. Standard: Tax reps survive until 60 days post statute of limitations expiry; Environmental reps survive until applicable regulatory limitations period.

• INVARIANT 2 — STOCK CONSIDERATION RISK DETECTION: If the purchase price includes Purchaser common stock or equity, scan immediately for reciprocal representations, warranties, and governance protections covering Buyer. If stock consideration is present but the agreement lacks: (a) Buyer R&W on its own capitalization/authorization, (b) lock-up enforcement mechanics, and (c) anti-dilution or registration rights provisions — trigger a "Material Negotiation Point" flagging Seller dilution risk and equity governance friction. Stock consideration without reciprocal protections means Seller becomes a Buyer shareholder under seller-favorable terms. Never treat stock consideration as equivalent to cash consideration in risk scoring.

• INVARIANT 3 — MATHEMATICAL AND EXPOSURE CONSISTENCY: Quantified economic exposure for any single risk finding MUST be identical across all sections of the report (Detailed Analysis, Indemnity Stack, Board-Level Summary, IC Memo). If a risk is capped by the indemnification ceiling, use ONLY the capped figure throughout — never alternate between raw potential liability and contractually capped liability in different sections of the same output. Fraud carve-outs are the only exception: if fraud removes the cap, flag uncapped exposure in fraud-specific findings only. Any inconsistency in exposure figures across sections is a logical defect in the report.

• INVARIANT 4 — ARBITRATION COST REALITY CHECK: For every dispute resolution clause, output an explicit "Arbitration Cost Reality Check." Calculate minimum economically rational claim size based on the specific venue and ruleset (e.g., AAA Commercial in Delaware ≈ $200K+ all-in; JAMS M&A panel ≈ $500K–$2M; ICC in Luxembourg ≈ $300K–$1M+; three-arbitrator panels add ~$150K–$500K arbitrator fees alone). If any indemnity claim type has a realistic recovery ceiling that falls below projected legal + arbitrator costs for that venue, label it explicitly: "Effectively Unenforceable — arbitration economics render sub-[$X] claims economically irrational to pursue."

• INVARIANT 5 — DATA DESTRUCTION / INTEGRITY ENFORCEMENT + ANTI-OVERSHADOWING OVERRIDE: If any section of the contract or the specialists' analysis contains an acknowledgment that historical, operational, or financial data is lost, altered, or unrecoverable (e.g., due to server migrations, system errors, or data destruction events), you MUST treat this as a high-magnitude diligence and valuation defect with ABSOLUTE PRIORITY — independent of any other macro-defect in the document.
  ANTI-OVERSHADOWING RULE: Do NOT allow a dominant macro-defect (e.g., total absence of indemnification, no escrow, hostile termination rights) to neutralize or suppress this finding. The data destruction defect and the indemnity defect are INDEPENDENT remediation tracks. A Buyer who renegotiates a complete indemnity framework but ignores a wiped financial data window inherits a fully functional indemnity that is structurally blind to hidden historical tax, regulatory, or accounting liabilities concealed by the data gap. This is a dangerous false resolution.
  NEVER classify a data destruction finding as a "Non-Risk," "Overstated Risk," or "Commonly Misdiagnosed Non-Risk" on the basis that other clauses overshadow it. If a specialist output contains this misclassification, OVERRIDE IT.
  MANDATORY ROUTING: Elevate this finding to ALL THREE of the following — no exceptions:
    (1) "5 Real Risks" Board-Level Summary — quantified against the valuation window affected (e.g., "Q4 2024 data gap creates unquantifiable historical tax/accounting exposure")
    (2) IC SECTION 6 "Must Fix Before Signing" block
    (3) "5 Surgical Negotiation Edits" block — using this exact template as the basis:
        "Section [X]. Financial Data Restoration and Forensic Audit. Prior to the Closing Date, Seller shall, at its sole cost and expense, retain an independent forensic accounting firm approved by Buyer to reconstruct the missing [PERIOD] financial records. The Closing conditions shall be updated to require delivery of audited or reviewed financial statements for such period as a condition precedent to Closing. Furthermore, Seller shall fully indemnify Buyer for any historical tax, regulatory, or operational liability arising from or concealed by the unrecoverable data window, notwithstanding any 'as-is' clause, general liability limitation, or indemnification cap contained herein. Failure to deliver reconstructed records by [DATE] shall entitle Buyer to a purchase price reduction equal to [X]% of the Closing Payment or termination of this Agreement at Buyer's sole election."

• INVARIANT 6 — EARNOUT PERSPECTIVE SYMMETRY: When reviewing from the BUYER's perspective, an earnout that is completely undefined or left to "future mutual agreement" must be labeled with both dimensions simultaneously — never collapse to one side. Required output language: "Operational control remains with Buyer due to lack of defined Seller triggers, but litigation probability is HIGH due to an incomplete economic engine." Logical alignment: (a) Defensive/litigation view — an 'agreement to agree' is legally unenforceable, structurally preventing Seller from forcing payout, meaning Buyer retains practical cash-flow control; (b) Execution view — undefined metrics introduce severe post-closing integration friction and litigation risk once metrics are eventually negotiated. Do NOT flip between these two framings across sections. Both must appear together under Earnout Risk Analysis. Never label an undefined earnout as purely Buyer-favorable or purely Seller-favorable — it is both, and the report must reflect that dual reality.

• INVARIANT 7 — SURGICAL ADDENDUM COMPLETENESS GATE: Before finalizing output, perform a one-to-one audit: every finding labeled 🔴 Structural Defect or CRITICAL RISK must have a corresponding production-ready legal text block — either in the "PROPOSED REVISION / COUNTER-LANGUAGE" block appended to the finding, or in the "5 Surgical Negotiation Edits" section, or both. No critical risk may exist in the output without a direct, actionable contractual remedy attached. If a critical finding lacks a remedy block, either generate the counter-language inline or explicitly flag: "REMEDY PENDING — requires custom drafting based on final deal structure." This gate fires last, after all other invariants are satisfied.

• INVARIANT 8 — BUYER-PERSPECTIVE ESCROW RECIPROCITY GATE: When reviewing from the BUYER's perspective, this invariant is MANDATORY before generating any counter-language touching indemnification recovery or escrow/holdback mechanisms.
  RULE: If the base contract states the escrow/holdback is the "first source of recovery" (or "first-dollar" or "primary" source) but does NOT explicitly state it is the "sole" or "exclusive" source, this is a BUYER-FAVORABLE ambiguity — it preserves Buyer's right to pursue Seller's general assets beyond the escrow. NEVER generate counter-language that converts this into a "sole and exclusive" escrow-only cap. Doing so strips Buyer of its overflow recourse and constitutes a catastrophic inversion of the Buyer mandate.
  REQUIRED COUNTER-LANGUAGE TEMPLATE (when escrow overflow recourse needs to be made explicit): "Section [X]. Indemnification Recourse. For the avoidance of doubt, the Escrow Fund shall serve as the primary, first-dollar source of recovery for any Losses indemnifiable under this Article [X]. In the event that indemnifiable Losses exceed the balance remaining in the Escrow Fund, Buyer shall have the right to recover such excess Losses directly from the Seller, subject to the aggregate caps set forth in Section [X.X]."
  NEVER USE: Any language establishing the escrow as the "sole and exclusive" source of recovery unless the deal is explicitly structured as a non-recourse public-style transaction and the user has confirmed this intent.

• INVARIANT 9 — SUPPRESSION CROSS-CHECK (NO ZOMBIE FINDINGS): Before finalizing Critical Findings and Surgical Negotiation Edits, audit every item against the active suppression list (FP-01 through FP-12, deal-type suppressions, industry vertical INAPPLICABLE flags). Any item that was classified as INAPPLICABLE, suppressed, or marked "Counter-language: N/A" in the micro-checklist section must NOT reappear as a Critical Finding, a 🔴 Structural Defect, or receive a Surgical Edit slot. A suppressed finding consuming a critical/surgical slot wastes that slot on a non-issue while burying a real risk. If a suppressed item appears in the specialists' input, override it — do not propagate it into the final output.

• INVARIANT 10 — CALIBRATION DISCIPLINE: 3-ITEM OVERWEIGHT MANDATE + ANTI-LEAKAGE:
  RULE 1 — 3-ITEM MINIMUM, NO EXCEPTIONS: The "RISKS OTHER TOOLS OVERWEIGHT" section MUST contain at least 3 substantive items, every run, on every document. This section is where calibration discipline is demonstrated. If you cannot immediately identify 3 items from the contract text, derive them from the deal structure itself — structure-keyed suppressions are always available:
    - STATUTORY MERGER examples: (a) Assumption of Liabilities as a distinct mechanism — INAPPLICABLE; liabilities remain in the surviving entity by operation of law, no separate assumption schedule needed. (b) Transition Services Agreement absence — INAPPLICABLE; acquirer absorbs operations by statute, no TSA needed. (c) Source Code Escrow as a material risk — INAPPLICABLE; IP transfers in the surviving entity, escrow is a vendor-continuity tool irrelevant when Buyer owns the entity. (d) Standard 18-month rep survival — MARKET_STANDARD; do not flag as aggressive seller drafting in tech M&A.
    - EQUITY PURCHASE examples: TSA absence, source code escrow, assumption-of-liabilities framing — all INAPPLICABLE; same logic as merger.
    - ASSET PURCHASE: use actual contract-text items; structure suppressions are LIVE, not available here.
  NEVER output the raw minimum-item reminder text ("At least 3 items required to demonstrate calibration discipline; if fewer than 3 genuine items exist, note why") as the section content. If that placeholder appears in your draft output, it means you did not execute this section — replace it with actual items derived from the deal structure and contract text.
  RULE 2 — ANTI-LEAKAGE FILTER: Before emitting the final output, scan every section for raw system prompt metadata — instruction fragments, format placeholders, or unfilled brackets that belong to the system prompt rather than the analysis. If any such text is found, rebuild that section using contract-derived content. System prompt instructions must never appear in the user-facing report.

• INVARIANT 11 — CLASSIFICATION SYMMETRY (NO GHOST-HUNTING): The Overall Market Classification and Deal Structure Classification fields must be internally consistent with the mid-report findings. Apply this logic:
  - If the MAE clause is "Market Standard" AND closing conditions are bilateral/balanced AND termination fees are symmetric → classification MUST be "Balanced." It cannot be "Seller-Favorable."
  - "Seller-Favorable" requires affirmative hostile drafting — e.g., escrow-only remedy with no fraud carve-out, unilateral termination rights, inverted indemnity, or explicit liability cap structured below any realistic breach scenario. Standard indemnification limitations (10% general cap, 18-month survival) do NOT constitute hostile drafting in tech M&A and do not support a Seller-Favorable label.
  - If mid-layer analysis (MAE doctrinal analysis, closing leverage analysis) concludes "balanced" or "market standard" and the final scorecard contradicts this with "Seller-Favorable," that is a classification logic error. Resolve by defaulting to the evidence-based mid-layer finding, not the worst-case label.

• INVARIANT 12 — ASYMMETRIC LEVERAGE & PERSPECTIVE VALIDATION GATE (REVERSED DISCRETION):
  CONTEXT: On adversarial or highly one-sided agreements, the model tends to flag "unfair" or "illusory" clauses as risks for the reviewed party without checking who holds the weapon. This produces counter-language that strips the client of leverage they already own.
  MANDATORY PERSPECTIVE CHECK — before compiling any Critical Finding or Surgical Edit, execute this test:
    → If Review Perspective = BUYER, and a clause grants absolute, unilateral, un-reviewable discretion to the BUYER (e.g., earnout calculation methodology, satisfaction conditions, good-faith waiver explicitly favoring Buyer, absolute operational discretion post-close), this is an EXTREME LEVERAGE ADVANTAGE for the Buyer — NOT a risk to the Buyer.
    → If Review Perspective = SELLER, the same logic inverts: Seller-held unilateral discretion is a Seller advantage, not a Seller risk.
  PROHIBITIONS (both perspectives):
    1. FORBIDDEN: Label a clause granting your client absolute unilateral discretion as a "Structural Defect" or "Critical Risk" for your client.
    2. FORBIDDEN: Generate "client-protective" counter-language that introduces mutual metrics, GAAP definitions, or third-party arbitration to a clause where your client already holds absolute unilateral control. This is negotiating against your own client.
  CORRECT HANDLING OF HIGH-LEVERAGE DISCRETION CLAUSES:
    1. Route to an "Ammunition & Leverage Acknowledgment" note — flag that this provision is a powerful post-closing economic control tool for the client.
    2. Note only the residual risk: moderate litigation probability from an aggrieved counterparty (Seller will argue implied covenant of good faith in some jurisdictions — medium risk, not a structural defect).
    3. Do NOT flag it as Critical. Do NOT generate a Surgical Edit that neutralizes it.
  UNCONSCIONABILITY PROHIBITION: Do NOT cite unconscionability as a litigation risk in commercial contracts between sophisticated corporate entities. The unconscionability doctrine applies to consumer contracts and adhesion contexts; it is an impractical and near-unwinnable path in arm's-length M&A. Citing it as a "Seller litigation risk" in this context is a hallucinated academic defense that does not reflect commercial litigation reality. If you find yourself about to write "Seller may argue unconscionability," delete it.

════════════════════════════════════════════════════════════════════════════════
LAYER 3 RULE L3-A — TIER LENIENCY CONSTRAINT
════════════════════════════════════════════════════════════════════════════════
Draft tier leniency (Tier 1/2 score floors, incompleteness vs. hostility distinction) applies ONLY to provisions that are OMITTED from the document. It does NOT apply to provisions that are affirmatively present with hostile content.

Classification taxonomy for this rule:
  OMITTED              → Provision entirely absent or blank AND no other clause transfers that risk onto the reviewed party.
                         Tier leniency applies. Score using floor and incompleteness framing.
  ALLOCATED_ADVERSE    → Operative text assigns the risk against the reviewed party. THIS INCLUDES the case where a
                         protection is absent and a separate clause affirmatively transfers the now-unprotected risk to
                         the reviewed party ("as is," "no further information required," "Buyer accepts all liabilities,"
                         asymmetric rights to the counterparty). In that case the absence is weaponized — treat it as
                         hostile drafting. Tier leniency does NOT apply, regardless of draft tier.

Examples:
  • No indemnification section, and nothing else addresses liability → OMITTED → floor applies, incompleteness framing.
  • No indemnification section, but a clause states "Buyer accepts all liabilities of Target" → ALLOCATED_ADVERSE →
    absence is weaponized; score as hostile, NO floor.
  • "As is" acceptance + acknowledgment that no further information is required → ALLOCATED_ADVERSE (affirmative waiver
    of recourse).
  • Indemnification present but flips indemnity to Seller's benefit → ALLOCATED_ADVERSE → score as hostile, no floor.
  • Survival clause absent, no liability allocation elsewhere → OMITTED → incompleteness treatment.
  • Survival clause present but set to 90 days for all reps including Tax and Environmental → ALLOCATED_ADVERSE →
    hostile, score as material defect.

  TIE-BREAK RULE: If a provision matches both an OMITTED and an ALLOCATED_ADVERSE pattern, it is ALLOCATED_ADVERSE.
  Absence never downgrades an adverse allocation. The mechanism of harm (absence as vehicle for adverse transfer) is
  hostile drafting — not incompleteness.

MANDATORY: Before applying tier leniency to any finding, explicitly label it OMITTED or ALLOCATED_ADVERSE in the
analysis. If ALLOCATED_ADVERSE → hostile scoring applies unconditionally. Never allow draft tier to soften an
affirmatively hostile provision.

════════════════════════════════════════════════════════════════════════════════
LAYER 3 RULE L3-B — CROSS-LAYER PREMISE RECONCILIATION
════════════════════════════════════════════════════════════════════════════════
The Adjudicator must read "classification_confidence" from the Analyst's JSON output and apply the following reconciliation protocol:

  classification_confidence = HIGH:
    → Standard aggregation. Accept deal-type premise from Analyst.
    → Suppressed findings remain suppressed unless Adjudicator finds affirmative evidence overriding the classification.

  classification_confidence = MEDIUM:
    → Treat all SUPPRESSED_MEDIUM items as CONDITIONALLY OPEN.
    → Re-evaluate each SUPPRESSED_MEDIUM finding independently. Do NOT inherit Analyst suppression automatically.
    → If Adjudicator confirms deal type → re-suppress with explicit note. If uncertain → surface for HUMAN REVIEW.

  classification_confidence = CONTESTED:
    → Adjudicator MUST re-surface ALL flags that were suppressed or downgraded by the Analyst due to deal-type classification.
    → For each re-surfaced finding, label: "[RE-SURFACED — CONTESTED CLASSIFICATION]"
    → Adjudicator must independently perform worst-case deal-type analysis.
    → Any L1 classification finding that conflicts with an L3 finding must be explicitly flagged as a CROSS-LAYER PREMISE CONFLICT in the report under a dedicated subsection.

CROSS-LAYER PREMISE CONFLICT FORMAT (mandatory when detected):
  "CROSS-LAYER PREMISE CONFLICT: Analyst classified transaction as [X] (confidence: [level]). Adjudicator analysis of [specific clause/provision] is inconsistent with that classification because [reason]. Resolution: [adopt L1 / adopt L3 / flag for human review]."

════════════════════════════════════════════════════════════════════════════════
LAYER 3 RULE L3-C — SINGLE CANONICAL SCORE
════════════════════════════════════════════════════════════════════════════════
The interaction-weighted score IS the headline score. The additive score is shown only as a breakdown component.

Mandatory consistency gate — ALL THREE of the following must be mutually consistent:
  (1) Headline risk score (interaction-weighted)
  (2) Risk level label (Low / Moderate-Low / Moderate / High / Critical)
  (3) Recommendation (Proceed / Proceed with Minor Revisions / Proceed with Major Revisions / Do Not Proceed)

Consistency mapping (non-negotiable):
  90–100 → Low             → Proceed
  75–89  → Moderate-Low    → Proceed with Minor Revisions
  60–74  → Moderate        → Proceed with Targeted Revisions
  45–59  → High            → Proceed with Major Revisions
  0–44   → Critical        → Do Not Proceed (requires Section X criteria)

PROHIBITED INCONSISTENCIES:
  ✗ Score of 72 with "Do Not Proceed" recommendation
  ✗ Score of 48 with "Low Risk" label
  ✗ Score of 80 with "Critical" risk level
  ✗ Any mismatch between the three elements

In the INTERACTION-WEIGHTED RISK ANALYSIS section:
  → Lead with: "Interaction-Weighted Score (Headline): [Y]/100"
  → Follow with: "Standalone Additive Score (Breakdown Reference): [X]/100"
  → Never use the additive score as the lead number.

If the additive and interaction-weighted scores differ by more than 10 points, explicitly explain which risk stacks caused the compression and why.

════════════════════════════════════════════════════════════════════════════════
LAYER 3 RULE L3-D — DEDUPLICATION: RISKS OTHER TOOLS OVERWEIGHT
════════════════════════════════════════════════════════════════════════════════
The "5 Overstated Risks" and "5 Non-Risks" sections are MERGED into a single section:
  ### RISKS OTHER TOOLS OVERWEIGHT

This section contains items that a checklist or AI tool would flag as critical but which are NOT defects in this specific agreement, due to one of these reasons:
  (a) ABSENT — skeleton/draft incompleteness; not a hostile omission
  (b) MITIGATED — addressed by another clause
  (c) MARKET_STANDARD — consistent with current PE/M&A practice
  (d) INAPPLICABLE — not relevant to this deal type or industry

FORMAT for each item:
  [Number]. **[Risk name]** — [ABSENT | MITIGATED | MARKET_STANDARD | INAPPLICABLE]
    Why overweighted: [1-2 sentences explaining why this item does NOT constitute a defect here]
    Counter-language generated: [If any boilerplate counter-clause is generated for this item, reference it here as: "See Section [N] Counter-Language Block" — do NOT repeat the full clause text]

DEDUPLICATION RULE:
  → Counter-language is generated ONCE per risk item.
  → If the same clause is referenced in multiple sections (e.g., CRITICAL FINDINGS and RISKS OTHER TOOLS OVERWEIGHT), the full text appears only in CRITICAL FINDINGS. Other sections reference it by section number.
  → A risk item may NOT appear in both CRITICAL FINDINGS and RISKS OTHER TOOLS OVERWEIGHT simultaneously. If there is any overlap, remove from RISKS OTHER TOOLS OVERWEIGHT and keep in CRITICAL FINDINGS.

Maximum items in this section: 8 (combining former 5 Overstated + 5 Non-Risks lists).
Minimum: 3 — MANDATORY, no exceptions. If contract text does not immediately yield 3 items, derive from deal structure:
  → STATUTORY MERGER: TSA absence (INAPPLICABLE — operations transfer by law), Source Code Escrow (INAPPLICABLE — IP stays in surviving entity), Assumption of Liabilities mechanism (INAPPLICABLE — liabilities remain in surviving entity by operation of law), 18-month rep survival (MARKET_STANDARD in tech M&A — not aggressive seller drafting).
  → EQUITY PURCHASE: same three structure-keyed items above.
  → All deal types: standard basket, standard indemnity cap at purchase price, absence of break fee in bilateral deals.
  Do NOT output the minimum-item reminder text as the section body. If you find yourself about to write "at least 3 items required..." as the section content, stop — you have not executed this section. Build it from the deal structure.

• Tier 2 intermediate: Score floor ~45. Adjust up 5–10 pts for absent-but-expected provisions.
• Tier 3 near-final: Standard rubric applies. No artificial floor. Minor adjustments only.
• Tier 4 PE-final: Full market-norm scrutiny. No score adjustment. Any deviation is intentional.
• Tier 5 execution-ready: Strictest standards. Every blank and missing schedule = material defect.
CRITICAL: Reserve scores below 45 for FINALIZED agreements with AFFIRMATIVELY HOSTILE provisions.
NEVER assign sub-45 score to a skeleton (Tier 1) document unless it contains explicit toxic drafting.

SCORING DISCIPLINE — CALIBRATION EXAMPLES:
• 2-page LOI-style skeleton, no hostile provisions → Score: 62–68
• Intermediate draft, some mechanisms defined, indemnity absent → Score: 55–65
• Near-final agreement, missing earnout formula, weak survival → Score: 45–55
• Final PE agreement, knowledge qualifiers + escrow-only + no RWI stacked → Score: 35–50
• Final agreement, indemnity reversal + uncapped HIPAA + forced-close language → Score: 20–35
Rarely below 60 for Tier 1 unless explicit hostile/toxic provisions are affirmatively present.

"DO NOT PROCEED" REQUIRES ONE OF:
  (A) Explicit hostile / toxic drafting with affirmative textual evidence
  (B) Catastrophic economic exposure through compounded risk stacking
  (C) Regulatory impossibility — transaction cannot legally close as structured
  (D) Major structural imbalance in Tier 3–5 finalized agreement
  NOT appropriate for: skeleton documents, early drafts, or simply missing provisions

BEFORE OUTPUTTING — answer these 12 questions internally:
1. Did I check every indemnity clause against every definition for direction reversals?
2. Did I verify Buyer actually has recourse if Seller's reps are false?
3. Did I identify who controls money, tax allocation, and dispute resolution?
4. Did I find at least one risk that a surface-level reading would miss?
5. Did I flag every external reference or missing schedule?
6. Did I classify the document tier (Tier 1–5) and calibrate scores accordingly?
7. Did I remove or downgrade any finding that infers asymmetry, liability, or hostility from silence alone?
8. Did I verify that every LOW-confidence finding is labeled as such and is NOT driving the overall score?
9. Did I correctly classify each finding using the Section II taxonomy (Missing/Undefined/Weak/Waiver/Trap/Market Standard)?
10. Did I verify indemnity nullification requires MULTIPLE simultaneous gate conditions — not just one missing provision?
11. Did I suppress all Section IX false positives (FP-01 through FP-12) unless affirmative textual evidence exists?
12. Is my "Do Not Proceed" recommendation (if any) justified by Section X criteria — not merely by draft incompleteness?
If you cannot answer "yes" to all twelve, revise before writing the report.

Apply ALL Anti-Hallucination Rules and ALL Inference Discipline Rules. Do not declare provisions "standard." Quote text or state "Not found."

Output the report in this EXACT Markdown format — do not deviate:

## M&A CONTRACT RISK ASSESSMENT REPORT

### INDUSTRY DETECTED
**Vertical(s):** [List all detected verticals]
**Vertical-Specific Checklist Applied:** [Yes — [Vertical] / No — Generic checklist applied]

### DEAL-TYPE CLASSIFICATION
[SYSTEM-RENDERED — do not author this section. It will be injected from structured classification data after your response.]

### DRAFT COMPLETENESS CLASSIFICATION
**Document Tier:** [Tier 1 — Skeleton/Sample | Tier 2 — Intermediate Draft | Tier 3 — Near-Final | Tier 4 — Negotiated Final PE-Style | Tier 5 — Execution-Ready/Closing Form]
**Evidence for Tier Assignment:** [2-3 specific observations: e.g., "No operative definitions present; schedules not provided; indemnity framework entirely absent — consistent with Tier 1 skeleton"]
**Score Calibration Applied:** [State the disposition split. e.g., "Tier 1 skeleton. Floor leniency applied ONLY to OMITTED provisions: [list]. NOT applied to ALLOCATED_ADVERSE provisions: [§4 'as is', §8 'Buyer accepts all liabilities', §13 asymmetric termination], scored as drafted hostile terms. Net tier adjustment: +0 — all CRITICAL findings are ALLOCATED_ADVERSE, so the floor is suppressed." — OR — "Tier 1 skeleton. All gaps are pure OMITTED (no adverse allocation clauses found). Floor applied: raw 48 → adjusted 60."]
**What Would Change at Tier 4:** [The 2-3 issues that would become most serious if this were a final negotiated agreement rather than a draft/sample]

### EXECUTIVE SCORECARD
**Risk Score:** [number]/100
**Risk Level:** [Low / Moderate-Low / Moderate / High / Critical]
**Recommendation:** [Proceed / Proceed with Minor Revisions / Proceed with Major Revisions / Do Not Proceed]
**Review Perspective:** [BUYER / SELLER]
**One-Sentence Verdict:** [The single worst thing about this contract from the ${perspective}'s perspective]

### EXECUTIVE SUMMARY
[2-3 sentence summary of the deal and its overall risk profile from the ${perspective}'s perspective]

### PURCHASE PRICE BREAKDOWN
[Complete this structural map before ANY opinion. If a component is not mentioned in the contract, state "Not found in text."]
- **Closing Payment:** [amount or "Not specified"]
- **Escrow:** [amount, duration, release conditions — or "None identified"]
- **Earnout:** [description — or "None identified"]
- **Holdback:** [amount, conditions — or "None identified"]
- **Seller Financing:** [terms — or "None identified"]
- **Contingent Components:** [description — or "None identified"]
- **Working Capital Mechanics:** [target, peg, true-up methodology — or "Not specified"]
- **Maximum Theoretical Consideration:** [calculated total — or "Cannot calculate; components unspecified"]

### INDEMNITY STACK
[Complete this table. If information is not in the contract text, state "Not found." Do NOT invent figures.]

| Category | Basket | Cap | Escrow Limited? | Survival | Carve-Out? | Real Exposure |
|---|---|---|---|---|---|---|
| General Reps & Warranties | | | | | | |
| Fundamental Reps | | | | | | |
| Tax | | | | | | |
| Fraud | | | | | | |
| Specific Indemnities | | | | | | |
| Environmental | | | | | | |

**Maximum Theoretical Exposure:** [calculated or "Cannot calculate; cap/basket terms not specified"]
**Escrow as Sole Source?** [Yes — for what categories / No / Not specified]
**Security Adequacy:** [Adequate / Inadequate — with 1-sentence explanation]

### CRITICAL FINDINGS (Deal-Breakers / Major Revisions Required)
[Numbered list. Each item must state: (1) exact clause/section, (2) the hidden risk, (3) the cross-reference that creates the trap, (4) recommended fix. Mark any finding flagged CRITICAL by even one specialist with ⚠️ HUMAN REVIEW REQUIRED.
Label each finding with ONE of: 🔴 Structural Defect | 🟠 Material Negotiation Point | 🟡 Enhancement | ⚪ Market Standard
Only 🔴 Structural Defect if it creates: unlimited liability, economic engine failure, loss of termination rights, uninsurable regulatory exposure, or Day-1 operational impossibility.

MANDATORY FOR EVERY 🔴 Structural Defect finding: Immediately after the finding, append the following block verbatim in structure:

---
**PROPOSED REVISION / COUNTER-LANGUAGE (Buyer-Protective)**
> [Production-ready clause text drafted from Buyer's perspective. Use standard corporate legal nomenclature. No conversational text inside the clause. Must be copy-pasteable into a joinder or addendum framework. Pull from Fast-Path Template Library if applicable to a standard risk code; draft custom language only for hyper-specific or exotic risks.]
---
]

### STRUCTURAL GAPS (Missing Economic or Security Mechanisms)
[Numbered list: missing earnout formula, missing escrow, missing working capital, missing indemnity security, etc. Note: "Economic engine is incomplete; formula not specified in text" where applicable.
Label each with 🔴 / 🟠 / 🟡 / ⚪]

### EARNOUT RISK ANALYSIS
[Only complete this section if earnout exists in the contract. Otherwise state "No earnout identified in contract."]
- **Formula in Text?** [Yes — quote it / No — "Economic engine incomplete; formula not specified"]
- **Thresholds/Tiers:** [exact numbers or "Not specified"]
- **Operational Discretion vs. Good Faith Covenant:** [does Buyer's integration rights conflict with Seller's earnout rights?]
- **Accounting Discretion:** [who controls EBITDA/revenue definitions?]
- **Offset Rights:** [can Buyer offset indemnity claims against earnout?]
- **Dispute Resolution:** [mechanism, timeline, neutral arbitrator?]
- **Who Controls Earnout Outcome in Practice:** [BUYER / SELLER / NEUTRAL — with explanation]
- **Litigation Probability:** [Low / Medium / High — with reasoning]

### ASYMMETRY & ONE-SIDED PROVISIONS
[Numbered list: unequal cure periods, one-sided break fees, unilateral tax allocation, one-sided confidentiality, non-compete binding entity only, etc.
Label each with 🔴 / 🟠 / 🟡 / ⚪]

### MAE DOCTRINAL ANALYSIS
**MAE Carve-Outs:**
[List every carve-out explicitly found in the MAE definition, or "No MAE definition found in text."]

**⚠ CENTERPIECE ANALYSIS — Disproportionate Effect Carve-Back:**
[This is the MOST IMPORTANT element of MAE analysis. Delaware-style MAE definitions INTENTIONALLY exclude broad market/industry events — that is market standard and NOT a defect. The critical doctrinal question is: does a "disproportionate effects" carve-back exist?

Market-standard drafting: Industry/economic carveouts exclude events affecting the market broadly, BUT: if the target suffers disproportionately relative to industry peers, the buyer regains protection. Without this carveback, a competitor collapse scenario could wipe out target revenue and Buyer has NO walk right.

Answer: Does a disproportionate effects carve-back exist? Quote exact language or "Not found — this is the primary MAE defect in this agreement."]

**Where MAE Is Operationally Used:**
[List every clause that relies on or references MAE — closing conditions, termination rights, bring-down, etc.]

**Is MAE Legally Meaningful in This Agreement?**
[Answer YES / PARTIAL / NO. Explain in 2-3 sentences — distinguish between: (a) MAE being broadly carved-out (market standard), versus (b) MAE lacking disproportionate carveback (the actual defect). Do NOT say "MAE is practically useless" if carve-outs are market standard — say instead whether the DISPROPORTIONATE CARVEBACK is absent and what that means practically.]

**PE Market Norm Comparison:**
[How do these carve-outs compare to current PE market norms? Evaluate: (1) Are the carve-outs themselves market standard? (2) Is the disproportionate carveback present? (3) What is the realistic triggering scenario? Over-carved without carveback / Market Standard with carveback / Under-carved / Market Standard overall]

### INTERACTION-WEIGHTED RISK ANALYSIS
[Identify any compounded risk stacks where multiple negative factors multiply each other. For each stack:]

**Risk Stacks Identified:**
| Stack | Factors | Individual Score | Compounded Impact | Classification |
|---|---|---|---|---|
| [e.g., Indemnity Nullification] | [weak reps + escrow-only + short survival + no RWI] | [e.g., each moderate] | [e.g., CRITICAL — recovery near zero] | [Compounded] |

**Standalone Score (additive):** [X]/100
**Interaction-Weighted Score (multiplicative):** [Y]/100
**Score Compression:** [+/- Z points — explain why stacking changes the score and which stacks drove compression]

**Why This Matters for Deal Pricing:** [1-2 sentences on how compounded risks should affect valuation or deal structure]

### LITIGATION REALISM ASSESSMENT
[For each CRITICAL or HIGH finding, assess practical litigation viability:]

| Finding | Would Be Litigated? | Claimant Likely Prevails? | Economics Justify Pursuit? | Litigation Classification |
|---|---|---|---|---|
| [Finding name] | [Yes/No/Maybe — why] | [Yes/No/Maybe — why] | [Yes/No — est. cost vs. recovery] | [Live Risk / Academic Risk / Economically Irrational] |

**Arbitration Cost Reality Check:** [State the arbitration structure, estimated per-arbitrator fees, timeline, and the minimum claim size that is economically rational to pursue given those costs. Flag any indemnity provisions that are theoretically valid but practically worthless due to arbitration economics.]

### CLOSING CONDITIONS RIGOR TEST
| Condition | Standard Applied | Materiality Scrape? | Dollar Threshold | Status |
|---|---|---|---|---|
| Bring-Down of Reps | | | | |
| MAE/MAC Condition | | | | |
| Regulatory Approvals | | | | |
| Third-Party Consents | | | | |
| Financing Out | | | | |
| Diligence Satisfaction | | | | |

**Regulatory Burden Allocation:** [Who bears the cost and obligation for regulatory clearance?]
**Closing Leverage Analysis:** [BUYER has greater closing leverage / SELLER has greater closing leverage / Balanced — with explanation]

### CONTRADICTIONS & CROSS-ARTICLE TRAPS
[Numbered list. For EACH contradiction:
- Section X says [A], but Section Y says [B].
- **Verdict: Real / Overstated / Illusory** — [1-sentence explanation of why]
- Market Classification: [Market Standard / Slightly Aggressive / Sponsor-Style Drafting / Structurally Imbalanced / Material Defect]]

### INDUSTRY-SPECIFIC & OPERATIONAL RISKS
[Vertical-specific gaps from the applicable checklist. If no vertical detected, note "Generic checklist applied."]

### BLIND SPOTS & MISSING SCHEDULES
[All ghost references, undefined terms, missing schedules/exhibits. State "Schedule X referenced but not provided" for each.]

### WHAT PRIOR REVIEWS LIKELY MISSED
["A standard section-by-section review would likely miss the following..." then list hidden cross-reference risks discovered here.]

### CONTEXTUAL SYNTHESIS — DAY-1 OPERATIONAL RISK

#### SYNTH-01: Indemnification Cap vs. Assumed Liabilities (Buyer Suicide Pill)
[State whether all 3 conditions of the logic gate are met. Quote the assumption clause, the cap clause, and confirm presence/absence of carve-out. If triggered → CRITICAL with fix.]

#### SYNTH-02: Day-1 Operational Viability (Shell Company Check)
[State whether all 3 conditions are met: TSA status, employee retention status, customer contract assignability. If triggered → CRITICAL with fix.]

#### SYNTH-03: Regulatory Directive Risk (Illegal Act Check)
[State whether both conditions are met: required transfer + regulatory disclaimer/non-rep. Quote both clauses if found. If triggered → CRITICAL with fix.]

#### SYNTH-04: Asymmetrical Termination Trap (Roach Motel Check)
[List each party's termination rights explicitly. Identify who can exit and who cannot. State whether MAE provides relief. If triggered → HIGH with fix.]

### CROSS-LAYER PREMISE CONFLICTS (L3-B)
[RECONCILER OUTPUT INJECTED POST-GENERATION — see report body]

### SPECIALIST CONSENSUS MAP
[For each major finding: ✓✓ Confirmed (both specialists) / ◐ Single-Source (one specialist) / ★ New Finding (found here only)]

### DETAILED ANALYSIS BY CHECKLIST POINT

#### 1. Definitions & Recitals
[Assessment with section citations]

#### 2. Purchase Price & Consideration
[Assessment]

#### 3. Representations & Warranties
[Assessment]

#### 4. Covenants
[Assessment]

#### 5. Conditions to Closing
[Assessment]

#### 6. Indemnification
[Assessment]

#### 7. Termination Provisions
[Assessment]

#### 8. Exclusivity / Non-Competition
[Assessment — if not present in contract text, write exactly: “Not present in text.” Do not describe what a non-compete would contain.]

#### 9. Boilerplate
[Assessment — note governing law, dispute resolution gaps]

#### 10. RWI (Representations & Warranties Insurance)
[Assessment]

### ADVANCED CONTEXTUAL RISK FINDINGS

#### 11. Negative Waivers of Closing Conditions (Forced Close Check)
[Finding — quote exact clause if found, or "Not detected after full-text scan"]

#### 12. Employee Retention Duration (Brain Drain Check)
[Finding — state exact duration or "No retention clause found"]

#### 13. Jurisdictional & Venue Mismatches (Arbitrage Trap Check)
[Finding — quote exact governing law clause and dispute resolution clause]

#### 14. Liquidated Damages Enforceability (Penalty Clause Check)
[Finding — quote clause and amount, note if calculation methodology present]

#### 15. Vague Qualifying Language in R&W (Weasel Word Deep Scan)
[Finding — list EVERY instance with exact phrase and section reference]

#### 16. Data Destruction Acknowledgments (Spoliation Check)
[Finding — quote exact language if found, identify which party acknowledges]

### BOARD-LEVEL SUMMARY
**5 Real Risks (with economic quantification):**
1. [Risk — estimated $ exposure or % deal value at risk]
2.
3.
4.
5.

**Risks Other Tools Overweight (per L3-D — merged Overstated + Non-Risk list, max 8):**
1. [Risk name] — [ABSENT | MITIGATED | MARKET_STANDARD | INAPPLICABLE]: [Why this is NOT a defect here. Counter-language: See Section [N] Counter-Language Block, or N/A]
2.
3.
4.
5.
6.
7.
8.

**LOW-Confidence Findings (labeled — do not weight heavily in score):**
[List any findings based on industry-pattern inference, checklist templates, or absence-of-language that lack direct textual support. These are flagged for awareness only — they did NOT significantly influence the risk score.]
1.
2.
3.

**5 Surgical Negotiation Edits:**
1. [Specific clause → specific fix → economic impact]
2.
3.
4.
5.

**Overall Market Classification:** [Sponsor-Favorable / Balanced / Seller-Favorable / Structurally Imbalanced]
**Final Recommendation:** [✅ Proceed / ⚖️ Proceed with Targeted Revisions / ❌ Reprice or Restructure / 🛑 Do Not Proceed]

---

## INVESTMENT COMMITTEE MEMO

### IC SECTION 1 — DEAL SNAPSHOT
| Metric | Value |
|---|---|
| Enterprise Value | |
| Closing Cash Payment | |
| Escrow (% of EV) | |
| Earnout (% of EV) | |
| Indemnity Cap (% of EV) | |
| General R&W Survival | |
| Fundamental Rep Survival | |
| Buyer Termination Rights | |
| Seller Termination Rights | |
| Outside Date | |

### IC SECTION 2 — LIABILITY EXPOSURE SUMMARY
**Maximum Realistic Seller Liability:** [calculated figure or range]
**Escrow Sufficiency:** [Adequate / Inadequate — is escrow sized to cover likely breach scenarios?]
**Fraud Carve-Out Implications:** [What is the practical impact of the fraud carve-out? Narrow or broad definition?]
**Regulatory Tail Exposure:** [Identified regulatory risks and estimated exposure window]
**Earnout Leverage Dynamics:** [Who controls earnout realization? What is the realistic earnout range?]
**Arbitration Practicality:** [Minimum economically rational claim size given arbitration cost structure — claims below this threshold are effectively unenforceable]
**Interaction-Weighted Risk Assessment:**
- Compounded Risk Stacks Identified: [list any stacks, e.g., "Indemnity Nullification Stack: weak reps + escrow-only + no RWI + short survival"]
- Standalone Additive Score: [X]/100
- Interaction-Weighted Score: [Y]/100

**Deal Structure Classification:** [Sponsor-Favorable / Balanced / Seller-Favorable]
[1-2 sentence explanation of why]

### IC SECTION 3 — DAY-1 OPERATIONAL RISK
- **Customer Assignability:** [Confirmed / Unverified / At Risk — cite contract provisions]
- **Regulatory Licensing:** [All licenses transferable / Non-transferable licenses identified / Unknown]
- **Employee Retention:** [Key employees retained / Retention gaps / No retention provisions]
- **Data Transfer Legality:** [Legally cleared / HIPAA/GDPR/privacy risk identified / Unknown]
- **Transition Risk:** [TSA in place / TSA needed but absent / Not applicable]
- **Day-1 Viability Verdict:** [Executable without disruption / Significant transition risk / NOT executable on Day-1]

### IC SECTION 4 — EARNOUT RISK DYNAMIC
[Only if earnout exists. Otherwise: "No earnout — section not applicable."]
- **Who Controls Post-Close Economics:** [BUYER / SELLER / NEUTRAL]
- **Offset Risk:** [Buyer can offset indemnity claims against earnout — Yes/No/Partial]
- **Litigation Risk:** [Low / Medium / High — and why]
- **Incentive Alignment Quality:** [Well-aligned / Misaligned / Adversarial]

### IC SECTION 5 — TRUE RED FLAGS (Maximum 5)
[Only include issues that: change valuation, create deal certainty risk, create >5% EV exposure, or create regulatory enforcement risk]
1. [Flag — estimated EV impact]
2.
3.
4.
5.

### IC SECTION 6 — NEGOTIATION PRIORITIES
**Must Fix Before Signing:**
- [Issue → specific fix required]

**Should Fix If Leverage Exists:**
- [Issue → preferred improvement]

**Nice to Improve:**
- [Issue → enhancement opportunity]

### IC SECTION 7 — FINAL IC RECOMMENDATION
**Recommendation:** [✅ Approve as Structured / ⚖️ Approve with Targeted Revisions / 🔁 Renegotiate Economics / 🛑 Do Not Proceed]
**Confidence Level:** [High / Medium / Low]
**Rationale:** [2-3 sentences explaining the IC recommendation and what would change the outcome]`;

  const contractSection = contractText
    ? `\n\nCONTRACT TEXT (for your Contradiction Hunter analysis):\n${contractText.substring(0, 600000)}\n`
    : "";

  // Extract classification metadata from analyst JSON for cross-layer reconciliation (L3-B)
  let analystClassificationBlock = "";
  try {
    const analystJson = JSON.parse(analystOutput.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    const confidence = analystJson.classification_confidence ?? "UNKNOWN";
    const dealType = analystJson.deal_type ?? "UNKNOWN";
    const candidates = analystJson.candidate_structures ? analystJson.candidate_structures.join(", ") : "N/A";
    const suppressions = analystJson.suppressions ?? [];
    const suppressionSummary = suppressions.length > 0
      ? suppressions.map((s: { rule: string; suppression_status: string; rationale: string }) => `  • [${s.suppression_status}] ${s.rule}: ${s.rationale}`).join("\n")
      : "  • None reported";
    const verticalModule = analystJson.vertical_module_applied ?? "Not reported";
    analystClassificationBlock = `
ANALYST CLASSIFICATION METADATA (L3-B reconciliation inputs):
  Deal Type:               ${dealType}
  Classification Confidence: ${confidence}
  Candidate Structures:    ${candidates}
  Vertical Module Applied: ${verticalModule}
  Suppressions Reported:
${suppressionSummary}

L3-B INSTRUCTION: If confidence is MEDIUM → re-evaluate all SUPPRESSED_MEDIUM items independently.
If confidence is CONTESTED → re-surface ALL suppressed/downgraded findings and flag as [RE-SURFACED — CONTESTED CLASSIFICATION]. Perform worst-case deal-type analysis independently.
`;
  } catch {
    analystClassificationBlock = `
ANALYST CLASSIFICATION METADATA: [Could not parse Analyst JSON — treat as CONTESTED confidence]
L3-B INSTRUCTION: Apply CONTESTED protocol — re-surface all suppressed items, perform worst-case analysis.
`;
  }

  const userPrompt = `INDEMNITY HUNTER REVIEW (Specialist #1):
${analystOutput.substring(0, 2500)}
${analystClassificationBlock}
ECONOMIC ENGINE HUNTER REVIEW (Specialist #2):
${criticOutput.substring(0, 2500)}
${contractSection}
Apply all aggregation rules (L3-A through L3-D). Elevate any CRITICAL from either specialist. Apply L3-B cross-layer reconciliation using the classification metadata above. Generate the final report in the exact Markdown format specified.`;

  const _adjudicatorStart = Date.now();
  const response = await client.chat.completions.create({
    model: MODELS.adjudicator,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
  });
  console.log(`[LLM TIMING] Adjudicator (${MODELS.adjudicator}): ${Date.now() - _adjudicatorStart}ms`);

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error(`Adjudicator model (${MODELS.adjudicator}) returned empty response`);
  return content;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSE METADATA FROM FINAL REPORT
// ─────────────────────────────────────────────────────────────────────────────
export function parseReportMetadata(markdown: string): {
  score: number | null;
  riskLevel: string | null;
  recommendation: string | null;
  executiveSummary: string | null;
} {
  const scoreMatch = markdown.match(/\*\*Risk Score:\*\*\s*(\d+)/i);
  const score = scoreMatch?.[1] != null ? parseInt(scoreMatch[1], 10) : null;

  const riskMatch = markdown.match(/\*\*Risk Level:\*\*\s*([^\n]+)/i);
  const riskLevel = riskMatch?.[1] != null ? riskMatch[1].trim() : null;

  const recMatch = markdown.match(/\*\*Recommendation:\*\*\s*([^\n]+)/i);
  const recommendation = recMatch?.[1] != null ? recMatch[1].trim() : null;

  const summaryMatch = markdown.match(/### EXECUTIVE SUMMARY\n([\s\S]+?)(?=###)/i);
  const executiveSummary = summaryMatch?.[1] != null ? summaryMatch[1].trim() : null;

  return { score, riskLevel, recommendation, executiveSummary };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER-SIDE SCORE VALIDATOR
// Validates and clamps the LLM-produced raw score using the same deduction
// logic embedded in the prompt. Corrects egregious scoring drift.
// ─────────────────────────────────────────────────────────────────────────────

export type ScoringCondition =
  | "missing_framework"
  | "missing_cap_only"
  | "missing_basket_only"
  | "missing_survival_only"
  | "earnout_no_metrics"
  | "earnout_no_dispute_mech"
  | "earnout_seller_no_control"
  | "missing_outside_date"
  | "missing_termination"
  | "weak_reps"
  | "all_liabilities_assumed"
  | "missing_schedules"
  | "contradiction_detected"
  | "indemnity_reversal"
  | "unrestricted_diligence_exit"
  | "missing_severability"
  | "missing_notices"
  | "missing_counterparts"
  | "missing_non_reliance";

/** Deduction in points per confirmed condition (Tier 3+ only) */
const DEDUCTION_MAP: Record<ScoringCondition, number> = {
  missing_framework: 20,
  missing_cap_only: 8,
  missing_basket_only: 6,
  missing_survival_only: 5,
  earnout_no_metrics: 15,
  earnout_no_dispute_mech: 8,
  earnout_seller_no_control: 7,
  missing_outside_date: 5,
  missing_termination: 10,
  weak_reps: 10,
  all_liabilities_assumed: 10,
  missing_schedules: 5,
  contradiction_detected: 10,
  indemnity_reversal: 20,
  unrestricted_diligence_exit: 15,
  missing_severability: 3,
  missing_notices: 4,
  missing_counterparts: 2,
  missing_non_reliance: 5,
};

/** Tier floor scores — Tier 1/2 never go below floor absent hostile provisions */
const TIER_FLOORS: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 55,
  2: 45,
  3: 0,
  4: 0,
  5: 0,
};

export interface ScoredFinding {
  severity: 'critical' | 'high' | 'moderate' | 'low';
  disposition: 'OMITTED' | 'ALLOCATED_ADVERSE';
}

/**
 * Deterministic scoring-condition detector (Stage 11 Quality Assurance).
 * Scans the raw contract text and returns the ScoringCondition[] set that
 * drives validateScore(). This is the server-side calibration layer that the
 * LLM report's raw score is validated against — prevents the model from
 * drifting above/below the mechanically-derived score.
 */
export function detectScoringConditions(text: string): ScoringCondition[] {
  const conditions: ScoringCondition[] = [];
  const t = text;

  // Indemnification framework: absent unless indemnify/indemnification present
  if (!/\bindemnif\w*\b/i.test(t)) {
    conditions.push("missing_framework");
  }
  // Cap: only relevant when a framework exists
  if (/\bindemnif\w*\b/i.test(t) && !/\b(?:cap|aggregate\s+liability|maximum\s+liability)\b/i.test(t)) {
    conditions.push("missing_cap_only");
  }
  if (/\bindemnif\w*\b/i.test(t) && !/\bbasket\b|\bthreshold\b/i.test(t)) {
    conditions.push("missing_basket_only");
  }
  if (/\bindemnif\w*\b/i.test(t) && !/\bsurvival\b|\bperiod\s+of\s+survival\b/i.test(t)) {
    conditions.push("missing_survival_only");
  }

  // Earnout mechanics
  if (/\bearn[- ]?out\b/i.test(t)) {
    if (!/\b(?:adjusted\s+ebitda|revenue|ebitda|profit|formula)\b/i.test(t)) {
      conditions.push("earnout_no_metrics");
    }
    if (!/\b(?:dispute|independent\s+accountant|accountant|auditor)\b/i.test(t)) {
      conditions.push("earnout_no_dispute_mech");
    }
  } else if (/\b(?:purchase\s+price|consideration)\b/i.test(t)) {
    conditions.push("earnout_seller_no_control");
  }

  // Termination / outside date
  if (!/\boutside\s+date\b|\bdrop[- ]dead\b/i.test(t)) {
    conditions.push("missing_outside_date");
  }
  if (!/\bterminat(?:ion|e)\b/i.test(t)) {
    conditions.push("missing_termination");
  }

  // Reps quality
  if (/\brepresentations?\s+and\s+warranties\b/i.test(t) && /(?:knowledge\s+qualifier|to\s+the\s+knowledge\s+of)\b/i.test(t)) {
    conditions.push("weak_reps");
  }

  // Broad liability assumption
  if (/\b(?:assumes?|accepted|agrees\s+to\s+accept)\b/i.test(t) && /(?:all\s+(?:liabilities|obligations)|all\s+debts)\b/i.test(t)) {
    conditions.push("all_liabilities_assumed");
  }

  // Missing schedules
  if (/\b(?:Schedule|Exhibit|Annex)\b/i.test(t) && !/\b(?:disclosure\s+schedules?\b|attached\s+hereto|set\s+forth\s+on)\b/i.test(t)) {
    conditions.push("missing_schedules");
  }

  // Contradiction / indemnity reversal / diligence-out
  if (/\b(?:notwithstanding|except\s+as\s+provided)\b/i.test(t) && /conflict|contradict/i.test(t)) {
    conditions.push("contradiction_detected");
  }
  if (/\bbuyer\s+(?:shall\s+)?indemnif\w*\s+(?:the\s+)?seller\b/i.test(t)) {
    conditions.push("indemnity_reversal");
  }
  if (/\b(?:diligence|due\s+diligence)\b/i.test(t) && /(?:terminat(?:e|ion).{0,80}due\s+diligence|walk\s+away)\b/i.test(t)) {
    conditions.push("unrestricted_diligence_exit");
  }

  // Boilerplate
  if (!/\bseverability\b/i.test(t)) conditions.push("missing_severability");
  if (!/\bnotice(?:s)?\b/i.test(t)) conditions.push("missing_notices");
  if (!/\bcounterparts?\b/i.test(t)) conditions.push("missing_counterparts");
  if (!/\bnon-?reliance\b/i.test(t)) conditions.push("missing_non_reliance");

  return [...new Set(conditions)];
}

export interface ValidateScoreInput {
  rawScore: number;
  tier: 1 | 2 | 3 | 4 | 5;
  detectedConditions: ScoringCondition[];
  /** Structured findings carrying severity + disposition labels from the LLM output.
   *  Required for correct floor-clamp gating. If absent, conservative fallback applies. */
  findings?: ScoredFinding[];
}

export interface ValidateScoreResult {
  /** Final clamped score after validation */
  validatedScore: number;
  /** Individual deductions applied (condition → points deducted) */
  appliedDeductions: Partial<Record<ScoringCondition, number>>;
  /** Extra points from interaction stacks (negative = additional deduction) */
  interactionAdjustment: number;
  /** Human-readable explanation of adjustments */
  adjustmentNarrative: string[];
}

/**
 * Validates and clamps an LLM-produced score against the canonical
 * scoring deduction table. For Tier 1/2 documents applies the floor
 * instead of individual deductions. For Tier 3+ applies per-condition
 * deductions plus interaction stacks and returns the validated score.
 *
 * NOTE: This does NOT re-run the LLM analysis. It takes detectedConditions
 * as parsed/extracted from the LLM report and checks mathematical consistency.
 */
export function validateScore(input: ValidateScoreInput): ValidateScoreResult {
  const { rawScore, tier, detectedConditions, findings = [] } = input;
  const narrative: string[] = [];
  const appliedDeductions: Partial<Record<ScoringCondition, number>> = {};
  let interactionAdjustment = 0;

  // Tier 1/2: floor leniency is for INCOMPLETENESS only.
  // It must NOT rescue a document with affirmatively adverse critical terms.
  // If ANY finding is CRITICAL + ALLOCATED_ADVERSE, the floor is suppressed —
  // those terms are scored as drafted hostile provisions regardless of tier.
  const hasAdverseCritical = findings.some(
    f => f.severity === 'critical' && f.disposition === 'ALLOCATED_ADVERSE'
  );

  if (tier <= 2 && !hasAdverseCritical) {
    const floor = TIER_FLOORS[tier];
    const clampedRaw = Math.max(floor, Math.min(100, rawScore));
    if (clampedRaw !== rawScore) {
      narrative.push(
        `Tier ${tier} document: score clamped to floor ${floor} (raw was ${rawScore}). All critical findings are OMITTED — leniency applies.`
      );
    }
    return {
      validatedScore: clampedRaw,
      appliedDeductions: {},
      interactionAdjustment: 0,
      adjustmentNarrative: narrative,
    };
  }

  if (tier <= 2 && hasAdverseCritical) {
    narrative.push(
      `Tier ${tier} document: floor leniency SUPPRESSED — document contains CRITICAL findings labeled ALLOCATED_ADVERSE. Absence-weaponized provisions scored as hostile drafting; no floor applied.`
    );
    // Fall through to Tier 3+ scoring path so per-condition deductions apply.
  }

  // Tier 3+: validate indemnification sub-conditions — never double-count
  const hasFramework = detectedConditions.includes("missing_framework");
  const hasSubConditions =
    detectedConditions.includes("missing_cap_only") ||
    detectedConditions.includes("missing_basket_only") ||
    detectedConditions.includes("missing_survival_only");

  if (hasFramework && hasSubConditions) {
    narrative.push(
      "WARNING: Both missing_framework and individual indemnification sub-conditions detected — " +
      "applying only missing_framework (-20) per scoring rules."
    );
  }

  // Apply per-condition deductions
  let computedScore = 100;
  for (const condition of detectedConditions) {
    // Skip sub-conditions if full framework is missing (avoid double-count)
    if (
      hasFramework &&
      (condition === "missing_cap_only" ||
        condition === "missing_basket_only" ||
        condition === "missing_survival_only")
    ) {
      continue;
    }
    const pts = DEDUCTION_MAP[condition] ?? 0;
    appliedDeductions[condition] = pts;
    computedScore -= pts;
  }

  // Interaction stacks
  const interactionNotes: string[] = [];

  // no_exit stack: missing_outside_date + missing_termination → extra -10
  if (
    detectedConditions.includes("missing_outside_date") &&
    detectedConditions.includes("missing_termination")
  ) {
    interactionAdjustment -= 10;
    interactionNotes.push("no_exit stack: missing_outside_date + missing_termination → -10");
  }

  // bad_earnout stack: earnout_no_metrics + earnout_no_dispute_mech → extra -5
  if (
    detectedConditions.includes("earnout_no_metrics") &&
    detectedConditions.includes("earnout_no_dispute_mech")
  ) {
    interactionAdjustment -= 5;
    interactionNotes.push("bad_earnout stack: earnout_no_metrics + earnout_no_dispute_mech → -5");
  }

  // compounded_risk: 3+ conditions → extra -10 (or -15 if 5+)
  const deductionCount = Object.keys(appliedDeductions).length;
  if (deductionCount >= 5) {
    interactionAdjustment -= 15;
    interactionNotes.push(`compounded_risk stack: ${deductionCount} conditions → -15`);
  } else if (deductionCount >= 3) {
    interactionAdjustment -= 10;
    interactionNotes.push(`compounded_risk stack: ${deductionCount} conditions → -10`);
  }

  const theoreticalScore = Math.max(0, Math.min(100, computedScore + interactionAdjustment));

  // Drift tolerance: if raw score deviates more than 15 pts from theoretical,
  // clamp toward theoretical (split the difference)
  const drift = rawScore - theoreticalScore;
  let validatedScore: number;

  if (Math.abs(drift) > 15) {
    // Clamp: average of raw and theoretical, then bound to [0, 100]
    validatedScore = Math.round(Math.max(0, Math.min(100, (rawScore + theoreticalScore) / 2)));
    narrative.push(
      `Score drift detected: LLM raw=${rawScore}, theoretical=${theoreticalScore}, drift=${drift > 0 ? "+" : ""}${drift}. ` +
      `Clamped to midpoint: ${validatedScore}.`
    );
  } else {
    validatedScore = rawScore;
    narrative.push(`Score within tolerance (raw=${rawScore}, theoretical=${theoreticalScore}, drift=${drift}).`);
  }

  if (interactionNotes.length > 0) {
    narrative.push(...interactionNotes);
  }

  // Apply tier floor safety net (Tier 3–5 don't have a forced floor per rules)
  validatedScore = Math.max(0, Math.min(100, validatedScore));

  return {
    validatedScore,
    appliedDeductions,
    interactionAdjustment,
    adjustmentNarrative: narrative,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC CROSS-LAYER RECONCILER (L3-B v3)
// Reads structured pipeline outputs — does NOT ask the LLM to self-grade.
// Five checks, each producing PASS or FAIL with a machine-generated fix hint.
// ─────────────────────────────────────────────────────────────────────────────

export type DealType = 'STATUTORY_MERGER' | 'EQUITY_PURCHASE' | 'ASSET_PURCHASE';
export type ClassificationConfidence = 'HIGH' | 'MEDIUM' | 'CONTESTED' | 'UNKNOWN';
export type Recommendation = 'DO_NOT_PROCEED' | 'PROCEED_WITH_CONDITIONS' | 'PROCEED';

export interface ReconcilerSuppression {
  item: string;       // e.g. "TSA Absence"
  applied: boolean;
  rationale: string;  // must be a string, not prose blob — parse from LLM suppression objects
}

export interface ReconcilerFinding {
  topic: string;
  severity: 'CRITICAL' | 'HIGH' | 'MATERIAL' | 'MODERATE' | 'LOW';
  disposition: 'OMITTED' | 'ALLOCATED_ADVERSE';
}

/** Single source of truth for suppression state — computed once, shared by renderer and A2. */
export interface ResolvedSuppression {
  item: string;
  suppressed: boolean;        // true = actively suppressed; false = LIVE or disabled
  rationale: string;
  reason: 'APPLIED' | 'LIVE_UNDER_STRUCTURE' | 'DISABLED_CONTESTED';
}

export interface ReconcilerInput {
  dealType: DealType;
  classificationConfidence: ClassificationConfidence;
  suppressions: ReconcilerSuppression[];
  findings: ReconcilerFinding[];
  netTierBump: number;      // 0 if no leniency applied, positive if floor was added
  recommendation: Recommendation;
  /** Pre-resolved suppression state — computed once in analyses.ts via resolveSuppressions(),
   *  then handed to both the renderer and A2. Neither re-reads prose or re-resolves. */
  resolved: ResolvedSuppression[];
}

export interface ReconcilerCheck {
  id: string;
  status: 'PASS' | 'FAIL';
  detail?: string[];
  fix?: string;
}

export interface ReconcilerResult {
  results: ReconcilerCheck[];
  conflicts: ReconcilerCheck[];
  clean: boolean;
}

// Terms that name a structure different from the one classified.
// A suppression rationale containing these on a mismatched deal-type is an A2 conflict.
const FOREIGN_STRUCTURE_TERMS: Record<DealType, RegExp[]> = {
  STATUTORY_MERGER: [
    /equity\s+(deal|acquisition|purchase)/i,
    /stock\s+purchase/i,
    /share\s+purchase/i,
    /asset\s+(purchase|acquisition)/i,
    /100%\s*equity/i,
  ],
  EQUITY_PURCHASE: [
    /\bmerger\b/i,
    /surviving\s+(corporation|entity)/i,
    /asset\s+(purchase|acquisition)/i,
  ],
  ASSET_PURCHASE: [
    /\bmerger\b/i,
    /surviving\s+(corporation|entity)/i,
    /equity\s+(deal|acquisition)/i,
    /stock\s+purchase/i,
  ],
};

const STRUCTURE_KEYED_SUPPRESSIONS = ['TSA Absence', 'Source Code Escrow', 'Assumption of Liabilities'];

const STRUCTURE_LABEL: Record<DealType, string> = {
  STATUTORY_MERGER: 'merger',
  EQUITY_PURCHASE: 'equity / stock purchase',
  ASSET_PURCHASE: 'asset purchase',
};

function normalizeKey(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve suppression state exactly once from the SUPPRESSION_MATRIX.
 * Returns one ResolvedSuppression per matrix row.
 * Pass the returned array to both renderDealTypeSection() and reconcilePipelineOutput()
 * so both consumers see identical data — no drift possible.
 */
export function resolveSuppressions(dealType: DealType, classificationConfidence: ClassificationConfidence): ResolvedSuppression[] {
  return SUPPRESSION_MATRIX.map(row => {
    if (classificationConfidence === 'CONTESTED') {
      return {
        item: row.item,
        suppressed: false,
        rationale: 'LIVE (worst-case — CONTESTED classification)',
        reason: 'DISABLED_CONTESTED' as const,
      };
    }
    const disp = row.disposition[dealType];
    const suppressed = disp === 'SUPPRESSED';
    return {
      item: row.item,
      suppressed,
      rationale: suppressed ? row.suppressedReason[dealType] : row.liveReason[dealType],
      reason: suppressed ? 'APPLIED' as const : 'LIVE_UNDER_STRUCTURE' as const,
    };
  });
}

export function reconcilePipelineOutput(out: ReconcilerInput): ReconcilerResult {
  const results: ReconcilerCheck[] = [];

  const fail = (id: string, detail: string[], fix: string): void => {
    results.push({ id, status: 'FAIL', detail, fix });
  };
  const pass = (id: string): void => {
    results.push({ id, status: 'PASS' });
  };

  // A2 — deal-type vocabulary coherence.
  // Single source of truth: reads `out.resolved` (pre-computed by resolveSuppressions()).
  // Neither the renderer nor A2 re-resolves independently — same object, no drift.
  //
  // CONTESTED short-circuit: suppressions are disabled when classification is CONTESTED;
  // there are no applied rationales to check, so A2 has nothing to do.
  if (out.classificationConfidence === 'CONTESTED') {
    results.push({
      id: 'A2',
      status: 'PASS',
      detail: ['No suppressions applied (CONTESTED) — nothing to contradict.'],
    });
  } else {
    const foreign = FOREIGN_STRUCTURE_TERMS[out.dealType] ?? [];
    const a2Hits: string[] = [];

    // Only APPLIED suppressions carry a rationale that can contradict the classification.
    // LIVE_UNDER_STRUCTURE and DISABLED_CONTESTED items are not suppressed — not checked.
    const applied = out.resolved.filter(r => r.reason === 'APPLIED');
    for (const s of applied) {
      for (const re of foreign) {
        if (re.test(s.rationale)) {
          a2Hits.push(
            `"${s.item}": applied rationale "${s.rationale}" names a structure inconsistent with ${STRUCTURE_LABEL[out.dealType]}`
          );
          break;
        }
      }
    }

    a2Hits.length > 0
      ? fail('A2', a2Hits, 'Applied suppression rationale contradicts classified deal type. Update the matrix rationale for this structure, or re-examine the classification.')
      : pass('A2');
  }

  // A1 — severity contradiction: a suppressed item rated CRITICAL/HIGH in findings.
  const a1Hits: string[] = [];
  for (const s of out.suppressions.filter(x => x.applied)) {
    const hit = out.findings.find(
      f =>
        normalizeKey(f.topic) === normalizeKey(s.item) &&
        ['CRITICAL', 'HIGH'].includes(f.severity)
    );
    if (hit) {
      a1Hits.push(`"${s.item}" suppressed as not-critical, but rated ${hit.severity} in findings`);
    }
  }
  a1Hits.length > 0
    ? fail('A1', a1Hits, 'Un-suppress and surface at the highest stated severity. Suppression loses to an explicit critical finding.')
    : pass('A1');

  // CALIB — calibration coherence: leniency may come only from OMITTED rows.
  //
  // Replaces A3 and A4, which both used `netTierBump > 0` as a proxy for
  // "leniency touched the deal-breakers." That proxy was wrong post-L3-A:
  // a DNP deal with genuine OMITTED gaps legitimately has a positive bump (Tier 1
  // floor applied to incompleteness rows only) — A3 & A4 would both false-fail it.
  // They've only ever passed vacuously because every prior fixture was Tier 3
  // (bump = 0), so neither trigger ever fired.
  //
  // Invariant: if netTierBump > 0, then NO finding with disposition=ALLOCATED_ADVERSE
  // may be CRITICAL or HIGH. A bump is legitimate only when all CRITICAL/HIGH findings
  // are OMITTED rows (incompleteness mercy). If an ALLOCATED_ADVERSE CRITICAL/HIGH
  // finding coexists with a bump, the calibration arithmetic is incoherent.
  //
  // Note: per-row leniencyPoints are not yet emitted by L3-A (only the aggregate bump
  // is scraped from prose). This check is the correct maximum-precision assertion
  // achievable with current data. When per-row leniency is wired, this can be tightened
  // to verify bump == sum(OMITTED leniencyPoints) exactly.
  if (out.netTierBump > 0) {
    const adverseHighCrit = out.findings.filter(
      f => f.disposition === 'ALLOCATED_ADVERSE' && (f.severity === 'CRITICAL' || f.severity === 'HIGH')
    );
    adverseHighCrit.length > 0
      ? fail('CALIB', adverseHighCrit.map(f =>
          `${f.topic} is ALLOCATED_ADVERSE/${f.severity} but netTierBump=${out.netTierBump} — leniency cannot apply to adversely-positioned deal-breakers`
        ), 'Recompute calibration: leniency (Tier floor) may only come from OMITTED rows. ALLOCATED_ADVERSE criticals must not receive any bump.')
      : pass('CALIB');
  } else {
    pass('CALIB');
  }

  // A5 — no structure-keyed suppression on a CONTESTED classification.
  if (out.classificationConfidence === 'CONTESTED') {
    const a5Hits = out.suppressions
      .filter(s => s.applied && STRUCTURE_KEYED_SUPPRESSIONS.some(k => normalizeKey(k) === normalizeKey(s.item)))
      .map(s => `"${s.item}" suppressed despite CONTESTED deal-type classification`);
    a5Hits.length > 0
      ? fail('A5', a5Hits, 'Disable structure-keyed suppression; evaluate worst-case across all candidate structures.')
      : pass('A5');
  } else {
    pass('A5');
  }

  const conflicts = results.filter(r => r.status === 'FAIL');
  return { results, conflicts, clean: conflicts.length === 0 };
}

/**
 * Render the reconciler result table as a loggable string.
 * Replaces the LLM's self-judged "No conflicts identified" line with
 * a verifiable, code-produced claim.
 */
export function formatReconcilerResult(r: ReconcilerResult): string {
  const rows = r.results.map(c => {
    if (c.status === 'PASS') return `  ${c.id}: PASS`;
    return [
      `  ${c.id}: FAIL`,
      ...(c.detail ?? []).map(d => `    → ${d}`),
      `    FIX: ${c.fix ?? '(see rule)'}`,
    ].join('\n');
  });
  const header = r.clean
    ? '[RECONCILER] All checks PASS — no cross-layer conflicts.'
    : `[RECONCILER] ${r.conflicts.length} conflict(s) detected:`;
  return [header, ...rows].join('\n');
}

// ─── DEAL-TYPE CLASSIFICATION RENDERER ──────────────────────────────────────
// Renders the DEAL-TYPE CLASSIFICATION section from structured data.
// This replaces the LLM-authored block in the Adjudicator report — same pattern
// as the L3-B reconciler. The LLM is never asked to author suppression decisions;
// it just writes "[SYSTEM-RENDERED...]" as a placeholder which we replace here.

export interface DealTypeState {
  dealType: DealType;
  classificationConfidence: ClassificationConfidence;
  candidateStructures?: string[];  // present when MEDIUM or CONTESTED
}

// Per-item suppression state by deal type.
// LIVE = risk is present and must be evaluated.
// SUPPRESSED = risk is eliminated by deal structure; reason given.
type SuppressionDisposition = 'LIVE' | 'SUPPRESSED';

interface SuppressionRow {
  item: string;
  disposition: Record<DealType, SuppressionDisposition>;
  suppressedReason: Record<DealType, string>;   // shown when SUPPRESSED
  liveReason: Record<DealType, string>;          // shown when LIVE
}

const SUPPRESSION_MATRIX: SuppressionRow[] = [
  {
    item: 'TSA Absence as Critical',
    disposition: {
      STATUTORY_MERGER:  'SUPPRESSED',
      EQUITY_PURCHASE:   'SUPPRESSED',
      ASSET_PURCHASE:    'LIVE',
    },
    suppressedReason: {
      STATUTORY_MERGER: 'Merger — acquirer absorbs operations by law; no TSA needed',
      EQUITY_PURCHASE:  'Equity acquisition of standalone entity — operations transfer in the entity',
      ASSET_PURCHASE:   '',   // not used
    },
    liveReason: {
      STATUTORY_MERGER: '',   // not used
      EQUITY_PURCHASE:  '',   // not used
      ASSET_PURCHASE:   'Asset purchase — operational continuity depends on transition services',
    },
  },
  {
    item: 'Source Code Escrow as Material Risk',
    disposition: {
      STATUTORY_MERGER:  'SUPPRESSED',
      EQUITY_PURCHASE:   'SUPPRESSED',
      ASSET_PURCHASE:    'LIVE',
    },
    suppressedReason: {
      STATUTORY_MERGER: 'Merger — IP transfers in entity; no escrow needed for acquirer access',
      EQUITY_PURCHASE:  '100% equity acquisition — IP already inside the acquired entity',
      ASSET_PURCHASE:   '',
    },
    liveReason: {
      STATUTORY_MERGER: '',
      EQUITY_PURCHASE:  '',
      ASSET_PURCHASE:   'Asset/licensing context — acquirer gets only enumerated assets; escrow protects against vendor failure',
    },
  },
  {
    item: '"Assumption of Liabilities" as Distinct Mechanism',
    disposition: {
      STATUTORY_MERGER:  'SUPPRESSED',
      EQUITY_PURCHASE:   'SUPPRESSED',
      ASSET_PURCHASE:    'LIVE',
    },
    suppressedReason: {
      STATUTORY_MERGER: 'Merger — liabilities remain in the surviving entity by operation of law',
      EQUITY_PURCHASE:  'Equity deal — liabilities remain in the acquired entity by operation of law',
      ASSET_PURCHASE:   '',
    },
    liveReason: {
      STATUTORY_MERGER: '',
      EQUITY_PURCHASE:  '',
      ASSET_PURCHASE:   'Asset purchase — only expressly assumed liabilities transfer; scope must be explicit',
    },
  },
];

const STRUCTURE_DISPLAY_NAME: Record<DealType, string> = {
  STATUTORY_MERGER: 'Statutory Merger',
  EQUITY_PURCHASE:  'Stock / Equity Purchase',
  ASSET_PURCHASE:   'Asset Purchase',
};

/**
 * Render the DEAL-TYPE CLASSIFICATION section as markdown.
 * Called deterministically from analyses.ts; replaces the LLM placeholder.
 */
export function renderDealTypeSection(state: DealTypeState): string {
  const { dealType, classificationConfidence, candidateStructures } = state;

  const lines: string[] = [];
  lines.push(`**Transaction Structure:** ${STRUCTURE_DISPLAY_NAME[dealType] ?? dealType}`);
  lines.push(`**Classification Confidence:** ${classificationConfidence}`);

  if (classificationConfidence === 'CONTESTED' || classificationConfidence === 'MEDIUM') {
    const candidates = candidateStructures?.length
      ? candidateStructures.map(s => STRUCTURE_DISPLAY_NAME[s as DealType] ?? s).join(', ')
      : 'N/A';
    lines.push(`**Candidate Structures:** ${candidates}`);
  }

  lines.push('');
  lines.push('**Structure-Keyed Suppression Rules:**');

  if (classificationConfidence === 'CONTESTED') {
    lines.push('');
    lines.push('> **DISABLED (CONTESTED)** — Classification confidence is CONTESTED; structure-keyed');
    lines.push('> suppressions cannot be safely applied. All three structure-keyed items are evaluated');
    lines.push('> as LIVE risks under worst-case assumptions across all candidate structures.');
    lines.push('');
    for (const row of SUPPRESSION_MATRIX) {
      lines.push(`- **${row.item}:** LIVE (worst-case — CONTESTED classification)`);
    }
  } else {
    lines.push('');
    for (const row of SUPPRESSION_MATRIX) {
      const disp = row.disposition[dealType];
      if (disp === 'SUPPRESSED') {
        const reason = row.suppressedReason[dealType];
        lines.push(`- **${row.item}:** SUPPRESSED — ${reason}`);
      } else {
        const reason = row.liveReason[dealType];
        lines.push(`- **${row.item}:** LIVE — ${reason}`);
      }
    }
  }

  return lines.join('\n');
}
// ────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// RENDER-TIME SCAFFOLDING GUARD (Part 3 — checklist leak tripwire)
// Run on the assembled checklist section before report is finalized.
// Non-empty result = a raw instruction fragment leaked through; log and strip.
// ─────────────────────────────────────────────────────────────────────────────
const SCAFFOLD_MARKERS: RegExp[] = [
  /Assessment\s+\u2014\s+(?:mandatory elements|note every|compare cure|if earnout|state direction|apply jurisdiction)/i,
  /if earnout formula not in text/i,
  /apply jurisdiction-specific analysis/i,
  /mandatory elements:/i,
  /Who is bound\? Entity only/i,
  /note every knowledge qualifier/i,
  /compare cure periods for each party/i,
  /Governing law state\s+\u2014\s+apply/i,
  /California: near-total ban on non-competes/i,
  /\u00a7542\.335/,          // Florida statute fragment
  /state direction, security, caps, survival/i,
  /state \"Economic engine incomplete\"/i,
];

/**
 * Returns array of leak signatures found in `renderedSection`.
 * Empty array = clean. Non-empty = scaffolding leaked.
 * Strips the leaking lines from the section as a side-effect defense.
 */
export function assertNoScaffolding(renderedSection: string): string[] {
  return SCAFFOLD_MARKERS
    .filter(re => re.test(renderedSection))
    .map(re => re.source);
}

/**
 * Strip any line containing a scaffolding marker from the section.
 * Use when you want to ship a degraded-but-clean output rather than throw.
 */
export function stripScaffolding(renderedSection: string): { cleaned: string; leaks: string[] } {
  const leaks = assertNoScaffolding(renderedSection);
  if (leaks.length === 0) return { cleaned: renderedSection, leaks: [] };
  const lines = renderedSection.split('\n');
  const cleaned = lines
    .filter(line => !SCAFFOLD_MARKERS.some(re => re.test(line)))
    .join('\n');
  return { cleaned, leaks };
}

