/**
 * CoinHero app-side SDK.
 *
 * Used by mini apps (plinks, rips) running inside a CoinHero iframe.
 * Communicates with the CoinHero host via postMessage.
 */
import type { CoinHeroContext } from '../core/protocol.js';
import { CoinHeroEthProvider } from './provider.js';
export declare class CoinHeroSDK {
    private transport;
    private _context;
    private _provider;
    private _connected;
    /** Whether the SDK has connected to a CoinHero host */
    get connected(): boolean;
    /** Host-provided context (address, chainId, etc.) */
    get context(): CoinHeroContext | null;
    /** EIP-1193 provider that routes requests through the host's wallet */
    get provider(): CoinHeroEthProvider;
    /** Detect whether we're running inside a CoinHero host */
    isInCoinHero(): Promise<boolean>;
    /** SDK actions */
    actions: {
        /** Signal that the app has loaded and is ready */
        ready: () => Promise<void>;
        /** Request the host to close this mini app */
        close: () => Promise<void>;
    };
    /** Request updated context from the host */
    refreshContext(): Promise<CoinHeroContext | null>;
    /** Clean up listeners */
    destroy(): void;
    private getTransport;
    private setupEventListeners;
}
//# sourceMappingURL=sdk.d.ts.map