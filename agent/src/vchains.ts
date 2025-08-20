import { Chain, PublicClient, WalletClient, createPublicClient, createWalletClient, fallback, http, webSocket, SimulateContractParameters, WriteContractParameters, Account, decodeErrorResult } from "viem";
import { print } from "./utils.js";
import * as chains from 'viem/chains';
import { boxConfigManager } from "./config.js";

export interface vChain extends Chain {
    cliRead: PublicClient;
    cliWrite: WalletClient;
    cliListen: PublicClient;
}


export class vChainManager {


    public vchains: { [key: number]: vChain } = {};

    constructor() {
        this.initializeViemClients();
    }

    private async initializeViemClients() {
        const configManager = await boxConfigManager.getInstance();
        
        const boxConfig = configManager.config;

        const self = this;
        const allChains = Object.values(chains);
        const promises = allChains.map(async (chain) => {
            const chainId = chain.id;
            const rpcUrls = boxConfig.chains[chainId];

            if (!rpcUrls) {
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
        print(`%ts Viem Clients Initialized for ${Object.keys(boxConfig.chains).length} chains`);
    }
}