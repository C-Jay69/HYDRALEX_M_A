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
export const MODELS = {
  analyst: "google/gemini-2.5-flash",
  critic: "google/gemini-2.5-flash-lite",
  adjudicator: "google/gemini-2.0-flash-001",
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
export const MA_CRITERIA = `
════════════════════════════════════════════════════════════════════════════════
STEP 1: DEAL-TYPE CLASSIFICATION + INDUSTRY DETECTION (Run FIRST before any other analysis)
════════════════════════════════════════════════════════════════════════════════

STEP 1A — DEAL-TYPE ONTOLOGY (CRITICAL — shapes all downstream analysis):
Identify the transaction structure from the contract text. This is mandatory because
issues that are CRITICAL in one deal type are NON-ISSUES in another.

DEAL TYPE TRIGGERS:
• STOCK / EQUITY PURCHASE: Buyer purchases shares, membership interests, or equity
  (100% or controlling stake) of a standalone entity. Keywords: "membership interests,"
  "shares," "equity interests," "stock purchase."
  → In a 100% equity acquisition: ALL liabilities remain in the entity by law.
    There is NO "assumption of liabilities" mechanism as in an asset purchase.
    "Buyer Suicide Pill" framing for equity deals requires different analysis.
  → TSA is typically NOT required for standalone entity acquisitions — the legal
    entity, employees, systems, and contracts all remain intact post-close.
  → Source code escrow is typically irrelevant — Buyer OWNS the entire entity
    including all IP, code, and systems. Escrow serves licensing/SaaS vendor
    continuity purposes, not equity acquisition purposes.

• ASSET PURCHASE: Buyer purchases specific named assets; liabilities are explicitly
  assumed or excluded. Keywords: "purchased assets," "excluded assets," "assumed
  liabilities," "excluded liabilities."
  → Assumption of liabilities IS a distinct legal mechanism and must be analyzed.
  → TSA is frequently critical — entity survives as seller, not as buyer.
  → Source code escrow may be appropriate if IP is being licensed back.

• MERGER (statutory): Forward/reverse/triangular merger. Entity ceases to exist or
  is absorbed. All assets and liabilities transfer by operation of law.
  → Keywords: "merged with and into," "surviving corporation," "merger consideration,"
    "Articles/Certificate of Merger," "Plan of Merger," "appraisal rights."
  → CRITICAL DISTINCTION from Stock Purchase: In a statutory merger, the agreement
    IS the operative transfer mechanism. All liabilities of the merged entity transfer
    by operation of law WITHOUT a separate "assumption of liabilities" clause.
  → MERGER-SPECIFIC checks mandatory: appraisal rights (dissenting shareholders);
    shareholder vote requirements; board approval sufficiency; Section 368 tax-free
    reorganization status (if applicable); surviving entity identity and obligations.
  → Do NOT confuse with stock purchase. If "merger" language is present, classify
    as MERGER — not stock purchase — even if some equity/share transfer language exists.
  → Indemnification in merger agreements flows from the merger agreement itself;
    survival of reps and post-close indemnity requires explicit survival clause —
    unlike in equity purchases where reps survive automatically pending agreement terms.

• CARVE-OUT / DIVISIONAL SALE: Partial business or division extracted from parent.
  → TSA almost always critical — shared systems, employees, and infrastructure.
  → Often asset-purchase mechanics even if structured as equity.

• ACQUIHIRE: Talent-focused, IP may be secondary. Employment agreements are
  the primary economic instrument.

• PE ROLLOVER / RECAPITALIZATION: Seller retains equity stake. Alignment analysis
  critical — Seller becomes partner, not counterparty.

• DISTRESSED / CREDIT BID: Section 363 or out-of-court workout. Credit bid
  mechanics, free-and-clear transfer, cure costs.

CONTEXTUAL SUPPRESSION RULES (apply based on detected deal type):
IF STOCK/EQUITY PURCHASE (100% standalone entity):
  ✗ Do NOT flag "assumption of liabilities" as a structural defect (liabilities
    stay with entity automatically — no separate mechanism needed)
  ✗ Do NOT flag absence of TSA as critical unless the entity is part of a larger
    group sharing infrastructure, systems, or personnel with the seller parent
  ✗ Do NOT flag absence of source code escrow as a material risk (Buyer owns
    the entity and all its IP/code; escrow is a vendor-continuity tool, not
    an acquisition protection)
  ✓ DO analyze indemnification as the primary post-close protection mechanism
  ✓ DO analyze representations quality as the core risk layer

IF ASSET PURCHASE:
  ✓ Assumption of liabilities IS a distinct mechanism — analyze carefully
  ✓ TSA IS frequently critical — flag if absent
  ✓ Source code escrow may be appropriate — analyze in context

STEP 1B — INDUSTRY DETECTION:
Extract company names, business descriptions, product/service mentions and match
against the following vertical trigger libraries. Assign ALL matching verticals.
If no match → apply Generic checklist + flag for human review.

VERTICAL TRIGGERS:
• TECH/SAAS: Software, SaaS, Tech, Digital, AI, ML, Cloud, Data, Platform, App,
  Systems, Solutions, Cyber, Network, Internet, Mobile, API, Analytics, Automation
• MANUFACTURING/AEROSPACE: Manufacturing, Industrial, Aerospace, Automotive,
  Defense, Fabrication, Assembly, Production, Plant, Factory, Equipment, Machinery,
  Components, Parts, Engineering, Precision, Metal, Chemical, Processing
• HEALTHCARE/PHARMA: Health, Medical, Pharma, Biotech, Clinical, Hospital,
  Therapy, Drug, Device, Diagnostic, Lab, Patient, Care, Surgical, Dental,
  Life Sciences, Genomic, Behavioral
• FINANCIAL SERVICES: Financial, Finance, Bank, Insurance, Investment, Securities,
  Asset Management, Wealth, Credit, Lending, Mortgage, Fintech, Payment, Capital,
  Fund, Broker, Advisor, Trading, Exchange, Clearing, Custody, Trust, Leasing
• REAL ESTATE: Real Estate, Property, REIT, Development, Construction, Residential,
  Commercial, Retail, Office, Hospitality, Hotel, Multifamily, Housing, Land,
  Property Management, Title

════════════════════════════════════════════════════════════════════════════════
PART A — STANDARD M&A CHECKLIST (10 POINTS — ALL DEALS)
════════════════════════════════════════════════════════════════════════════════

1. DEFINITIONS & RECITALS
   - Vague definitions, especially "Material Adverse Effect/Change" (MAE/MAC)
   - Scope and carve-outs of MAE definition
   - "Knowledge" definition: which individuals, inquiry duty? If undefined → AMBIGUOUS
   - "Permitted Liens": used in title reps but undefined? → AMBIGUOUS

2. PURCHASE PRICE & CONSIDERATION
   - Earnout ambiguities: is the EXACT formula (thresholds, %, tiers) IN THE TEXT?
     If referenced procedurally but no numbers → INCOMPLETE, not "standard"
   - Purchase price adjustment mechanisms
   - Working capital target, peg, and post-closing true-up methodology
   - Escrow amounts and release conditions
   - Does "good faith operation" covenant secretly restrict Buyer integration?
     (e.g., requiring separate division accounting, staffing floors, capex floors)

3. REPRESENTATIONS & WARRANTIES
   Seller Reps: Organization, Capitalization, Financials, Taxes, Material Contracts,
   IP, Data Privacy/Cybersecurity, Litigation
   Buyer Reps: Authority, Financing/Certain Funds
   - Inappropriate materiality/knowledge qualifiers
   - For EVERY rep ask: "If this rep is false, can Buyer actually recover?"
     Check whether Art. VII limits indemnity to "actual knowledge" or "Knowledge of
     Seller" — qualifiers that neuter the rep entirely
   - Check if Section 7.5 (Exclusive Remedy) or Buyer's "Independent Investigation"
     clause eliminates recourse for fraud or breach
   - Disclosure schedule adequacy

4. COVENANTS
   - Pre-closing ordinary course of business covenants
   - Negative covenants (restrictions on seller pre-closing)
   - Post-closing obligations and integration covenants

5. CONDITIONS TO CLOSING
   - Regulatory approvals (antitrust/HSR)
   - Third-party consents required
   - Accuracy of reps bring-down conditions
   - No MAE/MAC closing condition

6. INDEMNIFICATION
   - Identify total consideration, then explicitly check for: escrow, holdback,
     setoff rights against earnout, RWI, or any other security for indemnity
   - If NONE exist → flag CRITICAL: "Unsecured indemnity; Seller may distribute
     proceeds and become judgment-proof"
   - Survival periods for reps & warranties
   - Baskets: tipping basket vs. true deductible
   - Caps (general cap, special rep caps)
   - Carve-outs from caps (fraud, fundamental reps)
   - Indemnity DIRECTION: does Buyer end up indemnifying Seller for Seller's own
     pre-closing conduct? Check every indemnity clause for direction reversals

7. TERMINATION PROVISIONS
   - Compare cure periods for EACH PARTY — flag any asymmetry
   - Drop-dead/outside date
   - Break-up fees (target termination fee) — is it the "sole and exclusive remedy"?
   - Reverse break-up fees — do they adequately protect seller if Buyer walks?
   - Specific performance availability

8. EXCLUSIVITY / NON-COMPETITION
   - No-shop / go-shop clauses
   - Fiduciary out provisions
   - Post-closing non-competes: duration and geographic scope
   - Are individual owners/members SIGNATORIES to the non-compete, or just the entity?
     If entity only → ENFORCEABILITY RISK
   - Non-solicitation provisions (employees AND customers)

9. BOILERPLATE — MANDATORY NAMED CHECKS (ALL MUST BE REPORTED EXPLICITLY)
   Run EACH of the following and report "Present" or "Not found in this document":
   □ OUTSIDE CLOSING DATE: Is there a defined drop-dead / outside date by which
     closing must occur or either party may terminate? Absent → flag as missing.
   □ TERMINATION CLAUSE: Are termination rights for both parties explicitly stated
     (material breach cure periods, outside date trigger, regulatory failure, etc.)?
     Absent → "Termination provisions not drafted."
   □ ENTIRE AGREEMENT CLAUSE: Is there a merger / integration clause confirming
     this agreement supersedes all prior understandings? Absent → flag.
   □ AMENDMENT & WAIVER CLAUSE: Is there a written-amendment requirement? Absent
     → flag as potentially allowing oral modification.
   □ GOVERNING LAW — check for SPLIT governing law (different articles governed
     by different jurisdictions).
   □ DISPUTE RESOLUTION: check for missing elements — rules, emergency injunctive
     relief carveout, confidentiality, fee-shifting, arbitrator qualifications,
     enforceability of awards.
   □ NON-RELIANCE AND EXCLUSIVE REMEDY CLAUSES.
   □ ASSIGNMENT RESTRICTIONS.
   □ SEVERABILITY CLAUSE: Is there a provision preserving the remainder of the
     agreement if any single provision is held unenforceable? Absent → flag.
   □ COUNTERPARTS / ELECTRONIC SIGNATURE CLAUSE: Does the agreement expressly
     permit execution in counterparts and/or electronic signatures (DocuSign,
     PDF)? Absent in a Tier 3+ agreement → flag as potential closing mechanics gap.
   □ NOTICES CLAUSE: Is there a formal notices provision specifying delivery
     method (overnight courier, email with receipt), addresses, and effective
     date of notice? Absent → flag as "Notice mechanics undefined — may affect
     breach cure periods and termination triggers."

   FORMATTING & DUPLICATION CHECK (run against document structure):
   - Scan for duplicate section headings or repeated text blocks.
   - Scan for duplicate article/section numbers (e.g., two "Section 1.2" headings).
   - If duplication found → flag as "DRAFTING QUALITY ISSUE — duplicate sections
     suggest lack of final review; document may not be execution-ready."
   - Document formatting errors do NOT increase severity scores but must be reported
     as they signal document immaturity or unintentional copy-paste errors.

10. RWI (REPRESENTATIONS & WARRANTIES INSURANCE)
    - Whether RWI is mentioned or contemplated
    - Retention amounts relative to deal size
    - Underwriting exclusions and their impact
    - Interaction with indemnification provisions

════════════════════════════════════════════════════════════════════════════════
PART B — ADVANCED CONTEXTUAL RISK CHECKS (MANDATORY — ALL 6 MUST RUN)
════════════════════════════════════════════════════════════════════════════════
IMPORTANT: These require active full-text scanning. Search ENTIRE contract for
trigger phrases. Each MUST be explicitly reported even if not found ("Not detected").

11. NEGATIVE WAIVERS OF CLOSING CONDITIONS — "The Forced Close Check"
    Scan ENTIRE contract for:
    • "shall not be grounds for termination"
    • "shall not constitute a Material Adverse Effect"
    • "waives the right to terminate"
    • "notwithstanding the foregoing" (in proximity to closing/termination)
    • "regardless of" (in proximity to termination or closing)
    • "not affect the obligation to close"
    If found → CRITICAL. Buyer is forced to close despite known/unknown liabilities.
    Interdependency: If waiver references a Schedule that is missing/blank/redacted
    → escalate: Buyer is accepting BLIND LIABILITY. Quote exact clause + schedule ref.

12. EMPLOYEE RETENTION DURATION — "The Brain Drain Check"
    Scan for retention, key person, or stay-bonus provisions.
    Under 12 months → MODERATE-TO-HIGH RISK
    No retention clause at all → HIGH RISK
    Report exact duration or "No retention clause found."

13. JURISDICTIONAL & VENUE MISMATCHES — "The Arbitrage Trap Check"
    Identify (a) governing law jurisdiction and (b) dispute resolution venue.
    Flag if: offshore/tax-haven governing law (BVI, Cayman, Isle of Man, Jersey,
    Bermuda, Panama, Marshall Islands); or governing law and venue are in different
    countries; or venue is geographically distant/expensive vs. parties' operations.
    → MODERATE RISK. Quote both clauses exactly.

14. LIQUIDATED DAMAGES ENFORCEABILITY — "The Penalty Clause Check"
    Scan for fixed dollar amounts per incident/breach not accompanied by a
    calculation methodology as genuine pre-estimate of anticipated loss.
    → MODERATE RISK. Quote exact clause and amount. Note if methodology exists.

15. VAGUE QUALIFYING LANGUAGE IN R&W — "The Weasel Word Deep Scan"
    Scan ALL reps & warranties for:
    • "substantial compliance" / "substantially complies"
    • "material compliance" / "materially complies"
    • "believed to be protected" (especially IP)
    • "believed to be in compliance"
    • "to the best of our knowledge" (no knowledge definition → AMBIGUOUS)
    • "to our knowledge" without defined knowledge standard
    • "in all material respects" in compliance reps
    • "does not believe" / "is not aware" as substitutes for actual rep
    IP/compliance reps → CRITICAL. Elsewhere → MODERATE.
    List EVERY instance with the specific phrase and section.

16. DATA DESTRUCTION ACKNOWLEDGMENTS — "The Spoliation Check"
    Scan entire contract for:
    • "data migration" / "unrecoverable data" / "unrecoverable records"
    • "acknowledges missing records" / "acknowledges data loss"
    • "historical data not available" / "records destroyed" / "records unavailable"
    • "data not preserved" / "legacy system" (in context of data unavailability)
    If found → HIGH RISK. Quote exact language. Identify which party acknowledges.

════════════════════════════════════════════════════════════════════════════════
PART C — 12 CRITICAL RED FLAGS (VERIFY ALL BEFORE FINALIZING OUTPUT)
════════════════════════════════════════════════════════════════════════════════
Before finalizing, explicitly verify each. If absent or unfavorable → CRITICAL:

RF-01: ENVIRONMENTAL INDEMNITY DIRECTION
  Who indemnifies for pre-Closing environmental liabilities? If Buyer indemnifies
  Seller for unknown pre-Closing environmental issues → CRITICAL
  Check "as is, where is" + environmental reps (knowledge-qualified?) + whether
  Buyer has SEPARATELY indemnified Seller for environmental issues. Combination = TOXIC.

RF-02: EARNOUT ECONOMIC ENGINE
  Is the earnout formula (thresholds, %, tiers, payout schedule) ACTUALLY IN THE TEXT?
  Described procedurally but no numbers → INCOMPLETE (do NOT call it "well-defined")

RF-03: SECURITY FOR INDEMNITY
  Escrow, holdback, RWI, or setoff right? If none → CRITICAL:
  "Unsecured indemnity; Seller may become judgment-proof"

RF-04: WORKING CAPITAL ADJUSTMENT
  Target working capital, closing balance sheet, post-closing true-up? 
  If absent in going-concern asset purchase → MAJOR

RF-05: TAX ALLOCATION CONTROL
  Who controls Section 1060 allocation? Who prepares it? Who must file consistently?
  If one party controls unilaterally → MAJOR: "Unilateral tax allocation control"

RF-06: BULK SALES / CREDITOR PROTECTION
  Is bulk sales compliance waived? Who indemnifies for resulting creditor liability?
  If Buyer indemnifies Seller for bulk sales creditor claims → MAJOR

RF-07: TERMINATION ASYMMETRY
  Unequal cure periods or one-sided break fees? Flag every asymmetry specifically.

RF-08: NON-COMPETE BINDING PARTIES
  Are individual owners/members signatories to non-compete, or just the entity?
  Entity only → ENFORCEABILITY RISK

RF-09: KNOWLEDGE DEFINITION
  Is "Knowledge," "actual knowledge," or "Knowledge of Seller" defined (which
  individuals, inquiry duty)? If undefined → AMBIGUOUS

RF-10: PERMITTED LIENS DEFINITION
  Is "Permitted Liens" defined? Used in title reps but undefined → AMBIGUOUS

RF-11: INDUSTRY-SPECIFIC REPS (apply matching vertical checklist from Part D)
  Check for vertical-appropriate reps. Missing industry-specific reps → INDUSTRY GAP

RF-12: INSURANCE / TAIL COVERAGE
  Reps about insurance policies, coverage amounts, tail coverage for pre-Closing
  events? Missing → MODERATE

RF-13: POST-SIGNING DILIGENCE-OUT SEVERITY
  Scan for any Buyer right to terminate based on diligence results POST-signing.
  Pre-signing diligence outs are standard. Post-signing unrestricted diligence outs
  are EXTREMELY UNUSUAL in signed M&A and represent a structural defect:
  • Seller has false deal certainty — spends time, money, and foregoes other buyers
  • Buyer can cherry-pick, negotiate down, or walk without reverse break fee
  • Economically equivalent to an option agreement, not a binding purchase contract
  If found → 🔴 STRUCTURAL DEFECT: "Post-signing diligence out eliminates deal certainty"
  Quote exact trigger language. Confirm whether reverse break fee applies if exercised.

RF-14: ARBITRATION ECONOMICS — "The Dead Letter Indemnity Check"
  Identify arbitration structure: single vs. three arbitrators, JAMS/AAA/other,
  cost allocation, discovery scope, timeline.
  Three-arbitrator JAMS M&A panel: ~$500K–$2M in arbitration fees + legal costs.
  Impact: Claims under $1–2M may be economically irrational to pursue.
  If arbitration economics make small/mid-size indemnity claims impractical:
  → Flag as MATERIAL ECONOMIC DEFECT: "Arbitration structure effectively nullifies
    indemnity rights for claims under $[X]M"
  Fix: Single arbitrator for disputes under $1M, fee-shifting for prevailing party,
  or expedited rules for smaller claims.

════════════════════════════════════════════════════════════════════════════════
PART D — VERTICAL-SPECIFIC CHECKLISTS (25 items each — apply to detected vertical)
════════════════════════════════════════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERTICAL: TECH / SAAS / SOFTWARE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IP & TECHNOLOGY:
TECH-IP-01: IP OWNERSHIP CHAIN — rep that ALL IP is owned (not licensed) by Seller?
  Contractor/employee IP assignment agreements covered? Missing → CRITICAL
  (Developers may retain IP if assignment agreements were never signed)
TECH-IP-02: OPEN SOURCE COMPLIANCE — rep confirming no copyleft contamination?
  (GPL/AGPL can force Buyer to make proprietary code public) Missing → CRITICAL
TECH-IP-03: SOURCE CODE ESCROW — arrangement for SaaS products?
  ⚠ DEAL-TYPE GATE: ONLY flag in licensing deals, strategic partnerships, vendor
  arrangements, or asset purchases where IP is being licensed back to seller.
  In a 100% equity acquisition of a standalone SaaS company: DO NOT FLAG —
  Buyer owns the entire entity and all code. Escrow is irrelevant.
  Missing in licensing/asset context → HIGH. Missing in full equity acquisition → NON-ISSUE.
TECH-IP-04: PATENT ENCUMBRANCES — freedom-to-operate reps? Pending patent
  litigation? Missing → HIGH
TECH-IP-05: TRADEMARK/BRAND OWNERSHIP — trademarks registered and uncontested?
  Missing → MEDIUM

DATA PRIVACY & CYBERSECURITY:
TECH-DATA-01: GDPR/CCPA COMPLIANCE REP — applicable data privacy laws covered?
  Missing → CRITICAL (post-close GDPR fines = 4% of global annual revenue)
TECH-DATA-02: DATA BREACH HISTORY — no unreported breaches last 3-5 years?
  State notification obligations covered? Missing → CRITICAL
TECH-DATA-03: CYBERSECURITY POSTURE — SOC 2, ISO 27001, NIST compliance?
  Missing → HIGH
TECH-DATA-04: CUSTOMER DATA TRANSFERABILITY — do customer contracts permit
  transfer of data to Buyer? Privacy policies permit transfer? Missing → CRITICAL
TECH-DATA-05: THIRD PARTY DATA LICENSES — third-party data sets transferable?
  Missing → HIGH

SAAS-SPECIFIC:
TECH-SAAS-01: RECURRING REVENUE QUALITY — MRR/ARR verified by rep? Churn rate
  disclosed? Missing → CRITICAL (SaaS valuation = multiple of ARR)
TECH-SAAS-02: CUSTOMER CONTRACT ASSIGNABILITY — change-of-control termination
  rights in SaaS subscriptions? Missing → CRITICAL
TECH-SAAS-03: HOSTING/INFRASTRUCTURE — AWS/Azure/GCP agreements assignable?
  Volume commitment penalties on transfer? Missing → HIGH
TECH-SAAS-04: SOFTWARE LICENSE AGREEMENTS — third-party licenses transferable?
  Per-seat repricing risk? Missing → HIGH
TECH-SAAS-05: UPTIME/SLA OBLIGATIONS — SLA commitments and financial penalties
  surviving to Buyer? Missing → MEDIUM

EMPLOYMENT:
TECH-EMP-01: KEY DEVELOPER RETENTION — key engineers on retention agreements?
  Missing → CRITICAL (the product IS the people)
TECH-EMP-02: NON-SOLICITATION OF EMPLOYEES — non-compete covers employees?
  Missing → HIGH
TECH-EMP-03: VISA/IMMIGRATION STATUS — H-1B or work visa employees requiring
  re-sponsorship post-acquisition? Missing → HIGH

FINANCIALS:
TECH-FIN-01: REVENUE RECOGNITION POLICY — contract signing vs. delivery?
  Deferred revenue in working capital? Missing → HIGH
TECH-FIN-02: CUSTOMER CONCENTRATION — >30% from single customer → CRITICAL
TECH-FIN-03: CAPITALIZED SOFTWARE COSTS — R&D capitalized vs. expensed?
  Impacts EBITDA and valuation multiples. Missing → HIGH

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERTICAL: MANUFACTURING / INDUSTRIAL / AEROSPACE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENVIRONMENTAL:
MFG-ENV-01: PHASE I/II ENVIRONMENTAL — completed? If Phase I flagged issues,
  Phase II done? Missing → CRITICAL (cleanup costs can exceed deal value)
MFG-ENV-02: HAZARDOUS MATERIALS INVENTORY — complete inventory + historical
  disposal records? Missing → CRITICAL
MFG-ENV-03: ENVIRONMENTAL PERMITS — all permits listed and transferable?
  Air/water/waste permits? Missing → CRITICAL
MFG-ENV-04: PRE-CLOSING ENVIRONMENTAL LIABILITY ALLOCATION — clearly allocated
  to Seller? Limited only to "identified" contamination?
  If yes → CRITICAL (unknown contamination falls on Buyer)
MFG-ENV-05: ENVIRONMENTAL INDEMNITY SURVIVAL — survives beyond standard rep
  survival? Should survive to applicable statute of limitations. Missing → HIGH

REGULATORY:
MFG-REG-01: GOVERNMENT CONTRACTS — FAR/DFARS compliance? Government contracts
  assignable (often require agency consent)? Missing → CRITICAL
MFG-REG-02: AEROSPACE/DEFENSE CERTIFICATIONS — FAA (Part 145, Part 21)?
  AS9100/ISO 9001? ITAR/EAR export controls? Missing → CRITICAL
  (Certifications may not transfer automatically)
MFG-REG-03: OSHA COMPLIANCE — 5-year violation history? Pending investigations?
  Missing → HIGH
MFG-REG-04: PRODUCT LIABILITY — claims or recalls? Tail coverage? Missing → HIGH

PHYSICAL ASSETS:
MFG-ASSET-01: EQUIPMENT CONDITION — independent appraisal? Deferred maintenance
  quantified? Missing → HIGH
MFG-ASSET-02: EQUIPMENT LIENS — UCC lien search on major equipment? Leased vs.
  owned clearly identified? Missing → HIGH
MFG-ASSET-03: REAL PROPERTY — environmental condition verified? Lease assignments
  confirmed? Missing → HIGH
MFG-ASSET-04: CAPEX REQUIREMENTS — near-term capex disclosed? Equipment at end
  of useful life? Missing → MEDIUM

SUPPLY CHAIN:
MFG-SUP-01: SOLE SOURCE SUPPLIER RISK — single-source critical components?
  Missing → HIGH
MFG-SUP-02: CUSTOMER RE-QUALIFICATION — do aerospace/automotive customers require
  re-qualification after ownership change? Missing → CRITICAL
  (Re-qualification = 6-18 months of inability to ship)
MFG-SUP-03: LONG-TERM SUPPLY AGREEMENTS — fixed-price contracts? Cost escalation
  clauses? Missing → MEDIUM

LABOR:
MFG-LAB-01: UNION/CBA STATUS — unionized? CBA assignable? Expiry date?
  Missing → CRITICAL
MFG-LAB-02: PENSION/DEFINED BENEFIT — defined benefit plans? Funding status?
  Missing → CRITICAL (underfunding transfers directly to Buyer)
MFG-LAB-03: WARN ACT — 60-day notice required if closure/mass layoff planned?
  Missing → HIGH

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERTICAL: HEALTHCARE / LIFE SCIENCES / PHARMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGULATORY:
HEALTH-REG-01: FDA COMPLIANCE — registration, inspection history, Warning Letters,
  483 Observations, consent decrees? Missing → CRITICAL
HEALTH-REG-02: DEA REGISTRATION — controlled substances? DEA registrations are
  NON-TRANSFERABLE (new registration required). Missing → CRITICAL
HEALTH-REG-03: STATE HEALTHCARE LICENSES — all licenses identified and
  transferability confirmed? Missing → CRITICAL
HEALTH-REG-04: MEDICARE/MEDICAID ENROLLMENT — CMS enrollment? OIG exclusions?
  CMS billing suspensions? Missing → CRITICAL (OIG exclusion = instant revenue loss)
HEALTH-REG-05: CERTIFICATE OF NEED — CON status and transfer requirements?
  Missing → HIGH

HIPAA & PATIENT DATA:
HEALTH-HIPAA-01: HIPAA COMPLIANCE PROGRAM — documented program? BAAs with all
  vendors? Missing → CRITICAL
HEALTH-HIPAA-02: PHI BREACH HISTORY — unreported breaches last 6 years? HHS OCR
  investigations? Missing → CRITICAL (up to $1.9M per violation category per year)
HEALTH-HIPAA-03: PATIENT DATA TRANSFERABILITY — records legally transferable?
  Patient notification requirements? Missing → CRITICAL
HEALTH-HIPAA-04: HIPAA INDEMNITY BOMB — scan indemnification article for any
  obligation to indemnify for "actual OR ALLEGED" HIPAA, privacy, or data violation.
  This is among the most dangerous provisions in healthcare M&A:
  • Post-close OCR investigations can emerge years after closing for pre-close violations
  • Cyber incidents trigger notification + class action exposure simultaneously
  • "Alleged" violations = indemnity trigger without proven breach
  • Uncapped version = unlimited post-close liability with no floor
  If found uncapped or with low cap → CRITICAL: "Quasi-regulatory indemnity bomb"
  Fix: (1) Cap at deal value or specific $ amount, (2) carve out allegations without merit, 
  (3) require buyer cooperation in defense, (4) sunset period aligned with OCR statute of limitations.

FRAUD & ABUSE:
HEALTH-FRAUD-01: STARK LAW — physician self-referral arrangements reviewed?
  Missing → CRITICAL (False Claims Act = treble damages + exclusion)
HEALTH-FRAUD-02: ANTI-KICKBACK STATUTE — financial relationships with referral
  sources reviewed? Missing → CRITICAL
HEALTH-FRAUD-03: FALSE CLAIMS ACT — qui tam/whistleblower actions pending?
  Missing → CRITICAL
HEALTH-FRAUD-04: GOVERNMENT INVESTIGATIONS — DOJ/HHS-OIG/state AG investigations
  last 5 years? Missing → CRITICAL

CLINICAL & PRODUCT:
HEALTH-CLIN-01: CLINICAL TRIAL AGREEMENTS — trials assignable? IRB approvals?
  Missing → HIGH
HEALTH-CLIN-02: DRUG/DEVICE APPROVALS — FDA 510(k)/PMA/NDA/ANDA transferable?
  Missing → CRITICAL
HEALTH-CLIN-03: PRODUCT LIABILITY/RECALL — recalls, MDRs, tail coverage?
  Missing → HIGH
HEALTH-CLIN-04: REIMBURSEMENT RISK — CPT code dependencies? Pending rate changes?
  Missing → HIGH

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERTICAL: FINANCIAL SERVICES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGULATORY LICENSES:
FIN-LIC-01: LICENSE INVENTORY — all licenses: OCC/Fed/FDIC/state banking; FINRA/SEC;
  state insurance; money transmitter. Missing → CRITICAL
FIN-LIC-02: CHANGE OF CONTROL APPROVALS — which licenses require regulatory
  approval? Timeline obtained? Missing → CRITICAL (banking M&A = 12-18 months)
FIN-LIC-03: EXAMINATION HISTORY — last 3 examination reports? Outstanding MRAs?
  Missing → CRITICAL
FIN-LIC-04: ENFORCEMENT ACTIONS — consent orders, C&D orders, MOUs, pending
  investigations? Missing → CRITICAL

CAPITAL & FINANCIAL:
FIN-CAP-01: REGULATORY CAPITAL ADEQUACY — meeting minimum requirements? Capital
  impact of transaction? Missing → CRITICAL
FIN-CAP-02: LOAN PORTFOLIO QUALITY — NPL ratio, loan loss reserves, classified
  assets? Missing → CRITICAL
FIN-CAP-03: RESERVE ADEQUACY (Insurance) — actuarial certification? Reserve
  strengthening last 3 years? Missing → CRITICAL
FIN-CAP-04: LIQUIDITY POSITION — LCR, contingent funding? Missing → HIGH

AML & COMPLIANCE:
FIN-AML-01: BSA/AML PROGRAM — documented program? SAR history? FinCEN exams?
  Missing → CRITICAL (DOJ has prosecuted acquirers for inherited AML failures)
FIN-AML-02: SANCTIONS/OFAC — OFAC compliance program? SDN list customers?
  Missing → CRITICAL
FIN-AML-03: CRA COMPLIANCE — CRA rating? Poor rating can block acquisition.
  Missing → HIGH
FIN-AML-04: CONSUMER PROTECTION — CFPB history? UDAAP violations?
  Missing → HIGH

PORTFOLIO:
FIN-PORT-01: CUSTOMER ACCOUNT TRANSFERABILITY — assignment rights? Change-of-
  control notifications? Missing → HIGH
FIN-PORT-02: ALGORITHMIC/MODEL RISK — proprietary models? Validation docs?
  Missing → HIGH
FIN-PORT-03: COUNTERPARTY AGREEMENTS — ISDA Master Agreements change-of-control?
  Prime brokerage assignability? Missing → HIGH

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERTICAL: REAL ESTATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TITLE & OWNERSHIP:
RE-TITLE-01: TITLE INSURANCE — current commitments for all properties? Unacceptable
  exceptions? Missing → CRITICAL
RE-TITLE-02: SURVEY — current ALTA surveys? Encroachments, easements, boundary
  disputes? Missing → HIGH
RE-TITLE-03: OWNERSHIP CHAIN — complete chain of title? Gaps or breaks?
  Missing → CRITICAL
RE-TITLE-04: LIEN SEARCHES — UCC, tax lien, judgment lien, mechanics' liens?
  Missing → CRITICAL

ENVIRONMENTAL:
RE-ENV-01: PHASE I/II ASSESSMENTS — current (within 6 months)? RECs identified?
  Missing → CRITICAL
RE-ENV-02: ASBESTOS/LEAD PAINT — ACM survey? Lead paint for pre-1978 buildings?
  Missing → HIGH
RE-ENV-03: UNDERGROUND STORAGE TANKS — USTs present or historical? Closure docs?
  Missing → HIGH
RE-ENV-04: WETLANDS/ZONING — Army Corps permits? Zoning compliance for current use?
  Missing → HIGH

LEASES & TENANTS:
RE-LEASE-01: LEASE ABSTRACT REVIEW — all leases abstracted? Key terms verified?
  Missing → HIGH
RE-LEASE-02: CHANGE OF CONTROL PROVISIONS — tenant change-of-control termination
  rights? Missing → CRITICAL
RE-LEASE-03: TENANT ESTOPPELS — estoppel certificates from all major tenants?
  Landlord defaults alleged? Missing → HIGH
RE-LEASE-04: RENT ROLL VERIFICATION — independently verified against bank deposits?
  Concessions, deferrals, abatements in place? Missing → HIGH

CONSTRUCTION:
RE-CON-01: CONSTRUCTION CONTRACTS — GMP or fixed-price? Completion guarantees?
  Missing → HIGH
RE-CON-02: PERMITS & APPROVALS — all building permits obtained? Certificates of
  occupancy for completed buildings? Missing → CRITICAL
RE-CON-03: CONSTRUCTION DEFECT HISTORY — defect claims or litigation? Builder's
  risk tail coverage? Missing → HIGH

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UNIVERSAL CROSS-VERTICAL CHECKS (always run regardless of vertical)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ Asset/Business Definition complete? → CRITICAL if absent
□ Excluded Liabilities clearly enumerated? → CRITICAL if absent
□ Termination Rights for both parties? → CRITICAL if absent
□ Fraud Carve-Out from exclusive remedy/caps? → CRITICAL if absent
□ Governing Law (single, not split)? → HIGH if split
□ Working Capital Adjustment mechanism? → HIGH if absent
□ Tiered Survival Periods (fundamental / standard / general)? → HIGH if absent
□ Fundamental Rep Definition (capitalization, authority, title)? → HIGH if absent
□ Employee/HR Provisions? → HIGH if absent
□ Dispute Resolution with all required elements? → MEDIUM if absent
□ Insurance/Tail Coverage reps? → HIGH if absent
□ Non-Solicitation of employees AND customers? → MEDIUM if absent

FIVE SUPPLEMENTAL CHECKS (always run — report explicitly for each):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUPP-01: COVENANT GAP CHECK
  Does the agreement contain affirmative covenants (e.g., conduct of business
  pre-closing, access to information rights, notification obligations)?
  If none → flag as "Bare bones — no operational guardrails between signing and closing."
  Note: In a Tier 1 skeleton this is incompleteness. In Tier 3+, this is a gap.

SUPP-02: DEFINITION COMPLETENESS CHECK
  Verify presence of each must-have M&A definition. Report Present/Absent for each:
  • Material Adverse Effect (MAE/MAC)
  • Knowledge (and specifically whose knowledge — defined individuals?)
  • Permitted Liens
  • Closing Date / Effective Time
  • Purchaser / Seller / Target (all properly defined and used consistently?)
  If >2 of the above are absent in a Tier 3+ agreement → flag:
  "Definitionally incomplete — high ambiguity risk; undefined terms will be
  interpreted by a court without party guidance."

SUPP-03: SURVIVAL PERIOD EXPLICIT CHECK
  Are survival periods for reps & warranties STATED in the agreement?
  If not → flag: "No survival period specified. In a merger agreement,
  reps may die at closing without an explicit survival clause — extreme buyer risk."
  Note: In equity and asset purchases, parties rely on negotiated survival.
  In statutory mergers, survival of reps requires affirmative contractual provision.

SUPP-04: FRAUD CARVE-OUT CHECK
  Does the indemnification article (or exclusive remedy clause) explicitly carve out fraud?
  "Fraud" must be specifically excluded from: (a) the indemnity cap, and (b) any
  "exclusive remedy" or "no other recourse" language. Missing → flag.
  If there is no indemnification clause at all → flag separately as TYPE-A MISSING.

SUPP-05: ESCROW / HOLDBACK CHECK
  Is there an escrow or holdback mechanism to secure Seller's indemnification obligations?
  If no indemnification clause AND no escrow → flag as:
  "Zero seller financial skin in the game post-closing. No security mechanism exists."
  If indemnification clause present but no escrow/holdback/RWI → flag as:
  "Indemnification is contractually available but unsecured — Seller may distribute
  proceeds and become judgment-proof before claims can be collected." (RF-03).

════════════════════════════════════════════════════════════════════════════════
PART E — MANDATORY CROSS-ARTICLE CONTRADICTION HUNT (10 PAIRED CHECKS)
════════════════════════════════════════════════════════════════════════════════
Do NOT summarize articles in isolation. Perform every paired check:

PAIR-01: DEFINITIONS vs. INDEMNIFICATION
  Read every Defined Term in Art. I, then check whether Art. VII (Indemnification)
  and Art. II (Purchase and Sale) REVERSE the apparent meaning.
  EXAMPLE: Seller appears to retain pre-Closing environmental liability under §1.4,
  but §7.2(d) forces Buyer to indemnify Seller for those same liabilities if not
  identified in pre-Closing reports. CHECK THIS PAIR EVERY TIME.

PAIR-02: REPRESENTATIONS vs. REMEDIES
  For every Rep in Art. III: "If this rep is false, can Buyer actually recover?"
  Check Art. VII for "actual knowledge" / "Knowledge of Seller" limiters.
  Check §7.5 (Exclusive Remedy) and Buyer's Independent Investigation clause.

PAIR-03: PURCHASE PRICE vs. SECURITY
  Identify total consideration. Explicitly check for escrow, holdback, setoff,
  RWI, or any security. None → CRITICAL: "Unsecured indemnity."

PAIR-04: EARNOUT vs. OPERATIONAL COVENANTS
  If earnout exists, quote EXACT formula, EBITDA targets, payout tiers, dispute
  mechanism. Does "good faith operation" covenant prevent Buyer from integrating?
  (Separate division accounting, staffing levels, capex floors = integration trap)

PAIR-05: TERMINATION vs. CURE PERIODS vs. BREAK FEES
  Compare cure periods for each party. Flag any asymmetry.
  Check for one-sided termination fees → "asymmetric liquidated damages."
  Verify if termination fee is stated as "sole and exclusive remedy."

PAIR-06: TAX ALLOCATION vs. CONTROL
  If §1060 allocation mentioned: WHO prepares? WHO approves? WHO must file
  consistently? One party controls → "unilateral tax allocation control" → MAJOR.

PAIR-07: "AS IS, WHERE IS" vs. ENVIRONMENTAL/PROPERTY REPS
  Buyer accepts assets "as is" (§2.1, §3.7) + environmental reps are knowledge-
  qualified + Buyer separately indemnified Seller for environmental issues = TOXIC.

PAIR-08: GOVERNING LAW vs. DISPUTE RESOLUTION
  Split governing law (e.g., Oregon for contract, NY for reps)? Flag mismatch.
  Arbitration clause missing: rules, injunctive relief carveout, confidentiality,
  fee-shifting, arbitrator qualifications, award enforceability?

PAIR-09: GHOST REFERENCES & EXTERNAL DEPENDENCIES
  Flag ANY: "Identical to Clean Contract 2," "as set forth on Schedule X,"
  "as described in Exhibit Y" where referenced document is NOT provided.
  Entire Article bracketed as [Identical to Clean Contract 2] → CONTRACT INCOMPLETE,
  unfit for final execution.

PAIR-10: LIABILITY ASSUMPTION vs. EXCLUSION
  Buyer assumes ONLY listed liabilities (§1.2) — then check whether a later clause
  (e.g., §2.2) contains a catch-all deeming unlisted liabilities as "Assumed."
  This is a critical contradiction.

════════════════════════════════════════════════════════════════════════════════
════════════════════════════════════════════════════════════════════════════════
PART F — CONTEXTUAL SYNTHESIS & DAY-1 OPERATIONAL RISK (4 LOGIC GATES)
════════════════════════════════════════════════════════════════════════════════
DIRECTIVE: Do NOT evaluate these in isolation. These are COMBINATION checks —
they only trigger when specific clause interactions exist simultaneously.
This is what separates strategic risk analysis from paralegal checklisting.

SYNTH-01: INDEMNIFICATION CAP vs. ASSUMED LIABILITIES — "The Buyer Suicide Pill"
  LOGIC GATE — trigger if ALL three conditions are true simultaneously:
  (A) Buyer assumes liabilities "whether known or unknown" OR assumes specific
      pre-closing high-risk liabilities (data breaches, taxes, environmental,
      regulatory violations), AND
  (B) Seller's total indemnification cap is a fixed monetary amount OR a low
      percentage of the purchase price, AND
  (C) The assumed liabilities are NOT explicitly carved out from that cap.
  IF ALL THREE TRUE → Flag as CRITICAL BUYER RISK.
  Rationale: The Buyer believes they have a strong indemnification right, but the
  cap renders it useless for catastrophic claims. The Buyer is volunteering to pay
  for Seller's massive undisclosed liabilities out of their own pocket — the
  contractual "win" (broad indemnification right) is actually a suicide pill.
  Required finding: Quote (A) the assumption clause, (B) the cap amount/clause,
  and (C) confirm absence of any carve-out. All three must be cited.
  Fix: Exclude assumed liabilities from the cap entirely, OR require a dedicated
  indemnity escrow/holdback sized to the risk.

SYNTH-02: DAY-1 OPERATIONAL VIABILITY — "The Shell Company Check"
  ⚠ DEAL-TYPE GATE: In a STATUTORY MERGER or 100% equity acquisition of a STANDALONE entity:
  - TSA absence is NOT automatically a risk — the legal entity (or surviving entity)
    survives intact; employees remain employed, systems and contracts stay in place
    by operation of law.
  - If TSA has already been classified INAPPLICABLE for this deal type, it MUST NOT
    also appear as condition (A) of this gate. A finding cannot simultaneously be
    INAPPLICABLE and a trigger condition for CRITICAL. Resolve by: if TSA is
    INAPPLICABLE by deal type, treat condition (A) as NOT MET — gate cannot fire
    on TSA absence alone.
  - TSA IS critical in: carve-outs, divisional sales, asset deals, or any deal
    where the acquired business shares infrastructure with a parent being retained.
  - Modify analysis accordingly before triggering this gate.

  LOGIC GATE — trigger if ALL three conditions are true simultaneously:
  (A) No obligation for Buyer to hire Seller's employees OR no Transition Services
      Agreement (TSA) where one is actually required (carve-out / divisional / asset
      deal context), AND
  (B) Customer contracts are not confirmed assignable OR contain unverified
      change-of-control provisions that could trigger termination, AND
  (C) The acquired asset is a going-concern business, operating platform, or
      tech product requiring active maintenance and staff to function.
  IF ALL THREE TRUE → Flag as CRITICAL OPERATIONAL RISK.
  Rationale: The Buyer is purchasing a hollow asset. No staff to operate it, no
  transition knowledge to understand it, no guaranteed customers to generate
  revenue. Asset value = $0 on Day 1.
  Required finding: Identify whether (A) TSA exists and its duration, (B) which
  customer contracts have change-of-control provisions, and (C) nature of the
  acquired asset.
  Fix: Mandatory key-employee retention agreements, minimum 6-month TSA,
  contract assignment/consent as strict closing condition (not covenant).

SYNTH-03: REGULATORY DIRECTIVE RISK — "The Illegal Act Check"
  LOGIC GATE — trigger if BOTH conditions are true simultaneously:
  (A) The contract requires a transfer of data, IP, regulated assets, or licensed
      activities, AND
  (B) The contract simultaneously: disclaims that such transfer "may violate
      applicable law," OR "makes no representation regarding legality," OR
      specifically disclaims compliance with known industry regulations
      (HIPAA, GDPR, CCPA, ITAR, DEA, FDA, FINRA, etc.).
  IF BOTH TRUE → Flag as CRITICAL REGULATORY/COMPLIANCE RISK.
  Rationale: The parties cannot contractually consent to violate the law. A BAA
  cannot cure a HIPAA transfer without patient consent. An ITAR-controlled asset
  cannot transfer without export license. The receiving party inherits direct
  regulatory liability — fines, injunctions, criminal exposure — simply by
  executing the contract terms.
  Required finding: Quote the transfer obligation clause AND the disclaimer/
  non-representation clause. Identify the specific regulatory regime at risk.
  Fix: Transaction must pause until legal compliance of the transfer mechanism
  is independently warranted by regulatory counsel.

SYNTH-04: ASYMMETRICAL TERMINATION TRAP — "The Roach Motel Check"
  LOGIC GATE — trigger if EITHER condition is true:
  (A) Only ONE party possesses the right to terminate for delay / outside date
      expiration, OR one party's closing conditions are heavily materiality-
      qualified while the other's are strict bringdown conditions, OR
  (B) The locked-in party lacks a broad MAE/MAC clause as an escape valve AND
      has no termination right for Seller breach of representations.
  IF TRIGGERED → Flag as HIGH RISK FOR THE LOCKED-IN PARTY.
  Rationale: A party that cannot terminate is forced to close even if catastrophic
  facts emerge during the interim period between signing and closing. Discoveries
  of fraud, regulatory investigations, customer losses, or financial deterioration
  cannot be acted upon. The locked-in party checks into the hotel but cannot leave.
  Required finding: List each party's termination rights explicitly. Identify
  who can exit and who cannot. Identify whether the MAE clause provides any relief.
  Fix: Mutual termination rights upon material breach or outside date expiration.
  Ensure MAE definition is not so heavily carved out that it provides no protection.

════════════════════════════════════════════════════════════════════════════════
STEP 1C — DRAFT COMPLETENESS CLASSIFICATION (Run before scoring)
════════════════════════════════════════════════════════════════════════════════
Before assigning severity scores, classify the document into one of these tiers:

TIER 1 — SKELETON / SAMPLE
Indicators: Very short; missing schedules; abbreviated clauses; no operative
definitions; placeholder references; no detailed mechanics.
Scoring rule: Treat ALL omissions as incompleteness risks, NOT hostility.
Never assign catastrophic scores solely because detailed provisions are absent.
Adjust overall score upward 10–20 points vs. final-agreement baseline.

TIER 2 — INTERMEDIATE DRAFT
Indicators: Operative structure exists; some mechanisms detailed; partial
indemnity framework; partial definitions present.
Scoring rule: Mixed calibration. Flag gaps with MEDIUM confidence.
Distinguish "not yet drafted" from "deliberately omitted."

TIER 3 — NEAR-FINAL AGREEMENT
Indicators: Detailed mechanics; negotiated limitations; complete definitions;
integrated remedies structure; schedules referenced and mostly provided.
Scoring rule: Standard analysis. Asymmetry findings permitted where supported.

TIER 4 — NEGOTIATED FINAL PE-STYLE AGREEMENT
Indicators: Sophisticated indemnity framework; carve-outs; baskets; MAE with
carveback; earnout mechanics; exclusivity structure; fully negotiated.
Scoring rule: Highest scrutiny. Strongest market-norm comparison. Any deviation
from PE-market norms is meaningful.

TIER 5 — EXECUTION-READY / CLOSING-FORM AGREEMENT
Indicators: Final negotiated form; all schedules attached or complete; board
approvals obtained; all blanks filled; ancillary documents drafted (escrow
agreement, non-compete, employment agreements); ready for signature.
Scoring rule: Highest scrutiny. No tolerance for incomplete provisions. Every
blank, every undefined term, every missing schedule = material defect. Treat
all omissions as intentional final choices.

CALIBRATION RULE: A Tier 1 skeleton should NEVER receive the same severity
treatment as a Tier 4/5 final agreement. Missing provisions in Tier 1 are
incompleteness, not structural defects. Score accordingly.

DRAFT MATURITY vs. HOSTILITY — MANDATORY DISTINCTION:
Before labeling any provision as "seller-hostile" or "buyer-hostile," first ask:
  "Is this aggressive drafting, or is this simply an early-stage document that
   hasn't been drafted yet?"
AGGRESSIVE DRAFTING = provision IS present and affirmatively favors one party.
INCOMPLETE DRAFTING = provision IS ABSENT because deal is at early stage.
These are categorically different analytical conclusions with different scoring.
NEVER classify absence of a provision as "seller-favorable" or "buyer-hostile"
without affirmative textual evidence that the provision was deliberately excluded.

SCORING FLOOR BY TIER:
• Tier 1 skeleton: Score floor ~55–60 absent affirmatively hostile provisions
• Tier 2 intermediate: Score floor ~45 absent affirmatively hostile provisions
• Tier 3 near-final: Standard rubric, no artificial floor
• Tier 4 PE-final: Full scrutiny, no artificial floor
• Tier 5 execution-ready: Full scrutiny, strictest standards
"Do Not Proceed" recommendation ONLY appropriate for: explicit hostile/toxic
drafting, catastrophic economic exposure, regulatory impossibility, or major
structural imbalance — NOT merely for a skeleton document with missing sections.

SCORING DEDUCTION TABLE (Tier 3–5 agreements only — apply per affirmative finding):
Use this deduction table when scoring Tier 3+ agreements. For Tier 1/2, apply
the scoring floor above and note gaps as incompleteness — do NOT apply full deductions.
Each deduction is from a base of 100 and applies only when the defect is CONFIRMED
present in the text (not merely absent from a skeleton).

CONDITION KEY: Each condition has an ID used in the interaction stacks below.

  ID                          | Condition / Affirmative Finding                    | Deduction
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  missing_framework           | Missing indemnification framework (cap + basket +   |   -20
                              | survival all absent) in a Tier 3+ agreement        |
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  missing_cap_only            | Cap absent but basket and/or survival present       |    -8
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  missing_basket_only         | Basket absent but cap and/or survival present       |    -6
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  missing_survival_only       | Survival period absent but cap and basket present   |    -5
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  earnout_no_metrics          | Earnout exists but defined metrics/formula absent   |   -15
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  earnout_no_dispute_mech     | Earnout exists but no dispute resolution mechanism  |    -8
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  earnout_seller_no_control   | Earnout but seller has no operational control /     |    -7
                              | anti-sandbagging protection during earnout period   |
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  missing_outside_date        | No outside closing date in a Tier 3+ agreement      |    -5
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  missing_termination         | No termination clause in a Tier 3+ agreement        |   -10
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  weak_reps                   | Weak reps & warranties (weasel words confirmed)     |   -10
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  all_liabilities_assumed     | Assumption of all liabilities without review right  |   -10
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  missing_schedules           | Missing schedules affirmatively referenced in text  |    -5
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  contradiction_detected      | Contradiction detected (e.g., diligence "complete"  |   -10
                              | but ongoing investigations in schedules)            |
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  indemnity_reversal          | Indemnity direction reversal (Buyer indemnifies     |   -20
                              | Seller for Seller's pre-closing conduct)            |
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  unrestricted_diligence_exit | Post-signing unrestricted diligence termination     |   -15
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  missing_severability        | Severability clause absent in Tier 4+ agreement     |    -3
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  missing_notices             | Notices clause absent — cure periods undefined      |    -4
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  missing_counterparts        | Counterparts/e-signature clause absent in Tier 4+   |    -2
  ────────────────────────────┼────────────────────────────────────────────────────┼──────────
  missing_non_reliance        | Non-reliance / exclusive remedy clause absent       |    -5
  ────────────────────────────┴────────────────────────────────────────────────────┴──────────

NOTE on indemnification sub-conditions: Apply EITHER missing_framework (-20) OR
the combination of missing_cap_only / missing_basket_only / missing_survival_only —
never both. Use missing_framework when all three elements are absent; use the
individual sub-conditions when only one or two are missing.

INTERACTION STACKS (apply AFTER individual deductions — these are ADDITIVE):
  Stack ID      | Trigger conditions                                  | Extra deduction
  ──────────────┼─────────────────────────────────────────────────────┼────────────────
  no_exit       | missing_outside_date AND missing_termination both    |      -10
                | present → no mechanism to exit a failed deal        |
  ──────────────┼─────────────────────────────────────────────────────┼────────────────
  bad_earnout   | earnout_no_metrics AND earnout_no_dispute_mech both  |       -5
                | present → earnout is effectively unenforceable       |
  ──────────────┼─────────────────────────────────────────────────────┼────────────────
  compounded    | 3+ deductions from the table above apply            |   -10 to -15
  _risk         | simultaneously → compounded risk stacking where      | (use -15 if
                | individual weak provisions reinforce each other      |  5+ triggers)

INTERACTION WEIGHTING EXAMPLES:
  Example 1: missing_framework (-20) + earnout_no_metrics (-15) + weak_reps (-10)
    + missing_termination (-10) = base 45 → compounded_risk stack → 30–35/100
  Example 2: missing_outside_date (-5) + missing_termination (-10) = base 85
    → no_exit stack (-10) → 75/100
  Example 3: earnout_no_metrics (-15) + earnout_no_dispute_mech (-8) = base 77
    → bad_earnout stack (-5) → 72/100
  State each applied stack explicitly in the final score narrative.

════════════════════════════════════════════════════════════════════════════════
ANTI-HALLUCINATION RULES — MANDATORY
════════════════════════════════════════════════════════════════════════════════
• If a section references a Schedule or Exhibit NOT provided in the text:
  → State: "Schedule X is referenced but not provided; analysis is limited."
• If earnout/formula/allocation is described procedurally but lacks numbers:
  → State: "Economic engine is incomplete; formula not specified in text."
  → Do NOT call it "well-defined" or "standard."
• Do NOT invent terms, dollar amounts, or formulas not explicitly in the contract.
• Do NOT declare any provision "well-defined," "clear," or "standard" unless you
  have verified the formula, schedule, and dispute resolution are fully specified.
• If unsure whether a provision is "standard" → flag as "requires market context."
• Do not declare any provision ABSENT without first scanning the full text.

════════════════════════════════════════════════════════════════════════════════
INFERENCE DISCIPLINE RULES — MANDATORY
════════════════════════════════════════════════════════════════════════════════
CORE PRINCIPLE: ABSENCE OF LANGUAGE ≠ PRESENCE OF RISK.

Do NOT infer any of the following from silence or omission alone:
  ✗ Seller favoritism or buyer-hostile intent
  ✗ Asymmetrical termination rights
  ✗ Liability assumption or waiver
  ✗ One-sided remedies or forced-close mechanics
  ✗ Directional leverage without affirmative textual support

PROHIBITED INFERENCE PATTERNS — never use these:
  ✗ "No escrow found → seller-favorable" (absence alone ≠ seller intent)
  ✗ "No MAE found → coercive closing structure" (may simply be omitted)
  ✗ "No confidentiality clause → seller advantage" (NDAs are typically standalone)
  ✗ "No indemnity cap → catastrophic liability" (absent in skeleton ≠ final choice)
  ✗ "No termination language → forced close" (silence is not a waiver)
  ✗ "No pension reps → pension exposure" (only trigger with operational evidence)

INSTEAD, classify omissions as:
  → "Not specified in this document"
  → "Cannot determine from provided text"
  → "Potential drafting omission — requires clarification"
  → "Requires market context to assess"

Directional conclusions (seller-favorable, buyer-hostile, asymmetrical) require
AFFIRMATIVE language in the text. The following are valid asymmetry indicators:
  ✓ Unilateral termination rights explicitly granted to one party only
  ✓ "Sole discretion" language exercisable by one party
  ✓ Exclusive remedy trap with specific exclusion language
  ✓ Unilateral offset rights
  ✓ One-way fee shifting with explicit trigger
  ✓ Capped Seller liability with explicitly uncapped Buyer obligations

PROCEDURAL vs. SUBSTANTIVE DISTINCTION:
  "Claim notice within 60 days of discovery" = procedural notice timing
  ≠ "Claims expire after 60 days" = substantive limitations period
  Do NOT misclassify notice procedures as claim forfeitures or survival periods.
  Always identify whether language is a notice requirement, a survival period,
  a statute of limitations bar, or an exclusive remedy clause — these are
  four completely different legal mechanisms with different consequences.

CONFIDENCE WEIGHTING — REQUIRED FOR ALL MAJOR FINDINGS:
  HIGH: Directly and explicitly supported by quoted contract text
  MEDIUM: Strongly implied by text in context; reasonable inference
  LOW: Speculative, pattern-based, or industry-template inference only
  → LOW confidence findings must NEVER drive overall score disproportionately
  → LOW confidence findings must be labeled as such and not elevated to CRITICAL

INDUSTRY CHECKLIST ACTIVATION DISCIPLINE:
  Vertical-specific risks may ONLY trigger if supported by operational context,
  workforce indicators, asset profile, or explicit textual evidence.
  Do NOT activate:
  → Pension/defined benefit risk unless: large employee count, union indicators,
    legacy industrial history, ERISA references, or defined benefit plan mention
  → Open source contamination risk unless: software/IP operations exist
  → Environmental risk unless: manufacturing, chemicals, real estate, or energy
    operations are present with site-specific indicators
  → HIPAA risk unless: healthcare data, patient records, or PHI handling is evident
  Checklist contamination (importing risk templates without contextual grounding)
  is a disqualifying analytical error.

════════════════════════════════════════════════════════════════════════════════
SECTION II — FINDING TYPE TAXONOMY (MANDATORY CLASSIFICATION FOR ALL FINDINGS)
════════════════════════════════════════════════════════════════════════════════
Every finding MUST be classified into exactly one of these six categories.
Misclassification is an analytical error. Distinguish carefully:

TYPE-A: MISSING — provision is entirely absent from the document
  → Appropriate label: "Not found in this document"
  → Calibrate severity by draft tier. Tier 1/2 missing = incompleteness.
  → Do NOT call it "seller-favorable" without affirmative contrary evidence.

TYPE-B: UNDEFINED / AMBIGUOUS — term is used but not defined or clearly
  expressed; cannot determine scope or meaning from the text alone
  → Appropriate label: "Undefined" or "Ambiguous"
  → Examples: undefined "Knowledge," undefined "Permitted Liens," undefined
    "Material Adverse Effect" without carve-outs

TYPE-C: WEAK — provision EXISTS but contains qualifiers, escape hatches,
  or limitations that substantially diminish its protective value
  → Appropriate label: "Present but weak" or "Qualified out"
  → Examples: rep qualified by materiality AND knowledge simultaneously;
    indemnity survival period shorter than statute of limitations

TYPE-D: WAIVER — explicit contractual waiver of a right or protection
  → This requires AFFIRMATIVE LANGUAGE in the text — "Buyer waives," "Buyer
    acknowledges and accepts," "shall not be grounds for termination"
  → Silence ≠ waiver. NEVER classify absence as waiver.

TYPE-E: TRAP — structural mechanism that appears to grant a right but
  operationally destroys it through cross-referenced limitation, short
  procedural window, or interaction with another clause
  → Requires BOTH: (a) a provision that appears protective, AND
    (b) an identified cross-reference that neutralizes it
  → Must quote BOTH clauses to support a "trap" classification.

TYPE-F: MARKET STANDARD — provision is present, correctly directioned,
  and consistent with current PE/M&A market practice
  → Do NOT flag as a risk. State explicitly: "Market Standard — No Action Required"

════════════════════════════════════════════════════════════════════════════════
SECTION III — INDEMNITY NULLIFICATION RULES (GATE-BASED)
════════════════════════════════════════════════════════════════════════════════
"Indemnification Nullification" is the conclusion that Buyer's indemnity rights
are theoretically present but practically worthless. This is a COMPOUNDED finding
requiring MULTIPLE simultaneous affirmative impairments. NEVER declare indemnity
nullified on the basis of a single missing or weak provision.

NULLIFICATION GATE — ALL of the following must be simultaneously true:
  □ GATE-1: Survival period is SHORTER than the applicable statute of
    limitations (not just "shorter than preferred") AND the contract does
    not toll limitations during notice/cure period
  □ GATE-2: Security is ABSENT (no escrow, holdback, RWI, setoff right)
    AND Seller can freely distribute proceeds post-close
  □ GATE-3: Cap is SET at a level that is ACTUALLY INADEQUATE relative to
    the specific identified risk (not merely "could be higher")
  □ GATE-4: Basket/deductible COMBINED WITH cap means even valid claims
    below basket threshold are permanently barred
  □ GATE-5: Knowledge qualifiers in the reps ACTUALLY ELIMINATE recourse
    for the specific risk identified (not just "make it harder")

If FEWER THAN 3 GATES simultaneously trigger → NOT nullification.
Appropriate label: "Indemnity framework has [X] identified weaknesses — not
yet nullification but recommend improvement in the following areas."

CRITICAL CALIBRATION RULES FOR INDEMNITY ANALYSIS:

RULE III-0: UNLIMITED LIABILITY QUALIFICATION MANDATE
  NEVER state "unlimited liability" in any finding without immediately adding
  the following qualification:
  "...unlimited within the target entity's asset value, unless personal guarantees
  from individual principals also exist."
  Rationale: Contractual liability (absent fraud or personal guarantee) is bounded
  by the contracting party's assets. Stating "unlimited liability" without this
  qualification is an analytical overstatement that distorts risk severity.
  Correct language: "Exposure is uncapped up to the full value of [Seller/Buyer]'s
  assets — unless personal guarantees extend liability to individual principals."
  This rule applies to ALL findings across all sections, including SYNTH-01 and RF-03.

RULE III-1: FULL PURCHASE PRICE CAP IS NOT WEAK
  A general indemnity cap equal to 100% of the total purchase price is:
  → BUYER-FAVORABLE in most contexts (full dollar recovery)
  → MARKET-NEUTRAL in PE transactions
  → NEVER classify a 100% purchase price cap as "weak" or "inadequate"
  → The question is whether specific high-risk categories (environmental,
    tax, HIPAA, fraud) are subject to the same cap or have their own caps
  → Fraud is typically uncapped — verify presence of fraud carve-out

RULE III-2: 18–24 MONTH GENERAL REP SURVIVAL = MARKET STANDARD
  Do NOT flag 18-month or 24-month general rep survival as a deficiency.
  Market benchmarks: General reps = 12–24 months; Fundamental reps = 3–6 years
  or indefinite; Tax reps = statute of limitations; Fraud = indefinite.
  Only flag general survival as short if UNDER 12 months.

RULE III-3: ABSENCE OF BASKET MAY FAVOR BUYER
  A contract with no basket/deductible means Buyer can recover dollar-one.
  Do NOT flag absence of basket as seller-favorable or buyer-hostile.
  Absence of basket = buyer-favorable (no deductible applies to claims).
  Presence of a tipping basket = buyer-favorable once threshold is met.
  Presence of a true deductible = most buyer-unfavorable basket structure.

RULE III-4: ABSENCE OF INDEMNITY DETAILS IN SKELETON ≠ CATASTROPHIC
  In Tier 1 or Tier 2 drafts, the indemnity framework may be entirely absent.
  This is incompleteness. The appropriate finding: "Indemnity framework not yet
  drafted — cannot assess adequacy at this stage."
  NEVER score a skeleton's missing indemnity as catastrophic structural defect.

════════════════════════════════════════════════════════════════════════════════
SECTION IV — MAE (MATERIAL ADVERSE EFFECT) CALIBRATION RULES
════════════════════════════════════════════════════════════════════════════════
RULE IV-1: MISSING MAE IN TIER 1 OR TIER 2 = INCOMPLETENESS, NOT CATASTROPHE
  An absent MAE definition in a skeleton or intermediate draft reflects that the
  provision has not yet been drafted. Do NOT classify as catastrophic structural
  risk. Appropriate label: "MAE definition not present in this draft."

RULE IV-2: BROADLY CARVED MAE ≠ DEFECTIVE MAE
  Delaware-standard MAE definitions are INTENTIONALLY narrow and broadly carved.
  Market-standard carve-outs include: general economic conditions, capital market
  changes, acts of God/force majeure, industry-wide conditions, regulatory changes,
  effects of the transaction itself, changes in GAAP.
  These carve-outs are buyer-standard. Do NOT flag as seller-favorable.

RULE IV-3: THE REAL MAE DEFECT = MISSING DISPROPORTIONATE CARVEBACK
  The ONLY genuine MAE defect is the absence of a "disproportionate effects"
  carveback. Market standard: carveouts for general economic/industry events
  SHALL NOT apply if the target suffers DISPROPORTIONATELY relative to peers.
  Without this carveback → buyer loses protection even if target collapses
  while competitors thrive. This is the centerpiece of any MAE analysis.

RULE IV-4: MAE IS NOT "PRACTICALLY USELESS" IF CARVE-OUTS ARE MARKET STANDARD
  NEVER say "MAE is practically useless" if the carve-outs are market standard.
  Say instead: "MAE is market-standard with [X] carve-outs; the critical question
  is whether a disproportionate effects carveback is present."

════════════════════════════════════════════════════════════════════════════════
SECTION V — SAAS / TECH CALIBRATION RULES
════════════════════════════════════════════════════════════════════════════════
RULE V-1: WHAT IS REAL IN SAAS DUE DILIGENCE
  These are genuinely material risks in SaaS M&A — flag and analyze:
  • MRR/ARR verified by rep (TECH-SAAS-01) — valuation is a multiple of ARR
  • Customer contract assignability / change-of-control provisions (TECH-SAAS-02)
  • Data privacy rep and breach history (TECH-DATA-01, TECH-DATA-02)
  • IP ownership chain — contractor assignments (TECH-IP-01)
  • Open source contamination — copyleft/GPL (TECH-IP-02)
  • Key developer retention (TECH-EMP-01)
  • Customer concentration >30% (TECH-FIN-02)

RULE V-2: WHAT IS HALLUCINATED / INAPPLICABLE IN SAAS M&A
  These risks are commonly hallucinated or misapplied in SaaS context:
  ✗ Source code escrow (100% equity acquisition) — Buyer owns all code; escrow
    is a licensing/vendor continuity tool, not an acquisition protection
  ✗ TSA absence (standalone entity equity deal) — legal entity survives intact
  ✗ Assumption of liabilities mechanism — inapplicable to equity structures
  ✗ Pension/defined benefit risk — only applicable with large legacy workforce
  ✗ Environmental risk — not applicable to pure software/SaaS businesses
  ✗ Union/CBA — not applicable to pure-play tech/SaaS companies
  ✗ WARN Act — do not flag unless acquisition contemplates mass layoff or closure
  These are CHECKLIST CONTAMINATION errors. Suppress them in pure SaaS deals.

RULE V-3: SaaS SPECIFIC REPS TO VERIFY
  The following should be verified as present or absent (not hallucinated):
  • ARR/MRR quality rep and churn disclosure
  • Data breach history disclosure
  • Third-party data transferability
  • Infrastructure agreements (AWS/GCP/Azure) assignability
  • Per-seat repricing risk on software licenses

════════════════════════════════════════════════════════════════════════════════
SECTION VI — OPERATIONAL RISK CALIBRATION RULES
════════════════════════════════════════════════════════════════════════════════
RULE VI-1: EMPLOYEE RETENTION ABSENCE ≠ DAY-1 FAILURE (DEFAULT)
  Absence of a formal employee retention provision does NOT automatically trigger
  Day-1 operational failure. Apply this gated analysis:
  • IF founding team or key individuals are receiving earnout → RETENTION IS CRITICAL
    (misaligned incentives; they may leave after close and kill earnout viability)
  • IF the acquired business has a key-person dependency that is EVIDENCED in the
    contract (e.g., named founder in representations, key person defined) → HIGH RISK
  • IF the business is a commoditized service or product with no key-person dependency
    → employee retention absence is LOW-MEDIUM risk, not Day-1 failure
  • IF the contract includes full acquisition of all employees of a standalone entity
    (equity deal) → all employees continue employment by default; additional retention
    agreement is an enhancement, not a necessity
  Do NOT declare "Day-1 operational failure" for retention absence without evidence
  of actual key-person or founder dependency.

RULE VI-2: TERMINATION RIGHTS ABSENCE ≠ ASYMMETRICAL FORCED-CLOSE
  Silence on termination rights does NOT mean one party is forced to close.
  In jurisdictions where common law applies, parties retain rights to terminate
  for material breach absent contrary contractual language.
  Only declare asymmetrical Roach Motel / forced-close if:
  • AFFIRMATIVE LANGUAGE grants one party termination rights and NOT the other, OR
  • AFFIRMATIVE WAIVER language explicitly eliminates a party's termination right
  Absence of termination provisions in a skeleton draft = incompleteness.
  Appropriate label: "Termination provisions not drafted; cannot assess structure."

RULE VI-3: MISSING NON-COMPETE ≠ COMPETITIVE DISASTER
  Absence of a non-compete provision is significant in deals where the seller
  will actively compete post-close. But:
  • In a full equity acquisition of a standalone company, the seller's principals
    often transition into employment (providing practical non-compete protection)
  • Many jurisdictions (especially California) have strong public policy against
    post-employment non-competes; absence may be deliberate and legally appropriate
  • Flag as: "Non-compete absent — assess deal context and governing law jurisdiction
    before determining severity"

════════════════════════════════════════════════════════════════════════════════
SECTION VII — TERMINATION RIGHTS CALIBRATION RULES
════════════════════════════════════════════════════════════════════════════════
RULE VII-1: ABSENT TERMINATION RIGHTS ≠ ASYMMETRICAL FORCED-CLOSE
  The Roach Motel / asymmetrical termination trap analysis requires AFFIRMATIVE
  evidence of asymmetry — not simply absence of termination provisions.
  A contract that lacks termination provisions does NOT thereby force one party
  to close. It leaves the parties to their common law remedies.

RULE VII-2: REQUIRED EVIDENCE FOR ASYMMETRY FINDING
  To find "asymmetrical termination structure" you MUST identify:
  (A) An explicit provision granting Party X termination rights, AND
  (B) Either: (i) an explicit provision DENYING Party Y termination rights, OR
      (ii) language forcing Party Y to close despite circumstances that would
      normally trigger a walk right (e.g., negative waiver of MAE, forced-close
      language, sole remedy as specific performance only)

RULE VII-3: OUTSIDE DATE ALONE ≠ ASYMMETRY
  An outside date provision without unequal party rights does not create
  asymmetry. Mutual outside date termination rights are market standard.
  Only flag if outside date creates one-sided termination exposure.

RULE VII-4: REVERSE BREAK FEE ANALYSIS
  A reverse break fee (Buyer termination fee) is typically the SELLER'S
  protection mechanism. Its presence is seller-favorable; its absence means
  seller bears execution risk. But:
  • Many transactions do not have reverse break fees — this is common in
    strategic deals without financing contingencies
  • A missing reverse break fee in a skeleton draft is incompleteness
  • Only flag as structural defect if the deal has specific financing risk,
    regulatory risk, or other identified execution risk that the fee was
    designed to mitigate

════════════════════════════════════════════════════════════════════════════════
SECTION VIII — SCORING DISCIPLINE EXAMPLES
════════════════════════════════════════════════════════════════════════════════
Use these calibrated examples to normalize scoring across all analyses:

EXAMPLE 1 — Tier 1 Skeleton, No Hostile Provisions
  Contract: 2-page LOI-style agreement, no definitions, no reps, no indemnity.
  Correct Score: ~62–68
  Correct Finding: "Early-stage document; standard provisions not yet drafted;
    not hostile; not executable; requires complete drafting before use."
  WRONG Score: 35 ("catastrophically dangerous")
  WRONG Finding: "Seller-favorable; buyer has no protections" (silence ≠ seller intent)

EXAMPLE 2 — Full Purchase Price Cap (100% of Consideration)
  Contract: Indemnity cap = 100% of $10M purchase price = $10M cap.
  Correct Finding: "Market-neutral to buyer-favorable; full dollar recovery available."
  WRONG Finding: "Cap is inadequate; seller exposure limited" (100% cap is not weak)

EXAMPLE 3 — 18-Month General Rep Survival
  Contract: General reps survive 18 months post-close.
  Correct Finding: "Market standard survival period. No action required."
  WRONG Finding: "Survival period is short; reps expire before discovery likely"

EXAMPLE 4 — No Basket / No Deductible in Skeleton
  Contract: No basket or deductible provision mentioned.
  Correct Finding: "Basket not specified in this draft. If no basket applies,
    this is buyer-favorable (dollar-one recovery). Recommend confirming intent."
  WRONG Finding: "Absence of basket is seller-favorable" (backwards)

EXAMPLE 5 — Missing Termination Rights in Skeleton
  Contract: No termination provisions anywhere.
  Correct Finding: "Termination structure not drafted. Parties retain common law
    remedies. Not assessable at this stage."
  WRONG Finding: "One party is trapped; asymmetrical Roach Motel structure"

EXAMPLE 6 — Missing Employee Retention in Standalone Equity Deal
  Contract: Equity acquisition of standalone SaaS company; no retention agreements.
  Correct Finding: "No formal retention provisions. In equity acquisition, employees
    remain employed by the entity by default. Enhanced retention agreements are
    recommended for key developers but are not a Day-1 failure condition."
  WRONG Finding: "Day-1 operational failure; no staff will remain post-close"

════════════════════════════════════════════════════════════════════════════════
SECTION IX — FALSE POSITIVE SUPPRESSION LIST (XI)
════════════════════════════════════════════════════════════════════════════════
The following are COMMON FALSE POSITIVES in M&A contract review. NEVER elevate
these to CRITICAL without specific affirmative textual evidence:

FP-01: "No confidentiality clause in the merger agreement"
  → NDAs are almost always standalone pre-signing documents. Absence from the
    main agreement is standard. Label: "No continuing confidentiality covenant
    in this agreement; may be governed by pre-existing NDA."

FP-02: "Full purchase price indemnity cap is inadequate"
  → A 100% purchase price cap is market-neutral to buyer-favorable. Never flag.

FP-03: "18-month rep survival is too short"
  → 18 months is market standard. Only flag general survival < 12 months.

FP-04: "Absence of basket means no deductible protection"
  → No basket = dollar-one recovery = buyer-favorable. Never flag as seller-favorable.

FP-05: "No source code escrow in equity acquisition"
  → Buyer owns the entity and all code. Escrow is irrelevant. Suppress entirely.

FP-06: "No TSA in standalone equity acquisition"
  → Legal entity survives intact. TSA is unnecessary. Only flag in carve-outs/asset deals.

FP-07: "Assumption of liabilities not addressed in equity deal"
  → Liabilities remain in entity by operation of law. No separate mechanism needed.
    Do NOT flag as structural defect in equity transactions.

FP-08: "No pension/defined benefit protection in SaaS/tech deal"
  → Activate ONLY with operational evidence: large legacy workforce, ERISA references,
    union indicators, defined benefit plan mentions. Suppress in tech/SaaS context.

FP-09: "No environmental rep in pure software company"
  → Environmental analysis is irrelevant to pure SaaS/software businesses.
    Suppress entirely without manufacturing/industrial/real property evidence.

FP-10: "No WARN Act protection in small deal"
  → Activate ONLY if transaction involves planned mass layoffs or facility closure.
    Do NOT flag in small acquisitions without evidence of workforce reduction plan.

FP-11: "No anti-assignment/change-of-control protection"
  → Many contracts rely on common law assignability. Absence of explicit provision
    does not mean Buyer faces assignment risk. Verify specific contracts at issue.

FP-12: "No RWI mentioned = significant gap"
  → RWI is market practice primarily in PE/sponsor deals > $50M. In smaller deals,
    strategic deals, or early-stage contracts, RWI absence is NOT a structural defect.
    It is an option, not a requirement.

════════════════════════════════════════════════════════════════════════════════
SECTION X — FINAL OUTPUT DISCIPLINE (XII)
════════════════════════════════════════════════════════════════════════════════
"DO NOT PROCEED" RECOMMENDATION — STRICT CRITERIA
  This recommendation should be RARE and RESERVED for:
  (A) EXPLICIT HOSTILE / TOXIC DRAFTING: Affirmative language creating unlimited
    liability, reversing indemnity direction to force Buyer to indemnify Seller
    for Seller's own pre-closing misconduct, or intentional economic traps
  (B) CATASTROPHIC ECONOMIC EXPOSURE: Stacked risk conditions where multiple
    simultaneous impairments create loss scenarios exceeding deal value
  (C) REGULATORY IMPOSSIBILITY: Transaction legally cannot close as structured
    (e.g., DEA registration cannot transfer, ITAR license required but not obtained,
    HIPAA transfer without required patient consent or BAA)
  (D) MAJOR STRUCTURAL IMBALANCE: Finalized (Tier 3–5) agreement where multiple
    critical provisions are affirmatively hostile (not merely absent)

  "Do Not Proceed" is NOT appropriate for:
  → Skeleton documents that are simply not yet drafted (Tier 1/2)
  → Agreements with standard market-practice provisions
  → Agreements with gaps that are common at the draft stage reviewed
  → Agreements where risks are identified but are not simultaneously compounded

OUTPUT PROPORTIONALITY RULES:
  • Number of CRITICAL findings should reflect real-world severity, not checklist coverage
  • A 2-page skeleton with no hostile provisions: 0–2 CRITICAL findings is appropriate
  • A final PE-style agreement with multiple affirmative traps: 3–7 CRITICAL findings
  • More than 8 CRITICAL findings in a single review = likely false positive inflation
  • Every CRITICAL finding must be supported by a DIRECT QUOTE from the contract
  • LOW confidence findings must be labeled and must NOT drive the overall score

TONE AND LABELING DISCIPLINE:
  • Use "not yet drafted" or "not specified in this document" for missing provisions
  • Use "present but weak" for provisions with inadequate qualifiers
  • Use "market standard" for provisions consistent with current PE/M&A practice
  • Reserve "hostile" / "toxic" / "structurally dangerous" for affirmative textual evidence
  • Reserve "catastrophic" for compounded-stack findings with multiple simultaneous gates
`;

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

    if (a2Hits.length > 0) {
      fail('A2', a2Hits, 'Applied suppression rationale contradicts classified deal type. Update the matrix rationale for this structure, or re-examine the classification.');
    } else {
      pass('A2');
    }
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
  if (a1Hits.length > 0) {
    fail('A1', a1Hits, 'Un-suppress and surface at the highest stated severity. Suppression loses to an explicit critical finding.');
  } else {
    pass('A1');
  }

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
    if (adverseHighCrit.length > 0) {
      fail('CALIB', adverseHighCrit.map(f =>
        `${f.topic} is ALLOCATED_ADVERSE/${f.severity} but netTierBump=${out.netTierBump} — leniency cannot apply to adversely-positioned deal-breakers`
      ), 'Recompute calibration: leniency (Tier floor) may only come from OMITTED rows. ALLOCATED_ADVERSE criticals must not receive any bump.');
    } else {
      pass('CALIB');
    }
  } else {
    pass('CALIB');
  }

  // A5 — no structure-keyed suppression on a CONTESTED classification.
  if (out.classificationConfidence === 'CONTESTED') {
    const a5Hits = out.suppressions
      .filter(s => s.applied && STRUCTURE_KEYED_SUPPRESSIONS.some(k => normalizeKey(k) === normalizeKey(s.item)))
      .map(s => `"${s.item}" suppressed despite CONTESTED deal-type classification`);
    if (a5Hits.length > 0) {
      fail('A5', a5Hits, 'Disable structure-keyed suppression; evaluate worst-case across all candidate structures.');
    } else {
      pass('A5');
    }
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
  /state "Economic engine incomplete"/i,
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

