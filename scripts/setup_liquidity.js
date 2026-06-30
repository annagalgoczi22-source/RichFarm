const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Setting up liquidity using account:", deployer.address);

  // PancakeSwap V2 Testnet Addresses
  const PANCAKE_ROUTER_ADDRESS = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
  const PANCAKE_FACTORY_ADDRESS = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";

  // Existing deployed addresses
  const rfTokenAddress = "0x290f34868d00C0Eb545656e77f8b589423C9DEFC";
  const tusdtAddress = "0x3d729b87547EF5A042a1741cDA67f0b89529857A";

  // 1. Attach to RFToken
  console.log("Attaching to RFToken at:", rfTokenAddress);
  const rfToken = await hre.ethers.getContractAt("RFToken", rfTokenAddress);

  // 2. Attach to BSCUSDT (Test USDT)
  console.log("Attaching to BSCUSDT at:", tusdtAddress);
  const tusdt = await hre.ethers.getContractAt("BSCUSDT", tusdtAddress);

  // Check balances
  const balanceRF = await rfToken.balanceOf(deployer.address);
  const balanceUSDT = await tusdt.balanceOf(deployer.address);
  console.log(`Deployer RF Balance: ${hre.ethers.formatEther(balanceRF)} RF`);
  console.log(`Deployer TUSDT Balance: ${hre.ethers.formatEther(balanceUSDT)} TUSDT`);

  // 3. Connect to PancakeSwap Router and Factory
  const router = await hre.ethers.getContractAt([
    "function factory() external pure returns (address)",
    "function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)"
  ], PANCAKE_ROUTER_ADDRESS);

  const factory = await hre.ethers.getContractAt([
    "function getPair(address tokenA, address tokenB) external view returns (address)"
  ], PANCAKE_FACTORY_ADDRESS);

  // 4. Set the amount of liquidity to add (e.g. 1000 RF and 1000 TUSDT)
  // Feel free to adjust these numbers
  const amountRF = hre.ethers.parseEther("1000");
  const amountUSDT = hre.ethers.parseEther("1000");

  if (balanceRF < amountRF) {
    throw new Error(`Insufficient RFToken balance. Need ${hre.ethers.formatEther(amountRF)}, have ${hre.ethers.formatEther(balanceRF)}`);
  }
  if (balanceUSDT < amountUSDT) {
    throw new Error(`Insufficient TUSDT balance. Need ${hre.ethers.formatEther(amountUSDT)}, have ${hre.ethers.formatEther(balanceUSDT)}`);
  }

  // 5. Approve Router to spend tokens
  console.log("Approving PancakeSwap Router to spend RF and TUSDT...");
  const approveRFTx = await rfToken.approve(PANCAKE_ROUTER_ADDRESS, amountRF);
  await approveRFTx.wait();
  console.log("Approved RFToken.");
  
  const approveUSDTTx = await tusdt.approve(PANCAKE_ROUTER_ADDRESS, amountUSDT);
  await approveUSDTTx.wait();
  console.log("Approved TUSDT.");

  // 6. Add Liquidity (creates the pair if it does not exist)
  console.log("Adding liquidity to PancakeSwap V2...");
  const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now

  const addLiqTx = await router.addLiquidity(
    rfTokenAddress,
    tusdtAddress,
    amountRF,
    amountUSDT,
    0, // slippage parameters (0 for simplicity on testnet)
    0,
    deployer.address,
    deadline
  );
  await addLiqTx.wait();
  console.log("Liquidity added successfully!");

  // 7. Get the created/existing Pair address
  const pairAddress = await factory.getPair(rfTokenAddress, tusdtAddress);
  console.log("PancakeSwap Pair Address:", pairAddress);

  // 8. Set pair in RFToken contract to enable Buy/Sell slippage fees
  console.log("Setting PancakeSwap Pair in RFToken contract...");
  const setPairTx = await rfToken.setAutomatedMarketMakerPair(pairAddress, true);
  await setPairTx.wait();
  console.log("PancakeSwap Pair successfully registered in RFToken!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
