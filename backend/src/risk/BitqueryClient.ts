import { TokenMetadata, Holder, LiquiditySnapshot, TradeStats } from "./types.js";

const BITQUERY_ENDPOINT = "https://streaming.bitquery.io/graphql";

export class BitqueryClient {
    private apiKey: string;

    constructor() {
        this.apiKey = process.env.BITQUERY_API_KEY || "";
        if (!this.apiKey) {
            console.warn("[Risk] BITQUERY_API_KEY is missing. Risk analysis will fail.");
        }
    }

    private async query(query: string, variables: any = {}): Promise<any> {
        if (!this.apiKey) throw new Error("Missing Bitquery API Key");

        const response = await fetch(BITQUERY_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // V2 uses Bearer token, not X-API-KEY
                "Authorization": `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({ query, variables })
        });

        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(`Bitquery V2 Invalid JSON: ${text.substring(0, 100)}`);
        }

        if (data.errors) {
            console.error("Bitquery V2 Errors:", JSON.stringify(data.errors, null, 2));
            throw new Error(`Bitquery Error: ${data.errors[0].message}`);
        }
        return data.data;
    }

    async fetchTokenMetadata(tokenAddress: string): Promise<TokenMetadata> {
        const query = `
        query ($token: String!) {
          EVM(dataset: archive) {
            BalanceUpdates(
              limit: { count: 1 }
              where: {Currency: {SmartContract: {is: $token}}}
            ) {
              Currency {
                Name
                Symbol
                SmartContract
              }
              Block {
                Time
              }
            }
          }
        }
        `;

        try {
            const result = await this.query(query, { token: tokenAddress });
            const info = result.EVM?.BalanceUpdates[0];

            return {
                address: tokenAddress,
                symbol: info?.Currency?.Symbol || "UNK",
                name: info?.Currency?.Name || "Unknown",
                totalSupply: "1000000000",
                deployer: "0x0000000000000000000000000000000000000000", // MVP
                createdAt: info?.Block?.Time || new Date().toISOString()
            };
        } catch (e) {
            console.warn("V2 Metadata Fetch Failed:", e);
            return {
                address: tokenAddress,
                symbol: "ERR",
                name: "Error",
                totalSupply: "0",
                deployer: "",
                createdAt: new Date().toISOString()
            };
        }
    }

    async fetchTopHolders(tokenAddress: string, limit: number = 10): Promise<Holder[]> {
        return []; // Schema for BalanceUpdates Amount is unstable in V2 currently. Skipping for MVP.
    }

    async fetchLiquidityHistory(tokenAddress: string): Promise<LiquiditySnapshot[]> {
        // Mock implementation for MVP due to API complexity
        // In a real implementation, we would query the Pair reserves.
        return [{
            timestamp: new Date().toISOString(),
            liquidityUSD: 0
        }];
    }

    async fetchTrades(tokenAddress: string): Promise<TradeStats> {
        const query = `
        query ($token: String!) {
          EVM(dataset: archive) {
            DEXTrades(
              limit: { count: 100 }
              orderBy: { descending: Block_Time }
              where: {Trade: {Buy: {Currency: {SmartContract: {is: $token}}}}}
            ) {
              Trade {
                Buy {
                  AmountInUSD
                }
                Sell {
                    AmountInUSD
                }
              }
            }
          }
        }
        `;

        try {
            const result = await this.query(query, { token: tokenAddress });
            const trades = result.EVM?.DEXTrades || [];

            let buyVol = 0;
            let sellVol = 0; // Not tracking sells in simple MVP query
            let buyCount = 0;
            let sellCount = 0;

            trades.forEach((t: any) => {
                // Simplified MVP: Assume all returned are pertinent volume
                const amount = parseFloat(t.Trade?.Buy?.AmountInUSD || "0");
                buyVol += amount;
                buyCount++;
            });

            return {
                buyVolumeUSD: buyVol,
                sellVolumeUSD: sellVol,
                buyCount,
                sellCount
            };
        } catch (error) {
            return { buyVolumeUSD: 0, sellVolumeUSD: 0, buyCount: 0, sellCount: 0 };
        }
    }
}