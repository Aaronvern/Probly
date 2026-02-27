// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDT
 * @notice Mintable USDT stand-in for BSC testnet.
 *         Anyone can mint up to 10,000 USDT per call for demo purposes.
 */
contract MockUSDT is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 10_000 * 1e6; // 10,000 USDT
    uint8 private constant DECIMALS = 6;

    constructor() ERC20("Mock USDT", "mUSDT") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Free mint for testnet — anyone can call
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Owner mint for seeding contracts
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
