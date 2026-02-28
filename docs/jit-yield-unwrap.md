# JIT (Just-In-Time) Yield Unwrap

## What It Does

Users deposit idle USDT into **MockLista** (simulating Lista DAO's Stable Pool at ~4.05% APY). When they execute a trade, the **AggregatorRouter** automatically unwraps their yield deposit just-in-time to fund the trade — no manual withdrawal needed.

Three scenarios are handled transparently:

| Scenario | What Happens |
|----------|-------------|
| **Full coverage** | Yield deposit covers the entire trade. Surplus is refunded to user's wallet. Wallet is not charged. |
| **Partial coverage** | Yield deposit covers part of the trade. Only the shortfall is pulled from user's wallet via `transferFrom`. |
| **No deposit** | User has nothing in Lista. Falls back to full `transferFrom` from wallet (identical to `useYield=false`). |

## Contract Architecture

```
User Wallet
    │
    ▼
AggregatorRouter._fundTrade(amount, useYield=true)
    │
    ├─► MockLista.withdrawFor(user, amount)   ← Router-authorized withdrawal
    │       Returns: principal + proportional yield to Router
    │
    ├─► If surplus: USDT.transfer(user, surplus)
    ├─► If shortfall: USDT.transferFrom(user, router, shortfall)
    │
    └─► Route trade to MockPredict / MockProbable as normal
```

### Key Fix: `msg.sender` Bug

The old code called `mockLista.withdraw(amount)` from the Router. Inside MockLista, `msg.sender` was the Router (not the user), so it looked up the Router's deposit (which was zero) and always failed.

The fix: `withdrawFor(address user, uint256 maxAmount)` takes the user address explicitly. Only the authorized `router` address can call it.

## How to Use

### 1. Deposit USDT into Lista (earn yield while idle)

```solidity
// User approves and deposits
usdt.approve(address(mockLista), amount);
mockLista.deposit(amount);
```

### 2. Execute a trade with JIT unwrap

```solidity
// Single-venue trade with yield
router.executeBestTrade(marketId, outcome, usdtAmount, minShares, venue, true);

// Split trade with yield
router.executeSplitTrade(marketId, outcome, predictAmt, probableAmt, minP, minB, true);
```

Pass `false` as the last argument to skip yield and use wallet funds only (backward compatible).

### 3. Frontend usage

```typescript
// In a React component using the hook
const { executeSmartTrade } = useSmartAccount();

// Without yield (default)
await executeSmartTrade(globalEventId, "YES", 10);

// With JIT yield unwrap
await executeSmartTrade(globalEventId, "YES", 10, true);
```

## Deployment Checklist

After deploying the updated contracts:

1. **Deploy MockLista** (new version with `withdrawFor` + `router` state)
2. **Deploy AggregatorRouter** (new version with `_fundTrade` + updated `executeSplitTrade`)
3. **Call `mockLista.setRouter(routerAddress)`** — this authorizes the Router to withdraw on behalf of users
4. **Seed MockLista** with USDT to cover yield payouts: `mockLista.seed(amount)`
5. **Update contract addresses** in `apps/web/src/lib/biconomy.ts` (`AGGREGATOR_ROUTER`, and add `MOCK_LISTA` if needed for deposit UI)

## Running Tests

```bash
cd packages/contracts
npx hardhat test
```

JIT-specific tests:

| Test | Validates |
|------|-----------|
| `executeBestTrade with full yield coverage` | Wallet balance does not decrease when yield covers trade |
| `executeBestTrade with partial yield` | Wallet charged only the shortfall (trade amount minus yield) |
| `executeBestTrade with useYield=true but no deposit` | Graceful fallback to full wallet charge |
| `executeSplitTrade with useYield=true` | JIT works for split trades across both venues |
| `withdrawFor reverts for non-router caller` | Access control — only authorized router can call |

## Files Changed

| File | Change |
|------|--------|
| `packages/contracts/src/MockLista.sol` | Added `router`, `setRouter()`, `withdrawFor()` |
| `packages/contracts/src/AggregatorRouter.sol` | Added `YieldUnwrapped` event, `_fundTrade()` helper, `useYield` param on `executeSplitTrade` |
| `packages/contracts/test/probly.test.cjs` | 5 new JIT tests, `setRouter` in setup, updated split trade call |
| `apps/web/src/lib/biconomy.ts` | `useYield` parameter threaded through to `encodeFunctionData` |
| `apps/web/src/hooks/useSmartAccount.ts` | `useYield` parameter on `executeSmartTrade` |
