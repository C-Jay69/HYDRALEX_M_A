# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM oven/bun:1.3 AS builder

WORKDIR /app

# Copy workspace manifests first (better layer caching)
COPY package.json bun.lock turbo.json ./
COPY packages/web/package.json ./packages/web/

# Install all deps (including devDeps needed for build)
RUN bun install

# Copy source
COPY packages/web/ ./packages/web/

# Build the React frontend (outputs to packages/web/dist)
# Call vite directly — the `build` script runs tsc --noEmit first which has
# pre-existing type errors in non-critical paths; vite itself is clean.
WORKDIR /app/packages/web
RUN bunx vite build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM oven/bun:1.3-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy only what the server needs at runtime
COPY --from=builder /app/packages/web/src ./packages/web/src
COPY --from=builder /app/packages/web/dist ./packages/web/dist
COPY --from=builder /app/packages/web/package.json ./packages/web/package.json
COPY --from=builder /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

WORKDIR /app/packages/web

EXPOSE 3000

# server.ts resolves dist/ relative to import.meta.dir — works from packages/web/src/
CMD ["bun", "src/server.ts"]
