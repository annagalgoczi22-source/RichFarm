// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RFToken (RichFarm)
 * @dev Standard BEP-20 token with transaction fees, slippage, and dual-role (Owner & Manager) management.
 */
contract RFToken is ERC20, ERC20Burnable, Ownable {
    // Roles
    address public manager;

    // Fee Wallets
    address public operationsWallet;
    address public leadersWallet;
    address public superNodePool;
    address public transferFeeWallet;

    // Mappings
    mapping(address => bool) public isExcludedFromFees;
    mapping(address => bool) public automatedMarketMakerPairs;

    // Fee Configuration (100 = 1%, 10000 = 100%)
    uint256 public constant BUY_OP_FEE = 100;      // 1%
    uint256 public constant BUY_LEADER_FEE = 100;  // 1%
    uint256 public constant BUY_NODE_FEE = 100;    // 1%

    uint256 public constant SELL_OP_FEE = 100;     // 1%
    uint256 public constant SELL_LEADER_FEE = 100; // 1%
    uint256 public constant SELL_NODE_FEE = 100;   // 1%

    uint256 public constant TRANSFER_FEE = 60;     // 0.6%
    uint256 public constant FEE_DENOMINATOR = 10000;

    // Guard against recursion during fee transfers
    bool private _inFeeTransfer;

    // Events
    event ManagerUpdated(address indexed previousManager, address indexed newManager);
    event FeeWalletsUpdated(
        address operationsWallet,
        address leadersWallet,
        address superNodePool,
        address transferFeeWallet
    );
    event ExcludeFromFeesUpdated(address indexed account, bool isExcluded);
    event AutomatedMarketMakerPairUpdated(address indexed pair, bool value);

    /**
     * @dev Restricts access to either the Owner or the Manager.
     */
    modifier onlyAuthorized() {
        require(
            msg.sender == owner() || msg.sender == manager,
            "RFToken: caller is not owner or manager"
        );
        _;
    }

    constructor(address initialOwner, address initialManager)
        ERC20("RichFarm", "RF")
        Ownable(initialOwner)
    {
        require(initialOwner != address(0), "RFToken: owner cannot be zero address");
        require(initialManager != address(0), "RFToken: manager cannot be zero address");

        manager = initialManager;

        // Mint 1 Billion initial supply to owner
        _mint(initialOwner, 1_000_000_000 * 10 ** decimals());

        // Default exclusions
        isExcludedFromFees[initialOwner] = true;
        isExcludedFromFees[initialManager] = true;
        isExcludedFromFees[address(this)] = true;

        emit ManagerUpdated(address(0), initialManager);
    }

    /**
     * @dev Set or change the manager. Callable by Owner or the current Manager.
     */
    function setManager(address newManager) external {
        require(
            msg.sender == owner() || msg.sender == manager,
            "RFToken: caller is not authorized to set manager"
        );
        require(newManager != address(0), "RFToken: new manager cannot be zero address");

        emit ManagerUpdated(manager, newManager);
        manager = newManager;
        isExcludedFromFees[newManager] = true;
    }

    /**
     * @dev Set the wallets that receive fees.
     */
    function setFeeWallets(
        address _operationsWallet,
        address _leadersWallet,
        address _superNodePool,
        address _transferFeeWallet
    ) external onlyAuthorized {
        operationsWallet = _operationsWallet;
        leadersWallet = _leadersWallet;
        superNodePool = _superNodePool;
        transferFeeWallet = _transferFeeWallet;

        // Exclude fee wallets from fees automatically
        if (_operationsWallet != address(0)) isExcludedFromFees[_operationsWallet] = true;
        if (_leadersWallet != address(0)) isExcludedFromFees[_leadersWallet] = true;
        if (_superNodePool != address(0)) isExcludedFromFees[_superNodePool] = true;
        if (_transferFeeWallet != address(0)) isExcludedFromFees[_transferFeeWallet] = true;

        emit FeeWalletsUpdated(
            _operationsWallet,
            _leadersWallet,
            _superNodePool,
            _transferFeeWallet
        );
    }

    /**
     * @dev Exclude or include an account from fees.
     */
    function excludeFromFees(address account, bool exclude) external onlyAuthorized {
        isExcludedFromFees[account] = exclude;
        emit ExcludeFromFeesUpdated(account, exclude);
    }

    /**
     * @dev Set automated market maker pair (like PancakeSwap Pair).
     */
    function setAutomatedMarketMakerPair(address pair, bool value) external onlyAuthorized {
        require(pair != address(0), "RFToken: pair cannot be zero address");
        automatedMarketMakerPairs[pair] = value;
        emit AutomatedMarketMakerPairUpdated(pair, value);
    }

    /**
     * @dev Internal transfer function containing fee and slippage logic.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        // Skip fees for mint/burn, excluded addresses, or during internal fee routing
        if (
            from == address(0) ||
            to == address(0) ||
            isExcludedFromFees[from] ||
            isExcludedFromFees[to] ||
            _inFeeTransfer
        ) {
            super._update(from, to, value);
            return;
        }

        _inFeeTransfer = true;
        uint256 totalFee = 0;

        // BUY SLIPPAGE (from AMM pair)
        if (automatedMarketMakerPairs[from]) {
            uint256 opFee = (value * BUY_OP_FEE) / FEE_DENOMINATOR;
            uint256 leaderFee = (value * BUY_LEADER_FEE) / FEE_DENOMINATOR;
            uint256 nodeFee = (value * BUY_NODE_FEE) / FEE_DENOMINATOR;

            if (opFee > 0 && operationsWallet != address(0)) {
                super._update(from, operationsWallet, opFee);
                totalFee += opFee;
            }
            if (leaderFee > 0 && leadersWallet != address(0)) {
                super._update(from, leadersWallet, leaderFee);
                totalFee += leaderFee;
            }
            if (nodeFee > 0 && superNodePool != address(0)) {
                super._update(from, superNodePool, nodeFee);
                totalFee += nodeFee;
            }
        }
        // SELL SLIPPAGE (to AMM pair)
        else if (automatedMarketMakerPairs[to]) {
            uint256 opFee = (value * SELL_OP_FEE) / FEE_DENOMINATOR;
            uint256 leaderFee = (value * SELL_LEADER_FEE) / FEE_DENOMINATOR;
            uint256 nodeFee = (value * SELL_NODE_FEE) / FEE_DENOMINATOR;

            if (opFee > 0 && operationsWallet != address(0)) {
                super._update(from, operationsWallet, opFee);
                totalFee += opFee;
            }
            if (leaderFee > 0 && leadersWallet != address(0)) {
                super._update(from, leadersWallet, leaderFee);
                totalFee += leaderFee;
            }
            if (nodeFee > 0 && superNodePool != address(0)) {
                super._update(from, superNodePool, nodeFee);
                totalFee += nodeFee;
            }
        }
        // NORMAL TRANSFER FEE
        else {
            uint256 transferFee = (value * TRANSFER_FEE) / FEE_DENOMINATOR;
            if (transferFee > 0 && transferFeeWallet != address(0)) {
                super._update(from, transferFeeWallet, transferFee);
                totalFee += transferFee;
            }
        }

        uint256 amountAfterFee = value - totalFee;
        super._update(from, to, amountAfterFee);

        _inFeeTransfer = false;
    }
}
