import { EvmExecutor } from "./EvmExecutor.ts";

async function main() {
    const executor = new EvmExecutor();

    // 1. Forking Demo (Skipped if no URL)
    if (process.env.MAINNET_RPC_URL) {
        await executor.resetFork(process.env.MAINNET_RPC_URL);
    }

    // 2. Run Simulations & Analyze
    const transferReceipt = await executor.simulateTransfer();
    await analyze(executor, transferReceipt);

    const approveReceipt = await executor.simulateApproveDrain();
    await analyze(executor, approveReceipt);
}

async function analyze(executor: EvmExecutor, receipt: any) {
    if (!receipt) return;
    const txHash = receipt.hash;

    console.log(`\n--- Analysis for ${txHash} ---`);

    // Trace
    let trace = {};
    try {
        trace = await executor.getTrace(txHash);
        // structLogs contains the steps in default debug trace
        console.log(`Debug Trace: ${(trace as any)?.structLogs?.length || 0} steps`);
    } catch (e: any) {
        console.log("Trace failed (requires Hardhat Network / specific RPC):", e.message.split('\n')[0]);
    }

    // State Diff
    let diff = {};
    try {
        diff = await executor.getStateDiff(txHash);
        console.log("State Diff Keys:", Object.keys(diff || {}));
    } catch (e: any) {
        console.log("State Diff failed:", e.message.split('\n')[0]);
    }

    // Snap Payload
    try {
        const payload = executor.formatForSnap(trace, diff);
        console.log("Snap Payload:", JSON.stringify(payload, null, 2));
    } catch (e: any) {
        console.log("Snap formation failed:", e.message);
    }
}

main();
