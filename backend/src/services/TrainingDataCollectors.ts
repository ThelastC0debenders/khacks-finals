/**
 * Training Data Collector v2.0
 * Collects continuous feature vectors and labels from scans for ML model retraining
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Training data file path
const TRAINING_DATA_PATH = path.resolve(__dirname, '../../../sentinel-ml/data/training_samples_v2.json');

// Continuous feature interface (matches MLService.ts)
interface ContinuousFeatures {
    sim_success_rate: number;
    owner_privilege_ratio: number;
    time_variance_score: number;
    gated_branch_ratio: number;
    mint_transfer_ratio: number;
    suspicious_opcode_density: number;
    proxy_depth_normalized: number;
    sload_density: number;
    bytecode_entropy: number;
    counterfactual_risk: number;
    time_bomb_risk: number;
    gas_anomaly_score: number;
    security_report_risk: number;
    flag_density: number;
    revert_rate: number;
}

interface TrainingSample {
    timestamp: number;
    contractAddress: string;
    chainId: number;
    features: ContinuousFeatures;
    label: number;  // Soft label 0.0-1.0 (probability of being scam)
    ruleBasedVerdict: {
        isHoneypot: boolean;
        isScam: boolean;
        riskScore: number;
        hasOwnerPrivileges: boolean;
    };
}

export class TrainingDataCollector {
    private static samples: TrainingSample[] = [];
    private static initialized = false;

    /**
     * Initialize by loading existing training data
     */
    static initialize(): void {
        if (this.initialized) return;

        try {
            // Ensure directory exists
            const dir = path.dirname(TRAINING_DATA_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Load existing data
            if (fs.existsSync(TRAINING_DATA_PATH)) {
                const data = fs.readFileSync(TRAINING_DATA_PATH, 'utf-8');
                this.samples = JSON.parse(data);
                console.log(`[TrainingData] Loaded ${this.samples.length} existing samples`);
            } else {
                this.samples = [];
                console.log("[TrainingData] Starting with empty dataset");
            }
            this.initialized = true;
        } catch (err: any) {
            console.warn("[TrainingData] Failed to load existing data:", err.message);
            this.samples = [];
            this.initialized = true;
        }
    }

    /**
     * Collect a training sample from scan results
     * Uses soft labels based on rule-based confidence
     */
    static collect(
        contractAddress: string,
        chainId: number,
        features: ContinuousFeatures,
        securityReport: any,
        advancedAnalysis: any
    ): void {
        this.initialize();

        // Calculate soft label based on multiple signals
        let scamProbability = 0;

        // Strong signals
        if (securityReport?.isHoneypot) scamProbability += 0.35;
        if (advancedAnalysis?.isScam) scamProbability += 0.25;
        if (advancedAnalysis?.counterfactual?.isHoneypot) scamProbability += 0.2;
        if (advancedAnalysis?.counterfactual?.hasOwnerPrivileges) scamProbability += 0.15;

        // Weak signals
        const riskScore = securityReport?.riskScore ?? 0;
        scamProbability += (riskScore / 100) * 0.2;

        // Clip to valid range
        scamProbability = Math.min(1, Math.max(0, scamProbability));

        const sample: TrainingSample = {
            timestamp: Date.now(),
            contractAddress: contractAddress.toLowerCase(),
            chainId,
            features,
            label: scamProbability,  // Soft label
            ruleBasedVerdict: {
                isHoneypot: securityReport?.isHoneypot ?? false,
                isScam: advancedAnalysis?.isScam ?? false,
                riskScore: securityReport?.riskScore ?? 0,
                hasOwnerPrivileges: advancedAnalysis?.counterfactual?.hasOwnerPrivileges ?? false
            }
        };

        // Add to samples (avoid duplicates for same contract in last hour)
        const existingIdx = this.samples.findIndex(s =>
            s.contractAddress === sample.contractAddress &&
            s.timestamp > Date.now() - 3600000 // 1 hour
        );

        if (existingIdx >= 0) {
            // Update existing sample
            this.samples[existingIdx] = sample;
        } else {
            this.samples.push(sample);
        }

        // Save to disk
        this.save();

        const verdict = scamProbability > 0.5 ? "SCAM" : "SAFE";
        console.log(`[TrainingData] Collected sample: ${contractAddress} -> ${verdict} (prob: ${(scamProbability * 100).toFixed(1)}%, ${this.samples.length} total)`);
    }

    /**
     * Save training data to disk
     */
    private static save(): void {
        try {
            fs.writeFileSync(TRAINING_DATA_PATH, JSON.stringify(this.samples, null, 2));
        } catch (err: any) {
            console.warn("[TrainingData] Failed to save:", err.message);
        }
    }

    /**
     * Get all collected samples
     */
    static getSamples(): TrainingSample[] {
        this.initialize();
        return this.samples;
    }

    /**
     * Get samples ready for model training (features and soft labels)
     */
    static getTrainingData(): { features: number[][]; labels: number[] } {
        this.initialize();

        const features: number[][] = [];
        const labels: number[] = [];

        for (const sample of this.samples) {
            features.push([
                sample.features.sim_success_rate,
                sample.features.owner_privilege_ratio,
                sample.features.time_variance_score,
                sample.features.gated_branch_ratio,
                sample.features.mint_transfer_ratio,
                sample.features.suspicious_opcode_density,
                sample.features.proxy_depth_normalized,
                sample.features.sload_density,
                sample.features.bytecode_entropy,
                sample.features.counterfactual_risk,
                sample.features.time_bomb_risk,
                sample.features.gas_anomaly_score,
                sample.features.security_report_risk,
                sample.features.flag_density,
                sample.features.revert_rate
            ]);
            labels.push(sample.label);
        }

        return { features, labels };
    }

    /**
     * Get statistics about collected data
     */
    static getStats(): { total: number; scams: number; safe: number; avgProbability: number } {
        this.initialize();
        const scams = this.samples.filter(s => s.label > 0.5).length;
        const avgProb = this.samples.length > 0
            ? this.samples.reduce((sum, s) => sum + s.label, 0) / this.samples.length
            : 0;
        return {
            total: this.samples.length,
            scams,
            safe: this.samples.length - scams,
            avgProbability: avgProb
        };
    }
}
