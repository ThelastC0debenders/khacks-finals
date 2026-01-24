import { ethers } from "ethers";
import { EVM, createEVM } from "@ethereumjs/evm";
import { Common, Chain, Hardfork, Mainnet } from "@ethereumjs/common";
import { Address, hexToBytes, createAddressFromString, Account } from "@ethereumjs/util";
import { SecurityAnalyzer } from "../analyzers/SecurityAnalyzer.js";
import { ProxyDetector } from "../analyzers/ProxyDetector.js";
import { ScanHistory } from "../services/ScanHistory.js";
import { AdvancedSimulator } from "../analyzers/AdvancedSimulator.js";
import { OpcodeTracer } from "../analyzers/OpcodeTracer.js";
import { ExplanationEngine } from "../analyzers/ExplanationEngine.js";
import { MLService } from "../services/MLService.js";
import { TrainingDataCollector } from "../services/TrainingDataCollector.js";

export class EvmExecutor {
    constructor() { }

    private resolveRpcUrls(chainId: number | string): string[] {
        let chainIdNum = -1;
        if (typeof chainId === 'string' && chainId.includes(':')) {
            chainIdNum = parseInt(chainId.split(':')[1]);
        } else {
            chainIdNum = Number(chainId);
        }
        console.log(`Resolving RPCs for Chain ID: ${chainIdNum}`);

        const alchemyKey = process.env.ALCHEMY_API_KEY;
        const urls: string[] = [];

        if (chainIdNum === 1) urls.push(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`, "https://eth.llamarpc.com");
        else if (chainIdNum === 137) urls.push(`https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`, "https://polygon-rpc.com");
        else if (chainIdNum === 10) urls.push(`https://opt-mainnet.g.alchemy.com/v2/${alchemyKey}`, "https://mainnet.optimism.io");
        else if (chainIdNum === 42161) urls.push(`https://arb-mainnet.g.alchemy.com/v2/${alchemyKey}`, "https://arb1.arbitrum.io/rpc");
        else if (chainIdNum === 8453) urls.push(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`, "https://mainnet.base.org");
        else if (chainIdNum === 11155111) urls.push(`https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`, "https://rpc.sepolia.org");
        else if (chainIdNum === 56) urls.push("https://bsc-dataseed.binance.org");
        else if (chainIdNum === 31337) {
            urls.push("http://127.0.0.1:8545");
            if (alchemyKey) urls.push(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`);
            urls.push("https://eth.llamarpc.com");
        }

        return urls.filter(Boolean);
    }

