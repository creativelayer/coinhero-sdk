import { describe, it, expect, vi } from 'vitest'
import {
  isCoinHeroMessage,
  createRequest,
  createResponse,
  createEvent,
  type CoinHeroMessage,
} from '../core/protocol.js'

// ── isCoinHeroMessage ─────────────────────────────────────────────────

describe('isCoinHeroMessage', () => {
  it('returns true for a valid request message', () => {
    const msg: CoinHeroMessage = {
      __coinhero: true,
      version: 1,
      direction: 'request',
      payload: { jsonrpc: '2.0', id: 'abc', method: 'eth_accounts' },
    }
    expect(isCoinHeroMessage(msg)).toBe(true)
  })

  it('returns true for a valid response message', () => {
    const msg: CoinHeroMessage = {
      __coinhero: true,
      version: 1,
      direction: 'response',
      payload: { jsonrpc: '2.0', id: 'abc', result: 42 },
    }
    expect(isCoinHeroMessage(msg)).toBe(true)
  })

  it('returns true for a valid event message', () => {
    const msg: CoinHeroMessage = {
      __coinhero: true,
      version: 1,
      direction: 'event',
      payload: { jsonrpc: '2.0', method: 'coinhero_accountsChanged' },
    }
    expect(isCoinHeroMessage(msg)).toBe(true)
  })

  it('returns false for null', () => {
    expect(isCoinHeroMessage(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isCoinHeroMessage(undefined)).toBe(false)
  })

  it('returns false for a string', () => {
    expect(isCoinHeroMessage('hello')).toBe(false)
  })

  it('returns false for a number', () => {
    expect(isCoinHeroMessage(42)).toBe(false)
  })

  it('returns false for an empty object', () => {
    expect(isCoinHeroMessage({})).toBe(false)
  })

  it('returns false when __coinhero is false', () => {
    expect(isCoinHeroMessage({ __coinhero: false, version: 1, direction: 'request', payload: {} })).toBe(false)
  })

  it('returns false when __coinhero is truthy but not true', () => {
    expect(isCoinHeroMessage({ __coinhero: 1, version: 1, direction: 'request', payload: {} })).toBe(false)
  })
})

// ── createRequest ─────────────────────────────────────────────────────

describe('createRequest', () => {
  it('returns a well-formed request envelope', () => {
    const msg = createRequest('eth_accounts')
    expect(msg.__coinhero).toBe(true)
    expect(msg.version).toBe(1)
    expect(msg.direction).toBe('request')
  })

  it('has correct payload structure', () => {
    const msg = createRequest('eth_accounts')
    const payload = msg.payload as { jsonrpc: string; id: string; method: string }
    expect(payload.jsonrpc).toBe('2.0')
    expect(payload.method).toBe('eth_accounts')
    expect(typeof payload.id).toBe('string')
    expect(payload.id.length).toBeGreaterThan(0)
  })

  it('includes params when provided', () => {
    const msg = createRequest('eth_getBalance', ['0x123', 'latest'])
    const payload = msg.payload as { params?: unknown[] }
    expect(payload.params).toEqual(['0x123', 'latest'])
  })

  it('omits params when not provided', () => {
    const msg = createRequest('eth_accounts')
    expect('params' in msg.payload).toBe(false)
  })

  it('generates unique ids for each call', () => {
    const msg1 = createRequest('a')
    const msg2 = createRequest('b')
    const id1 = (msg1.payload as { id: string }).id
    const id2 = (msg2.payload as { id: string }).id
    expect(id1).not.toBe(id2)
  })
})

// ── createResponse ────────────────────────────────────────────────────

describe('createResponse', () => {
  it('returns a well-formed response envelope', () => {
    const msg = createResponse('req-1', 'ok')
    expect(msg.__coinhero).toBe(true)
    expect(msg.version).toBe(1)
    expect(msg.direction).toBe('response')
  })

  it('includes result when no error', () => {
    const msg = createResponse('req-1', { data: 42 })
    const payload = msg.payload as { id: string; result?: unknown; error?: unknown }
    expect(payload.id).toBe('req-1')
    expect(payload.result).toEqual({ data: 42 })
    expect('error' in payload).toBe(false)
  })

  it('includes error when provided', () => {
    const err = { code: -32600, message: 'Invalid request' }
    const msg = createResponse('req-2', undefined, err)
    const payload = msg.payload as { id: string; result?: unknown; error?: unknown }
    expect(payload.id).toBe('req-2')
    expect(payload.error).toEqual(err)
    expect('result' in payload).toBe(false)
  })

  it('preserves the request id', () => {
    const msg = createResponse('my-unique-id', null)
    expect((msg.payload as { id: string }).id).toBe('my-unique-id')
  })
})

// ── createEvent ───────────────────────────────────────────────────────

describe('createEvent', () => {
  it('returns a well-formed event envelope', () => {
    const msg = createEvent('coinhero_chainChanged')
    expect(msg.__coinhero).toBe(true)
    expect(msg.version).toBe(1)
    expect(msg.direction).toBe('event')
  })

  it('has correct payload structure', () => {
    const msg = createEvent('coinhero_chainChanged')
    const payload = msg.payload as { jsonrpc: string; method: string }
    expect(payload.jsonrpc).toBe('2.0')
    expect(payload.method).toBe('coinhero_chainChanged')
  })

  it('does not have an id', () => {
    const msg = createEvent('coinhero_disconnect')
    expect('id' in msg.payload).toBe(false)
  })

  it('includes params when provided', () => {
    const msg = createEvent('coinhero_accountsChanged', [['0xabc']])
    const payload = msg.payload as { params?: unknown[] }
    expect(payload.params).toEqual([['0xabc']])
  })

  it('omits params when not provided', () => {
    const msg = createEvent('coinhero_disconnect')
    expect('params' in msg.payload).toBe(false)
  })
})
