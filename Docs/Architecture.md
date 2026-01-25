# System Architecture

## 1. System Overview

Sentinel Security operates as a **pre-execution firewall** for crypto transactions. Unlike wallet providers that rely on simple blocklists, Sentinel performs a **dynamic runtime simulation** of every transaction before it is signed.

The system is composed of three primary subsystems:
1.  **The Intercept Layer** (MetaMask Snap): Captures the user's intent.
2.  **The Analysis Core** (Node.js Backend): The heavy lifting engine that forks the blockchain.
3.  **The Intelligence Layer** (Python ML Service): Provides probabilistic risk assessment.

## 2. Detailed Architecture Diagram

```mermaid
graph TD
    %% Users and Inputs
    User([User]) -->|"Initiates Tx"| Wallet[MetaMask]
    Wallet -->|Intercept| Snap[Sentinel Snap]
    
    %% Snap Interaction
    Snap -->|"RPC: sentinel_analyze"| API_Gateway[Backend API Gateway]
    
    %% Backend Core
    subgraph Backend_Core [Backend (Node.js/Express)]
        API_Gateway -->|"Request ID"| Controller[Analysis Controller]
        
        %% Data Fetching
        Controller -->|"1. Fetch Code"| RPC[RPC Provider (Alchemy)]
        Controller -->|"2. Check Cache"| Redis[(Redis Cache)]
        
        %% Simulation Engine
        Controller -->|"3. Simulate"| EVM_Orchestrator[EVM Orchestrator]
        EVM_Orchestrator -->|"Fork State"| LocalChain[Local EVM Fork]
        
        LocalChain --> BasicSim[Basic Simulation]
        LocalChain --> TimeSim[Time-Travel Sim]
        LocalChain --> ActorSim[Counterfactual Sim]
        LocalChain --> Trace[Opcode Tracer]
        
        %% Static Analysis
        Controller -->|"4. Analyze"| Static[Static Analyzers]
        Static --> ProxyDetect[Proxy Detector]
        Static --> CodeScan[Bytecode Scanner]
    end
    
    %% Intelligence Layer
    subgraph Intelligence [Python ML Service]
        Controller -->|"5. Feature Vector"| API_ML[FastAPI Endpoint]
        API_ML -->|Inference| XGBoost[XGBoost Model]
        API_ML -->|Calibrate| Isotonic[Isotonic Calibrator]
        XGBoost -->|"Risk Score"| API_ML
    end
    
    %% Output
    API_ML -->|Score| Controller
    Controller -->|"Aggregate Verdict"| API_Gateway
    API_Gateway -->|"JSON Response"| Snap
    Snap -->|"Render UI"| Wallet
```

## 3. Core Components Deep Dive

### A. EVM Executor (The "Simulator")
*   **Technology**: `@ethereumjs/evm`
*   **Role**: Creates an isolated, sandbox version of the blockchain.
*   **Why specific?**: We chose a raw EVM implementation over `eth_call` because it gives us **God-mode control**. We can:
    *   Change the block timestamp (Time-Travel).
    *   Impersonate any account (Counterfactuals).
    *   Inspect individual opcode execution steps (Tracing).
    *   *None of this is possible with standard RPC calls.*

### B. Machine Learning Engine (The "Brain")
*   **Technology**: Python, FastAPI, XGBoost, Scikit-learn
*   **Role**: Converts simulation metrics into a probability score.
*   **Key Features**:
    *   **Calibration**: Ensures a "70%" risk score actually means a 70% probability of being a scam.
    *   **Ensemble**: Combines rule-based flags (e.g., "Permissions Denied") with statistical anomalies (e.g., "High Opcode Entropy").

### C. The Snap (The "Shield")
*   **Technology**: TypeScript, MetaMask Snaps SDK
*   **Role**: The user interface. It works inside the wallet, protecting the user at the exact moment of danger.
*   **Design**: Zero-click. It activates automatically when a transaction is proposed.

## 4. Design Decisions & Trade-offs

| Decision | Choice | Rationale | Trade-off |
|----------|--------|-----------|-----------|
| **Simulation** | Local EVM Fork | Allows opcode tracing & time manipulation. | Higher CPU usage per request than simple RPC calls. |
| **History** | Redis | Microsecond latency for drift detection. | RAM limited; requires eviction policy for scale. |
| **ML Model** | XGBoost | Best performance on tabular feature data. | Requires Python runtime alongside Node.js. |
| **Network** | HTTP JSON-RPC | Standard compatibility with Snaps. | Adds slight network overhead vs internal calls. |
