import { SimulationEngine, SimulationOutcome } from "./SimulationEngine.js";

export interface TimeTravelResult {
    isTimeSensitive: boolean;
    currentBlockResult: { status: string; gasUsed: bigint };
    futureResults: {
        offsetDescription: string;
        offsetSeconds: number;
        outcome: SimulationOutcome;
        divergesFromCurrent: boolean;
    }[];
    summary: string;
    riskFlags: string[];
}

export class TimeTravelAnalyzer {
    constructor(private engine: SimulationEngine) { }

    async runTimeTravelSimulation(
        txParams: { from: string; to: string; data?: string; value?: string },
        prefetchedBytecode?: string
    ): Promise<TimeTravelResult> {
        console.log("[TimeTravelSim] Starting time-travel simulation...");

        const result: TimeTravelResult = {
            isTimeSensitive: false,
            currentBlockResult: { status: "Reverted", gasUsed: 0n },
            futureResults: [],
            summary: "",
            riskFlags: []
        };

        const timeOffsets = [
            { seconds: 0, description: "Current Block" },
            { seconds: 3600, description: "+1 Hour" },
            { seconds: 86400, description: "+1 Day" },
            { seconds: 604800, description: "+7 Days" },
            { seconds: 2592000, description: "+30 Days" },
            { seconds: -86400, description: "-1 Day (Past)" }
        ];

        // Run simulation at current time first
        const { evm: currentEvm, success: currentSuccess } = await this.engine.createForkedEVM(txParams.to, txParams.from, prefetchedBytecode);
        if (!currentSuccess) {
            result.summary = "Failed to create forked EVM for current block";
            return result;
        }

        result.currentBlockResult = await this.engine.executeWithTimestamp(currentEvm, txParams, 0);
        console.log(`[TimeTravelSim] Current block: ${result.currentBlockResult.status}`);

        for (const offset of timeOffsets) {
            if (offset.seconds === 0) continue;

            const { evm: futureEvm, success } = await this.engine.createForkedEVM(txParams.to, txParams.from, prefetchedBytecode);
            if (!success) continue;

            const outcome = await this.engine.executeWithTimestamp(futureEvm, txParams, offset.seconds);
            const diverges = outcome.status !== result.currentBlockResult.status;

            result.futureResults.push({
                offsetDescription: offset.description,
                offsetSeconds: offset.seconds,
                outcome,
                divergesFromCurrent: diverges
            });

            console.log(`[TimeTravelSim] ${offset.description}: ${outcome.status}${diverges ? " (DIVERGES!)" : ""}`);

            if (diverges) {
                result.isTimeSensitive = true;
            }
        }

        this.analyzeTimeTravelResults(result);
        return result;
    }

    private analyzeTimeTravelResults(result: TimeTravelResult): void {
        const currentSuccess = result.currentBlockResult.status === "Success";

        for (const future of result.futureResults) {
            if (!future.divergesFromCurrent) continue;

            const futureSuccess = future.outcome.status === "Success";

            if (currentSuccess && !futureSuccess) {
                if (future.offsetSeconds > 0) {
                    result.riskFlags.push(`TIME-BOMB: Transaction fails at ${future.offsetDescription}`);
                    if (future.offsetSeconds <= 604800) {
                        result.riskFlags.push("CRITICAL: Fails within 7 days - possible honeypot activation");
                    }
                }
            } else if (!currentSuccess && futureSuccess) {
                if (future.offsetSeconds > 0) {
                    result.riskFlags.push(`DELAYED TRADING: Trading opens at ${future.offsetDescription}`);
                    if (future.offsetSeconds > 86400) {
                        result.riskFlags.push("WARNING: Extended trading delay - verify legitimacy");
                    }
                } else {
                    result.riskFlags.push("TRADING CLOSED: Transaction worked before but fails now");
                }
            }
        }

        if (result.isTimeSensitive) {
            const failsFuture = result.futureResults.some(f =>
                f.divergesFromCurrent && result.currentBlockResult.status === "Success" &&
                f.outcome.status === "Reverted" && f.offsetSeconds > 0
            );

            const opensLater = result.futureResults.some(f =>
                f.divergesFromCurrent && result.currentBlockResult.status === "Reverted" &&
                f.outcome.status === "Success" && f.offsetSeconds > 0
            );

            if (failsFuture) {
                result.summary = "TIME-SENSITIVE: This contract has time-based restrictions that will BLOCK transactions in the future. Possible delayed honeypot.";
            } else if (opensLater) {
                result.summary = "DELAYED TRADING: Trading is not open yet but will be in the future. Verify this is legitimate.";
            } else {
                result.summary = "TIME-SENSITIVE: Transaction outcomes vary based on block timestamp.";
            }
        } else {
            result.summary = "No time-based restrictions detected. Transaction behaves consistently across time.";
        }
    }
}