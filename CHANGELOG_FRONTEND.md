# MintJobs Backend Changes — Frontend Integration Guide

This document explains all recent backend changes that affect the frontend. Read this to understand what changed, what's new, and what you need to update.

---

## 1. Platform Fee (5% Total)

### What changed

Every escrow (job or milestone) now has a **5% platform fee**, split into two 2.5% phases:

- **At fund time**: Client is charged `amount + 2.5%`. If they fund 1 SOL, their wallet is debited 1.025 SOL.
- **At hire (lock)**: The 2.5% fee moves from the escrow vault to the platform fee vault.
- **At release**: Another 2.5% is deducted from the remaining amount. Freelancer receives `amount - 2.5%`.
- **At withdraw (pre-hire)**: Full refund including the fee. Client pays nothing.

### What the frontend needs to do

**Show the fee to the client before they fund:**

```typescript
const FEE_PERCENT = 2.5;

function calculateTotal(amountSol: number) {
  const fee = amountSol * (FEE_PERCENT / 100);
  return {
    principal: amountSol,
    fee,
    total: amountSol + fee,  // this is what leaves the wallet
  };
}

// Example: client wants to fund 1 SOL
// principal: 1.0 SOL, fee: 0.025 SOL, total: 1.025 SOL
```

**Show the freelancer what they'll actually receive:**

```typescript
function calculateFreelancerPayout(amountSol: number) {
  const releaseFee = amountSol * (FEE_PERCENT / 100);
  return amountSol - releaseFee;
}

// Example: escrow holds 1 SOL principal
// freelancer receives: 0.975 SOL
```

**Display tips:**
- On the fund form: "You'll be charged **1.025 SOL** (1.0 SOL + 0.025 SOL platform fee)"
- On the escrow card: "Freelancer will receive **0.975 SOL** after platform fee"
- On withdraw: "Full refund — no fee charged"

### API changes

**No API changes.** The `amountLamports` you pass to `POST /fund` is the principal. The on-chain program adds the 2.5% automatically. The client wallet must have enough for principal + fee + gas.

The escrow response now includes a new field:

```json
{
  "amountLamports": "1000000000",
  "platformFeeLamports": "25000000"
}
```

### New admin endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/escrow/fees/balance` | Get platform fee vault balance (admin-token required) |
| `POST` | `/escrow/fees/withdraw` | Withdraw fees to authority wallet (admin-token required) |

---

## 2. Milestone Payments

### What's new

Jobs can now have **milestone-based payments**. Instead of one lump-sum escrow, the client defines ordered milestones with fixed amounts and funds them individually.

### New endpoints

**Under `/escrow/jobs/:jobId/...`:**

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/escrow/jobs/:jobId/milestones` | Create milestone plan for a job |
| `GET` | `/escrow/jobs/:jobId/milestones` | List all milestones for a job |

**Under `/escrow/milestones/:milestoneId/...`:**

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/escrow/milestones/:milestoneId` | Get single milestone |
| `POST` | `/escrow/milestones/:milestoneId/fund` | Fund a milestone |
| `DELETE` | `/escrow/milestones/:milestoneId/fund` | Withdraw a funded milestone |
| `POST` | `/escrow/milestones/:milestoneId/topup` | Top up a funded milestone |
| `POST` | `/escrow/milestones/:milestoneId/release` | Release to freelancer |
| `POST` | `/escrow/milestones/:milestoneId/refund` | Admin force-refund |
| `POST` | `/escrow/milestones/:milestoneId/confirm` | Confirm client-signed tx |

All milestone endpoints support `?signingMode=server|client` just like job escrow.

### Milestone status flow

```
PENDING → FUNDED → LOCKED → RELEASED
                          → REFUNDED
```

- `pending` — defined, not funded yet
- `funded` — on-chain, client can withdraw
- `locked` — freelancer hired, funds locked (auto on hire)
- `released` — paid to freelancer
- `refunded` — returned to client

### Create milestones

```typescript
// POST /escrow/jobs/:jobId/milestones
{
  "milestones": [
    { "title": "UI Design", "order": 1, "amountLamports": 500000000 },
    { "title": "Development", "order": 2, "amountLamports": 2000000000 },
    { "title": "Testing", "order": 3, "amountLamports": 500000000 }
  ]
}
```

Amount is **fixed at creation** — the fund endpoint uses the stored amount, no amount param needed.

### Fund a milestone

```typescript
// POST /escrow/milestones/:milestoneId/fund?signingMode=server
// No body needed — amount comes from the milestone record
```

See `MILESTONES_FRONTEND.md` for full TypeScript types, API client, React hooks, and component examples.

---

