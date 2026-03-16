/**
 * EIP-1193 provider that routes JSON-RPC requests to the CoinHero host.
 *
 * This provider is used by the wagmi connector and can also be used
 * directly with viem or ethers.
 */
import type { CoinHeroTransport } from '../core/transport.js';
type EventMap = {
    accountsChanged: [string[]];
    chainChanged: [string];
    disconnect: [{
        code: number;
        message: string;
    }];
    connect: [{
        chainId: string;
    }];
};
type EventName = keyof EventMap;
type EventCallback<T extends EventName> = (...args: EventMap[T]) => void;
export declare class CoinHeroEthProvider {
    private transport;
    private listeners;
    constructor(transport: CoinHeroTransport);
    /** EIP-1193 request method */
    request(args: {
        method: string;
        params?: unknown[];
    }): Promise<unknown>;
    /** EIP-1193 event emitter */
    on<T extends EventName>(event: T, callback: EventCallback<T>): this;
    removeListener<T extends EventName>(event: T, callback: EventCallback<T>): this;
    emitAccountsChanged(accounts: string[]): void;
    emitChainChanged(chainId: number): void;
    emitDisconnect(): void;
    emitConnect(chainId: number): void;
    private emit;
}
export {};
//# sourceMappingURL=provider.d.ts.map