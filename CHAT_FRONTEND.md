# MintJobs Chat — Frontend Integration Guide

## Table of Contents

1. [How It Works](#1-how-it-works)
2. [Architecture Overview](#2-architecture-overview)
3. [REST API Reference](#3-rest-api-reference)
   - GET /chat/conversations
   - GET /chat/messages
   - POST /chat/messages
   - PATCH /chat/messages/read
   - GET /chat/unread-count
4. [Socket.IO Integration](#4-socketio-integration)
   - Connection setup
   - Events reference
   - Authentication
5. [TypeScript Types](#5-typescript-types)
6. [API Client](#6-api-client)
7. [Socket.IO Client](#7-socketio-client)
8. [React Hooks](#8-react-hooks)
9. [Component Examples](#9-component-examples)
10. [Conversation Auto-Creation on Hire](#10-conversation-auto-creation-on-hire)
11. [Error Handling](#11-error-handling)
12. [Environment Variables](#12-environment-variables)

---

## 1. How It Works

Chat is built on two layers:

| Layer | Purpose | When to use |
|---|---|---|
| **REST API** | Load conversations and message history | Initial page load, pagination |
| **Socket.IO** | Real-time events (new messages, read receipts) | Everything live |

**The golden rule:** use REST to *load* data, use Socket.IO to *receive* updates. Never poll the REST API for new messages.

### Conversation lifecycle

```
Client hires freelancer
        │
        ▼
 Conversation auto-created (backend)
 System message sent to both parties:
   "You have been connected! You can now start chatting."
   "Congratulations! You are now working together on '<job title>'."
        │
        ▼
 Client or freelancer sends a message → REST POST /chat/messages
        │
        ▼
 Both parties receive it via Socket.IO  (chat:message event)
        │
        ▼
 Recipient opens conversation → REST PATCH /chat/messages/read
        │
        ▼
 Sender receives read receipt via Socket.IO  (chat:read event)
```

A client can also initiate a conversation by sending the first message — this is handled automatically when posting to `POST /chat/messages` if the conversation already exists.

---

## 2. Architecture Overview

```
Frontend
  │
  ├─── REST  ─────────────────► API Gateway :3000
  │                                   │ RabbitMQ RPC
  │                                   ▼
  │                             Chat Service :3008
  │                                   │
  │                               PostgreSQL
  │
  └─── Socket.IO ──────────────► Chat Service :3008  (same port, /socket.io path)
```

> The Socket.IO gateway runs **inside** the chat service on the same port. It authenticates via the same Privy JWT and joins each user to a private room (`user:<privyId>`).

---

## 3. REST API Reference

**Base URL:** `https://your-api.example.com`  
**Auth:** All endpoints require `Authorization: Bearer <privy-access-token>`

---

### `GET /chat/conversations`

Fetch all conversations for the authenticated user (as client or freelancer), ordered by most recently updated. Each conversation includes a `latestMessage` preview.

**No query params.**

**Response:**
```json
{
  "success": true,
  "message": "Conversations retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "clientId": "did:privy:abc123",
      "freelancerId": "did:privy:xyz789",
      "jobId": "a1b2c3d4-...",
      "proposalId": "d4c3b2a1-...",
      "createdAt": "2026-04-15T10:00:00.000Z",
      "updatedAt": "2026-04-15T12:30:00.000Z",
      "latestMessage": {
        "content": "I'll have the first milestone ready by Friday.",
        "senderId": "did:privy:xyz789",
        "createdAt": "2026-04-15T12:30:00.000Z"
      }
    }
  ]
}
```

`latestMessage` is `null` when no messages exist yet.

---

### `GET /chat/messages`

Fetch paginated messages for a conversation. Returns messages in **chronological order** (oldest first). Use `page` to load older history.

**Query params:**

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `conversationId` | UUID string | Yes | — | The conversation to fetch |
| `page` | integer | No | `1` | Page number |
| `limit` | integer | No | `30` | Messages per page |

**Response:**
```json
{
  "success": true,
  "message": "Messages retrieved successfully",
  "data": {
    "data": [
      {
        "id": "msg-uuid-1",
        "conversationId": "550e8400-...",
        "senderId": "",
        "content": "You have been connected! You can now start chatting.",
        "type": "system",
        "isRead": true,
        "createdAt": "2026-04-15T10:00:00.000Z",
        "updatedAt": "2026-04-15T10:00:00.000Z"
      },
      {
        "id": "msg-uuid-2",
        "conversationId": "550e8400-...",
        "senderId": "did:privy:abc123",
        "content": "Hi! Looking forward to working with you.",
        "type": "text",
        "isRead": true,
        "createdAt": "2026-04-15T10:05:00.000Z",
        "updatedAt": "2026-04-15T10:05:00.000Z"
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 30,
    "totalPages": 2
  }
}
```

**System messages** have `senderId: ""` and `type: "system"`. Render them centered, not as a chat bubble.

---

### `POST /chat/messages`

Send a message in a conversation.

**Request body:**
```json
{
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "content": "Here is the first draft for your review."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "id": "msg-uuid-3",
    "conversationId": "550e8400-...",
    "senderId": "did:privy:xyz789",
    "content": "Here is the first draft for your review.",
    "type": "text",
    "isRead": false,
    "createdAt": "2026-04-15T13:00:00.000Z",
    "updatedAt": "2026-04-15T13:00:00.000Z"
  }
}
```

After a successful POST, the backend emits a `chat:message` Socket.IO event to both participants. **You do not need to add the message to state manually** — wait for the socket event to keep state consistent across devices.

**Errors:**

| Status | Reason |
|---|---|
| 400 | `conversationId` is not a valid UUID |
| 400 | `content` is empty |
| 403 | Authenticated user is not a participant in this conversation |
| 404 | Conversation not found |

---

### `PATCH /chat/messages/read`

Mark all unread messages **sent by the other party** in a conversation as read. Call this when the user opens or focuses a conversation.

**Query params:**

| Param | Type | Required |
|---|---|---|
| `conversationId` | UUID string | Yes |

**Response:**
```json
{
  "success": true,
  "message": "Messages marked as read",
  "data": { "success": true }
}
```

After a successful PATCH, the backend emits a `chat:read` Socket.IO event to the other participant so they can update their sent-message read receipts. It also pushes an updated `chat:unread_count` to the user who called this endpoint.

---

### `GET /chat/unread-count`

Get the **total** unread message count across all conversations for the authenticated user. Use this on page load to initialize the badge.

**No query params.**

**Response:**
```json
{
  "success": true,
  "message": "Unread count retrieved successfully",
  "data": { "count": 7 }
}
```

---

## 4. Socket.IO Integration

### Connection setup

Connect once when the user logs in. Pass the Privy access token as a query parameter.

```typescript
import { io, Socket } from 'socket.io-client';

const socket = io(process.env.NEXT_PUBLIC_CHAT_SOCKET_URL!, {
  query: { token: privyAccessToken },
  transports: ['websocket'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
});
```

The server joins the authenticated user to the room `user:<privyId>` automatically on connection. **You do not need to emit any join event.**

### Events reference

#### Incoming events (server → client)

---

**`chat:message`** — A new message was sent in a conversation you participate in.

```typescript
socket.on('chat:message', (payload: ChatMessageEvent) => {
  // payload shape:
  // {
  //   conversationId: string;
  //   message: Message;        // full message object
  // }
});
```

Payload:
```json
{
  "conversationId": "550e8400-...",
  "message": {
    "id": "msg-uuid-3",
    "conversationId": "550e8400-...",
    "senderId": "did:privy:xyz789",
    "content": "Here is the first draft for your review.",
    "type": "text",
    "isRead": false,
    "createdAt": "2026-04-15T13:00:00.000Z",
    "updatedAt": "2026-04-15T13:00:00.000Z"
  }
}
```

Use this to append messages to the active conversation. Do **not** increment the unread badge manually — the server pushes an updated `chat:unread_count` automatically.

---

**`chat:read`** — The other participant marked your messages as read.

```typescript
socket.on('chat:read', (payload: ChatReadEvent) => {
  // payload shape:
  // {
  //   conversationId: string;
  //   readBy: string;   // Privy DID of the user who read
  // }
});
```

Payload:
```json
{
  "conversationId": "550e8400-...",
  "readBy": "did:privy:abc123"
}
```

Use this to show double-tick / "Seen" indicators on your sent messages.

---

**`chat:conversation_created`** — A new conversation was created for you (e.g., on hire).

```typescript
socket.on('chat:conversation_created', (payload: ConversationCreatedEvent) => {
  // payload shape:
  // {
  //   conversation: Conversation;
  // }
});
```

Payload:
```json
{
  "conversation": {
    "id": "550e8400-...",
    "clientId": "did:privy:abc123",
    "freelancerId": "did:privy:xyz789",
    "jobId": "a1b2c3d4-...",
    "proposalId": "d4c3b2a1-...",
    "createdAt": "2026-04-15T10:00:00.000Z",
    "updatedAt": "2026-04-15T10:00:00.000Z"
  }
}
```

Add the conversation to your list when this fires.

---

**`chat:unread_count`** — Server-pushed total unread count across **all** conversations. Fires automatically:
- to the **recipient** after any new message arrives
- to the **reader** after a successful mark-read

```typescript
socket.on('chat:unread_count', (payload: { count: number }) => {
  // update global unread badge / nav indicator / tab title
});
```

Payload:
```json
{ "count": 7 }
```

Never compute this client-side from individual `chat:message` events — use this authoritative server push instead.

---

#### Outgoing events (client → server)

Sending messages and marking read can go through the socket directly — lower latency than REST, no API Gateway hop. Both events use the **acknowledgement** pattern: pass a callback as the third argument to `socket.emit` and the server responds synchronously.

---

**`chat:send_message`** — Send a message in a conversation.

```typescript
socket.emit(
  'chat:send_message',
  { conversationId: 'uuid', content: 'Hello!' },
  (ack: { success: boolean; message?: Message; error?: string }) => {
    if (!ack.success) console.error(ack.error);
    // Do NOT add the message to state here — wait for the chat:message event
    // which arrives for both sender and recipient through the same path.
  },
);
```

The server saves the message to DB, then broadcasts `chat:message` to both participants (including the sender). The ack only confirms the save succeeded.

---

**`chat:mark_read`** — Mark all unread messages in a conversation as read.

```typescript
socket.emit(
  'chat:mark_read',
  { conversationId: 'uuid' },
  (ack: { success: boolean; error?: string }) => {
    if (!ack.success) console.error(ack.error);
  },
);
```

The server updates the DB, then broadcasts `chat:read` to both participants.

---

> **REST vs Socket:** Both the REST endpoint (`POST /chat/messages`) and `chat:send_message` go through the same `ChatService.sendMessage()` — the result is identical. Use socket when connected (faster), REST as fallback when the socket is reconnecting.

---

### Authentication

The Socket.IO server validates the `token` query parameter on every connection using the same Privy JWT verification as the REST guards.

If the token expires while connected, the socket will be disconnected. Reconnect with a fresh token:

```typescript
socket.io.opts.query = { token: await getAccessToken() };
socket.connect();
```

---

## 5. TypeScript Types

Copy these into your frontend project.

```typescript
// types/chat.ts

export type MessageType = 'text' | 'system';

export interface Message {
  id: string;
  conversationId: string;
  /** Empty string for system messages */
  senderId: string;
  content: string;
  type: MessageType;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LatestMessagePreview {
  content: string;
  senderId: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  clientId: string;       // Privy DID
  freelancerId: string;   // Privy DID
  jobId: string | null;
  proposalId: string | null;
  createdAt: string;
  updatedAt: string;
  latestMessage: LatestMessagePreview | null;
}

export interface PaginatedMessages {
  data: Message[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Socket.IO event payloads
export interface ChatMessageEvent {
  conversationId: string;
  message: Message;
}

export interface ChatReadEvent {
  conversationId: string;
  readBy: string; // Privy DID
}

export interface ConversationCreatedEvent {
  conversation: Conversation;
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
// lib/chat-api.ts
import type {
  ApiResponse,
  Conversation,
  Message,
  PaginatedMessages,
} from '@/types/chat';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export class ChatApiError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'ChatApiError';
  }
}

async function chatFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}/chat/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const json: ApiResponse<T> = await res.json();
  if (!res.ok || !json.success) {
    throw new ChatApiError(json.message ?? 'Chat request failed', res.status);
  }
  return json.data;
}

/** Fetch all conversations for the current user */
export async function getConversations(token: string): Promise<Conversation[]> {
  return chatFetch<Conversation[]>('conversations', token);
}

/** Fetch paginated messages for a conversation */
export async function getMessages(
  token: string,
  conversationId: string,
  page = 1,
  limit = 30,
): Promise<PaginatedMessages> {
  const params = new URLSearchParams({
    conversationId,
    page: String(page),
    limit: String(limit),
  });
  return chatFetch<PaginatedMessages>(`messages?${params}`, token);
}

/** Send a message */
export async function sendMessage(
  token: string,
  conversationId: string,
  content: string,
): Promise<Message> {
  return chatFetch<Message>('messages', token, {
    method: 'POST',
    body: JSON.stringify({ conversationId, content }),
  });
}

/** Mark all unread messages in a conversation as read */
export async function markRead(
  token: string,
  conversationId: string,
): Promise<void> {
  await chatFetch<{ success: boolean }>(
    `messages/read?conversationId=${conversationId}`,
    token,
    { method: 'PATCH' },
  );
}
```

---

## 7. Socket.IO Client

A singleton socket manager that the rest of your app subscribes to.

```typescript
// lib/chat-socket.ts
import { io, Socket } from 'socket.io-client';
import type {
  ChatMessageEvent,
  ChatReadEvent,
  ConversationCreatedEvent,
} from '@/types/chat';

type EventMap = {
  'chat:message': ChatMessageEvent;
  'chat:read': ChatReadEvent;
  'chat:conversation_created': ConversationCreatedEvent;
  'chat:unread_count': { count: number };
  connect: void;
  disconnect: string;
  connect_error: Error;
};

type Listener<K extends keyof EventMap> = (payload: EventMap[K]) => void;

class ChatSocket {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<Function>>();

  connect(token: string) {
    if (this.socket?.connected) return;

    this.socket = io(process.env.NEXT_PUBLIC_CHAT_SOCKET_URL!, {
      query: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    // Forward all events to registered listeners
    (
      [
        'chat:message',
        'chat:read',
        'chat:conversation_created',
        'chat:unread_count',
        'connect',
        'disconnect',
        'connect_error',
      ] as const
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

  /** Reconnect with a fresh token (e.g. after token expiry) */
  reconnect(token: string) {
    this.disconnect();
    this.connect(token);
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Function);

    // Return an unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener as Function);
    };
  }

  get connected() {
    return this.socket?.connected ?? false;
  }

  /** Raw socket — use only for emit with ack callbacks */
  get rawSocket() {
    return this.socket;
  }
}


export const chatSocket = new ChatSocket();
```

---

## 8. React Hooks

### `useChatSocket` — socket lifecycle

Mount this once at the top of your app (e.g., inside a layout component) when the user is authenticated.

```typescript
// hooks/useChatSocket.ts
import { useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { chatSocket } from '@/lib/chat-socket';

export function useChatSocket() {
  const { getAccessToken, authenticated } = usePrivy();
  const connected = useRef(false);

  useEffect(() => {
    if (!authenticated || connected.current) return;

    let cleanup: (() => void) | undefined;

    getAccessToken().then((token) => {
      if (!token) return;
      chatSocket.connect(token);
      connected.current = true;

      // Refresh token on disconnect to handle expiry
      cleanup = chatSocket.on('disconnect', async (reason) => {
        if (reason === 'io server disconnect') {
          const fresh = await getAccessToken();
          if (fresh) chatSocket.reconnect(fresh);
        }
      });
    });

    return () => {
      cleanup?.();
      chatSocket.disconnect();
      connected.current = false;
    };
  }, [authenticated]);
}
```

---

### `useConversations` — conversation list

```typescript
// hooks/useConversations.ts
import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { getConversations, ChatApiError } from '@/lib/chat-api';
import { chatSocket } from '@/lib/chat-socket';
import type { Conversation, ChatMessageEvent, ConversationCreatedEvent } from '@/types/chat';

export function useConversations() {
  const { getAccessToken } = usePrivy();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getAccessToken();
      const data = await getConversations(token!);
      setConversations(data);
    } catch (err) {
      setError(err instanceof ChatApiError ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    load();
  }, [load]);

  // Update latest message preview on new message
  useEffect(() => {
    const unsub = chatSocket.on('chat:message', ({ conversationId, message }: ChatMessageEvent) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                updatedAt: message.createdAt,
                latestMessage: {
                  content: message.content,
                  senderId: message.senderId,
                  createdAt: message.createdAt,
                },
              }
            : c,
        ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      );
    });
    return unsub;
  }, []);

  // Add newly created conversation to list
  useEffect(() => {
    const unsub = chatSocket.on(
      'chat:conversation_created',
      ({ conversation }: ConversationCreatedEvent) => {
        setConversations((prev) => {
          if (prev.some((c) => c.id === conversation.id)) return prev;
          return [{ ...conversation, latestMessage: null }, ...prev];
        });
      },
    );
    return unsub;
  }, []);

  return { conversations, loading, error, reload: load };
}
```

---

### `useMessages` — message thread

```typescript
// hooks/useMessages.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { getMessages, sendMessage, markRead, ChatApiError } from '@/lib/chat-api';
import { chatSocket } from '@/lib/chat-socket';
import type { Message, PaginatedMessages, ChatMessageEvent } from '@/types/chat';

export function useMessages(conversationId: string) {
  const { getAccessToken } = usePrivy();
  const [messages, setMessages] = useState<Message[]>([]);
  const [pagination, setPagination] = useState<Omit<PaginatedMessages, 'data'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentPage = useRef(1);

  const loadPage = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);
        const token = await getAccessToken();
        const result = await getMessages(token!, conversationId, page);
        const { data, ...meta } = result;

        setMessages((prev) => (page === 1 ? data : [...data, ...prev]));
        setPagination(meta);
        currentPage.current = page;
      } catch (err) {
        setError(err instanceof ChatApiError ? err.message : 'Failed to load messages');
      } finally {
        setLoading(false);
      }
    },
    [conversationId, getAccessToken],
  );

  // Initial load + mark as read
  useEffect(() => {
    if (!conversationId) return;
    loadPage(1);

    getAccessToken().then((token) => {
      if (token) markRead(token, conversationId).catch(() => {});
    });
  }, [conversationId, loadPage, getAccessToken]);

  // Receive new messages from socket
  useEffect(() => {
    const unsub = chatSocket.on('chat:message', ({ conversationId: cid, message }: ChatMessageEvent) => {
      if (cid !== conversationId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });

      // Auto-mark as read if this conversation is open
      getAccessToken().then((token) => {
        if (token) markRead(token, conversationId).catch(() => {});
      });
    });
    return unsub;
  }, [conversationId, getAccessToken]);

  const send = useCallback(
    async (content: string) => {
      if (!content.trim()) return;
      setSending(true);
      setError(null);
      try {
        if (chatSocket.connected) {
          // Prefer socket — lower latency, no API Gateway hop
          await new Promise<void>((resolve, reject) => {
            chatSocket.rawSocket!.emit(
              'chat:send_message',
              { conversationId, content: content.trim() },
              (ack: { success: boolean; error?: string }) => {
                if (ack.success) resolve();
                else reject(new Error(ack.error ?? 'Failed to send message'));
              },
            );
          });
        } else {
          // Fallback to REST when socket is reconnecting
          const token = await getAccessToken();
          await sendMessage(token!, conversationId, content);
        }
        // In both cases, the chat:message socket event adds the message to state
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
      } finally {
        setSending(false);
      }
    },
    [conversationId, getAccessToken],
  );

  const loadOlder = useCallback(() => {
    if (pagination && currentPage.current < pagination.totalPages) {
      loadPage(currentPage.current + 1);
    }
  }, [pagination, loadPage]);

  const hasMore = pagination
    ? currentPage.current < pagination.totalPages
    : false;

  return { messages, loading, sending, error, send, loadOlder, hasMore };
}
```

---

### `useTotalUnreadCount` — global unread badge

Use this for the nav-bar / tab-title unread indicator. The count is authoritative — it comes from the server, not from counting socket events locally.

```typescript
// hooks/useTotalUnreadCount.ts
import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { chatSocket } from '@/lib/chat-socket';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export function useTotalUnreadCount() {
  const { getAccessToken, authenticated } = usePrivy();
  const [count, setCount] = useState(0);

  // Fetch initial count from REST on mount
  useEffect(() => {
    if (!authenticated) return;
    getAccessToken().then((token) => {
      if (!token) return;
      fetch(`${BASE}/chat/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then(({ data }) => setCount(data?.count ?? 0))
        .catch(() => {});
    });
  }, [authenticated, getAccessToken]);

  // Keep live via socket push
  useEffect(() => {
    const unsub = chatSocket.on('chat:unread_count', ({ count: c }) => {
      setCount(c);
    });
    return unsub;
  }, []);

  return count;
}
```

**Usage:**
```tsx
// In your layout / nav bar
const unread = useTotalUnreadCount();

<NavLink href="/chat">
  Messages
  {unread > 0 && (
    <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">
      {unread > 99 ? '99+' : unread}
    </span>
  )}
</NavLink>
```

---

## 9. Component Examples

### ConversationList

```tsx
// components/chat/ConversationList.tsx
import { useConversations } from '@/hooks/useConversations';
import { usePrivy } from '@privy-io/react-auth';

interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ activeId, onSelect }: Props) {
  const { conversations, loading, error } = useConversations();
  const { user } = usePrivy();
  const myId = user?.id ?? '';

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  if (error) return <div className="p-4 text-sm text-red-500">{error}</div>;
  if (conversations.length === 0)
    return <div className="p-4 text-sm text-gray-400">No conversations yet.</div>;

  return (
    <ul className="divide-y">
      {conversations.map((conv) => {
        const otherId = conv.clientId === myId ? conv.freelancerId : conv.clientId;
        const isActive = conv.id === activeId;

        return (
          <li
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 ${
              isActive ? 'bg-blue-50' : ''
            }`}
          >
            {/* Avatar placeholder */}
            <div className="h-10 w-10 rounded-full bg-gray-200 flex-shrink-0" />

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{otherId}</p>
              {conv.latestMessage && (
                <p className="text-xs text-gray-500 truncate">
                  {conv.latestMessage.senderId === myId ? 'You: ' : ''}
                  {conv.latestMessage.content}
                </p>
              )}
            </div>

            <span className="text-xs text-gray-400 flex-shrink-0">
              {conv.latestMessage
                ? new Date(conv.latestMessage.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
```

---

### MessageThread

```tsx
// components/chat/MessageThread.tsx
import { useEffect, useRef, useState } from 'react';
import { useMessages } from '@/hooks/useMessages';
import { usePrivy } from '@privy-io/react-auth';
import type { Message } from '@/types/chat';

interface Props {
  conversationId: string;
}

export function MessageThread({ conversationId }: Props) {
  const { messages, loading, sending, error, send, loadOlder, hasMore } =
    useMessages(conversationId);
  const { user } = usePrivy();
  const myId = user?.id ?? '';
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function handleSend() {
    if (!draft.trim()) return;
    await send(draft.trim());
    setDraft('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Load older button */}
      {hasMore && (
        <div className="text-center py-2">
          <button
            onClick={loadOlder}
            disabled={loading}
            className="text-xs text-blue-500 hover:underline"
          >
            {loading ? 'Loading…' : 'Load older messages'}
          </button>
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} isOwn={msg.senderId === myId} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {error && <p className="px-4 text-xs text-red-500">{error}</p>}
      <div className="flex items-end gap-2 p-4 border-t">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Type a message…"
          className="flex-1 resize-none rounded-lg border p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  // System messages render centered
  if (message.type === 'system') {
    return (
      <div className="text-center">
        <span className="inline-block text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
          isOwn
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-900 rounded-bl-sm'
        }`}
      >
        <p>{message.content}</p>
        <p className={`text-xs mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {isOwn && message.isRead && <span className="ml-1">✓✓</span>}
        </p>
      </div>
    </div>
  );
}
```

---

### ChatPage — full layout

```tsx
// app/chat/page.tsx
'use client';
import { useState } from 'react';
import { ConversationList } from '@/components/chat/ConversationList';
import { MessageThread } from '@/components/chat/MessageThread';
import { useChatSocket } from '@/hooks/useChatSocket';

export default function ChatPage() {
  useChatSocket(); // Connect once per page
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg">Messages</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            activeId={activeConversationId}
            onSelect={setActiveConversationId}
          />
        </div>
      </div>

      {/* Main thread */}
      <div className="flex-1">
        {activeConversationId ? (
          <MessageThread conversationId={activeConversationId} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a conversation to start messaging
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 10. Conversation Auto-Creation on Hire

When a client hires a freelancer (both parties sign the proposal), the backend automatically:

1. Creates a conversation linking `clientId` ↔ `freelancerId`
2. Sends a system message: *"You have been connected! You can now start chatting."*
3. Sends a job-specific message: *"Congratulations! You are now working together on '\<job title\>'."*
4. Emits `chat:conversation_created` to both parties via Socket.IO

**The frontend does not need to create conversations manually.** Just listen for `chat:conversation_created` in `useConversations` (already handled by the hook above) and the conversation will appear in both users' lists automatically.

If a conversation already existed between the same client and freelancer, no duplicate is created — a new congratulations system message is appended to the existing thread instead.

---

## 11. Error Handling

All REST errors follow:
```typescript
interface ApiError {
  success: false;
  message: string;
  statusCode: number;
}
```

### Common errors

| HTTP | `message` | What to do |
|---|---|---|
| 400 | `content should not be empty` | Validate before sending |
| 400 | `conversationId must be a UUID` | Check the ID format |
| 401 | `Missing authorization token` | Re-authenticate with Privy |
| 403 | `Access denied to this conversation` | User is not a participant |
| 404 | `Conversation not found` | Conversation ID is stale — reload list |

### Socket.IO disconnects

The socket can disconnect due to token expiry or network loss. The `ChatSocket` manager reconnects automatically, but you should handle the `disconnect` event in UI:

```typescript
useEffect(() => {
  const unsub = chatSocket.on('disconnect', (reason) => {
    console.warn('Socket disconnected:', reason);
    // Show a "Reconnecting…" banner if needed
  });
  const unsubConnect = chatSocket.on('connect', () => {
    // Clear the banner
  });
  return () => { unsub(); unsubConnect(); };
}, []);
```

---

## 12. Environment Variables

Add these to your `.env.local` (Next.js) or equivalent:

```bash
# REST API
NEXT_PUBLIC_API_URL=https://your-api.example.com

# Chat Socket.IO — points directly to the chat service (port 3008 in dev)
NEXT_PUBLIC_CHAT_SOCKET_URL=http://localhost:3008

# Privy
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
```

> In production, proxy the chat service through your load balancer and set `NEXT_PUBLIC_CHAT_SOCKET_URL` to the public URL. The Socket.IO handshake path is the default `/socket.io`.
