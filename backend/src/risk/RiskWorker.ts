import { RedisClient } from "../services/RedisClient.js";
import { RiskEngine } from "./RiskEngine.js";
import { RiskAnalysisResult, ScamType } from "./types.js";

const REDIS_TTL = 3600 * 24; // 24 hours
const ANALYSIS_QUEUE_KEY = "risk:queue"; // List

export class RiskWorker {
    private engine: RiskEngine;
    private isProcessing = false;
    private processingInterval: NodeJS.Timeout | null = null;
    private redisClient: any = null;

    constructor() {
        this.engine = new RiskEngine();
    }

    async init() {
        this.redisClient = await RedisClient.connect();
        // Start processing loop
        this.startWorker();
    }

    private startWorker() {
        if (this.processingInterval) return;
        console.log("[RiskWorker] Starting background worker...");

        this.processingInterval = setInterval(async () => {
            if (this.isProcessing) return;
            this.isProcessing = true;
            try {
                await this.processNext();
            } catch (e) {
                console.error("[RiskWorker] Error in worker loop:", e);
            } finally {
                this.isProcessing = false;
            }
        }, 5000); // Process every 5 seconds to respect rate limits
    }

    private async processNext() {
        // Pop from queue (LPOP)
        // Note: Using in-memory queue if Redis queue is complex? 
        // Let's use internal memory queue for simplicity in this MVP 
        // unless we want distributed workers. 
        // User said "Background Worker (TypeScript)" -> single node implied likely.
        // But "Risk Cache (JSON / in-memory / Redis)" suggests persistence.

        // I'll implement a simple queue in Redis to restart-proof it.
        if (!this.redisClient) return;

        const tokenAddress = await this.redisClient.lPop(ANALYSIS_QUEUE_KEY);
        if (!tokenAddress) return; // Empty queue

        console.log(`[RiskWorker] Processing token: ${tokenAddress}`);

        try {
            const result = await this.engine.analyzeToken(tokenAddress);

            // Cache result
            const key = `risk:${tokenAddress.toLowerCase()}`;
            await this.redisClient.set(key, JSON.stringify(result), { EX: REDIS_TTL });

            console.log(`[RiskWorker] Analyzed ${tokenAddress}: Score ${result.riskScore}`);
        } catch (error: any) {
            console.error(`[RiskWorker] Failed to analyze ${tokenAddress}:`, error.message);
            // Optional: Re-queue with backoff? For MVP, we skip.
        }
    }

    async getRisk(tokenAddress: string): Promise<RiskAnalysisResult | null> {
        if (!this.redisClient) this.redisClient = await RedisClient.connect();

        const key = `risk:${tokenAddress.toLowerCase()}`;
        const data = await this.redisClient.get(key);

        if (data) {
            return JSON.parse(data) as RiskAnalysisResult;
        }

        // If not found, queue it!
        await this.queueAnalysis(tokenAddress);
        return null;
    }

    async queueAnalysis(tokenAddress: string) {
        if (!this.redisClient) this.redisClient = await RedisClient.connect();

        // Check if already analyzing (optional optimization, check queue presence?)
        // Redis List doesn't natively support unique efficiently, but we can RPUSH safely.
        // Duplicate processing is acceptable for MVP.
        await this.redisClient.rPush(ANALYSIS_QUEUE_KEY, tokenAddress);
        console.log(`[RiskWorker] Queued analysis for ${tokenAddress}`);
    }

    async analyzeNow(tokenAddress: string): Promise<RiskAnalysisResult> {
        if (!this.redisClient) this.redisClient = await RedisClient.connect();

        // 1. Check Cache first
        const key = `risk:${tokenAddress.toLowerCase()}`;
        const data = await this.redisClient.get(key);
        if (data) {
            return JSON.parse(data) as RiskAnalysisResult;
        }

        // 2. Run Immediately (Blocking)
        console.log(`[RiskWorker] Instant Analysis for: ${tokenAddress}`);
        try {
            const result = await this.engine.analyzeToken(tokenAddress);
            // Cache it
            await this.redisClient.set(key, JSON.stringify(result), { EX: REDIS_TTL });
            return result;
        } catch (error: any) {
            console.error(`[RiskWorker] Instant Analysis Failed for ${tokenAddress}:`, error.message);
            return {
                riskScore: 0,
                scamType: ScamType.UNKNOWN,
                reasons: ["Analysis Failed"],
                lastUpdated: new Date().toISOString()
            };
        }
    }
}

export const riskWorker = new RiskWorker();