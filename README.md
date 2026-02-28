<p align="center">
  <h1 align="center">⚡ Probly — Prediction Market Super-Aggregator</h1>
  <p align="center"><b>The Bloomberg Terminal for On-Chain Prediction Markets</b></p>
  <p align="center">
    <a href="#live-deployment">Live on BSC Testnet + BSC Mainnet</a> · 
    <a href="#demo">Demo Video</a> · 
    <a href="#architecture">Architecture</a> · 
    <a href="#contracts">Contracts</a>
  </p>
</p>

---

## 🏆 BNB Hack — Prediction Market Terminals Track

Probly is a **unified prediction market terminal** that aggregates liquidity across Opinion Labs, Predict.fun, and Probable — surfacing real-time cross-platform arbitrage, executing Meta-Bet consensus splits, and earning auto-yield on idle capital through Lista DAO integration. One unified order book. One click to trade across every venue.

> **Track:** Prediction Market Terminals  
> **Chain:** BSC Testnet + BSC Mainnet  
> **License:** MIT  

---

## ✨ Key Innovation

| Problem | Probly's Solution |
|---------|------------------|
| Prediction markets are siloed — users check 3 apps to find the best price | **Unified Aggregator** — single order book merging Opinion Labs, Predict.fun & Probable |
| No way to profit from cross-platform price divergence | **Arbitrage Matrix Terminal** — real-time spread detection with one-click arb execution |
| Idle capital earns zero while waiting for a trade | **JIT Yield Unwrap** — auto-deposits into Lista DAO (~4.05% APY), unwraps just-in-time on trade |
| Complex Web3 UX kills retail adoption | **Swipe-to-Bet + Account Abstraction** — Biconomy session keys, zero popups, no gas fees visible |
| AI agents can't trade prediction markets | **MCP Server** — Claude/GPT agents analyze markets and execute trades via Model Context Protocol |

---

## 🏗️ Architecture

<p align="center">
  <img src="docs/architecture.jpeg" alt="Probly Architecture — 4-Layer System" width="700" />
</p>

**Probly operates as a 4-layer stack:**

| Layer | Name | Role |
|-------|------|------|
| **Layer 1** | Async AI & Data Ingestion | "Ghost Market" engine — LLM-powered market creation, vector matching, resolution safety checks |
| **Layer 2** | Unified Backend | The "Brain" — MongoDB unified order book, Smart Order Router (SOR), Arb-Bot, Portfolio Scanner |
| **Layer 3** | Frontend & Account Abstraction | Swipe-to-Bet mobile feed + Matrix Terminal dashboard, ERC-4337 via Biconomy session keys |
| **Layer 4** | On-Chain Execution | The "Muscle" — AggregatorRouter, OTCPool, JIT yield via Lista DAO, atomic multi-venue swaps |

### Monorepo Structure

```
Probly/
├── apps/
│   ├── api/            # Express backend — SOR, market aggregation, WebSocket
│   ├── web/            # Next.js frontend — Matrix Terminal, Swipe UI
│   └── mcp-server/     # Model Context Protocol server for AI agents
├── packages/
│   ├── contracts/      # Solidity smart contracts (Hardhat, BSC Testnet)
│   └── sdk/            # TypeScript SDK — Probable CLOB client
└── docs/               # Architecture docs, JIT yield spec
```

---

## 📜 Smart Contracts (BSC Testnet)

<a id="contracts"></a>

