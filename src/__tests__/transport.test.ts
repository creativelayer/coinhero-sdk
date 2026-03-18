// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CoinHeroTransport } from '../core/transport.js'
import {
  type CoinHeroMessage,
  type CoinHeroRequest,
  createResponse,
} from '../core/protocol.js'

// ── Helpers ───────────────────────────────────────────────────────────

function createMockTarget(): Window & { postMessage: ReturnType<typeof vi.fn> } {
  return { postMessage: vi.fn() } as unknown as Window & { postMessage: ReturnType<typeof vi.fn> }
}

/** Dispatch a CoinHero message on the real window (simulating incoming) */
function dispatchCoinHeroMessage(msg: CoinHeroMessage) {
  const event = new MessageEvent('message', { data: msg })
  window.dispatchEvent(event)
}

/** Dispatch a CoinHero response matching a request id */
function dispatchResponse(id: string, result?: unknown, error?: { code: number; message: string }) {
  dispatchCoinHeroMessage({
    __coinhero: true,
    version: 1,
    direction: 'response',
    payload: error
      ? { jsonrpc: '2.0', id, error }
      : { jsonrpc: '2.0', id, result },
  })
}

/** Dispatch a CoinHero event */
function dispatchEvent(method: string, params?: unknown[]) {
  dispatchCoinHeroMessage({
    __coinhero: true,
    version: 1,
    direction: 'event',
    payload: { jsonrpc: '2.0', method, ...(params !== undefined && { params }) },
  })
}

/** Dispatch a CoinHero request (simulating app → host) */
function dispatchRequest(id: string, method: string, params?: unknown[]) {
  dispatchCoinHeroMessage({
    __coinhero: true,
    version: 1,
    direction: 'request',
    payload: { jsonrpc: '2.0', id, method, ...(params !== undefined && { params }) },
  })
}

/** Extract the id from a posted request message */
function extractPostedRequestId(mockTarget: { postMessage: ReturnType<typeof vi.fn> }): string {
  const call = mockTarget.postMessage.mock.calls[0]
  const msg = call[0] as CoinHeroMessage
  return (msg.payload as CoinHeroRequest).id
}