    private async setupForkedEVM(chainId: number | string, toAddressStr: string | undefined, timestampOffset: number = 0): Promise<{ evm: EVM, success: boolean }> {
        const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });
        const evm = await createEVM({ common });

        let success = false;
        if (toAddressStr && chainId) {
            const rpcUrls = this.resolveRpcUrls(chainId);
            const toAddress = createAddressFromString(toAddressStr);

            if (rpcUrls.length > 0) {
                for (const rpcUrl of rpcUrls) {
                    try {
                        const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
                        const code = await Promise.race([
                            provider.getCode(toAddressStr),
                            new Promise<string>((_, reject) => setTimeout(() => reject(new Error("RPC Timeout")), 5000))
                        ]);

                        if (code && code !== "0x") {
                            const hexCode = code.startsWith("0x") ? code : `0x${code}`;
                            const codeBytes = hexToBytes(hexCode as `0x${string}`);

                            let toAccount = await evm.stateManager.getAccount(toAddress);
                            if (!toAccount) { toAccount = new Account(); }
                            await evm.stateManager.putAccount(toAddress, toAccount);
                            await (evm.stateManager as any).putCode(toAddress, codeBytes);
                            success = true;
                            break;
                        } else {
                            const chainIdNum = Number(chainId.toString().split(':')[1] || chainId);
                            if (chainIdNum === 31337) continue;
                            success = true;
                            break;
                        }
                    } catch (err) { continue; }
                }
            }
        }
        return { evm, success };
    }

    private async executeCall(evm: EVM, txParams: any, sender: Address, timestampOffset: number = 0) {
        let account = await evm.stateManager.getAccount(sender);
        if (!account) { account = new Account(); }
        account.balance = BigInt("0x100000000000000000000"); // 100 ETH
        await evm.stateManager.putAccount(sender, account);

        const to = txParams.to ? createAddressFromString(txParams.to) : undefined;
        const dataBuffer = txParams.data && txParams.data !== "0x" ? hexToBytes(txParams.data) : new Uint8Array(0);
        const value = txParams.value ? BigInt(txParams.value) : 0n;
        const gasLimit = BigInt(5000000);

        const result = await evm.runCall({
            caller: sender,
            to: to,
            data: dataBuffer,
            value: value,
            gasLimit: gasLimit
        });

        let status = "Success";
        if (result.execResult.exceptionError) {
            status = `Reverted: ${result.execResult.exceptionError.error}`;
        }
        return { status, result };
    }

    async simulateTransaction(txParams: any, chainId?: number | string) {
        console.log("Initializing Raw EVM...");
        const { evm, success } = await this.setupForkedEVM(chainId || 1, txParams.to);
        const sender = createAddressFromString(txParams.from);

        let instructionCount = 0;
        let sstoreCount = 0;
        let callCount = 0;

        const tracer = new OpcodeTracer();

        evm.events.on('step', (data: any) => {
            if (instructionCount === 0) console.log("[Fork] First opcode executed:", data.opcode.name);
            instructionCount++;
            if (data.opcode.name === 'SSTORE') sstoreCount++;
            if (['CALL', 'DELEGATECALL', 'STATICCALL', 'CALLCODE'].includes(data.opcode.name)) callCount++;

            // [PHASE 3] Dynamic Capability Tracing
            tracer.handleStep(data);
        });

        console.log(`Executing Call: from=${sender.toString()} value=${txParams.value}`);
        const { status, result } = await this.executeCall(evm, txParams, sender);

        // [PHASE 3] Generate Mechanism Story
        const traceResult = tracer.getTrace();
        const mechanismStory = ExplanationEngine.generateExplanation(traceResult, status);
        console.log("[Phase3] Mechanism Story:", mechanismStory.story);

        console.log("EVM Execution Complete.");
        console.log(`Analysis: ${instructionCount} steps, ${sstoreCount} sstores`);

        // 6. Security Analysis and Phase 2 Deep Scan
        let securityReport: any = null;
        let proxyInfo = null;
        let driftAnalysis = null;
        let advancedAnalysis: any = null;
        const to = txParams.to ? createAddressFromString(txParams.to) : undefined;
        let addressToAnalyze = to;
        let activeProvider: ethers.JsonRpcProvider | undefined;

        if (to && chainId) {
            const rpcUrls = this.resolveRpcUrls(chainId);
            for (const rpcUrl of rpcUrls) {
                try {
                    activeProvider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
                    await activeProvider.getNetwork();
                    break;
                } catch { continue; }
            }

            console.log("[ProxyDetector] Checking for proxy pattern...");
            proxyInfo = await ProxyDetector.detectProxy(evm, to, activeProvider);

            if (proxyInfo.isProxy && proxyInfo.implementationAddress) {
                console.log(`[ProxyDetector] Proxy detected! Type: ${proxyInfo.proxyType}`);
                console.log(`[ProxyDetector] Implementation: ${proxyInfo.implementationAddress}`);

                if (activeProvider) {
                    try {
                        const implCode = await activeProvider.getCode(proxyInfo.implementationAddress);
                        if (implCode && implCode !== '0x') {
                            const implAddress = createAddressFromString(proxyInfo.implementationAddress);
                            let implAccount = await evm.stateManager.getAccount(implAddress);
                            if (!implAccount) { implAccount = new Account(); }
                            await evm.stateManager.putAccount(implAddress, implAccount);
                            await (evm.stateManager as any).putCode(implAddress, hexToBytes(implCode as `0x${string}`));
                            addressToAnalyze = implAddress;
                            console.log(`[ProxyDetector] Implementation code injected (${implCode.length} chars)`);
                        }
                    } catch (err: any) {
                        console.warn(`[ProxyDetector] Failed to fetch implementation code: ${err.message}`);
                    }
                }
            }
        }

        if (addressToAnalyze) {
            console.log("Running Security Checks on:", addressToAnalyze.toString());
            securityReport = await SecurityAnalyzer.analyze(evm, addressToAnalyze, { status }, activeProvider);

            // [PHASE 3] Attach Detective Insights
            securityReport.mechanismStory = mechanismStory;
            securityReport.tracingEvents = traceResult.events;

            if (proxyInfo) {
                securityReport.proxyInfo = proxyInfo;
                if (proxyInfo.isProxy) {
                    securityReport.analyzedAddress = addressToAnalyze.toString();
                    securityReport.flags.push(`Proxy Contract (${proxyInfo.proxyType})`);
                }
            }

            // [PHASE 2] ENHANCED ADVANCED SIMULATION
            // Uses comprehensive time-travel and counterfactual analysis
            console.log("[Phase2] Running Enhanced Simulation Capabilities...");

            try {
                const advancedSimulator = new AdvancedSimulator(chainId || 1, this.resolveRpcUrls(chainId || 1));

                advancedAnalysis = await advancedSimulator.runComprehensiveAnalysis(
                    txParams,
                    securityReport.ownerAddress,
                    undefined // deployer address - could be detected via creation tx
                );

                console.log("[Phase2] Time-Travel Analysis:", advancedAnalysis.timeTravel.summary);
                console.log("[Phase2] Counterfactual Analysis:", advancedAnalysis.counterfactual.summary);
                console.log("[Phase2] Overall:", advancedAnalysis.overallSummary);

                // Merge advanced analysis results into security report
                if (advancedAnalysis.isScam) {
                    securityReport.isHoneypot = true;
                    securityReport.riskScore = Math.max(securityReport.riskScore, advancedAnalysis.overallRiskScore);
                    securityReport.friendlyExplanation = advancedAnalysis.overallSummary;
                }

                // Add time-travel risk flags
                for (const flag of advancedAnalysis.timeTravel.riskFlags) {
                    if (!securityReport.flags.includes(flag)) {
                        securityReport.flags.push(flag);
                    }
                }

                // Add counterfactual risk flags
                for (const flag of advancedAnalysis.counterfactual.riskFlags) {
                    if (!securityReport.flags.includes(flag)) {
                        securityReport.flags.push(flag);
                    }
                }

                // Add privilege differences as flags
                for (const diff of advancedAnalysis.counterfactual.privilegeDiff) {
                    const diffFlag = `${diff.severity.toUpperCase()}: ${diff.description} - User: ${diff.userOutcome}, Owner: ${diff.ownerOutcome}`;
                    if (!securityReport.flags.includes(diffFlag)) {
                        securityReport.flags.push(diffFlag);
                    }
                }

                // Update risk score based on advanced analysis
                securityReport.riskScore = Math.max(securityReport.riskScore, advancedAnalysis.overallRiskScore);

            } catch (advErr: any) {
                console.warn("[Phase2] Advanced simulation failed:", advErr.message);
            }

            // [PHASE 3 Refinement] Reconcile Phase 2 and Phase 3
            // If Phase 2 detected a scam (Revert/Honeypot) but Phase 3 trace (local) was Safe, it's likely due to missing storage.
            // We trust Phase 2 (RPC-based) more for outcomes.
            if (advancedAnalysis && advancedAnalysis.isScam && securityReport.mechanismStory.severity === 'Safe') {
                console.log("[Phase3] Reconciling: Overwriting Safe story with Phase 2 detection.");

                if (advancedAnalysis.counterfactual.hasOwnerPrivileges) {
                    securityReport.mechanismStory = {
                        title: "Privilege Abuse Detected",
                        story: "🕵️ The Detective noticed a discrepancy: Expected safe execution, but real-world simulation confirms only the OWNER can trade. This is a clear Honeypot.",
                        severity: "High"
                    };
                } else if (advancedAnalysis.timeTravel.isTimeSensitive) {
                    securityReport.mechanismStory = {
                        title: "Hidden Time-Lock",
                        story: "🕵️ The Detective found that while code looks clean, it relies on time checks (likely uninitialized in scan) that strictly block trading.",
                        severity: "High"
                    };
                } else {
                    securityReport.mechanismStory = {
                        title: "Hidden Revert Mechanism",
                        story: "🕵️ The execution path is misleading. Deep simulation confirms this transaction WILL fail for you, likely due to hidden storage dependencies.",
                        severity: "High"
                    };
                }
            }

            console.log("Security Report:", securityReport);

            const chainIdNum = typeof chainId === 'string' && chainId.includes(':') ? parseInt(chainId.split(':')[1]) : Number(chainId);
            try {
                driftAnalysis = await ScanHistory.analyzeDrift(to!.toString(), securityReport);
                if (driftAnalysis.hasDrift) {
                    console.log(`[ScanHistory] Behavioral drift detected!`);
                    if (driftAnalysis.riskDelta > 0) {
                        securityReport.flags.push(`Risk Increased (+${driftAnalysis.riskDelta} since last scan)`);
                    }
                }
                await ScanHistory.storeScan(to!.toString(), chainIdNum, securityReport,
                    proxyInfo ? { isProxy: proxyInfo.isProxy, implementationAddress: proxyInfo.implementationAddress } : undefined
                );
            } catch (err: any) { console.warn(`[ScanHistory] Redis operation failed: ${err.message}`); }
        }

        // [PHASE 4] ML-Powered Analysis + Training Data Collection
        let mlAnalysisResult = null;
        let featureVector = null;
        let mlErrorReason = null;

        if (advancedAnalysis) { // Only run if analysis succeeded
            try {
                featureVector = MLService.buildFeatureVector(
                    { status },
                    advancedAnalysis,
                    securityReport,
                    traceResult,
                    proxyInfo
                );
                console.log("[Phase4] Sending continuous features to ML API:", JSON.stringify(featureVector, null, 2));
                mlAnalysisResult = await MLService.analyze(featureVector);

                if (mlAnalysisResult) {
                    const prob = (mlAnalysisResult.scam_probability * 100).toFixed(1);
                    const uncertainty = (mlAnalysisResult.uncertainty * 100).toFixed(0);
                    console.log(`[Phase4] ML Verdict: ${mlAnalysisResult.verdict} (${prob}% ± ${uncertainty}%)`);
                }
            } catch (mlErr: any) {
                console.warn("[Phase4] ML analysis failed:", mlErr.message);
                mlErrorReason = mlErr.message;
            }
        } else {
            mlErrorReason = "Advanced analysis missing";
        }

        // [PHASE 5] Generate Combined Verdict (Rule-based PRIMARY, ML secondary)
        // Rule-based detection remains primary for critical patterns
        const ruleBasedIsScam =
            securityReport?.isHoneypot === true ||
            advancedAnalysis?.isScam === true ||
            advancedAnalysis?.counterfactual?.isHoneypot === true ||
            advancedAnalysis?.counterfactual?.hasOwnerPrivileges === true;

        const riskScore = securityReport?.riskScore ?? 0;

        let finalVerdict: "BLOCK" | "WARN" | "SAFE";
        let verdictReason: string;
        let verdictConfidence: number;
        let verdictSource: string;

        if (ruleBasedIsScam) {
            finalVerdict = "BLOCK";
            verdictReason = securityReport?.friendlyExplanation ||
                advancedAnalysis?.overallSummary ||
                "Honeypot or scam patterns detected";
            verdictConfidence = 100;
            verdictSource = "RULE_BASED";
        } else if (riskScore >= 50) {
            finalVerdict = "WARN";
            verdictReason = `Risk score ${riskScore}/100 - Proceed with caution`;
            verdictConfidence = 80;
            verdictSource = "RISK_SCORE";
        } else if (mlAnalysisResult) {
            // Use calibrated ML probabilities
            const scamProb = mlAnalysisResult.scam_probability;
            if (scamProb > 0.7) {
                finalVerdict = "BLOCK";
                verdictReason = `AI detected high risk: ${mlAnalysisResult.reason}`;
                verdictConfidence = scamProb * 100;
                verdictSource = "ML_CALIBRATED";
            } else if (scamProb > 0.4) {
                finalVerdict = "WARN";
                verdictReason = mlAnalysisResult.reason;
                verdictConfidence = scamProb * 100;
                verdictSource = "ML_CALIBRATED";
            } else {
                finalVerdict = "SAFE";
                verdictReason = mlAnalysisResult.reason || "No significant risks detected";
                verdictConfidence = (1 - scamProb) * 100;
                verdictSource = "ML_CALIBRATED";
            }
        } else {
            finalVerdict = "SAFE";
            verdictReason = "No significant risks detected";
            verdictConfidence = 50;
            verdictSource = "DEFAULT";
        }

        console.log(`[Phase5] Final Verdict: ${finalVerdict} - ${verdictReason}`);

        // [PHASE 6] Collect Training Data for ML model improvement
        if (featureVector && to) {
            try {
                const chainIdNum = typeof chainId === 'string' && chainId.includes(':')
                    ? parseInt(chainId.split(':')[1])
                    : Number(chainId || 1);

                TrainingDataCollector.collect(
                    to.toString(),
                    chainIdNum,
                    featureVector,
                    securityReport,
                    advancedAnalysis
                );
            } catch (trainErr: any) {
                console.warn("[Phase6] Training data collection failed:", trainErr.message);
            }
        }

        // Return the complete response
        return {
            status,
            instructionCount,
            sstoreCount,
            callCount,
            securityReport,
            proxyInfo,
            driftAnalysis: driftAnalysis ? {
                hasDrift: driftAnalysis.hasDrift,
                riskDelta: driftAnalysis.riskDelta,
                newFlags: driftAnalysis.newFlags,
                removedFlags: driftAnalysis.removedFlags,
                previousScanTimestamp: driftAnalysis.previousScan?.timestamp
            } : null,
            advancedAnalysis: advancedAnalysis ? {
                timeTravel: {
                    isTimeSensitive: advancedAnalysis.timeTravel.isTimeSensitive,
                    currentResult: advancedAnalysis.timeTravel.currentBlockResult.status,
                    futureResults: advancedAnalysis.timeTravel.futureResults.map((f: any) => ({
                        offset: f.offsetDescription,
                        status: f.outcome.status,
                        diverges: f.divergesFromCurrent
                    })),
                    summary: advancedAnalysis.timeTravel.summary,
                    riskFlags: advancedAnalysis.timeTravel.riskFlags
                },
                counterfactual: {
                    isHoneypot: advancedAnalysis.counterfactual.isHoneypot,
                    hasOwnerPrivileges: advancedAnalysis.counterfactual.hasOwnerPrivileges,
                    hasWhitelistMechanism: advancedAnalysis.counterfactual.hasWhitelistMechanism,
                    actorResults: advancedAnalysis.counterfactual.actorResults.map((a: any) => ({
                        type: a.actorType,
                        address: a.address,
                        status: a.outcome.status
                    })),
                    privilegeDiff: advancedAnalysis.counterfactual.privilegeDiff,
                    summary: advancedAnalysis.counterfactual.summary,
                    riskFlags: advancedAnalysis.counterfactual.riskFlags
                },
                overallRiskScore: advancedAnalysis.overallRiskScore,
                overallSummary: advancedAnalysis.overallSummary,
                isScam: advancedAnalysis.isScam
            } : null,
            mlAnalysis: mlAnalysisResult,
            mlError: mlErrorReason,
            // Combined Final Verdict with calibrated ML support
            finalVerdict: {
                verdict: finalVerdict,
                reason: verdictReason,
                confidence: verdictConfidence,
                source: verdictSource,
                // Include ML uncertainty if available
                uncertainty: mlAnalysisResult?.uncertainty,
                confidence_interval: mlAnalysisResult?.confidence_interval
            }
        };
    }

    async resetFork(rpcUrl: string, blockNumber?: number) { console.log("Raw EVM does not support RPC forking."); }
    async getTrace(txHash: string) { return {}; }
    async getStateDiff(txHash: string) { return {}; }
    async getSimulationResult(trace: any, diff: any) { return {}; }

    // Legacy demo methods (stubs for backwards compatibility)
    async simulateTransfer() {
        console.log("simulateTransfer is deprecated. Use simulateTransaction() instead.");
        return null;
    }
    async simulateApproveDrain() {
        console.log("simulateApproveDrain is deprecated. Use simulateTransaction() instead.");
        return null;
    }
    formatForSnap(trace: any, diff: any) {
        return { trace: trace, diff: diff, formatted: true };
    }
}
