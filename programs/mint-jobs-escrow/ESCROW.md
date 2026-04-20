# MintJobs Escrow — Program & Integration Guide

## Overview

The MintJobs escrow system holds a client's SOL payment on-chain while a job is in progress. Funds are locked in a Solana PDA (Program Derived Address) and can only move according to strict lifecycle rules. Neither the platform nor the client can silently drain funds — every action is a verifiable on-chain transaction.

**Program ID (devnet):** `DSpvnGTUxHo47tLgGJygq9F1ZX1TvGVrv7Ku2jAfBew8`

---

## Lifecycle

```
Client posts job
      │
      ▼
 [FUNDED]  ◄── client funds escrow (initialize_escrow)
      │
      ├── client calls withdraw ──► [REFUNDED]   (pre-hire only)
      │
      ▼  platform calls lock (on PROPOSAL_HIRED event)
 [LOCKED]
      │
      ├── client/authority calls release ──► [RELEASED]  (funds → freelancer)
      │
      └── authority calls refund ──────────► [REFUNDED]  (funds → client, dispute)
```

---

## On-Chain Accounts

### JobEscrow PDA
Stores escrow state. Seeds: `["escrow", job_id_bytes]`

| Field | Type | Description |
|---|---|---|
| `client` | `Pubkey` | Job poster wallet |
| `freelancer` | `Pubkey` | Zero until locked; set on hire |
| `authority` | `Pubkey` | Platform wallet (signs lock/refund) |
| `job_id` | `[u8; 36]` | UUID as ASCII bytes |
| `amount` | `u64` | Lamports currently held in vault |
| `status` | `EscrowStatus` | `Funded \| Locked \| Released \| Refunded` |
| `bump` | `u8` | PDA bump seed |
| `vault_bump` | `u8` | Vault PDA bump seed |

**Size:** 152 bytes (8 discriminator + 32+32+32+36+8+1+1+1)

### Vault PDA
Holds the actual SOL lamports. Seeds: `["vault", job_id_bytes]`  
This is a system-owned account with no data — just holds lamports. The program controls it via `invoke_signed`.

---

## Instructions

### `initialize_escrow(job_id: String, amount: u64)`
**Signer:** client  
**Status transition:** new → `Funded`

Transfers `amount` lamports from the client to the vault PDA. Creates the `JobEscrow` state account.

**Required accounts:**
| Account | Writable | Signer |
|---|---|---|
| `client` | ✓ | ✓ |
| `authority` | | |
| `escrow` (PDA) | ✓ | |
| `vault` (PDA) | ✓ | |
| `system_program` | | |

---

### `withdraw(job_id: String)`
**Signer:** client  
**Status transition:** `Funded` → `Refunded`  
**Fails if:** status is not `Funded` (i.e., already locked, released, or refunded)

Returns lamports from vault to client. Only the original client can call this (enforced by constraint).

**Required accounts:**
| Account | Writable | Signer |
|---|---|---|
| `client` | ✓ | ✓ |
| `escrow` (PDA) | ✓ | |
| `vault` (PDA) | ✓ | |
| `system_program` | | |

---

### `lock(job_id: String, freelancer: Pubkey)`
**Signer:** authority (platform wallet)  
**Status transition:** `Funded` → `Locked`

Records the freelancer's wallet and prevents the client from withdrawing. Called automatically by the escrow service when a `PROPOSAL_HIRED` event fires.

**Required accounts:**
| Account | Writable | Signer |
|---|---|---|
| `authority` | ✓ | ✓ |
| `escrow` (PDA) | ✓ | |

---

### `release(job_id: String)`
**Signer:** client OR authority  
**Status transition:** `Locked` → `Released`

Transfers lamports from vault to the freelancer. Both the client and the platform authority are permitted signers.

**Required accounts:**
| Account | Writable | Signer |
|---|---|---|
| `caller` | ✓ | ✓ |
| `escrow` (PDA) | ✓ | |
| `freelancer` | ✓ | |
| `vault` (PDA) | ✓ | |
| `system_program` | | |

