import hre from "hardhat";
const { ethers } = hre;

async function main() {
    const counter = await ethers.deployContract("Counter");
    await counter.waitForDeployment();
    console.log(`Counter deployed to: ${counter.target}`);

    const malicious = await ethers.deployContract("Malicious");
    await malicious.waitForDeployment();
    console.log(`Malicious deployed to: ${malicious.target}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
