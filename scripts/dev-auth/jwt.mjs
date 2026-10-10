/**
 * Minimal RS256 JWT helpers for BILLY local development only.
 *
 * Pure functions over Node.js built-in crypto — no dependencies, no I/O,
 * no logging of key material. Never import this from application code or
 * browser bundles; it exists solely for the dev-only issuer and its tests.
 */

import {
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from "node:crypto";

export const DEV_DEFAULTS = Object.freeze({
  host: "127.0.0.1",
  port: 4567,
  subject: "billy-dev-user",
  tenantId: "billy-local",
  scope: "ai:use",
  audience: "oicunt-platform",
  /** 55 minutes — under the 1-hour maximum for development tokens. */
  tokenTtlSeconds: 55 * 60,
});

export function issuerUrl(port = DEV_DEFAULTS.port) {
  return `http://${DEV_DEFAULTS.host}:${port}`;
}

/**
 * Generate an ephemeral RSA key pair plus its public JWK representation.
 * The private key is a KeyObject held in memory by the caller and must
 * never be serialized, logged, or served.
 */
export function generateIssuerKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const kid = randomBytes(16).toString("hex");
  const publicJwk = publicKey.export({ format: "jwk" });
  return {
    privateKey,
    kid,
    publicJwk: { ...publicJwk, kid, alg: "RS256", use: "sig" },
  };
}

export function base64urlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

export function base64urlDecodeToBuffer(input) {
  return Buffer.from(String(input), "base64url");
}

function encodeSegment(value) {
  return base64urlEncode(JSON.stringify(value));
}

/**
 * Mint a short-lived RS256 development JWT.
 */
export function mintJwt({
  privateKey,
  kid,
  issuer,
  audience,
  subject,
  tenantId,
  scope,
  expiresInSeconds,
  issuedAtSeconds,
}) {
  const now = issuedAtSeconds ?? Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid };
  const payload = {
    sub: subject,
    tenant_id: tenantId,
    scope,
    iss: issuer,
    aud: audience,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const signingInput = `${encodeSegment(header)}.${encodeSegment(payload)}`;
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(signingInput, "utf8"),
    privateKey,
  );
  return `${signingInput}.${signature.toString("base64url")}`;
}

export class JwtVerificationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "JwtVerificationError";
    this.code = code;
  }
}

/**
 * Verify an RS256 JWT against a key lookup.
 *
 * @param {string} token
 * @param {{ getPublicKey: (kid: string | undefined) => import("node:crypto").KeyObject,
 *          issuer: string, audience: string, clockSkewSeconds?: number,
 *          nowSeconds?: number }} options
 */
export function verifyJwt(token, options) {
  const {
    getPublicKey,
    issuer,
    audience,
    clockSkewSeconds = 0,
    nowSeconds,
  } = options;
  const parts = String(token).split(".");
  if (parts.length !== 3) {
    throw new JwtVerificationError("MALFORMED", "JWT must have three segments");
  }
  let header;
  let payload;
  try {
    header = JSON.parse(base64urlDecodeToBuffer(parts[0]).toString("utf8"));
    payload = JSON.parse(base64urlDecodeToBuffer(parts[1]).toString("utf8"));
  } catch {
    throw new JwtVerificationError("MALFORMED", "JWT has invalid JSON encoding");
  }
  if (header === null || typeof header !== "object" || header.alg !== "RS256") {
    throw new JwtVerificationError(
      "ALGORITHM",
      "JWT must use RS256",
    );
  }
  let key;
  try {
    key = getPublicKey(header.kid);
  } catch {
    throw new JwtVerificationError("UNKNOWN_KID", "JWT key id is not trusted");
  }
  let signature;
  try {
    signature = base64urlDecodeToBuffer(parts[2]);
  } catch {
    throw new JwtVerificationError("MALFORMED", "JWT has invalid signature encoding");
  }
  const valid = verify(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`, "utf8"),
    key,
    signature,
  );
  if (!valid) {
    throw new JwtVerificationError("BAD_SIGNATURE", "JWT signature is invalid");
  }
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || now > payload.exp + clockSkewSeconds) {
    throw new JwtVerificationError("EXPIRED", "JWT has expired");
  }
  if (payload.iss !== issuer) {
    throw new JwtVerificationError("BAD_ISSUER", "JWT issuer is not trusted");
  }
  const audOk = Array.isArray(payload.aud)
    ? payload.aud.includes(audience)
    : payload.aud === audience;
  if (!audOk) {
    throw new JwtVerificationError("BAD_AUDIENCE", "JWT audience is not trusted");
  }
  return payload;
}
