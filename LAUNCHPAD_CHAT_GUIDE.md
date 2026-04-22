# Launchpad Chat — Frontend Integration Guide

WebSocket endpoint: `ws://<host>/ws/launchpad`

No authentication required on connect. Wallet address is passed per-event.

---

## Overview

Two chat modes share the same WebSocket connection.
A REST endpoint is available to fetch the unified conversation list before opening a socket.

---

## REST — Conversation List

`GET /api/launchpad/conversations?walletAddress=<base58>`

No auth required. Returns all DM threads and community chats the wallet has participated in, merged and sorted by most recent activity.

```ts
const res = await fetch(
  `/api/launchpad/conversations?walletAddress=${myWallet}`,
)
const { data } = await res.json()
// data = ConversationItem[]
```

Response item shape:

```ts
type ConversationItem =
  | {
      type: 'dm'
      otherWallet: string   // the other participant's wallet
      lastMessage: string
      lastAt: string        // ISO timestamp
    }
  | {
      type: 'community'
      ca: string
      name: string
      symbol: string
      logoUrl: string | null
      lastMessage: string
      lastAt: string
    }
```

Use this to render a conversation list on load, then open a WebSocket for live updates.

---

## WebSocket — Real-time Chat

| Mode | Identified by | Auth |
|------|--------------|------|
| Community chat | Token `ca` (contract address) | None |
| Direct messages | Wallet address | None |

---

### Connecting

```ts
import { io, Socket } from 'socket.io-client'

const socket: Socket = io('wss://api.mintjobs.fun/ws/launchpad', {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
})

socket.on('connect', () => {
  console.log('Connected to launchpad chat:', socket.id)
})

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason)
})
```

---

## Community Chat

### Join a community

Call `community:join` after connecting. Pass `name`, `symbol`, and `logoUrl` on first join — they are used to create the community if it does not exist yet. If the community already exists these fields are ignored.

```ts
socket.emit(
  'community:join',
  { ca: '9QcGaw2Vo...', name: 'Test Token', symbol: 'TEST', logoUrl: 'https://...' },
  (res) => {
    if (!res.success) return console.error(res.error)

    console.log('Community:', res.community)
    // res.community = { id, ca, name, symbol, logoUrl, createdAt, updatedAt }

    console.log('History:', res.history)
    // res.history = CommunityMessage[] sorted oldest → newest, last 50
  },
)
```

`community` shape:

```ts
interface Community {
  id: string
  ca: string
  name: string
  symbol: string
  logoUrl: string | null
  createdAt: string
  updatedAt: string
}
```

### Send a message

```ts
socket.emit(
  'community:message',
  { ca: '9QcGaw2Vo...', senderWallet: 'ABC123...', content: 'gm everyone' },
  (res) => {
    if (!res.success) console.error(res.error)
    // res.message = the saved CommunityMessage
  },
)
```

### Receive messages (pushed to all members in the room)

```ts
socket.on('community:message', (payload: { ca: string; message: CommunityMessage }) => {
  const { ca, message } = payload
  // append message to the UI for community `ca`
})
```

### Leave a community

```ts
socket.emit('community:leave', { ca: '9QcGaw2Vo...' }, (res) => {
  console.log(res.success) // true
})
```

### CommunityMessage type

```ts
interface CommunityMessage {
  id: string
  ca: string
  senderWallet: string
  content: string
  createdAt: string
  updatedAt: string
}
```

---

## Direct Messages

### Register to receive DMs

Call `dm:listen` once after connecting so the server knows which wallet room to push messages to. Call again if the user switches wallets.

```ts
socket.emit('dm:listen', { walletAddress: 'ABC123...' }, (res) => {
  if (!res.success) console.error(res.error)
})
```

### Send a DM

No auth — anyone can send to any wallet.

```ts
socket.emit(
  'dm:send',
  {
    senderWallet: 'ABC123...',
    recipientWallet: 'XYZ789...',
    content: 'hey, saw your token',
  },
  (res) => {
    if (!res.success) console.error(res.error)
    // res.message = the saved DmMessage
  },
)
```

### Receive a DM

Pushed to both sender and recipient wallet rooms.

```ts
socket.on('dm:message', (payload: { message: DmMessage }) => {
  const { message } = payload
  // show notification or append to conversation
})
```

### Load DM history

```ts
socket.emit(
  'dm:history',
  { walletA: 'ABC123...', walletB: 'XYZ789...', limit: 50 },
  (res) => {
    if (!res.success) return console.error(res.error)
    // res.messages = DmMessage[] sorted oldest → newest
  },
)
```

