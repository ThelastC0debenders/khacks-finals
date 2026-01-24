import { EVM } from "@ethereumjs/evm";
import { Address } from "@ethereumjs/util";

export interface ProxyInfo {
    isProxy: boolean;
    proxyType?: 'EIP-1967' | 'EIP-1822' | 'EIP-897' | 'Minimal';
    implementationAddress?: string;
    beaconAddress?: string;
    adminAddress?: string;
}

export interface SecurityReport {
    isHoneypot: boolean;
    ownershipStatus: "Unknown" | "Renounced" | "Centralized";
    riskScore: number; // 0 (Safe) to 100 (High Risk)
    flags: string[];
    proxyInfo?: ProxyInfo;
    analyzedAddress?: string; // The actual address analyzed (implementation if proxy)
    ownerAddress?: string; // [NEW] Needed for Counterfactual Simulation
    friendlyExplanation?: string;
    mechanismStory?: {
        title: string;
        story: string;
        severity: string;
    };
    tracingEvents?: string[];
}

export class SecurityAnalyzer {

    // Function selector for owner() -> 0x8da5cb5b
    private static OWNER_SELECTOR = Buffer.from("8da5cb5b", "hex");

    static async analyze(evm: EVM, targetAddress: Address, simulationResult: any, provider?: any): Promise<SecurityReport> {
        console.log("[Security] ===== STARTING SECURITY ANALYSIS =====");
        console.log("[Security] Target:", targetAddress.toString());
        console.log("[Security] Simulation status:", simulationResult.status);

        const report: SecurityReport = {
            isHoneypot: false,
            ownershipStatus: "Unknown",
            riskScore: 0,
            flags: []
        };

        // 1. Analyze Simulation Result
        if (simulationResult.status && simulationResult.status.startsWith("Reverted")) {
            report.flags.push("Simulation Reverted");
            report.riskScore += 20;
        }

        // 2. Check Ownership
        try {
            // Try EVM first
            let ownerResult = await evm.runCall({
                to: targetAddress,
                data: SecurityAnalyzer.OWNER_SELECTOR,
                gasLimit: BigInt(50000)
            });

            let returnValue = ownerResult.execResult.returnValue;

            // If EVM result is empty/zero and we have a provider, try RPC
            const isEvmZero = returnValue.length === 0 || returnValue.every(b => b === 0);
            if (isEvmZero && provider) {
                console.log("[Security] Local EVM missing storage. Trying RPC for owner()...");
                try {
                    const rpcResult = await provider.call({
                        to: targetAddress.toString(),
                        data: "0x8da5cb5b" // owner()
                    });
                    if (rpcResult && rpcResult !== "0x") {
                        returnValue = Buffer.from(rpcResult.slice(2), 'hex'); // remove 0x
                        console.log("[Security] RPC returned owner data length:", returnValue.length);
                    }
                } catch (rpcErr) {
                    console.warn("[Security] RPC owner check failed:", rpcErr);
                }
            }

            console.log("[Security] Owner check - Return value:", returnValue);

            if (returnValue && returnValue.length >= 20) {
                const ownerBytes = returnValue.length === 32 ? returnValue.subarray(12) : returnValue;
                const isZero = ownerBytes.every(b => b === 0);

                const ownerAddress = new Address(Buffer.from(ownerBytes)).toString();
                console.log("[Security] Owner Address:", ownerAddress);

                if (isZero) {
                    report.ownershipStatus = "Renounced";
                    report.flags.push("Ownership Renounced (Safe)");
                } else {
                    report.ownershipStatus = "Centralized";
                    report.ownerAddress = ownerAddress;
                    report.flags.push(`Contract has an Owner: ${ownerAddress}`);
                    report.riskScore += 10;
                }
            }
        } catch (e) {
            console.error("[Security] Owner check failed:", e);
        }

        // 3. Bytecode Analysis (Simple Honeypot markers)
        try {
            const code = await evm.stateManager.getCode(targetAddress);
            const codeHex = Buffer.from(code).toString('hex').toLowerCase();

            console.log("[Security] Bytecode length:", code.length);
            console.log("[Security] Scanning for suspicious patterns...");

            // Define suspicious function signatures
            // Define suspicious function signatures (4-byte selectors)
            const suspiciousPatterns = [
                // Blacklists & Pausing (High Control)
                { name: "blacklist(address)", selector: "f9f92be4", risk: 50 }, // blacklist(address)
                { name: "pause()", selector: "8456cb59", risk: 30 },            // pause()
                { name: "_pause()", selector: "2f2b3887", risk: 30 },           // _pause()
                { name: "enableTrading()", selector: "8a8c523c", risk: 20 },    // enableTrading() - Can be used to keep users trapped
                { name: "openTrading()", selector: "c9044b7d", risk: 20 },      // openTrading()

                // Fees & Taxes (Financial Loss)
                { name: "setFee(uint256)", selector: "69fe0e2d", risk: 25 },     // setFee
                { name: "setTaxFeePercent(uint256)", selector: "061c82d0", risk: 25 },
                { name: "setMarketingFee(uint256)", selector: "2323cc66", risk: 20 },
                { name: "updateFees(uint256,uint256)", selector: "37b8d80f", risk: 20 },

                // Minting & Inflation (Value Dilution)
                { name: "mint(address,uint256)", selector: "40c10f19", risk: 60 }, // mint is dangerous if public
                { name: "_mint(address,uint256)", selector: "9c0f929c", risk: 60 }, // _mint usually internal, but if exposed via bytes...

                // Rug Pull / Liquidity Draining (Critical)
                { name: "removeLiquidity", selector: "78265506", risk: 90 }, // Uniswap removeLiquidity
                { name: "removeLiquidityETH", selector: "af2979eb", risk: 90 },
                { name: "drain()", selector: "d040220a", risk: 100 },      // Explicit drain functions
                { name: "withdrawETH()", selector: "474cf53d", risk: 50 },  // Owner withdrawing all ETH

                // Internal/Hidden Transfer Logic (Honeypot mechanism)
                { name: "_transfer", selector: "30e0789e", risk: 40 }, // Overriden transfer logic often hides checks
                { name: "_beforeTokenTransfer", selector: "38d52e0f", risk: 30 }, // Hook often used to revert sells
                { name: "setMaxTxAmount", selector: "83151877", risk: 20 }, // Artificial limits
            ];

            for (const pattern of suspiciousPatterns) {
                if (codeHex.includes(pattern.selector)) {
                    report.flags.push(`Suspicious Function: ${pattern.name}()`);
                    report.riskScore += pattern.risk;
                    report.isHoneypot = true;
                    console.log(`[Security] ⚠️  Found ${pattern.name}() - Risk: +${pattern.risk}`);
                }
            }
        } catch (e) {
            console.error("[Security] Failed to analyze bytecode", e);
        }

        return report;
    }
}
