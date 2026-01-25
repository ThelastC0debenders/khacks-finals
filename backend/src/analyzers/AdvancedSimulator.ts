import { EVM, createEVM } from "@ethereumjs/evm";
import { Common, Hardfork, Mainnet } from "@ethereumjs/common";
import { Address, hexToBytes, createAddressFromString, Account, bytesToHex } from "@ethereumjs/util";
import { ethers } from "ethers";

/**
 * Time-Travel Simulation Result
 */
export interface TimeTravelResult {
    isTimeSensitive: boolean;
    currentBlockResult: SimulationOutcome;
    futureResults: FutureSimulationResult[];
    summary: string;
    riskFlags: string[];
}

export interface FutureSimulationResult {
    offsetDescription: string;
    offsetSeconds: number;
    outcome: SimulationOutcome;
    divergesFromCurrent: boolean;
}

export interface SimulationOutcome {
    status: "Success" | "Reverted";
    revertReason?: string;
    gasUsed: bigint;
    returnValue?: string;
}

/**
 * Counterfactual Risk Simulation Result
 */
export interface CounterfactualResult {
    isHoneypot: boolean;
    hasOwnerPrivileges: boolean;
    hasWhitelistMechanism: boolean;
    actorResults: ActorSimulationResult[];
    privilegeDiff: PrivilegeDifference[];
    summary: string;
    riskFlags: string[];
    riskScore: number;
}

export interface ActorSimulationResult {
    actorType: "RandomUser" | "Owner" | "Deployer" | "WhitelistedAddress" | "Current User";
    address: string;
    outcome: SimulationOutcome;
}

export interface PrivilegeDifference {
    description: string;
    userOutcome: string;
    ownerOutcome: string;
    severity: "Critical" | "High" | "Medium" | "Low";
}

/**
 * Advanced Simulation Engine
 * Provides enhanced simulation capabilities for detecting sophisticated scams
 */
export class AdvancedSimulator {
    private rpcUrls: string[];
    private activeProvider?: ethers.JsonRpcProvider;
    private chainId: number;

    constructor(chainId: number | string, rpcUrls: string[]) {
        this.chainId = typeof chainId === 'string' && chainId.includes(':')
            ? parseInt(chainId.split(':')[1])
            : Number(chainId);
        this.rpcUrls = rpcUrls;
    }

    /**
     * Initialize provider connection
     */
    async initialize(): Promise<boolean> {
        for (const rpcUrl of this.rpcUrls) {
            try {
                this.activeProvider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
                await this.activeProvider.getNetwork();
                return true;
            } catch {
                continue;
            }
        }
        return false;
    }