### DmMessage type

```ts
interface DmMessage {
  id: string
  senderWallet: string
  recipientWallet: string
  content: string
  createdAt: string
  updatedAt: string
}
```

---

## Full Example — Community Chat Component (React)

```tsx
import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface Props {
  ca: string
  name: string
  symbol: string
  logoUrl?: string
  myWallet: string
}

export function CommunityChat({ ca, name, symbol, logoUrl, myWallet }: Props) {
  const socketRef = useRef<Socket | null>(null)
  const [messages, setMessages] = useState<CommunityMessage[]>([])
  const [input, setInput] = useState('')

  useEffect(() => {
    const socket = io('wss://api.mintjobs.fun/ws/launchpad', {
      transports: ['websocket'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      // Join (or create) the community
      socket.emit(
        'community:join',
        { ca, name, symbol, logoUrl },
        (res: any) => {
          if (res.success) setMessages(res.history)
        },
      )
    })

    // Receive live messages
    socket.on('community:message', ({ message }: any) => {
      setMessages((prev) => [...prev, message])
    })

    return () => {
      socket.emit('community:leave', { ca })
      socket.disconnect()
    }
  }, [ca])

  function send() {
    if (!input.trim()) return
    socketRef.current?.emit('community:message', {
      ca,
      senderWallet: myWallet,
      content: input.trim(),
    })
    setInput('')
  }

  return (
    <div>
      <div style={{ height: 400, overflowY: 'auto' }}>
        {messages.map((m) => (
          <div key={m.id}>
            <strong>{m.senderWallet.slice(0, 8)}…</strong> {m.content}
          </div>
        ))}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={send}>Send</button>
    </div>
  )
}
```

---

## Full Example — DM (React)

```tsx
import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface Props {
  myWallet: string
  otherWallet: string
}

export function DirectMessage({ myWallet, otherWallet }: Props) {
  const socketRef = useRef<Socket | null>(null)
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [input, setInput] = useState('')

  useEffect(() => {
    const socket = io('wss://api.mintjobs.fun/ws/launchpad', {
      transports: ['websocket'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      // Subscribe to incoming DMs for my wallet
      socket.emit('dm:listen', { walletAddress: myWallet })

      // Load history
      socket.emit(
        'dm:history',
        { walletA: myWallet, walletB: otherWallet },
        (res: any) => {
          if (res.success) setMessages(res.messages)
        },
      )
    })

    socket.on('dm:message', ({ message }: any) => {
      // Only append if it belongs to this conversation
      const inConversation =
        (message.senderWallet === myWallet && message.recipientWallet === otherWallet) ||
        (message.senderWallet === otherWallet && message.recipientWallet === myWallet)
      if (inConversation) setMessages((prev) => [...prev, message])
    })

    return () => socket.disconnect()
  }, [myWallet, otherWallet])

  function send() {
    if (!input.trim()) return
    socketRef.current?.emit('dm:send', {
      senderWallet: myWallet,
      recipientWallet: otherWallet,
      content: input.trim(),
    })
    setInput('')
  }

  return (
    <div>
      <div style={{ height: 400, overflowY: 'auto' }}>
        {messages.map((m) => (
          <div key={m.id} style={{ textAlign: m.senderWallet === myWallet ? 'right' : 'left' }}>
            {m.content}
          </div>
        ))}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={send}>Send</button>
    </div>
  )
}
```

---

## Event Reference

### Client → Server

| Event | Payload | Returns |
|-------|---------|---------|
| `community:join` | `{ ca, name?, symbol?, logoUrl? }` | `{ success, community, history }` |
| `community:message` | `{ ca, senderWallet, content }` | `{ success, message }` |
| `community:leave` | `{ ca }` | `{ success }` |
| `dm:listen` | `{ walletAddress }` | `{ success }` |
| `dm:send` | `{ senderWallet, recipientWallet, content }` | `{ success, message }` |
| `dm:history` | `{ walletA, walletB, limit? }` | `{ success, messages }` |

### Server → Client (pushed)

| Event | Payload | When |
|-------|---------|------|
| `community:message` | `{ ca, message }` | Someone posts in a community you joined |
| `dm:message` | `{ message }` | You receive or send a DM (both sides get it) |

---

## Limits

| Field | Limit |
|-------|-------|
| Message content | 2000 characters |
| DM / community history | 50 messages per fetch |

---

## Error Shape

All acknowledgement callbacks return:

```ts
{ success: false, error: string }
```

on failure. Always check `res.success` before reading `res.data`.
