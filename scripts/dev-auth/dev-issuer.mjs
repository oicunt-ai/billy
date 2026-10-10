#!/usr/bin/env node
/**
 * BILLY development-only JWT issuer + JWKS server.
 *
 * Explicit local development use only — run with:
 *   npm run dev:auth
 *
 * - Ephemeral RSA-2048 key pair, memory only (never persisted/logged/served).
 * - Serves ONLY the public JWKS document on 127.0.0.1 (default port 4567).
 *   No HTTP token-minting endpoint exists: every other route is 404.
 * - Writes a short-lived development JWT to a Git-ignored,
 *   access-restricted file for the future BFF to read server-side.
 * - Refuses to run when NODE_ENV=production.
 *
 * Usage: node scripts/dev-auth/dev-issuer.mjs [--port 4567] [--token-file .dev-auth/token]
 */

import { DEV_DEFAULTS } from "./jwt.mjs";
import { startDevIssuer } from "./dev-issuer-lib.mjs";

function fail(message) {
  console.error(`[dev-issuer] ${message}`);
  process.exit(1);
}

if (process.env["NODE_ENV"] === "production") {
  fail("refusing to run a development issuer with NODE_ENV=production");
}

function parseArgs(argv) {
  const args = { port: DEV_DEFAULTS.port, tokenFile: ".dev-auth/token" };
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === "--port" || current.startsWith("--port=")) {
      const raw =
        current === "--port" ? argv[(i += 1)] : current.slice("--port=".length);
      const port = Number(raw);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        fail(`invalid --port value: ${String(raw)}`);
      }
      args.port = port;
    } else if (current === "--token-file" || current.startsWith("--token-file=")) {
      const raw =
        current === "--token-file"
          ? argv[(i += 1)]
          : current.slice("--token-file=".length);
      if (typeof raw !== "string" || raw.trim().length === 0) {
        fail("invalid --token-file value");
      }
      args.tokenFile = raw;
    } else {
      fail(`unknown argument: ${current}`);
    }
  }
  return args;
}

const handle = await startDevIssuer(parseArgs(process.argv.slice(2)));
// Never log key material or tokens — URL, kid, and token path only.
console.log(`[dev-issuer] JWKS ready at ${handle.url}/.well-known/jwks.json`);
console.log(`[dev-issuer] development token file: ${handle.tokenFile}`);

function shutdown(signal) {
  handle
    .close()
    .then(() => {
      console.log(`[dev-issuer] stopped (${signal})`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`[dev-issuer] shutdown failed: ${String(error)}`);
      process.exit(1);
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
