
export enum ScamType {
    LIQUIDITY_RUG = "Liquidity Rug",
    SOFT_RUG = "Soft Rug",
    MINT_RUG = "Mint Rug",
    HONEYPOT = "Honeypot",
    LOW_RISK = "Low Risk",
    UNKNOWN = "Unknown"
}

export interface RiskAnalysisResult {
    riskScore: number;
    scamType: ScamType;
    reasons: string[];
    lastUpdated: string;
}

export interface TokenMetadata {
    address: string;
    deployer: string;
    createdAt: string; // ISO date
    totalSupply: string;
    symbol: string;
    name: string;
}

export interface Holder {
    address: string;
    balance: string;
}

export interface LiquiditySnapshot {
    timestamp: string;
    liquidityUSD: number;
}

export interface TradeStats {
    buyVolumeUSD: number;
    sellVolumeUSD: number;
    buyCount: number;
    sellCount: number;
}