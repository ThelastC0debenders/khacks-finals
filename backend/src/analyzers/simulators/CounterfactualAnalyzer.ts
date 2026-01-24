import { SimulationEngine, SimulationOutcome } from "./SimulationEngine.js";

export interface CounterfactualResult {
    isHoneypot: boolean;
    hasOwnerPrivileges: boolean;
    hasWhitelistMechanism: boolean;
    actorResults: ActorSimulationResult[];
    privilegeDiff: PrivilegeDiff[];
    summary: string;
    riskFlags: string[];
    riskScore: number;
}

export interface ActorSimulationResult {
    actorType: "RandomUser" | "Owner" | "WhitelistedAddress" | "Deployer";
    address: string;
    outcome: SimulationOutcome;
}

export interface PrivilegeDiff {
    description: string;
    userOutcome: string;
    ownerOutcome: string;
    severity: "Low" | "Medium" | "High" | "Critical";
}

export class CounterfactualAnalyzer {
    constructor(private engine: SimulationEngine) { }

    async runCounterfactualSimulation(
        txParams: { from: string; to: string; data?: string; value?: string },
        ownerAddress?: string,
        deployerAddress?: string,
        prefetchedBytecode?: string
    ): Promise<CounterfactualResult> {
        console.log("[CounterfactualSim] Starting counterfactual risk simulation...");

        const result: CounterfactualResult = {
            isHoneypot: false,
            hasOwnerPrivileges: false,
            hasWhitelistMechanism: false,
            actorResults: [],
            privilegeDiff: [],
            summary: "",
            riskFlags: [],
            riskScore: 0
        };

        const actors: { type: ActorSimulationResult["actorType"]; address: string }[] = [
            { type: "RandomUser", address: txParams.from },
            { type: "RandomUser", address: this.engine.generateRandomAddress() }
        ];

        if (ownerAddress && ownerAddress !== "0x0000000000000000000000000000000000000000") {
            actors.push({ type: "Owner", address: ownerAddress });
        }
        if (deployerAddress && deployerAddress !== ownerAddress) {
            actors.push({ type: "Deployer", address: deployerAddress });
        }

        const whitelistAddresses = await this.detectWhitelistedAddresses(txParams.to);
        for (const addr of whitelistAddresses) {
            actors.push({ type: "WhitelistedAddress", address: addr });
        }

        console.log(`[CounterfactualSim] Testing ${actors.length} actors...`);

        for (const actor of actors) {
            const { evm, success } = await this.engine.createForkedEVM(txParams.to, actor.address, prefetchedBytecode);
            if (!success) continue;

            if (actor.type === "Owner" && ownerAddress) {
                await this.engine.injectOwnerStorage(evm, txParams.to, ownerAddress);
            }

            const testTxParams = { ...txParams, from: actor.address };
            const outcome = await this.engine.executeWithTimestamp(evm, testTxParams, 0);

            result.actorResults.push({
                actorType: actor.type,
                address: actor.address,
                outcome
            });
            console.log(`[CounterfactualSim] ${actor.type} (${actor.address.slice(0, 10)}...): ${outcome.status}`);
        }

        this.analyzeCounterfactualResults(result);
        return result;
    }

    private async detectWhitelistedAddresses(_contractAddress: string): Promise<string[]> {
        return [];
    }

    private analyzeCounterfactualResults(result: CounterfactualResult): void {
        const userResults = result.actorResults.filter(r => r.actorType === "RandomUser");
        const ownerResults = result.actorResults.filter(r => r.actorType === "Owner");
        const whitelistResults = result.actorResults.filter(r => r.actorType === "WhitelistedAddress");

        const anyUserSucceeds = userResults.some(r => r.outcome.status === "Success");
        const allUsersFail = userResults.every(r => r.outcome.status === "Reverted");

        const ownerSucceeds = ownerResults.some(r => r.outcome.status === "Success");
        const ownerFails = ownerResults.every(r => r.outcome.status === "Reverted");

        if (allUsersFail && ownerSucceeds) {
            result.isHoneypot = true;
            result.hasOwnerPrivileges = true;
            result.riskScore = 100;
            result.riskFlags.push("CRITICAL HONEYPOT: Owner can execute, but users CANNOT");
            result.privilegeDiff.push({
                description: "Transaction Execution",
                userOutcome: "BLOCKED (Reverted)",
                ownerOutcome: "ALLOWED (Success)",
                severity: "Critical"
            });
        }

        if (anyUserSucceeds && ownerFails) {
            result.riskFlags.push("UNUSUAL: Users can execute but owner cannot - verify logic");
            result.privilegeDiff.push({
                description: "Transaction Execution",
                userOutcome: "ALLOWED",
                ownerOutcome: "BLOCKED",
                severity: "Medium"
            });
        }

        if (whitelistResults.length > 0) {
            const whitelistSucceeds = whitelistResults.some(r => r.outcome.status === "Success");
            if (whitelistSucceeds && allUsersFail) {
                result.hasWhitelistMechanism = true;
                result.riskFlags.push("WHITELIST DETECTED: Only whitelisted addresses can trade");
                result.riskScore = Math.max(result.riskScore, 80);
            }
        }

        if (userResults.length > 0 && ownerResults.length > 0) {
            const userGas = userResults[0].outcome.gasUsed;
            const ownerGas = ownerResults[0]?.outcome.gasUsed || 0n;

            if (userGas > 0n && ownerGas > 0n) {
                const gasDiff = Number(userGas > ownerGas ? userGas - ownerGas : ownerGas - userGas);
                const avgGas = Number((userGas + ownerGas) / 2n);

                if (avgGas > 0 && gasDiff / avgGas > 0.5) {
                    result.riskFlags.push(`GAS ANOMALY: Significant gas difference between user (${userGas}) and owner (${ownerGas})`);
                    result.riskScore += 15;
                }
            }
        }

        if (result.isHoneypot) {
            result.summary = "HONEYPOT CONFIRMED: This contract allows the owner to trade but blocks regular users. DO NOT INVEST.";
        } else if (result.hasWhitelistMechanism) {
            result.summary = "WHITELIST SCAM: Only certain addresses can trade. Regular users are blocked.";
        } else if (result.hasOwnerPrivileges) {
            result.summary = "OWNER PRIVILEGES: The owner has special trading privileges not available to users.";
        } else if (allUsersFail) {
            result.summary = "TRADING BLOCKED: All users cannot execute this transaction.";
        } else if (anyUserSucceeds) {
            result.summary = "No privilege differences detected. Transaction executes equally for all actors.";
        } else {
            result.summary = "Unable to determine privilege status - insufficient data.";
        }
    }
}
