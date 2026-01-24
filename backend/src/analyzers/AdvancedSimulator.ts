import { ethers } from "ethers";
import { SimulationEngine } from "./simulators/SimulationEngine.js";
import type { SimulationOutcome } from "./simulators/SimulationEngine.js";
import { TimeTravelAnalyzer } from "./simulators/TimeTravelAnalyzer.js";
import type { TimeTravelResult } from "./simulators/TimeTravelAnalyzer.js";
import { CounterfactualAnalyzer } from "./simulators/CounterfactualAnalyzer.js";
import type { CounterfactualResult } from "./simulators/CounterfactualAnalyzer.js";

export type { SimulationOutcome, TimeTravelResult, CounterfactualResult };

export class AdvancedSimulator {
    private engine: SimulationEngine;
    private timeTravelAnalyzer: TimeTravelAnalyzer;
    private counterfactualAnalyzer: CounterfactualAnalyzer;
    private activeProvider: ethers.JsonRpcProvider | null = null;
    private initialized = false;

    constructor() {
        this.engine = new SimulationEngine(null);
        this.timeTravelAnalyzer = new TimeTravelAnalyzer(this.engine);
        this.counterfactualAnalyzer = new CounterfactualAnalyzer(this.engine);
    }

    async initialize() {
        if (this.initialized) return;

        let rpcUrl = process.env.ALCHEMY_URL;
        if (!rpcUrl && process.env.ALCHEMY_API_KEY) {
            rpcUrl = `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
        }

        if (!rpcUrl) {
            console.error("[AdvancedSimulator] Missing RPC URL. Set ALCHEMY_URL or ALCHEMY_API_KEY.");
            return;
        }

        console.log("[AdvancedSimulator] Initializing with RPC URL configured");

        try {
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            await provider.getNetwork();
            this.activeProvider = provider;
            this.engine.setActiveProvider(provider);
            this.initialized = true;
            console.log("[AdvancedSimulator] Initialization successful");
        } catch (err) {
            console.error("[AdvancedSimulator] Initialization failed:", err);
        }
    }

    async runComprehensiveAnalysis(
        txParams: { from: string; to: string; data?: string; value?: string },
        ownerAddress?: string,
        deployerAddress?: string
    ): Promise<{
        timeTravel: TimeTravelResult;
        counterfactual: CounterfactualResult;
        overallRiskScore: number;
        overallSummary: string;
        isScam: boolean;
    }> {
        console.log("[AdvancedSimulator] Running comprehensive Phase 2 analysis...");

        await this.initialize();

        // [BATCH FETCH OPTIMIZATION]
        // Fetch contract code ONCE and pass to all sub-engines
        let prefetchedBytecode: string | undefined = undefined;
        if (this.activeProvider && txParams.to) {
            try {
                console.log("[AdvancedSimulator] Prefetching contract code for batch analysis...");
                const code = await this.activeProvider.getCode(txParams.to);
                if (code && code !== "0x") {
                    prefetchedBytecode = code;
                    console.log(`[AdvancedSimulator] Prefetched ${code.length} bytes of bytecode`);
                }
            } catch (err) {
                console.warn("Failed to prefetch code:", err);
            }
        }

        // Run both simulations WITH injected bytecode
        const [timeTravel, counterfactual] = await Promise.all([
            this.timeTravelAnalyzer.runTimeTravelSimulation(txParams, prefetchedBytecode),
            this.counterfactualAnalyzer.runCounterfactualSimulation(txParams, ownerAddress, deployerAddress, prefetchedBytecode)
        ]);

        // Calculate overall risk score
        let overallRiskScore = counterfactual.riskScore;

        if (timeTravel.isTimeSensitive) {
            overallRiskScore += 25;
            if (timeTravel.riskFlags.some(f => f.includes("TIME-BOMB"))) {
                overallRiskScore += 25;
            }
        }

        overallRiskScore = Math.min(100, overallRiskScore);

        // Determine if it's a scam
        const isScam = counterfactual.isHoneypot ||
            counterfactual.hasWhitelistMechanism ||
            timeTravel.riskFlags.some(f => f.includes("TIME-BOMB") || f.includes("CRITICAL"));

        // Generate overall summary
        let overallSummary = "";
        if (isScam) {
            overallSummary = "SCAM DETECTED: DO NOT INTERACT.";
        } else if (overallRiskScore > 50) {
            overallSummary = `HIGH RISK (Score: ${overallRiskScore}/100): Proceed with extreme caution.`;
        } else if (overallRiskScore > 25) {
            overallSummary = `MODERATE RISK (Score: ${overallRiskScore}/100): Exercise caution.`;
        } else {
            overallSummary = `LOW RISK (Score: ${overallRiskScore}/100): No major issues detected.`;
        }

        return {
            timeTravel,
            counterfactual,
            overallRiskScore,
            overallSummary,
            isScam
        };
    }
}
