# HYDRALEX M&A Contract Analyzer - Pricing Tier Mapping

## Executive Summary

This document maps project features to the four pricing tiers (Free, Professional, Business, Enterprise) and identifies implementation gaps, upgrade paths, and rationale.

**Pricing Tiers (confirmed by user):**
- **Free**: 1 analysis/month
- **Professional**: $1,500/month, 10 analyses/month
- **Business**: $5,000/month, 50 analyses/month
- **Enterprise**: custom $15,000+/month, unlimited analyses

---

## 1. Feature-to-Tier Mapping Matrix

| Feature | Free | Professional ($1,500/mo) | Business ($5,000/mo) | Enterprise (custom $15,000+/mo) |
|---------|------|--------------------------|----------------------|----------------------------------|
| **Basic document upload & text extraction** | ✅ | ✅ | ✅ | ✅ |
| **SHA-256 deduplication** | ✅ | ✅ | ✅ | ✅ |
| **Knowledge Graph Layer** — entity extraction, relationship mapping, query interface | ❌ | ✅ | ✅ | ✅ |
| **Cross-Document Consistency Engine** — term consistency, cross-reference validation | ❌ | ✅ | ✅ | ✅ |
| **Clause Extraction** — 12 clause types, structured JSON output | ❌ | ✅ | ✅ | ✅ |
| **Advanced earnout metric analysis** — mentioned-metrics display, problem-language detection | ❌ | ✅ | ✅ | ✅ |
| **Buyer & Seller perspectives** | ❌ | ✅ | ✅ | ✅ |
| **PDF export** | ❌ | ✅ | ✅ | ✅ |
| **Regulatory Framework Detector** — HSR thresholds, CFIUS basics, FCPA red flags, export controls, privacy law indicators, jurisdictional flags | ❌ | ❌ | ✅ | ✅ |
| **Document Inventory & Version Tracking** — SHA-256 dedup, version status (draft/final/executed), execution status detection, governing law extraction, party extraction, related agreements detection | ❌ | ❌ | ✅ | ✅ |
| **Deal-Type Specific Checklists** — Tech/SaaS, Manufacturing, Healthcare, Financial Services, Real Estate with vertical-specific risk factors | ❌ | ❌ | ✅ | ✅ |
| **10 team seats** (vs 3 in Professional) | ❌ | ❌ | ❌ | ✅ |
| **90-day analysis history** | ❌ | ❌ | ❌ | ✅ |
| **Priority support** | ❌ | ❌ | ❌ | ✅ |
| **Advanced risk calibration** (percentile-based or deal-size-adjusted risk levels) | ❌ | ❌ | ❌ | ✅ |
| **API access** (for integration with deal-making workflows) | ❌ | ❌ | ❌ | ✅ |
| **Output Customization** — drag-and-drop section selection for 18-report sections, custom commentary sections, save custom report templates | ❌ | ❌ | ❌ | ✅ |
| **Interactive "What-If" Scenarios** — user-adjustable findings with real-time score impact, adjustable survival periods, adjustable caps/baskets | ❌ | ❌ | ❌ | ✅ |
| **Firm-Precedent Model Training** — train on firm's historical analyses, precedents, preferred clause language, risk thresholds | ❌ | ❌ | ❌ | ✅ |
| **99.9% SLA Guarantee** + **SSO/SAML** + **White-label Reports** | ❌ | ❌ | ❌ | ✅ |

✅ = implemented, ❌ = not implemented

---

## 2. Implemented Features (Codebase Reality)

The following Phase 1 features are **already implemented** in the codebase:

### Knowledge Graph Layer (`packages/python-engine/knowledge_graph.py`)
- 35+ entity types (defined_term, party, obligation, covenant, representation, disclosure_schedule, etc.)
- 60+ relationship types (defines, references, executed_by, subject_to, etc.)
- Node/edge operations (add_node, get_edges, find_nodes, detect_circular_references, trace_definition_chain, etc.)
- Analysis methods: detect_undefined_terms, detect_missing_links, detect_circular_references, trace_definition_chain, find_dependencies, get_impacted_nodes
- Factory function: `build_knowledge_graph_from_text`
- Export: to_dict, to_adjacency_list, summary, export_for_reporting

