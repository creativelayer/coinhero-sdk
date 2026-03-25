/**
 * CoinHero SDK wire protocol.
 *
 * All messages use a JSON-RPC 2.0 style payload wrapped in a CoinHero
 * envelope with `__coinhero: true` so they can be distinguished from
 * Farcaster SDK (comlink) traffic or any other postMessage consumers.
 */
export interface CoinHeroMessage {
    __coinhero: true;
    version: 1;
    direction: 'request' | 'response' | 'event';
    payload: CoinHeroRequest | CoinHeroResponse | CoinHeroEvent;
}
export interface CoinHeroRequest {
    jsonrpc: '2.0';
    id: string;
    method: string;
    params?: unknown[];
}
export interface CoinHeroResponse {
    jsonrpc: '2.0';
    id: string;
    result?: unknown;
    error?: CoinHeroRpcError;
}
export interface CoinHeroEvent {
    jsonrpc: '2.0';
    method: string;
    params?: unknown[];
}
export interface CoinHeroRpcError {
    code: number;
    message: string;
    data?: unknown;
}
export interface CoinHeroContext {
    /** Connected wallet address (checksummed) */
    address: string;
    /** Current chain ID */
    chainId: number;
    /** Display name (optional) */
    username?: string;
    /** Host version */
    hostVersion: string;
    /** CoinHero user ID */
    coinHeroUserId?: string;
    /** Farcaster ID (if linked) */
    fid?: number;
    /** Profile image URL */
    profileImageUrl?: string;
}
export interface CoinHeroAuthResponse {
    /** CoinHero-issued JWT */
    token: string;
    /** User's signed approval message for this specific app */
    approvalMessage: string;
    /** EIP-191 signature of the approval message */
    approvalSignature: string;
}
export declare function isCoinHeroMessage(data: unknown): data is CoinHeroMessage;
export declare function createRequest(method: string, params?: unknown[]): CoinHeroMessage;
export declare function createResponse(id: string, result?: unknown, error?: CoinHeroRpcError): CoinHeroMessage;
export declare function createEvent(method: string, params?: unknown[]): CoinHeroMessage;
//# sourceMappingURL=protocol.d.ts.map