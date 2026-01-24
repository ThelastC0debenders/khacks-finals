import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";


// Load .env from root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../.env");

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
    console.error("Body:", JSON.stringify(req.body).slice(0, 100) + "...");
    next();
});



app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(cors());

// Debug Middleware
app.use((req, res, next) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.error("Body:", JSON.stringify(req.body).slice(0, 100) + "...");
    next();
});

const executor = new EvmExecutor();


if (process.env.MAINNET_RPC_URL) {
    executor.resetFork(process.env.MAINNET_RPC_URL)
        .then(() => console.log("Fork initialized"))
        .catch(err => console.error("Fork init failed", err));
}

app.post("/rpc", async (req, res) => {
    const { method, params, id } = req.body;

    if (method === 'sentinel_analyze') {
        const [transaction, chainId] = params;
        console.log(`Analyzing tx on chain ${chainId}:`, transaction);

        // 1. Simulate & Analyze (Raw EVM)
        const payload = await executor.simulateTransaction(transaction, chainId);
        console.log("Generated Payload:", payload);

        res.json({
            result: payload
        });
    } catch (error: any) {
        console.error("❌ Simulation Error:", error.message);
        return res.json({
            console.error("Simulation error:", error);
            res.json({
                jsonrpc: "2.0",
                id,
                error: { message: "Internal Simulation Error", details: error.message }
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

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend RPC listening on port ${PORT}`);
});

// Keep process alive hack for Hardhat + tsx interaction
setInterval(() => { }, 1000);

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
});