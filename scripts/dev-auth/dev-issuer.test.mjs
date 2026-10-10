/**
 * Isolated tests for the development-only JWT/JWKS helper.
 *
 * Run with: npm run test:auth
 *
 * No network beyond 127.0.0.1, no database, no Gateway calls. Key pairs are
 * ephemeral per test. Assertions never log key material or bearer tokens —
 * only structural facts (presence, shape, rejection codes).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicKey } from "node:crypto";
import {
  DEV_DEFAULTS,
  generateIssuerKeypair,
  issuerUrl,
  mintJwt,
  verifyJwt,
  JwtVerificationError,
} from "./jwt.mjs";
import { startDevIssuer } from "./dev-issuer-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const issuerScript = path.join(here, "dev-issuer.mjs");

function requestJson(port, method, route) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: route, method },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function publicKeyFromJwk(jwk) {
  return createPublicKey({ key: jwk, format: "jwk" });
}

describe("jwt helpers (ephemeral local keypair)", () => {
  it("round-trips a token carrying the required dev claims", () => {
    const { privateKey, kid, publicJwk } = generateIssuerKeypair();
    const issuer = issuerUrl(4567);
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
    assert.ok(DEV_DEFAULTS.tokenTtlSeconds <= 3600);
    const payload = verifyJwt(token, {
      getPublicKey: (id) => {
        assert.equal(id, kid);
        return publicKeyFromJwk(publicJwk);
      },
      issuer,
      audience: DEV_DEFAULTS.audience,
    });
    assert.equal(payload.sub, DEV_DEFAULTS.subject);
    assert.equal(payload.tenant_id, DEV_DEFAULTS.tenantId);
    assert.equal(payload.scope, DEV_DEFAULTS.scope);
    assert.equal(payload.iss, issuer);
    assert.equal(payload.aud, DEV_DEFAULTS.audience);
    assert.ok(payload.exp - payload.iat <= 3600);
  });

  it("rejects expired tokens", () => {
    const { privateKey, kid, publicJwk } = generateIssuerKeypair();
    const token = mintJwt({
      privateKey,
      kid,
      issuer: issuerUrl(4567),
      audience: DEV_DEFAULTS.audience,
      subject: DEV_DEFAULTS.subject,
      tenantId: DEV_DEFAULTS.tenantId,
      scope: DEV_DEFAULTS.scope,
      expiresInSeconds: -10,
    });
    assert.throws(
      () =>
        verifyJwt(token, {
          getPublicKey: () => publicKeyFromJwk(publicJwk),
          issuer: issuerUrl(4567),
          audience: DEV_DEFAULTS.audience,
        }),
      (error) => error instanceof JwtVerificationError && error.code === "EXPIRED",
    );
  });

  it("rejects tampered signatures, wrong issuer, and wrong audience", () => {
    const { privateKey, kid, publicJwk } = generateIssuerKeypair();
    const base = {
      privateKey,
      kid,
      issuer: issuerUrl(4567),
      audience: DEV_DEFAULTS.audience,
      subject: DEV_DEFAULTS.subject,
      tenantId: DEV_DEFAULTS.tenantId,
      scope: DEV_DEFAULTS.scope,
      expiresInSeconds: 600,
    };
    const getPublicKey = () => publicKeyFromJwk(publicJwk);
    const token = mintJwt(base);
    const [h] = token.split(".");
    const tampered = `${h}.${Buffer.from(JSON.stringify({ sub: "mallory" })).toString("base64url")}.${token.split(".")[2]}`;
    assert.throws(
      () => verifyJwt(tampered, { getPublicKey, issuer: base.issuer, audience: base.audience }),
      (error) => error instanceof JwtVerificationError && error.code === "BAD_SIGNATURE",
    );
    assert.throws(
      () => verifyJwt(token, { getPublicKey, issuer: "http://127.0.0.1:9999", audience: base.audience }),
      (error) => error instanceof JwtVerificationError && error.code === "BAD_ISSUER",
    );
    assert.throws(
      () => verifyJwt(token, { getPublicKey, issuer: base.issuer, audience: "someone-else" }),
      (error) => error instanceof JwtVerificationError && error.code === "BAD_AUDIENCE",
    );
    assert.throws(
      () => verifyJwt("not.a.jwt", { getPublicKey, issuer: base.issuer, audience: base.audience }),
      (error) => error instanceof JwtVerificationError,
    );
  });
});

describe("dev issuer server (loopback only)", () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "billy-dev-auth-"));
  const tokenFile = path.join(workdir, "token");
  const port = 14567;
  let handle;

  before(async () => {
    handle = await startDevIssuer({ port, tokenFile });
  });

  after(async () => {
    await handle.close();
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  it("serves a public-only JWKS document", async () => {
    const { status, body } = await requestJson(port, "GET", "/.well-known/jwks.json");
    assert.equal(status, 200);
    const doc = JSON.parse(body);
    assert.equal(doc.keys.length, 1);
    const [jwk] = doc.keys;
    assert.equal(jwk.kty, "RSA");
    assert.equal(jwk.alg, "RS256");
    assert.equal(jwk.use, "sig");
    assert.equal(typeof jwk.kid, "string");
    assert.ok(typeof jwk.n === "string" && typeof jwk.e === "string");
    for (const secret of ["d", "p", "q", "dp", "dq", "qi"]) {
      assert.ok(!(secret in jwk), `JWKS must not contain ${secret}`);
    }
  });

  it("writes a token file that verifies against the published JWKS", async () => {
    assert.ok(fs.existsSync(tokenFile));
    const { body } = await requestJson(port, "GET", "/.well-known/jwks.json");
    const [jwk] = JSON.parse(body).keys;
    const token = fs.readFileSync(tokenFile, "utf8").trim();
    assert.equal(token.split(".").length, 3);
    const payload = verifyJwt(token, {
      getPublicKey: (id) => {
        assert.equal(id, jwk.kid);
        return publicKeyFromJwk(jwk);
      },
      issuer: issuerUrl(port),
      audience: DEV_DEFAULTS.audience,
    });
    assert.equal(payload.sub, DEV_DEFAULTS.subject);
    assert.equal(payload.tenant_id, DEV_DEFAULTS.tenantId);
    assert.equal(payload.scope, DEV_DEFAULTS.scope);
  });

  it("exposes no mint endpoint and 404s everything else", async () => {
    for (const [method, route] of [
      ["GET", "/"],
      ["GET", "/mint"],
      ["POST", "/mint"],
      ["POST", "/.well-known/jwks.json"],
      ["GET", "/.well-known/jwks.json?evil=1"],
    ]) {
      const { status } = await requestJson(port, method, route);
      assert.equal(status, 404, `${method} ${route} must be 404`);
    }
  });

  it("keeps private keys off disk", () => {
    const entries = fs.readdirSync(workdir);
    assert.deepEqual(entries, ["token"]);
  });
});

describe("dev issuer lifecycle", () => {
  it("removes the token file on close", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "billy-dev-auth-close-"));
    const file = path.join(dir, "token");
    const handle = await startDevIssuer({ port: 14568, tokenFile: file });
    assert.ok(fs.existsSync(file));
    await handle.close();
    assert.ok(!fs.existsSync(file));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses to start with NODE_ENV=production", async () => {
    const child = spawn(process.execPath, [issuerScript, "--port", "14569"], {
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "ignore",
    });
    const exitCode = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve(null);
      }, 15000);
      timer.unref();
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    assert.equal(exitCode, 1);
  });
});
