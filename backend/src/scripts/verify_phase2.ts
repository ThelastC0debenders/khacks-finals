/**
 * Phase 2 Feature Verification Script
 *
 * Tests:
 * 1. Time-Travel Simulation - Detect delayed honeypots
 * 2. Counterfactual Risk Simulation - Detect owner privileges
 *
 * Run with: npx tsx scripts/verify_phase2.ts
 */

import { EvmExecutor } from "../src/evm/EvmExecutor.js";
import { ethers } from "ethers";

const CHAIN_ID = 31337; // Hardhat local

// Transfer function selector: transfer(address,uint256)
const TRANSFER_SELECTOR = "a9059cbb";

function encodeTransfer(to: string, amount: bigint): string {
    // transfer(address,uint256)
    const toAddress = to.toLowerCase().replace("0x", "").padStart(64, "0");
    const amountHex = amount.toString(16).padStart(64, "0");
    return "0x" + TRANSFER_SELECTOR + toAddress + amountHex;
}

async function testTimeLockHoneypot(executor: EvmExecutor, contractAddress: string) {
    console.log("\n" + "=".repeat(60));
    console.log("TEST 1: TimeLockHoneypot");
    console.log("Expected: Detect time-bomb (fails after 7 days)");
    console.log("=".repeat(60));

    const randomUser = "0x" + "1".repeat(40);
    const recipient = "0x" + "2".repeat(40);

    const txParams = {
        from: randomUser,
        to: contractAddress,
        data: encodeTransfer(recipient, BigInt(1000)),
        value: "0x0"
    };

    const result = await executor.simulateTransaction(txParams, CHAIN_ID);

    console.log("\n--- Results ---");
    console.log("Status:", result.status);
    console.log("Security Report:", JSON.stringify(result.securityReport, null, 2));

    if (result.advancedAnalysis) {
        console.log("\n--- Advanced Analysis ---");
        console.log("Time-Travel:", JSON.stringify(result.advancedAnalysis.timeTravel, null, 2));
        console.log("Counterfactual:", JSON.stringify(result.advancedAnalysis.counterfactual, null, 2));
        console.log("Overall Summary:", result.advancedAnalysis.overallSummary);
        console.log("Is Scam:", result.advancedAnalysis.isScam);
    }

    return result;
}

async function testWhitelistHoneypot(executor: EvmExecutor, contractAddress: string, ownerAddress: string) {
    console.log("\n" + "=".repeat(60));
    console.log("TEST 2: WhitelistHoneypot");
    console.log("Expected: Detect owner privileges (only owner can sell)");
    console.log("=".repeat(60));

    const randomUser = "0x" + "3".repeat(40);
    const recipient = "0x" + "4".repeat(40);

    const txParams = {
        from: randomUser,
        to: contractAddress,
        data: encodeTransfer(recipient, BigInt(1000)),
        value: "0x0"
    };

    const result = await executor.simulateTransaction(txParams, CHAIN_ID);

    console.log("\n--- Results ---");
    console.log("Status:", result.status);
    console.log("Security Report:", JSON.stringify(result.securityReport, null, 2));

    if (result.advancedAnalysis) {
        console.log("\n--- Advanced Analysis ---");
        console.log("Time-Travel Summary:", result.advancedAnalysis.timeTravel?.summary);
        console.log("Counterfactual Summary:", result.advancedAnalysis.counterfactual?.summary);
        console.log("Is Honeypot:", result.advancedAnalysis.counterfactual?.isHoneypot);
        console.log("Has Owner Privileges:", result.advancedAnalysis.counterfactual?.hasOwnerPrivileges);
        console.log("Overall Summary:", result.advancedAnalysis.overallSummary);
        console.log("Is Scam:", result.advancedAnalysis.isScam);
    }

    return result;
}

