/**
 * PostMessage transport with request/response correlation.
 *
 * Handles sending CoinHero messages to a target window and matching
 * responses by their JSON-RPC `id`. Also dispatches incoming events
 * and requests to registered handlers.
 */

import {
  type CoinHeroMessage,
  type CoinHeroRequest,
  type CoinHeroResponse,
  type CoinHeroEvent,
  type CoinHeroRpcError,
  isCoinHeroMessage,
  createRequest,
  createResponse,
} from './protocol.js'

type EventCallback = (event: CoinHeroEvent) => void
type RequestHandler = (request: CoinHeroRequest) => Promise<{ result?: unknown; error?: CoinHeroRpcError }>

interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (error: CoinHeroRpcError) => void
  timer: ReturnType<typeof setTimeout>
}

type MessageFilter = (event: MessageEvent) => boolean

export class CoinHeroTransport {
  private target: Window
  private pendingRequests = new Map<string, PendingRequest>()
  private eventListeners = new Map<string, Set<EventCallback>>()
  private requestHandler: RequestHandler | null = null
  private messageHandler: ((event: MessageEvent) => void) | null = null
  private allowedOrigin: string | null
  private messageFilter: MessageFilter | null

  constructor(options: {
    /** Window to send messages to (window.parent for apps, iframe.contentWindow for host) */
    target: Window
    /** If set, only accept messages from this origin. null = accept all. */
    allowedOrigin?: string | null
    /** Additional predicate for filtering inbound postMessage events. */
    messageFilter?: MessageFilter | null
  }) {
    this.target = options.target
    this.allowedOrigin = options.allowedOrigin ?? null
    this.messageFilter = options.messageFilter ?? null
  }

  /** Start listening for incoming messages */
  listen(): void {
    if (this.messageHandler) return

    this.messageHandler = (event: MessageEvent) => {
      if (this.messageFilter && !this.messageFilter(event)) return

      // Origin check
      if (this.allowedOrigin && event.origin !== this.allowedOrigin) return

      const data = event.data
      if (!isCoinHeroMessage(data)) return

      if (data.direction === 'response') {
        this.handleResponse(data.payload as CoinHeroResponse)
      } else if (data.direction === 'request') {
        this.handleIncomingRequest(data.payload as CoinHeroRequest)
      } else if (data.direction === 'event') {
        this.handleEvent(data.payload as CoinHeroEvent)
      }
    }

    window.addEventListener('message', this.messageHandler)
  }

  /** Send a request and wait for a response */
  async request(method: string, params?: unknown[], timeoutMs = 30_000): Promise<unknown> {
    const msg = createRequest(method, params)
    const id = (msg.payload as CoinHeroRequest).id

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject({ code: -32000, message: `Request timed out: ${method}` })
      }, timeoutMs)

      this.pendingRequests.set(id, { resolve, reject, timer })
      this.target.postMessage(msg, '*')
    })
  }

  /** Send a response to a request */
  respond(id: string, result?: unknown, error?: CoinHeroRpcError): void {
    const msg = createResponse(id, result, error)
    this.target.postMessage(msg, '*')
  }

  /** Send an event (no response expected) */
  emit(method: string, params?: unknown[]): void {
    const msg: CoinHeroMessage = {
      __coinhero: true,
      version: 1,
      direction: 'event',
      payload: { jsonrpc: '2.0', method, params },
    }
    this.target.postMessage(msg, '*')
  }

  /** Register a handler for incoming requests (host-side) */
  onRequest(handler: RequestHandler): void {
    this.requestHandler = handler
  }

  /** Listen for a specific event type */
  on(method: string, callback: EventCallback): void {
    let set = this.eventListeners.get(method)
    if (!set) {
      set = new Set()
      this.eventListeners.set(method, set)
    }
    set.add(callback)
  }

  /** Remove an event listener */
  off(method: string, callback: EventCallback): void {
    this.eventListeners.get(method)?.delete(callback)
  }

  /** Stop listening and clean up */
  destroy(): void {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler)
      this.messageHandler = null
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject({ code: -32000, message: 'Transport destroyed' })
    }
    this.pendingRequests.clear()
    this.eventListeners.clear()
    this.requestHandler = null
  }

  // ── Private ────────────────────────────────────────────────────────

  private handleResponse(response: CoinHeroResponse): void {
    const pending = this.pendingRequests.get(response.id)
    if (!pending) return

    clearTimeout(pending.timer)
    this.pendingRequests.delete(response.id)

    if (response.error) {
      pending.reject(response.error)
    } else {
      pending.resolve(response.result)
    }
  }

  private async handleIncomingRequest(request: CoinHeroRequest): Promise<void> {
    if (!this.requestHandler) {
      this.respond(request.id, undefined, {
        code: -32601,
        message: `No handler registered`,
      })
      return
    }

    try {
      const { result, error } = await this.requestHandler(request)
      this.respond(request.id, result, error)
    } catch (err) {
      this.respond(request.id, undefined, {
        code: -32603,
        message: err instanceof Error ? err.message : 'Internal error',
      })
    }
  }

  private handleEvent(event: CoinHeroEvent): void {
    const listeners = this.eventListeners.get(event.method)
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(event)
        } catch {
          // Don't let listener errors propagate
        }
      }
    }
  }
}
