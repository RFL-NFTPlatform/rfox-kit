import { Network } from "../typings/network";

export const NETWORKS: Record<number, Network> = {
  1: {
    chainId: "0x1", // 137
    chainName: "Mainnet",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: [
      "https://speedy-nodes-nyc.moralis.io/84b550f4f5bdb2aaa88cb1a7/eth/mainnet",
    ],
    blockExplorerUrls: ["https://www.etherscan.io/"],
  },
  4: {
    chainId: "0x4", // 80001
    chainName: "Rinkeby",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: [
      "https://speedy-nodes-nyc.moralis.io/84b550f4f5bdb2aaa88cb1a7/eth/rinkeby",
    ],
    blockExplorerUrls: ["https://rinkeby.etherscan.io/"],
  },
};
