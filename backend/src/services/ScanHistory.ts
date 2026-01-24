import { RedisClient } from './RedisClient.js';
import { SecurityReport } from '../analyzers/SecurityAnalyzer.js';
import crypto from 'crypto';

export interface ScanRecord {
    timestamp: number;
    chainId: number;
    contractAddress: string;
    riskScore: number;
    flags: string[];
    capabilityHash: string;
    isHoneypot: boolean;
    ownershipStatus: string;
    isProxy?: boolean;
    implementationAddress?: string;
}

export interface DriftAnalysis {
    hasDrift: boolean;
    riskDelta: number;
    newFlags: string[];
    removedFlags: string[];
    previousScan?: ScanRecord;
}

export class ScanHistory {
    private static KEY_PREFIX = 'scan';
    private static HISTORY_PREFIX = 'history';
    private static TTL_SECONDS = 86400 * 30; // 30 days

    /**
     * Generate a capability hash from flags array for drift detection
     */
    static generateCapabilityHash(flags: string[]): string {
        const sorted = [...flags].sort().join('|');
        return crypto.createHash('sha256').update(sorted).digest('hex').substring(0, 16);
    }

    /**
     * Store a scan result
     * Key: scan:<contract_address>:<timestamp>
     */
    static async storeScan(
        contractAddress: string,
        chainId: number,
        report: SecurityReport,
        proxyInfo?: { isProxy: boolean; implementationAddress?: string }
    ): Promise<ScanRecord> {
        const client = await RedisClient.connect();
        const timestamp = Date.now();
        const normalizedAddress = contractAddress.toLowerCase();

        const record: ScanRecord = {
            timestamp,
            chainId,
            contractAddress: normalizedAddress,
            riskScore: report.riskScore,
            flags: report.flags,
            capabilityHash: this.generateCapabilityHash(report.flags),
            isHoneypot: report.isHoneypot,
            ownershipStatus: report.ownershipStatus,
            isProxy: proxyInfo?.isProxy,
            implementationAddress: proxyInfo?.implementationAddress
        };

        // Store the scan with timestamp key
        const scanKey = `${this.KEY_PREFIX}:${normalizedAddress}:${timestamp}`;
        await client.setEx(scanKey, this.TTL_SECONDS, JSON.stringify(record));

        // Add to history list (for LRANGE queries)
        const historyKey = `${this.HISTORY_PREFIX}:${normalizedAddress}`;
        await client.lPush(historyKey, JSON.stringify(record));

        // Trim history to last 100 entries
        await client.lTrim(historyKey, 0, 99);

        console.log(`[ScanHistory] Stored scan for ${normalizedAddress} at ${timestamp}`);
        return record;
    }

    /**
     * Get scan history for a contract
     * Returns most recent first
     */
    static async getHistory(contractAddress: string, limit: number = 10): Promise<ScanRecord[]> {
        const client = await RedisClient.connect();
        const normalizedAddress = contractAddress.toLowerCase();
        const historyKey = `${this.HISTORY_PREFIX}:${normalizedAddress}`;

        const records = await client.lRange(historyKey, 0, limit - 1);
        return records.map(r => JSON.parse(r) as ScanRecord);
    }

    /**
     * Get the most recent scan for a contract
     */
    static async getLatestScan(contractAddress: string): Promise<ScanRecord | null> {
        const history = await this.getHistory(contractAddress, 1);
        return history.length > 0 ? history[0] : null;
    }

    /**
     * Analyze behavioral drift between current and previous scan
     */
    static async analyzeDrift(
        contractAddress: string,
        currentReport: SecurityReport
    ): Promise<DriftAnalysis> {
        const previousScan = await this.getLatestScan(contractAddress);

        if (!previousScan) {
            return {
                hasDrift: false,
                riskDelta: 0,
                newFlags: [],
                removedFlags: []
            };
        }

        const currentCapabilityHash = this.generateCapabilityHash(currentReport.flags);
        const hasDrift = currentCapabilityHash !== previousScan.capabilityHash;

        const currentFlagsSet = new Set(currentReport.flags);
        const previousFlagsSet = new Set(previousScan.flags);

        const newFlags = currentReport.flags.filter(f => !previousFlagsSet.has(f));
        const removedFlags = previousScan.flags.filter(f => !currentFlagsSet.has(f));

        return {
            hasDrift,
            riskDelta: currentReport.riskScore - previousScan.riskScore,
            newFlags,
            removedFlags,
            previousScan
        };
    }

    /**
     * Get contracts with significant drift (risk increase)
     */
    static async getContractsWithDrift(minRiskDelta: number = 20): Promise<string[]> {
        const client = await RedisClient.connect();

        // Scan all history keys
        const keys = await client.keys(`${this.HISTORY_PREFIX}:*`);
        const contractsWithDrift: string[] = [];

        for (const key of keys) {
            const records = await client.lRange(key, 0, 1);
            if (records.length >= 2) {
                const current = JSON.parse(records[0]) as ScanRecord;
                const previous = JSON.parse(records[1]) as ScanRecord;

                if (current.riskScore - previous.riskScore >= minRiskDelta) {
                    contractsWithDrift.push(current.contractAddress);
                }
            }
        }

        return contractsWithDrift;
    }
}
