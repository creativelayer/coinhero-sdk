/**
 * Server-side CoinHero token verification.
 *
 * Used by app backends (Plinks, Rips, etc.) to verify CoinHero JWTs
 * and approval signatures during the token exchange flow.
 */
import * as jose from 'jose';
export interface CoinHeroTokenPayload {
    /** Wallet address from the JWT (lowercased) */
    walletAddress: string;
    /** Full decoded JWT payload */
    payload: jose.JWTPayload;
}
export interface VerifyOptions {
    /**
     * Override the JWKS URL.
     * Defaults to COINHERO_JWKS_URL env var, then https://coinhero.fun/api/auth/jwks
     */
    jwksUrl?: string;
}
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
export declare function verifyCoinHeroToken(token: string, options?: VerifyOptions): Promise<CoinHeroTokenPayload>;
//# sourceMappingURL=verify.d.ts.map