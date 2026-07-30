# Gap Detection Report: Design vs Implementation

**Generated:** 2026-07-30  
**Methodology:** Each required section from FINAL M&A TRAINING PROMPT 030726.md and Hydraforge Design Specification was checked against the actual codebase.

---

## 🔴 CRITICAL MISSING – Cannot Generate Required Output

### 1. Transaction Mapping (Stage 2) — COMPLETELY MISSING
- **Required:** Entity extraction (Buyer/Seller/Target/Parent/Guarantors/Equity holders), transaction structure classification, economics mapping (purchase price, escrow, holdbacks, earnout, working capital, net debt, rollover equity), timeline extraction (signing, closing, outside date, milestones, regulatory deadlines)
- **Built:** No transaction mapping module exists anywhere in the codebase
- **Impact:** The platform cannot classify deal type or extract key economic terms
- **Fix Required:** Build deal-type detection module integrated into the Analyst stage

### 2. Knowledge Graph (Stage 3) — COMPLETELY MISSING
- **Required:** Internal representation connecting defined terms, parties, obligations, conditions, covenants, representations, disclosure schedules, material contracts, regulatory approvals, employees, litigation, tax, IP, environmental, data privacy, financing
- **Built:** No graph database, no relationship tracking between defined terms across documents
- **Impact:** Cannot detect cross-referencing inconsistencies or missing links between defined terms and their usage
- **Fix Required:** Add Neo4j or equivalent graph layer, or implement in-memory graph tracking

### 3. Cross-Document Consistency (Stage 6) — COMPLETELY MISSING
- **Required:** Compare all supplied documents for defined term consistency, cross-references, section numbering, dates, dollar amounts, share counts, signatories, disclosure schedules, financial statements, annexes, amendments
- **Built:** Single-document analysis only, no multi-document comparison
- **Impact:** Cannot detect conflicts across multiple documents in a transaction
- **Fix Required:** Build cross-document comparison engine

### 4. Red Flag Engine (Stage 7) — COMPLETELY MISSING
- **Required:** 24 categories: Corporate Governance, Regulatory, Tax, Employment, IP, Cybersecurity, Privacy, Environmental, Litigation, Sanctions, Corruption, Accounting, Debt, Change of Control, Third-Party Consents, Customer Concentration, Supplier Concentration, Earnout Manipulation, Working Capital Manipulation, Related-Party Transactions
- **Built:** No dedicated red flag engine; some flags are embedded in the LLM prompt
- **Impact:** Missing systematic red flag detection across all 24 categories
- **Fix Required:** Build dedicated red flag detection module with risk rating system

### 5. Regulatory Analysis (Stage 8) — COMPLETELY MISSING
- **Required:** Identify applicable regulatory framework (Delaware corporate law, Federal securities, HSR, FTC, DOJ, CFIUS, OFAC, FCPA, Export controls, Privacy laws, Employment law, Tax law, Environmental law, Industry-specific regulation)
- **Built:** No regulatory analysis module
- **Impact:** Cannot provide regulatory compliance assessment
- **Fix Required:** Build regulatory framework detection and compliance analysis module

### 6. Litigation Risk Assessment (Stage 9) — COMPLETELY MISSING
- **Required:** 12 areas: Shareholder claims, Appraisal actions, Fiduciary duty claims, Disclosure litigation, Antitrust challenges, Regulatory investigations, Earnout disputes, Purchase price adjustment disputes, Fraud allegations, Tax disputes, Employment claims, IP disputes, Environmental claims
- **Built:** No litigation risk assessment module
- **Impact:** Cannot assess litigation risk for each identified issue
- **Fix Required:** Build litigation risk assessment module

### 7. CORS Misconfiguration — CRITICAL SECURITY ISSUE
- **Required:** CORS locked to exact frontend domain — no wildcards
- **Built:** `CORSMiddleware` with `allow_origins=["*"]` (wildcard)
- **Impact:** Any website can call the API, enabling CSRF and data exfiltration attacks
- **Fix Required:** Replace `["*"]` with the exact frontend origin domain

### 8. File Size Mismatch — DEPLOYMENT BLOCKER
- **Required:** Maximum file size: 50MB (per design spec)
- **Built:** FastAPI endpoint limits to 10MB, no limit in Hono API
- **Impact:** Inconsistent behavior between API endpoints, potential denial of service
- **Fix Required:** Standardize file size limit to 50MB across all endpoints

### 9. Rate Limiting — MISSING
- **Required:** Rate limiting on all endpoints (60 req/min general, 5 req/min auth)
- **Built:** No rate limiting middleware in Hono router
- **Impact:** API has no protection against abuse or DDoS
- **Fix Required:** Implement rate limiting middleware (e.g., using `hono-rate-limiter`)

### 10. LLM Privacy — MISSING
- **Required:** `anthropic-beta: no-training` header on every request
- **Built:** Uses OpenRouter with Gemini models, no training opt-out header
- **Impact:** Document content may be used for model training by the LLM provider
- **Fix Required:** Add `anthropic-beta: no-training` header or equivalent provider-specific opt-out

---

## 🟡 PARTIAL IMPLEMENTATION — Needs Enhancement

### 11. Clause Review Engine — Incomplete
- **Required:** 12 clause categories (Corporate Authority, Reps & Warranties, Covenants, Conditions to Closing, MAE, Purchase Price Mechanics, Indemnification, Termination Rights, Disclosure Letters, Regulatory Approvals, Boilerplate, Definitions)
- **Built:** Python engine has 12 detection methods (indemnification, earnout, termination, reps/warranties, assumption of liabilities, definitions, boilerplate, contradictions, operational risks, covenants, escrow/security, documentation quality). Hono API uses LLM prompt-based analysis that covers most categories implicitly
- **Gap:** No structured clause-by-clause review output format matching spec
- **Fix Required:** Add clause-by-clause structured review output aligned with spec Section 5 categories