async function testDelayedTrading(executor: EvmExecutor, contractAddress: string) {
    console.log("\n" + "=".repeat(60));
    console.log("TEST 3: DelayedTradingToken");
    console.log("Expected: Detect delayed trading (opens in 24h)");
    console.log("=".repeat(60));

    const randomUser = "0x" + "5".repeat(40);
    const recipient = "0x" + "6".repeat(40);

    const txParams = {
        from: randomUser,
        to: contractAddress,
        data: encodeTransfer(recipient, BigInt(1000)),
        value: "0x0"
    };

    const result = await executor.simulateTransaction(txParams, CHAIN_ID);

    console.log("\n--- Results ---");
    console.log("Status:", result.status);

    if (result.advancedAnalysis) {
        console.log("\n--- Time-Travel Analysis ---");
        console.log("Is Time Sensitive:", result.advancedAnalysis.timeTravel?.isTimeSensitive);
        console.log("Current Result:", result.advancedAnalysis.timeTravel?.currentResult);
        console.log("Future Results:");
        for (const fr of result.advancedAnalysis.timeTravel?.futureResults || []) {
            console.log(`  ${fr.offset}: ${fr.status}${fr.diverges ? " (DIVERGES)" : ""}`);
        }
        console.log("Summary:", result.advancedAnalysis.timeTravel?.summary);
        console.log("Risk Flags:", result.advancedAnalysis.timeTravel?.riskFlags);
    }

    return result;
}

async function main() {
    console.log("Phase 2 Feature Verification");
    console.log("============================\n");

    // Check if hardhat node is running
    try {
        const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        await provider.getNetwork();
        console.log("✓ Hardhat node is running\n");
    } catch {
        console.error("✗ Hardhat node not running. Start with: npx hardhat node");
        console.error("  Then deploy contracts: npx hardhat run scripts/deploy_phase2.ts --network localhost");
        process.exit(1);
    }

    // Get contract addresses from command line or use defaults
    const args = process.argv.slice(2);
    let timeLockAddr = args[0];
    let whitelistAddr = args[1];
    let delayedAddr = args[2];

    if (!timeLockAddr || !whitelistAddr || !delayedAddr) {
        console.log("Usage: npx tsx scripts/verify_phase2.ts <TimeLockAddr> <WhitelistAddr> <DelayedAddr>");
        console.log("\nNo addresses provided. Please deploy contracts first:");
        console.log("  npx hardhat run scripts/deploy_phase2.ts --network localhost");
        console.log("\nThen run this script with the deployed addresses.");
        process.exit(1);
    }

    const executor = new EvmExecutor();

    // Run tests
    const results = {
        timeLock: await testTimeLockHoneypot(executor, timeLockAddr),
        whitelist: await testWhitelistHoneypot(executor, whitelistAddr, "0x" + "f".repeat(40)),
        delayed: await testDelayedTrading(executor, delayedAddr)
    };

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("VERIFICATION SUMMARY");
    console.log("=".repeat(60));

    console.log("\n1. TimeLockHoneypot:");
    console.log(`   Time Sensitive: ${results.timeLock.advancedAnalysis?.timeTravel?.isTimeSensitive}`);
    console.log(`   Is Scam: ${results.timeLock.advancedAnalysis?.isScam}`);

    console.log("\n2. WhitelistHoneypot:");
    console.log(`   Is Honeypot: ${results.whitelist.advancedAnalysis?.counterfactual?.isHoneypot}`);
    console.log(`   Has Owner Privileges: ${results.whitelist.advancedAnalysis?.counterfactual?.hasOwnerPrivileges}`);
    console.log(`   Is Scam: ${results.whitelist.advancedAnalysis?.isScam}`);

    console.log("\n3. DelayedTradingToken:");
    console.log(`   Time Sensitive: ${results.delayed.advancedAnalysis?.timeTravel?.isTimeSensitive}`);
    console.log(`   Is Scam: ${results.delayed.advancedAnalysis?.isScam}`);

    console.log("\n✓ Phase 2 verification complete!");
}

main().catch(console.error);
