"""
Ensemble Model Training Pipeline
Trains both Model 1 (XGBoost Classifier) and Model 2 (Isolation Forest Drift Detector)
"""
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import IsolationForest
from sklearn.metrics import classification_report, accuracy_score
import xgboost as xgb
import os

# Define base dir
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def train_scam_classifier():
    """Train Model 1: XGBoost Scam Classifier"""
    print("\n" + "="*60)
    print("TRAINING MODEL 1: SCAM CLASSIFIER (XGBoost)")
    print("="*60)
    
    # Load dataset
    data_path = os.path.join(BASE_DIR, "data", "processed", "classifier_dataset.csv")
    df = pd.read_csv(data_path)
    
    # Define feature columns (10 features as per spec)
    feature_cols = [
        'Sim_UserResult', 'Sim_OwnerDiff', 'Sim_TimeInstability', 'Gas_Usage',
        'Opcode_SloadCount', 'Has_Blacklist_Sig', 'Has_Mint_Sig', 'Proxy_Depth',
        'Contract_Age_Hours', 'Deployer_Risk_Score'
    ]
    
    X = df[feature_cols]
    y = df['label']
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    print(f"\nDataset Split:")
    print(f"  Training: {len(X_train)} samples")
    print(f"  Testing: {len(X_test)} samples")
    
    # Train XGBoost
    model = xgb.XGBClassifier(
        max_depth=6,
        learning_rate=0.1,
        n_estimators=100,
        objective='binary:logistic',
        eval_metric='logloss',
        random_state=42
    )
    
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]
    
    print("\n" + "-"*60)
    print("EVALUATION RESULTS:")
    print("-"*60)
    print(f"Accuracy: {accuracy_score(y_test, y_pred):.4f}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=['Safe', 'Scam']))
    
    # Save model
    model_path = os.path.join(BASE_DIR, "models", "scam_classifier.json")
    model.save_model(model_path)
    print(f"\n✓ Model saved to: {model_path}")
    
    return model

def train_drift_detector():
    """Train Model 2: Isolation Forest Drift Detector"""
    print("\n" + "="*60)
    print("TRAINING MODEL 2: DRIFT DETECTOR (Isolation Forest)")
    print("="*60)
    
    # Load dataset
    data_path = os.path.join(BASE_DIR, "data", "processed", "drift_dataset.csv")
    df = pd.read_csv(data_path)
    
    # Define feature columns (4 features for drift detection)
    feature_cols = [
        'Sim_RiskScore', 'Capability_Hash_Distance', 
        'Liquidity_Amount', 'Unique_Holders_Count'
    ]
    
    X = df[feature_cols]
    y = df['is_anomaly']  # 0 = normal, 1 = anomaly
    
    print(f"\nDataset Info:")
    print(f"  Total samples: {len(X)}")
    print(f"  Normal: {sum(y == 0)}, Anomaly: {sum(y == 1)}")
    
    # Train Isolation Forest on normal data only
    X_normal = X[y == 0]
    
    model = IsolationForest(
        contamination=0.1,  # Expect 10% anomalies
        random_state=42,
        n_estimators=100
    )
    
    model.fit(X_normal)
    
    # Evaluate on full dataset
    predictions = model.predict(X)  # Returns 1 for normal, -1 for anomaly
    
    # Convert to binary (0 = normal, 1 = anomaly)
    predictions_binary = (predictions == -1).astype(int)
    
    print("\n" + "-"*60)
    print("EVALUATION RESULTS:")
    print("-"*60)
    print(f"Accuracy: {accuracy_score(y, predictions_binary):.4f}")
    print("\nClassification Report:")
    print(classification_report(y, predictions_binary, target_names=['Normal', 'Anomaly']))
    
    # Save model using joblib
    import joblib
    model_path = os.path.join(BASE_DIR, "models", "drift_detector.pkl")
    joblib.dump(model, model_path)
    print(f"\n✓ Model saved to: {model_path}")
    
    return model

if __name__ == "__main__":
    print("\nSENTINEL-ML ENSEMBLE TRAINING PIPELINE")
    print("="*60)
    
    # Train both models
    classifier = train_scam_classifier()
    drift_detector = train_drift_detector()
    
    print("\n" + "="*60)
    print("✓ TRAINING COMPLETE!")
    print("="*60)
    print("\nNext Steps:")
    print("  1. Run export_models.py to convert to ONNX")
    print("  2. Integrate into Rust API for inference")
