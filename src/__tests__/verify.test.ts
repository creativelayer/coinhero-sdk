import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import type { KeyLike } from 'jose'

// ── Test key setup ────────────────────────────────────────────────────

let publicKey: KeyLike
let privateKey: KeyLike
let jwks: { keys: object[] }

beforeEach(async () => {
  // Generate a fresh ES256 key pair (matches CoinHero's algorithm)
  const pair = await generateKeyPair('ES256')
  publicKey = pair.publicKey
  privateKey = pair.privateKey

  const publicJwk = await exportJWK(publicKey)
  publicJwk.kid = 'test-key-1'
  publicJwk.alg = 'ES256'
  publicJwk.use = 'sig'

  jwks = { keys: [publicJwk] }
})

/** Create a real signed JWT for testing */
async function createTestJWT(
  claims: Record<string, unknown>,
  options?: { issuer?: string; expired?: boolean },
) {
  const builder = new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key-1' })
    .setIssuer(options?.issuer ?? 'https://coinhero.fun')
    .setIssuedAt()

  if (options?.expired) {
    builder.setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // 1 hour ago
  } else {
    builder.setExpirationTime('1h')
  }

  return builder.sign(privateKey)
}

/** Mock fetch to return JWKS */
function mockFetchJWKS(status = 200) {
  return vi.fn(async () => ({
    ok: status === 200,
    status,
    json: async () => jwks,
  })) as unknown as typeof globalThis.fetch
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('verifyCoinHeroToken', () => {
  // Use resetModules + dynamic import to get fresh module state (clean cache) per test
  let verifyCoinHeroToken: typeof import('../server/verify.js').verifyCoinHeroToken

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../server/verify.js')
    verifyCoinHeroToken = mod.verifyCoinHeroToken
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // ── Happy path ────────────────────────────────────────────────────

  it('verifies a valid token and returns lowercased wallet address', async () => {
    vi.stubGlobal('fetch', mockFetchJWKS())

    const token = await createTestJWT({ walletAddress: '0xAbCdEf1234567890' })
    const result = await verifyCoinHeroToken(token, {
      jwksUrl: 'https://test.local/jwks',
    })

    expect(result.walletAddress).toBe('0xabcdef1234567890')
    expect(result.payload).toBeDefined()
    expect(result.payload.iss).toBe('https://coinhero.fun')
  })

  it('returns full JWT payload alongside wallet address', async () => {
    vi.stubGlobal('fetch', mockFetchJWKS())

    const token = await createTestJWT({
      walletAddress: '0x123',
      customClaim: 'hello',
    })
    const result = await verifyCoinHeroToken(token, {
      jwksUrl: 'https://test.local/jwks',
    })

    expect(result.payload.customClaim).toBe('hello')
    expect(result.payload.iat).toBeDefined()
    expect(result.payload.exp).toBeDefined()
  })

  // ── Validation errors ─────────────────────────────────────────────

  it('throws when walletAddress claim is missing', async () => {
    vi.stubGlobal('fetch', mockFetchJWKS())

    const token = await createTestJWT({ someOtherClaim: 'value' })
    await expect(
      verifyCoinHeroToken(token, { jwksUrl: 'https://test.local/jwks' }),
    ).rejects.toThrow('CoinHero JWT missing walletAddress claim')
  })

  it('throws when walletAddress is not a string', async () => {
    vi.stubGlobal('fetch', mockFetchJWKS())

    const token = await createTestJWT({ walletAddress: 12345 })
    await expect(
      verifyCoinHeroToken(token, { jwksUrl: 'https://test.local/jwks' }),
    ).rejects.toThrow('CoinHero JWT missing walletAddress claim')
  })

  it('rejects a token with wrong issuer', async () => {
    vi.stubGlobal('fetch', mockFetchJWKS())

    const token = await createTestJWT(
      { walletAddress: '0x123' },
      { issuer: 'not-coinhero' },
    )
    await expect(
      verifyCoinHeroToken(token, { jwksUrl: 'https://test.local/jwks' }),
    ).rejects.toThrow()
  })

  it('rejects an expired token', async () => {
    vi.stubGlobal('fetch', mockFetchJWKS())

    const token = await createTestJWT(
      { walletAddress: '0x123' },
      { expired: true },
    )
    await expect(
      verifyCoinHeroToken(token, { jwksUrl: 'https://test.local/jwks' }),
    ).rejects.toThrow()
  })

  it('rejects a completely invalid token string', async () => {
    vi.stubGlobal('fetch', mockFetchJWKS())

    await expect(
      verifyCoinHeroToken('not.a.jwt', { jwksUrl: 'https://test.local/jwks' }),
    ).rejects.toThrow()
  })

  // ── JWKS fetch errors ─────────────────────────────────────────────

  it('throws when JWKS endpoint returns non-200', async () => {
    vi.stubGlobal('fetch', mockFetchJWKS(500))

    const token = await createTestJWT({ walletAddress: '0x123' })
    await expect(
      verifyCoinHeroToken(token, { jwksUrl: 'https://test.local/jwks' }),
    ).rejects.toThrow('Failed to fetch CoinHero JWKS from https://test.local/jwks: 500')
  })

  it('throws when JWKS endpoint returns 404', async () => {
    vi.stubGlobal('fetch', mockFetchJWKS(404))

    const token = await createTestJWT({ walletAddress: '0x123' })
    await expect(
      verifyCoinHeroToken(token, { jwksUrl: 'https://test.local/jwks' }),
    ).rejects.toThrow('Failed to fetch CoinHero JWKS from https://test.local/jwks: 404')
  })

  // ── JWKS caching ──────────────────────────────────────────────────

  it('caches JWKS and reuses on second call', async () => {
    const fetchMock = mockFetchJWKS()
    vi.stubGlobal('fetch', fetchMock)

    const token1 = await createTestJWT({ walletAddress: '0xaaa' })
    const token2 = await createTestJWT({ walletAddress: '0xbbb' })

    await verifyCoinHeroToken(token1, { jwksUrl: 'https://test.local/jwks' })
    await verifyCoinHeroToken(token2, { jwksUrl: 'https://test.local/jwks' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('invalidates cache when URL changes', async () => {
    const fetchMock = mockFetchJWKS()
    vi.stubGlobal('fetch', fetchMock)

    const token = await createTestJWT({ walletAddress: '0xaaa' })

    await verifyCoinHeroToken(token, { jwksUrl: 'https://a.local/jwks' })
    await verifyCoinHeroToken(token, { jwksUrl: 'https://b.local/jwks' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refetches JWKS after cache TTL expires', async () => {
    vi.useFakeTimers()
    const fetchMock = mockFetchJWKS()
    vi.stubGlobal('fetch', fetchMock)

    // Use a long-lived token so it doesn't expire when we advance the clock
    const token = await new SignJWT({ walletAddress: '0xaaa' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key-1' })
      .setIssuer('https://coinhero.fun')
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(privateKey)

    await verifyCoinHeroToken(token, { jwksUrl: 'https://test.local/jwks' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Advance past the 1-hour JWKS cache TTL (but within 24h JWT expiry)
    vi.advanceTimersByTime(61 * 60 * 1000)

    await verifyCoinHeroToken(token, { jwksUrl: 'https://test.local/jwks' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  // ── JWKS URL resolution ───────────────────────────────────────────

  it('uses options.jwksUrl when provided', async () => {
    const fetchMock = mockFetchJWKS()
    vi.stubGlobal('fetch', fetchMock)

    const token = await createTestJWT({ walletAddress: '0x123' })
    await verifyCoinHeroToken(token, { jwksUrl: 'https://custom.local/jwks' })

    expect(fetchMock).toHaveBeenCalledWith('https://custom.local/jwks')
  })

  it('uses COINHERO_JWKS_URL env var when no options.jwksUrl', async () => {
    const fetchMock = mockFetchJWKS()
    vi.stubGlobal('fetch', fetchMock)
    process.env.COINHERO_JWKS_URL = 'https://env.local/jwks'

    const token = await createTestJWT({ walletAddress: '0x123' })
    await verifyCoinHeroToken(token, {})

    expect(fetchMock).toHaveBeenCalledWith('https://env.local/jwks')

    delete process.env.COINHERO_JWKS_URL
  })

  it('falls back to default URL when no option or env var', async () => {
    const fetchMock = mockFetchJWKS()
    vi.stubGlobal('fetch', fetchMock)
    delete process.env.COINHERO_JWKS_URL

    const token = await createTestJWT({ walletAddress: '0x123' })
    await verifyCoinHeroToken(token)

    expect(fetchMock).toHaveBeenCalledWith('https://coinhero.fun/api/auth/jwks')
  })

  it('options.jwksUrl takes precedence over env var', async () => {
    const fetchMock = mockFetchJWKS()
    vi.stubGlobal('fetch', fetchMock)
    process.env.COINHERO_JWKS_URL = 'https://env.local/jwks'

    const token = await createTestJWT({ walletAddress: '0x123' })
    await verifyCoinHeroToken(token, { jwksUrl: 'https://option.local/jwks' })

    expect(fetchMock).toHaveBeenCalledWith('https://option.local/jwks')

    delete process.env.COINHERO_JWKS_URL
  })
})
