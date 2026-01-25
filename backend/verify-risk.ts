import dotenv from "dotenv";
import { RiskEngine } from "./src/risk/RiskEngine.ts";

dotenv.config({ path: "../.env" });

async function verify() {
    console.log("Verifying Risk Engine...");
    const engine = new RiskEngine();

    // Test with USDT (should consistenly exist)
    const token = "0xdac17f958d2ee523a2206206994597c13d831ec7";

    try {
        console.log(`Analyzing ${token}...`);
        const result = await engine.analyzeToken(token);
        console.log("Analysis Result:");
        console.log(JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error("Verification Failed:", e);
    }
}

verify();