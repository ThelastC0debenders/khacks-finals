import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // Deploy Safe Contract
    const SafeVault = await ethers.getContractFactory("SafeVault");
    const safeVault = await SafeVault.deploy();
    await safeVault.waitForDeployment();
    console.log("SafeVault deployed to:", await safeVault.getAddress());

    // Deploy Malicious Contract
    const Honeypot = await ethers.getContractFactory("Honeypot");
    const honeypot = await Honeypot.deploy();
    await honeypot.waitForDeployment();
    console.log("Honeypot deployed to:", await honeypot.getAddress());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
