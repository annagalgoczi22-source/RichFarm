const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const ownerAddress = process.env.OWNER_ADDRESS || deployer.address;
  const managerAddress = process.env.MANAGER_ADDRESS || deployer.address;

  console.log("Owner Address:", ownerAddress);
  console.log("Manager Address:", managerAddress);

  const RFToken = await hre.ethers.getContractFactory("RFToken");
  const rfToken = await RFToken.deploy(ownerAddress, managerAddress);

  await rfToken.waitForDeployment();

  console.log("RFToken deployed to:", await rfToken.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
