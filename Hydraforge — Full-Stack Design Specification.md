# ***Hydraforge — Full-Stack Design Specification***

***260426***

\#\# 1\. Product Overview

Hydraforge is a production-grade, enterprise-facing web platform for M\&A legal document verification. Users upload PDF legal documents and receive a triple-layer AI analysis: three independent Claude passes, each with a distinct analytical role, culminating in an authoritative consensus report with risk scoring, clause-by-clause breakdown, and executive summary.

\*\*Target market:\*\* M\&A law firms, in-house M\&A teams at PE firms and strategic acquirers, boutique M\&A advisory shops, independent practitioners.

\*\*Core value proposition:\*\* The equivalent of a junior associate, senior associate, and partner all reviewing the same document — in under 5 minutes, for a fraction of the cost.

\*\*Design philosophy:\*\* Security-first. Legal documents are pre-announcement deal material. Every architectural decision must treat data as highly sensitive.

\---

\#\# 2\. System Architecture

\`\`\`  
┌─────────────────────────────────────────────────────────────┐  
│                    FRONTEND (Vercel)                        │  
│  React 19 \+ TypeScript \+ Tailwind \+ Vite                    │  
│  GLM5VTURBO visual design · GLM5 code architecture          │  
└──────────────────────┬──────────────────────────────────────┘  
                       │ HTTPS only · CORS locked to frontend domain  
                       ▼  
┌─────────────────────────────────────────────────────────────┐  
│                  BACKEND (Render)                           │  
│  Python FastAPI · JWT auth · Rate limiting · Audit logging  │  
│                                                             │  
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │  
│  │  Auth API   │  │ Document API │  │   Analysis API    │  │  
│  └─────────────┘  └──────────────┘  └───────────────────┘  │  
│  ┌────────────────────────────────────────────────────────┐ │  
│  │         LLM Pipeline (FastAPI BackgroundTasks)         │ │  
│  │  Pre-screen → Layer 1 → Layer 2 → Layer 3 → Consensus │ │  
│  └────────────────────────────────────────────────────────┘ │  
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │  
│  │  Admin API  │  │  Stripe API  │  │   SSE Endpoint    │  │  
│  └─────────────┘  └──────────────┘  └───────────────────┘  │  
└───────┬────────────────┬─────────────────┬─────────────────┘  
        │                │                 │  
        ▼                ▼                 ▼  
┌──────────────┐  ┌─────────────┐  ┌──────────────────────┐  
│    Neon      │  │ Cloudflare  │  │   External Services  │  
│  PostgreSQL  │  │     R2      │  │  Anthropic Claude API│  
│  (metadata,  │  │  (PDFs,     │  │  Stripe Payments     │  
│  users,      │  │  reports —  │  │  Resend Email        │  
│  audit logs) │  │  AES-256)   │  │                      │  
└──────────────┘  └─────────────┘  └──────────────────────┘  
\`\`\`

\#\#\# Technology Stack

| Layer | Technology | Rationale |  
|-------|-----------|-----------|  
| Frontend | React 19, TypeScript, Tailwind, Vite | Existing codebase, excellent DX |  
| Backend | Python FastAPI | Best PDF tooling, clean async, first-class Anthropic SDK |  
| Database | Neon PostgreSQL | Serverless, free tier generous, scales cleanly |  
| File storage | Cloudflare R2 | S3-compatible, zero egress fees, AES-256 at rest |  
| LLM | Anthropic Claude (claude-sonnet-4-6) | 200K context window, temp=0 deterministic, best legal reasoning |  
| Payments | Stripe | Industry standard, webhook reliability, customer portal |  
| Email | Resend | Simple API, 3K free emails/month, excellent deliverability |  
| Frontend deploy | Vercel | Free, global CDN, instant deploys |  
| Backend deploy | Render | $7/month starter, managed TLS, health checks |

\---

\#\# 3\. Security Architecture

Security is not a feature — it is a foundational constraint. M\&A documents are pre-announcement deal material whose exposure could move markets or trigger legal liability.

\#\#\# Security Layers

\*\*Transport\*\*  
\- HTTPS everywhere, enforced via HSTS headers  
\- CORS locked to the exact frontend domain — no wildcards  
\- TLS 1.2 minimum, TLS 1.3 preferred

\*\*Authentication\*\*  
\- JWT access tokens: 15-minute TTL  
\- JWT refresh tokens: 7-day TTL  
\- Both stored exclusively in httpOnly, Secure, SameSite=Strict cookies — never localStorage (XSS-proof)  
\- Passwords hashed with bcrypt, cost factor 12  
\- Refresh token invalidated on logout and rotated on each use  
\- 5 failed login attempts triggers a 15-minute account lockout

\*\*File Security\*\*  
\- PDFs stored in Cloudflare R2 with server-side AES-256 encryption  
\- R2 bucket is private — no public access under any circumstances  
\- Files accessed exclusively via presigned URLs with 15-minute expiry  
\- R2 object keys are UUIDs — original filenames never exposed in storage paths  
\- Files soft-deleted in DB first, hard-deleted from R2 after 24-hour grace period

\*\*API Security\*\*  
\- Rate limiting on all endpoints (slowapi): 60 req/min per IP general, 5 req/min on auth endpoints  
\- Pydantic input validation on all request bodies  
\- Magic-byte PDF validation on upload (not just MIME type or extension)  
\- Maximum file size: 50MB  
\- SQL injection impossible — SQLAlchemy ORM, no raw queries  
\- Admin endpoints rate-limited separately: 10 req/min, every request audit-logged

\*\*LLM Privacy\*\*  
\- Anthropic API called with \`anthropic-beta: no-training\` header on every request  
\- Document text is never logged at the application layer  
\- Analysis results stored at rest in Neon (AES-256 via Neon's at-rest encryption); executive\_summary and findings JSONB columns treated as sensitive — never returned in list endpoints, only in direct analysis detail requests by the owning user

\*\*Audit Trail\*\*  
\- Every document upload, download, analysis start, export, login, logout, and admin action written to audit\_logs  
\- Audit log table is append-only — no UPDATE or DELETE permissions on this table for the app DB user  
\- Logs include: user\_id, action, resource, IP address, user agent, timestamp

\*\*Data Retention\*\*  
\- Professional tier: 30-day document retention  
\- Business tier: 90-day document retention  
\- Enterprise tier: custom retention policy  
\- Users can manually delete documents at any time  
\- GDPR deletion: cascade through all tables, purge R2 files

\---

\#\# 4\. Database Schema

\`\`\`sql  
CREATE TABLE users (  
  id                    UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
  email                 TEXT UNIQUE NOT NULL,  
  password\_hash         TEXT NOT NULL,  
  name                  TEXT NOT NULL,  
  subscription          TEXT NOT NULL DEFAULT 'free',  
  stripe\_customer\_id    TEXT UNIQUE,  
  docs\_used\_this\_month  INT NOT NULL DEFAULT 0,  
  month\_reset\_at        TIMESTAMPTZ,  
  is\_admin              BOOLEAN NOT NULL DEFAULT FALSE,  
  last\_login\_at         TIMESTAMPTZ,  
  created\_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()  
);

CREATE TABLE documents (  
  id                UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
  user\_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  
  original\_name     TEXT NOT NULL,  
  r2\_key            TEXT NOT NULL UNIQUE,  
  file\_hash         TEXT NOT NULL,  
  file\_size\_bytes   BIGINT NOT NULL,  
  page\_count        INT,  
  status            TEXT NOT NULL DEFAULT 'pending',  
  uploaded\_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),  
  expires\_at        TIMESTAMPTZ,  
  deleted\_at        TIMESTAMPTZ  
);

CREATE INDEX idx\_documents\_user\_id ON documents(user\_id);  
CREATE INDEX idx\_documents\_file\_hash ON documents(file\_hash);

CREATE TABLE analyses (  
  id                  UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
  document\_id         UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,  
  user\_id             UUID NOT NULL REFERENCES users(id),  
  status              TEXT NOT NULL DEFAULT 'queued',  
  overall\_risk\_score  NUMERIC(3,1),  
  consensus\_score     NUMERIC(5,2),  
  final\_verdict       TEXT,  
  executive\_summary   TEXT,  
  error\_message       TEXT,  
  started\_at          TIMESTAMPTZ,  
  completed\_at        TIMESTAMPTZ,  
  created\_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()  
);

CREATE TABLE analysis\_layers (  
  id                     UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
  analysis\_id            UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,  
  layer\_number           INT NOT NULL,  
  role                   TEXT NOT NULL,  
  model                  TEXT NOT NULL,  
  risk\_score             NUMERIC(3,1),  
  confidence             INT,  
  summary                TEXT,  
  findings               JSONB,  
  clauses                JSONB,  
  red\_flags              JSONB,  
  recommendations        JSONB,  
  agreements             JSONB,  
  disputes               JSONB,  
  missed\_items           JSONB,  
  resolved\_disagreements JSONB,  
  critical\_action\_items  JSONB,  
  tokens\_input           INT,  
  tokens\_output          INT,  
  duration\_ms            INT,  
  completed\_at           TIMESTAMPTZ,  
  UNIQUE(analysis\_id, layer\_number)  
);

CREATE TABLE subscriptions (  
  id                    UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
  user\_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  
  stripe\_sub\_id         TEXT UNIQUE NOT NULL,  
  plan                  TEXT NOT NULL,  
  status                TEXT NOT NULL,  
  current\_period\_end    TIMESTAMPTZ NOT NULL,  
  cancel\_at\_period\_end  BOOLEAN NOT NULL DEFAULT FALSE,  
  created\_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),  
  updated\_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()  
);

CREATE TABLE audit\_logs (  
  id            BIGSERIAL PRIMARY KEY,  
  user\_id       UUID REFERENCES users(id),  
  action        TEXT NOT NULL,  
  resource\_type TEXT,  
  resource\_id   UUID,  
  ip\_address    INET,  
  user\_agent    TEXT,  
  metadata      JSONB,  
  created\_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()  
);

CREATE TABLE revoked\_tokens (  
  jti         TEXT PRIMARY KEY,  
  revoked\_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  
  expires\_at  TIMESTAMPTZ NOT NULL  
);

CREATE TABLE system\_settings (  
  key         TEXT PRIMARY KEY,  
  value       JSONB NOT NULL,  
  updated\_by  UUID REFERENCES users(id),  
  updated\_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()  
);  
\`\`\`

\---

\#\# 5\. LLM Pipeline

\#\#\# Pre-Screening Pass  
\- Input: First 2,000 tokens of extracted text  
\- Validates: M\&A document type, clean text extraction, English language, not heavily redacted  
\- On fail: abort immediately, do not consume quota, return clear user-facing error  
\- Cost: \~$0.001 per check

\#\#\# Layer 1 — Primary Analyzer  
\- Role: Comprehensive initial review. Finds everything.  
\- Temperature: 0 (deterministic for legal analysis)  
\- Input: Full document text  
\- Method: Anthropic tool\_use to enforce JSON schema output  
\- Embedded: \~50-term M\&A clause dictionary in system prompt  
\- Confidence gate: if confidence \< 70, abort pipeline with explanation, do not consume quota  
\- Output: document\_type, risk\_score (1.0-10.0), confidence (0-100), summary, findings\[\], clauses{}, red\_flags\[\], recommendations\[\]

\#\#\# Layer 2 — Verification & Challenge  
\- Role: Adversarial reviewer. Assumes Layer 1 missed things.  
\- Temperature: 0  
\- Input: Full document text \+ Layer 1 JSON output  
\- Instruction: challenge, find gaps, identify missed items — not to agree  
\- Focus: earn-out mechanics, MAC clause scope, indemnification caps, non-compete enforceability  
\- Additional output: agreements\[\], disputes\[\], missed\_items\[\]

\#\#\# Layer 3 — Final Review & Synthesis  
\- Role: Senior partner. Authoritative final word.  
\- Temperature: 0  
\- Input: Full document text \+ Layer 1 JSON \+ Layer 2 JSON  
\- Produces: board-ready executive summary, resolves all disputes, issues final\_verdict  
\- Additional output: consensus\_score (0-100), resolved\_disagreements\[\], final\_verdict, executive\_summary (200-400 words), critical\_action\_items\[\]

\#\#\# Pipeline Accuracy Commitments  
1\. M\&A clause dictionary embedded in Layer 1 — anchors analysis to market standards  
2\. Tool-use output enforcement — JSON schema contractually enforced; malformed output impossible  
3\. Confidence gating — wrong document type caught before cost is incurred  
4\. Token budget logging — silent truncation is detectable and alertable  
5\. SHA-256 deduplication — identical documents return cached results instantly

\---

\#\# 6\. Frontend Architecture

\#\#\# Design System (GLM5VTURBO)  
\`\`\`  
Colors:  
  \--bg:        \#05080f   (page background)  
  \--surface:   \#0c1222   (elevated surfaces)  
  \--card:      \#111a2e   (card backgrounds)  
  \--border:    \#1e293b   (borders)  
  \--muted:     \#64748b   (secondary text)  
  \--accent:    \#00d4aa   (primary CTA, active states)  
  \--accent-dk: \#00a885   (accent hover)  
  \--warning:   \#f59e0b  
  \--danger:    \#ef4444  
  \--success:   \#10b981

Typography:  
  Inter — all UI text  
  JetBrains Mono — token counts, risk scores, code

Animations:  
  scan-line · pulse-ring · fadeInUp · float · card-hover glow  
\`\`\`

\#\#\# Project Structure  
\`\`\`  
frontend/  
├── src/  
│   ├── api/  
│   │   ├── client.ts              (axios \+ JWT interceptor \+ silent refresh)  
│   │   ├── auth.ts  
│   │   ├── documents.ts  
│   │   ├── analysis.ts  
│   │   └── payments.ts  
│   ├── components/  
│   │   ├── Layout.tsx  
│   │   ├── Navbar.tsx  
│   │   ├── ProgressPipeline.tsx   (animated 3-layer SSE visualizer)  
│   │   ├── RiskGauge.tsx          (animated radial risk score dial)  
│   │   ├── ClauseBreakdown.tsx    (expandable clause accordion)  
│   │   ├── ThreePanelView.tsx     (side-by-side layer comparison)  
│   │   ├── RedFlagAlert.tsx       (critical issue cards)  
│   │   └── ExportModal.tsx        (export PDF/JSON report)  
│   ├── hooks/  
│   │   ├── useSSE.ts              (SSE with auto-reconnect \+ state replay)  
│   │   ├── useAuth.ts             (auth state \+ token refresh \+ quota)  
│   │   └── useAnalysis.ts         (analysis state machine)  
│   ├── pages/  
│   │   ├── LandingPage.tsx        (GLM5VTURBO design)  
│   │   ├── AuthPages.tsx          (Login \+ Register)  
│   │   ├── DashboardPage.tsx      (history, quota meter, recent analyses)  
│   │   ├── UploadPage.tsx         (drag-drop \+ pre-screening feedback)  
│   │   ├── ProcessingPage.tsx     (live pipeline visualization)  
│   │   ├── ResultsPage.tsx        (three-panel \+ risk gauge \+ export)  
│   │   ├── PricingPage.tsx        (revised tiers \+ Book a Demo CTA)  
│   │   ├── DocumentationPage.tsx  
│   │   └── AdminPages.tsx         (analytics, users, costs, audit logs)  
│   ├── context/  
│   │   └── AppContext.tsx  
│   └── types/  
│       └── index.ts               (mirrors backend Pydantic schemas exactly)  
\`\`\`

\#\#\# Processing Page — SSE Events  
\`\`\`  
event: prescreening   data: {"status": "running"}  
event: layer\_start    data: {"layer": 1, "name": "Primary Analyzer"}  
event: progress       data: {"layer": 1, "tokens": 4821}  
event: layer\_done     data: {"layer": 1, "risk\_score": 6.2, "duration\_ms": 18400}  
event: layer\_start    data: {"layer": 2, "name": "Verification Review"}  
event: layer\_done     data: {"layer": 2, "confidence": 91, "duration\_ms": 22100}  
event: layer\_start    data: {"layer": 3, "name": "Final Synthesis"}  
event: layer\_done     data: {"layer": 3, "verdict": "conditional", "duration\_ms": 19800}  
event: complete       data: {"analysis\_id": "...", "redirect": "/results/..."}  
\`\`\`

\---

\#\# 7\. API Endpoints

\`\`\`  
AUTH  
  POST /api/auth/register         create account \+ welcome email  
  POST /api/auth/login            httpOnly cookie: access \+ refresh tokens  
  POST /api/auth/refresh          silent token rotation  
  POST /api/auth/logout           revoke refresh token  
  GET  /api/auth/me               current user \+ plan \+ quota

DOCUMENTS  
  POST   /api/documents/upload           multipart PDF; pre-screen; SHA-256 dedup  
  GET    /api/documents/                 paginated (user's own only)  
  GET    /api/documents/{id}             metadata \+ status  
  DELETE /api/documents/{id}             soft delete \+ schedule R2 removal  
  GET    /api/documents/{id}/download    15-min presigned R2 URL

ANALYSIS  
  POST /api/analysis/start/{doc\_id}    check quota → queue pipeline  
  GET  /api/analysis/{id}              full results  
  GET  /api/analysis/{id}/stream       SSE real-time progress  
  POST /api/analysis/{id}/export       generate PDF report  
  GET  /api/analysis/history           paginated past analyses

PAYMENTS  
  POST /api/payments/checkout          Stripe Checkout session  
  POST /api/payments/webhook           Stripe events  
  GET  /api/payments/subscription      current plan \+ billing date \+ quota  
  POST /api/payments/portal            Stripe customer portal session  
  POST /api/payments/cancel            cancel at period end

ADMIN (is\_admin required)  
  GET    /api/admin/stats              users, MRR, docs, avg time, success rate  
  GET    /api/admin/users              paginated \+ searchable  
  GET    /api/admin/users/{id}         full detail \+ usage history  
  PATCH  /api/admin/users/{id}         edit plan, toggle admin  
  DELETE /api/admin/users/{id}         GDPR cascade deletion  
  GET    /api/admin/analyses           all analyses, filterable  
  GET    /api/admin/audit-logs         full audit trail  
  GET    /api/admin/costs              token usage → $ per day/week/month  
  GET    /api/admin/health             DB · R2 · Anthropic · Stripe live status

SYSTEM  
  GET /health                          Render health check (unauthenticated)  
\`\`\`

\---

\#\# 8\. Pricing

\#\#\# Tiers

| Plan | Price | Documents/Month | Key Features |  
|------|-------|----------------|--------------|  
| \*\*Free\*\* | $0 | 1 (template only) | Explore UI, see sample results quality |  
| \*\*Professional\*\* | $499/month | 10 | Full pipeline, PDF export, 30-day retention, email support |  
| \*\*Business\*\* | $1,299/month | 50 | \+ 90-day retention, priority support, 5 team seats |  
| \*\*Enterprise\*\* | Custom / from $3,500/month | Unlimited | SLA 99.9%, API access, white-label, SSO/SAML, dedicated onboarding |

Annual billing: 20% discount.

\#\#\# Pricing Rationale  
A junior associate bills at $350–600/hour. M\&A document review: 8–20 hours. Cost to the firm per document: $3,000–$12,000 before client markup. A Professional subscriber at $499/month receives the equivalent of $30,000–$120,000 in associate time. Pricing below $499 signals consumer-grade tooling to this market. Comparable platforms (Kira, Luminance, Harvey AI) charge $1,500–$10,000+/month. Hydraforge enters competitively without underselling.

\#\#\# Stripe Flow  
1\. User clicks "Upgrade" → Checkout session → Stripe-hosted payment page  
2\. checkout.session.completed → subscription row created, plan updated, quota reset  
3\. invoice.payment\_succeeded → monthly quota reset  
4\. invoice.payment\_failed → email user, 3-day grace, then downgrade to free  
5\. customer.subscription.deleted → downgrade at period end, data retained per tier policy

Quota enforced at POST /api/analysis/start — returns HTTP 402 with upgrade link if over limit.

\#\#\# "Book a Demo" CTA  
Enterprise M\&A clients do not self-serve. A "Book a Demo" button appears alongside all paid tiers on the pricing page, capturing deal flow that won't convert through a Checkout button.

\---

\#\# 9\. Admin Panel

\#\#\# Credentials  
\`\`\`  
Email:    admin@hydraforge.com  
Password: HydraForge@Adm1n\#2026\!  
\`\`\`  
Bcrypt-hashed (cost 12\) in DB seed. is\_admin settable only via DB or existing admin — never via the registration API. Rotate after initial deployment.

\#\#\# Sections  
\- \*\*Dashboard\*\* — MRR, active subscriptions, docs processed today/week/month, avg processing time, success rate, today's Anthropic API cost  
\- \*\*Users\*\* — searchable table: name, email, plan, docs used this month, last login. Click-through to full usage history.  
\- \*\*Analyses\*\* — all analyses across all users, filterable by status/date/verdict. Full layer-by-layer results viewable.  
\- \*\*Cost Tracking\*\* — token usage → $ at Anthropic pricing. Cost per analysis. Margin per plan tier. Projected monthly API spend.  
\- \*\*Audit Logs\*\* — append-only, filterable by user/action/date. Read-only. Cannot be deleted.  
\- \*\*System Health\*\* — live status: Neon DB, Cloudflare R2, Anthropic API, Stripe. Red/amber/green indicators.

\---

\#\# 10\. Infrastructure & Cost

\`\`\`  
Service              Provider          Cost  
────────────────────────────────────────────────  
Frontend             Vercel            Free  
Backend API          Render            $7/month  
Database             Neon              Free → $19/month at scale  
File storage         Cloudflare R2     \~$0.50/month at launch  
Email                Resend            Free (3K/month)  
Payments             Stripe            2.9% \+ $0.30/transaction  
LLM per analysis     Anthropic         \~$2–4 per full pipeline run  
────────────────────────────────────────────────  
Fixed cost:          \~$27/month at launch  
Break-even:          1 Professional subscriber  
Margin at 10 subs:   \~$4,960/month gross before API costs  
\`\`\`

\#\#\# Backend Directory Structure  
\`\`\`  
backend/  
├── app/  
│   ├── main.py  
│   ├── config.py  
│   ├── database.py  
│   ├── models/          (user, document, analysis, subscription)  
│   ├── schemas/         (auth, document, analysis)  
│   ├── routers/         (auth, documents, analysis, payments, admin)  
│   ├── services/        (llm\_pipeline, pdf\_processor, r2\_storage, stripe, email)  
│   ├── middleware/      (auth, rate\_limit, audit)  
│   └── prompts/         (prescreening, layer1, layer2, layer3 — versioned)  
├── migrations/          (Alembic)  
├── seed.py  
├── requirements.txt  
└── Dockerfile  
\`\`\`

\---

\#\# 11\. Additions (Carte Blanche)

1\. \*\*Document deduplication\*\* — SHA-256 hash checked before pipeline starts. Duplicate upload returns cached analysis instantly. No API cost, zero wait time.

2\. \*\*Email notifications via Resend\*\* — welcome on register, "analysis ready" with risk score and link, payment failed warning with grace period info, error notification with support contact.

3\. \*\*Real-time cost dashboard for admin\*\* — token usage per layer translated to $ at Anthropic pricing. Shows cost per analysis, margin per plan tier, daily and monthly API spend. Makes pricing decisions data-driven.

4\. \*\*Confidence gating\*\* — Layer 1 confidence \< 70 aborts the pipeline with a clear user-facing explanation. Quota is not consumed on pre-screen failure or confidence failure. Fail fast, fail clearly.

5\. \*\*Processing page as product moment\*\* — the live three-tier pipeline visualization with scan-line animations is the "wow" feature that demonstrates three AIs simultaneously working. Users describe it to colleagues. Retention and referral driver.

6\. \*\*"Book a Demo" CTA\*\* — Enterprise M\&A clients do not self-serve on software purchases. This captures deal flow that would never convert through a Stripe Checkout button.

7\. \*\*Revised pricing\*\* — $499 Professional / $1,299 Business / custom Enterprise vs the originally proposed $99. The target market will distrust a $99 product. The revised price is still dramatically cheaper than the associate time it replaces and is competitive with the enterprise legal AI market.

\---

\#\# 12\. Open Questions

None. All design decisions confirmed. Ready for implementation planning.

\---

\*Designed with the intent that this platform delivers what it promises: analysis so thorough that "almost flawless" is not a marketing claim but a structural guarantee baked into the architecture.\*