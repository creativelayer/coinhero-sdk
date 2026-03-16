/**
 * CoinHero SDK wire protocol.
 *
 * All messages use a JSON-RPC 2.0 style payload wrapped in a CoinHero
 * envelope with `__coinhero: true` so they can be distinguished from
 * Farcaster SDK (comlink) traffic or any other postMessage consumers.
 */

// ── Envelope ───────────────────────────────────────────────────────────

export interface CoinHeroMessage {
  __coinhero: true
  version: 1
  direction: 'request' | 'response' | 'event'
  payload: CoinHeroRequest | CoinHeroResponse | CoinHeroEvent
}

// ── JSON-RPC payloads ──────────────────────────────────────────────────

export interface CoinHeroRequest {
  jsonrpc: '2.0'
  id: string
  method: string
  params?: unknown[]
}

export interface CoinHeroResponse {
  jsonrpc: '2.0'
  id: string
  result?: unknown
  error?: CoinHeroRpcError
}

export interface CoinHeroEvent {
  jsonrpc: '2.0'
  method: string
  params?: unknown[]
}

export interface CoinHeroRpcError {
  code: number
  message: string
  data?: unknown
}

// ── Context ────────────────────────────────────────────────────────────

export interface CoinHeroContext {
  /** Connected wallet address (checksummed) */
  address: string
  /** Current chain ID */
  chainId: number
  /** Display name (optional) */
  username?: string
  /** Host version */
  hostVersion: string
}

// ── Helpers ────────────────────────────────────────────────────────────

export function isCoinHeroMessage(data: unknown): data is CoinHeroMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    '__coinhero' in data &&
    (data as CoinHeroMessage).__coinhero === true
  )
}

export function createRequest(method: string, params?: unknown[]): CoinHeroMessage {
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
  }
}

export function createResponse(id: string, result?: unknown, error?: CoinHeroRpcError): CoinHeroMessage {
  return {
    __coinhero: true,
    version: 1,
    direction: 'response',
    payload: {
      jsonrpc: '2.0',
      id,
      ...(error ? { error } : { result }),
    },
  }
}

export function createEvent(method: string, params?: unknown[]): CoinHeroMessage {
  return {
    __coinhero: true,
    version: 1,
    direction: 'event',
    payload: {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined && { params }),
    },
  }
}
