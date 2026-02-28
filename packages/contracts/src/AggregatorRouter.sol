// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./MockPredict.sol";
import "./MockProbable.sol";
import "./MockLista.sol";

/**
 * @title AggregatorRouter
 * @notice The on-chain Smart Order Router for Probly.
 *
 *         Routes trade intents to the best-priced mock venue (MockPredict
 *         or MockProbable), enforces slippage via minShares, and optionally
 *         performs JIT unwrap from MockLista yield pool before execution.
 *
 *         Backend calls executeBestTrade() with the optimal venue + split
 *         calculated off-chain by the SOR.
 */
contract AggregatorRouter is Ownable {
    IERC20 public immutable usdt;
    MockPredict public immutable mockPredict;
    MockProbable public immutable mockProbable;
    MockLista public immutable mockLista;

    enum Venue { PREDICT, PROBABLE }

    event TradeFilled(
        address indexed trader,
        uint256 indexed marketId,
        uint8 outcome,
        Venue venue,
        uint256 usdtIn,
        uint256 sharesOut
    );

    event SplitTrade(
        address indexed trader,
        uint256 indexed marketId,
        uint8 outcome,
        uint256 predictShares,
        uint256 probableShares
    );

    event YieldUnwrapped(
        address indexed trader,
        uint256 yieldAmount,
        uint256 shortfall
    );

    constructor(
        address _usdt,
        address _mockPredict,
        address _mockProbable,
        address _mockLista
    ) Ownable(msg.sender) {
        usdt = IERC20(_usdt);
        mockPredict = MockPredict(_mockPredict);
        mockProbable = MockProbable(_mockProbable);
        mockLista = MockLista(_mockLista);
    }

    /**
     * @notice Route trade to single best venue.
     * @param marketId   Market identifier
     * @param outcome    0 = YES, 1 = NO
     * @param usdtAmount USDT to spend (6 decimals)
     * @param minShares  Minimum shares to receive (slippage protection)
     * @param venue      Which mock venue to use (0 = PREDICT, 1 = PROBABLE)
     * @param useYield   If true, JIT-unwrap from Lista before trade
     */
    function executeBestTrade(
        uint256 marketId,
        uint8 outcome,
        uint256 usdtAmount,
        uint256 minShares,
        Venue venue,
        bool useYield
    ) external returns (uint256 sharesOut) {
        _fundTrade(usdtAmount, useYield);

        if (venue == Venue.PREDICT) {
            usdt.approve(address(mockPredict), usdtAmount);
            sharesOut = mockPredict.buyOutcome(marketId, outcome, usdtAmount, minShares);
        } else {
            usdt.approve(address(mockProbable), usdtAmount);
            sharesOut = mockProbable.buyOutcome(marketId, outcome, usdtAmount, minShares);
        }

        emit TradeFilled(msg.sender, marketId, outcome, venue, usdtAmount, sharesOut);
    }

    /**
     * @notice Meta-Bet split trade across both venues.
     *         Backend computes the optimal split off-chain; router enforces slippage.
     * @param marketId       Market identifier
     * @param outcome        0 = YES, 1 = NO
     * @param predictAmount  USDT to route to MockPredict
     * @param probableAmount USDT to route to MockProbable
     * @param minPredictShares  Slippage guard for Predict leg
     * @param minProbableShares Slippage guard for Probable leg
     * @param useYield       If true, JIT-unwrap from Lista before trade
     */
    function executeSplitTrade(
        uint256 marketId,
        uint8 outcome,
        uint256 predictAmount,
        uint256 probableAmount,
        uint256 minPredictShares,
        uint256 minProbableShares,
        bool useYield
    ) external returns (uint256 predictShares, uint256 probableShares) {
        uint256 total = predictAmount + probableAmount;
        _fundTrade(total, useYield);

        if (predictAmount > 0) {
            usdt.approve(address(mockPredict), predictAmount);
            predictShares = mockPredict.buyOutcome(marketId, outcome, predictAmount, minPredictShares);
        }

        if (probableAmount > 0) {
            usdt.approve(address(mockProbable), probableAmount);
            probableShares = mockProbable.buyOutcome(marketId, outcome, probableAmount, minProbableShares);
        }

        emit SplitTrade(msg.sender, marketId, outcome, predictShares, probableShares);
    }

    /**
     * @dev Fund a trade: JIT-unwrap from Lista if requested, then pull any shortfall from user wallet.
     */
    function _fundTrade(uint256 amount, bool useYield) internal {
        if (useYield) {
            uint256 fromYield = mockLista.withdrawFor(msg.sender, amount);
            if (fromYield >= amount) {
                // Yield fully covers trade; refund surplus to user
                if (fromYield > amount) {
                    usdt.transfer(msg.sender, fromYield - amount);
                }
                emit YieldUnwrapped(msg.sender, fromYield, 0);
                return;
            }
            // Partial yield — pull only the shortfall from user wallet
            uint256 shortfall = amount - fromYield;
            usdt.transferFrom(msg.sender, address(this), shortfall);
            emit YieldUnwrapped(msg.sender, fromYield, shortfall);
        } else {
            usdt.transferFrom(msg.sender, address(this), amount);
        }
    }

    /**
     * @notice Quote the best price across both venues for a given market/outcome.
     *         Returns the cheaper venue and both prices for transparency.
     */
    function quoteBestVenue(uint256 marketId, uint8 outcome)
        external
        view
        returns (Venue bestVenue, uint256 bestPrice, uint256 predictPrice, uint256 probablePrice)
    {
        (uint256 pYes, uint256 pNo) = mockPredict.getPrice(marketId);
        (uint256 bYes, uint256 bNo) = mockProbable.getPrice(marketId);

        predictPrice = outcome == 0 ? pYes : pNo;
        probablePrice = outcome == 0 ? bYes : bNo;

        if (predictPrice <= probablePrice) {
            bestVenue = Venue.PREDICT;
            bestPrice = predictPrice;
        } else {
            bestVenue = Venue.PROBABLE;
            bestPrice = probablePrice;
        }
    }
}
