import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
    solidity: "0.8.20",
    networks: {
        hardhat: {
            chainId: 31337,
            forking: process.env.MAINNET_RPC_URL ? {
                url: process.env.MAINNET_RPC_URL,
                // blockNumber: 19000000 // Optional: pinning block
            } : undefined
        }
    },
    paths: {
        sources: "./contract"
    }
};

export default config;
