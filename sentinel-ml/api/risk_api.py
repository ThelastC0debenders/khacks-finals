"""
Sentinel-ML Deep Scan API v2.0
Calibrated, uncertainty-aware scam detection
"""
from fastapi import FastAPI
import joblib
import numpy as np
import os
import json

app = FastAPI(title="Sentinel-ML Deep Scan API", version="2.0-calibrated")

# Define base dir relative to this script: api/ -> sentinel-ml/
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Load feature schema
schema_path = os.path.join(BASE_DIR, "models", "feature_schema.json")
with open(schema_path, 'r') as f:
    FEATURE_SCHEMA = json.load(f)
FEATURE_COLS = FEATURE_SCHEMA['features']

# Load Model 1: Calibrated Scam Classifier
calibrated_path = os.path.join(BASE_DIR, "models", "calibrated_classifier.pkl")
scam_classifier = joblib.load(calibrated_path)

# Load Model 2: Drift Detector (Isolation Forest) - unchanged
drift_detector_path = os.path.join(BASE_DIR, "models", "drift_detector.pkl")
drift_detector = joblib.load(drift_detector_path)


@app.get("/")
def root():
    return {
        "service": "Sentinel-ML Deep Scan API",
        "version": "2.0-calibrated",
        "model_version": FEATURE_SCHEMA.get('version', 'unknown'),
        "calibration": FEATURE_SCHEMA.get('calibration', 'none'),
        "features": len(FEATURE_COLS),
        "endpoints": {
            "/analyze": "Deep Scan (15 continuous features, calibrated)",
            "/check_drift": "Drift Detection (4 features)"
        }
    }


@app.post("/analyze")
def deep_scan(data: dict):
    """
    Deep Scan Endpoint - Calibrated Ensemble Analysis
    
    Input Schema (15 continuous features, all 0.0-1.0):
    {
        "sim_success_rate": float,           # % simulations successful
        "owner_privilege_ratio": float,      # % owner-only paths
        "time_variance_score": float,        # Time restriction severity
        "gated_branch_ratio": float,         # % access-controlled branches
        "mint_transfer_ratio": float,        # mint/transfer ratio
        "suspicious_opcode_density": float,  # Suspicious opcodes density
        "proxy_depth_normalized": float,     # Proxy depth normalized
        "sload_density": float,              # SLOAD per 100 instructions
        "bytecode_entropy": float,           # Shannon entropy normalized
        "counterfactual_risk": float,        # From actor comparison
        "time_bomb_risk": float,             # From time-travel sim
        "gas_anomaly_score": float,          # Normalized gas difference
        "security_report_risk": float,       # riskScore / 100
        "flag_density": float,               # flags / max_flags
        "revert_rate": float                 # % actors reverted
    }
    
    Output:
    {
        "scam_probability": float,      # Calibrated probability (0.0-1.0)
        "calibrated": true,
        "confidence_interval": [low, high],
        "uncertainty": float,           # Based on prediction variance
        "verdict": "SAFE" | "WARN" | "BLOCK",
        "reason": string,
        "model_version": string
    }
    """
    # Extract features in the correct order
    features = []
    for col in FEATURE_COLS:
        value = data.get(col, 0.0)
        # Ensure value is in valid range
        value = max(0.0, min(1.0, float(value)))
        features.append(value)
    
    classifier_features = np.array([features], dtype=np.float32)
    
    # Get calibrated probability
    scam_prob = scam_classifier.predict_proba(classifier_features)[0][1]
    
    # Calculate uncertainty based on distance from decision boundary
    # Probabilities near 0.5 have higher uncertainty
    uncertainty = 1.0 - abs(scam_prob - 0.5) * 2
    
    # Confidence interval (simple approximation)
    # Width increases with uncertainty
    ci_width = 0.1 + uncertainty * 0.15
    ci_low = max(0.0, scam_prob - ci_width / 2)
    ci_high = min(1.0, scam_prob + ci_width / 2)
    
    # Verdict based on calibrated probability thresholds
    # These thresholds are applied AFTER probability estimation
    if scam_prob > 0.7:
        verdict = "BLOCK"
        reason = generate_reason(data, "high_risk")
    elif scam_prob > 0.4:
        verdict = "WARN"
        reason = generate_reason(data, "medium_risk")
    else:
        verdict = "SAFE"
        reason = generate_reason(data, "low_risk")
    
    return {
        "verdict": verdict,
        "scam_probability": round(float(scam_prob), 4),
        "calibrated": True,
        "confidence_interval": [round(ci_low, 3), round(ci_high, 3)],
        "uncertainty": round(float(uncertainty), 3),
        "risk_band": "HIGH" if scam_prob > 0.6 else "MEDIUM" if scam_prob > 0.3 else "LOW",
        "reason": reason,
        "model_version": FEATURE_SCHEMA.get('version', 'calibrated-v2.0')
    }


def generate_reason(data: dict, risk_level: str) -> str:
    """Generate human-readable reason based on top risk factors"""
    factors = []
    
    if data.get('owner_privilege_ratio', 0) > 0.5:
        factors.append("owner-restricted execution paths")
    if data.get('time_variance_score', 0) > 0.5:
        factors.append("time-based restrictions")
    if data.get('gated_branch_ratio', 0) > 0.5:
        factors.append("access-gated branches")
    if data.get('counterfactual_risk', 0) > 0.5:
        factors.append("counterfactual risk detected")
    if data.get('gas_anomaly_score', 0) > 0.5:
        factors.append("gas usage anomalies")
    if data.get('revert_rate', 0) > 0.7:
        factors.append("high revert rate")
    if data.get('sim_success_rate', 1) < 0.3:
        factors.append("low simulation success")
    
    if risk_level == "high_risk":
        if factors:
            return f"High risk detected: {', '.join(factors[:3])}"
        return "High risk - multiple risk indicators present"
    elif risk_level == "medium_risk":
        if factors:
            return f"Moderate risk: {', '.join(factors[:2])}"
        return "Moderate risk - some risk indicators present"
    else:
        return "Low risk - no significant issues detected"


@app.post("/check_drift")
def check_drift(data: dict):
    """
    Drift Detection Endpoint (unchanged from v1)
    
    Input Schema (4 features):
    {
        "Sim_RiskScore": float,
        "Capability_Hash_Distance": 0 or 1,
        "Liquidity_Amount": float,
        "Unique_Holders_Count": int
    }
    """
    drift_features = np.array([[
        data["Sim_RiskScore"],
        data["Capability_Hash_Distance"],
        data["Liquidity_Amount"],
        data["Unique_Holders_Count"]
    ]], dtype=np.float32)
    
    # Model 2: Drift Detector
    # Returns 1 for normal, -1 for anomaly
    prediction = drift_detector.predict(drift_features)[0]
    is_anomaly = (prediction == -1)
    
    return {
        "is_anomaly": bool(is_anomaly),
        "verdict": "WARN - Behavior Changed" if is_anomaly else "Normal",
        "anomaly_score": int(prediction),
        "message": "Contract behavior has changed unexpectedly" if is_anomaly else "Behavior is consistent with historical patterns"
    }


@app.get("/health")
def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": scam_classifier is not None,
        "version": FEATURE_SCHEMA.get('version', 'unknown')
    }
