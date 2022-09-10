module.exports.useDeploy = (hre) => async function deploy() {
  const { ethers } = hre
  const { BigNumber } = ethers
  const wallets = await ethers.getSigners()

  const RockPaperScissors = await ethers.getContractFactory("RockPaperScissors");
  const rps = await RockPaperScissors.deploy().then(async t => await t.deployed());

  const Token = await ethers.getContractFactory("ERC20");
  const usdc = await Token.deploy("USD Coin", "USDC").then(async t => await t.deployed());
  const weth = await Token.deploy("Wrapped Ether", "WETH").then(async t => await t.deployed());


  return [ rps, usdc, weth ]
}