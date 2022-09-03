// This is a script for deploying your contracts. You can adapt it to deploy
// yours, or create new ones.
async function main() {
  // This is just a convenience check
  if (network.name === "hardhat") {
    console.warn(
      "You are trying to deploy a contract to the Hardhat Network, which" +
        "gets automatically created and destroyed every time. Use the Hardhat" +
        " option '--network localhost'"
    );
  }

  // ethers is avaialble in the global scope
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying the contracts with the account:",
    await deployer.getAddress()
  );

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
  const rockPaperScissors = await RockPaperScissors.deploy();
  await rockPaperScissors.deployed();

  const Token = await ethers.getContractFactory("ERC20");
  const usdc = await Token.deploy("USD Coin", "USDC");
  const weth = await Token.deploy("Wrapped Ether", "WETH");
  await usdc.deployed();
  await weth.deployed();
  console.table({
    rockPaperScissors: { address: rockPaperScissors.address },
    usdc: { address: usdc.address },
    weth: { address: weth.address },
  });

  // We also save the contract's artifacts and address in the frontend directory
  saveFrontendFiles("RockPaperScissors", rockPaperScissors);
  saveFrontendFiles("ERC20", usdc);
  saveFrontendFiles("ERC20", weth);
}

function saveFrontendFiles(contract, instance) {
  const fs = require("fs");
  const contractsDir = __dirname + "/../frontend/src/contracts";

  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir);
  }

  fs.writeFileSync(
    contractsDir + "/contract-address.json",
    JSON.stringify({ [contract]: instance.address }, undefined, 2)
  );

  const artifact = artifacts.readArtifactSync(contract);

  fs.writeFileSync(
    contractsDir + `/${contract}.json`,
    JSON.stringify(artifact, null, 2)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
