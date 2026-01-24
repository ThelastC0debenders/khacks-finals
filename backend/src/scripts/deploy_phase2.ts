import hre from "hardhat";
const { ethers } = hre;

async function main() {
    console.log("Deploying Phase 2 Test Contracts...\n");

    // Deploy TimeLockHoneypot
    const timeLock = await ethers.deployContract("TimeLockHoneypot");
    await timeLock.waitForDeployment();
    console.log(`TimeLockHoneypot deployed to: ${timeLock.target}`);
    console.log("  - Trading window: 7 days from deployment");
    console.log("  - After 7 days: only owner can trade\n");

    // Deploy WhitelistHoneypot
    const whitelist = await ethers.deployContract("WhitelistHoneypot");
    await whitelist.waitForDeployment();
    console.log(`WhitelistHoneypot deployed to: ${whitelist.target}`);
    console.log("  - Only whitelisted addresses can sell");
    console.log("  - Owner is auto-whitelisted\n");

    // Deploy DelayedTradingToken
    const delayed = await ethers.deployContract("DelayedTradingToken");
    await delayed.waitForDeployment();
    console.log(`DelayedTradingToken deployed to: ${delayed.target}`);
    console.log("  - Trading opens 24 hours after deployment\n");

    console.log("=== Summary ===");
    console.log(`TimeLockHoneypot:    ${timeLock.target}`);
    console.log(`WhitelistHoneypot:   ${whitelist.target}`);
    console.log(`DelayedTradingToken: ${delayed.target}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
