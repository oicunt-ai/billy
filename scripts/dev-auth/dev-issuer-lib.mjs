/**
 * Dev-issuer server logic, importable for isolated tests.
 *
 * The CLI (`dev-issuer.mjs`) parses arguments and wires OS signals; this
 * module owns key generation, HTTP serving, and token-file lifecycle.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { DEV_DEFAULTS, generateIssuerKeypair, issuerUrl, mintJwt } from "./jwt.mjs";

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
}

/**
 * @param {{ port?: number, tokenFile?: string }} options
 * @returns {Promise<{ url: string, kid: string, tokenFile: string,
 *   close: () => Promise<void> }>}
 */
export function startDevIssuer(options = {}) {
  const port = options.port ?? DEV_DEFAULTS.port;
  const tokenFile = path.resolve(
    process.cwd(),
    options.tokenFile ?? ".dev-auth/token",
  );
  const issuer = issuerUrl(port);

  // Ephemeral key: per startDevIssuer call, memory only.
  const { privateKey, kid, publicJwk } = generateIssuerKeypair();

  function refreshTokenFile() {
    ensureParentDir(tokenFile);
    const token = mintJwt({
      privateKey,
      kid,
      issuer,
      audience: DEV_DEFAULTS.audience,
      subject: DEV_DEFAULTS.subject,
      tenantId: DEV_DEFAULTS.tenantId,
      scope: DEV_DEFAULTS.scope,
      expiresInSeconds: DEV_DEFAULTS.tokenTtlSeconds,
    });
    // Mode 0600 is best-effort on Windows; the directory is Git-ignored.
    fs.writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
    return tokenFile;
  }

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/.well-known/jwks.json") {
      const body = JSON.stringify({ keys: [publicJwk] });
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  return new Promise((resolve, reject) => {
    // Hostname hardcoded: loopback only, never 0.0.0.0.
    server.listen(port, DEV_DEFAULTS.host, () => {
      refreshTokenFile();
      const refreshTimer = setInterval(
        refreshTokenFile,
        Math.floor((DEV_DEFAULTS.tokenTtlSeconds * 1000) / 2),
      );
      refreshTimer.unref();
      resolve({
        url: issuer,
        kid,
        tokenFile,
        close: () =>
          new Promise((done) => {
            clearInterval(refreshTimer);
            server.close(() => {
              try {
                fs.unlinkSync(tokenFile);
              } catch {
                // Already removed — nothing sensitive remains in the app tree.
              }
              done();
            });
          }),
      });
    });
    server.on("error", reject);
  });
}
