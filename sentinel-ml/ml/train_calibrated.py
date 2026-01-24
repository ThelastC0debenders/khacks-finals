"""
Drift Detector Training Pipeline
Trains Isolation Forest for behavioral drift detection (Model 2)
Generates synthetic data to ensure robust anomaly detection.
"""
import os
import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import IsolationForest
from sklearn.metrics import classification_report, accuracy_score

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Drift Features (4 features)
FEATURE_COLS = [
    'Sim_RiskScore',           # Static risk score
    'Capability_Hash_Distance', # Code changes (0=Same, 1=Different)
    'Liquidity_Amount',        # Liquidity changes
    'Unique_Holders_Count'     # Holder count changes
]

def generate_drift_data(n_samples=1000):
    """Generate synthetic contract history data for drift detection"""
    print(f"Generating {n_samples} training samples for drift detection...")
    
    data = []
    
    # 1. STABLE CONTRACTS (Normal) - 90%
    for _ in range(int(n_samples * 0.9)):
        sample = {
            'Sim_RiskScore': np.random.uniform(0.0, 0.3),          # Low risk
            'Capability_Hash_Distance': 0,                        # No code change
            'Liquidity_Amount': np.random.uniform(100000, 500000),# Stable liquidity
            'Unique_Holders_Count': np.random.randint(100, 1000), # Normal holders
            'is_anomaly': 0
        }
        # Add slight natural variance
        data.append(sample)

    # 2. ANOMALIES (Drift) - 10%
    for _ in range(int(n_samples * 0.1)):
        # Randomly choose anomaly type
        drift_type = np.random.choice(['risk_spike', 'code_change', 'rug_pull'])
        
        sample = {
            'Sim_RiskScore': np.random.uniform(0.0, 0.3),
            'Capability_Hash_Distance': 0,
            'Liquidity_Amount': np.random.uniform(100000, 500000),
            'Unique_Holders_Count': np.random.randint(100, 1000),
            'is_anomaly': 1
        }
        
        if drift_type == 'risk_spike':
            sample['Sim_RiskScore'] = np.random.uniform(0.7, 1.0)
        elif drift_type == 'code_change':
            sample['Capability_Hash_Distance'] = 1
        elif drift_type == 'rug_pull':
            sample['Liquidity_Amount'] = np.random.uniform(0, 1000) # Liquidity drained
            
        data.append(sample)

    df = pd.DataFrame(data)
    return df

def train_drift_model():
    print("\n" + "="*60)
    print("TRAINING DRIFT DETECTOR (Isolation Forest)")
    print("="*60)
    
    # Generate data
    df = generate_drift_data(n_samples=1000)
    
    # Save to disk
    data_path = os.path.join(BASE_DIR, "data", "processed", "drift_dataset.csv")
    os.makedirs(os.path.dirname(data_path), exist_ok=True)
    df.to_csv(data_path, index=False)
    print(f"✓ Saved drift dataset to: {data_path}")
    
    X = df[FEATURE_COLS]
    y = df['is_anomaly']
    
    # Train Isolation Forest on mostly normal data
    # Contamination set to 0.1 matches our generation ratio
    model = IsolationForest(
        contamination=0.1,
        random_state=42,
        n_estimators=100
    )
    
    model.fit(X)
    
    # Evaluate
    predictions = model.predict(X) # 1 for normal, -1 for anomaly
    predictions_binary = (predictions == -1).astype(int)
    
    print("\nClassification Report:")
    print(classification_report(y, predictions_binary, target_names=['Normal', 'Anomaly']))
    
    # Test specific cases
    print("\n" + "-"*60)
    print("DRIFT SCENARIO TEST")
    print("-"*60)
    
    rug_pull = pd.DataFrame([{
        'Sim_RiskScore': 0.1,
        'Capability_Hash_Distance': 0,
        'Liquidity_Amount': 100.0, # Drained
        'Unique_Holders_Count': 500
    }])
    
    pred = model.predict(rug_pull)[0] # -1 = Anomaly
    print(f"Rug Pull (Liquidity Drop): {'Anomaly (-1)' if pred == -1 else 'Normal (1)'} {'✅' if pred == -1 else '❌'}")
    
    code_change = pd.DataFrame([{
        'Sim_RiskScore': 0.1,
        'Capability_Hash_Distance': 1, # Changed
        'Liquidity_Amount': 200000.0,
        'Unique_Holders_Count': 500
    }])
    pred_cc = model.predict(code_change)[0]
    print(f"Code Change: {'Anomaly (-1)' if pred_cc == -1 else 'Normal (1)'} {'✅' if pred_cc == -1 else '❌'}")

    
    # Save model
    models_dir = os.path.join(BASE_DIR, "models")
    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, "drift_detector.pkl")
    joblib.dump(model, model_path)
    print(f"\n✓ Model saved to: {model_path}")

if __name__ == "__main__":
    train_drift_model()
