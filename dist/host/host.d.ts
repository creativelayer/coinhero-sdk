/**
 * CoinHero host-side SDK.
 *
 * Used by the CoinHero launcher to handle messages from embedded
 * mini apps and proxy wallet operations to the real connected wallet.
 */
import type { CoinHeroContext, CoinHeroAuthResponse } from '../core/protocol.js';
export type WalletRequestHandler = (method: string, params?: unknown[]) => Promise<unknown>;
export interface CoinHeroHostOptions {
    /** The iframe element containing the mini app */
    iframe: HTMLIFrameElement;
    /** Current wallet/user context to provide to the app */
    context: CoinHeroContext;
    /** Handler for eth_* JSON-RPC requests — typically forwards to wagmi walletClient.request() */
    onWalletRequest: WalletRequestHandler;
    /** Called when the app signals it's ready */
    onReady?: () => void;
    /** Called when the app requests to close */
    onClose?: () => void;
    /** Called when the app requests auth — return JWT + approval signature */
    onAuthTokenRequest?: () => Promise<CoinHeroAuthResponse | null>;
}
export declare class CoinHeroHost {
    private transport;
    private iframe;
    private _context;
    private onWalletRequest;
    private onReady?;
    private onClose?;
    private onAuthTokenRequest?;
    constructor(options: CoinHeroHostOptions);
    /** Start listening for messages from the iframe */
    listen(): void;
    /** Update the context (e.g., when wallet changes) */
    updateContext(ctx: Partial<CoinHeroContext>): void;
    /** Notify the app that accounts have changed */
    emitAccountsChanged(accounts: string[]): void;
    /** Notify the app that the chain has changed */
    emitChainChanged(chainId: number): void;
    /** Notify the app that the wallet has disconnected */
    emitDisconnect(): void;
    /** Stop listening and clean up */
    destroy(): void;
    private handleRequest;
}
//# sourceMappingURL=host.d.ts.map