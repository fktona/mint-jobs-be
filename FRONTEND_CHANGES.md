# Frontend Integration Changes

## Breaking Changes

### 1. Proposal hiring is now two-step

Before: client sets status → `hired` and it's done.  
Now: client sets status → `awaiting_acceptance`. Freelancer must then explicitly accept.

**PATCH `/proposals/:id/status`** — when setting `"hired"`, now requires two extra fields:

```json
{
  "status": "hired",
  "clientWallet": "SolanaBase58Address",
  "clientSignature": "base64EncodedSignature"
}
```

The message to sign (UTF-8, ed25519):
```
MintJobs:hire:<proposalId>
```

Response status will be `awaiting_acceptance`, not `hired`.

---

**New endpoint: POST `/proposals/:id/accept`** (freelancer only)

```json
{
  "freelancerWallet": "SolanaBase58Address",
  "freelancerSignature": "base64EncodedSignature"
}
```

Same signing message: `MintJobs:hire:<proposalId>`

This transitions the proposal to `hired` and triggers contract + escrow creation.

---

**New proposal status to handle in UI:** `awaiting_acceptance`

Full status flow:
```
pending → shortlisted → awaiting_acceptance → hired
                     ↘ rejected (by applicant declining the offer)
```

---

### 2. Input validation now enforced

Requests that previously slipped through will now return `400 Bad Request`. Update forms and payloads accordingly.

| Field | Constraint |
|-------|-----------|
| `jobTitle` | max 500 chars |
| `jobDescription` / `description` | max 10,000 chars |
| `category` | max 255 chars |
| `location` | max 255 chars |
| `skills` array | max 5 items, each max 100 chars |
| `languages` array | max 2 items, each max 100 chars |
| `milestones` array | max 50 items |
| `coverLetter` | max 10,000 chars |
| `professionalSummary` | max 5,000 chars |
| `selectedSkills` | max 20 items, each max 100 chars |
| `projects` array | max 20 items |
| Project `name` / `role` | max 255 chars |
| Project / portfolio `link` | must be a valid URL |
| `fromCurrency` / `toCurrency` | must be one of: `sol`, `usd`, `eur`, `btc`, `eth`, `usdc`, `usdt` |
| `expertiseLevel` (job) | must be: `beginner-level`, `intermediate-level`, or `expert-level` |
| Chat message `content` | max 10,000 chars |

---

### 3. WebSocket chat events are now fully wired

`chat:send_message` and `chat:mark_read` are now connected end-to-end through RabbitMQ. Remove any frontend mocks for these events.

**Send message (client → server):**
```js
socket.emit('chat:send_message', { conversationId, content }, (ack) => {
  // ack: { success: true, data: Message } | { success: false, error: string }
});
```

**Mark read (client → server):**
```js
socket.emit('chat:mark_read', { conversationId }, (ack) => {
  // ack: { success: true, data: null } | { success: false, error: string }
});
```

---

## Non-Breaking (good to know)

### CORS — production requires env var

In production, the backend `CORS_ORIGIN` environment variable must be set to the frontend domain, otherwise all requests (REST + WebSocket) will be blocked:

```
CORS_ORIGIN=https://your-frontend-domain.com
```

In development (no `NODE_ENV=production`), all origins are allowed automatically.

### Contract completion amount fixed

The completion certificate PDF now shows the real SOL amount released from escrow. Previously it always showed `0`.

### Conversation creation is race-safe

Rapid duplicate requests to start the same conversation no longer produce duplicate welcome messages or DB conflicts.
