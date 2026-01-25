# Setup and Deployment Guide

## Prerequisites
*   **Node.js**: v18+
*   **Python**: v3.9+
*   **Redis**: Latest stable (optional for history, recommended for full features)
*   **Yarn**: v3+ (for Snap workspace)

## 1. Backend Setup

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure environment:
    Create a `.env` file in the project root (parent directory):
    ```bash
    ALCHEMY_API_KEY=your_alchemy_key
    PORT=3000
    REDIS_URL=redis://localhost:6379
    ML_API_URL=http://localhost:8000
    ```
4.  Start the server:
    ```bash
    npm run dev
    ```

## 2. ML Service Setup

1.  Navigate to the ML directory:
    ```bash
    cd sentinel-ml
    ```
2.  Install Python requirements:
    ```bash
    pip install -r requirements.txt
    ```
3.  Start the API:
    ```bash
    python3 -m uvicorn api.risk_api:app --reload --port 8000
    ```

## 3. MetaMask Snap Setup

1.  Navigate to the Snap directory:
    ```bash
    cd wallet/snap
    ```
2.  Install dependencies (using yarn):
    ```bash
    yarn install
    ```
3.  Start the Snap server:
    ```bash
    yarn start
    ```
    This runs the Snap locally on `http://localhost:8080`.

## 4. Testing with Local Chain (Hardhat)

1.  Navigate to local chain directory:
    ```bash
    cd wallet/local-chain
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start local node:
    ```bash
    npx hardhat node
    ```
4.  Deploy test contracts (Honeypot, SafeVault):
    ```bash
    npx hardhat run scripts/deploy.ts --network localhost
    ```
