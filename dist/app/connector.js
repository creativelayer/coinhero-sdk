/**
 * Wagmi connector for CoinHero mini apps.
 *
 * Routes all wallet operations through the CoinHero host's wallet
 * via postMessage. Follows the same pattern as @farcaster/miniapp-wagmi-connector.
 */
import { createConnector } from '@wagmi/core';
import { getAddress, numberToHex } from 'viem';
import { CoinHeroSDK } from './sdk.js';
coinHeroConnector.type = 'coinHero';
/**
 * Create a wagmi connector that uses the CoinHero host's wallet.
 *
 * @param sdk - Optional CoinHeroSDK instance. If not provided, creates a new one.
 */
export function coinHeroConnector(sdk) {
    const _sdk = sdk ?? new CoinHeroSDK();
    let accountsChanged;
    let chainChanged;
    let disconnectHandler;
    return createConnector((config) => ({
        id: 'coinHero',
        name: 'CoinHero',
        type: coinHeroConnector.type,
        async connect({ chainId } = {}) {
            const provider = _sdk.provider;
            const accounts = (await provider.request({
                method: 'eth_requestAccounts',
            }));
            let targetChainId = chainId;
            if (!targetChainId) {
                const state = (await config.storage?.getItem('state'));
                const isChainSupported = config.chains.some((x) => x.id === state?.chainId);
                if (isChainSupported)
                    targetChainId = state?.chainId;
                else
                    targetChainId = config.chains[0]?.id;
            }
            if (!targetChainId)
                throw new Error('No chains found on connector.');
            if (!accountsChanged) {
                accountsChanged = this.onAccountsChanged.bind(this);
                provider.on('accountsChanged', accountsChanged);
            }
            if (!chainChanged) {
                chainChanged = this.onChainChanged.bind(this);
                provider.on('chainChanged', chainChanged);
            }
            if (!disconnectHandler) {
                disconnectHandler = this.onDisconnect.bind(this);
                provider.on('disconnect', disconnectHandler);
            }
            let currentChainId = await this.getChainId();
            if (targetChainId && currentChainId !== targetChainId) {
                const chain = await this.switchChain({ chainId: targetChainId });
                currentChainId = chain.id;
            }
            return {
                accounts: accounts.map((x) => getAddress(x)),
                chainId: currentChainId,
            };
        },
        async disconnect() {
            const provider = _sdk.provider;
            if (accountsChanged) {
                provider.removeListener('accountsChanged', accountsChanged);
                accountsChanged = undefined;
            }
            if (chainChanged) {
                provider.removeListener('chainChanged', chainChanged);
                chainChanged = undefined;
            }
            if (disconnectHandler) {
                provider.removeListener('disconnect', disconnectHandler);
                disconnectHandler = undefined;
            }
        },
        async getAccounts() {
            const accounts = (await _sdk.provider.request({
                method: 'eth_accounts',
            }));
            return accounts.map((x) => getAddress(x));
        },
        async getChainId() {
            const hexChainId = (await _sdk.provider.request({ method: 'eth_chainId' }));
            return parseInt(hexChainId, 16);
        },
        async isAuthorized() {
            try {
                if (!_sdk.connected) {
                    const inCoinHero = await _sdk.isInCoinHero();
                    if (!inCoinHero)
                        return false;
                }
                const accounts = await this.getAccounts();
                return !!accounts.length;
            }
            catch {
                return false;
            }
        },
        async switchChain({ chainId }) {
            const chain = config.chains.find((x) => x.id === chainId);
            if (!chain) {
                throw new Error(`Chain ${chainId} not configured`);
            }
            await _sdk.provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: numberToHex(chainId) }],
            });
            config.emitter.emit('change', { chainId });
            return chain;
        },
        onAccountsChanged(accounts) {
            if (accounts.length === 0) {
                this.onDisconnect();
            }
            else {
                config.emitter.emit('change', {
                    accounts: accounts.map((x) => getAddress(x)),
                });
            }
        },
        onChainChanged(chain) {
            const chainId = Number(chain);
            config.emitter.emit('change', { chainId });
        },
        async onDisconnect() {
            config.emitter.emit('disconnect');
        },
        async getProvider() {
            return _sdk.provider;
        },
    }));
}
//# sourceMappingURL=connector.js.map