## 3. Hiring Flow — Two-Party Signing (Breaking Change)

### What changed

Previously, hiring was one-sided: client sets proposal status to `hired` and everything fires immediately. Now there's a two-step process:

```
BEFORE:
  Client → PATCH /proposals/:id/status { status: "hired" }
  → Contract generated + escrow locked immediately

NOW:
  Client → PATCH /proposals/:id/status { status: "hired", clientWallet, clientSignature }
  → Proposal goes to "awaiting_acceptance" (not "hired" yet)

  Freelancer → POST /proposals/:id/accept { freelancerWallet, freelancerSignature }
  → Proposal goes to "hired"
  → Contract generated (with both signatures in PDF)
  → PDF uploaded to S3 + IPFS
  → On-chain contract PDA created on Solana
  → Escrow locked
```

### New proposal status: `awaiting_acceptance`

Update your status displays:

```typescript
type ProposalStatus = 'pending' | 'shortlisted' | 'awaiting_acceptance' | 'hired' | 'rejected';
```

| Status | Client sees | Freelancer sees |
|--------|------------|-----------------|
| `pending` | New application | Your application |
| `shortlisted` | Shortlisted | You've been shortlisted |
| `awaiting_acceptance` | Offer sent, waiting | You have a hire offer! Accept or decline |
| `hired` | Hired, contract generating | You're hired! Contract being created |
| `rejected` | Rejected | Rejected |

### Updated: Hire endpoint

**`PATCH /proposals/:id/status`** now requires wallet + signature when hiring:

```typescript
// Client hiring a freelancer
const response = await fetch(`/proposals/${proposalId}/status`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    status: 'hired',
    clientWallet: '7xFk...',        // NEW — required
    clientSignature: 'base64sig...',  // NEW — required
  }),
});
// Response: proposal with status "awaiting_acceptance" (NOT "hired")
```

**How to get the client signature:**

The client signs a message proving they agree to the contract terms. Use the wallet adapter:

```typescript
import { useWallet } from '@solana/wallet-adapter-react';

const wallet = useWallet();

// Create the message to sign
const message = new TextEncoder().encode(
  `I agree to hire freelancer for job ${jobId} on MintJobs`
);

// Sign with the connected wallet
const signature = await wallet.signMessage(message);
const signatureBase64 = Buffer.from(signature).toString('base64');

// Now call the API
await updateProposalStatus(proposalId, {
  status: 'hired',
  clientWallet: wallet.publicKey.toBase58(),
  clientSignature: signatureBase64,
});
```

### New: Accept endpoint (freelancer)

**`POST /proposals/:id/accept`**

The freelancer calls this after the client hires them. This is the second half of the two-party signing.

```typescript
// Freelancer accepting a hire offer
const message = new TextEncoder().encode(
  `I accept the contract for job ${jobId} on MintJobs`
);
const signature = await wallet.signMessage(message);

const response = await fetch(`/proposals/${proposalId}/accept`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    freelancerWallet: wallet.publicKey.toBase58(),
    freelancerSignature: Buffer.from(signature).toString('base64'),
  }),
});
// Response: proposal with status "hired"
// Background: contract PDF generating, IPFS upload, on-chain contract, escrow locking
```

### What happens after acceptance

Everything is automatic. After the freelancer accepts:

1. Contract PDF is generated with both wallet addresses + signatures embedded
2. PDF uploaded to S3 (existing URL) and Pinata/IPFS (new permanent URL)
3. Metadata JSON uploaded to IPFS (contains job details, parties, PDF link, hash)
4. On-chain contract PDA created on Solana (stores metadata URI + PDF hash)
5. Escrow locked (same as before)

---

## 4. On-Chain Contracts

### What's new

Every hire now creates a **permanent, publicly verifiable contract on Solana**. The contract PDA stores:

- Client wallet address
- Freelancer wallet address
- IPFS metadata URI (points to a JSON with full job details + PDF link)
- SHA-256 hash of the contract PDF (tamper-proof verification)
- Creation timestamp

### Contract response now includes

```json
{
  "id": "uuid",
  "proposalId": "uuid",
  "jobId": "uuid",
  "status": "generated",
  "contractUrl": "https://bucket.s3.region.amazonaws.com/contracts/uuid.pdf",
  "ipfsPdfUrl": "https://gateway.pinata.cloud/ipfs/Qm...",
  "ipfsPdfCid": "QmXyz...",
  "ipfsMetadataUrl": "https://gateway.pinata.cloud/ipfs/Qm...",
  "ipfsMetadataCid": "QmAbc...",
  "pdfHash": "a1b2c3d4...",
  "onchainTxSignature": "5KtWq...",
  "contractPda": "8xH2f...",
  "clientWallet": "7xFk...",
  "freelancerWallet": "9pQr..."
}
```

