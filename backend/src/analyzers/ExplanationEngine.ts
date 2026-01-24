
import { TraceResult } from './OpcodeTracer.js';

export interface Explanation {
    title: string;
    story: string; // The "No-Jargon" story
    severity: 'High' | 'Medium' | 'Low' | 'Safe';
}

export class ExplanationEngine {

    static generateExplanation(trace: TraceResult, simulationStatus: string): Explanation {

        // Default safe state
        let explanation: Explanation = {
            title: "Security Check Passed",
            story: "No suspicious mechanisms detected during execution.",
            severity: "Safe"
        };

        if (simulationStatus.startsWith("Reverted")) {
            return this.explainRevert(trace);
        }

        // Detect Time Logic (even if success)
        if (trace.usesTimestamp) {
            explanation = {
                title: "Time-Sensitive Logic Detected",
                story: "The contract checks the current time. It might be locked until a specific date.",
                severity: "Medium"
            };
        }

        return explanation;
    }

    private static explainRevert(trace: TraceResult): Explanation {
        // Did it revert after checking WHO sent it?
        if (trace.usesMsgSender || trace.usesTxOrigin) {
            // Heuristic: If we saw Sender -> Storage Read -> Revert, it's likely a Whitelist or Owner check
            const lastEvents = trace.events.slice(-5);
            const hasStorageCheck = lastEvents.some(e => e.includes("CHECK: Storage read"));

            if (hasStorageCheck) {
                return {
                    title: "Access Denied (Whitelist/Owner)",
                    story: "❌ The contract checked who you are and blocked the transaction. It likely requires you to be on a private 'Whitelist' or be the Owner.",
                    severity: "High"
                };
            }

            return {
                title: "Sender Restriction",
                story: "❌ The contract blocked your address. Specific reason unclear, but it discriminates based on who sends the transaction.",
                severity: "Medium"
            };
        }

        // Did it revert after checking TIME?
        if (trace.usesTimestamp) {
            return {
                title: "Time-Lock Active",
                story: "❌ The contract checked the time and decided it's too early (or too late) to trade.",
                severity: "High"
            };
        }

        return {
            title: "Transaction Failed",
            story: "❌ The transaction reverted. This might be a standard error, or a hidden blocking mechanism.",
            severity: "Low"
        };
    }
}
