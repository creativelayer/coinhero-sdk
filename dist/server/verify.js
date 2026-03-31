/**
 * Server-side CoinHero token verification.
 *
 * Used by app backends (Plinks, Rips, etc.) to verify CoinHero JWTs
 * and approval signatures during the token exchange flow.
 */
import * as jose from 'jose';
// ── Constants ─────────────────────────────────────────────────────────
const DEFAULT_JWKS_URL = 'https://coinhero.fun/api/auth/jwks';
const COINHERO_ISSUER = 'https://coinhero.fun';
const JWKS_CACHE_TTL = 60 * 60 * 1000; // 1 hour
// ── JWKS Cache ────────────────────────────────────────────────────────
let cachedJWKS = null;
let jwksCachedAt = 0;
let cachedJwksUrl = null;
async function fetchJWKS(jwksUrl) {
    // Invalidate cache if URL changed
    if (cachedJwksUrl !== jwksUrl) {
        cachedJWKS = null;
        jwksCachedAt = 0;
        cachedJwksUrl = jwksUrl;
    }
    if (cachedJWKS && Date.now() - jwksCachedAt < JWKS_CACHE_TTL) {
        return cachedJWKS;
    }
    const res = await fetch(jwksUrl);
    if (!res.ok) {
        throw new Error(`Failed to fetch CoinHero JWKS from ${jwksUrl}: ${res.status}`);
    }
    cachedJWKS = await res.json();
    jwksCachedAt = Date.now();
    return cachedJWKS;
}
// ── Public API ────────────────────────────────────────────────────────
/**
 * Verify a CoinHero JWT token against the CoinHero JWKS endpoint.
 *
 * Returns the wallet address and full JWT payload on success.
 * Throws on invalid/expired tokens.
 *
 * @example
 * ```ts
 * import { verifyCoinHeroToken } from '@coinhero/sdk/server'
 *
 * const { walletAddress } = await verifyCoinHeroToken(token)
 * ```
 */
export async function verifyCoinHeroToken(token, options) {
    const jwksUrl = options?.jwksUrl ??
        (typeof process !== 'undefined' ? process.env?.COINHERO_JWKS_URL : undefined) ??
        DEFAULT_JWKS_URL;
    const jwks = await fetchJWKS(jwksUrl);
    const keySet = jose.createLocalJWKSet(jwks);
    const { payload } = await jose.jwtVerify(token, keySet, {
        issuer: COINHERO_ISSUER,
    });
    if (typeof payload.walletAddress !== 'string') {
        throw new Error('CoinHero JWT missing walletAddress claim');
    }
    return {
        walletAddress: payload.walletAddress.toLowerCase(),
        payload,
    };
}
//# sourceMappingURL=verify.js.map