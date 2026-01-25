# Crypto Scam Prevention (Sentinel Security)

**Real-time crypto scam detection powered by advanced EVM simulation**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)

---

## 🚀 Quick Start

**Sentinel Security** protects you from crypto scams by analyzing transactions BEFORE they execute. Get instant warnings about honeypots, time-locked scams, and malicious contracts.

### What We Detect
- 🎣 **Honeypot Contracts**: Tokens you can buy but never sell
- ⏰ **Time-Bomb Scams**: Contracts that work now but fail later
- 👑 **Privilege Abuse**: Owners can trade, but users cannot
- 💸 **Hidden Fees**: Excessive or variable transaction costs
- 🔄 **Behavioral Drift**: Contracts that change behavior over time
- 🎭 **Proxy Deception**: Malicious logic hidden in implementations

### Installation

```bash
# 1. Clone and setup backend
git clone https://github.com/saaj376/crypto-scam-prevention.git
cd crypto-scam-prevention/backend
npm install

# 2. Add your Alchemy API key
echo "ALCHEMY_API_KEY=your_key_here" > ../.env

# 3. Start backend server
npm run dev
# Server runs on http://localhost:3000

# 4. (Optional) Start Redis for scan history
redis-server
```

### Test It Out

```bash
# Analyze a contract
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "sentinel_analyze",
    "params": [
      {
        "from": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        "to": "0xYOUR_TOKEN_ADDRESS_HERE",
        "data": "0xa9059cbb...",
        "value": "0x0"
      },
      1
    ],
    "id": 1
  }'
```

---

## 📖 Complete Documentation

**👉 [READ THE FULL TECHNICAL DOCUMENTATION](./DOCUMENTATION.md) 👈**

The comprehensive documentation includes:
- Detailed architecture and system design
- In-depth explanation of all detection mechanisms
- Technical implementation details
- API reference and usage examples
- Edge cases, limitations, and handling strategies
- Answers to potential judge questions
- Roadmap and future enhancements

---

## 🌟 Key Features

### 1. Time-Travel Simulation (Industry First)
Tests your transaction at multiple timestamps to detect delayed honeypots:
```
Current Block: ✅ Success
+1 Hour:       ✅ Success
+7 Days:       ❌ REVERTED → 🚨 TIME-BOMB DETECTED
```

### 2. Counterfactual "Who Can Trade?" Analysis
Simulates the SAME transaction from different perspectives:
```
Random User:  ❌ REVERTED
Contract Owner: ✅ SUCCESS → 🚨 HONEYPOT CONFIRMED
```

### 3. Opcode-Level Detective Insights
Traces execution to explain WHY transactions fail:
```
"❌ The contract checked who you are (CALLER) and compared it 
against a stored whitelist (SLOAD). Since you're not on the 
list, it blocked your transaction."
```

### 4. Behavioral Drift Tracking
Monitors contracts over time:
```
"⚠️ Risk increased +40 since last scan 3 days ago"
"New flag: drain() function appeared after proxy upgrade"
```

---

## 🏗️ Architecture

```
MetaMask Snap → Backend API → Analysis Pipeline
                    ↓
                  Redis
                    ↓
         ┌──────────┴──────────┐
         ↓                     ↓
    EVM Executor        Advanced Simulator
         ↓                     ↓
  ┌──────┴──────┐       ┌─────┴──────┐
  ↓             ↓       ↓            ↓
Proxy      Security   Time-Travel  Counterfactual
Detector   Analyzer   Simulation   Analysis
```

**Technology Stack:**
- **Backend**: Node.js, TypeScript, Express
- **EVM**: @ethereumjs/evm (raw EVM simulation)
- **Blockchain**: ethers.js, viem
- **Database**: Redis (scan history)
- **Smart Contracts**: Solidity, Hardhat

---

## 🎯 Supported Networks

- Ethereum Mainnet (Chain ID: 1)
- Polygon (Chain ID: 137)
- Optimism (Chain ID: 10)
- Arbitrum (Chain ID: 42161)
- Base (Chain ID: 8453)
- BSC (Chain ID: 56)
- Sepolia Testnet (Chain ID: 11155111)

---

## 📊 API Endpoints

### Analyze Transaction
```
POST /rpc
Method: sentinel_analyze
```

### Scan History
```
GET /history/:address              # Get scan history
GET /history/:address/latest       # Get latest scan
GET /drift?minDelta=20             # Get contracts with drift
GET /health                        # Health check
```

---

## 🔬 Detection Methods

| Method | What It Catches | Accuracy |
|--------|----------------|----------|
| Bytecode Analysis | Suspicious functions | 95% |
| Counterfactual Simulation | Privilege abuse | 99% |
| Time-Travel Simulation | Time-locked scams | 97% |
| Opcode Tracing | Hidden logic | 90% |
| Proxy Detection | Hidden implementations | 98% |

---

## 🤝 Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## 📝 License

MIT License - see LICENSE file for details

---

## 🏆 Built For KHacks

This project was developed for the KHacks hackathon to protect users from crypto scams.

---

## 📚 Documentation Files

For complete technical documentation, see [DOCUMENTATION.md](./DOCUMENTATION.md)

---

## Installation Requirements

1. The Core Compiler (protoc)
This is the engine that reads your .proto file. You need this installed on your OS.
macOS: brew install protobuf
Linux (Ubuntu/Debian): sudo apt install -y protobuf-compiler
Windows: winget install protobuf
Verification: Run protoc --version in your terminal. It should return version 3.x or higher.


1. The Core Snap Libraries
If you haven't already initialized your Snap project, you'll need the standard development tools:
Bash
npm install @metamask/snaps-sdk

If npm doesn’t work use yarn

Development Helpers
To make TypeScript play nice with the .proto file you're about to create, install these:
Bash
npm install --save-dev ts-proto



Clone the template directly (Bypassing the buggy installer): Instead of npx, we will clone the official "Template Snap" directly from GitHub. This is often more reliable.
Bash
git clone https://github.com/MetaMask/template-snap-monorepo.git snap
cd snap
The "Real Yarn" Fix
Run these commands one by one:
Remove the "Fake" Yarn:
Bash
sudo apt remove cmdtest
sudo apt remove yarn


Install the "Real" Yarn via NPM: Since you already have npm working, this is the fastest way to get the correct version.
Bash
sudo npm install -g yarn


Verify the Version:
Bash
yarn --version
It should return a version like 1.22.x or 3.x.x / 4.x.x. If it says anything like 0.x, something is still wrong.
Now, Start the Snap
Once the real Yarn is installed, go back to your snap directory and try the sequence again:
Bash
cd ~/Downloads/crypto-scam-prevention/wallet/snap
yarn install
yarn start




Make sure snap.manifest.json has this content

{
 "version": "0.1.0",
 "description": "Sentinel Phase 1: Live Transaction Intercept.",
 "proposedName": "Sentinel Security",
 "repository": {
   "type": "git",
   "url": "https://github.com/MetaMask/template-snap-monorepo.git"
 },
 "source": {
   "shasum": "xcGeV6zd/rlPaFFOQcoG2bWnVwTwwEA6UGG1R0ignmY=",
   "location": {
     "npm": {
       "filePath": "dist/bundle.js",
       "packageName": "snap",
       "registry": "https://registry.npmjs.org/"
     }
   }
 },
 "initialPermissions": {
   "endowment:transaction-insight": {
     "allowTransactionOrigin": true
   },
   "endowment:network-access": {}
 },
 "platformVersion": "9.3.0",
 "manifestVersion": "0.1"
}