---

### `refund(job_id: String)`
**Signer:** authority (platform wallet only)  
**Status transition:** `Funded` or `Locked` → `Refunded`

Force-returns lamports to the client. Used for dispute resolution. Only the platform authority can call this.

**Required accounts:**
| Account | Writable | Signer |
|---|---|---|
| `authority` | ✓ | ✓ |
| `client` | ✓ | |
| `escrow` (PDA) | ✓ | |
| `vault` (PDA) | ✓ | |
| `system_program` | | |

---

## Error Codes

| Code | Name | When |
|---|---|---|
| 6000 | `NotFunded` | Withdraw or lock called on non-Funded escrow |
| 6001 | `NotLocked` | Release called on non-Locked escrow |
| 6002 | `AlreadyLocked` | Client tries to withdraw after hire |
| 6003 | `AlreadyFinalised` | Action on Released/Refunded escrow |
| 6004 | `Unauthorized` | Wrong signer for the action |
| 6005 | `InvalidAmount` | Amount is zero |
| 6006 | `InvalidJobId` | job_id is not 36 characters |
| 6007 | `Overflow` | Arithmetic overflow |

---

## API Endpoints (via API Gateway)

All endpoints require a valid Privy auth token in the `Authorization` header.

| Method | Route | Who signs | Returns |
|---|---|---|---|
| `POST` | `/escrow/jobs/:jobId/fund` | client (frontend) | `{ transaction: string }` base64 tx |
| `DELETE` | `/escrow/jobs/:jobId/fund` | client (frontend) | `{ transaction: string }` base64 tx |
| `POST` | `/escrow/jobs/:jobId/release` | client (frontend) | `{ transaction: string }` base64 tx |
| `POST` | `/escrow/jobs/:jobId/refund` | authority (backend) | `{ txSignature: string }` |
| `GET` | `/escrow/jobs/:jobId` | — | `Escrow` entity |

`POST /fund` body:
```json
{ "amountLamports": 1000000000 }
```

`POST /refund` requires `admin-token` header (platform admin only).

---

## Frontend Integration

> **All client transactions (fund, withdraw, release) are now signed and
> broadcast server-side using the user's Privy embedded wallet.**
> The frontend only needs to call the REST API — no Solana SDK or wallet
> adapter required on the frontend.

### Install dependencies
```bash
npm install @privy-io/react-auth   # for auth token
```

### Derive PDAs (client-side)
```typescript
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('DSpvnGTUxHo47tLgGJygq9F1ZX1TvGVrv7Ku2jAfBew8');

function deriveEscrowPda(jobId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), Buffer.from(jobId)],
    PROGRAM_ID,
  );
  return pda;
}

function deriveVaultPda(jobId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), Buffer.from(jobId)],
    PROGRAM_ID,
  );
  return pda;
}
```

### Fund a job
```typescript
async function fundJob(jobId: string, amountLamports: number) {
  const res = await fetch(`/escrow/jobs/${jobId}/fund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${privyToken}`,
    },
    body: JSON.stringify({ amountLamports }),
  });
  const { data } = await res.json();
  // data.txSignature — transaction is already confirmed on-chain
  return data.txSignature;
}
```

