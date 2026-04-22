# Launchpad Frontend Integration Guide

Base URL: `POST/GET/PUT/DELETE /api/...`

Auth: all protected endpoints require `Authorization: Bearer <privy-token>` header.
Public endpoints require no auth.

---

## Endpoints at a Glance

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/launchpad/tokens/initiate` | Yes | Build unsigned creation tx |
| POST | `/api/launchpad/tokens/confirm` | Yes | Broadcast signed tx, save token |
| GET | `/api/launchpad/tokens` | Yes | My tokens (paginated) |
| GET | `/api/launchpad/tokens/:id` | Yes | Get one token |
| GET | `/api/launchpad/tokens/public` | No | All confirmed tokens (paginated) |
| PUT | `/api/launchpad/tokens/profile` | Yes | Upsert my DeFi profile |
| GET | `/api/launchpad/tokens/profile/me` | Yes | Get my DeFi profile |
| POST | `/api/launchpad/follow` | Yes | Follow a wallet |
| DELETE | `/api/launchpad/follow` | Yes | Unfollow a wallet |
| GET | `/api/launchpad/follow/check` | Yes | Check if following a wallet |

---

## Token Creation Flow

```
1. POST /initiate  → backend uploads image+metadata to IPFS, returns unsigned tx(s)
2. Wallet signs    → user approves in wallet
3. POST /confirm   → backend broadcasts, waits for on-chain confirmation, saves to DB
```

### 1. POST /api/launchpad/tokens/initiate

Request body:

```ts
{
  name: string           // required, max 255
  symbol: string         // required, max 50
  walletPublicKey: string // required — creator's base58 wallet address
  imageBase64: string    // required — base64 encoded image bytes (no data: prefix)
  imageFilename: string  // required — e.g. "token.png"

  description?: string   // max 1000
  website?: string       // max 500
  twitter?: string       // max 255
  telegram?: string      // max 255
  decimals?: number      // default 6
  buyAmount?: string     // SOL as decimal string e.g. "0.5" — omit for create-only
  slippage?: number      // basis points, default 100 (= 1%)
  tokenCA?: string       // vanity mint address if pre-generated
}
```

Convert image file to base64:

```ts
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
```

Response:

```ts
{
  success: true,
  data: {
    transactions: string[]   // base64 VersionedTransaction(s) — sign all of them
    mintAddress: string      // save this — needed for confirm
    imageUri: string         // IPFS image URL
    metadataUri: string      // IPFS metadata URL
    network: 'mainnet' | 'devnet'
  }
}
```

### 2. Sign transactions

```ts
import { VersionedTransaction } from '@solana/web3.js'

const txs = initiated.transactions.map((b64) =>
  VersionedTransaction.deserialize(Uint8Array.from(Buffer.from(b64, 'base64')))
)

const signed = await signAllTransactions(txs)
```

### 3. POST /api/launchpad/tokens/confirm

The backend broadcasts, waits for confirmation, verifies on-chain, then saves to DB.
If success is returned, the token is guaranteed on-chain and in the database.

Send the last signed transaction as base64:

```ts
const signedBase64 = Buffer.from(signed[signed.length - 1].serialize()).toString('base64')
```

Request body:

```ts
{
  name: string              // required
  symbol: string            // required
  ca: string                // mintAddress from initiate response
  signedTransaction: string // base64 signed tx — backend broadcasts

  description?: string
  imageUrl?: string         // imageUri from initiate response
}
```

Response:

```ts
{
  success: true,
  data: {
    id: string
    userId: string
    name: string
    symbol: string
    ca: string           // mint address
    description: string | null
    imageUrl: string | null
    txSignature: string
    confirmed: true
    createdAt: string
    updatedAt: string
  }
}
```

### Full example (React + wallet adapter)

```tsx
import { useWallet } from '@solana/wallet-adapter-react'
import { VersionedTransaction } from '@solana/web3.js'

