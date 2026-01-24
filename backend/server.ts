import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { EvmExecutor } from "./src/evm/EvmExecutor.js";
import { RedisClient } from "./src/services/RedisClient.js";
import { ScanHistory } from "./src/services/ScanHistory.js";

// @ts-ignore
BigInt.prototype.toJSON = function () { return this.toString(); };


// Load .env from root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, ".env");

console.log("[Setup] CWD:", process.cwd());
console.log("[Setup] Loading .env from:", envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.warn("[Setup] Failed to load .env via dotenv:", result.error.message);
} else {
    console.log("[Setup] .env loaded successfully via dotenv");
}

console.log("[Setup] ALCHEMY_API_KEY is set:", !!process.env.ALCHEMY_API_KEY);
if (process.env.ALCHEMY_API_KEY) {
    console.log("[Setup] Alchemy Key (first 5 chars):", process.env.ALCHEMY_API_KEY.substring(0, 5) + "...");
}

const app = express();
app.use(express.json());
app.use(cors());

// Debug Middleware
app.use((req, res, next) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (req.body && Object.keys(req.body).length > 0) {
        console.error("Body:", JSON.stringify(req.body).slice(0, 100) + "...");
    }
    next();
});

const executor = new EvmExecutor();

// Initialize Redis connection (non-blocking)
(async () => {
    try {
        await RedisClient.connect();
        console.log("[Setup] Redis connected successfully");
    } catch (err: any) {
        console.warn("[Setup] Redis connection failed (scan history will be disabled):", err.message);
    }
})();

// Optional: Reset fork on startup if env var exists
if (process.env.MAINNET_RPC_URL) {
    executor.resetFork(process.env.MAINNET_RPC_URL)
        .then(() => console.log("Fork initialized"))
        .catch(err => console.error("Fork init failed", err));
}

app.post("/rpc", async (req, res) => {
    const { method, params, id } = req.body;

    if (method === "sentinel_analyze") {
        try {
            const [transaction, chainId] = params;
            console.log(`Analyzing tx on chain ${chainId}:`, transaction);

            // 1. Simulate & Analyze (Raw EVM)
            const payload = await executor.simulateTransaction(transaction, chainId);
            console.log("Generated Payload:", payload);

            res.json({
                jsonrpc: "2.0",
                id,
                result: payload
            });
        } catch (error: any) {
            console.error("❌ Simulation Error:", error.message);
            return res.json({
                jsonrpc: "2.0",
                id,
                error: {
                    code: -32000,
                    message: error.message || "Simulation failed"
                }
            });
        }
    } else {
        res.status(404).send("Method not found");
    }
});

// ===== Scan History REST API =====

// GET /history/:address - Get scan history for a contract
app.get("/history/:address", async (req, res) => {
    try {
        const { address } = req.params;
        const limit = parseInt(req.query.limit as string) || 10;

        const history = await ScanHistory.getHistory(address, limit);
        res.json({
            success: true,
            address: address.toLowerCase(),
            count: history.length,
            history
        });
    } catch (error: any) {
        console.error("History fetch error:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch history"
        });
    }
});

// GET /history/:address/latest - Get most recent scan
app.get("/history/:address/latest", async (req, res) => {
    try {
        const { address } = req.params;
        const latest = await ScanHistory.getLatestScan(address);

        if (!latest) {
            res.status(404).json({
                success: false,
                error: "No scan history found for this address"
            });
            return;
        }

        res.json({
            success: true,
            address: address.toLowerCase(),
            scan: latest
        });
    } catch (error: any) {
        console.error("Latest scan fetch error:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch latest scan"
        });
    }
});

// GET /drift - Get contracts with behavioral drift
app.get("/drift", async (req, res) => {
    try {
        const minDelta = parseInt(req.query.minDelta as string) || 20;
        const contracts = await ScanHistory.getContractsWithDrift(minDelta);

        res.json({
            success: true,
            minRiskDelta: minDelta,
            count: contracts.length,
            contracts
        });
    } catch (error: any) {
        console.error("Drift fetch error:", error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to fetch drift data"
        });
    }
});

// Health check
app.get("/health", async (req, res) => {
    const redisConnected = await RedisClient.isConnected();
    res.json({
        status: "ok",
        redis: redisConnected ? "connected" : "disconnected",
        timestamp: new Date().toISOString()
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend RPC listening on port ${PORT}`);
});

// Keep process alive hack for Hardhat + tsx interaction
setInterval(() => { }, 1000);

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
});
