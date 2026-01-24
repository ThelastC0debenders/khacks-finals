import hre from "hardhat";
const { ethers } = hre;

export async function deployTestToken() {
    const [deployer] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("TestToken");
    const token = await Token.deploy();

    await token.waitForDeployment();

    return token;
}
