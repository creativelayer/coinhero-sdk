/**
 * EIP-1193 provider that routes JSON-RPC requests to the CoinHero host.
 *
 * This provider is used by the wagmi connector and can also be used
 * directly with viem or ethers.
 */

import type { CoinHeroTransport } from '../core/transport.js'

type EventMap = {
  accountsChanged: [string[]]
  chainChanged: [string]
  disconnect: [{ code: number; message: string }]
  connect: [{ chainId: string }]
}

type EventName = keyof EventMap
type EventCallback<T extends EventName> = (...args: EventMap[T]) => void

export class CoinHeroEthProvider {
  private transport: CoinHeroTransport
  private listeners = new Map<string, Set<Function>>()

  constructor(transport: CoinHeroTransport) {
    this.transport = transport
  }

  /** EIP-1193 request method */
  async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
    // Route all eth_* requests through the host
    const result = await this.transport.request(args.method, args.params, 120_000)
    return result
  }

  /** EIP-1193 event emitter */
  on<T extends EventName>(event: T, callback: EventCallback<T>): this {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(callback)
    return this
  }

  removeListener<T extends EventName>(event: T, callback: EventCallback<T>): this {
    this.listeners.get(event)?.delete(callback)
    return this
  }

  // ── Internal event emitters (called by SDK) ────────────────────────

  emitAccountsChanged(accounts: string[]): void {
    this.emit('accountsChanged', accounts)
  }

  emitChainChanged(chainId: number): void {
    this.emit('chainChanged', '0x' + chainId.toString(16))
  }

  emitDisconnect(): void {
    this.emit('disconnect', { code: 4900, message: 'Disconnected' })
  }

  emitConnect(chainId: number): void {
    this.emit('connect', { chainId: '0x' + chainId.toString(16) })
  }

  // ── Private ────────────────────────────────────────────────────────

  private emit(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event)
    if (set) {
      for (const cb of set) {
        try {
          (cb as Function)(...args)
        } catch {
          // Don't let listener errors propagate
        }
      }
    }
  }
}
