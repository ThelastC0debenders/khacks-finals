import { ethers } from "ethers";
import { EVM, createEVM } from "@ethereumjs/evm";
import { Common, Chain, Hardfork, Mainnet } from "@ethereumjs/common";
import { Address, hexToBytes, createAddressFromString, Account, bytesToHex } from "@ethereumjs/util";

export interface SimulationOutcome {
    status: string;
    gasUsed: bigint;
    returnValue: string;
    revertReason?: string;
}

export class SimulationEngine {
    constructor(private activeProvider: ethers.JsonRpcProvider | null) { }

    public setActiveProvider(provider: ethers.JsonRpcProvider) {
        this.activeProvider = provider;
    }

    /**
     * Create a forked EVM instance with contract code and critical storage loaded
     */
    async createForkedEVM(contractAddress: string, injectBalanceFor?: string, prefetchedBytecode?: string): Promise<{ evm: EVM; success: boolean }> {
        const common = new Common({ chain: Mainnet, hardfork: Hardfork.Cancun });
        const evm = await createEVM({ common });

        let success = false;
        if (contractAddress && this.activeProvider) {
            try {
                // Use prefetched code if available, otherwise fetch it
                let code = prefetchedBytecode;

                if (!code && this.activeProvider) {
                    try {
                        code = await Promise.race([
                            this.activeProvider.getCode(contractAddress),
                            new Promise<string>((_, reject) =>
                                setTimeout(() => reject(new Error("RPC Timeout")), 5000)
                            )
                        ]);
                    } catch (err) { /* ignore */ }
                }

                if (code && code !== "0x") {
                    const toAddress = createAddressFromString(contractAddress);
                    const codeBytes = hexToBytes(code as `0x${string}`);

                    let account = await evm.stateManager.getAccount(toAddress);
                    if (!account) { account = new Account(); }
                    await evm.stateManager.putAccount(toAddress, account);
                    await (evm.stateManager as any).putCode(toAddress, codeBytes);
                    success = true;

                    // Load critical storage slots from RPC (slots 0-10 cover most state variables)
                    await this.loadStorageFromRPC(evm, contractAddress);

                    // Inject token balance for the sender if requested
                    if (injectBalanceFor) {
                        await this.injectTokenBalance(evm, contractAddress, injectBalanceFor);
                    }
                }
            } catch (err) {
                console.warn("[SimulationEngine] Failed to fork contract:", err);
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
        const slotsToLoad = 20;

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
     */
    async injectTokenBalance(evm: EVM, contractAddress: string, userAddress: string): Promise<void> {
        try {
            const contractAddr = createAddressFromString(contractAddress);
            const balanceSlots = [0, 1, 2, 3, 4, 5, 6, 51];
            const largeBalance = hexToBytes("0x00000000000000000000000000000000000000000000d3c21bcecceda1000000" as `0x${string}`);

            for (const baseSlot of balanceSlots) {
                const slotKey = this.calculateMappingSlot(userAddress, baseSlot);
                try {
                    await evm.stateManager.putStorage(contractAddr, slotKey, largeBalance);
                } catch {
                    try {
                        await (evm.stateManager as any).putContractStorage(contractAddr, slotKey, largeBalance);
                    } catch { }
                }
            }
        } catch (err) { }
    }

    /**
     * Inject owner address into storage slots
     */
    async injectOwnerStorage(evm: EVM, contractAddress: string, ownerAddress: string): Promise<void> {
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
                    try {
                        await (evm.stateManager as any).putContractStorage(targetAddr, slot, storageVal);
                    } catch { }
                }
            }
        } catch (err) {
            console.warn("[SimulationEngine] Failed to inject owner storage:", err);
        }
    }

    private calculateMappingSlot(address: string, baseSlot: number): Uint8Array {
        const addressNormalized = address.toLowerCase().replace("0x", "");
        const addressPadded = addressNormalized.padStart(64, "0");
        const slotPadded = baseSlot.toString(16).padStart(64, "0");
        const data = "0x" + addressPadded + slotPadded;
        const hash = ethers.keccak256(data);
        return hexToBytes(hash as `0x${string}`);
    }

    /**
     * Execute a call with custom block timestamp
     */
    async executeWithTimestamp(
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

        const dataBuffer = txParams.data && txParams.data !== "0x" ? hexToBytes(txParams.data as `0x${string}`) : new Uint8Array(0);
        const value = txParams.value ? BigInt(txParams.value) : 0n;

        const currentTimestamp = Math.floor(Date.now() / 1000);
        const targetTimestamp = BigInt(currentTimestamp + timestampOffset);

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
        return { status: "Success", gasUsed, returnValue };
    }

    generateRandomAddress(): string {
        const bytes = new Uint8Array(20);
        crypto.getRandomValues(bytes);
        return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    }
}
