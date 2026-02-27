// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockPredict
 * @notice Simulates Predict.fun CTF exchange on BSC testnet.
 *         Accepts USDT, returns outcome tokens at the stored price.
 *         Price is set per market by the owner (simulates live orderbook).
 */
contract MockPredict is Ownable {
    IERC20 public immutable usdt;

    struct Market {
        uint256 yesPrice; // price in USDT (6 decimals), e.g. 0.52 USDT = 520000
        uint256 noPrice;
        bool active;
    }

    mapping(uint256 => Market) public markets;
    // marketId => outcome (0=YES, 1=NO) => user => shares
    mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public positions;

    event MarketCreated(uint256 indexed marketId, uint256 yesPrice, uint256 noPrice);
    event OrderFilled(uint256 indexed marketId, address indexed trader, uint8 outcome, uint256 usdtIn, uint256 sharesOut);

    constructor(address _usdt) Ownable(msg.sender) {
        usdt = IERC20(_usdt);
    }

    function createMarket(uint256 marketId, uint256 yesPrice, uint256 noPrice) external onlyOwner {
        require(yesPrice + noPrice <= 1e6, "prices must sum <= 1.00");
        markets[marketId] = Market(yesPrice, noPrice, true);
        emit MarketCreated(marketId, yesPrice, noPrice);
    }

    function setPrice(uint256 marketId, uint256 yesPrice, uint256 noPrice) external onlyOwner {
        require(yesPrice + noPrice <= 1e6, "prices must sum <= 1.00");
        markets[marketId].yesPrice = yesPrice;
        markets[marketId].noPrice = noPrice;
    }

    /**
     * @notice Buy outcome shares. outcome: 0 = YES, 1 = NO
     * @param marketId  The market to trade on
     * @param outcome   0 = YES, 1 = NO
     * @param usdtAmount Amount of USDT to spend (6 decimals)
     * @param minShares  Minimum shares to receive (slippage protection)
     */
    function buyOutcome(uint256 marketId, uint8 outcome, uint256 usdtAmount, uint256 minShares) external returns (uint256 shares) {
        Market memory m = markets[marketId];
        require(m.active, "market not active");

        uint256 price = outcome == 0 ? m.yesPrice : m.noPrice;
        require(price > 0, "invalid outcome");

        shares = (usdtAmount * 1e6) / price;
        require(shares >= minShares, "slippage exceeded");

        usdt.transferFrom(msg.sender, address(this), usdtAmount);
        positions[marketId][outcome][msg.sender] += shares;

        emit OrderFilled(marketId, msg.sender, outcome, usdtAmount, shares);
    }

    function getPosition(uint256 marketId, uint8 outcome, address user) external view returns (uint256) {
        return positions[marketId][outcome][user];
    }

    function getPrice(uint256 marketId) external view returns (uint256 yesPrice, uint256 noPrice) {
        return (markets[marketId].yesPrice, markets[marketId].noPrice);
    }
}
