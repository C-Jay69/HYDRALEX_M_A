
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
