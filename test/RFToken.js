const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RFToken", function () {
  let RFToken;
  let rfToken;
  let owner, manager, newManager, user1, user2, pair, opWallet, leaderWallet, nodePool, transferFeeWallet;
  const INITIAL_SUPPLY = ethers.parseEther("1000000000"); // 1 Billion

  beforeEach(async function () {
    [
      owner,
      manager,
      newManager,
      user1,
      user2,
      pair,
      opWallet,
      leaderWallet,
      nodePool,
      transferFeeWallet
    ] = await ethers.getSigners();

    RFToken = await ethers.getContractFactory("RFToken");
    rfToken = await RFToken.deploy(owner.address, manager.address);
    await rfToken.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name, symbol, and decimals", async function () {
      expect(await rfToken.name()).to.equal("RichFarm");
      expect(await rfToken.symbol()).to.equal("RF");
      expect(await rfToken.decimals()).to.equal(18);
    });

    it("Should mint the total supply to the owner", async function () {
      expect(await rfToken.totalSupply()).to.equal(INITIAL_SUPPLY);
      expect(await rfToken.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
    });

    it("Should set the correct owner and manager", async function () {
      expect(await rfToken.owner()).to.equal(owner.address);
      expect(await rfToken.manager()).to.equal(manager.address);
    });

    it("Should exclude owner, manager, and contract from fees", async function () {
      expect(await rfToken.isExcludedFromFees(owner.address)).to.equal(true);
      expect(await rfToken.isExcludedFromFees(manager.address)).to.equal(true);
      expect(await rfToken.isExcludedFromFees(await rfToken.getAddress())).to.equal(true);
    });
  });

  describe("Role & Permissions Management", function () {
    it("Should allow Owner to update manager", async function () {
      await rfToken.connect(owner).setManager(newManager.address);
      expect(await rfToken.manager()).to.equal(newManager.address);
    });

    it("Should allow Manager to update manager", async function () {
      await rfToken.connect(manager).setManager(newManager.address);
      expect(await rfToken.manager()).to.equal(newManager.address);
    });

    it("Should revert if non-authorized tries to update manager", async function () {
      await expect(
        rfToken.connect(user1).setManager(newManager.address)
      ).to.be.revertedWith("RFToken: caller is not authorized to set manager");
    });

    it("Should allow Owner or Manager to set fee wallets", async function () {
      await rfToken.connect(owner).setFeeWallets(
        opWallet.address,
        leaderWallet.address,
        nodePool.address,
        transferFeeWallet.address
      );
      expect(await rfToken.operationsWallet()).to.equal(opWallet.address);
      expect(await rfToken.transferFeeWallet()).to.equal(transferFeeWallet.address);

      // Verify fee wallets are auto-excluded from fees
      expect(await rfToken.isExcludedFromFees(opWallet.address)).to.equal(true);
      expect(await rfToken.isExcludedFromFees(transferFeeWallet.address)).to.equal(true);
    });

    it("Should allow Owner or Manager to update exclusions and AMM pairs", async function () {
      // Exclusions
      await rfToken.connect(manager).excludeFromFees(user1.address, true);
      expect(await rfToken.isExcludedFromFees(user1.address)).to.equal(true);

      // AMM Pair
      await rfToken.connect(manager).setAutomatedMarketMakerPair(pair.address, true);
      expect(await rfToken.automatedMarketMakerPairs(pair.address)).to.equal(true);
    });

    it("Should revert if unauthorized tries to update fee wallets or exclusions", async function () {
      await expect(
        rfToken.connect(user1).setFeeWallets(
          opWallet.address,
          leaderWallet.address,
          nodePool.address,
          transferFeeWallet.address
        )
      ).to.be.revertedWith("RFToken: caller is not owner or manager");

      await expect(
        rfToken.connect(user1).excludeFromFees(user2.address, true)
      ).to.be.revertedWith("RFToken: caller is not owner or manager");
    });
  });

  describe("Transaction Fee Mechanisms", function () {
    const amount = ethers.parseEther("1000");

    beforeEach(async function () {
      // Set up fee wallets
      await rfToken.connect(owner).setFeeWallets(
        opWallet.address,
        leaderWallet.address,
        nodePool.address,
        transferFeeWallet.address
      );

      // Send tokens to user1 (exempt from fee since sender is owner)
      await rfToken.connect(owner).transfer(user1.address, amount);
    });

    it("Normal Transfer: Should charge 0.6% transfer fee", async function () {
      // Transfer from user1 to user2 (neither is excluded)
      const transferAmount = ethers.parseEther("100");
      const expectedFee = (transferAmount * 60n) / 10000n; // 0.6% = 0.6 ETH
      const expectedRecipientAmount = transferAmount - expectedFee;

      const tx = await rfToken.connect(user1).transfer(user2.address, transferAmount);
      await tx.wait();

      expect(await rfToken.balanceOf(user2.address)).to.equal(expectedRecipientAmount);
      expect(await rfToken.balanceOf(transferFeeWallet.address)).to.equal(expectedFee);
    });

    it("Buy Slippage: Should charge 3% fee (1% op, 1% leader, 1% node)", async function () {
      // Setup pair
      await rfToken.connect(owner).setAutomatedMarketMakerPair(pair.address, true);
      
      // Give pair some tokens (exempt fee from owner)
      await rfToken.connect(owner).transfer(pair.address, amount);

      const buyAmount = ethers.parseEther("100");
      const expectedOpFee = (buyAmount * 100n) / 10000n; // 1%
      const expectedLeaderFee = (buyAmount * 100n) / 10000n; // 1%
      const expectedNodeFee = (buyAmount * 100n) / 10000n; // 1%
      const expectedTotalFee = expectedOpFee + expectedLeaderFee + expectedNodeFee;
      const expectedRecipientAmount = buyAmount - expectedTotalFee;

      // Transfer from pair to user2 (Buy transaction)
      await rfToken.connect(pair).transfer(user2.address, buyAmount);

      expect(await rfToken.balanceOf(user2.address)).to.equal(expectedRecipientAmount);
      expect(await rfToken.balanceOf(opWallet.address)).to.equal(expectedOpFee);
      expect(await rfToken.balanceOf(leaderWallet.address)).to.equal(expectedLeaderFee);
      expect(await rfToken.balanceOf(nodePool.address)).to.equal(expectedNodeFee);
    });

    it("Sell Slippage: Should charge 3% fee (1% op, 1% leader, 1% node)", async function () {
      // Setup pair
      await rfToken.connect(owner).setAutomatedMarketMakerPair(pair.address, true);

      const sellAmount = ethers.parseEther("100");
      const expectedOpFee = (sellAmount * 100n) / 10000n; // 1%
      const expectedLeaderFee = (sellAmount * 100n) / 10000n; // 1%
      const expectedNodeFee = (sellAmount * 100n) / 10000n; // 1%
      const expectedTotalFee = expectedOpFee + expectedLeaderFee + expectedNodeFee;
      const expectedRecipientAmount = sellAmount - expectedTotalFee;

      const initialPairBalance = await rfToken.balanceOf(pair.address);

      // Transfer from user1 to pair (Sell transaction)
      await rfToken.connect(user1).transfer(pair.address, sellAmount);

      expect(await rfToken.balanceOf(pair.address)).to.equal(initialPairBalance + expectedRecipientAmount);
      expect(await rfToken.balanceOf(opWallet.address)).to.equal(expectedOpFee);
      expect(await rfToken.balanceOf(leaderWallet.address)).to.equal(expectedLeaderFee);
      expect(await rfToken.balanceOf(nodePool.address)).to.equal(expectedNodeFee);
    });

    it("Whitelisted Exemption: Should not charge any fees", async function () {
      // Exclude user1 from fees
      await rfToken.connect(owner).excludeFromFees(user1.address, true);

      const transferAmount = ethers.parseEther("100");
      // Transfer from user1 (excluded) to user2
      await rfToken.connect(user1).transfer(user2.address, transferAmount);

      expect(await rfToken.balanceOf(user2.address)).to.equal(transferAmount);
      expect(await rfToken.balanceOf(transferFeeWallet.address)).to.equal(0n);
    });
  });

  describe("Owner Renouncement", function () {
    it("Should allow Manager to operate after Owner renounces", async function () {
      // Renounce ownership
      await rfToken.connect(owner).renounceOwnership();
      expect(await rfToken.owner()).to.equal(ethers.ZeroAddress);

      // Owner should no longer be able to set fee wallets
      await expect(
        rfToken.connect(owner).setFeeWallets(
          opWallet.address,
          leaderWallet.address,
          nodePool.address,
          transferFeeWallet.address
        )
      ).to.be.revertedWith("RFToken: caller is not owner or manager");

      // Manager should still be able to set fee wallets
      await rfToken.connect(manager).setFeeWallets(
        opWallet.address,
        leaderWallet.address,
        nodePool.address,
        transferFeeWallet.address
      );
      expect(await rfToken.operationsWallet()).to.equal(opWallet.address);

      // Manager can still change manager
      await rfToken.connect(manager).setManager(newManager.address);
      expect(await rfToken.manager()).to.equal(newManager.address);
    });
  });
});