### 12. Report Sections — Incomplete (10 of 18 missing)
Sections PRESENT in generated output: Executive Summary, Critical Risks, Purchase Price Breakdown, Indemnity Stack, Earnout Risk Analysis, MAE Analysis, Interaction-Weighted Risk Analysis, Litigation Realism Assessment, Closing Conditions Rigor Test, Contradictions & Cross-Article Traps

Sections MISSING from generated output:
- Transaction Overview ❌
- Material Legal Issues ❌
- Commercial Risk Allocation ❌
- Regulatory Analysis (as standalone section) ❌
- Financial Risk Allocation ❌
- Cross-Document Consistency Findings ❌
- Missing Information ❌
- Questions for Client or Deal Team ❌
- Negotiation Opportunities ❌
- Overall Risk Assessment ❌
- Confidence Assessment ❌
- Supporting Authorities ❌
- Source Citations ❌
- Appendix of Supporting Evidence ❌

### 13. Legal Perspective Analysis — Incomplete
- **Required:** Six independent perspectives (Legal Enforceability, Commercial Allocation of Risk, Negotiation Leverage, Regulatory Compliance, Litigation Risk Assessment, Transaction Mechanics)
- **Built:** Three LLM layers (Analyst, Critic, Adjudicator) with deal-type-specific framing
- **Gap:** Only 3 analytical perspectives, not 6
- **Fix Required:** Add perspectives for Regulatory Compliance, Negotiation Leverage, and Transaction Mechanics

### 14. Document Ingestion — Incomplete
- **Required:** Document type identification, version tracking, execution status, governing law, effective date, parties, affiliates, related agreements, missing schedules/exhibits/amendments, OCR quality concerns, illegible sections, duplicate files
- **Built:** File upload with SHA-256 dedup, basic PDF text extraction, file hash for dedup
- **Gap:** No document inventory output, no OCR quality assessment, no version tracking, no execution status detection, no party extraction, no missing schedules listing
- **Fix Required:** Add document inventory stage to the analysis pipeline

### 15. Security Controls — Partially Implemented
- **Implemented:** JWT auth, httpOnly cookies, bcrypt password hashing, rate limit bypass via Autumn
- **Missing:** CORS locked to domain, presigned URLs with expiry, rate limiting on endpoints, 5-failed-login lockout, audit trail for all admin actions, append-only audit logging, GDPR cascade deletion endpoint

### 16. Validation Framework — Partial
- **Implemented:** `validateScore()` function with Tier-based floors, interaction-stack detection, drift correction
- **Missing:** Hallucination rate testing, clause extraction accuracy tests, retrieval precision/recall benchmarks, issue spotting accuracy, confidence calibration tests

### 17. Versioned Prompt Management — Minimal
- **Implemented:** `VERSION = "1.0.1-final-fix"` constant, separate prompt files
- **Missing:** Version management system, changelog, reviewer/approval workflow, benchmark results tracking, prompt version storage

### 18. Audit Logging — Basic
- **Implemented:** `auditLogs` table with user_id, action, resource_type, resource_id, ip_address, metadata, created_at
- **Missing:** Audit logging on all endpoints (only partial), append-only enforcement, read-only admin access to logs, log retention policy

---

## ✅ WHAT IS WELL IMPLEMENTED

1. **3-Layer LLM Pipeline** — Analyst → Critic → Adjudicator with structured JSON outputs and cross-layer reconciliation
2. **SHA-256 Deduplication** — Prevents re-processing duplicate content
3. **Score Validation** — `validateScore()` with tier-based floors, interaction stacking, drift detection
4. **Deal-Type Classification** — Structured classification (STATUTORY_MERGER, EQUITY_PURCHASE, ASSET_PURCHASE)
5. **Perspective Handling** — BUYER/SELLER perspective framing with specific guidance for each
6. **Vertical-Specific Checks** — Tech/SaaS, Manufacturing, Healthcare, Financial Services, Real Estate checklists embedded in prompts
7. **Anti-Hallucination Rules** — 12 anti-hallucination rules and inference discipline rules in prompts
8. **Synthesis Gates** — SYNC-01 through SYNTH-04 logic gates for compound risk analysis
9. **Interaction-Weighted Scoring** — Multiplicative compounding of risk factors
10. **Report Markdown Generation** — Structured markdown output with all major sections
11. **Autumn Billing Integration** — Quota tracking via Autumn billing system
12. **Better Auth** — JWT auth with httpOnly cookies, password hashing, refresh token rotation

---

## 🔧 DEPLOYMENT-CRITICAL FIXES NEEDED

1. **CORS wildcard** — Fix `allow_origins=["*"]` → restrict to frontend domain
2. **Rate limiting** — Add middleware to all API endpoints
3. **File size enforcement** — Standardize to 50MB limit
4. **LLM training opt-out** — Add no-training header for privacy compliance
5. **App key missing** — Need `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` in `.env` for any LLM functionality
6. **Neon database connection** — Spec says Neon PostgreSQL, but schema uses SQLite (drizzle/sqlite-core) → needs migration to Postgres for production deployability
7. **R2 configuration** — Cloudflare R2 bucket not configured (no bucket name, no credentials in code)
8. **Stripe configuration** — No Stripe keys in `.env.example`
9. **Environment variables** — `.env.example` is incomplete; missing OpenRouter key, R2 credentials, Stripe keys
10. **Missing Docker deployment** — `Dockerfile` exists but may not be production-ready