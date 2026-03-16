/**
 * CoinHero app-side SDK.
 *
 * Used by mini apps (plinks, rips) running inside a CoinHero iframe.
 * Communicates with the CoinHero host via postMessage.
 */
import { CoinHeroTransport } from '../core/transport.js';
import { CoinHeroEthProvider } from './provider.js';
const PING_TIMEOUT_MS = 500;
export class CoinHeroSDK {
    transport = null;
    _context = null;
    _provider = null;
    _connected = false;
    /** Whether the SDK has connected to a CoinHero host */
    get connected() {
        return this._connected;
    }
    /** Host-provided context (address, chainId, etc.) */
    get context() {
        return this._context;
    }
    /** EIP-1193 provider that routes requests through the host's wallet */
    get provider() {
        if (!this._provider) {
            this._provider = new CoinHeroEthProvider(this.getTransport());
        }
        return this._provider;
    }
    /** Detect whether we're running inside a CoinHero host */
    async isInCoinHero() {
        // Not in an iframe — can't be in CoinHero
        if (typeof window === 'undefined' || window === window.parent) {
            return false;
        }
        try {
            const result = await this.getTransport().request('coinhero_ping', [], PING_TIMEOUT_MS);
            const ctx = result;
            if (ctx && typeof ctx.address === 'string') {
                this._context = ctx;
                this._connected = true;
                this.setupEventListeners();
                return true;
            }
            return false;
        }
        catch {
            return false;
        }
    }
    /** SDK actions */
    actions = {
        /** Signal that the app has loaded and is ready */
        ready: async () => {
            await this.getTransport().request('coinhero_ready');
        },
        /** Request the host to close this mini app */
        close: async () => {
            await this.getTransport().request('coinhero_close');
        },
    };
    /** Request updated context from the host */
    async refreshContext() {
        try {
            const result = await this.getTransport().request('coinhero_context');
            this._context = result;
            return this._context;
        }
        catch {
            return null;
        }
    }
    /** Clean up listeners */
    destroy() {
        this.transport?.destroy();
        this.transport = null;
        this._provider = null;
        this._context = null;
        this._connected = false;
    }
    // ── Private ────────────────────────────────────────────────────────
    getTransport() {
        if (!this.transport) {
            this.transport = new CoinHeroTransport({ target: window.parent });
            this.transport.listen();
        }
        return this.transport;
    }
    setupEventListeners() {
        const t = this.getTransport();
        t.on('coinhero_accountsChanged', (event) => {
            const accounts = event.params?.[0];
            if (accounts?.[0] && this._context) {
                this._context = { ...this._context, address: accounts[0] };
            }
            this._provider?.emitAccountsChanged(accounts || []);
        });
        t.on('coinhero_chainChanged', (event) => {
            const chainId = event.params?.[0];
            if (chainId && this._context) {
                this._context = { ...this._context, chainId };
            }
            this._provider?.emitChainChanged(chainId || 0);
        });
        t.on('coinhero_disconnect', () => {
            this._context = null;
            this._connected = false;
            this._provider?.emitDisconnect();
        });
    }
}
//# sourceMappingURL=sdk.js.map