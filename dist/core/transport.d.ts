/**
 * PostMessage transport with request/response correlation.
 *
 * Handles sending CoinHero messages to a target window and matching
 * responses by their JSON-RPC `id`. Also dispatches incoming events
 * and requests to registered handlers.
 */
import { type CoinHeroRequest, type CoinHeroEvent, type CoinHeroRpcError } from './protocol.js';
type EventCallback = (event: CoinHeroEvent) => void;
type RequestHandler = (request: CoinHeroRequest) => Promise<{
    result?: unknown;
    error?: CoinHeroRpcError;
}>;
type MessageFilter = (event: MessageEvent) => boolean;
export declare class CoinHeroTransport {
    private target;
    private pendingRequests;
    private eventListeners;
    private requestHandler;
    private messageHandler;
    private allowedOrigin;
    private messageFilter;
    constructor(options: {
        /** Window to send messages to (window.parent for apps, iframe.contentWindow for host) */
        target: Window;
        /** If set, only accept messages from this origin. null = accept all. */
        allowedOrigin?: string | null;
        /** Additional predicate for filtering inbound postMessage events. */
        messageFilter?: MessageFilter | null;
    });
    /** Start listening for incoming messages */
    listen(): void;
    /** Send a request and wait for a response */
    request(method: string, params?: unknown[], timeoutMs?: number): Promise<unknown>;
    /** Send a response to a request */
    respond(id: string, result?: unknown, error?: CoinHeroRpcError): void;
    /** Send an event (no response expected) */
    emit(method: string, params?: unknown[]): void;
    /** Register a handler for incoming requests (host-side) */
    onRequest(handler: RequestHandler): void;
    /** Listen for a specific event type */
    on(method: string, callback: EventCallback): void;
    /** Remove an event listener */
    off(method: string, callback: EventCallback): void;
    /** Stop listening and clean up */
    destroy(): void;
    private handleResponse;
    private handleIncomingRequest;
    private handleEvent;
}
export {};
//# sourceMappingURL=transport.d.ts.map