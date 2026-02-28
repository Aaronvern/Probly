FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install
EXPOSE 3001
CMD ["npx", "tsx", "apps/api/src/main.ts"]