function CreateTokenForm() {
  const { publicKey, signAllTransactions } = useWallet()
  const [status, setStatus] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!publicKey || !signAllTransactions) return

    const form = e.currentTarget
    const imageFile = (form.elements.namedItem('image') as HTMLInputElement).files![0]
    const name = (form.elements.namedItem('name') as HTMLInputElement).value
    const symbol = (form.elements.namedItem('symbol') as HTMLInputElement).value
    const buyAmount = (form.elements.namedItem('buyAmount') as HTMLInputElement).value || undefined

    try {
      // Step 1 — initiate
      setStatus('Uploading to IPFS and building transaction...')
      const imageBase64 = await fileToBase64(imageFile)

      const initiateRes = await fetch('/api/launchpad/tokens/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getPrivyToken()}`,
        },
        body: JSON.stringify({
          name, symbol, buyAmount,
          walletPublicKey: publicKey.toBase58(),
          imageBase64,
          imageFilename: imageFile.name,
        }),
      })
      const { data: initiated } = await initiateRes.json()

      // Step 2 — sign
      setStatus('Waiting for wallet signature...')
      const txs = initiated.transactions.map((b64: string) =>
        VersionedTransaction.deserialize(Uint8Array.from(Buffer.from(b64, 'base64')))
      )
      const signed = await signAllTransactions(txs)
      const signedBase64 = Buffer.from(signed[signed.length - 1].serialize()).toString('base64')

      // Step 3 — confirm (backend broadcasts + waits)
      setStatus('Confirming on-chain...')
      const confirmRes = await fetch('/api/launchpad/tokens/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getPrivyToken()}`,
        },
        body: JSON.stringify({
          name, symbol,
          ca: initiated.mintAddress,
          signedTransaction: signedBase64,
          imageUrl: initiated.imageUri,
        }),
      })
      const { data: token } = await confirmRes.json()
      setStatus(`Done! Mint address: ${token.ca}`)
    } catch (err: any) {
      setStatus(`Error: ${err.message}`)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" placeholder="Token name" required />
      <input name="symbol" placeholder="Symbol" required />
      <input name="image" type="file" accept="image/*" required />
      <input name="buyAmount" placeholder="Initial buy SOL (optional)" />
      <button type="submit">Create Token</button>
      <p>{status}</p>
    </form>
  )
}
```

---

## Token Lists

### GET /api/launchpad/tokens/public — all confirmed tokens (no auth)

```
GET /api/launchpad/tokens/public?page=1&limit=20
```

Response:

```ts
{
  success: true,
  data: {
    data: Token[]
    meta: {
      page: number
      limit: number       // max 100
      total: number
      totalPages: number
      hasNext: boolean
      hasPrev: boolean
    }
  }
}
```

### GET /api/launchpad/tokens — my tokens (auth required)

```
GET /api/launchpad/tokens?page=1&limit=20
Authorization: Bearer <token>
```

Same response shape as public list.

### GET /api/launchpad/tokens/:id — get one token (auth required)

```
GET /api/launchpad/tokens/uuid-here
Authorization: Bearer <token>
```

---

## DeFi Profile

One profile per user. All fields optional — send only what you want to update.

### PUT /api/launchpad/tokens/profile — upsert (auth required)

```ts
// Request
{
  name?: string          // max 255
  avatarUrl?: string     // must be a valid URL, max 500
  bio?: string           // max 1000
  walletAddress?: string // base58 wallet address — required for follower count to work
}

// Response
{
  success: true,
  data: {
    id: string
    userId: string
    name: string | null
    avatarUrl: string | null
    bio: string | null
    walletAddress: string | null
    followingCount: number   // wallets this user is following
    followersCount: number   // users following this wallet (0 if walletAddress not set)
    createdAt: string
    updatedAt: string
  }
}
```

Send `walletAddress` at least on the first upsert — it is what ties the follow graph to the profile. Without it `followersCount` will always return 0.

### GET /api/launchpad/tokens/profile/me — get my profile (auth required)

Returns same shape as upsert response. Returns `null` data if profile not yet created.

---

## Follow / Unfollow

Pass the **wallet address** of the user you want to follow. No validation is done on whether that wallet exists.

### POST /api/launchpad/follow — follow (auth required)

```ts
// Request
{ walletAddress: string }

// Response
{ success: true, data: { followed: true } }
```

Idempotent — calling twice does not error.

### DELETE /api/launchpad/follow — unfollow (auth required)

```ts
// Request
{ walletAddress: string }

// Response
{ success: true, data: { unfollowed: true } }
```

Safe to call even if not currently following.

### GET /api/launchpad/follow/check?walletAddress=xxx — check status (auth required)

```ts
// Response
{ success: true, data: { following: boolean } }
```

---

## TypeScript Types

```ts
interface Token {
  id: string
  userId: string
  name: string
  symbol: string
  ca: string            // mint address
  description: string | null
  imageUrl: string | null
  txSignature: string | null
  confirmed: boolean
  createdAt: string
  updatedAt: string
}

interface DefiProfile {
  id: string
  userId: string
  name: string | null
  avatarUrl: string | null
  bio: string | null
  walletAddress: string | null
  followingCount: number
  followersCount: number
  createdAt: string
  updatedAt: string
}

interface PaginatedResponse<T> {
  data: T[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

interface ApiResponse<T> {
  success: boolean
  data: T
  message: string
}

interface ApiError {
  success: false
  statusCode: number
  message: string
}
```

---

## Error Reference

| Status | Cause |
|--------|-------|
| 400 | Missing required field, tx failed on-chain, tx not found |
| 401 | Missing or expired Privy JWT |
| 413 | Request body over 10 MB (image too large) |
| 500 | Pinata upload failed, RPC error, launchpad config not found on-chain |

The "Security verification failed" warning in Phantom on localhost is Phantom's own simulation warning for unregistered apps — it does not block signing and will not appear in production with a real domain.