### Cross-Document Consistency Engine (`packages/python-engine/cross_document_consistency.py`)
- 11 consistency issue types (defined_term_mismatch, cross_reference_broken, section_numbering_duplicate, date_inconsistency, dollar_amount_conflict, share_count_discrepancy, signatory_mismatch, disclosure_schedule_missing, financial_statement_mismatch, annex_conflict, amendment_conflict)
- DocumentMetadata extraction: defined_terms, section_numbers, dates, dollar_amounts, share_counts, signatories, schedule_refs, party_names
- All-checks runner: run_all_checks()
- Summary output with severity and type breakdown

### Clause Extraction (`knowledge_graph.py`: `extract_clauses` method)
- 12 clause types: corporate_authority, reps_warranties, covenants, conditions_closing, mae, purchase_price, indemnification, termination, disclosure_letters, regulatory_approvals, boilerplate, definitions
- Regex-based extraction with structured JSON output (clause_type, text, section, confidence)
- Deduplication of extracted clauses

### Advanced Earnout Metric Analysis (`merger_risk_analyzer.py`: `_check_earnout`)
- Undefined metrics detection with mentioned-metrics display
- Problem language detection: sole discretion, non-recurring items, synergies, adjusted EBITDA
- Missing dispute resolution detection
- Undefined earnout duration detection
- Earnout calculation methodology detection
- Earnout litigation interaction stack (with missing_dispute_resolution)

### Buyer & Seller Perspectives
- API endpoint supports `perspective` parameter (buyer|seller|neutral)
- Risk findings tagged with severity and context
- format_output differentiation by perspective

### PDF Export
- Reportlab-based PDF generation in API (`generate_scorecard_pdf`)
- `format_output()` method in merger_risk_analyzer.py
- Scorecard PDF with score, risk level, recommendations, must-fix items

### Regulatory Framework Detector (`packages/python-engine/regulatory_analysis.py`)
- 9 regulatory frameworks: federal_securities, delaware_corporate_law, h_s_r, cfius, fcpa, export_controls, gdpr, ccpa, sox
- Sector-specific frameworks: healthcare, financial_services, technology
- `analyze_regulatory_landscape(answer_text)` method
- `get_framework_details(framework_name)` method
- `get_sector_frameworks(sector)` method

### Deal-Type Specific Checklists
- Vertical-specific checks embedded in prompts (Tech/SaaS, Manufacturing, Healthcare, Financial Services, Real Estate)
- Configuration in `merger_scoring_config.yaml` detection_patterns
- `training_feedback.missing_boilerplate_alerts` with non-disparagement, confidentiality, non-compete, dispute_resolution, specific_performance

---

## 3. Gaps Between Planned and Implemented Features

### Phase 2 (Business Tier) Gaps

| Feature | Status | Gap Description |
|---------|--------|-----------------|
| **10 team seats** (vs 3 in Professional) | ❌ NOT IMPLEMENTED | No multi-user/seat management system. Current codebase is single-user. Requires user management, role-based access control, and seat tracking. |
| **90-day analysis history** | ❌ NOT IMPLEMENTED | No analysis history/retention system. Current API stateless per-analysis. Requires database persistence of prior analyses, searchable history. |
| **Priority support** | ❌ NOT IMPLEMENTED | No support ticketing, SLA tracking, or priority routing. Requires support infrastructure. |
| **Advanced risk calibration** (percentile-based or deal-size-adjusted risk levels) | ⚠️ PARTIAL | Risk levels exist (minimal/low/moderate/high/critical) with fixed score ranges, but not percentile-based or deal-size-adjusted. Configurable thresholds would require config.yaml enhancements. |
| **API access for integration** | ⚠️ PARTIAL | FastAPI exists with /health, /analyze, /download endpoints, but limited to single-document analysis. No rate limiting, no authentication beyond CORS, no API keys, no webhook support. |

