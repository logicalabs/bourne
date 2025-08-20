import { createConfig } from "ponder";

import { abiTransferProxy } from "./abis/TransferProxy";

export default createConfig({
  database: { 
    kind: "postgres", 
    connectionString: "postgres://boxroot:stablerundown@178.156.161.194:5432/dbserv", 
  }, 
  chains: {
    base: {
      id: 8453,
      rpc: process.env.PONDER_RPC_URL_8453!,
    },
    arbitrum: {
      id: 42161,
      rpc: process.env.PONDER_RPC_URL_42161!,
    },
    mainnet: {
      id: 1,
      rpc: process.env.PONDER_RPC_URL_1!,
    },
  },
  contracts: {
    TransferProxy: {
      abi: abiTransferProxy,
      chain: { 
        base: { 
          address: "0x9dc7206137379C790DFD4D1Fb19dc34EB151c868", 
          startBlock: 34414826, 
        }, 
        arbitrum: { 
          address: "0x9dc7206137379C790DFD4D1Fb19dc34EB151c868", 
          startBlock: 370114527, 
        }, 
        mainnet: { 
          address: "0x9dc7206137379C790DFD4D1Fb19dc34EB151c868", 
          startBlock: 23180786, 
        }, 
      }, 
    },
  },
});
