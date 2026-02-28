# How to Run Probly

## Prerequisites

- Node.js v18+
- pnpm v9+
- MongoDB (Atlas or local instance)
- A `.env` file in the project root (see below)

## Install Dependencies

```bash
pnpm install
```

## Environment Variables

Create a `.env` file in the project root with:

```
# Platform API keys
OPINIONLABS_API_KEY=
OPINIONLABS_EOA=
PREDICTFUN_API_KEY=
PROBABLE_API_KEY=
PROBABLE_SECRET=
PROBABLE_PASSPHRASE=

# Wallet
PRIVATE_KEY=

# RPC
BSC_RPC_URL=

# MongoDB
MONGODB_URI=mongodb://localhost:27017/probly

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_BICONOMY_API_KEY=
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

## One-Time Setup

Generate the Probable API key:

```bash
pnpm run generate-probable-key
```

## Development

### Start the API backend (port 3001)

```bash
pnpm run dev:api
```

### Start the web frontend (port 3000)

```bash
pnpm run dev:web
```

### Start both (two terminals)

```bash
# Terminal 1 — API
pnpm run dev:api

# Terminal 2 — Frontend
pnpm run dev:web
```

## Smart Contracts (Hardhat)

Contracts live in `packages/contracts/`. Hardhat reads `.env` from the project root.

Via Nx from the root:

```bash
# Compile contracts
npx nx compile contracts

# Run contract tests
npx nx test contracts
```

Or directly from the contracts directory:

```bash
cd packages/contracts
npx hardhat compile
npx hardhat test
```

## MCP Server

```bash
npx nx serve mcp-server
```

## Build

```bash
# Build all packages
pnpm run build

# Build individual apps
npx nx build web
npx nx build api
```

## Test

```bash
# Run all tests
pnpm run test

# Run tests for a specific package
npx nx test contracts
npx nx test api
```

## Lint

```bash
# Lint all packages
pnpm run lint

# Lint a specific app
npx nx lint web
npx nx lint api
```

## Production

```bash
# Build the web app
npx nx build web

# Start production server
cd apps/web && pnpm start
```