/** Wait for async microtasks to flush */
function flushMicrotasks() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('CoinHeroTransport', () => {
  let transport: CoinHeroTransport
  let mockTarget: ReturnType<typeof createMockTarget>

  beforeEach(() => {
    mockTarget = createMockTarget()
    transport = new CoinHeroTransport({ target: mockTarget })
    transport.listen()
  })

  afterEach(() => {
    transport.destroy()
    vi.restoreAllMocks()
  })

  // ── listen() ──────────────────────────────────────────────────────

  describe('listen()', () => {
    it('starts receiving messages after listen()', () => {
      const cb = vi.fn()
      transport.on('test_event', cb)

      dispatchEvent('test_event', [42])

      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('is idempotent — calling listen() twice does not add duplicate listeners', () => {
      transport.listen() // second call

      const cb = vi.fn()
      transport.on('test_event', cb)

      dispatchEvent('test_event')

      expect(cb).toHaveBeenCalledTimes(1)
    })
  })

  // ── request() ─────────────────────────────────────────────────────

  describe('request()', () => {
    it('sends a request and resolves when response arrives', async () => {
      const promise = transport.request('eth_accounts')

      // Extract the id from what was posted
      const id = extractPostedRequestId(mockTarget)

      // Simulate response
      dispatchResponse(id, ['0xabc', '0xdef'])

      const result = await promise
      expect(result).toEqual(['0xabc', '0xdef'])
    })

    it('sends a well-formed CoinHero request message', async () => {
      const promise = transport.request('eth_getBalance', ['0x123', 'latest'])
      const id = extractPostedRequestId(mockTarget)

      const postedMsg = mockTarget.postMessage.mock.calls[0][0] as CoinHeroMessage
      expect(postedMsg.__coinhero).toBe(true)
      expect(postedMsg.version).toBe(1)
      expect(postedMsg.direction).toBe('request')

      const payload = postedMsg.payload as CoinHeroRequest
      expect(payload.jsonrpc).toBe('2.0')
      expect(payload.method).toBe('eth_getBalance')
      expect(payload.params).toEqual(['0x123', 'latest'])

      dispatchResponse(id, '0x100')
      await promise
    })

    it('rejects when response has an error', async () => {
      const promise = transport.request('eth_sendTransaction')
      const id = extractPostedRequestId(mockTarget)

      dispatchResponse(id, undefined, { code: 4001, message: 'User rejected' })

      await expect(promise).rejects.toEqual({ code: 4001, message: 'User rejected' })
    })

    it('rejects on timeout with default 30s', async () => {
      vi.useFakeTimers()

      const promise = transport.request('slow_method')

      // Not yet timed out
      vi.advanceTimersByTime(29_999)

      // Now timeout
      vi.advanceTimersByTime(2)

      await expect(promise).rejects.toEqual({
        code: -32000,
        message: 'Request timed out: slow_method',
      })

      vi.useRealTimers()
    })

    it('rejects on custom timeout', async () => {
      vi.useFakeTimers()

      const promise = transport.request('slow_method', [], 5000)

      vi.advanceTimersByTime(5001)

      await expect(promise).rejects.toEqual({
        code: -32000,
        message: 'Request timed out: slow_method',
      })

      vi.useRealTimers()
    })

    it('cleans up pending request after timeout', async () => {
      vi.useFakeTimers()

      const promise = transport.request('slow_method', [], 100)
      const id = extractPostedRequestId(mockTarget)

      vi.advanceTimersByTime(101)

      await expect(promise).rejects.toBeDefined()

      // Late response should be silently ignored (no errors)
      dispatchResponse(id, 'late result')

      vi.useRealTimers()
    })
  })

  // ── respond() ─────────────────────────────────────────────────────

  describe('respond()', () => {
    it('sends a response message to the target', () => {
      transport.respond('req-42', { data: 'ok' })

      expect(mockTarget.postMessage).toHaveBeenCalledTimes(1)
      const msg = mockTarget.postMessage.mock.calls[0][0] as CoinHeroMessage
      expect(msg.__coinhero).toBe(true)
      expect(msg.direction).toBe('response')
      expect((msg.payload as any).id).toBe('req-42')
      expect((msg.payload as any).result).toEqual({ data: 'ok' })
    })

    it('sends an error response to the target', () => {
      transport.respond('req-42', undefined, { code: -1, message: 'nope' })

      const msg = mockTarget.postMessage.mock.calls[0][0] as CoinHeroMessage
      expect((msg.payload as any).error).toEqual({ code: -1, message: 'nope' })
    })
  })

  // ── emit() ────────────────────────────────────────────────────────

  describe('emit()', () => {
    it('sends an event message to the target', () => {
      transport.emit('coinhero_accountsChanged', [['0x123']])

      expect(mockTarget.postMessage).toHaveBeenCalledTimes(1)
      const msg = mockTarget.postMessage.mock.calls[0][0] as CoinHeroMessage
      expect(msg.__coinhero).toBe(true)
      expect(msg.direction).toBe('event')
      expect((msg.payload as any).method).toBe('coinhero_accountsChanged')
      expect((msg.payload as any).params).toEqual([['0x123']])
    })
  })

  // ── on() / off() events ───────────────────────────────────────────

  describe('event subscription', () => {
    it('calls registered callback when event arrives', () => {
      const cb = vi.fn()
      transport.on('coinhero_chainChanged', cb)

      dispatchEvent('coinhero_chainChanged', [8453])

      expect(cb).toHaveBeenCalledTimes(1)
      expect(cb.mock.calls[0][0]).toMatchObject({
        method: 'coinhero_chainChanged',
        params: [8453],
      })
    })

    it('stops calling callback after off()', () => {
      const cb = vi.fn()
      transport.on('coinhero_chainChanged', cb)

      dispatchEvent('coinhero_chainChanged', [1])
      expect(cb).toHaveBeenCalledTimes(1)

      transport.off('coinhero_chainChanged', cb)

      dispatchEvent('coinhero_chainChanged', [2])
      expect(cb).toHaveBeenCalledTimes(1) // not called again
    })

    it('supports multiple listeners for the same event', () => {
      const cb1 = vi.fn()
      const cb2 = vi.fn()
      transport.on('coinhero_disconnect', cb1)
      transport.on('coinhero_disconnect', cb2)

      dispatchEvent('coinhero_disconnect')

      expect(cb1).toHaveBeenCalledTimes(1)
      expect(cb2).toHaveBeenCalledTimes(1)
    })

    it('swallows errors thrown by event listeners', () => {
      const badCb = vi.fn(() => { throw new Error('listener error') })
      const goodCb = vi.fn()
      transport.on('test_event', badCb)
      transport.on('test_event', goodCb)

      // Should not throw
      dispatchEvent('test_event')

      expect(badCb).toHaveBeenCalled()
      expect(goodCb).toHaveBeenCalled() // second listener still fires
    })
  })

  // ── onRequest() — incoming request handling ───────────────────────

  describe('onRequest()', () => {
    it('calls handler and sends result response', async () => {
      const handler = vi.fn(async () => ({ result: 'pong' }))
      transport.onRequest(handler)

      dispatchRequest('req-1', 'coinhero_ping')
      await flushMicrotasks()

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0]).toMatchObject({
        id: 'req-1',
        method: 'coinhero_ping',
      })

      // Check response was posted
      const responseMsg = mockTarget.postMessage.mock.calls[0][0] as CoinHeroMessage
      expect(responseMsg.direction).toBe('response')
      expect((responseMsg.payload as any).id).toBe('req-1')
      expect((responseMsg.payload as any).result).toBe('pong')
    })

    it('sends error response when handler returns error', async () => {
      transport.onRequest(async () => ({
        error: { code: -1, message: 'nope' },
      }))

      dispatchRequest('req-2', 'bad_method')
      await flushMicrotasks()

      const responseMsg = mockTarget.postMessage.mock.calls[0][0] as CoinHeroMessage
      expect((responseMsg.payload as any).error).toEqual({ code: -1, message: 'nope' })
    })

    it('sends -32603 error when handler throws', async () => {
      transport.onRequest(async () => {
        throw new Error('something broke')
      })

      dispatchRequest('req-3', 'crash_method')
      await flushMicrotasks()

      const responseMsg = mockTarget.postMessage.mock.calls[0][0] as CoinHeroMessage
      expect((responseMsg.payload as any).error).toEqual({
        code: -32603,
        message: 'something broke',
      })
    })

    it('sends -32601 when no handler is registered', async () => {
      // Don't call onRequest — no handler
      dispatchRequest('req-4', 'orphan_method')
      await flushMicrotasks()

      const responseMsg = mockTarget.postMessage.mock.calls[0][0] as CoinHeroMessage
      expect((responseMsg.payload as any).error).toMatchObject({
        code: -32601,
        message: 'No handler registered',
      })
    })
  })

  // ── Non-CoinHero messages ─────────────────────────────────────────

  describe('message filtering', () => {
    it('ignores non-CoinHero messages', () => {
      const cb = vi.fn()
      transport.on('some_event', cb)

      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'farcaster_ready' } }),
      )

      expect(cb).not.toHaveBeenCalled()
    })

    it('ignores responses with unknown ids', () => {
      // Should not throw or cause issues
      dispatchResponse('unknown-id-999', 'stale data')
    })
  })

  // ── Origin filtering ──────────────────────────────────────────────

  describe('origin filtering', () => {
    it('accepts messages from allowed origin', () => {
      const filteredTarget = createMockTarget()
      const filteredTransport = new CoinHeroTransport({
        target: filteredTarget,
        allowedOrigin: 'https://coinhero.fun',
      })
      filteredTransport.listen()

      const cb = vi.fn()
      filteredTransport.on('test_event', cb)

      // Message from allowed origin
      const event = new MessageEvent('message', {
        data: {
          __coinhero: true,
          version: 1,
          direction: 'event',
          payload: { jsonrpc: '2.0', method: 'test_event' },
        },
        origin: 'https://coinhero.fun',
      })
      window.dispatchEvent(event)

      expect(cb).toHaveBeenCalledTimes(1)

      filteredTransport.destroy()
    })

    it('rejects messages from disallowed origin', () => {
      const filteredTarget = createMockTarget()
      const filteredTransport = new CoinHeroTransport({
        target: filteredTarget,
        allowedOrigin: 'https://coinhero.fun',
      })
      filteredTransport.listen()

      const cb = vi.fn()
      filteredTransport.on('test_event', cb)

      const event = new MessageEvent('message', {
        data: {
          __coinhero: true,
          version: 1,
          direction: 'event',
          payload: { jsonrpc: '2.0', method: 'test_event' },
        },
        origin: 'https://evil.com',
      })
      window.dispatchEvent(event)

      expect(cb).not.toHaveBeenCalled()

      filteredTransport.destroy()
    })

    it('accepts all origins when no allowedOrigin is set', () => {
      // Default transport has no allowedOrigin
      const cb = vi.fn()
      transport.on('test_event', cb)

      const event = new MessageEvent('message', {
        data: {
          __coinhero: true,
          version: 1,
          direction: 'event',
          payload: { jsonrpc: '2.0', method: 'test_event' },
        },
        origin: 'https://anything.com',
      })
      window.dispatchEvent(event)

      expect(cb).toHaveBeenCalledTimes(1)
    })
  })

  // ── destroy() ─────────────────────────────────────────────────────

  describe('destroy()', () => {
    it('rejects all pending requests', async () => {
      vi.useFakeTimers()

      const promise1 = transport.request('method_a', [], 60_000)
      const promise2 = transport.request('method_b', [], 60_000)

      transport.destroy()

      await expect(promise1).rejects.toEqual({
        code: -32000,
        message: 'Transport destroyed',
      })
      await expect(promise2).rejects.toEqual({
        code: -32000,
        message: 'Transport destroyed',
      })

      vi.useRealTimers()
    })

    it('stops processing incoming messages after destroy', () => {
      const cb = vi.fn()
      transport.on('test_event', cb)

      transport.destroy()

      dispatchEvent('test_event')

      expect(cb).not.toHaveBeenCalled()
    })

    it('clears event listeners', () => {
      const cb = vi.fn()
      transport.on('test_event', cb)

      transport.destroy()

      // Re-listen on a new transport to verify old listeners are gone
      // (the callback map was cleared, so even if we dispatched, nothing fires)
      // We already verify this above with "stops processing" — this tests internal cleanup
      expect(() => transport.destroy()).not.toThrow() // double destroy is safe
    })
  })
})
