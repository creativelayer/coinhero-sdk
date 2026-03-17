# @coinhero/sdk

SDK for building apps that run inside the CoinHero platform. Provides a postMessage bridge between embedded apps (iframes) and the CoinHero host, including wallet proxying, authentication, and a wagmi connector.

## Architecture

```
CoinHero Host (parent window)
├── Connected wallet (MetaMask, Coinbase, etc.)
├── SIWE auth session (JWT)
└── CoinHeroHost ← manages iframe communication
        │
        │  postMessage (JSON-RPC 2.0)
        │
        ▼
Embedded App (iframe)
├── CoinHeroSDK ← talks to host
├── CoinHeroEthProvider ← EIP-1193 provider
└── coinHeroConnector ← wagmi connector
```

The SDK has three entry points for different contexts:

| Entry point | Import | Environment | Purpose |
|---|---|---|---|
| **App** | `@coinhero/sdk` | Browser (iframe) | SDK for mini apps running inside CoinHero |
| **Host** | `@coinhero/sdk/host` | Browser (parent) | SDK for the CoinHero launcher |
| **Server** | `@coinhero/sdk/server` | Node.js | JWT verification for app backends |

## Installation

```bash
npm install @coinhero/sdk
```

## App SDK (mini apps)

Used by apps (Plinks, Rips, etc.) running inside a CoinHero iframe.

### Detecting the CoinHero environment

```ts
import { CoinHeroSDK } from '@coinhero/sdk'

const sdk = new CoinHeroSDK()

if (await sdk.isInCoinHero()) {
  console.log('Running inside CoinHero')
  console.log('Wallet:', sdk.context?.address)
  console.log('Chain:', sdk.context?.chainId)
}
```

### Using with wagmi

The SDK includes a wagmi connector that routes all wallet operations through the host:

```ts
import { coinHeroConnector } from '@coinhero/sdk/connector'
import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'

const config = createConfig({
  chains: [base],
  connectors: [coinHeroConnector()],
  transports: { [base.id]: http() },
})
```

### Using the EIP-1193 provider directly

If you're not using wagmi, you can use the provider directly with viem or ethers:

```ts
const sdk = new CoinHeroSDK()
await sdk.isInCoinHero()

// EIP-1193 compatible
const accounts = await sdk.provider.request({ method: 'eth_requestAccounts' })
const balance = await sdk.provider.request({
  method: 'eth_getBalance',
  params: [accounts[0], 'latest'],
})
```

### Authentication

Request a CoinHero auth token to exchange for an app-specific session:

```ts
const auth = await sdk.getAuthToken()
// auth = { token, approvalMessage, approvalSignature }

// Exchange with your backend
const res = await fetch('/api/auth/coinhero', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(auth),
})
const { token: sessionToken } = await res.json()
```

### Lifecycle actions

```ts
// Signal that the app has loaded
await sdk.actions.ready()

// Request the host to close this app
await sdk.actions.close()
```

### Events

The SDK emits wallet events from the host:

```ts
sdk.provider.on('accountsChanged', (accounts) => { ... })
sdk.provider.on('chainChanged', (chainId) => { ... })
sdk.provider.on('disconnect', () => { ... })
```

## Host SDK (CoinHero launcher)

Used by the CoinHero app to manage communication with embedded mini apps.

```ts
import { CoinHeroHost } from '@coinhero/sdk/host'

const host = new CoinHeroHost({
  iframe: document.getElementById('app-frame') as HTMLIFrameElement,

  context: {
    address: '0x1234...', // connected wallet
    chainId: 8453,        // Base
    hostVersion: '1.0.0',
  },

  // Proxy wallet requests to the real wallet
  onWalletRequest: async (method, params) => {
    return walletClient.request({ method, params })
  },

  // Provide auth token when the app requests it
  onAuthTokenRequest: async () => {
    return {
      token: sessionStorage.getItem('coinhero-auth-token'),
      approvalMessage: localStorage.getItem(`approval:${appName}:message`),
      approvalSignature: localStorage.getItem(`approval:${appName}:signature`),
    }
  },

  onReady: () => console.log('App loaded'),
  onClose: () => console.log('App wants to close'),
})

host.listen()

// Notify app of wallet changes
host.emitAccountsChanged([newAddress])
host.emitChainChanged(8453)
host.emitDisconnect()

// Clean up
host.destroy()
```