### Display suggestions

```tsx
function ContractDetails({ contract }) {
  return (
    <div>
      {/* PDF download links */}
      <a href={contract.contractUrl}>Download PDF (S3)</a>
      {contract.ipfsPdfUrl && (
        <a href={contract.ipfsPdfUrl}>View on IPFS (permanent)</a>
      )}

      {/* On-chain proof */}
      {contract.onchainTxSignature && (
        <a href={`https://explorer.solana.com/tx/${contract.onchainTxSignature}?cluster=devnet`}>
          View on Solana Explorer
        </a>
      )}

      {/* Verification badge */}
      {contract.pdfHash && contract.contractPda && (
        <span>Verified on-chain</span>
      )}
    </div>
  );
}
```

### Metadata JSON structure (on IPFS)

```json
{
  "name": "MintJobs Contract — UI/UX Design Project",
  "description": "Freelance service agreement on MintJobs",
  "properties": {
    "contractId": "uuid",
    "jobId": "uuid",
    "jobTitle": "UI/UX Design Project",
    "jobCategory": "Design",
    "client": {
      "wallet": "7xFk...",
      "id": "did:privy:..."
    },
    "freelancer": {
      "wallet": "9pQr...",
      "id": "did:privy:..."
    },
    "compensation": {
      "paymentType": "fixed",
      "min": 500,
      "max": 1000,
      "fromCurrency": "sol",
      "toCurrency": null
    },
    "timeline": {
      "startDate": "2026-04-15",
      "endDate": "2026-05-15",
      "duration": 30
    },
    "pdfUrl": "ipfs://QmXyz...",
    "pdfHash": "a1b2c3d4e5f6...",
    "createdAt": "2026-04-15T10:00:00.000Z"
  }
}
```

---

## 5. Summary of Breaking Changes

| Area | Before | After | Frontend action required |
|------|--------|-------|------------------------|
| Hiring | `PATCH /status { status: "hired" }` → instant | Must include `clientWallet` + `clientSignature` → goes to `awaiting_acceptance` | Update hire call, add wallet signing |
| Freelancer acceptance | Not needed | `POST /proposals/:id/accept` required | Build acceptance UI for freelancers |
| Proposal statuses | 4 statuses | 5 statuses (new: `awaiting_acceptance`) | Update status displays/filters |
| Escrow funding | Client pays exact amount | Client pays amount + 2.5% fee | Show fee breakdown in UI |
| Contract response | Only `contractUrl` | New fields: IPFS URLs, hash, PDA, wallet addresses | Display IPFS links + on-chain proof |

---

## 6. New Environment Variables

Add to your frontend `.env`:

```bash
# No new frontend env vars needed for fees or contracts.
# The backend handles all Pinata/Solana interactions.
# Existing vars remain unchanged:
NEXT_PUBLIC_API_URL=https://your-api.example.com
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_PROGRAM_ID=DSpvnGTUxHo47tLgGJygq9F1ZX1TvGVrv7Ku2jAfBew8
```

---

## 7. TypeScript Types to Update

```typescript
// Updated proposal status
type ProposalStatus = 'pending' | 'shortlisted' | 'awaiting_acceptance' | 'hired' | 'rejected';

// Updated escrow record
interface EscrowRecord {
  // ... existing fields ...
  platformFeeLamports: string;  // NEW
}

// Updated milestone record
interface MilestoneRecord {
  // ... existing fields ...
  platformFeeLamports: string;  // NEW
}

// Updated contract record
interface ContractRecord {
  id: string;
  proposalId: string;
  jobId: string;
  clientId: string;
  applicantId: string;
  status: 'generating' | 'generated' | 'failed' | 'terminated' | 'completed';
  contractUrl?: string;           // S3 URL
  // NEW fields:
  ipfsPdfUrl?: string;            // IPFS gateway URL for PDF
  ipfsPdfCid?: string;            // IPFS CID
  ipfsMetadataUrl?: string;       // IPFS gateway URL for metadata JSON
  ipfsMetadataCid?: string;       // IPFS CID
  pdfHash?: string;               // hex SHA-256 of PDF bytes
  onchainTxSignature?: string;    // Solana tx signature
  contractPda?: string;           // On-chain contract PDA address
  clientWallet?: string;
  freelancerWallet?: string;
}

// New DTO for hiring
interface HireProposalPayload {
  status: 'hired';
  clientWallet: string;
  clientSignature: string;
}

// New DTO for accepting
interface AcceptProposalPayload {
  freelancerWallet: string;
  freelancerSignature: string;
}
```