| Contract | Address | Purpose |
|----------|---------|---------|
| **AggregatorRouter** | [`0xbc4c...506F`](https://testnet.bscscan.com/address/0xbc4cBD176eAa33223c3EF93Ed4b2844C5627506F) | Smart Order Router — routes trades, JIT yield, split execution |
| **MockLista** | [`0xB783...8585`](https://testnet.bscscan.com/address/0xB783083280fBE5f243a7945b3Bf3F88ddC04B585) | Lista DAO stable pool simulator (~4.05% APY on idle USDT) |
| **MockPredict** | [`0x65d2...cAF4`](https://testnet.bscscan.com/address/0x65d2562a2fD6c3bb5D0d747a02df4a5F63a8cAF4) | Predict.fun venue simulator |
| **MockProbable** | [`0x32E3...89fE`](https://testnet.bscscan.com/address/0x32E31F9c577beB58071f355a476fFFcA3C1b89fE) | Probable venue simulator |
| **MockUSDT** | [`0x7014...4aeD`](https://testnet.bscscan.com/address/0x701420BA9Cfad65Ca95a1A05515b893018ea4aeD) | Test stablecoin |
| **OTCPool** | [`0x43fb...3A8B`](https://testnet.bscscan.com/address/0x43fbcC63E1DaFa55c0d0cF5dFECDB009496B3A8B) | OTC desk — instant exit at 5% discount, zero slippage |
| **OpinionLabs Multisig** | [`0x191b...326a`](https://bscscan.com/address/0x191b2ad7187805b5ff0a8d8db39cdf5d01ab326a) | BSC Mainnet — Opinion Labs integration |

> All contracts are **verified and deployed on BSC Testnet** with 2+ successful transactions within the hackathon timeframe. Opinion Labs integration runs on **BSC Mainnet**.

---

## 🚀 Core Features

### 1. Matrix Terminal — Pro Arbitrage Dashboard

A Bloomberg-style real-time dashboard showing every prediction market across all aggregated platforms. Rows glow **neon green** when a cross-platform arbitrage opportunity is detected (YES on Platform A + NO on Platform B < $1.00 = risk-free profit). One-click arb execution.

### 2. Meta-Bet Consensus Splits

Instead of trusting a single platform's oracle, Probly's Smart Order Router (SOR) **splits trades across multiple venues** for the same event — hedging oracle risk while ensuring best execution across the unified order book.

### 3. JIT (Just-In-Time) Yield Unwrap

Idle capital automatically earns yield via Lista DAO integration. When a user executes a trade, the `AggregatorRouter` **unwraps exactly the needed amount** from Lista in the same transaction block. Three modes handled transparently:

- **Full coverage** — yield covers entire trade, wallet untouched  
- **Partial coverage** — only the shortfall pulled from wallet  
- **No deposit** — graceful fallback to standard wallet transfer  

### 4. Swipe-to-Bet (Retail UX)

TikTok-style card feed for retail users. Biconomy Smart Accounts + Session Keys enable **gasless, popup-free trading**. Swipe right = bet YES. No MetaMask, no gas, no friction.

### 5. AI Agent Trading via MCP

A fully functional **Model Context Protocol (MCP) server** lets AI agents (Claude, GPT) autonomously:
- Browse and analyze aggregated markets
- Read unified order books
- Execute trades on behalf of users

### 6. OTC Exit Pool

Users can cash out positions **instantly** without AMM slippage via the `OTCPool.sol` contract, accepting a flat 5% discount for immediate stablecoin settlement.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js, React, TypeScript, TailwindCSS |
| Backend | Node.js, Express, WebSocket |
| Smart Contracts | Solidity, Hardhat, BSC Testnet |
| Account Abstraction | Biconomy Smart Accounts, Session Keys |
| Database | MongoDB Atlas |
| AI / NLP | GPT-4o-mini, Vector Embeddings, LangChain |
| SDK | TypeScript, viem, EIP-712 signing |
| MCP | Model Context Protocol (Claude/GPT agent interface) |
| Yield | Lista DAO integration (slisBNB) |
| Monorepo | Nx, pnpm workspaces |

---

## ⚙️ Getting Started

### Prerequisites

- Node.js v18+
- pnpm v9+
- MongoDB Atlas (or local instance)

### Installation

```bash
git clone https://github.com/<your-org>/probly.git
cd probly

pnpm install
```

### Environment

Copy `.env.example` to `.env` and fill in the required keys:

```env
# Platform API keys
OPINIONLABS_API_KEY=
PREDICTFUN_API_KEY=
PROBABLE_API_KEY=

# Wallet
PRIVATE_KEY=

# RPC
BSC_RPC_URL=https://bsc-dataseed.binance.org

# MongoDB
MONGODB_URI=mongodb://localhost:27017/probly

# Biconomy
NEXT_PUBLIC_BICONOMY_API_KEY=
```

### Run

```bash
# Terminal 1 — API backend (port 3001)
pnpm run dev:api

# Terminal 2 — Web frontend (port 3000)
pnpm run dev:web

# Terminal 3 — MCP server (optional, for AI agent access)
npx nx serve mcp-server
```

### Smart Contracts

```bash
# Compile
npx nx compile contracts

# Test
npx nx test contracts
```

---

<a id="live-deployment"></a>

## 🌐 Live Deployment

| Component | Network | Status |
|-----------|---------|--------|
| Smart Contracts | BSC Testnet | ✅ Deployed & Verified |
| Opinion Labs Trading | BSC Mainnet | ✅ Live |
| API Backend | — | ✅ Running |
| Web Frontend | — | ✅ Running |
| MCP Server | — | ✅ Available |

---

## 🗺️ Roadmap

| Phase | Milestone |
|-------|-----------|
| **Q1 2026** | ✅ MVP — Aggregator, Matrix Terminal, JIT Yield, MCP Server |
| **Q2 2026** | Mainnet migration for all venues · Mobile-native app · Live arb execution bot |
| **Q3 2026** | Governance token launch · DAO treasury management · Community market creation |
| **Q4 2026** | Cross-chain expansion (Arbitrum, Base) · Institutional API · Advanced analytics |

---

## 📊 Scoring Criteria Alignment

| Criteria | How Probly Delivers |
|----------|-------------------|
| **Design & Usability** | Swipe-to-bet retail UX, Matrix Terminal pro dashboard, gasless account abstraction |
| **Scalability** | Nx monorepo, multi-venue SOR architecture, MongoDB Atlas, BSC throughput |
| **Innovation** | JIT yield unwrap, Meta-Bet consensus splits, AI agent trading via MCP, cross-platform arb detection |
| **Open Source** | MIT licensed, full monorepo on GitHub, modular SDK for community extensions |
| **Integration** | Opinion Labs (BSC Mainnet), Predict.fun, Probable, Lista DAO, Biconomy AA, MCP Protocol |

---

## 🤝 Team

Built with ☕ during **BNB Hack 2026**.

---

<a id="demo"></a>

## 📹 Demo

> 🎥 **Demo Video:** [Coming Soon]  
> 📊 **Pitch Deck:** [Coming Soon]  
> 🐦 **Tweet:** [Coming Soon] — tag `@BNBChain` with `#BNBHack`

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  <b>Probly</b> — One terminal. Every prediction market. Zero friction.
</p>
