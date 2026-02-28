# ── Stage 1: Install all workspace deps ──
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Copy workspace config first (cache layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./

# Copy only the packages/apps needed by the API
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY apps/api/package.json ./apps/api/package.json

RUN pnpm install --frozen-lockfile

# ── Stage 2: Copy source & run ──
FROM base AS runner
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/sdk/node_modules ./packages/sdk/node_modules
COPY --from=base /app/apps/api/node_modules ./apps/api/node_modules

# Copy source files
COPY tsconfig.base.json ./
COPY packages/sdk/ ./packages/sdk/
COPY apps/api/ ./apps/api/

# The API uses tsx to run TypeScript directly (same as dev)
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["npx", "tsx", "apps/api/src/main.ts"]
