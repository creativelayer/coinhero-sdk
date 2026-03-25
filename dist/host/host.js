/**
 * CoinHero host-side SDK.
 *
 * Used by the CoinHero launcher to handle messages from embedded
 * mini apps and proxy wallet operations to the real connected wallet.
 */
import { CoinHeroTransport } from '../core/transport.js';
export class CoinHeroHost {
    transport = null;
    iframe;
    _context;
    onWalletRequest;
    onReady;
    onClose;
    onAuthTokenRequest;
    constructor(options) {
        this.iframe = options.iframe;
        this._context = options.context;
        this.onWalletRequest = options.onWalletRequest;
        this.onReady = options.onReady;
        this.onClose = options.onClose;
        this.onAuthTokenRequest = options.onAuthTokenRequest;
    }
    /** Start listening for messages from the iframe */
    listen() {
        const contentWindow = this.iframe.contentWindow;
        if (!contentWindow) {
            throw new Error('iframe has no contentWindow — is it mounted?');
        }
        this.transport = new CoinHeroTransport({
            target: contentWindow,
            messageFilter: (event) => event.source === contentWindow,
        });
        this.transport.onRequest(async (request) => {
            return this.handleRequest(request);
        });
        this.transport.listen();
    }
    /** Update the context (e.g., when wallet changes) */
    updateContext(ctx) {
        this._context = { ...this._context, ...ctx };
    }
    /** Notify the app that accounts have changed */
    emitAccountsChanged(accounts) {
        this.transport?.emit('coinhero_accountsChanged', [accounts]);
    }
    /** Notify the app that the chain has changed */
    emitChainChanged(chainId) {
        this.transport?.emit('coinhero_chainChanged', [chainId]);
    }
    /** Notify the app that the wallet has disconnected */
    emitDisconnect() {
        this.transport?.emit('coinhero_disconnect');
    }
    /** Stop listening and clean up */
    destroy() {
        this.transport?.destroy();
        this.transport = null;
    }
    // ── Private ────────────────────────────────────────────────────────
    async handleRequest(request) {
        const { method, params } = request;
        switch (method) {
            case 'coinhero_ping':
                // Return context as the pong response
                return { result: this._context };
            case 'coinhero_context':
                return { result: this._context };
            case 'coinhero_ready':
                this.onReady?.();
                return { result: true };
            case 'coinhero_close':
                this.onClose?.();
                return { result: true };
            case 'coinhero_getAuthToken':
                if (this.onAuthTokenRequest) {
                    try {
                        const token = await this.onAuthTokenRequest();
                        return { result: token };
                    }
                    catch (err) {
                        const error = err;
                        return {
                            error: {
                                code: error.code ?? -32603,
                                message: error.message ?? 'Auth token request failed',
                            },
                        };
                    }
                }
                return { error: { code: -32601, message: 'Auth token not available' } };
            default:
                // All other methods (eth_*, personal_sign, etc.) → wallet handler
                if (this.onWalletRequest) {
                    try {
                        const result = await this.onWalletRequest(method, params);
                        return { result };
                    }
                    catch (err) {
                        const error = err;
                        return {
                            error: {
                                code: error.code ?? -32603,
                                message: error.message ?? 'Wallet request failed',
                            },
                        };
                    }
                }
                return {
                    error: {
                        code: -32601,
                        message: `Method not supported: ${method}`,
                    },
                };
        }
    }
}
//# sourceMappingURL=host.js.map