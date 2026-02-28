# How to Run Probly

## Prerequisites

- Node.js v18+
- pnpm v9+
- A `.env` file in the project root (see Environment Variables below)

## Install Dependencies

```bash
pnpm install
```

## Environment Variables

Create a `.env` file in the project root with:

```
OPINIONLABS_API_KEY=
OPINIONLABS_EOA=
PREDICTFUN_API_KEY=
PROBABLE_API_KEY=
PROBABLE_SECRET=
PROBABLE_PASSPHRASE=
PRIVATE_KEY=
BSC_RPC_URL=
```

## One-Time Setup

Generate the Probable API key:

```bash
pnpm run generate-probable-key
```

## Development

### Start the API backend

```bash
pnpm run dev:api
```

### Start the web frontend

```bash
pnpm run dev:web
```

### Start both at the same time (two terminals)

```bash
# Terminal 1
pnpm run dev:api

# Terminal 2
pnpm run dev:web
```

## Smart Contracts (Hardhat)

All contract commands run from `packages/contracts/`:

```bash
# Compile contracts
cd packages/contracts && npx hardhat compile

# Run contract tests
cd packages/contracts && npx hardhat test

# Deploy to BSC Testnet
cd packages/contracts && npx hardhat run scripts/deploy.js --network bscTestnet

# Deploy to BSC Mainnet
cd packages/contracts && npx hardhat run scripts/deploy.js --network bsc
```

Or via Nx from the root:

```bash
pnpm dlx nx test contracts
```

## Build

```bash
# Build all packages
pnpm run build

# Build individual apps
pnpm dlx nx build web
pnpm dlx nx build api
```

## Test

```bash
# Run all tests
pnpm run test

# Run tests for a specific package
pnpm dlx nx test sdk
pnpm dlx nx test contracts
```

## Lint

```bash
# Lint all packages
pnpm run lint

# Lint a specific app
pnpm dlx nx lint web
pnpm dlx nx lint api
```

## MCP Server

```bash
pnpm dlx nx serve mcp-server
```

## Production

```bash
# Build the web app for production
pnpm dlx nx build web

# Start the production web server
cd apps/web && pnpm start
```
