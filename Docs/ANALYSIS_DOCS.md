# Sentinel System Architecture: Deep Dive

This document details the core analysis capabilities of the Sentinel security system, explaining how we achieve state-of-the-art scam detection through a multi-layered approach involving EVM simulation, ML calibration, and advanced counterfactual testing.

---

## 1. Raw EVM Simulation (`EvmExecutor.ts`)

At the heart of our system is a custom **Forked EVM Simulation**. We do not rely on standard RPC gas estimates, which are often manipulated by scammers. Instead, we:

*   **Fork the Blockchain**: We create a local, isolated instance of the Ethereum Virtual Machine (EVM) using `@ethereumjs/evm`.
*   **State Injection**: We download the target contract's bytecode and storage slots from the live chain and inject them into our local EVM.
*   **Execution Tracing**: We run the user's transaction in this isolated environment. This allows us to see *exactly* what opcodes are executed, even if the transaction fails on-chain.
*   **Risk**: We can detect if the code tries to read `block.timestamp` (Time Locks), checks `msg.sender` against hardcoded lists (Whitelists), or executes hidden code via `DELEGATECALL` (Proxies).

---

## 2. Machine Learning Calibration (`MLService.ts` & `train_calibrated.py`)

We don't just return a "Scam/Safe" boolean. We provide a **Calibrated Probability Score**.

*   **Continuous Features**: We extract continuous signals from the simulation (e.g., "Sim Success Rate", "Owner Privilege Ratio", "Bytecode Entropy").
*   **XGBoost Classifier**: We use an XGBoost model, known for its performance on structured data.
*   **Isotonic Calibration**: Raw ML scores are often uncalibrated (e.g., a "0.7" score doesn't mean a 70% chance of scam). We apply **Isotonic Regression** to map raw scores to true probabilities.
    *   *Result*: A score of **98.8%** means that historically, 98.8% of contracts with similar features were scams. This gives users a realistic confidence interval (e.g., `±2%`).

---

## 3. Time Series Risk Simulation (`AdvancedSimulator.ts`)

Scammers often create "Time Bombs" that work fine now but lock up later (e.g., 24 hours after launch).

*   **Methodology**: We run the *exact same transaction* multiple times, but we manipulate the EVM's `block.timestamp`.
*   **Offsets Tested**:
    *   Current Block (Now)
    *   +1 Hour
    *   +1 Day
    *   +7 Days
    *   +30 Days
*   **Detection**: If a transaction succeeds Now but **Reverts** at `+1 Day`, we scream **"TIME BOMB DETECTED"**. This is how we catch delayed honeypots.

---

## 4. Counterfactual Simulation (`CounterfactualSim` in `AdvancedSimulator.ts`)

The most powerful definition of a Honeypot is: *"A contract where YOU cannot sell, but the OWNER can."*

*   **The Problem**: A single simulation only tells us if *you* can sell. It doesn't prove it's a scam (maybe trading is just paused for everyone).
*   **The Solution**: We simulate the transaction from **multiple perspectives** simultaneously:
    1.  **You (Current User)**
    2.  **The Owner** (using `owner()` address fetched from chain)
    3.  **A Random User**
*   **Privilege Check**:
    *   If **You: Fail** AND **Owner: Success** -> **HONEYPOT CONFIRMED**.
    *   If **You: Fail** AND **Owner: Fail** -> Likely just paused or broken (safer).
    *   This "Differential Analysis" is the smoking gun for sophisticated scams.

---

## 5. Behavioral Drift Detection (`ScanHistory.ts`)

Contracts change over time. A contract that was "Safe" yesterday might be malicious today.

*   **Tracking**: We store every scan result in Redis, indexed by contract address.
*   **Drift Calculation**: When you scan a contract, we compare its current Risk Score to its *previous* scan.
*   **Alerting**:
    *   If Risk Score jumps (e.g., `0 -> 100`), we flag **"Sudden Behavioral Drift"**.
    *   This detects **Rug Pulls** (liquidity removed) and **Upgradable Proxy Attacks** (logic implementation changed to malicious code).

---

### Summary of Data Flow

1.  **User Trigger**: Transaction initiated in MetaMask Snap.
2.  **EVM Fork**: Backend creates local fork, injects contract, runs simulations (Current Time).
3.  **Advanced Sim**: Backend runs Time-Travel (+1h, +1d...) and Counterfactual (User vs Owner).
4.  **Feature Extraction**: Calculates `sim_success_rate`, `churn`, `entropy`.
5.  **ML Inference**: Python API calculates probability `P(Scam | Features)`.
6.  **Drift Check**: Redis compares `P_current` vs `P_historic`.
7.  **Final Verdict**: Aggregates all signals into a `BLOCK/WARN/SAFE` decision displayed in the Snap UI.
