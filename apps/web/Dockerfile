FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install
RUN pnpm --filter web build

FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY --from=builder /app .
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
