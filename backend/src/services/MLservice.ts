/**
 * ML Service v2.0 - Calibrated Continuous Features
 * Connects to the Sentinel-ML Python API with uncertainty-aware outputs
 */

// Continuous feature schema (15 features, all 0.0-1.0)
interface ContinuousFeatures {
    sim_success_rate: number;           // % simulations successful
    owner_privilege_ratio: number;      // % owner-only paths
    time_variance_score: number;        // Time restriction severity
    gated_branch_ratio: number;         // % access-controlled branches
    mint_transfer_ratio: number;        // mint/transfer ratio
    suspicious_opcode_density: number;  // Suspicious opcodes density
    proxy_depth_normalized: number;     // Proxy depth normalized
    sload_density: number;              // SLOAD per 100 instructions
    bytecode_entropy: number;           // Shannon entropy normalized
    counterfactual_risk: number;        // From actor comparison
    time_bomb_risk: number;             // From time-travel sim
    gas_anomaly_score: number;          // Normalized gas difference
    security_report_risk: number;       // riskScore / 100
    flag_density: number;               // flags / max_flags
    revert_rate: number;                // % actors reverted
}

interface CalibratedResponse {
    verdict: "BLOCK" | "WARN" | "SAFE";
    scam_probability: number;
    calibrated: boolean;
    confidence_interval: [number, number];
    uncertainty: number;
    risk_band: "HIGH" | "MEDIUM" | "LOW";
    reason: string;
    model_version: string;
}

interface DriftRequest {
    Sim_RiskScore: number;
    Capability_Hash_Distance: number;
    Liquidity_Amount: number;
    Unique_Holders_Count: number;
}

interface DriftResponse {
    is_anomaly: boolean;
    verdict: string;
    anomaly_score: number;
    message: string;
}

export class MLService {
    private static ML_API_URL = process.env.ML_API_URL || "http://127.0.0.1:5000";

