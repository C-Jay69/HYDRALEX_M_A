# HYDRALEX M&A — Merger Risk Analysis Platform

Monorepo (Bun workspaces + Turborepo) combining a TypeScript web/API app and a
standalone Python scoring engine for M&A merger-agreement risk review.

## Project Structure

```
.env                         Secrets (gitignored), loaded via Vite's loadEnv
packages/
  web/                       Unified server (API + web frontend via Vite)
    vite.config.ts           Vite 7 config — loads .env, sets port, registers plugins
    index.html               Frontend HTML entry
    vite/plugins/
      hono-dev-plugin.ts     Intercepts /api/* in dev, forwards to Hono via SSR
      runable-analytics-plugin.ts
    src/
      api/
        index.ts             Hono routes (.basePath('api')) + AppType export
        database/
          index.ts           Database client (Turso/LibSQL)
          schema.ts          Drizzle schema
      lib/
        analysis-modules.ts  Deterministic staged analysis (KG, regulatory, litigation,
                             party-integrity, readiness gate, red flags)
        openrouter.ts        LLM pipeline (Analyst / Critic / Adjudicator) + prompts
        qa-guardrails.ts     Deterministic prompt-compliance + terminology checks
      routes/analyses.ts     Pipeline wiring
      prompts/master_prompt.md  Master analyst prompt
      web/
        main.tsx             App entry
        app.tsx              Root component + Wouter routing
        pages/               Page components
        components/          UI components
        hooks/use-desktop.ts Desktop detection
        lib/{api,desktop,utils}.ts
        styles.css           Tailwind CSS entry
  mobile/                    Expo + React Native + expo-router
  desktop/                   Electron shell (loads web app from server)
```

## Environment Variables

Secrets and credentials live in `.env` at the project root (gitignored). Vite's
`loadEnv` loads them into `process.env` at dev/build time. In API code (Hono), use
`process.env.YOUR_VAR`; in browser code, only `VITE_`-prefixed vars are exposed via
`import.meta.env.VITE_YOUR_VAR`. Drizzle scripts use `bun --env-file=../../.env`.

## Desktop UI

The desktop app loads the web app from `packages/web`; desktop-specific UI lives in
`packages/web/src/web/` gated with `useDesktop()` / `window.electronAPI`.

## Servers

Dev servers start automatically via the monorepo tooling.

## Database

```sh
cd packages/web
bun run db:push        # Push schema to database
bun run db:generate    # Generate migration files
bun run db:migrate     # Run migrations
bun run db:studio      # Open Drizzle Studio
```

## Web / API tests

```sh
cd packages/web
bun test               # 34 deterministic + pipeline tests
```

---

## Python Standalone Engine

`merger_risk_analyzer.py` is the **standalone/CLI** version of the scoring logic,
consuming the same scoring rubric from `merger_scoring_config.yaml`.

| File | Description |
|------|-------------|
| `merger_risk_analyzer.py` | Core `MergerRiskAnalyzer` class — consumes YAML config |
| `test_merger_analyzer.py` | Unit test suite — sample agreements with expected scores |
| `merger_scoring_config.yaml` | Deductions, patterns, and (v2) party-integrity/readiness config |
| `api.py` | FastAPI production server |
| `openapi.yaml` | OpenAPI 3.0 schema |

### Setup & run

```bash
pip install -r requirements.txt
python test_merger_analyzer.py     # 5-case test suite
python api.py                      # → http://localhost:8000
```

The TypeScript app embeds the scoring rules in `openrouter.ts` (LLM prompt) with a
server-side `validateScore()` validator and the deterministic modules in
`analysis-modules.ts`; the Python engine mirrors the key v2 gates (party/obligor
integrity, escrow–survival mismatch, indemnification procedures, undefined
controlling terms, and the execution-readiness score cap).
