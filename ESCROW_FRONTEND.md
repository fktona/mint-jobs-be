# MintJobs Escrow — Frontend Integration Guide

## Table of Contents

1. [How It Works](#1-how-it-works)
2. [Signing Modes](#2-signing-modes)
3. [API Reference](#3-api-reference)
   - POST /fund
   - POST /topup *(new)*
   - DELETE /fund (withdraw)
   - POST /release
   - POST /confirm
   - GET (state)
   - POST /refund (admin)
4. [TypeScript Types](#4-typescript-types)
5. [Server-Side Signing (Privy Embedded Wallet)](#5-server-side-signing-privy-embedded-wallet)
6. [Client-Side Signing (External Wallet)](#6-client-side-signing-external-wallet)
7. [React Hooks](#7-react-hooks)
8. [Error Handling](#8-error-handling)
9. [PDA Derivation](#9-pda-derivation)
10. [Escrow Lifecycle](#10-escrow-lifecycle)
11. [Environment Variables](#11-environment-variables)

---

## 1. How It Works

When a client posts a job, they fund a Solana PDA escrow with SOL. The funds sit on-chain and move through a strict lifecycle:

```
Client funds escrow ──► [FUNDED]
                              │
            client withdraws ─┤─ (pre-hire only) ──► [REFUNDED]
                              │
     platform locks on hire ──► [LOCKED]
                              │
         client/platform  ────┤──── release ──► [RELEASED]  (funds → freelancer)
                              │
             platform  ───────┘──── refund  ──► [REFUNDED]  (funds → client, dispute)
```

**The frontend is involved in four actions:**
- **Fund** — client deposits SOL into the escrow
- **Top-up** — client adds more SOL to an existing funded escrow (before hire only)
- **Withdraw** — client reclaims SOL (only before hire)
- **Release** — client pays the freelancer (only after job completes)

Lock and refund are authority-only (backend handles them automatically via events and admin API).

---

## 2. Signing Modes

Every write endpoint accepts a `?signingMode=` query parameter:

| Mode | Who signs | When to use |
|---|---|---|
| `server` (default) | Privy embedded wallet — backend signs + broadcasts | Users with Privy-managed wallets (email/social login) |
| `client` | External wallet — backend returns unsigned tx, frontend signs + broadcasts | Users with Phantom, Backpack, etc. |

**With `signingMode=server`:**
- Call the API → get back `{ txSignature }` — done. No Solana SDK needed.

**With `signingMode=client`:**
- Call the API → get back `{ transaction }` (base64 unsigned tx)
- Sign it in the browser using `@solana/wallet-adapter` or Privy
- Broadcast it to the RPC
- Call `POST /escrow/jobs/:jobId/confirm` with the resulting `txSignature`

---

## 3. API Reference

**Base URL:** `https://your-api.example.com`  
**Auth:** All endpoints require `Authorization: Bearer <privy-access-token>`

---

### `POST /escrow/jobs/:jobId/fund`

Fund the escrow for a job.

**Query params:**

| Param | Values | Default |
|---|---|---|
| `signingMode` | `server` \| `client` | `server` |

**Request body:**
```json
{
  "amountLamports": 1000000000
}
```

`amountLamports` must be a positive integer (1 SOL = 1,000,000,000 lamports).

**Response — `signingMode=server`:**
```json
{
  "success": true,
  "message": "Escrow funded successfully",
  "data": {
    "txSignature": "5KtWqXJZ...",
    "escrowPda": "8xH2f...",
    "vaultPda": "3mNp9..."
  }
}
```

**Response — `signingMode=client`:**
```json
{
  "success": true,
  "message": "Fund transaction built — sign and broadcast to complete",
  "data": {
    "transaction": "<base64-encoded unsigned transaction>",
    "escrowPda": "8xH2f...",
    "vaultPda": "3mNp9..."
  }
}
```

> After broadcasting, call `POST /escrow/jobs/:jobId/confirm` to record the escrow in the database.

**Errors:**

| Status | Reason |
|---|---|
| 400 | `amountLamports` is missing or not a positive integer |
| 400 | `signingMode=server` but user has no Privy embedded wallet |
| 401 | Missing or invalid auth token |
| 409 | Escrow for this job already exists and is not refunded |

---

### `POST /escrow/jobs/:jobId/topup`

Add more SOL to an existing funded escrow. Only allowed while status is `funded` (before hire). The on-chain amount increases; status stays `funded`.

**Query params:** `signingMode=server|client` (default `server`)

**Request body:**

```json
{
  "additionalLamports": 500000000
}
```

`additionalLamports` must be a positive integer.

**Response — `signingMode=server`:**

```json
{
  "success": true,
  "message": "Escrow topped up successfully",
  "data": {
    "txSignature": "5KtWqXJZ..."
  }
}
```

**Response — `signingMode=client`:**

```json
{
  "success": true,
  "message": "Top-up transaction built — sign and broadcast to complete",
  "data": {
    "transaction": "<base64-encoded unsigned transaction>"
  }
}
```

> After broadcasting in client mode, call `POST /escrow/jobs/:jobId/confirm` with `txSignature` or `signedTransaction`.

**Errors:**

| Status | Reason |
|---|---|
| 400 | `additionalLamports` is missing or not a positive integer |
| 400 | Escrow is not in `funded` state (already locked, released, or refunded) |
| 404 | No escrow found for this job |

---

### `DELETE /escrow/jobs/:jobId/fund`

Withdraw funds from escrow (pre-hire only). Fails if escrow is already locked, released, or refunded.

**Query params:** `signingMode=server|client` (default `server`)

**Response — `signingMode=server`:**
```json
{
  "success": true,
  "message": "Escrow withdrawn successfully",
  "data": {
    "txSignature": "5KtWqXJZ..."
  }
}
```

**Response — `signingMode=client`:**
```json
{
  "success": true,
  "message": "Withdraw transaction built — sign and broadcast to complete",
  "data": {
    "transaction": "<base64-encoded unsigned transaction>"
  }
}
```

**Errors:**

| Status | Reason |
|---|---|
| 400 | Escrow is not in `funded` state (already locked, released, or refunded) |
| 404 | No on-chain escrow found for this job |

---

### `POST /escrow/jobs/:jobId/release`

Release escrow funds to the freelancer. Escrow must be in `locked` state (job must be in-progress).

**Query params:** `signingMode=server|client` (default `server`)

**No request body.**

**Response — `signingMode=server`:**
```json
{
  "success": true,
  "message": "Escrow released successfully",
  "data": {
    "txSignature": "5KtWqXJZ..."
  }
}
```

**Response — `signingMode=client`:**
```json
{
  "success": true,
  "message": "Release transaction built — sign and broadcast to complete",
  "data": {
    "transaction": "<base64-encoded unsigned transaction>"
  }
}
```

**Errors:**

| Status | Reason |
|---|---|
| 400 | Escrow is not in `locked` state |
| 404 | No on-chain escrow found |

---

### `POST /escrow/jobs/:jobId/confirm`

Used after `signingMode=client`. Supports two sub-modes:

| Body field | What happens |
|---|---|
| `txSignature` | Frontend already broadcast — backend verifies it landed, then writes DB |
| `signedTransaction` | Frontend signed but did NOT broadcast — backend broadcasts + confirms + writes DB |

Send **one or the other**, not both.

**Request body — frontend already broadcast:**
```json
{
  "txSignature": "5KtWqXJZ..."
}
```

**Request body — relay mode (backend broadcasts for you):**
```json
{
  "signedTransaction": "AQAAAA..."
}
```

`signedTransaction` is the base64-encoded signed transaction returned by your wallet adapter's `signTransaction()` call.

**Response (both variants):**
```json
{
  "success": true,
  "message": "Escrow transaction confirmed",
  "data": {
    "id": "uuid",
    "jobId": "uuid",
    "clientId": "did:privy:...",
    "clientWallet": "7xFk...",
    "freelancerId": null,
    "freelancerWallet": null,
    "escrowPda": "8xH2f...",
    "vaultPda": "3mNp9...",
    "amountLamports": "1000000000",
    "status": "funded",
    "txSignature": "5KtWqXJZ...",
    "createdAt": "2026-04-14T10:00:00.000Z",
    "updatedAt": "2026-04-14T10:00:00.000Z"
  }
}
```

**Errors:**

| Status | Reason |
|---|---|
| 400 | Neither `txSignature` nor `signedTransaction` provided |
| 400 | Transaction failed on-chain (`meta.err` is set) |
| 404 | `txSignature` not found on-chain (tx hasn't landed yet — retry) |

---

### `GET /escrow/jobs/:jobId`

Get current escrow state. Returns the DB record if present, falls back to reading on-chain directly.

**No request body.**

**Response:**
```json
{
  "success": true,
  "message": "Escrow retrieved successfully",
  "data": {
    "id": "uuid",
    "jobId": "uuid",
    "clientId": "did:privy:...",
    "clientWallet": "7xFk...",
    "freelancerId": "did:privy:...",
    "freelancerWallet": "9pQr...",
    "escrowPda": "8xH2f...",
    "vaultPda": "3mNp9...",
    "amountLamports": "1000000000",
    "status": "locked",
    "txSignature": "5KtWqXJZ...",
    "createdAt": "2026-04-14T10:00:00.000Z",
    "updatedAt": "2026-04-14T10:00:00.000Z"
  }
}
```

Returns `null` in `data` if no escrow exists for the job.

---

### `POST /escrow/jobs/:jobId/refund` *(admin only)*

Force-refund escrow back to client. Used for dispute resolution.

**Required header:** `admin-token: <platform-admin-token>`

**No request body.**

**Response:**
```json
{
  "success": true,
  "message": "Escrow refunded successfully",
  "data": { "txSignature": "5KtWqXJZ..." }
}
```

---

## 4. TypeScript Types

Copy these into your frontend project.

```typescript
// escrow.types.ts

export type EscrowStatus = 'funded' | 'locked' | 'released' | 'refunded';

export interface EscrowRecord {
  id: string;
  jobId: string;
  clientId: string;           // Privy DID
  clientWallet: string;       // Solana base58 address
  freelancerId: string | null;
  freelancerWallet: string | null;
  escrowPda: string;          // Solana base58 address
  vaultPda: string;           // Solana base58 address
  /** Stored as a string to avoid JS BigInt precision loss. Parse with BigInt() if needed. */
  amountLamports: string;
  status: EscrowStatus;
  txSignature: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// signingMode=server responses
export interface FundServerResponse {
  txSignature: string;
  escrowPda: string;
  vaultPda: string;
}

export interface TopUpServerResponse {
  txSignature: string;
}

export interface WithdrawServerResponse {
  txSignature: string;
}

export interface ReleaseServerResponse {
  txSignature: string;
}

// signingMode=client responses
export interface FundClientResponse {
  transaction: string;  // base64 unsigned tx
  escrowPda: string;
  vaultPda: string;
}

export interface TopUpClientResponse {
  transaction: string;  // base64 unsigned tx
}

export interface WithdrawClientResponse {
  transaction: string;  // base64 unsigned tx
}

export interface ReleaseClientResponse {
  transaction: string;  // base64 unsigned tx
}
```

---

## 5. Server-Side Signing (Privy Embedded Wallet)

This is the recommended default for users who signed up via email or social login. The backend signs and broadcasts the transaction — **no Solana SDK needed on the frontend**.

### Install

```bash
npm install @privy-io/react-auth
```

### Escrow API client

```typescript
// lib/escrow-api.ts
import type {
  ApiResponse,
  EscrowRecord,
  FundServerResponse,
  TopUpServerResponse,
  WithdrawServerResponse,
  ReleaseServerResponse,
} from './escrow.types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

async function escrowFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}/escrow/jobs/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const json: ApiResponse<T> = await res.json();
  if (!res.ok || !json.success) {
    throw new EscrowError(json.message ?? 'Escrow request failed', res.status);
  }
  return json.data;
}

export class EscrowError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'EscrowError';
  }
}

/** Fund a job escrow (server signing — Privy embedded wallet). */
export async function fundEscrow(
  jobId: string,
  amountLamports: number,
  token: string,
): Promise<FundServerResponse> {
  return escrowFetch<FundServerResponse>(`${jobId}/fund?signingMode=server`, token, {
    method: 'POST',
    body: JSON.stringify({ amountLamports }),
  });
}

/** Top up a funded escrow with additional SOL (server signing). */
export async function topUpEscrow(
  jobId: string,
  additionalLamports: number,
  token: string,
): Promise<TopUpServerResponse> {
  return escrowFetch<TopUpServerResponse>(`${jobId}/topup?signingMode=server`, token, {
    method: 'POST',
    body: JSON.stringify({ additionalLamports }),
  });
}

/** Withdraw escrow before hire (server signing). */
export async function withdrawEscrow(
  jobId: string,
  token: string,
): Promise<WithdrawServerResponse> {
  return escrowFetch<WithdrawServerResponse>(`${jobId}/fund?signingMode=server`, token, {
    method: 'DELETE',
  });
}

/** Release escrow to freelancer (server signing). */
export async function releaseEscrow(
  jobId: string,
  token: string,
): Promise<ReleaseServerResponse> {
  return escrowFetch<ReleaseServerResponse>(`${jobId}/release?signingMode=server`, token, {
    method: 'POST',
  });
}

/** Get current escrow state. */
export async function getEscrow(
  jobId: string,
  token: string,
): Promise<EscrowRecord | null> {
  return escrowFetch<EscrowRecord | null>(jobId, token);
}
```

### Usage in a component

```tsx
// components/FundJobButton.tsx
import { usePrivy } from '@privy-io/react-auth';
import { fundEscrow, EscrowError } from '@/lib/escrow-api';

const SOL_TO_LAMPORTS = 1_000_000_000;

export function FundJobButton({ jobId, amountSol }: { jobId: string; amountSol: number }) {
  const { getAccessToken } = usePrivy();
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [txSig, setTxSig] = React.useState<string | null>(null);

  async function handleFund() {
    setStatus('loading');
    try {
      const token = await getAccessToken();
      const result = await fundEscrow(jobId, amountSol * SOL_TO_LAMPORTS, token!);
      setTxSig(result.txSignature);
      setStatus('done');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  return (
    <div>
      <button onClick={handleFund} disabled={status === 'loading'}>
        {status === 'loading' ? 'Funding…' : `Fund ${amountSol} SOL`}
      </button>
      {status === 'done' && (
        <p>
          Funded!{' '}
          <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank">
            View transaction
          </a>
        </p>
      )}
      {status === 'error' && <p>Something went wrong. Please try again.</p>}
    </div>
  );
}
```

---

## 6. Client-Side Signing (External Wallet)

Use this flow when the user connected an external wallet (Phantom, Backpack, Solflare, etc.).

There are two sub-modes. Choose based on whether you want the frontend or backend to broadcast:

| Sub-mode | Flow | When to use |
|---|---|---|
| **Sign + relay** | Frontend signs → sends signed tx to backend → backend broadcasts | Simplest: no RPC needed on frontend |
| **Sign + broadcast** | Frontend signs → frontend broadcasts → tells backend the sig | Frontend controls the broadcast |

### Install

```bash
npm install @solana/wallet-adapter-react
# sign+broadcast sub-mode also needs:
npm install @solana/web3.js
```

### API helpers

```typescript
// lib/escrow-api.ts  (add to the file from Section 5)
import type {
  FundClientResponse,
  TopUpClientResponse,
  WithdrawClientResponse,
  ReleaseClientResponse,
} from './escrow.types';

/** Build an unsigned fund transaction for the client wallet to sign. */
export async function buildFundTx(
  jobId: string,
  amountLamports: number,
  token: string,
): Promise<FundClientResponse> {
  return escrowFetch<FundClientResponse>(
    `${jobId}/fund?signingMode=client`,
    token,
    { method: 'POST', body: JSON.stringify({ amountLamports }) },
  );
}

/** Build an unsigned top-up transaction for the client wallet to sign. */
export async function buildTopUpTx(
  jobId: string,
  additionalLamports: number,
  token: string,
): Promise<TopUpClientResponse> {
  return escrowFetch<TopUpClientResponse>(
    `${jobId}/topup?signingMode=client`,
    token,
    { method: 'POST', body: JSON.stringify({ additionalLamports }) },
  );
}

/** Build an unsigned withdraw transaction for the client wallet to sign. */
export async function buildWithdrawTx(
  jobId: string,
  token: string,
): Promise<WithdrawClientResponse> {
  return escrowFetch<WithdrawClientResponse>(
    `${jobId}/fund?signingMode=client`,
    token,
    { method: 'DELETE' },
  );
}

/** Build an unsigned release transaction for the client wallet to sign. */
export async function buildReleaseTx(
  jobId: string,
  token: string,
): Promise<ReleaseClientResponse> {
  return escrowFetch<ReleaseClientResponse>(
    `${jobId}/release?signingMode=client`,
    token,
    { method: 'POST' },
  );
}

/**
 * Confirm a client transaction.
 *
 * Pass `signedTransaction` (base64) to have the backend broadcast it.
 * Pass `txSignature` if the frontend already broadcast it.
 */
export async function confirmEscrow(
  jobId: string,
  token: string,
  payload: { signedTransaction: string } | { txSignature: string },
): Promise<EscrowRecord> {
  return escrowFetch<EscrowRecord>(`${jobId}/confirm`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
```

### Sub-mode A — Sign + relay (recommended, no RPC on frontend)

The frontend only needs to sign — the backend handles broadcast.

```typescript
// lib/escrow-external-wallet.ts
import { Transaction } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { buildFundTx, buildTopUpTx, buildWithdrawTx, buildReleaseTx, confirmEscrow } from './escrow-api';

const SOL_TO_LAMPORTS = 1_000_000_000;

/** Sign the tx and hand the signed bytes to the backend to broadcast. */
async function signAndRelay(
  base64UnsignedTx: string,
  jobId: string,
  token: string,
  wallet: WalletContextState,
): Promise<EscrowRecord> {
  if (!wallet.signTransaction || !wallet.publicKey) {
    throw new Error('Wallet not connected');
  }

  const tx = Transaction.from(Buffer.from(base64UnsignedTx, 'base64'));
  tx.feePayer = wallet.publicKey;

  const signed = await wallet.signTransaction(tx);
  const signedBase64 = signed.serialize({ requireAllSignatures: false }).toString('base64');

  return confirmEscrow(jobId, token, { signedTransaction: signedBase64 });
}

export async function fundJobRelay(
  jobId: string,
  amountSol: number,
  token: string,
  wallet: WalletContextState,
): Promise<EscrowRecord> {
  const { transaction } = await buildFundTx(jobId, amountSol * SOL_TO_LAMPORTS, token);
  return signAndRelay(transaction, jobId, token, wallet);
}

export async function topUpJobRelay(
  jobId: string,
  additionalSol: number,
  token: string,
  wallet: WalletContextState,
): Promise<EscrowRecord> {
  const lamports = Math.round(additionalSol * SOL_TO_LAMPORTS);
  const { transaction } = await buildTopUpTx(jobId, lamports, token);
  return signAndRelay(transaction, jobId, token, wallet);
}

export async function withdrawJobRelay(
  jobId: string,
  token: string,
  wallet: WalletContextState,
): Promise<EscrowRecord> {
  const { transaction } = await buildWithdrawTx(jobId, token);
  return signAndRelay(transaction, jobId, token, wallet);
}

export async function releaseJobRelay(
  jobId: string,
  token: string,
  wallet: WalletContextState,
): Promise<EscrowRecord> {
  const { transaction } = await buildReleaseTx(jobId, token);
  return signAndRelay(transaction, jobId, token, wallet);
}
```

### Sub-mode B — Sign + broadcast yourself

Use this if you want full control over the Solana RPC call.

```typescript
// lib/escrow-external-wallet.ts  (alternative)
import { Connection, Transaction } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { buildFundTx, confirmEscrow } from './escrow-api';

const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL!,
  'confirmed',
);
const SOL_TO_LAMPORTS = 1_000_000_000;

async function signBroadcastConfirm(
  base64UnsignedTx: string,
  jobId: string,
  token: string,
  wallet: WalletContextState,
): Promise<EscrowRecord> {
  if (!wallet.signTransaction || !wallet.publicKey) {
    throw new Error('Wallet not connected');
  }

  const tx = Transaction.from(Buffer.from(base64UnsignedTx, 'base64'));
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;

  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  return confirmEscrow(jobId, token, { txSignature: sig });
}

export async function fundJobBroadcast(
  jobId: string,
  amountSol: number,
  token: string,
  wallet: WalletContextState,
): Promise<EscrowRecord> {
  const { transaction } = await buildFundTx(jobId, amountSol * SOL_TO_LAMPORTS, token);
  return signBroadcastConfirm(transaction, jobId, token, wallet);
}
```

### Component example

```tsx
// components/FundJobButtonExternal.tsx
import { useWallet } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { fundJobRelay } from '@/lib/escrow-external-wallet';

export function FundJobButtonExternal({
  jobId,
  amountSol,
}: {
  jobId: string;
  amountSol: number;
}) {
  const wallet = useWallet();
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = React.useState(false);

  async function handleFund() {
    if (!wallet.connected) return;
    setLoading(true);
    try {
      const token = await getAccessToken();
      const escrow = await fundJobRelay(jobId, amountSol, token!, wallet);
      console.log('Funded, status:', escrow.status);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={handleFund} disabled={loading || !wallet.connected}>
      {loading ? 'Processing…' : `Fund ${amountSol} SOL`}
    </button>
  );
}
```

---

## 7. React Hooks

Drop-in hooks that work for both signing modes.

```typescript
// hooks/useEscrow.ts
import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  fundEscrow,
  topUpEscrow,
  withdrawEscrow,
  releaseEscrow,
  buildFundTx,
  buildTopUpTx,
  buildWithdrawTx,
  buildReleaseTx,
  confirmEscrow,
  getEscrow,
  EscrowError,
} from '@/lib/escrow-api';
import { signAndBroadcast } from '@/lib/escrow-external-wallet';
import type { EscrowRecord } from '@/lib/escrow.types';

type SigningMode = 'server' | 'client';

const SOL_TO_LAMPORTS = 1_000_000_000;

export function useEscrow(jobId: string, signingMode: SigningMode = 'server') {
  const { getAccessToken } = usePrivy();
  const wallet = useWallet();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escrow, setEscrow] = useState<EscrowRecord | null>(null);

  const withLoading = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        const msg = err instanceof EscrowError ? err.message : 'Something went wrong';
        setError(msg);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fund = useCallback(
    (amountSol: number) =>
      withLoading(async () => {
        const token = await getAccessToken();
        const lamports = Math.round(amountSol * SOL_TO_LAMPORTS);

        if (signingMode === 'server') {
          return fundEscrow(jobId, lamports, token!);
        }

        // client mode
        const { transaction } = await buildFundTx(jobId, lamports, token!);
        const sig = await signAndBroadcast(transaction, wallet);
        return confirmEscrow(jobId, sig, token!);
      }),
    [jobId, signingMode, getAccessToken, wallet, withLoading],
  );

  const topUp = useCallback(
    (additionalSol: number) =>
      withLoading(async () => {
        const token = await getAccessToken();
        const lamports = Math.round(additionalSol * SOL_TO_LAMPORTS);

        if (signingMode === 'server') {
          return topUpEscrow(jobId, lamports, token!);
        }

        const { transaction } = await buildTopUpTx(jobId, lamports, token!);
        const sig = await signAndBroadcast(transaction, wallet);
        return confirmEscrow(jobId, token!, { txSignature: sig });
      }),
    [jobId, signingMode, getAccessToken, wallet, withLoading],
  );

  const withdraw = useCallback(
    () =>
      withLoading(async () => {
        const token = await getAccessToken();

        if (signingMode === 'server') {
          return withdrawEscrow(jobId, token!);
        }

        const { transaction } = await buildWithdrawTx(jobId, token!);
        const sig = await signAndBroadcast(transaction, wallet);
        return confirmEscrow(jobId, token!, { txSignature: sig });
      }),
    [jobId, signingMode, getAccessToken, wallet, withLoading],
  );

  const release = useCallback(
    () =>
      withLoading(async () => {
        const token = await getAccessToken();

        if (signingMode === 'server') {
          return releaseEscrow(jobId, token!);
        }

        const { transaction } = await buildReleaseTx(jobId, token!);
        const sig = await signAndBroadcast(transaction, wallet);
        return confirmEscrow(jobId, sig, token!);
      }),
    [jobId, signingMode, getAccessToken, wallet, withLoading],
  );

  const refresh = useCallback(
    () =>
      withLoading(async () => {
        const token = await getAccessToken();
        const data = await getEscrow(jobId, token!);
        setEscrow(data);
        return data;
      }),
    [jobId, getAccessToken, withLoading],
  );

  return { fund, topUp, withdraw, release, refresh, escrow, loading, error };
}
```

### Usage

```tsx
function JobEscrowPanel({ jobId }: { jobId: string }) {
  const { fund, topUp, withdraw, release, refresh, escrow, loading, error } = useEscrow(jobId);

  React.useEffect(() => { refresh(); }, [jobId]);

  return (
    <div>
      {escrow && (
        <p>
          Status: <strong>{escrow.status}</strong> —{' '}
          {(BigInt(escrow.amountLamports) / 1_000_000_000n).toString()} SOL
        </p>
      )}

      {!escrow && (
        <button onClick={() => fund(1)} disabled={loading}>
          Fund 1 SOL
        </button>
      )}

      {escrow?.status === 'funded' && (
        <>
          <button onClick={() => topUp(0.5)} disabled={loading}>
            Add 0.5 SOL
          </button>
          <button onClick={() => withdraw()} disabled={loading}>
            Withdraw
          </button>
        </>
      )}

      {escrow?.status === 'locked' && (
        <button onClick={() => release()} disabled={loading}>
          Release to Freelancer
        </button>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
```

---

## 8. Error Handling

All API errors follow this shape:

```typescript
interface ApiError {
  success: false;
  message: string;     // human-readable description
  statusCode: number;
}
```

### Common errors

| HTTP | `message` | What happened |
|---|---|---|
| 400 | `amountLamports must be an integer` | Send an integer, not a float |
| 400 | `additionalLamports must be an integer` | Top-up amount must be a positive integer |
| 400 | `Escrow is not in Funded status — top-up not allowed` | Can't top up after hire |
| 400 | `Escrow is not in Funded status` | Can't withdraw after hire |
| 400 | `Escrow is not Locked` | Can't release before hire |
| 400 | `Escrow for job … is already finalised` | Can't refund a released/refunded escrow |
| 400 | `Server-side signing requires a Privy embedded wallet` | User connected an external wallet but `signingMode=server` was used |
| 400 | `Transaction … failed on-chain` | Tx was broadcast but reverted |
| 400 | `No Solana wallet linked to your account` | User has no Solana wallet in Privy |
| 401 | `Missing authorization token` | Auth header missing |
| 404 | `On-chain escrow for job … not found` | No escrow PDA exists yet |
| 404 | `Transaction … not found on-chain` | Tx hasn't landed yet — retry confirm after a few seconds |
| 409 | `Escrow for job … already exists` | Tried to fund an already-funded job |

### Retry pattern for confirm

The on-chain confirmation can lag behind. If the `confirm` endpoint returns 404, wait and retry:

```typescript
async function confirmWithRetry(
  jobId: string,
  txSig: string,
  token: string,
  maxRetries = 5,
  delayMs = 2000,
): Promise<EscrowRecord> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await confirmEscrow(jobId, txSig, token);
    } catch (err) {
      if (err instanceof EscrowError && err.statusCode === 404 && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Transaction confirmation timed out');
}
```

---

## 9. PDA Derivation

> **Note:** The program uses `SHA-256(jobId)` as the PDA seed — not the raw job ID bytes. This deviates from the naive approach and must be matched exactly if you derive PDAs on the frontend.

```typescript
import { PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto'; // Node.js
// In a browser, use the Web Crypto API instead (see below)

const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID!);

function jobIdSeed(jobId: string): Buffer {
  return createHash('sha256').update(jobId).digest();
}

export function deriveEscrowPda(jobId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), jobIdSeed(jobId)],
    PROGRAM_ID,
  );
  return pda;
}

export function deriveVaultPda(jobId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), jobIdSeed(jobId)],
    PROGRAM_ID,
  );
  return pda;
}
```

**Browser-safe version (no Node.js `crypto`):**

```typescript
// browser SHA-256 using Web Crypto API
async function jobIdSeedBrowser(jobId: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(jobId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return new Uint8Array(hashBuffer);
}

// Note: PublicKey.findProgramAddressSync is sync;
// derive the seed async then call sync:
export async function deriveEscrowPdaBrowser(jobId: string): Promise<PublicKey> {
  const seed = await jobIdSeedBrowser(jobId);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), Buffer.from(seed)],
    PROGRAM_ID,
  );
  return pda;
}
```

> In most cases the frontend does not need to derive PDAs manually — the `fund` API response includes `escrowPda` and `vaultPda` already. Derive them yourself only when you need to read on-chain state directly.

---

## 10. Escrow Lifecycle

```
                            ┌─────────────────────────────────────┐
                            │          Status machine              │
                            └─────────────────────────────────────┘

  Client calls POST /fund
        │
        ▼
    [ FUNDED ]  ◄── client calls POST /topup (add more SOL, stays FUNDED)
        │
        ├── client calls DELETE /fund ────────────────────► [ REFUNDED ]
        │                                                         ▲
        │  Platform locks on PROPOSAL_HIRED event                 │
        ▼                                                         │
    [ LOCKED ]  ──── platform calls POST /refund ────────────────┘
        │
        │  Client calls POST /release
        ▼
    [ RELEASED ]   (terminal — funds sent to freelancer)
```

**Status meanings:**

| Status | What it means | Available actions |
|---|---|---|
| `funded` | SOL is in escrow, no freelancer hired yet | Top-up (client), Withdraw (client), Lock (platform auto) |
| `locked` | Freelancer hired, withdrawal blocked | Release (client), Refund (platform admin) |
| `released` | Funds sent to freelancer | None — terminal |
| `refunded` | Funds returned to client | Can re-fund if desired |

**Display tips:**
- Show a "Fund Escrow" CTA when job has no escrow or status is `refunded`
- Show "Add More SOL" (top-up) only when status is `funded`
- Show "Withdraw" only when status is `funded`
- Show "Release Payment" only when status is `locked` and job work is complete
- Show a lock icon when status is `locked` to communicate funds are protected
- `amountLamports` is a string — divide by `1_000_000_000n` (BigInt) to get SOL

```typescript
function lamportsToSol(lamports: string): string {
  return (Number(BigInt(lamports)) / 1_000_000_000).toFixed(4);
}
```

---

## 11. Environment Variables

Add these to your `.env.local` (Next.js) or equivalent:

```bash
# API base URL
NEXT_PUBLIC_API_URL=https://your-api.example.com

# Solana
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_PROGRAM_ID=DSpvnGTUxHo47tLgGJygq9F1ZX1TvGVrv7Ku2jAfBew8

# Privy (get from https://console.privy.io)
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
```

For mainnet, replace:
- `NEXT_PUBLIC_SOLANA_RPC_URL` with a private RPC endpoint (Helius, QuickNode, etc.)
- `NEXT_PUBLIC_SOLANA_PROGRAM_ID` with the mainnet-deployed program address
