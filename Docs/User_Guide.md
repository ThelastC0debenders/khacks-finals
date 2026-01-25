# User Guide

## Getting Started

1.  **Install the Snap**: Visit the Snap test page (usually `http://localhost:8000` if running the template site, or via MetaMask Settings -> Snaps -> Local if developing).
2.  **Connect Wallet**: Approve the permission request.
3.  **Perform a Transaction**: Send a test transaction on a supported network (or Localhost 8545).

## Interpreting Analysis Results

When you initiate a transaction, the Sentinel Snap will pop up.

### Risk Levels

*   **🟢 SAFE (Score < 30)**: No suspicious usage found. Transaction likely safe.
*   **🟡 WARN (Score 30-70)**: Some risk factors detected (e.g., contract is new, ownership centralized). Proceed with caution.
*   **🔴 BLOCK (Score > 70)**: High probability of scam (Honeypot, Drainer). **Do not sign.**

### Understanding Flags

*   **Simulation Reverted**: The transaction failed during simulation. It might fail on-chain too (wasting gas) or is blocked by logic.
*   **Time Bomb**: The contract works now but will fail in the future.
*   **Owner Privileges**: The owner has special powers (like selling) that you don't.
*   **Proxy Contract**: The logic is hidden behind another contract and can change.

### Advanced Tab

*   **Mechanism Story**: A plain-English explanation of *why* the transaction was flagged.
*   **Ownership Status**: "Renounced" implies safer (nobody controls it), "Centralized" implies risk.
