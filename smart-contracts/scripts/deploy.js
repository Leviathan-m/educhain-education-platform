const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying EducationNFT contract...");

  // Get the contract factory
  const EducationNFT = await ethers.getContractFactory("EducationNFT");

  // Deploy the contract
  const educationNFT = await EducationNFT.deploy();

  // Wait for deployment to finish
  await educationNFT.waitForDeployment();

  const contractAddress = await educationNFT.getAddress();

  console.log("EducationNFT deployed to:", contractAddress);

  // Verify contract if on a public network
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("Waiting for block confirmations...");
    await educationNFT.deploymentTransaction().wait(5);

    console.log("Verifying contract...");
    try {
      await hre.run("verify:verify", {
        address: contractAddress,
        constructorArguments: [],
      });
      console.log("Contract verified successfully");
    } catch (error) {
      console.log("Contract verification failed:", error.message);
    }
  }

  // Log deployment details
  console.log("\nDeployment Summary:");
  console.log("==================");
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Network: ${network.name}`);
  console.log(`Block Number: ${await ethers.provider.getBlockNumber()}`);

  return contractAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