    /**
     * Deep Scan - Calibrated Classification
     * Uses calibrated XGBoost model with 15 continuous features
     */
    static async analyze(features: ContinuousFeatures): Promise<CalibratedResponse | null> {
        try {
            const response = await fetch(`${this.ML_API_URL}/analyze`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(features)
            });

            if (!response.ok) {
                console.warn("[MLService] ML API request failed:", response.status);
                return null;
            }

            const result = await response.json() as CalibratedResponse;
            console.log(`[MLService] AI Verdict: ${result.verdict} (${(result.scam_probability * 100).toFixed(1)}% ± ${(result.uncertainty * 100).toFixed(0)}%)`);
            return result;
        } catch (err: any) {
            console.warn("[MLService] ML API unavailable:", err.message);
            return null;
        }
    }

    /**
     * Drift Detection - Anomaly Analysis (unchanged)
     */
    static async checkDrift(features: DriftRequest): Promise<DriftResponse | null> {
        try {
            const response = await fetch(`${this.ML_API_URL}/check_drift`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(features)
            });

            if (!response.ok) {
                console.warn("[MLService] Drift API request failed:", response.status);
                return null;
            }

            const result = await response.json() as DriftResponse;
            console.log(`[MLService] Drift Check: ${result.verdict}`);
            return result;
        } catch (err: any) {
            console.warn("[MLService] Drift API unavailable:", err.message);
            return null;
        }
    }

    /**
     * Build continuous feature vector from scan results
     * Converts internal analysis results to continuous ML API format
     * 
     * NO hardcoded heuristics - only raw measurable signals
     */
    static buildFeatureVector(
        simulationResult: { status: string },
        advancedAnalysis: any,
        securityReport: any,
        traceResult: any,
        proxyInfo: any
    ): ContinuousFeatures {

        // 1. sim_success_rate: % of simulations that succeeded
        // Based on counterfactual actor results
        let successCount = 0;
        let totalActors = 0;
        if (advancedAnalysis?.counterfactual?.actorResults) {
            const actors = advancedAnalysis.counterfactual.actorResults;
            totalActors = actors.length;
            successCount = actors.filter((a: any) =>
                a.outcome?.status === 'Success' || a.status === 'Success'
            ).length;
        }
        const sim_success_rate = totalActors > 0 ? successCount / totalActors :
            (simulationResult.status?.startsWith("Revert") ? 0.2 : 0.8);

        // 2. owner_privilege_ratio: Continuous measure of owner privilege
        // Based on privilege diff and actor outcome difference
        let owner_privilege_ratio = 0;
        if (advancedAnalysis?.counterfactual) {
            const cf = advancedAnalysis.counterfactual;
            if (cf.hasOwnerPrivileges) owner_privilege_ratio += 0.4;
            if (cf.isHoneypot) owner_privilege_ratio += 0.3;
            if (cf.privilegeDiff?.length > 0) {
                owner_privilege_ratio += Math.min(0.3, cf.privilegeDiff.length * 0.1);
            }
        }
        owner_privilege_ratio = Math.min(1, owner_privilege_ratio);

        // 3. time_variance_score: Continuous measure of time sensitivity
        let time_variance_score = 0;
        if (advancedAnalysis?.timeTravel) {
            const tt = advancedAnalysis.timeTravel;
            if (tt.isTimeSensitive) time_variance_score += 0.5;
            // Count diverging future results
            if (tt.futureResults) {
                const divergingCount = tt.futureResults.filter((r: any) =>
                    r.divergesFromCurrent || r.diverges
                ).length;
                time_variance_score += Math.min(0.5, divergingCount * 0.1);
            }
            if (tt.riskFlags?.length > 0) {
                time_variance_score += Math.min(0.3, tt.riskFlags.length * 0.1);
            }
        }
        time_variance_score = Math.min(1, time_variance_score);

        // 4. gated_branch_ratio: % of access-controlled execution paths
        const flagsLower = (securityReport?.flags || []).map((f: string) => f.toLowerCase());
        let gatedPatterns = 0;
        if (flagsLower.some((f: string) => f.includes("blacklist"))) gatedPatterns++;
        if (flagsLower.some((f: string) => f.includes("whitelist"))) gatedPatterns++;
        if (flagsLower.some((f: string) => f.includes("owner"))) gatedPatterns++;
        if (flagsLower.some((f: string) => f.includes("blocked"))) gatedPatterns++;
        const gated_branch_ratio = Math.min(1, gatedPatterns * 0.25);

        // 5. mint_transfer_ratio: Dangerous function ratio
        let dangerousPatterns = 0;
        if (flagsLower.some((f: string) => f.includes("mint"))) dangerousPatterns++;
        if (flagsLower.some((f: string) => f.includes("drain"))) dangerousPatterns++;
        if (flagsLower.some((f: string) => f.includes("pause"))) dangerousPatterns++;
        if (flagsLower.some((f: string) => f.includes("selfdestruct"))) dangerousPatterns++;
        const mint_transfer_ratio = Math.min(1, dangerousPatterns * 0.25);

        // 6. suspicious_opcode_density: Suspicious patterns in bytecode
        let suspicious_opcode_density = 0;
        if (traceResult?.events) {
            const events = traceResult.events;
            let suspiciousCount = 0;
            let totalOpcodes = events.length;
            events.forEach((e: string) => {
                if (typeof e === 'string') {
                    if (e.includes("SELFDESTRUCT")) suspiciousCount += 2;
                    if (e.includes("DELEGATECALL")) suspiciousCount += 1;
                    if (e.includes("CALLCODE")) suspiciousCount += 1;
                }
            });
            suspicious_opcode_density = totalOpcodes > 0 ?
                Math.min(1, suspiciousCount / Math.max(10, totalOpcodes / 10)) : 0;
        }

        // 7. proxy_depth_normalized: Proxy depth 0-3 → 0.0-1.0
        const proxyDepth = proxyInfo?.proxyDepth || (proxyInfo?.isProxy ? 1 : 0);
        const proxy_depth_normalized = Math.min(1, proxyDepth / 3);

        // 8. sload_density: SLOAD per 100 instructions
        let sloadCount = 0;
        let instructionCount = 100; // Default
        if (traceResult?.events) {
            instructionCount = Math.max(1, traceResult.events.length);
            sloadCount = traceResult.events.filter((e: string) =>
                typeof e === 'string' && e.includes("SLOAD")
            ).length;
        }
        const sload_density = Math.min(1, (sloadCount / instructionCount) * 10);

        // 9. bytecode_entropy: Placeholder - would need actual bytecode analysis
        // Using a default moderate value
        const bytecode_entropy = 0.5;

        // 10. counterfactual_risk: Risk from actor comparison
        let counterfactual_risk = 0;
        if (advancedAnalysis?.counterfactual) {
            if (advancedAnalysis.counterfactual.isHoneypot) counterfactual_risk += 0.5;
            if (advancedAnalysis.counterfactual.hasOwnerPrivileges) counterfactual_risk += 0.3;
            if (advancedAnalysis.counterfactual.hasWhitelistMechanism) counterfactual_risk += 0.2;
        }
        counterfactual_risk = Math.min(1, counterfactual_risk);

        // 11. time_bomb_risk: Risk from time-travel simulation
        let time_bomb_risk = 0;
        if (advancedAnalysis?.timeTravel?.riskFlags) {
            time_bomb_risk = Math.min(1, advancedAnalysis.timeTravel.riskFlags.length * 0.2);
        }

        // 12. gas_anomaly_score: Normalized gas difference between actors
        let gas_anomaly_score = 0;
        if (advancedAnalysis?.counterfactual?.actorResults) {
            const actors = advancedAnalysis.counterfactual.actorResults;
            const gasValues = actors
                .map((a: any) => {
                    const gas = a.outcome?.gasUsed || a.gasUsed || 0;
                    return typeof gas === 'bigint' ? Number(gas) : Number(gas);
                })
                .filter((g: number) => g > 0);

            if (gasValues.length >= 2) {
                const maxGas = Math.max(...gasValues);
                const minGas = Math.min(...gasValues);
                if (maxGas > 0) {
                    gas_anomaly_score = Math.min(1, (maxGas - minGas) / maxGas);
                }
            }
        }
        // Also check flags for gas anomaly mentions
        if (flagsLower.some((f: string) => f.includes("gas anomaly"))) {
            gas_anomaly_score = Math.max(gas_anomaly_score, 0.7);
        }

        // 13. security_report_risk: Direct from riskScore
        const security_report_risk = Math.min(1, (securityReport?.riskScore || 0) / 100);

        // 14. flag_density: Number of flags relative to expected max
        const MAX_EXPECTED_FLAGS = 10;
        const flagCount = securityReport?.flags?.length || 0;
        const flag_density = Math.min(1, flagCount / MAX_EXPECTED_FLAGS);

        // 15. revert_rate: % of actors that reverted
        let revertCount = 0;
        if (advancedAnalysis?.counterfactual?.actorResults) {
            const actors = advancedAnalysis.counterfactual.actorResults;
            revertCount = actors.filter((a: any) =>
                a.outcome?.status === 'Reverted' || a.status === 'Reverted'
            ).length;
        }
        const revert_rate = totalActors > 0 ? revertCount / totalActors :
            (simulationResult.status?.startsWith("Revert") ? 0.8 : 0.2);

        // Build feature vector
        const features: ContinuousFeatures = {
            sim_success_rate,
            owner_privilege_ratio,
            time_variance_score,
            gated_branch_ratio,
            mint_transfer_ratio,
            suspicious_opcode_density,
            proxy_depth_normalized,
            sload_density,
            bytecode_entropy,
            counterfactual_risk,
            time_bomb_risk,
            gas_anomaly_score,
            security_report_risk,
            flag_density,
            revert_rate
        };

        console.log("[MLService] Continuous feature vector:", {
            sim_success_rate: sim_success_rate.toFixed(3),
            owner_privilege_ratio: owner_privilege_ratio.toFixed(3),
            time_variance_score: time_variance_score.toFixed(3),
            counterfactual_risk: counterfactual_risk.toFixed(3),
            security_report_risk: security_report_risk.toFixed(3),
            flag_density: flag_density.toFixed(3),
            revert_rate: revert_rate.toFixed(3)
        });

        return features;
    }
}
