import { Chain, PublicClient, WalletClient, createPublicClient, createWalletClient, fallback, http, webSocket, SimulateContractParameters, WriteContractParameters, Account, decodeErrorResult } from "viem";
import { print, utilsInitialize, boxConfig } from "./utils.js";
import * as chains from 'viem/chains';

export interface vChain extends Chain {
    cliRead: PublicClient;
    cliWrite: WalletClient;
    cliListen: PublicClient;
}

export class vChainManager {

    private static _instance: vChainManager;

    public vchains: { [key: number]: vChain } = {};

    private constructor(boxConfig:any) {
        this.initializeViemClients(boxConfig);
    }

    public static async getInstance(): Promise<{ [key: number]: vChain }> {

        if (!vChainManager._instance) {
            await utilsInitialize;
    
            vChainManager._instance = new vChainManager(boxConfig.chains);
            }

            // always return the vchains of the stored instance
            return vChainManager._instance.vchains;
      }

    private async initializeViemClients(_chains:any) {
        const self = this;
        const allChains = Object.values(chains);
        const promises = allChains.map(async (chain) => {
            const chainId = chain.id;

            // even if its a chain in viem that doesnt exist in our config (& thus is not relevant to our app), add placeholders for it anyway
            if (!_chains[chainId]) {
                this.vchains[chainId] = {
                    ...chain,
                    //@ts-ignore
                    cliRead: { fakeObject: 'so nothing complains about undefined' },
                    //@ts-ignore
                    cliWrite: { fakeObject: 'so nothing complains about undefined' },
                    //@ts-ignore
                    cliListen: { fakeObject: 'so nothing complains about undefined' },
                };
                return;
            }

            const rpcUrls = _chains[chainId];

            if (!rpcUrls.rpc_urls_read.length || !rpcUrls.rpc_urls_write.length || !rpcUrls.rpc_urls_listen.length) {
                throw new Error(`initializeViemClients: Chain with ID ${chainId} must have at least one URL for read, write, and listen`);
            }
            
            let wsTransport = webSocket(rpcUrls.rpc_urls_listen[0], { reconnect: { attempts: 500, delay: 1_000 } });

            this.vchains[chainId] = {
                ...chain,
                //@ts-ignore
                cliRead: createPublicClient({
                    chain: chain,
                    name: `cliRead${chain.id}`,
                    transport: fallback(rpcUrls.rpc_urls_read.map((url: string) => url.startsWith('http') ? http(url) : webSocket(url, { retryCount: 5 })), { rank: true }),
                }),
                cliWrite: createWalletClient({
                    chain: chain,
                    name: `cliWrit${chain.id}`,
                    transport: fallback(rpcUrls.rpc_urls_write.map((url: string) => url.startsWith('http') ? http(url) : webSocket(url, { retryCount: 5 })), { rank: true }),
                }),
                //@ts-ignore
                cliListen: createPublicClient({
                    chain: chain,
                    name: `cliList${chain.id}`,
                    transport: wsTransport,
                })
            };

        });
        
        await Promise.all(promises);
        print(`%ts Viem Clients Initialized for ${Object.keys(_chains).length} chains`);
    }
}