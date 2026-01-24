import hre from "hardhat";
const { ethers } = hre;

async function main() {
    const hp = await ethers.deployContract("HoneypotV2");
    await hp.waitForDeployment();
    console.log(`HoneypotV2 deployed to: ${hp.target}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
