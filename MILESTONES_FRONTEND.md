# MintJobs Milestone Payments — Frontend Integration Guide

## Table of Contents

1. [How It Works](#1-how-it-works)
2. [Milestone vs Flat-Payment Escrow](#2-milestone-vs-flat-payment-escrow)
3. [Signing Modes](#3-signing-modes)
4. [API Reference](#4-api-reference)
   - POST /jobs/:jobId/milestones (create)
   - GET /jobs/:jobId/milestones (list)
   - GET /milestones/:milestoneId (get one)
   - POST /milestones/:milestoneId/fund
   - DELETE /milestones/:milestoneId/fund (withdraw)
   - POST /milestones/:milestoneId/topup
   - POST /milestones/:milestoneId/release
   - POST /milestones/:milestoneId/confirm
   - POST /milestones/:milestoneId/refund (admin)
5. [TypeScript Types](#5-typescript-types)
6. [API Client](#6-api-client)
7. [Server-Side Signing (Privy Embedded Wallet)](#7-server-side-signing-privy-embedded-wallet)
8. [Client-Side Signing (External Wallet)](#8-client-side-signing-external-wallet)
9. [React Hooks](#9-react-hooks)
10. [Error Handling](#10-error-handling)
11. [Milestone Lifecycle](#11-milestone-lifecycle)
12. [UI Display Guide](#12-ui-display-guide)
13. [Known Behaviour](#13-known-behaviour)

---

## 1. How It Works

Milestone payments split a job's total value into ordered phases. Each milestone is a **separate on-chain PDA escrow** — the client funds them one at a time as work progresses.

```
Client creates job
       │
       ▼
Client defines milestones (DB only)
  ┌─────────────────────────────────────────────┐
  │  M1: UI Design        0.5 SOL  [PENDING]    │
  │  M2: Development      2.0 SOL  [PENDING]    │
  │  M3: Testing + Deploy 0.5 SOL  [PENDING]    │
  └─────────────────────────────────────────────┘
       │
       ▼
Client funds M1 ──► M1: [FUNDED]  ← job becomes active
       │
       ▼
Freelancer hired ──► all funded milestones auto-lock
  M1: [LOCKED]
       │
       ▼
M1 work done ──► client releases M1 ──► M1: [RELEASED] (SOL → freelancer)
       │
       ▼
Client funds M2 ──► M2: [FUNDED]  ← client contacts authority to lock
       │
       ▼
M2 released, M3 funded → released…
```

**Key rules:**
- Each milestone has a **fixed amount** set at creation — the client cannot overpay or underpay on-chain
- Milestones funded **before** hire are locked automatically when a freelancer is hired
- The `order` field controls display order only — milestones can be funded in any sequence
- Withdrawing all funded milestones deactivates the job listing

---

## 2. Milestone vs Flat-Payment Escrow

| | Flat payment (`/escrow/jobs/:jobId/...`) | Milestone payment (`/escrow/milestones/:milestoneId/...`) |
|---|---|---|
| Use case | Single delivery, fixed price | Phased work with multiple deliverables |
| Setup | Fund one amount | Create milestones first, fund each separately |
| Amount | Client chooses at fund time | Fixed at milestone creation |
| Partial payment | Not supported | Each milestone is an independent payout |
| Auto-lock on hire | Yes | Yes (for all funded milestones at hire time) |

Both modes can coexist on the same job — there is no conflict.

---

## 3. Signing Modes

Every write endpoint accepts `?signingMode=server|client`:

| Mode | Who signs | When to use |
|---|---|---|
| `server` (default) | Privy embedded wallet — backend signs + broadcasts | Email/social login users |
| `client` | External wallet — backend returns unsigned tx, frontend signs | Phantom, Backpack, Solflare, etc. |

**With `signingMode=server`:** Call the endpoint → get `{ txSignature }` — done.

**With `signingMode=client`:**
1. Call the endpoint → get `{ transaction }` (base64 unsigned tx)
2. Sign it with your wallet adapter
3. Either broadcast it yourself, OR send the signed bytes to `/confirm` (relay mode)
4. Call `POST /escrow/milestones/:milestoneId/confirm` to record the result

---

## 4. API Reference

**Base URL:** `https://your-api.example.com`  
**Auth:** All endpoints require `Authorization: Bearer <privy-access-token>`

---

### `POST /escrow/jobs/:jobId/milestones`

Create the milestone plan for a job. Call this once before funding. Milestones are stored in the DB only — nothing happens on-chain until individual milestones are funded.

**Request body:**
```json
{
  "milestones": [
    {
      "title": "UI Design",
      "description": "Design all screens in Figma",
      "order": 1,
      "amountLamports": 500000000
    },
    {
      "title": "Development",
      "description": "Build and integrate all features",
      "order": 2,
      "amountLamports": 2000000000
    },
    {
      "title": "Testing & Deploy",
      "description": "QA + production deployment",
      "order": 3,
      "amountLamports": 500000000
    }
  ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `milestones` | array | yes | At least one item |
| `title` | string | yes | Display label |
| `description` | string | no | Optional detail |
| `order` | integer ≥ 1 | yes | Display order |
| `amountLamports` | integer ≥ 1 | yes | Fixed forever — choose carefully |

**Response:**
```json
{
  "success": true,
  "message": "Milestones created successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "jobId": "550e8400-e29b-41d4-a716-446655440000",
      "title": "UI Design",
      "description": "Design all screens in Figma",
      "order": 1,
      "amountLamports": "500000000",
      "status": "pending",
      "escrowPda": null,
      "vaultPda": null,
      "txSignature": null,
      "createdAt": "2026-04-14T10:00:00.000Z",
      "updatedAt": "2026-04-14T10:00:00.000Z"
    }
  ]
}
```

**Errors:**

| Status | Reason |
|---|---|
| 400 | `amountLamports` is missing, not an integer, or less than 1 |
| 400 | `order` is not a positive integer |
| 401 | Missing or invalid auth token |

---

### `GET /escrow/jobs/:jobId/milestones`

List all milestones for a job, sorted by `order` ascending.

**Response:**
```json
{
  "success": true,
  "message": "Milestones retrieved successfully",
  "data": [
    {
      "id": "uuid",
      "jobId": "uuid",
      "clientId": "did:privy:...",
      "clientWallet": "7xFk...",
      "freelancerId": null,
      "freelancerWallet": null,
      "title": "UI Design",
      "description": "Design all screens in Figma",
      "order": 1,
      "amountLamports": "500000000",
      "status": "funded",
      "escrowPda": "8xH2f...",
      "vaultPda": "3mNp9...",
      "txSignature": "5KtWq...",
      "createdAt": "...",
      "updatedAt": "..."
    },
    {
      "id": "uuid",
      "jobId": "uuid",
      "title": "Development",
      "order": 2,
      "amountLamports": "2000000000",
      "status": "pending",
      "escrowPda": null,
      "vaultPda": null,
      "txSignature": null
    }
  ]
}
```

---

### `GET /escrow/milestones/:milestoneId`

Get a single milestone by its UUID.

**Response:** Same shape as one item from the list above.

---

### `POST /escrow/milestones/:milestoneId/fund`

Fund the on-chain PDA for this milestone. The amount is fixed from when the milestone was created — no amount is needed in the request body.

**Query params:** `?signingMode=server|client` (default `server`)

**No request body.**

**Response — `signingMode=server`:**
```json
{
  "success": true,
  "message": "Milestone funded successfully",
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

> After client-side signing, call `POST /escrow/milestones/:milestoneId/confirm`.

**Errors:**

| Status | Reason |
|---|---|
| 400 | `signingMode=server` but user has no Privy embedded wallet |
| 401 | Missing or invalid auth token |
| 404 | Milestone not found |
| 409 | Milestone is not in `pending` status (already funded, locked, etc.) |

---

### `DELETE /escrow/milestones/:milestoneId/fund`

Withdraw a funded milestone back to the client. Only allowed while status is `funded` (before hire / before locking).

**Query params:** `?signingMode=server|client` (default `server`)

**Response — `signingMode=server`:**
```json
{
  "success": true,
  "message": "Milestone withdrawn successfully",
  "data": { "txSignature": "5KtWqXJZ..." }
}
```

**Response — `signingMode=client`:**
```json
{
  "success": true,
  "message": "Withdraw transaction built — sign and broadcast to complete",
  "data": { "transaction": "<base64>" }
}
```

**Errors:**

| Status | Reason |
|---|---|
| 400 | Milestone is not in `funded` state (locked, released, or refunded) |
| 404 | Milestone not found |

---

### `POST /escrow/milestones/:milestoneId/topup`

Add more SOL to a funded milestone before hire. The stored `amountLamports` increases to reflect the new total. Only allowed while status is `funded`.

**Query params:** `?signingMode=server|client` (default `server`)

**Request body:**
```json
{
  "additionalLamports": 100000000
}
```

**Response — `signingMode=server`:**
```json
{
  "success": true,
  "message": "Milestone topped up successfully",
  "data": { "txSignature": "5KtWqXJZ..." }
}
```

**Response — `signingMode=client`:**
```json
{
  "success": true,
  "message": "Top-up transaction built — sign and broadcast to complete",
  "data": { "transaction": "<base64>" }
}
```

**Errors:**

| Status | Reason |
|---|---|
| 400 | `additionalLamports` is not a positive integer |
| 400 | Milestone is not in `funded` state |
| 404 | Milestone not found |

---

### `POST /escrow/milestones/:milestoneId/release`

Release a locked milestone — transfers the SOL to the freelancer. Milestone must be in `locked` status (a freelancer must have been hired first).

**Query params:** `?signingMode=server|client` (default `server`)

**No request body.**

**Response — `signingMode=server`:**
```json
{
  "success": true,
  "message": "Milestone released successfully",
  "data": { "txSignature": "5KtWqXJZ..." }
}
```

**Response — `signingMode=client`:**
```json
{
  "success": true,
  "message": "Release transaction built — sign and broadcast to complete",
  "data": { "transaction": "<base64>" }
}
```

**Errors:**

| Status | Reason |
|---|---|
| 400 | Milestone is not in `locked` status |
| 400 | Freelancer wallet not recorded (lock step was skipped) |
| 404 | Milestone not found |

---

### `POST /escrow/milestones/:milestoneId/confirm`

Used after `signingMode=client`. Verifies the transaction on-chain and updates the milestone record in the database. Supports two sub-modes:

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

**Request body — relay mode:**
```json
{
  "signedTransaction": "AQAAAA..."
}
```

`signedTransaction` is the base64-encoded signed transaction from `wallet.signTransaction()`.

**Response:**
```json
{
  "success": true,
  "message": "Milestone transaction confirmed",
  "data": {
    "id": "uuid",
    "jobId": "uuid",
    "clientId": "did:privy:...",
    "clientWallet": "7xFk...",
    "title": "UI Design",
    "order": 1,
    "amountLamports": "500000000",
    "status": "funded",
    "escrowPda": "8xH2f...",
    "vaultPda": "3mNp9...",
    "txSignature": "5KtWqXJZ...",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

The `status` in the response reflects the actual on-chain state (funded / released / refunded), not just what the client intended.

**Errors:**

| Status | Reason |
|---|---|
| 400 | Neither `txSignature` nor `signedTransaction` provided |
| 400 | Transaction failed on-chain (`meta.err` is set) |
| 404 | Milestone not found |
| 404 | `txSignature` not found on-chain yet — retry after a few seconds |

---

### `POST /escrow/milestones/:milestoneId/refund` *(admin only)*

Platform authority force-refunds a funded or locked milestone back to the client. Used for dispute resolution.

**Required header:** `admin-token: <platform-admin-token>`

**No request body.**

**Response:**
```json
{
  "success": true,
  "message": "Milestone refunded successfully",
  "data": { "txSignature": "5KtWqXJZ..." }
}
```

---

## 5. TypeScript Types

```typescript
// milestone.types.ts

export type MilestoneStatus = 'pending' | 'funded' | 'locked' | 'released' | 'refunded';

export interface MilestoneRecord {
  id: string;
  jobId: string;
  clientId: string | null;
  clientWallet: string | null;
  freelancerId: string | null;
  freelancerWallet: string | null;
  title: string;
  description: string | null;
  order: number;
  /** Fixed amount stored as string to avoid JS BigInt precision loss */
  amountLamports: string;
  status: MilestoneStatus;
  escrowPda: string | null;   // null until funded
  vaultPda: string | null;    // null until funded
  txSignature: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMilestoneItem {
  title: string;
  description?: string;
  order: number;
  amountLamports: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// signingMode=server responses
export interface MilestoneFundServerResponse {
  txSignature: string;
  escrowPda: string;
  vaultPda: string;
}
export interface MilestoneActionServerResponse {
  txSignature: string;
}

// signingMode=client responses
export interface MilestoneFundClientResponse {
  transaction: string;  // base64 unsigned tx
  escrowPda: string;
  vaultPda: string;
}
export interface MilestoneActionClientResponse {
  transaction: string;  // base64 unsigned tx
}
```

---

## 6. API Client

```typescript
// lib/milestone-api.ts
import type {
  ApiResponse,
  MilestoneRecord,
  CreateMilestoneItem,
  MilestoneFundServerResponse,
  MilestoneActionServerResponse,
  MilestoneFundClientResponse,
  MilestoneActionClientResponse,
} from './milestone.types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export class MilestoneError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'MilestoneError';
  }
}

async function apiFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const json: ApiResponse<T> = await res.json();
  if (!res.ok || !json.success) {
    throw new MilestoneError(json.message ?? 'Request failed', res.status);
  }
  return json.data;
}

// ─── Milestone CRUD ──────────────────────────────────────────────────────────

/** Create the milestone plan for a job. Call once before funding. */
export async function createMilestones(
  jobId: string,
  milestones: CreateMilestoneItem[],
  token: string,
): Promise<MilestoneRecord[]> {
  return apiFetch<MilestoneRecord[]>(
    `/escrow/jobs/${jobId}/milestones`,
    token,
    { method: 'POST', body: JSON.stringify({ milestones }) },
  );
}

/** List all milestones for a job, sorted by order. */
export async function getMilestones(
  jobId: string,
  token: string,
): Promise<MilestoneRecord[]> {
  return apiFetch<MilestoneRecord[]>(`/escrow/jobs/${jobId}/milestones`, token);
}

/** Get a single milestone by ID. */
export async function getMilestone(
  milestoneId: string,
  token: string,
): Promise<MilestoneRecord> {
  return apiFetch<MilestoneRecord>(`/escrow/milestones/${milestoneId}`, token);
}

// ─── Server-mode operations (Privy embedded wallet) ──────────────────────────

/** Fund a milestone using Privy server-side signing. */
export async function fundMilestone(
  milestoneId: string,
  token: string,
): Promise<MilestoneFundServerResponse> {
  return apiFetch<MilestoneFundServerResponse>(
    `/escrow/milestones/${milestoneId}/fund?signingMode=server`,
    token,
    { method: 'POST' },
  );
}

/** Withdraw a funded milestone (server signing). */
export async function withdrawMilestone(
  milestoneId: string,
  token: string,
): Promise<MilestoneActionServerResponse> {
  return apiFetch<MilestoneActionServerResponse>(
    `/escrow/milestones/${milestoneId}/fund?signingMode=server`,
    token,
    { method: 'DELETE' },
  );
}

/** Add more SOL to a funded milestone (server signing). */
export async function topUpMilestone(
  milestoneId: string,
  additionalLamports: number,
  token: string,
): Promise<MilestoneActionServerResponse> {
  return apiFetch<MilestoneActionServerResponse>(
    `/escrow/milestones/${milestoneId}/topup?signingMode=server`,
    token,
    { method: 'POST', body: JSON.stringify({ additionalLamports }) },
  );
}

/** Release a locked milestone to the freelancer (server signing). */
export async function releaseMilestone(
  milestoneId: string,
  token: string,
): Promise<MilestoneActionServerResponse> {
  return apiFetch<MilestoneActionServerResponse>(
    `/escrow/milestones/${milestoneId}/release?signingMode=server`,
    token,
    { method: 'POST' },
  );
}

// ─── Client-mode operations (external wallet) ────────────────────────────────

/** Build unsigned fund tx for an external wallet to sign. */
export async function buildMilestoneFundTx(
  milestoneId: string,
  token: string,
): Promise<MilestoneFundClientResponse> {
  return apiFetch<MilestoneFundClientResponse>(
    `/escrow/milestones/${milestoneId}/fund?signingMode=client`,
    token,
    { method: 'POST' },
  );
}

/** Build unsigned withdraw tx. */
export async function buildMilestoneWithdrawTx(
  milestoneId: string,
  token: string,
): Promise<MilestoneActionClientResponse> {
  return apiFetch<MilestoneActionClientResponse>(
    `/escrow/milestones/${milestoneId}/fund?signingMode=client`,
    token,
    { method: 'DELETE' },
  );
}

/** Build unsigned top-up tx. */
export async function buildMilestoneTopUpTx(
  milestoneId: string,
  additionalLamports: number,
  token: string,
): Promise<MilestoneActionClientResponse> {
  return apiFetch<MilestoneActionClientResponse>(
    `/escrow/milestones/${milestoneId}/topup?signingMode=client`,
    token,
    { method: 'POST', body: JSON.stringify({ additionalLamports }) },
  );
}

/** Build unsigned release tx. */
export async function buildMilestoneReleaseTx(
  milestoneId: string,
  token: string,
): Promise<MilestoneActionClientResponse> {
  return apiFetch<MilestoneActionClientResponse>(
    `/escrow/milestones/${milestoneId}/release?signingMode=client`,
    token,
    { method: 'POST' },
  );
}

/**
 * Confirm a client-signed milestone transaction.
 * Pass `signedTransaction` to relay (backend broadcasts).
 * Pass `txSignature` if the frontend already broadcast.
 */
export async function confirmMilestone(
  milestoneId: string,
  token: string,
  payload: { signedTransaction: string } | { txSignature: string },
): Promise<MilestoneRecord> {
  return apiFetch<MilestoneRecord>(
    `/escrow/milestones/${milestoneId}/confirm`,
    token,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}
```

---

## 7. Server-Side Signing (Privy Embedded Wallet)

Simplest integration — the backend signs and broadcasts. No Solana SDK needed.

### Setup a milestone job

```tsx
// components/CreateMilestoneJob.tsx
import { usePrivy } from '@privy-io/react-auth';
import { createMilestones, fundMilestone } from '@/lib/milestone-api';

const SOL = 1_000_000_000; // lamports per SOL

export function CreateMilestoneJob({ jobId }: { jobId: string }) {
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = React.useState(false);

  async function setupAndFundFirstMilestone() {
    setLoading(true);
    try {
      const token = await getAccessToken();

      // Step 1: define the plan
      const milestones = await createMilestones(
        jobId,
        [
          { title: 'UI Design',     order: 1, amountLamports: 0.5 * SOL },
          { title: 'Development',   order: 2, amountLamports: 2.0 * SOL },
          { title: 'Testing',       order: 3, amountLamports: 0.5 * SOL },
        ],
        token!,
      );

      // Step 2: fund milestone 1 immediately
      const result = await fundMilestone(milestones[0].id, token!);
      console.log('M1 funded, tx:', result.txSignature);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={setupAndFundFirstMilestone} disabled={loading}>
      {loading ? 'Setting up…' : 'Create job with milestones'}
    </button>
  );
}
```

### Release a milestone

```tsx
import { releaseMilestone } from '@/lib/milestone-api';

async function handleRelease(milestoneId: string, token: string) {
  const result = await releaseMilestone(milestoneId, token);
  console.log('Released! tx:', result.txSignature);
}
```

---

## 8. Client-Side Signing (External Wallet)

Use when the user connected an external wallet (Phantom, Backpack, etc.).

Two sub-modes are available:

| Sub-mode | Flow |
|---|---|
| **Relay** (recommended) | Frontend signs → sends signed bytes to `/confirm` → backend broadcasts |
| **Self-broadcast** | Frontend signs + broadcasts → sends `txSignature` to `/confirm` |

### Relay helper

```typescript
// lib/milestone-external-wallet.ts
import { Transaction } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import {
  buildMilestoneFundTx,
  buildMilestoneWithdrawTx,
  buildMilestoneTopUpTx,
  buildMilestoneReleaseTx,
  confirmMilestone,
} from './milestone-api';
import type { MilestoneRecord } from './milestone.types';

/** Sign the unsigned tx from the backend and relay it for broadcast. */
async function signAndRelay(
  base64UnsignedTx: string,
  milestoneId: string,
  token: string,
  wallet: WalletContextState,
): Promise<MilestoneRecord> {
  if (!wallet.signTransaction || !wallet.publicKey) {
    throw new Error('Wallet not connected');
  }
  const tx = Transaction.from(Buffer.from(base64UnsignedTx, 'base64'));
  tx.feePayer = wallet.publicKey;
  const signed = await wallet.signTransaction(tx);
  const signedBase64 = signed.serialize({ requireAllSignatures: false }).toString('base64');
  return confirmMilestone(milestoneId, token, { signedTransaction: signedBase64 });
}

export async function fundMilestoneRelay(
  milestoneId: string,
  token: string,
  wallet: WalletContextState,
): Promise<MilestoneRecord> {
  const { transaction } = await buildMilestoneFundTx(milestoneId, token);
  return signAndRelay(transaction, milestoneId, token, wallet);
}

export async function withdrawMilestoneRelay(
  milestoneId: string,
  token: string,
  wallet: WalletContextState,
): Promise<MilestoneRecord> {
  const { transaction } = await buildMilestoneWithdrawTx(milestoneId, token);
  return signAndRelay(transaction, milestoneId, token, wallet);
}

export async function topUpMilestoneRelay(
  milestoneId: string,
  additionalLamports: number,
  token: string,
  wallet: WalletContextState,
): Promise<MilestoneRecord> {
  const { transaction } = await buildMilestoneTopUpTx(milestoneId, additionalLamports, token);
  return signAndRelay(transaction, milestoneId, token, wallet);
}

export async function releaseMilestoneRelay(
  milestoneId: string,
  token: string,
  wallet: WalletContextState,
): Promise<MilestoneRecord> {
  const { transaction } = await buildMilestoneReleaseTx(milestoneId, token);
  return signAndRelay(transaction, milestoneId, token, wallet);
}
```

### Component example

```tsx
// components/MilestoneActions.tsx
import { useWallet } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import {
  fundMilestoneRelay,
  withdrawMilestoneRelay,
  releaseMilestoneRelay,
} from '@/lib/milestone-external-wallet';
import type { MilestoneRecord } from '@/lib/milestone.types';

export function MilestoneActions({ milestone }: { milestone: MilestoneRecord }) {
  const wallet = useWallet();
  const { getAccessToken } = usePrivy();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run(fn: () => Promise<MilestoneRecord>) {
    if (!wallet.connected) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      console.log('New status:', result.status);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const token = async () => (await getAccessToken())!;

  return (
    <div>
      {milestone.status === 'pending' && (
        <button onClick={() => run(async () => fundMilestoneRelay(milestone.id, await token(), wallet))} disabled={loading}>
          Fund {lamportsToSol(milestone.amountLamports)} SOL
        </button>
      )}

      {milestone.status === 'funded' && (
        <>
          <button onClick={() => run(async () => withdrawMilestoneRelay(milestone.id, await token(), wallet))} disabled={loading}>
            Withdraw
          </button>
        </>
      )}

      {milestone.status === 'locked' && (
        <button onClick={() => run(async () => releaseMilestoneRelay(milestone.id, await token(), wallet))} disabled={loading}>
          Release Payment
        </button>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}

function lamportsToSol(lamports: string): string {
  return (Number(BigInt(lamports)) / 1_000_000_000).toFixed(4);
}
```

---

## 9. React Hooks

### `useMilestones` — list milestones for a job

```typescript
// hooks/useMilestones.ts
import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { getMilestones, createMilestones } from '@/lib/milestone-api';
import type { MilestoneRecord, CreateMilestoneItem } from '@/lib/milestone.types';

export function useMilestones(jobId: string) {
  const { getAccessToken } = usePrivy();
  const [milestones, setMilestones] = useState<MilestoneRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const data = await getMilestones(jobId, token!);
      setMilestones(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [jobId, getAccessToken]);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(
    async (items: CreateMilestoneItem[]) => {
      const token = await getAccessToken();
      const result = await createMilestones(jobId, items, token!);
      setMilestones(result);
      return result;
    },
    [jobId, getAccessToken],
  );

  return { milestones, loading, error, refresh, create };
}
```

### `useMilestone` — single milestone actions

```typescript
// hooks/useMilestone.ts
import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  fundMilestone,
  withdrawMilestone,
  releaseMilestone,
  topUpMilestone,
  getMilestone,
  MilestoneError,
} from '@/lib/milestone-api';
import {
  fundMilestoneRelay,
  withdrawMilestoneRelay,
  releaseMilestoneRelay,
  topUpMilestoneRelay,
} from '@/lib/milestone-external-wallet';
import type { MilestoneRecord } from '@/lib/milestone.types';

type SigningMode = 'server' | 'client';

export function useMilestone(milestoneId: string, signingMode: SigningMode = 'server') {
  const { getAccessToken } = usePrivy();
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withLoading = useCallback(async <T>(fn: () => Promise<T>) => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof MilestoneError ? err.message : 'Something went wrong';
      setError(msg);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  const getToken = useCallback(async () => (await getAccessToken())!, [getAccessToken]);

  const fund = useCallback(
    () => withLoading(async () => {
      const token = await getToken();
      return signingMode === 'server'
        ? fundMilestone(milestoneId, token)
        : fundMilestoneRelay(milestoneId, token, wallet);
    }),
    [milestoneId, signingMode, getToken, wallet, withLoading],
  );

  const withdraw = useCallback(
    () => withLoading(async () => {
      const token = await getToken();
      return signingMode === 'server'
        ? withdrawMilestone(milestoneId, token)
        : withdrawMilestoneRelay(milestoneId, token, wallet);
    }),
    [milestoneId, signingMode, getToken, wallet, withLoading],
  );

  const topUp = useCallback(
    (additionalLamports: number) => withLoading(async () => {
      const token = await getToken();
      return signingMode === 'server'
        ? topUpMilestone(milestoneId, additionalLamports, token)
        : topUpMilestoneRelay(milestoneId, additionalLamports, token, wallet);
    }),
    [milestoneId, signingMode, getToken, wallet, withLoading],
  );

  const release = useCallback(
    () => withLoading(async () => {
      const token = await getToken();
      return signingMode === 'server'
        ? releaseMilestone(milestoneId, token)
        : releaseMilestoneRelay(milestoneId, token, wallet);
    }),
    [milestoneId, signingMode, getToken, wallet, withLoading],
  );

  const refresh = useCallback(
    () => withLoading(async () => getMilestone(milestoneId, await getToken())),
    [milestoneId, getToken, withLoading],
  );

  return { fund, withdraw, topUp, release, refresh, loading, error };
}
```

### Full milestone board component

```tsx
// components/MilestoneBoard.tsx
import { useMilestones } from '@/hooks/useMilestones';
import { useMilestone } from '@/hooks/useMilestone';
import type { MilestoneRecord } from '@/lib/milestone.types';

const SOL = 1_000_000_000;

function lamportsToSol(l: string) {
  return (Number(BigInt(l)) / SOL).toFixed(2);
}

function statusBadge(status: MilestoneRecord['status']) {
  const colors: Record<string, string> = {
    pending:  '#888',
    funded:   '#2196F3',
    locked:   '#FF9800',
    released: '#4CAF50',
    refunded: '#9E9E9E',
  };
  return (
    <span style={{
      background: colors[status],
      color: 'white',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 12,
      textTransform: 'capitalize',
    }}>
      {status}
    </span>
  );
}

function MilestoneRow({ milestone }: { milestone: MilestoneRecord }) {
  const { fund, withdraw, release, loading, error } = useMilestone(milestone.id);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #eee' }}>
      <span style={{ minWidth: 24, color: '#888' }}>#{milestone.order}</span>
      <div style={{ flex: 1 }}>
        <strong>{milestone.title}</strong>
        {milestone.description && <p style={{ margin: 0, fontSize: 13, color: '#666' }}>{milestone.description}</p>}
      </div>
      <span style={{ minWidth: 80, textAlign: 'right' }}>
        {lamportsToSol(milestone.amountLamports)} SOL
      </span>
      {statusBadge(milestone.status)}

      <div style={{ display: 'flex', gap: 8 }}>
        {milestone.status === 'pending' && (
          <button onClick={() => fund()} disabled={loading} style={{ background: '#2196F3', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px' }}>
            {loading ? '…' : 'Fund'}
          </button>
        )}
        {milestone.status === 'funded' && (
          <button onClick={() => withdraw()} disabled={loading} style={{ background: '#f44336', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px' }}>
            {loading ? '…' : 'Withdraw'}
          </button>
        )}
        {milestone.status === 'locked' && (
          <button onClick={() => release()} disabled={loading} style={{ background: '#4CAF50', color: 'white', border: 'none', borderRadius: 4, padding: '4px 12px' }}>
            {loading ? '…' : 'Release'}
          </button>
        )}
      </div>

      {error && <span style={{ color: 'red', fontSize: 12 }}>{error}</span>}
    </div>
  );
}

export function MilestoneBoard({ jobId }: { jobId: string }) {
  const { milestones, loading, error, refresh } = useMilestones(jobId);

  const totalSol = milestones.reduce(
    (sum, m) => sum + Number(BigInt(m.amountLamports)) / SOL,
    0,
  );
  const fundedSol = milestones
    .filter((m) => ['funded', 'locked', 'released'].includes(m.status))
    .reduce((sum, m) => sum + Number(BigInt(m.amountLamports)) / SOL, 0);

  if (loading) return <p>Loading milestones…</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (milestones.length === 0) return <p>No milestones defined for this job.</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Milestones</h3>
        <span style={{ color: '#666', fontSize: 14 }}>
          {fundedSol.toFixed(2)} / {totalSol.toFixed(2)} SOL committed
        </span>
      </div>

      {milestones.map((m) => (
        <MilestoneRow key={m.id} milestone={m} />
      ))}

      <button onClick={refresh} style={{ marginTop: 12, fontSize: 13, color: '#666', background: 'none', border: '1px solid #ccc', borderRadius: 4, padding: '4px 10px' }}>
        Refresh
      </button>
    </div>
  );
}
```

---

## 10. Error Handling

All API errors follow this shape:

```typescript
interface ApiError {
  success: false;
  message: string;
  statusCode: number;
}
```

### Common errors

| HTTP | Message | What to do |
|---|---|---|
| 400 | `Milestone … cannot be funded (status: funded)` | Milestone already funded — check status before calling fund |
| 400 | `Milestone … is not Funded — withdrawal not allowed` | Can only withdraw when status is `funded` |
| 400 | `Milestone … is not Locked — release not allowed` | Freelancer hasn't been hired yet |
| 400 | `Freelancer wallet not set for milestone` | Lock step was skipped — contact support |
| 400 | `Milestone … is already finalised` | Admin refund not possible on released/refunded milestone |
| 400 | `additionalLamports must be an integer` | Send integer lamports, not a float SOL value |
| 400 | `Transaction … failed on-chain` | Solana program rejected the tx — check account state |
| 400 | `Server-side signing requires a Privy embedded wallet` | User has an external wallet; use `signingMode=client` |
| 401 | `Missing authorization token` | Refresh the Privy access token |
| 404 | `Milestone … not found` | Wrong UUID or milestone was deleted |
| 404 | `Transaction … not found on-chain` | Tx hasn't been confirmed yet — retry confirm |
| 409 | `Milestone … cannot be funded (status: …)` | Milestone is not in `pending` state |

### Retry confirm

The confirm endpoint can return 404 if the transaction hasn't been indexed yet. Retry with backoff:

```typescript
async function confirmWithRetry(
  milestoneId: string,
  token: string,
  payload: { signedTransaction: string } | { txSignature: string },
  maxRetries = 5,
  delayMs = 2000,
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await confirmMilestone(milestoneId, token, payload);
    } catch (err) {
      if (err instanceof MilestoneError && err.statusCode === 404 && i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Milestone confirmation timed out — check Solana Explorer for tx status');
}
```

---

## 11. Milestone Lifecycle

```
  POST /jobs/:jobId/milestones
  → all milestones created with status [PENDING]

  POST /milestones/:id/fund
        │
        ▼
    [FUNDED]  ◄── POST /milestones/:id/topup (add SOL, stays FUNDED)
        │
        ├── DELETE /milestones/:id/fund ──────────────► [REFUNDED]
        │                                                    ▲
        │  PROPOSAL_HIRED event (automatic)                  │
        ▼                                                    │
    [LOCKED]  ──── POST /milestones/:id/refund (admin) ──────┘
        │
        │  POST /milestones/:id/release
        ▼
    [RELEASED]   ← terminal, funds sent to freelancer
```

**Per-milestone status meanings:**

| Status | What it means |
|---|---|
| `pending` | Defined in DB, not yet funded on-chain |
| `funded` | SOL locked in PDA, freelancer not yet hired |
| `locked` | Freelancer hired, withdrawal blocked |
| `released` | SOL paid out to freelancer |
| `refunded` | SOL returned to client (withdraw or admin refund) |

**Job active state derived from milestones:**
- Job becomes **active** (visible in listings) when any milestone reaches `funded` or `locked`
- Job becomes **inactive** when all milestones are `released` or `refunded` (zero funded/locked remaining)

---

## 12. UI Display Guide

### Status badges

```typescript
const STATUS_LABELS: Record<string, { label: string; color: string; description: string }> = {
  pending:  { label: 'Not funded',  color: '#888',    description: 'Awaiting client funding' },
  funded:   { label: 'Funded',      color: '#2196F3', description: 'SOL in escrow, hire pending' },
  locked:   { label: 'In progress', color: '#FF9800', description: 'Work in progress, funds locked' },
  released: { label: 'Paid',        color: '#4CAF50', description: 'Freelancer paid' },
  refunded: { label: 'Withdrawn',   color: '#9E9E9E', description: 'Funds returned to client' },
};
```

### Which actions to show

| Viewer | Status | Show |
|---|---|---|
| Client | `pending` | Fund button |
| Client | `funded` | Withdraw button, Add more SOL button |
| Client | `locked` | Release button (when work is done) |
| Client | `released` | Nothing (terminal) |
| Client | `refunded` | Nothing |
| Freelancer | `locked` | "Funds secured" indicator |
| Freelancer | `released` | "Payment sent" indicator |

### Progress indicator

```tsx
function MilestoneProgress({ milestones }: { milestones: MilestoneRecord[] }) {
  const total = milestones.length;
  const released = milestones.filter((m) => m.status === 'released').length;
  const pct = total === 0 ? 0 : Math.round((released / total) * 100);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>{released} of {total} milestones released</span>
        <span>{pct}%</span>
      </div>
      <div style={{ height: 6, background: '#eee', borderRadius: 3, marginTop: 4 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#4CAF50', borderRadius: 3 }} />
      </div>
    </div>
  );
}
```

### Convert lamports

```typescript
const SOL = 1_000_000_000n;

/** Display lamports as SOL string, e.g. "0.5000" */
function lamportsToSol(lamports: string): string {
  return (Number(BigInt(lamports)) / Number(SOL)).toFixed(4);
}

/** Total value of all milestones */
function totalJobValue(milestones: MilestoneRecord[]): string {
  const total = milestones.reduce((sum, m) => sum + BigInt(m.amountLamports), 0n);
  return lamportsToSol(total.toString());
}
```

---

## 13. Known Behaviour

### Milestones funded after hire are not auto-locked

When a freelancer is hired, the platform locks all milestones that are currently in `funded` status. Milestones that are still `pending` at hire time are **not** locked — this is by design (fund-as-you-go).

However, if a client funds a new milestone **after** the freelancer is already hired, that milestone will remain in `funded` status (not `locked`). This means:
- The client could technically withdraw it even though work is ongoing
- The platform admin can force-lock it via the refund flow, or you can build a separate admin lock endpoint

**Recommended UX:** After hire, show a warning if a newly-funded milestone is in `funded` status and prompt the client to contact support to have it locked, or lock it automatically via an admin trigger in your platform's hiring confirmation flow.

### Amount is fixed at creation

`amountLamports` is set when milestones are created and cannot be changed — only increased via top-up. If the client wants to reduce a milestone's amount, they must withdraw it (if still `funded`) and recreate it.

### One on-chain PDA per milestone

Each milestone has its own escrow PDA derived from its `id` (UUID). This means:
- PDAs are independent — releasing M1 does not affect M2's on-chain state
- Gas costs are per-milestone (one transaction to fund, one to release each)

### `refunded` milestones cannot be re-funded

Once a milestone's on-chain PDA has been initialized (via fund) and then closed (via withdraw/refund), the Anchor `init` constraint prevents re-initializing the same PDA. A refunded milestone is permanently closed on-chain. To re-do a milestone, delete it from DB and create a new one with a new UUID.
