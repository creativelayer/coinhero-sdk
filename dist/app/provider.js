/**
 * EIP-1193 provider that routes JSON-RPC requests to the CoinHero host.
 *
 * This provider is used by the wagmi connector and can also be used
 * directly with viem or ethers.
 */
export class CoinHeroEthProvider {
    transport;
    listeners = new Map();
    constructor(transport) {
        this.transport = transport;
    }
    /** EIP-1193 request method */
    async request(args) {
        // Route all eth_* requests through the host
        const result = await this.transport.request(args.method, args.params, 120_000);
        return result;
    }
    /** EIP-1193 event emitter */
    on(event, callback) {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(callback);
        return this;
    }
    removeListener(event, callback) {
        this.listeners.get(event)?.delete(callback);
        return this;
    }
    // ── Internal event emitters (called by SDK) ────────────────────────
    emitAccountsChanged(accounts) {
        this.emit('accountsChanged', accounts);
    }
    emitChainChanged(chainId) {
        this.emit('chainChanged', '0x' + chainId.toString(16));
    }
    emitDisconnect() {
        this.emit('disconnect', { code: 4900, message: 'Disconnected' });
    }
    emitConnect(chainId) {
        this.emit('connect', { chainId: '0x' + chainId.toString(16) });
    }
    // ── Private ────────────────────────────────────────────────────────
    emit(event, ...args) {
        const set = this.listeners.get(event);
        if (set) {
            for (const cb of set) {
                try {
                    cb(...args);
                }
                catch {
                    // Don't let listener errors propagate
                }
            }
        }
    }
}
//# sourceMappingURL=provider.js.map