### Withdraw before hire
```typescript
async function withdrawFunds(jobId: string) {
  const res = await fetch(`/escrow/jobs/${jobId}/fund`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${privyToken}` },
  });
  const { data } = await res.json();
  return data.txSignature;
}
```

### Release funds to freelancer
```typescript
async function releaseFunds(jobId: string) {
  const res = await fetch(`/escrow/jobs/${jobId}/release`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${privyToken}` },
  });
  const { data } = await res.json();
  return data.txSignature;
}
```

### Get escrow state
```typescript
async function getEscrow(jobId: string) {
  const res = await fetch(`/escrow/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${privyToken}` },
  });
  return res.json();
  // Returns: { jobId, status, amountLamports, clientWallet, freelancerWallet, ... }
}
```

### React hook example
```typescript
import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';

// No Solana SDK needed on the frontend — backend signs + broadcasts.
export function useEscrow(jobId: string) {
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = useState(false);

  const call = useCallback(
    async (method: string, path: string, body?: object) => {
      const token = await getAccessToken();
      const res = await fetch(`/escrow/jobs/${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Escrow request failed');
      return json.data; // { txSignature, ... }
    },
    [],
  );

  const fund = useCallback(
    (amountLamports: number) => {
      setLoading(true);
      return call('POST', `${jobId}/fund`, { amountLamports }).finally(() =>
        setLoading(false),
      );
    },
    [jobId, call],
  );

  const withdraw = useCallback(() => {
    setLoading(true);
    return call('DELETE', `${jobId}/fund`).finally(() => setLoading(false));
  }, [jobId, call]);

  const release = useCallback(() => {
    setLoading(true);
    return call('POST', `${jobId}/release`).finally(() => setLoading(false));
  }, [jobId, call]);

  return { fund, withdraw, release, loading };
}
```

---

## Transaction Signing Flow

```
Client action (fund / withdraw / release) — fully server-side:

  Frontend                 API Gateway           Escrow Service       Privy API       Solana
     │                         │                      │                   │              │
     │  POST /fund             │                      │                   │              │
     │────────────────────────►│                      │                   │              │
     │  Authorization: Bearer  │  ESCROW_FUND (MQ)    │                   │              │
     │  <privy-jwt>            │──{ walletId, userJwt │                   │              │
     │                         │    clientWallet,     │                   │              │
     │                         │    amountLamports }─►│                   │              │
     │                         │                      │  build tx         │              │
     │                         │                      │  signSolanaTransaction()         │
     │                         │                      │──────────────────►│              │
     │                         │                      │  { signedTx }     │              │
     │                         │                      │◄──────────────────│              │
     │                         │                      │  sendRawTransaction()            │
     │                         │                      │─────────────────────────────────►│
     │                         │                      │  confirmTransaction()            │
     │                         │  { txSignature }     │                   │              │
     │◄────────────────────────────────────────────────                   │              │

Authority action (lock / refund) — no frontend involvement:

  RabbitMQ (PROPOSAL_HIRED)    Escrow Service          Solana
          │                         │                    │
          │  PROPOSAL_HIRED event   │                    │
          │────────────────────────►│                    │
          │                         │  lockFunds()       │
          │                         │  (authority signs) │
          │                         │───────────────────►│
          │                         │  txSignature       │
          │                         │◄───────────────────│
          │                         │  DB → LOCKED       │
```

---

## Environment Variables

```bash
# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com        # or private RPC
SOLANA_PROGRAM_ID=DSpvnGTUxHo47tLgGJygq9F1ZX1TvGVrv7Ku2jAfBew8
SOLANA_AUTHORITY_KEYPAIR=<base64-encoded keypair JSON>

# Frontend (Next.js / Vite)
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_PROGRAM_ID=DSpvnGTUxHo47tLgGJygq9F1ZX1TvGVrv7Ku2jAfBew8
```

### Encoding the authority keypair
```bash
# Generate if you don't have one
solana-keygen new -o authority-keypair.json

# Base64-encode for the env var
base64 -i authority-keypair.json | tr -d '\n'
```

---

## Security Notes

- **Client actions** (fund, withdraw, release) are signed exclusively by the client's wallet in the browser. The backend never sees the private key.
- **Authority actions** (lock, refund) are signed by the platform keypair held server-side in `SOLANA_AUTHORITY_KEYPAIR`. This key should never be committed to source control.
- The `withdraw` instruction has an on-chain constraint (`escrow.client == client.key()`) — only the original funder can withdraw.
- The `lock` instruction has an on-chain constraint (`escrow.authority == authority.key()`) — only the registered platform authority can lock or refund.
- Status transitions are strictly enforced on-chain; no off-chain bypass is possible.
