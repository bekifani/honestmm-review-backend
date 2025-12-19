# Chat API & Frontend Integration Guide

This document explains how to use the AI chat feature to ask questions about uploaded files, retrieve chat history, and manage context.

The chat system is usage-limited by the subscription plan. Each AI question counts as one chat message.

## Prerequisites

- Backend running on http://localhost:3001
- Auth working; all chat routes require JWT via `Authorization: Bearer <token>`
- Environment variable set in `.env`:
  - `DEEPSEEK_API_KEY=your_deepseek_api_key_here`
- Database migrated to include `ChatLog.sessionId` (see Migration below)

## Migration (one-time)
Run in the backend folder:

```bash
npx prisma migrate dev --name add_chat_session_id
npx prisma generate
```

## Endpoints

Base path: `/api`

- POST `/chat/ask` — Ask AI and save the Q&A
  - Body: `{ fileId: number, question: string, sessionId?: string }`
  - Returns: `{ answer: string, sessionId: string, chatLogId: number }`
  - Counts toward chat usage limits

- GET `/chat/{fileId}` — Get chat history
  - Query: `?sessionId=your-session-id` (optional)
  - Returns: `ChatLog[]` ordered ascending by time

- POST `/chat/clear` — Clear chat context for a session
  - Body: `{ fileId: number, sessionId: string }`
  - Deletes chat logs for that file + session

- POST `/chat` — Save chat manually (optional)
  - Body: `{ fileId: number, question: string, answer: string, sessionId?: string }`

Open Swagger at:
- http://localhost:3001/api/docs → Tag "Chat"

## cURL Examples

Ask AI:
```bash
curl -X POST http://localhost:3001/api/chat/ask \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"fileId": 42, "question": "What is the notice period?", "sessionId": "default"}'
```

Get chat history:
```bash
curl -X GET "http://localhost:3001/api/chat/42?sessionId=default" \
  -H "Authorization: Bearer YOUR_JWT"
```

Clear context:
```bash
curl -X POST http://localhost:3001/api/chat/clear \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"fileId": 42, "sessionId": "default"}'
```

## Frontend Integration (React + Axios)

Axios instance:
```ts
import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

Chat API helpers:
```ts
export async function askAI(fileId: number, question: string, sessionId = 'default') {
  const { data } = await api.post('/chat/ask', { fileId, question, sessionId });
  return data as { answer: string; sessionId: string; chatLogId: number };
}

export async function getChatHistory(fileId: number, sessionId?: string) {
  const { data } = await api.get(`/chat/${fileId}`, { params: { sessionId } });
  return data as Array<{ id: number; question: string; answer: string; createdAt: string; sessionId?: string }>;
}

export async function clearChat(fileId: number, sessionId: string) {
  const { data } = await api.post('/chat/clear', { fileId, sessionId });
  return data as { success: boolean; message: string };
}
```

Minimal UI usage:
```tsx
import { useEffect, useState } from 'react';
import { askAI, getChatHistory, clearChat } from './chatApi';

export function FileChat({ fileId }: { fileId: number }) {
  const [sessionId, setSessionId] = useState(`default`);
  const [messages, setMessages] = useState<Array<{ role: 'user'|'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    getChatHistory(fileId, sessionId).then((logs) => {
      const m = logs.flatMap((l) => ([{ role: 'user' as const, content: l.question }, { role: 'assistant' as const, content: l.answer }]));
      setMessages(m);
    });
  }, [fileId, sessionId]);

  async function onAsk() {
    if (!input.trim()) return;
    const { answer } = await askAI(fileId, input, sessionId);
    setMessages((prev) => [...prev, { role: 'user', content: input }, { role: 'assistant', content: answer }]);
    setInput('');
  }

  return (
    <div>
      <div>
        <label>Session</label>
        <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
        <button onClick={() => clearChat(fileId, sessionId).then(() => setMessages([]))}>Clear</button>
      </div>
      <div style={{ height: 300, overflowY: 'auto', border: '1px solid #ddd', marginTop: 8 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ padding: 8 }}>
            <strong>{m.role}:</strong> {m.content}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this file..." style={{ flex: 1 }} />
        <button onClick={onAsk}>Send</button>
      </div>
    </div>
  );
}
```

## Session Strategy
- Use a stable `sessionId` per file to maintain context (e.g., `default` or `file-${fileId}`)
- To start a fresh thread, generate a new `sessionId` or call `/chat/clear`

## Errors & Limits
- 401 Unauthorized: Missing/invalid token
- 403 Forbidden: File not owned by user or usage limit reached
- 404 Not Found: File ID invalid

## Notes
- AI provider: DeepSeek (`DEEPSEEK_API_KEY` required)
- Each `/chat/ask` increments `usedChatMessages` via `SubscriptionService.trackUsage()`
- Swagger docs live at `/api/docs` and `/docs` (both mounted)
