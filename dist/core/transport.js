/**
 * PostMessage transport with request/response correlation.
 *
 * Handles sending CoinHero messages to a target window and matching
 * responses by their JSON-RPC `id`. Also dispatches incoming events
 * and requests to registered handlers.
 */
import { isCoinHeroMessage, createRequest, createResponse, } from './protocol.js';
export class CoinHeroTransport {
    target;
    pendingRequests = new Map();
    eventListeners = new Map();
    requestHandler = null;
    messageHandler = null;
    allowedOrigin;
    messageFilter;
    constructor(options) {
        this.target = options.target;
        this.allowedOrigin = options.allowedOrigin ?? null;
        this.messageFilter = options.messageFilter ?? null;
    }
    /** Start listening for incoming messages */
    listen() {
        if (this.messageHandler)
            return;
        this.messageHandler = (event) => {
            if (this.messageFilter && !this.messageFilter(event))
                return;
            // Origin check
            if (this.allowedOrigin && event.origin !== this.allowedOrigin)
                return;
            const data = event.data;
            if (!isCoinHeroMessage(data))
                return;
            if (data.direction === 'response') {
                this.handleResponse(data.payload);
            }
            else if (data.direction === 'request') {
                this.handleIncomingRequest(data.payload);
            }
            else if (data.direction === 'event') {
                this.handleEvent(data.payload);
            }
        };
        window.addEventListener('message', this.messageHandler);
    }
    /** Send a request and wait for a response */
    async request(method, params, timeoutMs = 30_000) {
        const msg = createRequest(method, params);
        const id = msg.payload.id;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject({ code: -32000, message: `Request timed out: ${method}` });
            }, timeoutMs);
            this.pendingRequests.set(id, { resolve, reject, timer });
            this.target.postMessage(msg, '*');
        });
    }
    /** Send a response to a request */
    respond(id, result, error) {
        const msg = createResponse(id, result, error);
        this.target.postMessage(msg, '*');
    }
    /** Send an event (no response expected) */
    emit(method, params) {
        const msg = {
            __coinhero: true,
            version: 1,
            direction: 'event',
            payload: { jsonrpc: '2.0', method, params },
        };
        this.target.postMessage(msg, '*');
    }
    /** Register a handler for incoming requests (host-side) */
    onRequest(handler) {
        this.requestHandler = handler;
    }
    /** Listen for a specific event type */
    on(method, callback) {
        let set = this.eventListeners.get(method);
        if (!set) {
            set = new Set();
            this.eventListeners.set(method, set);
        }
        set.add(callback);
    }
    /** Remove an event listener */
    off(method, callback) {
        this.eventListeners.get(method)?.delete(callback);
    }
    /** Stop listening and clean up */
    destroy() {
        if (this.messageHandler) {
            window.removeEventListener('message', this.messageHandler);
            this.messageHandler = null;
        }
        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject({ code: -32000, message: 'Transport destroyed' });
        }
        this.pendingRequests.clear();
        this.eventListeners.clear();
        this.requestHandler = null;
    }
    // ── Private ────────────────────────────────────────────────────────
    handleResponse(response) {
        const pending = this.pendingRequests.get(response.id);
        if (!pending)
            return;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(response.id);
        if (response.error) {
            pending.reject(response.error);
        }
        else {
            pending.resolve(response.result);
        }
    }
    async handleIncomingRequest(request) {
        if (!this.requestHandler) {
            this.respond(request.id, undefined, {
                code: -32601,
                message: `No handler registered`,
            });
            return;
        }
        try {
            const { result, error } = await this.requestHandler(request);
            this.respond(request.id, result, error);
        }
        catch (err) {
            this.respond(request.id, undefined, {
                code: -32603,
                message: err instanceof Error ? err.message : 'Internal error',
            });
        }
    }
    handleEvent(event) {
        const listeners = this.eventListeners.get(event.method);
        if (listeners) {
            for (const cb of listeners) {
                try {
                    cb(event);
                }
                catch {
                    // Don't let listener errors propagate
                }
            }
        }
    }
}
//# sourceMappingURL=transport.js.map