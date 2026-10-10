# BILLY

BILLY is a standalone AI chatbot web application powered by the existing
OICUNT Platform and OICUNT AI Platform. This repository holds only the BILLY
application — Platform and AI Platform live in their own repositories and
are consumed over their public HTTP APIs.

What BILLY implements: responsive chat UI with streaming assistant
replies, development-only browser authentication, an authenticated
same-origin backend-for-frontend (model catalog, conversation creation,
streaming completions, conversation history), multi-turn Memory
continuity, and reload persistence for saved conversations.

## Service map (local development)

| Service                | Address             |
| ---------------------- | ------------------- |
| BILLY application      | `127.0.0.1:3100`    |
| OICUNT Platform Gateway| `127.0.0.1:3000`    |
| Development JWKS issuer| `127.0.0.1:4567`    |

BILLY talks to the Gateway only through its own BFF routes; the browser
never calls Platform directly and never sees the Gateway JWT.

## Prerequisites

- Node.js 20+ (verified with Node 24)
- npm 10+
- For live AI chat: the Platform Gateway plus the AI Platform stack
  (Model Registry, Model Gateway, Memory, Inference, AI Orchestrator)
  with PostgreSQL/RabbitMQ running, a registered model, and provider
  credentials configured server-side. Without them, BILLY still starts —
  backend-dependent calls report errors honestly.

## Environment setup

Copy `.env.example` to `.env.local` for local overrides (git-ignored,
never commit real secrets):

```bash
cp .env.example .env.local
```

`.env.example` documents every variable with non-secret placeholder
values, except `BILLY_DEV_ACCESS_SECRET`, which is blank by design.
Generate a strong value and keep it in `.env.local` only:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Variables: `BILLY_DEV_AUTH_ENABLED=true`,
`BILLY_DEV_ACCESS_SECRET=<generated>`,
`OICUNT_PLATFORM_GATEWAY_URL=http://127.0.0.1:3000`,
`BILLY_DEV_JWT_FILE=.dev-auth/token`.

## Local development

Run the issuer and the app **concurrently in two separate terminals**
(the issuer mints short-lived development JWTs to a git-ignored file
that the BFF reads server-side):

Terminal 1 — issuer:

```bash
npm run dev:auth
# JWKS: http://127.0.0.1:4567/.well-known/jwks.json
```

Terminal 2 — app (loopback-only; the Gateway default 3000 collides with
plain `next dev`, so BILLY uses port 3100):

```bash
npm run dev:local
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100), enter the access
secret in the sign-in form, pick a model, and chat. Keep both terminals
open; Ctrl+C stops each process.

## Checks

```bash
npm run test        # unit tests (lib + SSE parser + dev issuer)
npm run test:auth   # dev issuer tests only
npm run lint        # ESLint
npm run typecheck   # TypeScript (no emit)
npm run build       # production build
npm start           # serve the production build (after `npm run build`)
```

## Development authentication (dev only)

Browser sessions are opaque, HttpOnly + SameSite=Lax, 30-minute,
in-memory only, and die with the server. All cookie-authenticated
mutations additionally require a matching loopback `Origin` header.
The Gateway JWT never reaches the browser.

**Production will use a real identity provider instead of all of this:**
no access secret, no issuer, no opaque dev sessions. The dev mechanism
is disabled outside explicit local development (BFF routes return 404)
and refuses `NODE_ENV=production`.

## Development BFF (dev only, same-origin)

- `POST /api/dev-session` — sign in with the access secret (rate-limited);
  `DELETE /api/dev-session` — sign out.
- `GET /api/models` — public model catalog projection (`id`,
  `displayName`, `description`, `capabilities`, `status`); only
  `available`/`degraded` models are selectable.
- `POST /api/conversations` — creates one server-generated conversation
  per chat; `GET /api/conversations` — lists the user's conversations.
- `GET /api/conversations/[id]/messages` — one conversation's messages in
  sequence order (text content only; reasoning stays hidden).
- `POST /api/completions` — streams a single-turn SSE completion for the
  active conversation (new user message only, `stream: true`, reasoning
  off, no retries — a sent turn may already be persisted; client abort
  propagates upstream).

Pagination limitation: the public Gateway forwards no pagination
parameters, so list endpoints return the server-default first window
(conversations: 20, messages: 50). A true `hasMore` is surfaced honestly
in the UI ("more may exist") instead of assuming completeness.

Notes:

- Without `BILLY_DEV_AUTH_ENABLED=true` (or in production) the BFF routes
  return 404 so the mechanism is undiscoverable.
- After restarting the dev issuer, expect `TOKEN_REJECTED` until the
  Gateway refreshes its cached JWKS (it throttles refetches while its cache
  is fresh, default 10 minutes). Prefer keeping one issuer process running.

## Structure

```
src/
  app/
    layout.tsx                  # root layout + metadata
    page.tsx                    # chat shell entry
    api/
      dev-session/route.ts      # POST login / DELETE logout
      models/route.ts           # GET model catalog
      conversations/route.ts    # POST create / GET list
      conversations/[id]/messages/route.ts  # GET message history
      completions/route.ts      # POST streaming completion (SSE)
  components/
    chat/
      types.ts                  # ChatMessage / ChatStatus / ChatErrorInfo
      chat-shell.tsx            # layout, conversation + model state (client)
      chat-client.ts            # SSE parser + single-attempt stream runner
      message-content.ts        # history content normalizer
      model-utils.ts            # public-model types + selectability
      sidebar.tsx               # desktop sidebar + mobile drawer
      conversation-list.tsx     # saved-conversation navigation
      model-picker.tsx          # model selection
      dev-login.tsx             # development sign-in form
      message-list.tsx          # empty state + conversation display
      message-bubble.tsx        # user/assistant bubbles + streaming boundary
      typing-indicator.tsx      # reusable loading presentation
      chat-error.tsx            # reusable error presentation
      composer.tsx              # multiline composer (Enter/Shift+Enter)
  lib/
    dev-auth.ts                 # sessions, secrets, origin gate (server-only)
    bff-session.ts              # session gate for BFF routes (server-only)
    gateway-models.ts           # catalog Gateway client (server-only)
    gateway-chat.ts             # conversations/completions/history client
    *.test.mjs                  # focused unit tests (run via npm run test)
scripts/
  dev-auth/
    jwt.mjs / dev-issuer*.mjs   # loopback RS256 issuer + JWKS + tests
    README.md                   # issuer runbook + Gateway env table
public/                         # static assets
```

## Tech

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- ESLint (`eslint-config-next`)
- npm
