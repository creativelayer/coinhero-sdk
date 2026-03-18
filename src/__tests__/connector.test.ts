import { describe, expect, it, vi } from 'vitest'
import { coinHeroConnector } from '../app/connector.js'
import type { CoinHeroSDK } from '../app/sdk.js'

function createMockProvider() {
  const request = vi.fn(
    async ({ method }: { method: string; params?: unknown[] }) => {
      if (method === 'eth_requestAccounts') {
        return ['0x0000000000000000000000000000000000000001']
      }
      if (method === 'eth_accounts') {
        return ['0x0000000000000000000000000000000000000001']
      }
      if (method === 'eth_chainId') {
        return '0x1'
      }
      if (method === 'wallet_switchEthereumChain') {
        return null
      }
      return null
    },
  )

  return {
    request,
    on: vi.fn(),
    removeListener: vi.fn(),
  }
}

function createMockSdk(provider: ReturnType<typeof createMockProvider>) {
  return {
    provider,
    connected: true,
    isInCoinHero: vi.fn(async () => true),
  } as unknown as CoinHeroSDK
}

function createMockConfig() {
  return {
    chains: [{ id: 1 }],
    storage: {
      getItem: vi.fn(async () => undefined),
    },
    emitter: {
      emit: vi.fn(),
    },
  } as any
}

describe('coinHeroConnector', () => {
  it('registers provider listeners per connector instance', async () => {
    const providerA = createMockProvider()
    const connectorA = coinHeroConnector(createMockSdk(providerA))(createMockConfig())
    await connectorA.connect()
    expect(providerA.on).toHaveBeenCalledTimes(3)
    expect(providerA.on).toHaveBeenCalledWith('accountsChanged', expect.any(Function))
    expect(providerA.on).toHaveBeenCalledWith('chainChanged', expect.any(Function))
    expect(providerA.on).toHaveBeenCalledWith('disconnect', expect.any(Function))

    const providerB = createMockProvider()
    const connectorB = coinHeroConnector(createMockSdk(providerB))(createMockConfig())
    await connectorB.connect()

    expect(providerB.on).toHaveBeenCalledTimes(3)
    expect(providerB.on).toHaveBeenCalledWith('accountsChanged', expect.any(Function))
    expect(providerB.on).toHaveBeenCalledWith('chainChanged', expect.any(Function))
    expect(providerB.on).toHaveBeenCalledWith('disconnect', expect.any(Function))
  })

  it('disconnect removes only listeners for that connector instance', async () => {
    const providerA = createMockProvider()
    const connectorA = coinHeroConnector(createMockSdk(providerA))(createMockConfig())
    await connectorA.connect()

    const providerB = createMockProvider()
    const connectorB = coinHeroConnector(createMockSdk(providerB))(createMockConfig())
    await connectorB.connect()

    expect(providerA.removeListener).not.toHaveBeenCalled()
    expect(providerB.removeListener).not.toHaveBeenCalled()

    await connectorA.disconnect()

    expect(providerA.removeListener).toHaveBeenCalledTimes(3)
    expect(providerA.removeListener).toHaveBeenCalledWith('accountsChanged', expect.any(Function))
    expect(providerA.removeListener).toHaveBeenCalledWith('chainChanged', expect.any(Function))
    expect(providerA.removeListener).toHaveBeenCalledWith('disconnect', expect.any(Function))

    expect(providerB.removeListener).not.toHaveBeenCalled()

    await connectorB.disconnect()
    expect(providerB.removeListener).toHaveBeenCalledTimes(3)
    expect(providerB.removeListener).toHaveBeenCalledWith('accountsChanged', expect.any(Function))
    expect(providerB.removeListener).toHaveBeenCalledWith('chainChanged', expect.any(Function))
    expect(providerB.removeListener).toHaveBeenCalledWith('disconnect', expect.any(Function))
  })
})
