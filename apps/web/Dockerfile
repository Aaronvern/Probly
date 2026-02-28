# ── Stage 1: Build ──
FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY . .
RUN pnpm install --no-frozen-lockfile

# Next.js needs env vars at build time for NEXT_PUBLIC_*
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_BICONOMY_API_KEY
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_BICONOMY_API_KEY=${NEXT_PUBLIC_BICONOMY_API_KEY}
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}

WORKDIR /app/apps/web
RUN npx next build

# ── Stage 2: Production runner ──
FROM node:20-slim
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy standalone output (includes server.js + node_modules)
COPY --from=builder /app/apps/web/.next/standalone ./

# Copy static assets (NOT included in standalone output)
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# Copy public dir if it exists (glob trick: no-op if dir missing)
RUN mkdir -p ./apps/web/public
COPY --from=builder /app/apps/web/publi[c] ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
