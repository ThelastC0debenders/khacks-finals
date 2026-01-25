# API Reference

## Backend API
**Base URL**: `http://localhost:3000`

### 1. Analyze Transaction (RPC)
Standard JSON-RPC endpoint used by the MetaMask Snap.

*   **Endpoint**: `POST /rpc`
*   **Payload**:
    ```json
    {
      "method": "sentinel_analyze",
      "params": [{
        "from": "0xUserConnection...",
        "to": "0xContractAddress...",
        "data": "0xMethodSignature...",
        "value": "0x0",
        "chainId": "eip155:1"
      }],
      "id": 1
    }
    ```
*   **Response**:
    ```json
    {
      "result": {
        "securityReport": {
          "isHoneypot": boolean,
          "riskScore": number (0-100),
          "flags": string[],
          "mechanismStory": { "title": string, "story": string }
        },
        "simulationResult": { "gasUsed": string, "logs": [...] },
        "status": "Success" | "Reverted"
      }
    }
    ```

### 2. Scan History
*   **Endpoint**: `GET /history/:address`
*   **Description**: Returns recent scans for a specific contract.

### 3. Latest Scan
*   **Endpoint**: `GET /history/:address/latest`
*   **Description**: Returns the most recent cached analysis result.

### 4. Drift Check
*   **Endpoint**: `GET /drift?minDelta=20`
*   **Description**: List contracts that have changed risk score by more than `minDelta`.

---

## ML Service API
**Base URL**: `http://localhost:8000`

### 1. Analyze (Deep Scan)
*   **Endpoint**: `POST /analyze`
*   **Description**: Returns calibrated risk probability.
*   **Payload**:
    ```json
    {
      "sim_success_rate": float,
      "owner_privilege_ratio": float,
      "suspicious_opcode_density": float,
      // ... 15 features total
    }
    ```
*   **Response**:
    ```json
    {
      "scam_probability": 0.95,
      "verdict": "BLOCK",
      "confidence_interval": [0.92, 0.98],
      "reason": "High risk - owner restricted execution"
    }
    ```

### 2. Health Check
*   **Endpoint**: `GET /health`
*   **Response**: `{"status": "healthy", "model_loaded": true}`
