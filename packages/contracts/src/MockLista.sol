// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockLista
 * @notice Simulates Lista DAO Stable Pool yield on BSC testnet.
 *
 *         Real integration: idle USDT is deposited into Lista DAO's top-rated
 *         Stable Pool, earning ~4.05% APY across unused capital.
 *
 *         Testnet simulation: accrues yield linearly at 4.05% APY.
 *         JIT unwrap: AggregatorRouter calls withdraw() exactly when a trade
 *         executes, pulling capital from yield back into the trade.
 */
contract MockLista is Ownable {
    IERC20 public immutable usdt;
    address public router;

    uint256 public constant APY_BPS = 405; // 4.05% in basis points
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    struct Deposit {
        uint256 amount;       // principal in USDT (6 decimals)
        uint256 depositedAt;  // block timestamp
    }

    mapping(address => Deposit) public deposits;
    uint256 public totalDeposited;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 principal, uint256 yield);

    constructor(address _usdt) Ownable(msg.sender) {
        usdt = IERC20(_usdt);
    }

    function setRouter(address _router) external onlyOwner {
        router = _router;
    }

    /**
     * @notice Deposit idle USDT into the Lista Stable Pool simulation.
     *         Any existing deposit is settled first (yield added to principal).
     */
    function deposit(uint256 amount) external {
        require(amount > 0, "zero amount");

        // Settle existing deposit first
        if (deposits[msg.sender].amount > 0) {
            uint256 accrued = _accrued(msg.sender);
            deposits[msg.sender].amount += accrued;
            deposits[msg.sender].depositedAt = block.timestamp;
        }

        usdt.transferFrom(msg.sender, address(this), amount);
        deposits[msg.sender].amount += amount;
        deposits[msg.sender].depositedAt = block.timestamp;
        totalDeposited += amount;

        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice JIT withdraw — called by AggregatorRouter right before trade execution.
     *         Returns principal + accrued yield to the caller.
     */
    function withdraw(uint256 amount) external returns (uint256 total) {
        Deposit storage d = deposits[msg.sender];
        require(d.amount >= amount, "insufficient deposit");

        uint256 accrued = _accrued(msg.sender);
        uint256 yieldShare = (accrued * amount) / d.amount;

        d.amount -= amount;
        d.depositedAt = block.timestamp;
        totalDeposited -= amount;

        total = amount + yieldShare;
        usdt.transfer(msg.sender, total);

        emit Withdrawn(msg.sender, amount, yieldShare);
    }

    /// @notice Withdraw everything
    function withdrawAll() external returns (uint256 total) {
        Deposit storage d = deposits[msg.sender];
        require(d.amount > 0, "nothing deposited");

        uint256 principal = d.amount;
        uint256 accrued = _accrued(msg.sender);
        total = principal + accrued;

        totalDeposited -= principal;
        delete deposits[msg.sender];

        usdt.transfer(msg.sender, total);
        emit Withdrawn(msg.sender, principal, accrued);
    }

    /**
     * @notice Router-only withdraw on behalf of a user.
     *         Returns 0 gracefully if user has no deposit (no revert).
     *         Sends principal + proportional yield to msg.sender (the Router).
     */
    function withdrawFor(address user, uint256 maxAmount) external returns (uint256 total) {
        require(msg.sender == router, "only router");

        Deposit storage d = deposits[user];
        if (d.amount == 0) return 0;

        uint256 amount = maxAmount > d.amount ? d.amount : maxAmount;
        uint256 accrued = _accrued(user);
        uint256 yieldShare = (accrued * amount) / d.amount;

        d.amount -= amount;
        d.depositedAt = block.timestamp;
        totalDeposited -= amount;

        total = amount + yieldShare;
        usdt.transfer(msg.sender, total);

        emit Withdrawn(user, amount, yieldShare);
    }

    /// @notice View accrued yield for a user
    function pendingYield(address user) external view returns (uint256) {
        return _accrued(user);
    }

    /// @notice View total balance (principal + yield) for a user
    function balanceOf(address user) external view returns (uint256) {
        return deposits[user].amount + _accrued(user);
    }

    function _accrued(address user) internal view returns (uint256) {
        Deposit memory d = deposits[user];
        if (d.amount == 0) return 0;
        uint256 elapsed = block.timestamp - d.depositedAt;
        return (d.amount * APY_BPS * elapsed) / (BPS_DENOMINATOR * SECONDS_PER_YEAR);
    }

    /// @notice Owner seeds contract with USDT to cover yield payouts
    function seed(uint256 amount) external onlyOwner {
        usdt.transferFrom(msg.sender, address(this), amount);
    }
}
