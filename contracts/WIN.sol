// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.6.0
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract BSCUSDT is ERC20, ERC20Burnable, Ownable {
    uint8 private constant _decimals = 18; // 例如 USDT 使用 18 位小数

    constructor(
        address initialOwner
    ) ERC20("BSC TEST WIN", "TWIN") Ownable(initialOwner) {
        _mint(initialOwner, 10000000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return _decimals;
    }
}
