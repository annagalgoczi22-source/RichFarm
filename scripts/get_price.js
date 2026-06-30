const hre = require("hardhat");

async function main() {
  const rfTokenAddress = "0x290f34868d00C0Eb545656e77f8b589423C9DEFC";
  const tusdtAddress = "0x3d729b87547EF5A042a1741cDA67f0b89529857A";
  const pairAddress = "0x451e07e111C4a9Cee12ec265f27a4915098FF27B";

  // Connect to the Pair contract
  const pair = await hre.ethers.getContractAt([
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)"
  ], pairAddress);

  const reserveData = await pair.getReserves();
  const token0 = await pair.token0();

  let reserveRF, reserveUSDT;
  if (token0.toLowerCase() === rfTokenAddress.toLowerCase()) {
    reserveRF = reserveData.reserve0;
    reserveUSDT = reserveData.reserve1;
  } else {
    reserveRF = reserveData.reserve1;
    reserveUSDT = reserveData.reserve0;
  }

  const price = Number(reserveUSDT) / Number(reserveRF);
  console.log(`=== Pool Reserves ===`);
  console.log(`RF Reserves   : ${hre.ethers.formatEther(reserveRF)} RF`);
  console.log(`TUSDT Reserves: ${hre.ethers.formatEther(reserveUSDT)} TUSDT`);
  console.log(`---------------------`);
  console.log(`Current Price : 1 RF = ${price.toFixed(6)} TUSDT`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
