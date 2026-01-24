import { ethers } from "ethers";
import { EVM } from "@ethereumjs/evm";
import { Common, Chain, Hardfork } from "@ethereumjs/common";
import { Address, hexToBytes, Account } from "@ethereumjs/util";
import { SecurityAnalyzer } from "../analyzers/SecurityAnalyzer.js";
import { ProxyDetector } from "../analyzers/ProxyDetector.js";
import { ExplanationEngine } from "../analyzers/ExplanationEngine.js";
import { OpcodeTracer } from "../analyzers/OpcodeTracer.js";

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
        const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Cancun });
        const evm = await EVM.create({ common });

        let success = false;
        if (toAddressStr && chainId) {
            const rpcUrls = this.resolveRpcUrls(chainId);
            const toAddress = Address.fromString(toAddressStr);

            if (rpcUrls.length > 0) {
                for (const rpcUrl of rpcUrls) {
                    try {
                        const provider = new ethers.JsonRpcProvider(rpcUrl);
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
                            await evm.stateManager.putContractCode(toAddress, codeBytes);
                            console.log(`[Fork] Fetched code from ${rpcUrl}: ${code.length > 10 ? code.slice(0, 10) + '...' : code}`);
                            success = true;
                            break;
                        } else {
                            console.log(`[Fork] Code is empty/0x at ${toAddressStr} on ${rpcUrl}`);
                            const chainIdNum = Number(chainId.toString().split(':')[1] || chainId);
                            if (chainIdNum === 31337) continue;
                            success = true;
                            break;
                        }
                    } catch (err: any) {
                        console.error(`[Fork] Error setupForkedEVM loop: ${err.message}`);
                        continue;
                    }
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

        const to = txParams.to ? Address.fromString(txParams.to) : undefined;
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
        const sender = Address.fromString(txParams.from);

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
        const to = txParams.to ? Address.fromString(txParams.to) : undefined;
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
                            const implAddress = Address.fromString(proxyInfo.implementationAddress);
                            let implAccount = await evm.stateManager.getAccount(implAddress);
                            if (!implAccount) { implAccount = new Account(); }
                            await evm.stateManager.putAccount(implAddress, implAccount);
                            await evm.stateManager.putContractCode(implAddress, hexToBytes(implCode as `0x${string}`));
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

            return {
                trace: traceResult,
                securityReport,
                instructionCount,
                callCount,
                status,
                simulationResult: {
                    gasUsed: result.execResult.executionGasUsed.toString(),
                    returnValue: Buffer.from(result.execResult.returnValue).toString('hex'),
                    logs: result.execResult.logs?.map(l => ({
                        address: l[0].toString(),
                        topics: l[1].map(t => Buffer.from(t).toString('hex')),
                        data: Buffer.from(l[2]).toString('hex')
                    })),
                    exceptionError: result.execResult.exceptionError ? result.execResult.exceptionError.error : undefined
                }
            };
        }
    }
}