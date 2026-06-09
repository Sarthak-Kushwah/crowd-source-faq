# Shamagama (Yaksha FAQ Portal)

Full-stack FAQ portal with semantic vector search, AI-powered community moderation, and an expert promotion layer. Built to handle 1 million registered users.

GitHub: https://github.com/vicharanashala/cs15
Refer More Here -> [`docs/`](docs/README.md)

---

## Tech Stack

### Frontend
- React 18, React Router 6
- Vite, TypeScript, Tailwind CSS (with PostCSS + Autoprefixer)
- Framer Motion (animations)
- Axios (HTTP client)
- Recharts (admin dashboard charts)
- React Testing Library, jsdom, Vitest

### Backend
- Node.js, Express 4
- TypeScript (ES modules), tsx (dev runner), nodemon
- Mongoose 8 (MongoDB ODM)
- JWT (jsonwebtoken), bcryptjs
- Helmet (security headers), CORS, Morgan (request logging), Multer (file uploads)
- Zod (runtime validation)
- express-rate-limit (rate limiting)
- dotenv (env loading)
- OpenAI SDK (direct client for non-pipeline calls)
- Vitest (testing)

### Database & Storage
- MongoDB Atlas (with Vector Search for semantic search)
- Upstash Redis (caching, optional)
- LRU cache (in-memory fallback)
- Cloudinary (file / image storage)

### Search & AI
- Xenova/transformers (`multi-qa-mpnet-base-dot-v1`, 768-dim, local)
- MongoDB Atlas Vector Search (cosine similarity)
- MongoDB $text search (keyword)
- Reciprocal Rank Fusion (hybrid merge)

### AI Providers (per-pipeline configurable)
- Anthropic (Claude)
- OpenAI (GPT)
- XAI (Grok)
- MiniMax

### DevOps & Tooling
- Sentry (error tracking, `@sentry/node`)
- Ngrok (webhook tunnel for local Zoom dev)
- Twilio (SMS notifications)
- SMTP (email notifications)
- Vitest (unit + integration tests)

---

## Quick Start

```bash
./run.sh        # Full-stack runner: env setup, ngrok tunnel, backend + frontend
# OR
cd backend && npm run dev    # tsx server.ts on :6767
cd frontend && npm run dev   # Vite on :5173
cd backend && npm run seed   # 130 FAQs + users
```

`run.sh` prompts for `MONGODB_URI` and `JWT_SECRET` on first run, then starts the full stack with session logs in `logs/`.

---

## Documentation

Full reference in [`docs/`](docs/README.md):

| Topic | File |
|---|---|
| Architecture overview | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Pipelines (auto-answer, FAQ audit, search, Zoom) | [docs/PIPELINES.md](docs/PIPELINES.md) |
| MCP integration | [docs/MCP.md](docs/MCP.md) |
| AI provider configuration | [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md) |
| Project context | [docs/context.md](docs/context.md) |
| Issues tracking | [docs/issues.md](docs/issues.md) |
| Wire protocol | [docs/wire.md](docs/wire.md) |

---

## Key Features

- **Semantic hybrid search** — vector search (768-dim) + keyword search merged via Reciprocal Rank Fusion
- **AI auto-answer pipeline** — automatically answers community posts using FAQ + transcript knowledge base
- **FAQ audit pipeline** — re-evaluates approved FAQs against live knowledge every 6 hours
- **Zoom ingestion** — per-user OAuth, webhook triggers, automatic transcript parsing and Q&A extraction
- **Retry + dead-letter queue** — failed Zoom meetings retried with exponential backoff, capped at 3 attempts
- **Community board** — posts, comments, threaded replies, upvotes, bookmarks, expert verification
- **Reputation system** — points for accepted answers, badges, leaderboard
- **SpillTheTea notifications** — event-driven notification system
- **Admin dashboard** — FAQ review, audit results, auto-answer queue, Zoom insights, user management, moderation queue
- **Soft-delete with anonymization** — user deletion preserves referential integrity and audit logs

---

## Project Structure

```
shamagama/
├── backend/           # Express + TypeScript API
├── frontend/          # React + Vite SPA
├── docs/              # Full documentation
├── run.sh             # Local dev runner (env setup, ngrok, backend + frontend)
└── logs/              # Session logs from run.sh
```

---

## Environment Variables

Required: `MONGODB_URI`, `JWT_SECRET`
Optional: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `XAI_API_KEY` / `MINIMAX_API_KEY` (AI providers), Zoom OAuth credentials, Cloudinary, Sentry, Twilio, SMTP, Upstash Redis

See [docs/ARCHITECTURE.md#10-env-variables-reference](docs/ARCHITECTURE.md#10-env-variables-reference) for the full list.

---

## License

[MIT](./LICENSE) © 2026 vicharanashala
