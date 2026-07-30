# Reference Map: Training Prompt vs. Built Platform

**Generated:** 2026-07-30  
**Scope:** Comparison of FINAL M&A TRAINING PROMPT 030726.md (design spec) vs. implemented codebase

---

## 🎯 12-Stage Analysis Pipeline (Training Prompt Requirement)

| Stage | Requirement | Built Artifact | Status |
|-------|-------------|----------------|--------|
| **Stage 0: Master System Constitution** | Evidence-based legal analysis engine, constitutional principles | N/A | ❌ MISSING |
| **Stage 1: Document Ingestion** | Document type, version, execution status, governing law, parties, affiliates, related agreements, missing schedules/exhibits/amendments, OCR quality, illegible sections, duplicates | `packages/web/src/routes/analyses.ts` (upload endpoint), `packages/web/src/lib/pdf.ts` | ⚠️ PARTIAL - Basic upload exists, missing full document inventory |
| **Stage 2: Transaction Mapping** | Entities (Buyer/Seller/Target/Parent/Guarantors/Equity holders), Structure (Stock/Asset/Merger/Tender/JV/Spin-off/Carve-out), Economics (Purchase price, Escrow, Holdbacks, Earnout, Working capital, Net debt, Rollover equity), Timeline (Signing, Closing, Outside date, Milestones, Regulatory deadlines) | N/A | ❌ MISSING |
| **Stage 3: Knowledge Graph** | Defined terms, Parties, Obligations, Conditions, Covenants, Representations, Disclosure schedules, Material contracts, Regulatory approvals, Employees, Litigation, Tax, IP, Environmental, Data privacy, Financing | N/A | ❌ MISSING |
| **Stage 4: Legal Analysis Engine** | Six independent perspectives: Legal Enforceability, Commercial Allocation of Risk, Negotiation Leverage, Regulatory Compliance, Litigation Risk Assessment, Transaction Mechanics | `packages/web/src/lib/openrouter.ts` (Analyst, Critic, Adjudicator functions) | ⚠️ PARTIAL - Only 3 perspectives implemented |
| **Stage 5: Clause Review Engine** | 12 categories: Corporate Authority, Reps & Warranties, Covenants, Conditions to Closing, Material Adverse Effect, Purchase Price Mechanics, Indemnification, Termination Rights, Disclosure Letters, Regulatory Approvals, Boilerplate, Definitions | `packages/python-engine/merger_risk_analyzer.py` (detection methods) | ⚠️ PARTIAL - Only 8 detection methods, no full clause review |
| **Stage 6: Cross-Document Consistency** | Defined terms, Cross references, Section numbering, Dates, Dollar amounts, Share counts, Signatories, Disclosure schedules, Financial statements, Annexes, Amendments | N/A | ❌ MISSING |
| **Stage 7: Red Flag Engine** | 24 categories: Corporate Governance, Regulatory, Tax, Employment, IP, Cybersecurity, Privacy, Environmental, Litigation, Sanctions, Corruption, Accounting, Debt, Change of Control, Third-Party Consents, Customer Concentration, Supplier Concentration, Earnout Manipulation, Working Capital Manipulation, Related-Party Transactions | N/A | ❌ MISSING |
| **Stage 8: Regulatory Analysis** | Delaware corporate law, Federal securities, HSR, FTC, DOJ, CFIUS, OFAC, FCPA, Export controls, Privacy laws, Employment law, Tax law, Environmental law, Industry-specific regulation | N/A | ❌ MISSING |
| **Stage 9: Litigation Risk Assessment** | Shareholder claims, Appraisal actions, Fiduciary duty claims, Disclosure litigation, Antitrust challenges, Regulatory investigations, Earnout disputes, Purchase price disputes, Fraud allegations, Tax disputes, Employment claims, IP disputes, Environmental claims | N/A | ❌ MISSING |
| **Stage 10: Negotiation Analysis** | Buyer leverage, Seller leverage, Missing protections, One-sided provisions, Alternative drafting, Commercial compromises, Market alternatives | N/A | ❌ MISSING |
| **Stage 11: Quality Assurance** | Every material conclusion has evidence, citations exist, no fabricated language, no unsupported assumptions, definitions checked, disclosure schedules reviewed, conflicting evidence addressed, confidence matches evidence, unknowns identified | N/A | ❌ MISSING |
| **Stage 12: Final Report** | 18 sections: Executive Summary, Transaction Overview, Critical Risks, Material Legal Issues, Commercial Risk Allocation, Regulatory Analysis, Financial Risk Allocation, Clause-by-Clause Review, Cross-Document Consistency Findings, Missing Information, Questions for Client, Negotiation Opportunities, Litigation Risk Assessment, Overall Risk Assessment, Confidence Assessment, Supporting Authorities, Source Citations, Appendix of Supporting Evidence | `packages/web/src/lib/openrouter.ts` (runAdjudicator output) | ⚠️ PARTIAL - Some sections present, missing many |

