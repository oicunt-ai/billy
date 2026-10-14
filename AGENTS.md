<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# BILLY — Agent Instructions

BILLY-specific guidance for coding agents (OpenCode, Codex, Claude Code,
Antigravity and compatible tools). The Next.js-generated block above is
owned by `next dev` (see
`node_modules/next/dist/server/lib/generate-agent-files.js`) — preserve it
byte-for-byte; append custom guidance only below it. This file guides; it
does not technically enforce permissions.

## 1. Project purpose

Standalone Next.js AI chatbot: responsive chat UI with streaming replies,
development-only browser auth, same-origin backend-for-frontend (catalog,
conversation creation, streaming completions, history), multi-turn Memory
continuity and reload persistence. Consumes ONLY the public Platform
Gateway over HTTP through its BFF — never calls Platform/AI Platform code
directly, never calls providers.

## 2. Repository relationship

- **`billy`** (this repo): product UI + BFF. No platform or AI logic.
- **`platform`** (sibling): Gateway `127.0.0.1:3000`, Usage `127.0.0.1:8090`.
- **`ai-platform`** (sibling): AI stack `127.0.0.1:3001-3005`.

## 3. Critical source locations

- Gateway client: `src/lib/gateway-chat.ts` (server-only; one conversation
  per chat, server-issued IDs only), `src/lib/gateway-models.ts`
- BFF routes: `src/app/api/conversations/`, `src/app/api/completions`,
  dev session handling in `src/lib/dev-auth.ts`
- Chat UI: `src/components/chat/chat-client.ts`
- Dev issuer (existing, do not reimplement):
  `scripts/dev-auth/` (`dev-issuer.mjs`, `dev-issuer-lib.mjs`, `jwt.mjs`;
  usage in `scripts/dev-auth/README.md`)

## 4. Verified commands (from `package.json`)

```bash
npm run dev:local   # app on 127.0.0.1:3100 (plain `next dev` collides with Gateway :3000)
npm run dev:auth    # JWKS issuer on 127.0.0.1:4567 (separate terminal)
npm test            # node --test across lib, chat-client and issuer suites
npm run test:auth   # issuer tests only
npm run build       # next build
npm run start       # next start
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
```

No CI workflow exists in this repo; run `test`, `lint` and `typecheck`
locally for touched areas. BILLY uses npm (not pnpm).

## 5. Coding conventions (observed)

- App Router (`src/app/`); server components/routes keep secrets and
  tokens server-side — the browser never receives the Gateway JWT.
- BFF reads the dev token file (`.dev-auth/token`, git-ignored, `0600`
  best-effort, short-lived); re-read on 401; never log or expose it.
- Validate upstream IDs and shapes at the boundary
  (`validateConversationId`, response parsers in `gateway-chat.ts`).
- Follow the installed Next.js guide in `node_modules/next/dist/docs/`
  before writing framework code; heed deprecation notices.
- Tests colocate as `*.test.mjs` and run on plain `node --test`.

## 6. Security expectations

- `BILLY_DEV_ACCESS_SECRET` lives only in git-ignored `.env.local`
  (generate with `crypto.randomBytes`); `.env.example` stays placeholder.
- Never commit secrets, tokens or the `.dev-auth/` directory.
- Dev auth (`BILLY_DEV_AUTH_ENABLED`, local issuer) is development-only;
  production auth is undecided (see `docs/product-vision.md`).

## 7. Working methodology

- Inspect implementation before proposing changes; keep diffs narrow;
  preserve the BFF boundary and the public Gateway contract.
- Run relevant verification and report actual results.
- Distinguish IMPLEMENTED (source + tests) from PROPOSED; product
  direction in `docs/product-vision.md` marks undecided items OPEN.

## 8. Authorization boundaries (operator approval required)

Live AI provider requests (via chat or API); database/data changes;
service restarts affecting the live dev environment; credential,
configuration or feature-flag changes; commits, pushes, deployments.
Read-only inspection and safe local validation are fine. No BILLY feature
work beyond the operator's explicit task scope.

## 9. Deeper documentation

- `README.md` — service map, environment, local development
- `scripts/dev-auth/README.md` — issuer, token file, Gateway variables
- `docs/product-vision.md` — product direction (some OPEN DECISIONS)
