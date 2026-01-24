import hre from "hardhat";
const { ethers } = hre;

async function main() {
    // Deploy SAFE contracts
    const counter = await ethers.deployContract("Counter");
    await counter.waitForDeployment();
    console.log(`Counter (SAFE) deployed to: ${counter.target}`);

    // Deploy Phase2 test contracts (honeypots)
    const timeLock = await ethers.deployContract("TimeLockHoneypot");
    await timeLock.waitForDeployment();
    console.log(`TimeLockHoneypot deployed to: ${timeLock.target}`);

    const whitelist = await ethers.deployContract("WhitelistHoneypot");
    await whitelist.waitForDeployment();
    console.log(`WhitelistHoneypot deployed to: ${whitelist.target}`);

    const delayed = await ethers.deployContract("DelayedTradingToken");
    await delayed.waitForDeployment();
    console.log(`DelayedTradingToken deployed to: ${delayed.target}`);

    console.log("\n✅ All contracts deployed!");
    console.log("\nUpdate verify-backend.ts with these addresses:");
    console.log(`  Counter (SAFE): ${counter.target}`);
    console.log(`  TimeLockHoneypot: ${timeLock.target}`);
    console.log(`  WhitelistHoneypot: ${whitelist.target}`);
    console.log(`  DelayedTradingToken: ${delayed.target}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
