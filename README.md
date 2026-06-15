# Backbench Games

Small multiplayer web games from the back bench.

## Apps

- `frontend/`: Next.js + TypeScript, deployable to Vercel.
- `backend/`: Express + TypeScript + Socket.IO, deployable to Railway.

## Local Development

Install dependencies:

```bash
npm install
```

Run both apps:

```bash
npm run dev
```

The frontend runs on `http://localhost:3000`.
The backend runs on `http://localhost:4000`.

## Environment

Frontend:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

Backend:

```bash
PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
```
