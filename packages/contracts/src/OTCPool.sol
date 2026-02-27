// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OTCPool
 * @notice Instant position cash-out at a 5% discount.
 *
 *         Users who hold outcome shares on MockPredict/MockProbable can
 *         sell them instantly to this pool at (price - 5%) instead of
 *         waiting for market resolution.
 *
 *         Pool is seeded with USDT by the owner. The 5% spread is the
 *         pool's profit for providing instant liquidity.
 */
contract OTCPool is Ownable {
    IERC20 public immutable usdt;

    uint256 public constant DISCOUNT_BPS = 500; // 5%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // marketId => outcome => price in USDT (6 decimals)
    mapping(uint256 => mapping(uint8 => uint256)) public fairPrices;

    event PriceSet(uint256 indexed marketId, uint8 outcome, uint256 price);
    event CashedOut(address indexed user, uint256 marketId, uint8 outcome, uint256 shares, uint256 usdtOut);

    constructor(address _usdt) Ownable(msg.sender) {
        usdt = IERC20(_usdt);
    }

    /// @notice Owner sets fair price for an outcome (pulled from SOR/aggregated orderbook)
    function setFairPrice(uint256 marketId, uint8 outcome, uint256 price) external onlyOwner {
        fairPrices[marketId][outcome] = price;
        emit PriceSet(marketId, outcome, price);
    }

    /**
     * @notice Instant cash-out — sell shares at 5% discount.
     * @param marketId  Market ID
     * @param outcome   0 = YES, 1 = NO
     * @param shares    Number of shares to sell
     * @param minUsdt   Minimum USDT to receive (slippage guard)
     *
     * NOTE: The caller must have approved this contract to transfer
     * their shares from the mock exchange. For the testnet demo we track
     * positions internally via the mock exchanges, so the router handles
     * the share accounting.
     */
    function cashOut(uint256 marketId, uint8 outcome, uint256 shares, uint256 minUsdt) external returns (uint256 usdtOut) {
        uint256 fairPrice = fairPrices[marketId][outcome];
        require(fairPrice > 0, "no price set for this outcome");

        // Apply 5% discount
        uint256 discountedPrice = fairPrice * (BPS_DENOMINATOR - DISCOUNT_BPS) / BPS_DENOMINATOR;
        usdtOut = (shares * discountedPrice) / 1e6;

        require(usdtOut >= minUsdt, "slippage exceeded");
        require(usdt.balanceOf(address(this)) >= usdtOut, "pool insufficient liquidity");

        usdt.transfer(msg.sender, usdtOut);
        emit CashedOut(msg.sender, marketId, outcome, shares, usdtOut);
    }

    /// @notice View the OTC cash-out price for shares (after 5% discount)
    function quotecashOut(uint256 marketId, uint8 outcome, uint256 shares) external view returns (uint256 usdtOut) {
        uint256 fairPrice = fairPrices[marketId][outcome];
        if (fairPrice == 0) return 0;
        uint256 discountedPrice = fairPrice * (BPS_DENOMINATOR - DISCOUNT_BPS) / BPS_DENOMINATOR;
        return (shares * discountedPrice) / 1e6;
    }

    /// @notice Pool USDT balance
    function poolBalance() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    /// @notice Owner seeds pool with USDT liquidity
    function seed(uint256 amount) external onlyOwner {
        usdt.transferFrom(msg.sender, address(this), amount);
    }

    /// @notice Owner withdraws profit
    function withdraw(uint256 amount) external onlyOwner {
        usdt.transfer(msg.sender, amount);
    }
}
