# MintJobs Notifications — Frontend Integration Guide

## Table of Contents

1. [How It Works](#1-how-it-works)
2. [Architecture Overview](#2-architecture-overview)
3. [REST API Reference](#3-rest-api-reference)
   - GET /notifications
   - GET /notifications/unread-count
   - PATCH /notifications/:id/read
   - PATCH /notifications/read-all
4. [Socket.IO Integration](#4-socketio-integration)
   - Connection setup
   - Events reference
   - Authentication
5. [TypeScript Types](#5-typescript-types)
6. [API Client](#6-api-client)
7. [Socket.IO Client](#7-socketio-client)
8. [React Hooks](#8-react-hooks)
9. [Component Examples](#9-component-examples)
10. [Notification Types Reference](#10-notification-types-reference)
11. [Error Handling](#11-error-handling)
12. [Environment Variables](#12-environment-variables)

---

## 1. How It Works

Notifications are **in-app only** (no email, no push). They are persisted in the database and delivered in real time via Socket.IO.

| Layer | Purpose | When to use |
|---|---|---|
| **REST API** | Load notification history, mark as read | Initial page load, pagination, actions |
| **Socket.IO** | Real-time delivery of new notifications + unread count | Everything live |

**The golden rule:** use REST to *load* history on mount, use Socket.IO to *receive* new notifications. Never poll REST.

### What triggers a notification

| Event | Who gets notified |
|---|---|
| Freelancer hired (`PROPOSAL_HIRED`) | Freelancer + Client |
| Escrow funded | Client (confirmation) |
| Payment released | Freelancer |
| Escrow refunded | Client |
| New proposal received | Client (via `NOTIFICATION_SEND`) |
| Generic system message | Whoever `recipientId` points to |

---

## 2. Architecture Overview

```
Frontend
  │
  ├─── REST  ──────────────────► API Gateway :3000/api/...
  │                                   │ RabbitMQ RPC
  │                                   ▼
  │                         Notification Service (internal)
  │                                   │
  │                               PostgreSQL
  │
  └─── Socket.IO ──────────────► API Gateway :3000/ws/notifications
                                      │ RabbitMQ push events
                                      ▲
                            Notification Service (publishes push events)
```

> Both REST and WebSocket run on the **same port** (API Gateway). The Socket.IO
> gateway lives at namespace `/ws/notifications`. You only need one base URL
> for your entire frontend.

---

## 3. REST API Reference

**Base URL:** `https://your-api.example.com`  
**Auth:** All endpoints require `Authorization: Bearer <privy-access-token>`

---

### `GET /notifications`

Fetch paginated notifications for the authenticated user, newest first. The response also includes the current `unread` count so you can initialise the badge without a second request.

**Query params:**

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | integer | No | `1` | Page number |
| `limit` | integer | No | `20` | Notifications per page |

**Response:**

```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "data": {
    "data": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "recipientId": "did:privy:abc123",
        "type": "proposal.hired",
        "title": "You've been hired!",
        "body": "Congratulations! You are now working on \"Logo Design\".",
        "metadata": { "jobId": "job-uuid", "clientId": "did:privy:xyz" },
        "isRead": false,
        "createdAt": "2026-04-15T10:00:00.000Z",
        "updatedAt": "2026-04-15T10:00:00.000Z"
      }
    ],
    "total": 42,
    "unread": 5
  }
}
```

---

### `GET /notifications/unread-count`

Get just the unread notification count.

**No query params.**

**Response:**

```json
{
  "success": true,
  "message": "Unread count retrieved successfully",
  "data": { "count": 5 }
}
```

---

### `PATCH /notifications/:id/read`

Mark a single notification as read. The server then pushes an updated `notification:unread_count` via Socket.IO.

**Path params:**

| Param | Type | Description |
|---|---|---|
| `id` | UUID | Notification ID |

**Response:**

```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": { "success": true }
}
```

---

### `PATCH /notifications/read-all`

Mark **all** unread notifications as read. The server pushes `notification:unread_count` with `{ count: 0 }`.

**No body or params.**

**Response:**

```json
{
  "success": true,
  "message": "All notifications marked as read",
  "data": { "success": true }
}
```

---

## 4. Socket.IO Integration

### Connection setup

The notification Socket.IO gateway runs on the **same port as the REST API** at namespace `/ws/notifications`.

```typescript
import { io } from 'socket.io-client';

const socket = io(`${process.env.NEXT_PUBLIC_API_URL}/ws/notifications`, {
  query: { token: privyAccessToken },
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
});
```

The server joins the authenticated user to `user:<privyId>` automatically. **You do not need to emit any join event.**

---

### Events reference

#### Incoming events (server → client)

---

**`notification`** — A new notification was created for you.

```typescript
socket.on('notification', (payload: Notification) => {
  // full saved Notification object
});
```

Payload example:

```json
{
  "id": "550e8400-...",
  "recipientId": "did:privy:abc123",
  "type": "escrow.released",
  "title": "Payment released!",
  "body": "1.50 SOL have been released to your wallet.",
  "metadata": { "jobId": "job-uuid", "amountLamports": "1500000000" },
  "isRead": false,
  "createdAt": "2026-04-15T14:00:00.000Z",
  "updatedAt": "2026-04-15T14:00:00.000Z"
}
```

Add it to the top of your notification list and trigger a toast/banner.

---

**`notification:unread_count`** — Server-pushed unread count update. Fires after:
- A new notification is created (to the recipient)
- A single notification is marked read
- All notifications are marked read (`count` will be `0`)

```typescript
socket.on('notification:unread_count', (payload: { count: number }) => {
  // update nav-bar badge
});
```

Never compute this client-side — always use this authoritative server push.

---

### Authentication

The server validates the `token` query parameter on every connection using Privy JWT verification. If the token expires, the socket will be disconnected. Reconnect with a fresh token:

```typescript
socket.io.opts.query = { token: await getAccessToken() };
socket.connect();
```

---

## 5. TypeScript Types

```typescript
// types/notifications.ts

export type NotificationType =
  | 'proposal.received'
  | 'proposal.accepted'
  | 'proposal.hired'
  | 'proposal.status.changed'
  | 'job.created'
  | 'job.updated'
  | 'escrow.funded'
  | 'escrow.locked'
  | 'escrow.released'
  | 'escrow.refunded'
  | 'contract.created'
  | 'contract.completed'
  | 'chat.message'
  | 'system';

export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Deep-link or context data — shape varies by type, see section 10 */
  metadata: Record<string, any> | null;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListResult {
  data: Notification[];
  total: number;
  unread: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}
```

---

## 6. API Client

```typescript
// lib/notifications-api.ts
import type { ApiResponse, Notification, NotificationListResult } from '@/types/notifications';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export class NotificationApiError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'NotificationApiError';
  }
}

async function notifFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/notifications/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const json: ApiResponse<T> = await res.json();
  if (!res.ok || !json.success) {
    throw new NotificationApiError(json.message ?? 'Notification request failed', res.status);
  }
  return json.data;
}

export async function getNotifications(token: string, page = 1, limit = 20): Promise<NotificationListResult> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return notifFetch<NotificationListResult>(`?${params}`, token);
}

export async function getUnreadCount(token: string): Promise<number> {
  const result = await notifFetch<{ count: number }>('unread-count', token);
  return result.count;
}

export async function markRead(token: string, notificationId: string): Promise<void> {
  await notifFetch<{ success: boolean }>(`${notificationId}/read`, token, { method: 'PATCH' });
}

export async function markAllRead(token: string): Promise<void> {
  await notifFetch<{ success: boolean }>('read-all', token, { method: 'PATCH' });
}
```

---

## 7. Socket.IO Client

```typescript
// lib/notification-socket.ts
import { io, Socket } from 'socket.io-client';
import type { Notification } from '@/types/notifications';

type EventMap = {
  notification: Notification;
  'notification:unread_count': { count: number };
  connect: void;
  disconnect: string;
  connect_error: Error;
};

type Listener<K extends keyof EventMap> = (payload: EventMap[K]) => void;

class NotificationSocket {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<Function>>();

  connect(token: string) {
    if (this.socket?.connected) return;

    // Namespace /ws/notifications — same port as the REST API
    this.socket = io(`${process.env.NEXT_PUBLIC_API_URL}/ws/notifications`, {
      query: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    (
      ['notification', 'notification:unread_count', 'connect', 'disconnect', 'connect_error'] as const
    ).forEach((event) => {
      this.socket!.on(event as string, (payload: any) => {
        this.listeners.get(event)?.forEach((fn) => fn(payload));
      });
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  reconnect(token: string) {
    this.disconnect();
    this.connect(token);
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<K>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener as Function);
    return () => this.listeners.get(event)?.delete(listener as Function);
  }

  get connected() {
    return this.socket?.connected ?? false;
  }
}

export const notificationSocket = new NotificationSocket();
```

---

## 8. React Hooks

### `useNotificationSocket` — socket lifecycle

Mount once at the top of your app when the user is authenticated.

```typescript
// hooks/useNotificationSocket.ts
import { useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { notificationSocket } from '@/lib/notification-socket';

export function useNotificationSocket() {
  const { getAccessToken, authenticated } = usePrivy();
  const connected = useRef(false);

  useEffect(() => {
    if (!authenticated || connected.current) return;

    let cleanup: (() => void) | undefined;

    getAccessToken().then((token) => {
      if (!token) return;
      notificationSocket.connect(token);
      connected.current = true;

      cleanup = notificationSocket.on('disconnect', async (reason) => {
        if (reason === 'io server disconnect') {
          const fresh = await getAccessToken();
          if (fresh) notificationSocket.reconnect(fresh);
        }
      });
    });

    return () => {
      cleanup?.();
      notificationSocket.disconnect();
      connected.current = false;
    };
  }, [authenticated]);
}
```

---

### `useNotifications` — notification list

```typescript
// hooks/useNotifications.ts
import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { getNotifications, markRead, markAllRead, NotificationApiError } from '@/lib/notifications-api';
import { notificationSocket } from '@/lib/notification-socket';
import type { Notification } from '@/types/notifications';

export function useNotifications() {
  const { getAccessToken } = usePrivy();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const token = await getAccessToken();
      const result = await getNotifications(token!, page);
      setNotifications((prev) => page === 1 ? result.data : [...prev, ...result.data]);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof NotificationApiError ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => { load(1); }, [load]);

  useEffect(() => {
    const unsub = notificationSocket.on('notification', (notif: Notification) => {
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev;
        return [notif, ...prev];
      });
      setTotal((t) => t + 1);
    });
    return unsub;
  }, []);

  const read = useCallback(async (id: string) => {
    const token = await getAccessToken();
    if (!token) return;
    await markRead(token, id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }, [getAccessToken]);

  const readAll = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    await markAllRead(token);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, [getAccessToken]);

  return { notifications, total, loading, error, reload: load, markRead: read, markAllRead: readAll };
}
```

---

### `useUnreadCount` — global badge

```typescript
// hooks/useUnreadCount.ts
import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { getUnreadCount } from '@/lib/notifications-api';
import { notificationSocket } from '@/lib/notification-socket';

export function useUnreadCount() {
  const { getAccessToken, authenticated } = usePrivy();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!authenticated) return;
    getAccessToken().then((token) => {
      if (token) getUnreadCount(token).then(setCount).catch(() => {});
    });
  }, [authenticated, getAccessToken]);

  useEffect(() => {
    const unsub = notificationSocket.on('notification:unread_count', ({ count: c }) => setCount(c));
    return unsub;
  }, []);

  return count;
}
```

**Usage in nav bar:**

```tsx
const unread = useUnreadCount();

<NavLink href="/notifications">
  <BellIcon />
  {unread > 0 && (
    <span className="badge">{unread > 99 ? '99+' : unread}</span>
  )}
</NavLink>
```

---

## 9. Component Examples

### NotificationBell

```tsx
// components/NotificationBell.tsx
import { useState } from 'react';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { NotificationPanel } from './NotificationPanel';

export function NotificationBell() {
  const unread = useUnreadCount();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-full hover:bg-gray-100" aria-label="Notifications">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && <NotificationPanel onClose={() => setOpen(false)} />}
    </div>
  );
}
```

---

### NotificationPanel

```tsx
// components/NotificationPanel.tsx
import { useEffect } from 'react';
import { useNotifications } from '@/hooks/useNotifications';

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { notifications, loading, error, markRead, markAllRead } = useNotifications();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const panel = document.getElementById('notification-panel');
      if (panel && !panel.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div id="notification-panel" className="absolute right-0 top-12 z-50 w-80 rounded-xl border bg-white shadow-xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="font-semibold">Notifications</h3>
        <button onClick={markAllRead} className="text-xs text-blue-500 hover:underline">Mark all read</button>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y">
        {loading && <p className="p-4 text-sm text-gray-400">Loading…</p>}
        {error && <p className="p-4 text-sm text-red-500">{error}</p>}
        {!loading && notifications.length === 0 && <p className="p-4 text-sm text-gray-400">No notifications yet.</p>}
        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => markRead(n.id)}
            className={`flex cursor-pointer gap-3 px-4 py-3 hover:bg-gray-50 ${n.isRead ? 'opacity-60' : 'bg-blue-50'}`}
          >
            <div className="mt-1.5 flex-shrink-0">
              {!n.isRead
                ? <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                : <span className="inline-block h-2 w-2" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{n.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(n.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### Toast on new notification

```tsx
// hooks/useNotificationToast.ts
import { useEffect } from 'react';
import { toast } from 'sonner'; // or your toast lib
import { notificationSocket } from '@/lib/notification-socket';

export function useNotificationToast() {
  useEffect(() => {
    const unsub = notificationSocket.on('notification', (notif) => {
      toast(notif.title, { description: notif.body });
    });
    return unsub;
  }, []);
}
```

Mount in root layout alongside `useNotificationSocket`:

```tsx
// app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  useNotificationSocket();
  useNotificationToast();
  return <html><body>{children}</body></html>;
}
```

---

## 10. Notification Types Reference

| `type` | Who receives | `metadata` shape | Suggested deep-link |
|---|---|---|---|
| `proposal.received` | Client | `{ jobId, proposalId, applicantId }` | `/jobs/:jobId/proposals` |
| `proposal.accepted` | Freelancer | `{ jobId, proposalId }` | `/proposals/:proposalId` |
| `proposal.hired` | Freelancer + Client | `{ jobId, clientId }` or `{ jobId, applicantId }` | `/contracts` |
| `escrow.funded` | Client | `{ jobId, amountLamports }` | `/jobs/:jobId` |
| `escrow.released` | Freelancer | `{ jobId, amountLamports }` | `/contracts` |
| `escrow.refunded` | Client | `{ jobId, amountLamports }` | `/jobs/:jobId` |
| `contract.created` | Both | `{ contractId, jobId }` | `/contracts/:contractId` |
| `contract.completed` | Both | `{ contractId, jobId }` | `/contracts/:contractId` |
| `chat.message` | Recipient | `{ conversationId }` | `/chat` |
| `system` | Varies | Any or `null` | — |

Use `metadata` to build deep-links:

```typescript
function getNotificationHref(notif: Notification): string | null {
  const m = notif.metadata;
  switch (notif.type) {
    case 'proposal.received':  return m?.jobId ? `/jobs/${m.jobId}/proposals` : null;
    case 'proposal.hired':     return '/contracts';
    case 'escrow.funded':
    case 'escrow.refunded':    return m?.jobId ? `/jobs/${m.jobId}` : null;
    case 'escrow.released':
    case 'contract.created':
    case 'contract.completed': return '/contracts';
    case 'chat.message':       return m?.conversationId ? `/chat?c=${m.conversationId}` : '/chat';
    default:                   return null;
  }
}
```

---

## 11. Error Handling

All REST errors follow:

```typescript
interface ApiError { success: false; message: string; statusCode: number; }
```

| HTTP | `message` | What to do |
|---|---|---|
| 401 | `Missing authorization token` | Re-authenticate with Privy |
| 400 | `id must be a UUID` | Check the notification ID format |
| 404 | `Notification not found` | Notification was deleted — reload list |

**Socket.IO disconnects:**

```typescript
useEffect(() => {
  const unsub = notificationSocket.on('disconnect', (reason) => {
    // Show reconnecting banner
  });
  const unsubConnect = notificationSocket.on('connect', async () => {
    // Re-fetch unread count after reconnect to sync missed notifications
    const token = await getAccessToken();
    if (token) getUnreadCount(token).then(setCount).catch(() => {});
  });
  return () => { unsub(); unsubConnect(); };
}, []);
```

---

## 12. Environment Variables

```bash
# REST API + WebSocket base URL (same server, single variable)
NEXT_PUBLIC_API_URL=http://localhost:3000

# Privy
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
```

> Both the REST API and the Socket.IO gateway run on the same URL.
> Notification socket connects to `{NEXT_PUBLIC_API_URL}/ws/notifications`.
> In production just update `NEXT_PUBLIC_API_URL` to your domain — no separate socket URL needed.