---

## 📊 System Checklist Items

| Item | Requirement | Built | Status |
|------|-------------|-------|--------|
| Document ingestion and OCR | Full ingestion pipeline | Basic upload only | ❌ MISSING |
| Clause extraction | Structured extraction | Regex-based in Python | ⚠️ PARTIAL |
| Semantic indexing | Vector embeddings | N/A | ❌ MISSING |
| Retrieval-Augmented Generation (RAG) | RAG pipeline | N/A | ❌ MISSING |
| Legal knowledge base | Curated legal repository | N/A | ❌ MISSING |
| Citation verification | Citation checking | N/A | ❌ MISSING |
| Knowledge graph | Neo4j/graph database | SQLite only | ❌ MISSING |
| Jurisdiction engine | Jurisdictional analysis | N/A | ❌ MISSING |
| Risk scoring engine | Multi-layer scoring | 3-layer LLM + Python scoring | ⚠️ PARTIAL |
| Evaluation framework | Continuous testing | Tests exist for Python only | ⚠️ PARTIAL |
| Versioned prompt management | Prompt versioning | Version in code only | ⚠️ PARTIAL |
| Audit logging | Append-only audit logs | `auditLogs` table exists | ⚠️ PARTIAL |
| Human review workflow | Human-in-the-loop | Not implemented | ❌ MISSING |
| API | REST API | FastAPI + Hono | ✅ PRESENT |
| Web interface | React frontend | Vite/React/Tailwind | ✅ PRESENT |

---

## 🔐 Security Architecture

| Component | Spec Requirement | Built | Status |
|-----------|------------------|-------|--------|
| HTTPS everywhere | HSTS headers | N/A (frontend only) | ⚠️ PARTIAL |
| CORS locked to frontend domain | Strict CORS | `CORSMiddleware` with `allow_origins=["*"]` | ❌ MISCONFIGURED |
| JWT access tokens: 15-minute TTL | 15-min JWT | Better Auth (configurable) | ⚠️ PARTIAL |
| JWT refresh tokens: 7-day TTL | 7-day refresh | Better Auth (configurable) | ⚠️ PARTIAL |
| httpOnly, Secure, SameSite=Strict cookies | XSS-proof storage | Better Auth (configurable) | ⚠️ PARTIAL |
| Passwords hashed with bcrypt, cost factor 12 | bcrypt | Better Auth (default) | ✅ PRESENT |
| Refresh token invalidated on logout/rotated | Security rotation | Better Auth (configurable) | ⚠️ PARTIAL |
| 5 failed logins → 15-min lockout | Account lockout | Better Auth (configurable) | ⚠️ PARTIAL |
| R2 AES-256 encryption | File encryption | Cloudflare R2 (external) | ⚠️ PARTIAL |
| R2 private bucket | No public access | Needs config | ⚠️ PARTIAL |
| Presigned URLs 15-min expiry | Secure access | Not implemented | ❌ MISSING |
| Files accessed via SHA-256 dedup | Content-based dedup | Implemented | ✅ PRESENT |
| Rate limiting: 60 req/min general, 5 req/min auth | API protection | Not implemented | ❌ MISSING |
| Pydantic input validation | Request validation | TypeScript validation | ⚠️ PARTIAL |
| Magic-byte PDF validation | File validation | Basic MIME check | ⚠️ PARTIAL |
| Max file size: 50MB | Size limit | 10MB in FastAPI, no limit in web | ❌ MISCONFIGURED |
| SQL injection prevention | ORM only | Drizzle ORM (SQLite) | ✅ PRESENT |
| Admin endpoints rate-limited | Admin protection | Not implemented | ❌ MISSING |
| `anthropic-beta: no-training` header | LLM privacy | Not used | ❌ MISSING |
| Document text not logged | No logging | Console logs present | ⚠️ PARTIAL |
| Audit trail | Full audit log | Basic auditLogs table | ⚠️ PARTIAL |