    /**
     * Create a forked EVM instance with contract code and critical storage loaded
     */
    private async createForkedEVM(contractAddress: string, injectBalanceFor?: string): Promise<{ evm: EVM; success: boolean }> {
        const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });
        const evm = await createEVM({ common });

        let success = false;
        if (contractAddress && this.activeProvider) {
            try {
                const code = await Promise.race([
                    this.activeProvider.getCode(contractAddress),
                    new Promise<string>((_, reject) =>
                        setTimeout(() => reject(new Error("RPC Timeout")), 5000)
                    )
                ]);

                if (code) { // Allow 0x code (EOA)
                    const toAddress = createAddressFromString(contractAddress);
                    const codeBytes = code !== "0x" ? hexToBytes(code as `0x${string}`) : new Uint8Array(0);

                    let account = await evm.stateManager.getAccount(toAddress);
                    if (!account) { account = new Account(); }
                    await evm.stateManager.putAccount(toAddress, account);
                    await (evm.stateManager as any).putCode(toAddress, codeBytes);
                    success = true;

                    // Only load storage if there is code
                    if (code !== "0x") {
                        await this.loadStorageFromRPC(evm, contractAddress);
                    }

                    // Inject token balance for the sender if requested
                    if (injectBalanceFor) {
                        await this.injectTokenBalance(evm, contractAddress, injectBalanceFor);
                    }
                }
            } catch (err) {
                console.warn("[AdvancedSimulator] Failed to fork contract:", err);
            }
        }

        return { evm, success };
    }

    /**
     * Load critical storage slots from RPC to ensure contract state is correct
     */
    private async loadStorageFromRPC(evm: EVM, contractAddress: string): Promise<void> {
        if (!this.activeProvider) return;

        const contractAddr = createAddressFromString(contractAddress);

        // Load first 100 storage slots (covers owner, deployment time, trading flags, etc.)
        const slotsToLoad = 100;

        try {
            for (let i = 0; i < slotsToLoad; i++) {
                const slotHex = "0x" + i.toString(16).padStart(64, "0");
                const storageValue = await this.activeProvider.getStorage(contractAddress, slotHex);

                if (storageValue && storageValue !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
                    const slotBytes = hexToBytes(slotHex as `0x${string}`);
                    const valueBytes = hexToBytes(storageValue as `0x${string}`);

                    try {
                        await evm.stateManager.putStorage(contractAddr, slotBytes, valueBytes);
                    } catch {
                        await (evm.stateManager as any).putContractStorage(contractAddr, slotBytes, valueBytes);
                    }
                }
            }
        } catch (err) {
            // Silently continue if storage loading fails
        }
    }

    /**
     * Inject a large token balance for an address
     * This allows us to test if transfers would succeed IF the user had tokens
     */
    private async injectTokenBalance(evm: EVM, contractAddress: string, userAddress: string): Promise<void> {
        try {
            const contractAddr = createAddressFromString(contractAddress);

            // Common ERC20 balanceOf storage slot patterns
            // The slot depends on contract layout:
            // - Simple ERC20: slot 0-5 (after name, symbol, decimals, totalSupply)
            // - OpenZeppelin ERC20: slot 0 or 51 (after ERC20Storage)
            // - Our test contracts: slot 4 (after name, symbol, decimals, totalSupply)
            const balanceSlots = [0, 1, 2, 3, 4, 5, 6, 51];

            // Large balance to inject (1 million tokens with 18 decimals)
            const largeBalance = hexToBytes("0x00000000000000000000000000000000000000000000d3c21bcecceda1000000" as `0x${string}`);

            for (const baseSlot of balanceSlots) {
                // Calculate storage slot for mapping: keccak256(abi.encode(address, slot))
                const slotKey = this.calculateMappingSlot(userAddress, baseSlot);
                try {
                    await evm.stateManager.putStorage(contractAddr, slotKey, largeBalance);
                } catch {
                    try {
                        await (evm.stateManager as any).putContractStorage(contractAddr, slotKey, largeBalance);
                    } catch {
                        // Continue silently
                    }
                }
            }
        } catch (err) {
            // Silently continue - balance injection is best-effort
        }
    }

    /**
     * Calculate the storage slot for a mapping(address => value)
     */
    private calculateMappingSlot(address: string, baseSlot: number): Uint8Array {
        // Solidity mapping slot: keccak256(h(k) . h(p))
        // For address => uint256: keccak256(abi.encode(address, slot))
        // The address is left-padded to 32 bytes, slot is right-aligned
        const addressNormalized = address.toLowerCase().replace("0x", "");
        const addressPadded = addressNormalized.padStart(64, "0");
        const slotPadded = baseSlot.toString(16).padStart(64, "0");

        // Concatenate: paddedAddress + paddedSlot
        const data = "0x" + addressPadded + slotPadded;

        // Use ethers to compute keccak256
        const hash = ethers.keccak256(data);
        return hexToBytes(hash as `0x${string}`);
        return hexToBytes(hash as `0x${string}`);
    }

    /**
     * Execute a call with custom block timestamp
     */
    private async executeWithTimestamp(
        evm: EVM,
        txParams: { from: string; to: string; data?: string; value?: string },
        timestampOffset: number = 0
    ): Promise<SimulationOutcome> {
        const sender = createAddressFromString(txParams.from);
        const to = createAddressFromString(txParams.to);

        // Fund the sender with 100 ETH
        let account = await evm.stateManager.getAccount(sender);
        if (!account) { account = new Account(); }
        account.balance = BigInt("0x100000000000000000000"); // 100 ETH
        await evm.stateManager.putAccount(sender, account);

        const dataBuffer = txParams.data && txParams.data !== "0x"
            ? hexToBytes(txParams.data as `0x${string}`)
            : new Uint8Array(0);
        const value = txParams.value ? BigInt(txParams.value) : 0n;

        // Calculate block timestamp
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const targetTimestamp = BigInt(currentTimestamp + timestampOffset);

        // Create a block header with the target timestamp
        // @ethereumjs/evm runCall accepts block parameter for timestamp
        const result = await evm.runCall({
            caller: sender,
            to: to,
            data: dataBuffer,
            value: value,
            gasLimit: BigInt(5000000),
            block: {
                header: {
                    timestamp: targetTimestamp,
                    number: BigInt(19000000),
                    coinbase: createAddressFromString("0x0000000000000000000000000000000000000000"),
                    difficulty: 0n,
                    gasLimit: BigInt(30000000),
                    baseFeePerGas: BigInt(20000000000),
                }
            } as any
        });

        const gasUsed = result.execResult.executionGasUsed;
        const returnValue = bytesToHex(result.execResult.returnValue);

        if (result.execResult.exceptionError) {
            return {
                status: "Reverted",
                revertReason: result.execResult.exceptionError.error,
                gasUsed,
                returnValue
            };
        }

        return {
            status: "Success",
            gasUsed,
            returnValue
        };
    }

    /**
     * Feature 3: Time-Travel Simulation
     * Detects delayed honeypots, time-locks, and time-sensitive trading restrictions
     */
    async runTimeTravelSimulation(
        txParams: { from: string; to: string; data?: string; value?: string }
    ): Promise<TimeTravelResult> {
        console.log("[TimeTravelSim] Starting time-travel simulation...");

        const result: TimeTravelResult = {
            isTimeSensitive: false,
            currentBlockResult: { status: "Reverted", gasUsed: 0n },
            futureResults: [],
            summary: "",
            riskFlags: []
        };

        // Time offsets to test (in seconds)
        const timeOffsets = [
            { seconds: 0, description: "Current Block" },
            { seconds: 3600, description: "+1 Hour" },
            { seconds: 86400, description: "+1 Day" },
            { seconds: 604800, description: "+7 Days" },
            { seconds: 2592000, description: "+30 Days" },
            { seconds: -86400, description: "-1 Day (Past)" }
        ];

        // Run simulation at current time first (inject balance for sender)
        const { evm: currentEvm, success: currentSuccess } = await this.createForkedEVM(txParams.to, txParams.from);
        if (!currentSuccess) {
            result.summary = "Failed to create forked EVM for current block";
            return result;
        }

        result.currentBlockResult = await this.executeWithTimestamp(currentEvm, txParams, 0);
        console.log(`[TimeTravelSim] Current block: ${result.currentBlockResult.status}`);

        // Run simulations at each time offset
        for (const offset of timeOffsets) {
            if (offset.seconds === 0) continue; // Skip current (already done)

            const { evm: futureEvm, success } = await this.createForkedEVM(txParams.to, txParams.from);
            if (!success) continue;

            const outcome = await this.executeWithTimestamp(futureEvm, txParams, offset.seconds);
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

        // Analyze results and generate risk flags
        this.analyzeTimeTravelResults(result);

        return result;
    }

    private analyzeTimeTravelResults(result: TimeTravelResult): void {
        const currentSuccess = result.currentBlockResult.status === "Success";

        for (const future of result.futureResults) {
            if (!future.divergesFromCurrent) continue;

            const futureSuccess = future.outcome.status === "Success";

            if (currentSuccess && !futureSuccess) {
                // Transaction works now but fails in future
                if (future.offsetSeconds > 0) {
                    result.riskFlags.push(`TIME-BOMB: Transaction fails at ${future.offsetDescription}`);
                    if (future.offsetSeconds <= 604800) {
                        result.riskFlags.push("CRITICAL: Fails within 7 days - possible honeypot activation");
                    }
                }
            } else if (!currentSuccess && futureSuccess) {
                // Transaction fails now but works in future
                if (future.offsetSeconds > 0) {
                    result.riskFlags.push(`DELAYED TRADING: Trading opens at ${future.offsetDescription}`);
                    if (future.offsetSeconds > 86400) {
                        result.riskFlags.push("WARNING: Extended trading delay - verify legitimacy");
                    }
                } else {
                    // Works in past but not now
                    result.riskFlags.push("TRADING CLOSED: Transaction worked before but fails now");
                }
            }
        }

        // Generate summary
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
                result.summary = "⚠️ TIME-SENSITIVE: This contract has time-based restrictions that will BLOCK transactions in the future. Possible delayed honeypot.";
            } else if (opensLater) {
                result.summary = "⏰ DELAYED TRADING: Trading is not open yet but will be in the future. Verify this is legitimate.";
            } else {
                result.summary = "⚠️ TIME-SENSITIVE: Transaction outcomes vary based on block timestamp.";
            }
        } else {
            result.summary = "✅ No time-based restrictions detected. Transaction behaves consistently across time.";
        }
    }

    /**
     * Feature 4: Counterfactual Risk Simulation
     * Compares transaction outcomes between different actors
     */
    async runCounterfactualSimulation(
        txParams: { from: string; to: string; data?: string; value?: string },
        ownerAddress?: string,
        deployerAddress?: string
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

        // Define actors to test
        const actors: { type: ActorSimulationResult["actorType"] | "Current User"; address: string }[] = [
            { type: "Current User", address: txParams.from },
            // Generate a truly random address for comparison
            { type: "RandomUser", address: this.generateRandomAddress() }
        ];

        if (ownerAddress && ownerAddress !== "0x0000000000000000000000000000000000000000") {
            actors.push({ type: "Owner", address: ownerAddress });
        }

        if (deployerAddress && deployerAddress !== ownerAddress) {
            actors.push({ type: "Deployer", address: deployerAddress });
        }

        // Try to detect whitelisted addresses from storage (common patterns)
        const whitelistAddresses = await this.detectWhitelistedAddresses(txParams.to);
        for (const addr of whitelistAddresses) {
            actors.push({ type: "WhitelistedAddress", address: addr });
        }

        console.log(`[CounterfactualSim] Testing ${actors.length} actors...`);

        // Run simulation for each actor
        for (const actor of actors) {
            // Inject token balance for this actor so we're testing transfer restrictions, not balance
            const { evm, success } = await this.createForkedEVM(txParams.to, actor.address);
            if (!success) continue;

            // If testing owner, also inject owner into storage slot 0 to bypass onlyOwner checks
            if (actor.type === "Owner" && ownerAddress) {
                await this.injectOwnerStorage(evm, txParams.to, ownerAddress);
            }

            const testTxParams = { ...txParams, from: actor.address };
            const outcome = await this.executeWithTimestamp(evm, testTxParams, 0);

            result.actorResults.push({
                actorType: actor.type,
                address: actor.address,
                outcome
            });

            console.log(`[CounterfactualSim] ${actor.type} (${actor.address.slice(0, 10)}...): ${outcome.status}`);
        }

        // Analyze results
        this.analyzeCounterfactualResults(result);

        return result;
    }

    private generateRandomAddress(): string {
        const bytes = new Uint8Array(20);
        crypto.getRandomValues(bytes);
        return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    private async injectOwnerStorage(evm: EVM, contractAddress: string, ownerAddress: string): Promise<void> {
        try {
            const ownerAddr = createAddressFromString(ownerAddress);
            const targetAddr = createAddressFromString(contractAddress);

            // Common owner storage slots
            const ownerSlots = [
                new Uint8Array(32), // Slot 0 (most common)
                hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000005"), // Slot 5
                hexToBytes("0x0000000000000000000000000000000000000000000000000000000000000033"), // OZ Slot
            ];

            const storageVal = new Uint8Array(32);
            const addressBytes = ownerAddr.toBytes();
            storageVal.set(addressBytes, 12);

            for (const slot of ownerSlots) {
                try {
                    await evm.stateManager.putStorage(targetAddr, slot, storageVal);
                } catch {
                    // Try alternative method names for different versions
                    try {
                        await (evm.stateManager as any).putContractStorage(targetAddr, slot, storageVal);
                    } catch {
                        // Silently continue if storage injection fails
                    }
                }
            }
        } catch (err) {
            console.warn("[CounterfactualSim] Failed to inject owner storage:", err);
        }
    }

    private async detectWhitelistedAddresses(_contractAddress: string): Promise<string[]> {
        // Future enhancement: analyze storage to detect whitelist mappings
        // For now, return empty array
        // Could use storage slot analysis to find mapping(address => bool) patterns
        return [];
    }

    private analyzeCounterfactualResults(result: CounterfactualResult): void {
        const userResults = result.actorResults.filter(r => r.actorType === "RandomUser");
        const ownerResults = result.actorResults.filter(r => r.actorType === "Owner");
        const whitelistResults = result.actorResults.filter(r => r.actorType === "WhitelistedAddress");

        // Check if any random user succeeds
        const anyUserSucceeds = userResults.some(r => r.outcome.status === "Success");
        const allUsersFail = userResults.every(r => r.outcome.status === "Reverted");

        // Check owner results
        const ownerSucceeds = ownerResults.some(r => r.outcome.status === "Success");
        const ownerFails = ownerResults.every(r => r.outcome.status === "Reverted");

        // HONEYPOT DETECTION: Owner can trade, users cannot
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

        // Check if users can trade but owner cannot (inverse case - rare but exists)
        if (anyUserSucceeds && ownerFails) {
            result.riskFlags.push("UNUSUAL: Users can execute but owner cannot - verify logic");
            result.privilegeDiff.push({
                description: "Transaction Execution",
                userOutcome: "ALLOWED",
                ownerOutcome: "BLOCKED",
                severity: "Medium"
            });
        }

        // Check for whitelist mechanism
        if (whitelistResults.length > 0) {
            const whitelistSucceeds = whitelistResults.some(r => r.outcome.status === "Success");
            if (whitelistSucceeds && allUsersFail) {
                result.hasWhitelistMechanism = true;
                result.riskFlags.push("WHITELIST DETECTED: Only whitelisted addresses can trade");
                result.riskScore = Math.max(result.riskScore, 80);
            }
        }

        // Compare gas usage differences (significant difference may indicate hidden checks)
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

        // Generate summary
        if (result.isHoneypot) {
            result.summary = "🚨 HONEYPOT CONFIRMED: This contract allows the owner to trade but blocks regular users. DO NOT INVEST.";
        } else if (result.hasWhitelistMechanism) {
            result.summary = "⚠️ WHITELIST SCAM: Only certain addresses can trade. Regular users are blocked.";
        } else if (result.hasOwnerPrivileges) {
            result.summary = "⚠️ OWNER PRIVILEGES: The owner has special trading privileges not available to users.";
        } else if (allUsersFail) {
            result.summary = "⚠️ TRADING BLOCKED: All users cannot execute this transaction.";
        } else if (anyUserSucceeds) {
            result.summary = "✅ No privilege differences detected. Transaction executes equally for all actors.";
        } else {
            result.summary = "Unable to determine privilege status - insufficient data.";
        }
    }

    /**
     * Run comprehensive Phase 2 simulation
     * Combines time-travel and counterfactual analysis
     */
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

        // Run both simulations
        const [timeTravel, counterfactual] = await Promise.all([
            this.runTimeTravelSimulation(txParams),
            this.runCounterfactualSimulation(txParams, ownerAddress, deployerAddress)
        ]);

        // Calculate overall risk score
        let overallRiskScore = counterfactual.riskScore;

        if (timeTravel.isTimeSensitive) {
            overallRiskScore += 25;

            // Extra penalty for time-bombs
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
            overallSummary = "🚨 SCAM DETECTED: ";
            if (counterfactual.isHoneypot) {
                overallSummary += "Honeypot contract - you cannot sell. ";
            }
            if (counterfactual.hasWhitelistMechanism) {
                overallSummary += "Whitelist-only trading. ";
            }
            if (timeTravel.isTimeSensitive) {
                overallSummary += "Time-based restrictions detected. ";
            }
            overallSummary += "DO NOT INTERACT.";
        } else if (overallRiskScore > 50) {
            overallSummary = `⚠️ HIGH RISK (Score: ${overallRiskScore}/100): Proceed with extreme caution.`;
        } else if (overallRiskScore > 25) {
            overallSummary = `⚠️ MODERATE RISK (Score: ${overallRiskScore}/100): Exercise caution.`;
        } else {
            overallSummary = `✅ LOW RISK (Score: ${overallRiskScore}/100): No major issues detected.`;
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
