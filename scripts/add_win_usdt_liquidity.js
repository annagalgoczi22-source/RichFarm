const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=================================================");
  console.log("Account:", deployer.address);
  const bnbBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("BNB Balance:", hre.ethers.formatEther(bnbBalance), "BNB");
  console.log("=================================================");

  // PancakeSwap V2 BSC Testnet
  const PANCAKE_ROUTER_ADDRESS  = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
  const PANCAKE_FACTORY_ADDRESS = "0x6725F303b657a9451d8BA641348b6761A6CC7a17";

  // Token addresses
  const BSCUSDT_ADDRESS = "0x3d729b87547EF5A042a1741cDA67f0b89529857A";
  const WIN_ADDRESS     = "0x69c7856baf3E06b1De849753b32D093d4CaA0420";

  // Standard ERC20 ABI (both tokens are plain ERC20)
  const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
  ];

  // 1. Attach to both tokens
  const bscUsdt = await hre.ethers.getContractAt(ERC20_ABI, BSCUSDT_ADDRESS);
  const winToken = await hre.ethers.getContractAt(ERC20_ABI, WIN_ADDRESS);

  const usdtSymbol = await bscUsdt.symbol();
  const winSymbol  = await winToken.symbol();
  const usdtDec    = await bscUsdt.decimals();
  const winDec     = await winToken.decimals();

  console.log(`BSCUSDT: ${usdtSymbol} (decimals=${usdtDec})`);
  console.log(`WIN    : ${winSymbol}  (decimals=${winDec})`);

  // 2. Check balances
  const balanceUSDT = await bscUsdt.balanceOf(deployer.address);
  const balanceWIN  = await winToken.balanceOf(deployer.address);
  console.log(`\nDeployer ${usdtSymbol} Balance: ${hre.ethers.formatUnits(balanceUSDT, usdtDec)}`);
  console.log(`Deployer ${winSymbol}  Balance: ${hre.ethers.formatUnits(balanceWIN, winDec)}`);

  // 3. Set liquidity amounts (1:1 ratio, 1000 each)
  const amountUSDT = hre.ethers.parseUnits("1000", usdtDec);
  const amountWIN  = hre.ethers.parseUnits("1000", winDec);

  if (balanceUSDT < amountUSDT) {
    throw new Error(
      `Insufficient ${usdtSymbol}. Need 1000, have ${hre.ethers.formatUnits(balanceUSDT, usdtDec)}`
    );
  }
  if (balanceWIN < amountWIN) {
    throw new Error(
      `Insufficient ${winSymbol}. Need 1000, have ${hre.ethers.formatUnits(balanceWIN, winDec)}`
    );
  }

  // 4. Connect to Router and Factory
  const router = await hre.ethers.getContractAt(
    [
      "function factory() external pure returns (address)",
      "function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)",
    ],
    PANCAKE_ROUTER_ADDRESS
  );

  const factory = await hre.ethers.getContractAt(
    ["function getPair(address tokenA, address tokenB) external view returns (address)"],
    PANCAKE_FACTORY_ADDRESS
  );

  // 5. Check if pair already exists
  const existingPair = await factory.getPair(BSCUSDT_ADDRESS, WIN_ADDRESS);
  if (existingPair !== hre.ethers.ZeroAddress) {
    console.log(`\n⚠️  Pair already exists: ${existingPair}`);
    console.log("Will add liquidity to the existing pair.");
  } else {
    console.log("\n✅ No existing pair found – a new pair will be created.");
  }

  // 6. Approve Router
  console.log(`\nApproving Router to spend ${usdtSymbol}...`);
  const approveTx1 = await bscUsdt.approve(PANCAKE_ROUTER_ADDRESS, amountUSDT);
  await approveTx1.wait();
  console.log(`  ${usdtSymbol} approved. Tx: ${approveTx1.hash}`);

  console.log(`Approving Router to spend ${winSymbol}...`);
  const approveTx2 = await winToken.approve(PANCAKE_ROUTER_ADDRESS, amountWIN);
  await approveTx2.wait();
  console.log(`  ${winSymbol} approved. Tx: ${approveTx2.hash}`);

  // 7. Add Liquidity
  console.log("\nAdding liquidity to PancakeSwap V2...");
  const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes

  const addLiqTx = await router.addLiquidity(
    BSCUSDT_ADDRESS,
    WIN_ADDRESS,
    amountUSDT,
    amountWIN,
    0,  // amountAMin (0 = no slippage protection, OK for testnet)
    0,  // amountBMin
    deployer.address,
    deadline
  );
  const receipt = await addLiqTx.wait();
  console.log(`✅ Liquidity added! Tx: ${addLiqTx.hash}`);
  console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

  // 8. Get Pair address
  const pairAddress = await factory.getPair(BSCUSDT_ADDRESS, WIN_ADDRESS);
  console.log("\n=================================================");
  console.log(`✅ PancakeSwap Pair Address: ${pairAddress}`);
  console.log(`   ${usdtSymbol}: ${BSCUSDT_ADDRESS}`);
  console.log(`   ${winSymbol} : ${WIN_ADDRESS}`);
  console.log("=================================================");
  console.log(`\n🔗 View on BscScan Testnet:`);
  console.log(`   https://testnet.bscscan.com/address/${pairAddress}`);
  console.log(`\n🔗 Trade on PancakeSwap Testnet:`);
  console.log(`   https://pancakeswap.finance/?chain=bscTestnet`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error.message || error);
    process.exit(1);
  });