## Server SDK (app backends)

Used by app backends to verify CoinHero JWTs during the token exchange flow.

```bash
# jose is a peer dependency for the server module
npm install jose
```

```ts
import { verifyCoinHeroToken } from '@coinhero/sdk/server'

// Verify a CoinHero JWT against the JWKS endpoint
const { walletAddress, payload } = await verifyCoinHeroToken(token)
```

The JWKS URL defaults to `https://coinhero.fun/api/auth/jwks`. Override for local development:

```ts
// Via options
const result = await verifyCoinHeroToken(token, {
  jwksUrl: 'https://paul-coinhero.remx.xyz/api/auth/jwks',
})

// Or via environment variable
// COINHERO_JWKS_URL=https://paul-coinhero.remx.xyz/api/auth/jwks
```

JWKS responses are cached for 1 hour automatically.

### Example: token exchange endpoint

A typical app backend exchange endpoint verifies the CoinHero JWT and the user's per-app approval signature, then issues an app-specific session:

```ts
import { verifyCoinHeroToken } from '@coinhero/sdk/server'

export async function POST(request: Request) {
  const { token, approvalMessage, approvalSignature } = await request.json()

  // 1. Verify the CoinHero JWT
  const { walletAddress } = await verifyCoinHeroToken(token)

  // 2. Verify the approval signature (EIP-191)
  const isValid = await publicClient.verifyMessage({
    address: walletAddress,
    message: approvalMessage,
    signature: approvalSignature,
  })

  // 3. Check approval is for this app
  if (!approvalMessage.includes('myapp')) throw new Error('Wrong app')

  // 4. Issue app-specific session
  const sessionToken = await signSessionJwt({ walletAddress })
  return Response.json({ token: sessionToken })
}
```

## Wire Protocol

All communication uses JSON-RPC 2.0 payloads wrapped in a CoinHero envelope:

```json
{
  "__coinhero": true,
  "version": 1,
  "direction": "request" | "response" | "event",
  "payload": {
    "jsonrpc": "2.0",
    "id": "uuid",
    "method": "eth_sendTransaction",
    "params": [...]
  }
}
```

The `__coinhero: true` flag distinguishes SDK messages from other postMessage traffic (e.g., Farcaster SDK).

### Methods

| Method | Direction | Description |
|---|---|---|
| `coinhero_ping` | app -> host | Detection/handshake, returns context |
| `coinhero_context` | app -> host | Refresh context |
| `coinhero_ready` | app -> host | App signals it has loaded |
| `coinhero_close` | app -> host | App requests to be closed |
| `coinhero_getAuthToken` | app -> host | Request JWT + approval for auth |
| `eth_*` | app -> host | All Ethereum JSON-RPC methods |

### Events (host -> app)

| Event | Description |
|---|---|
| `coinhero_accountsChanged` | Wallet account changed |
| `coinhero_chainChanged` | Network changed |
| `coinhero_disconnect` | Wallet disconnected |

## Auth Flow

```
User                CoinHero          App (iframe)        App Backend
 │                     │                    │                   │
 │  1. SIWE sign-in    │                    │                   │
 │────────────────────>│                    │                   │
 │                     │  2. JWT issued     │                   │
 │                     │  (sessionStorage)  │                   │
 │                     │                    │                   │
 │                     │  3. Opens app      │                   │
 │                     │───────────────────>│                   │
 │                     │                    │                   │
 │                     │  4. getAuthToken() │                   │
 │                     │<───────────────────│                   │
 │                     │                    │                   │
 │  5. Sign approval   │                    │                   │
 │     (first time)    │                    │                   │
 │<────────────────────│                    │                   │
 │────────────────────>│                    │                   │
 │                     │                    │                   │
 │                     │  6. {token,        │                   │
 │                     │   approval*}       │                   │
 │                     │───────────────────>│                   │
 │                     │                    │                   │
 │                     │                    │  7. POST /api/    │
 │                     │                    │  auth/coinhero     │
 │                     │                    │─────────────────>│
 │                     │                    │                   │
 │                     │                    │                   │ 8. Verify JWT
 │                     │                    │                   │    (JWKS)
 │                     │                    │                   │ 9. Verify
 │                     │                    │                   │    approval sig
 │                     │                    │                   │
 │                     │                    │  10. App session  │
 │                     │                    │<─────────────────│
```

## License

Private - Creative Layer