---

## 📋 Frontend Report Sections (Spec Requirements)

| Section | Required | Built | Status |
|---------|----------|-------|--------|
| Executive Summary | ✅ | ✅ (`executiveSummary` field) | ✅ |
| Transaction Overview | ✅ | ❌ | ❌ MISSING |
| Critical Risks | ✅ | ✅ (Critical Findings) | ✅ |
| Material Legal Issues | ✅ | ❌ | ❌ MISSING |
| Commercial Risk Allocation | ✅ | ❌ | ❌ MISSING |
| Regulatory Analysis | ✅ | ❌ | ❌ MISSING |
| Financial Risk Allocation | ✅ | ❌ | ❌ MISSING |
| Clause-by-Clause Review | ✅ | ❌ | ❌ MISSING |
| Cross-Document Consistency Findings | ✅ | ❌ | ❌ MISSING |
| Missing Information | ✅ | ❌ | ❌ MISSING |
| Questions for Client or Deal Team | ✅ | ❌ | ❌ MISSING |
| Negotiation Opportunities | ✅ | ❌ | ❌ MISSING |
| Litigation Risk Assessment | ✅ | ❌ | ❌ MISSING |
| Overall Risk Assessment | ✅ | ✅ (Score/Risk Level) | ✅ |
| Confidence Assessment | ✅ | ❌ | ❌ MISSING |
| Supporting Authorities | ✅ | ❌ | ❌ MISSING |
| Source Citations | ✅ | ❌ | ❌ MISSING |
| Appendix of Supporting Evidence | ✅ | ❌ | ❌ MISSING |

---

## 🏗️ Key Implementation Gaps Summary

### Critical Gaps (❌)
1. **Knowledge Graph** - No Neo4j/graph database, no relationship tracking
2. **RAG System** - No vector database, no embedding pipeline
3. **Red Flag Engine** - No 24-category risk detection
4. **Regulatory/Litigation Analysis** - Not implemented
5. **Cross-Document Consistency** - Not implemented
6. **Document Inventory** - Incomplete (missing many fields from Stage 1)
7. **Transaction Mapping** - Not implemented
8. **Security Controls** - CORS misconfigured, rate limiting missing, no presigned URLs
9. **Audit Trail** - Incomplete implementation
10. **Versioned Prompt Management** - Not implemented

### Partial Implementation (⚠️)
1. **Clause Review** - Only 8 detection methods, missing many categories
2. **Report Sections** - Missing 14 of 18 required sections
3. **Legal Perspectives** - Only 3 of 6 perspectives implemented
4. **File Processing** - Limited PDF extraction, no OCR quality assessment
5. **Prompt Management** - Version in code only, no management system

### Present (✅)
1. **API** - REST API with FastAPI/Hono
2. **Web Interface** - React/Vite frontend
3. **Basic Analysis** - 3-layer LLM pipeline
4. **Authentication** - Better Auth integration
5. **Database** - SQLite with Drizzle ORM
6. **Score Validation** - validateScore function present
7. **SHA-256 Deduplication** - Implemented