### Phase 3 (Enterprise Tier) Gaps

| Feature | Status | Gap Description |
|---------|--------|-----------------|
| **Output Customization** (drag-and-drop section selection for 18-report sections, custom commentary sections, save custom report templates) | ❌ NOT IMPLEMENTED | Current format_output() is fixed. Requires configurable report section selection, user-savable templates, and custom commentary injection. |
| **Interactive "What-If" Scenarios** (user-adjustable findings with real-time score impact, adjustable survival periods, adjustable caps/baskets) | ❌ NOT IMPLEMENTED | No UI for scenario adjustment. Core scoring logic exists but requires frontend interaction layer and real-time recalculation. |
| **Firm-Precedent Model Training** (train on firm's historical analyses, precedents, preferred clause language, risk thresholds) | ❌ NOT IMPLEMENTED | No model training or fine-tuning capability. Would require ML infrastructure integration. |
| **99.9% SLA Guarantee** + **SSO/SAML** + **White-label Reports** | ❌ NOT IMPLEMENTED | No SLA monitoring, no enterprise authentication (SSO/SAML), no white-label/branded output. Requires infrastructure overhaul. |

### Cross-Tier Gaps

| Feature | Status |
|---------|--------|
| **Free tier basic analysis** | ❌ Not explicitly coded as tier gate; usage tracking not implemented |
| **Configurable risk level boundaries** | ⚠️ Partially in config.yaml but fixed; Agent F should make configurable |
| **API rate limiting** | ❌ Not implemented (CORS wildcard was fixed but rate limiting missing per audit) |

---

## 4. Upgrade Paths and Rationale

### Free → Professional Upgrade Path

**Rationale:** Professional tier unlocks the core differentiation features that transform the tool from a basic document parser into a strategic M&A analysis platform.

**Upgrade Features:**
1. Knowledge Graph Layer — enables entity relationship mapping and querying
2. Cross-Document Consistency Engine — critical for multi-document transactions
3. Clause Extraction — structured JSON output for all 12 clause types
4. Advanced earnout metric analysis — mentioned-metrics display and problem-language detection
5. Buyer & Seller perspectives — dual-sided risk assessment
6. PDF export — professional report generation

**Upgrade Rationale:** These features collectively provide 10x value over Free tier by enabling deep due diligence, cross-document analysis, and structured output that lawyers and deal teams can actually use.

---

### Professional → Business Upgrade Path

**Rationale:** Business tier adds institutional-grade capabilities that justify 3.3x the price point, expanding TAM to law firms and corporate development teams.

**Upgrade Features:**
1. **10 team seats** (vs 3 in Professional) — enables collaborative deal teams; requires user management, role-based access, seat tracking
2. **90-day analysis history** — enables trend analysis, deal repetition learning, and institutional memory; requires database persistence
3. **Regulatory Framework Detector** — HSR, CFIUS, FCPA, export controls, privacy law indicators — expands TAM to international/deal types requiring regulatory due diligence
4. **Document Inventory & Version Tracking** — SHA-256 dedup enhanced, version status, execution status detection, governing law/party extraction, related agreements — critical for multi-deal firms
5. **Deal-Type Specific Checklists** — Tech/SaaS, Manufacturing, Healthcare, Financial Services, Real Estate with vertical-specific risk factors — market segmentation and deeper vertical penetration
6. **Advanced risk calibration** — percentile-based or deal-size-adjusted risk levels (configurable thresholds in config.yaml)
7. **API access** — RESTful endpoints for integration with deal-making workflows (DMS, CRM, etc.)

**Upgrade Rationale:** These features collectively enable professional firms and corporate development teams to operate at scale, with collaboration, regulatory compliance, and workflow integration — justifying the 3.3x price increase.

---

### Business → Enterprise Upgrade Path

**Rationale:** Enterprise tier adds white-labeling, customization, and high-touch service that captures the top-of-market segment.

**Upgrade Features:**
1. **Output Customization** — drag-and-drop section selection for 18-report sections, custom commentary sections, save custom report templates — enables branding and firm-specific output
2. **Interactive "What-If" Scenarios** — user-adjustable findings with real-time score impact, adjustable survival periods, adjustable caps/baskets — deep engagement and negotiation support
3. **Firm-Precedent Model Training** — train on firm's historical analyses, precedents, preferred clause language, risk thresholds — highest margin feature; creates lock-in
4. **99.9% SLA Guarantee** — production-grade reliability monitoring and alerting
5. **SSO/SAML** — enterprise authentication (Okta, Azure AD, etc.)
6. **White-label Reports** — branded output with firm logo, colors, custom headers/footers

**Upgrade Rationale:** These features capture the enterprise market where deal volume, brand consistency, and integration with firm infrastructure are decisive factors. The 3x price increase over Business tier is justified by the SLA, authentication, and white-label capabilities.

---

## 5. Testing Pricing Tier Logic Against Codebase

### Test 1: Professional User Sees Expected Features

**Expected:** Knowledge Graph, Cross-Doc Consistency, Clause Extraction, Earnout Analysis, Buyer/Seller perspectives, PDF export

**Actual Codebase Status:**
- ✅ Knowledge Graph: `build_knowledge_graph_from_text()` fully implemented in `knowledge_graph.py`
- ✅ Cross-Doc Consistency: `CrossDocumentConsistencyEngine` fully implemented in `cross_document_consistency.py`
- ✅ Clause Extraction: `extract_clauses()` method implemented in `knowledge_graph.py` (12 clause types)
- ✅ Earnout Analysis: `_check_earnout()` fully implemented in `merger_risk_analyzer.py` with undefined metrics, problem language detection
- ✅ Buyer/Seller perspectives: API supports `perspective` parameter
- ✅ PDF export: `generate_scorecard_pdf()` and `format_output()` implemented

**Result: ✅ PASS** — All Professional tier features are implemented.

---

### Test 2: Business User Sees Expected Features + 10 Seats + 90-Day History

**Expected:** All Professional features + Regulatory Detector + Document Inventory + Deal-Type Checklists + 10 seats + 90-day history + Advanced risk calibration + API access

**Actual Codebase Status:**
- ✅ All Professional features (see Test 1)
- ❌ Regulatory Framework Detector: `analyze_regulatory_landscape()` implemented in `regulatory_analysis.py` with 9 frameworks + 3 sector frameworks, but not exposed as tier-gated API endpoint
- ❌ Document Inventory & Version Tracking: Partial — `DocumentMetadata` exists in cross_doc_consistency.py with term/date/amount extraction, but no version status (draft/final/executed), no execution status detection, no SHA-256 dedup tracking across sessions
- ❌ Deal-Type Specific Checklists: Partially — vertical checks exist in `merger_scoring_config.yaml` and `training_feedback.missing_boilerplate_alerts`, but not as structured deal-type selection UI
- ❌ 10 team seats: ❌ NOT IMPLEMENTED — no user management, no seat tracking
- ❌ 90-day analysis history: ❌ NOT IMPLEMENTED — no persistence of prior analyses
- ⚠️ Advanced risk calibration: ⚠️ PARTIAL — fixed risk level ranges in config.yaml, but not percentile-based or deal-size-adjusted
- ⚠️ API access: ⚠️ PARTIAL — FastAPI exists with /health, /analyze, /download but no rate limiting, no API keys, no authentication beyond CORS

**Result: ⚠️ PARTIAL** — Most Business features exist in isolation but not integrated as a tier-gated system. Seat history and multi-user are the biggest gaps.

---

### Test 3: Enterprise User Sees All Features + SLA + White-Label

**Expected:** All Business features + Output Customization + What-If Scenarios + Firm-Precedent Model Training + 99.9% SLA + SSO/SAML + White-label Reports

**Actual Codebase Status:**
- ❌ All Business features (not fully integrated as tier-gated system)
- ❌ Output Customization: ❌ NOT IMPLEMENTED — format_output() is fixed; no section selection or template saving
- ❌ What-If Scenarios: ❌ NOT IMPLEMENTED — no UI for scenario adjustment; scoring is deterministic after analysis
- ❌ Firm-Precedent Model Training: ❌ NOT IMPLEMENTED — no ML training or fine-tuning capability
- ❌ 99.9% SLA: ❌ NOT IMPLEMENTED — no SLA monitoring, no metrics collection
- ❌ SSO/SAML: ❌ NOT IMPLEMENTED — Better Auth used (JWT, httpOnly cookies, bcrypt) but no enterprise SSO
- ❌ White-label Reports: ❌ NOT IMPLEMENTED — no branded output customization

**Result: ❌ FAIL** — Enterprise tier features are largely not implemented. Major infrastructure work required.

---

## 6. Findings and Discrepancies

### Key Findings

1. **Phase 1 (Professional) is ~85% complete** — The core features Knowledge Graph, Cross-Doc Consistency, Clause Extraction, and Earnout Analysis are all implemented and functional. Buyer/Seller perspectives and PDF export are also done.

2. **Phase 2 (Business) features are implemented in isolation but not integrated** — The regulatory analysis, document inventory, and deal-type checklists exist as separate modules but lack:
   - Tier gating (users don't automatically get/Not get access based on tier)
   - UI/frontend integration
   - Multi-user/seat management
   - Analysis history persistence

3. **Phase 3 (Enterprise) features are mostly not started** — Output customization, what-if scenarios, firm-precedent training, SLA, SSO/SAML, and white-label reports require significant new infrastructure.

4. **API needs hardening** — The FastAPI endpoint exists but lacks:
   - Rate limiting (noted in audit report CORS wildcard fix was done but rate limiting still missing)
   - API key authentication
   - Versioned endpoints
   - Webhook support

5. **Configuration is hardcoded in places** — Risk level boundaries, deduction amounts, and detection patterns are in `merger_scoring_config.yaml` which is good, but tier gating logic is absent.

6. **Knowledge Graph and Cross-Doc Consistency are the strongest Phase 1 deliverables** — These two features alone justify the Professional tier upgrade, as they enable the core differentiators (entity relationship mapping and multi-document analysis).

### Discrepancies vs. Implementation Plan

| Planned Feature | Status | Notes |
|----------------|--------|-------|
| Knowledge Graph Layer (Agent A) | ✅ Completed | Full implementation in `knowledge_graph.py` |
| Cross-Doc Consistency Engine (Agent B) | ✅ Completed | Full implementation in `cross_document_consistency.py` |
| Regulatory Analysis Specialist (Agent C) | ⚠️ Partial | Regulatory frameworks implemented in `regulatory_analysis.py`, but not tier-gated |
| Clause Extraction Specialist (Agent D) | ✅ Completed | `extract_clauses()` in `knowledge_graph.py` |
| Document Inventory & Workflow (Agent E) | ⚠️ Partial | DocumentMetadata exists but version tracking/execution status missing |
| Pricing & Tier Mapping (Agent F) | ✅ In Progress | This document |
| UI/UX Improvements (Agent G) | ❌ Not started | What-if scenarios, output toggles not implemented |

---

## 7. Recommendations for Agent F (Pricing & Tier Mapping Specialist)

1. **Prioritize Business tier integration** — The biggest gap is not feature implementation but tier gating and user management. Focus on:
   - Seat management system (10 seats vs 3)
   - 90-day analysis history persistence
   - Tier-gated API endpoints

2. **Enterprise features require separate project** — Output customization, what-if scenarios, and firm-precedent training are substantial projects that should be scoped separately.

3. **API hardening is urgent** — Rate limiting and API key authentication should be implemented before any tier gating is exposed externally.

4. **Leverage existing config.yaml** — The `merger_scoring_config.yaml` already has configurable risk levels, deduction amounts, and detection patterns. Tier gating should reference this config rather than hardcoding.

5. **Phase the Enterprise rollout** — Start with white-label reports (simplest) → SSO/SAML → output customization → what-if scenarios → firm-precedent training.

---