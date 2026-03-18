// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CoinHeroHost } from '../host/host.js'

function dispatchRequest(options: {
  id: string
  method: string
  source?: MessageEventSource | null
  origin?: string
}) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        __coinhero: true,
        version: 1,
        direction: 'request',
        payload: {
          jsonrpc: '2.0',
          id: options.id,
          method: options.method,
        },
      },
      source: options.source,
      origin: options.origin,
    }),
  )
}

function flushMicrotasks() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

describe('CoinHeroHost', () => {
  let iframe: HTMLIFrameElement
  let postMessageSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    iframe = document.createElement('iframe')
    document.body.appendChild(iframe)
    postMessageSpy = vi.spyOn(iframe.contentWindow!, 'postMessage')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('ignores requests that do not come from the configured iframe source', async () => {
    const onWalletRequest = vi.fn(async () => '0x1')

    const host = new CoinHeroHost({
      iframe,
      context: {
        address: '0x0000000000000000000000000000000000000001',
        chainId: 1,
        hostVersion: '1.0.0',
      },
      onWalletRequest,
    })
    host.listen()

    dispatchRequest({
      id: 'evil-1',
      method: 'eth_chainId',
      source: window,
      origin: 'https://evil.com',
    })
    await flushMicrotasks()

    expect(onWalletRequest).not.toHaveBeenCalled()
    expect(postMessageSpy).not.toHaveBeenCalled()
  })

  it('handles requests from the configured iframe source', async () => {
    const onWalletRequest = vi.fn(async () => '0x1')

    const host = new CoinHeroHost({
      iframe,
      context: {
        address: '0x0000000000000000000000000000000000000001',
        chainId: 1,
        hostVersion: '1.0.0',
      },
      onWalletRequest,
    })
    host.listen()

    dispatchRequest({
      id: 'req-1',
      method: 'eth_chainId',
      source: iframe.contentWindow,
      origin: 'https://coinhero.fun',
    })
    await flushMicrotasks()

    expect(onWalletRequest).toHaveBeenCalledTimes(1)
    expect(onWalletRequest).toHaveBeenCalledWith('eth_chainId', undefined)
    expect(postMessageSpy).toHaveBeenCalledTimes(1)
  })
})
