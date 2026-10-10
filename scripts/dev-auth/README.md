# BILLY development authentication helper (dev only)

Minimal RS256 JWT issuer + JWKS server for local development, built on
Node.js built-ins (`node:crypto`, `node:http`). No dependencies.

It exists because no reusable standalone development issuer was found in
Platform or AI Platform: their tests mint JWTs in-process, and the Gateway
verifies user JWTs against an external JWKS endpoint at runtime.

> Never enable this outside explicit local development. It refuses to run
> with `NODE_ENV=production`. It is not authentication infrastructure —
> production will use the real identity provider.

## Files

- `jwt.mjs` — pure sign/verify helpers (no I/O, no logging of secrets).
- `dev-issuer-lib.mjs` — server + token-file lifecycle (importable by tests).
- `dev-issuer.mjs` — CLI entrypoint (`npm run dev:auth`).
- `dev-issuer.test.mjs` — isolated tests (`npm run test:auth`).

## Startup

```bash
npm run dev:auth
# JWKS: http://127.0.0.1:4567/.well-known/jwks.json
# Token file: .dev-auth/token (Git-ignored, mode 0600 best-effort)
```

Options: `--port <1-65535>` (default `4567`),
`--token-file <path>` (default `.dev-auth/token`, resolved from repo root).

Shutdown: `Ctrl+C` (SIGINT) or SIGTERM. Shutdown removes the token file.

The server binds **only `127.0.0.1`** (hardcoded) and serves **only**
`GET /.well-known/jwks.json`. Every other method/route returns 404 —
there is no HTTP token-minting endpoint.

## Gateway configuration (Gateway process env, unchanged Gateway source)

| Variable | Value for local development |
|---|---|
| `JWKS_URI` | `http://127.0.0.1:4567/.well-known/jwks.json` |
| `JWT_ISSUER` | `http://127.0.0.1:4567` |
| `JWT_AUDIENCE` | `oicunt-platform` |

Minted development claims: `sub "billy-dev-user"`,
`tenant_id "billy-local"`, `scope "ai:use"`, matching `iss`/`aud` above,
`exp` 55 minutes after issuance (under the 1-hour maximum), RS256 `kid`
matching the published JWKS.

## How the future BFF obtains a token (server-side only)

1. Start this issuer alongside the Gateway in local dev.
2. The BFF reads `.dev-auth/token` from disk (or `BILLY_DEV_JWT_FILE`
   pointing at it), trims whitespace, and attaches it as
   `Authorization: Bearer` on Gateway calls.
3. The file is refreshed every ~27 minutes; on 401 the BFF re-reads it.
4. The browser never receives this token — sessions stay server-side.

## Security properties

- Private key: ephemeral per process, memory only — never written to disk,
  never served, never logged.
- Token file: Git-ignored (`.dev-auth/`), `0600` (best-effort on Windows),
  removed on shutdown, short-lived if left stale.
- Logs contain only the JWKS URL, `kid`, token path, and expiry timestamp.
- Localhost-only binding; production guard via `NODE_ENV`.
