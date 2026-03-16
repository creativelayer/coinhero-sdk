/**
 * Wagmi connector for CoinHero mini apps.
 *
 * Routes all wallet operations through the CoinHero host's wallet
 * via postMessage. Follows the same pattern as @farcaster/miniapp-wagmi-connector.
 */
import { type CreateConnectorFn } from '@wagmi/core';
import { CoinHeroSDK } from './sdk.js';
/**
 * Create a wagmi connector that uses the CoinHero host's wallet.
 *
 * @param sdk - Optional CoinHeroSDK instance. If not provided, creates a new one.
 */
export declare function coinHeroConnector(sdk?: CoinHeroSDK): CreateConnectorFn;
export declare namespace coinHeroConnector {
    var type: "coinHero";
}
//# sourceMappingURL=connector.d.ts.map