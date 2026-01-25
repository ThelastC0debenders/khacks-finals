# Frequently Asked Questions (FAQ)

## General

**Q: Does this work on all chains?**
A: It works on any EVM-compatible chain (Ethereum, Polygon, BSC, Optimism, Arbitrum, Base, etc.) as long as we have an RPC endpoint for it.

**Q: Is it 100% accurate?**
A: No security tool is 100%. However, by combining 8 distinct detection layers (including future simulation and ML), we significantly reduce both false positives and false negatives compared to single-layer tools.

**Q: How is this different from Token Sniffer?**
A: Token Sniffer is a **Static Analysis** tool. It reads the code but doesn't run it. Sentinel is a **Dynamic Analysis** tool. We actually *execute* the transaction in a safe simulation. We can catch runtime scams (like time bombs) that static tools miss.

## Technical

**Q: How do you simulate future timestamps?**
A: We use a forked EVM instance where we manually set the block header timestamp to a future value (e.g., `current + 7 days`) before executing the transaction call.

**Q: What happens if the contract is a Proxy?**
A: Our Proxy Detector identifies standard proxy patterns (EIP-1967, EIP-1822). It resolves the implementation address and we simulate using the implementation's logic while keeping the proxy's storage context.

**Q: How fast is the analysis?**
A: The average analysis takes roughly 800ms. This includes fetching bytecode, running simulations (parallelized), and getting the ML prediction.

## Privacy

**Q: Do you store my private keys?**
A: **Never.** The Snap only sees the *transaction request* (to, from, data). Typically, it doesn't even need your private key because it sends the request to the backend for simulation. We never ask for or store seed phrases.

**Q: Do you log my transactions?**
A: We cache anonymous transaction analysis results in Redis to detect behavioral drift (contract changes). We do not build user profiles.
