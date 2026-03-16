/**
 * CoinHero SDK wire protocol.
 *
 * All messages use a JSON-RPC 2.0 style payload wrapped in a CoinHero
 * envelope with `__coinhero: true` so they can be distinguished from
 * Farcaster SDK (comlink) traffic or any other postMessage consumers.
 */
// ── Helpers ────────────────────────────────────────────────────────────
export function isCoinHeroMessage(data) {
    return (typeof data === 'object' &&
        data !== null &&
        '__coinhero' in data &&
        data.__coinhero === true);
}
export function createRequest(method, params) {
    return {
        __coinhero: true,
        version: 1,
        direction: 'request',
        payload: {
            jsonrpc: '2.0',
            id: crypto.randomUUID(),
            method,
            ...(params !== undefined && { params }),
        },
    };
}
export function createResponse(id, result, error) {
    return {
        __coinhero: true,
        version: 1,
        direction: 'response',
        payload: {
            jsonrpc: '2.0',
            id,
            ...(error ? { error } : { result }),
        },
    };
}
export function createEvent(method, params) {
    return {
        __coinhero: true,
        version: 1,
        direction: 'event',
        payload: {
            jsonrpc: '2.0',
            method,
            ...(params !== undefined && { params }),
        },
    };
}
//# sourceMappingURL=protocol.js.map