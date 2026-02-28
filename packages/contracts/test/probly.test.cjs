const { expect } = require("chai");
const hre = require("hardhat");

describe("Probly Contracts", function () {
  let usdt, mockPredict, mockProbable, mockLista, otcPool, router;
  let owner, trader;

  const USDT = (n) => hre.ethers.parseUnits(String(n), 6);
  const MARKET_1 = 1n;
  const YES = 0;
  const NO = 1;

  // Prices in USDT (6 decimals): 0.52 = 520000
  const PREDICT_YES = 520000n;
  const PREDICT_NO  = 470000n;
  const PROBABLE_YES = 540000n;
  const PROBABLE_NO  = 450000n;

  before(async () => {
    [owner, trader] = await hre.ethers.getSigners();

    // Deploy all contracts
    usdt        = await (await hre.ethers.getContractFactory("MockUSDT")).deploy();
    mockPredict = await (await hre.ethers.getContractFactory("MockPredict")).deploy(await usdt.getAddress());
    mockProbable= await (await hre.ethers.getContractFactory("MockProbable")).deploy(await usdt.getAddress());
    mockLista   = await (await hre.ethers.getContractFactory("MockLista")).deploy(await usdt.getAddress());
    otcPool     = await (await hre.ethers.getContractFactory("OTCPool")).deploy(await usdt.getAddress());
    router      = await (await hre.ethers.getContractFactory("AggregatorRouter")).deploy(
      await usdt.getAddress(),
      await mockPredict.getAddress(),
      await mockProbable.getAddress(),
      await mockLista.getAddress(),
    );

    // Seed markets
    await mockPredict.createMarket(MARKET_1, PREDICT_YES, PREDICT_NO);
    await mockProbable.createMarket(MARKET_1, PROBABLE_YES, PROBABLE_NO);

    // Mint USDT to trader
    await usdt.mint(trader.address, USDT(10000));

    // Seed OTC pool
    await usdt.mint(owner.address, USDT(50000));
    await usdt.approve(await otcPool.getAddress(), USDT(10000));
    await otcPool.setFairPrice(MARKET_1, YES, PREDICT_YES);
    await otcPool.setFairPrice(MARKET_1, NO,  PREDICT_NO);
    await otcPool.seed(USDT(10000));

    // Seed Lista
    await usdt.approve(await mockLista.getAddress(), USDT(5000));
    await mockLista.seed(USDT(5000));

    // Authorize router to call withdrawFor
    await mockLista.setRouter(await router.getAddress());
  });

  // ─── MockUSDT ────────────────────────────────────────────────────────────────

  describe("MockUSDT", () => {
    it("faucet mints 10,000 USDT to caller", async () => {
      const before = await usdt.balanceOf(owner.address);
      await usdt.connect(owner).faucet();
      const after = await usdt.balanceOf(owner.address);
      expect(after - before).to.equal(USDT(10000));
    });

    it("has 6 decimals", async () => {
      expect(await usdt.decimals()).to.equal(6);
    });
  });

  // ─── MockPredict ─────────────────────────────────────────────────────────────

  describe("MockPredict", () => {
    it("returns correct prices for market 1", async () => {
      const [yesPrice, noPrice] = await mockPredict.getPrice(MARKET_1);
      expect(yesPrice).to.equal(PREDICT_YES);
      expect(noPrice).to.equal(PREDICT_NO);
    });

    it("trader buys YES shares and receives correct amount", async () => {
      const spend = USDT(100);
      const expectedShares = (spend * 1000000n) / PREDICT_YES;

      await usdt.connect(trader).approve(await mockPredict.getAddress(), spend);
      await mockPredict.connect(trader).buyOutcome(MARKET_1, YES, spend, 0);

      const position = await mockPredict.getPosition(MARKET_1, YES, trader.address);
      expect(position).to.equal(expectedShares);
    });

    it("accepts trade with minShares=0 (high slippage tolerance for demo)", async () => {
      const spend = USDT(50);
      await usdt.connect(trader).approve(await mockPredict.getAddress(), spend);
      const tx = await mockPredict.connect(trader).buyOutcome(MARKET_1, YES, spend, 0);
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);
    });
  });

  // ─── MockProbable ─────────────────────────────────────────────────────────────

  describe("MockProbable", () => {
    it("returns correct prices for market 1", async () => {
      const [yesPrice, noPrice] = await mockProbable.getPrice(MARKET_1);
      expect(yesPrice).to.equal(PROBABLE_YES);
      expect(noPrice).to.equal(PROBABLE_NO);
    });

    it("trader buys NO shares correctly", async () => {
      const spend = USDT(100);
      const expectedShares = (spend * 1000000n) / PROBABLE_NO;

      await usdt.connect(trader).approve(await mockProbable.getAddress(), spend);
      await mockProbable.connect(trader).buyOutcome(MARKET_1, NO, spend, 0);

      const position = await mockProbable.getPosition(MARKET_1, NO, trader.address);
      expect(position).to.equal(expectedShares);
    });
  });

  // ─── MockLista ────────────────────────────────────────────────────────────────

  describe("MockLista", () => {
    it("accepts deposit and tracks principal", async () => {
      const amount = USDT(500);
      await usdt.connect(trader).approve(await mockLista.getAddress(), amount);
      await mockLista.connect(trader).deposit(amount);

      const balance = await mockLista.balanceOf(trader.address);
      expect(balance).to.be.gte(amount); // balance >= principal (yield accrues immediately)
    });

    it("accrues yield over time", async () => {
      const before = await mockLista.balanceOf(trader.address);

      // Fast-forward 30 days
      await hre.network.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await hre.network.provider.send("evm_mine");

      const after = await mockLista.balanceOf(trader.address);
      expect(after).to.be.gt(before);
    });

    it("withdraw returns principal + yield", async () => {
      const deposit = await mockLista.deposits(trader.address);
      const principal = deposit.amount;
      const pending = await mockLista.pendingYield(trader.address);

      const beforeUsdt = await usdt.balanceOf(trader.address);
      await mockLista.connect(trader).withdraw(principal);
      const afterUsdt = await usdt.balanceOf(trader.address);

      const received = afterUsdt - beforeUsdt;
      expect(received).to.be.gte(principal); // got back at least principal
      expect(received).to.be.lte(principal + pending + USDT(1)); // not more than principal + yield
    });
  });

  // ─── OTCPool ─────────────────────────────────────────────────────────────────

  describe("OTCPool", () => {
    it("quotes cash-out at 5% discount", async () => {
      const shares = 1000000n; // 1 share (6 dec)
      const quoted = await otcPool.quotecashOut(MARKET_1, YES, shares);
      // Fair price 0.52, discount 5% → 0.494
      const expected = (shares * PREDICT_YES * 9500n) / (10000n * 1000000n);
      expect(quoted).to.equal(expected);
    });

    it("pays out USDT at discounted price", async () => {
      const shares = 1000000n;
      const minUsdt = 0n;
      const beforeUsdt = await usdt.balanceOf(trader.address);
      await otcPool.connect(trader).cashOut(MARKET_1, YES, shares, minUsdt);
      const afterUsdt = await usdt.balanceOf(trader.address);
      expect(afterUsdt).to.be.gt(beforeUsdt);
    });

    it("reverts if pool has insufficient liquidity", async () => {
      const hugeShares = hre.ethers.parseUnits("1000000", 6);
      await expect(
        otcPool.connect(trader).cashOut(MARKET_1, YES, hugeShares, 0)
      ).to.be.revertedWith("pool insufficient liquidity");
    });
  });

  // ─── AggregatorRouter ────────────────────────────────────────────────────────

  describe("AggregatorRouter", () => {
    it("quoteBestVenue returns Predict for YES (cheaper at 0.52 vs 0.54)", async () => {
      const [bestVenue, bestPrice, predictPrice, probablePrice] =
        await router.quoteBestVenue(MARKET_1, YES);
      expect(bestVenue).to.equal(0); // 0 = PREDICT
      expect(bestPrice).to.equal(PREDICT_YES);
      expect(predictPrice).to.equal(PREDICT_YES);
      expect(probablePrice).to.equal(PROBABLE_YES);
    });

    it("executeBestTrade routes to Predict and fills order", async () => {
      const spend = USDT(200);
      await usdt.connect(trader).approve(await router.getAddress(), spend);

      const tx = await router.connect(trader).executeBestTrade(
        MARKET_1, YES, spend, 0n, 0, false // venue=PREDICT, no yield
      );
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);

      // Trader should have YES shares in MockPredict
      const position = await mockPredict.getPosition(MARKET_1, YES, await router.getAddress());
      // Shares go to router on behalf of trader in this flow
      expect(position).to.be.gt(0n);
    });

    it("executeSplitTrade splits across both venues", async () => {
      const predictAmount = USDT(100);
      const probableAmount = USDT(100);
      await usdt.connect(trader).approve(await router.getAddress(), USDT(200));

      const tx = await router.connect(trader).executeSplitTrade(
        MARKET_1, YES,
        predictAmount, probableAmount,
        0n, 0n, false
      );
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);
    });

    it("executeBestTrade works with minShares=0 (high slippage tolerance for demo)", async () => {
      const spend = USDT(50);
      await usdt.connect(trader).approve(await router.getAddress(), spend);
      const tx = await router.connect(trader).executeBestTrade(MARKET_1, YES, spend, 0n, 0, false);
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);
    });

    it("executeBestTrade with full yield coverage — wallet not charged", async () => {
      const depositAmt = USDT(500);
      await usdt.connect(trader).approve(await mockLista.getAddress(), depositAmt);
      await mockLista.connect(trader).deposit(depositAmt);

      // Fast-forward to accrue some yield
      await hre.network.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
      await hre.network.provider.send("evm_mine");

      const spend = USDT(100);
      const walletBefore = await usdt.balanceOf(trader.address);

      // No approval needed — yield covers the trade
      const tx = await router.connect(trader).executeBestTrade(MARKET_1, YES, spend, 0n, 0, true);
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);

      const walletAfter = await usdt.balanceOf(trader.address);
      // Wallet should not decrease (may increase from surplus refund)
      expect(walletAfter).to.be.gte(walletBefore);
    });

    it("executeBestTrade with partial yield — wallet charged shortfall only", async () => {
      const spend = USDT(1000);
      const walletBefore = await usdt.balanceOf(trader.address);
      const listaBalance = await mockLista.balanceOf(trader.address);

      await usdt.connect(trader).approve(await router.getAddress(), spend);
      const tx = await router.connect(trader).executeBestTrade(MARKET_1, YES, spend, 0n, 0, true);
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);

      const walletAfter = await usdt.balanceOf(trader.address);
      const walletSpent = walletBefore - walletAfter;
      // Wallet should have been charged less than the full trade amount
      expect(walletSpent).to.be.lt(spend);
      // Wallet spent should be roughly (spend - listaBalance)
      expect(walletSpent).to.be.lte(spend - listaBalance + USDT(1));
    });

    it("executeBestTrade with useYield=true but no Lista deposit — graceful fallback", async () => {
      // Use owner who has never deposited into Lista
      await usdt.mint(owner.address, USDT(500));
      const spend = USDT(100);
      await usdt.connect(owner).approve(await router.getAddress(), spend);

      const tx = await router.connect(owner).executeBestTrade(MARKET_1, YES, spend, 0n, 0, true);
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);
    });

    it("executeSplitTrade with useYield=true", async () => {
      // Deposit into Lista for trader
      const depositAmt = USDT(300);
      await usdt.connect(trader).approve(await mockLista.getAddress(), depositAmt);
      await mockLista.connect(trader).deposit(depositAmt);

      const predictAmount = USDT(100);
      const probableAmount = USDT(100);

      const tx = await router.connect(trader).executeSplitTrade(
        MARKET_1, YES,
        predictAmount, probableAmount,
        0n, 0n, true
      );
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);
    });
  });

  // ─── withdrawFor access control ────────────────────────────────────────────

  describe("MockLista withdrawFor", () => {
    it("reverts for non-router caller", async () => {
      await expect(
        mockLista.connect(trader).withdrawFor(trader.address, USDT(100))
      ).to.be.revertedWith("only router");
    });
  });
});
