import { EVM } from "@ethereumjs/evm";
import { Address, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { ethers } from "ethers";

export interface ProxyInfo {
    isProxy: boolean;
    proxyType?: 'EIP-1967' | 'EIP-1822' | 'EIP-897' | 'Minimal';
    implementationAddress?: string;
    beaconAddress?: string;
    adminAddress?: string;
}

// EIP-1967 Storage Slots
const STORAGE_SLOTS = {
    // EIP-1967: Implementation slot = keccak256("eip1967.proxy.implementation") - 1
    EIP1967_IMPLEMENTATION: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
    // EIP-1967: Beacon slot = keccak256("eip1967.proxy.beacon") - 1
    EIP1967_BEACON: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50',
    // EIP-1967: Admin slot = keccak256("eip1967.proxy.admin") - 1
    EIP1967_ADMIN: '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103',
    // EIP-1822: UUPS proxiableUUID
    EIP1822_IMPLEMENTATION: '0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7'
};

// Minimal proxy pattern (EIP-1167 clone)
const MINIMAL_PROXY_PREFIX = '363d3d373d3d3d363d73';
const MINIMAL_PROXY_SUFFIX = '5af43d82803e903d91602b57fd5bf3';

export class ProxyDetector {

    /**
     * Detect if a contract is a proxy and resolve implementation address
     */
    static async detectProxy(
        evm: EVM,
        address: Address,
        provider?: ethers.JsonRpcProvider
    ): Promise<ProxyInfo> {
        console.log(`[ProxyDetector] Analyzing ${address.toString()}...`);

        const result: ProxyInfo = { isProxy: false };

        try {
            // Get contract bytecode
            const code = await evm.stateManager.getContractCode(address);
            const codeHex = bytesToHex(code).toLowerCase().slice(2); // Remove 0x prefix

            // 1. Check for Minimal Proxy (EIP-1167)
            const minimalProxyCheck = this.checkMinimalProxy(codeHex);
            if (minimalProxyCheck.isProxy) {
                console.log(`[ProxyDetector] Detected Minimal Proxy (EIP-1167)`);
                return {
                    isProxy: true,
                    proxyType: 'Minimal',
                    implementationAddress: minimalProxyCheck.implementation
                };
            }

            // 2. Check if code is small and contains DELEGATECALL
            const hasDelegateCall = this.containsDelegateCall(codeHex);
            const isMinimalCode = code.length < 200; // Small bytecode suggests proxy

            if (hasDelegateCall) {
                console.log(`[ProxyDetector] DELEGATECALL detected in bytecode`);
            }

            // 3. Check EIP-1967 storage slots
            const eip1967Result = await this.checkEIP1967Slots(evm, address, provider);
            if (eip1967Result.isProxy) {
                return eip1967Result;
            }

            // 4. Check EIP-1822 (UUPS)
            const eip1822Result = await this.checkEIP1822(evm, address, provider);
            if (eip1822Result.isProxy) {
                return eip1822Result;
            }

            // 5. Check EIP-897 (legacy DelegateProxy)
            const eip897Result = await this.checkEIP897(evm, address);
            if (eip897Result.isProxy) {
                return eip897Result;
            }

            // If small code with DELEGATECALL but no standard slots, likely custom proxy
            if (isMinimalCode && hasDelegateCall) {
                console.log(`[ProxyDetector] Possible custom proxy pattern detected`);
                result.isProxy = true;
                result.proxyType = 'Minimal';
            }

        } catch (error: any) {
            console.error(`[ProxyDetector] Error analyzing proxy:`, error.message);
        }

        return result;
    }

    /**
     * Check for EIP-1167 minimal proxy pattern
     */
    private static checkMinimalProxy(codeHex: string): { isProxy: boolean; implementation?: string } {
        // Standard minimal proxy: 363d3d373d3d3d363d73<address>5af43d82803e903d91602b57fd5bf3
        if (codeHex.startsWith(MINIMAL_PROXY_PREFIX) && codeHex.endsWith(MINIMAL_PROXY_SUFFIX)) {
            // Extract 20-byte address (40 hex chars) between prefix and suffix
            const prefixLen = MINIMAL_PROXY_PREFIX.length;
            const addressHex = codeHex.slice(prefixLen, prefixLen + 40);
            const implementation = `0x${addressHex}`;
            return { isProxy: true, implementation };
        }
        return { isProxy: false };
    }

    /**
     * Check if bytecode contains DELEGATECALL opcode (0xf4)
     */
    private static containsDelegateCall(codeHex: string): boolean {
        // DELEGATECALL opcode is 0xf4
        return codeHex.includes('f4');
    }

    /**
     * Check EIP-1967 storage slots for implementation/beacon addresses
     */
    private static async checkEIP1967Slots(
        evm: EVM,
        address: Address,
        provider?: ethers.JsonRpcProvider
    ): Promise<ProxyInfo> {
        const result: ProxyInfo = { isProxy: false };

        try {
            // Try to read implementation slot
            const implSlot = hexToBytes(STORAGE_SLOTS.EIP1967_IMPLEMENTATION as `0x${string}`);
            let implValue: Uint8Array;

            // Try from EVM state first
            try {
                implValue = await evm.stateManager.getContractStorage(address, implSlot);
            } catch {
                // If not in EVM state, try from provider
                if (provider) {
                    const storageValue = await provider.getStorage(
                        address.toString(),
                        STORAGE_SLOTS.EIP1967_IMPLEMENTATION
                    );
                    implValue = hexToBytes(storageValue as `0x${string}`);
                } else {
                    return result;
                }
            }

            // Check if implementation address is set
            const implAddress = this.extractAddress(implValue);
            if (implAddress && implAddress !== '0x0000000000000000000000000000000000000000') {
                console.log(`[ProxyDetector] EIP-1967 Implementation: ${implAddress}`);
                result.isProxy = true;
                result.proxyType = 'EIP-1967';
                result.implementationAddress = implAddress;

                // Also check for beacon
                const beaconSlot = hexToBytes(STORAGE_SLOTS.EIP1967_BEACON as `0x${string}`);
                try {
                    const beaconValue = await evm.stateManager.getContractStorage(address, beaconSlot);
                    const beaconAddress = this.extractAddress(beaconValue);
                    if (beaconAddress && beaconAddress !== '0x0000000000000000000000000000000000000000') {
                        result.beaconAddress = beaconAddress;
                    }
                } catch { /* Beacon slot may not exist */ }

                // Check admin slot
                const adminSlot = hexToBytes(STORAGE_SLOTS.EIP1967_ADMIN as `0x${string}`);
                try {
                    const adminValue = await evm.stateManager.getContractStorage(address, adminSlot);
                    const adminAddress = this.extractAddress(adminValue);
                    if (adminAddress && adminAddress !== '0x0000000000000000000000000000000000000000') {
                        result.adminAddress = adminAddress;
                    }
                } catch { /* Admin slot may not exist */ }
            }
        } catch (error: any) {
            console.error(`[ProxyDetector] EIP-1967 check failed:`, error.message);
        }

        return result;
    }

    /**
     * Check EIP-1822 UUPS proxy pattern
     */
    private static async checkEIP1822(
        evm: EVM,
        address: Address,
        provider?: ethers.JsonRpcProvider
    ): Promise<ProxyInfo> {
        const result: ProxyInfo = { isProxy: false };

        try {
            const slot = hexToBytes(STORAGE_SLOTS.EIP1822_IMPLEMENTATION as `0x${string}`);
            let value: Uint8Array;

            try {
                value = await evm.stateManager.getContractStorage(address, slot);
            } catch {
                if (provider) {
                    const storageValue = await provider.getStorage(
                        address.toString(),
                        STORAGE_SLOTS.EIP1822_IMPLEMENTATION
                    );
                    value = hexToBytes(storageValue as `0x${string}`);
                } else {
                    return result;
                }
            }

            const implAddress = this.extractAddress(value);
            if (implAddress && implAddress !== '0x0000000000000000000000000000000000000000') {
                console.log(`[ProxyDetector] EIP-1822 Implementation: ${implAddress}`);
                result.isProxy = true;
                result.proxyType = 'EIP-1822';
                result.implementationAddress = implAddress;
            }
        } catch (error: any) {
            console.error(`[ProxyDetector] EIP-1822 check failed:`, error.message);
        }

        return result;
    }

    /**
     * Check EIP-897 legacy DelegateProxy (calls implementation() function)
     */
    private static async checkEIP897(evm: EVM, address: Address): Promise<ProxyInfo> {
        const result: ProxyInfo = { isProxy: false };

        try {
            // Call implementation() function - selector: 0x5c60da1b
            const selector = hexToBytes('0x5c60da1b' as `0x${string}`);

            const callResult = await evm.runCall({
                to: address,
                data: selector,
                gasLimit: BigInt(50000)
            });

            if (!callResult.execResult.exceptionError && callResult.execResult.returnValue.length === 32) {
                const implAddress = this.extractAddress(callResult.execResult.returnValue);
                if (implAddress && implAddress !== '0x0000000000000000000000000000000000000000') {
                    console.log(`[ProxyDetector] EIP-897 Implementation: ${implAddress}`);
                    result.isProxy = true;
                    result.proxyType = 'EIP-897';
                    result.implementationAddress = implAddress;
                }
            }
        } catch (error: any) {
            // Not a proxy or doesn't implement this interface
        }

        return result;
    }

    /**
     * Extract address from 32-byte storage value
     */
    private static extractAddress(value: Uint8Array): string | null {
        if (value.length < 20) return null;

        // Address is in the last 20 bytes of a 32-byte value
        const addressBytes = value.slice(-20);
        const addressHex = bytesToHex(addressBytes);

        // Check if it's all zeros
        if (addressBytes.every(b => b === 0)) {
            return null;
        }

        return addressHex;
    }

    /**
     * Recursively resolve implementation chain (for nested proxies)
     * Returns the final implementation address
     */
    static async resolveImplementationChain(
        evm: EVM,
        address: Address,
        provider?: ethers.JsonRpcProvider,
        maxDepth: number = 5
    ): Promise<{ chain: string[]; finalImplementation?: string }> {
        const chain: string[] = [address.toString()];
        let currentAddress = address;
        let depth = 0;

        while (depth < maxDepth) {
            const proxyInfo = await this.detectProxy(evm, currentAddress, provider);

            if (!proxyInfo.isProxy || !proxyInfo.implementationAddress) {
                break;
            }

            chain.push(proxyInfo.implementationAddress);

            // Load implementation code into EVM if provider available
            if (provider) {
                try {
                    const implCode = await provider.getCode(proxyInfo.implementationAddress);
                    if (implCode && implCode !== '0x') {
                        const { Address, Account } = await import('@ethereumjs/util');
                        const implAddress = Address.fromString(proxyInfo.implementationAddress);
                        const implAccount = new Account();
                        await evm.stateManager.putAccount(implAddress, implAccount);
                        await (evm.stateManager as any).putCode(implAddress, hexToBytes(implCode as `0x${string}`));
                        currentAddress = implAddress;
                    } else {
                        break;
                    }
                } catch {
                    break;
                }
            } else {
                break;
            }

            depth++;
        }

        return {
            chain,
            finalImplementation: chain.length > 1 ? chain[chain.length - 1] : undefined
        };
    }
}
