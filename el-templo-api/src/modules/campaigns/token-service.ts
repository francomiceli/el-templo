/**
 * Campaign tracking + magic-link token (Phase 119 D-04/D-21, Phase 180 D-01/D-02).
 *
 * Stateless HMAC-SHA256 signed token that identifies a single `campaign_sends`
 * row inside a tracking pixel / click redirect / unsubscribe URL, AND (since
 * Phase 180) can additionally carry a `purpose: 'login'` that authorizes the
 * magic-link exchange (`POST /api/campaigns/exchange`). Mirrors the structure
 * of `src/modules/shared/qr-token.ts` (base64url(payload).sig).
 *
 * Phase 180 (D-01) REVISES the Phase 119 invariant "the token NEVER
 * authorizes" (D-21). The revised rule is per-PURPOSE, not global:
 *   - Tracking (no `purpose`, or `purpose !== 'login'`): the token still only
 *     IDENTIFIES a sendId for `/track/open`, `/track/click`, `/unsubscribe`.
 *     It NEVER authorizes anything. TTL 30 days (`exp`, unchanged).
 *   - Login (`purpose: 'login'`): the SAME string ALSO authorizes the
 *     `POST /api/campaigns/exchange` canje, but only through `exp`'s little
 *     sibling `loginExp` (7 days, D-02) — validated exclusively by
 *     `validateMagicLinkToken`, never by `validateCampaignToken`. Past
 *     `loginExp` the token keeps identifying/tracking for the remaining
 *     `exp` window (up to 30d) but can no longer log anyone in.
 *
 * `JWT_SECRET` signs this HMAC AND the session JWTs (`fastify.jwt`). Rotating
 * it invalidates both simultaneously — do NOT rotate during Phase 180
 * (research Pitfall 7).
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Default token lifetime: 30 days (D-04), expressed in seconds. */
export const CAMPAIGN_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Magic-link login lifetime: 7 days (D-02 — explicit user decision, NOT 30d).
 * Only meaningful when `purpose === 'login'`; validated by
 * `validateMagicLinkToken`, never by `validateCampaignToken`.
 */
export const CAMPAIGN_LOGIN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Token purpose: plain tracking identification vs. magic-link login. */
export type CampaignTokenPurpose = "tracking" | "login";

export interface CampaignTokenPayload {
  userId: number;
  campaignId: number;
  sendId: number;
  /** Expiry as epoch SECONDS (Date.now()/1000 + ttl). Governs tracking (D-04). */
  exp: number;
  /**
   * Optional (Phase 180, D-01/D-02). Absent/`'tracking'` ⇒ identification
   * only. `'login'` ⇒ the token additionally authorizes the magic-link
   * exchange until `loginExp`, on top of continuing to track until `exp`.
   */
  purpose?: CampaignTokenPurpose;
  /**
   * Epoch SECONDS. Present only when `purpose === 'login'`. Required by
   * `validateMagicLinkToken` (fail closed if absent) — governs the login
   * window (7d, D-02), independent of and shorter than `exp` (30d).
   */
  loginExp?: number;
}

/**
 * Input to sign a token. `exp` is optional — when omitted it defaults to
 * `now + 30 days` (D-04). `purpose`/`loginExp` are optional (Phase 180); when
 * `purpose` is omitted or `'tracking'`, the signed payload gains NO new
 * fields (byte-for-byte compatible with tokens already emitted pre-Phase 180).
 */
export interface SignCampaignTokenInput {
  userId: number;
  campaignId: number;
  sendId: number;
  exp?: number;
  /** Default `'tracking'` when omitted. */
  purpose?: CampaignTokenPurpose;
  /**
   * Epoch SECONDS. Only meaningful with `purpose: 'login'`. Defaults to
   * `now + CAMPAIGN_LOGIN_TTL_SECONDS` (7d, D-02). Explicit override exists
   * only to let tests simulate the passage of time — production callers
   * should never pass it.
   */
  loginExp?: number;
}

function getSecret(): string | null {
  return process.env.JWT_SECRET ?? null;
}

/**
 * Sign a campaign tracking token. Returns `base64url(payload).base64url(sig)`.
 * Throws when `JWT_SECRET` is not configured (signing is a server-side action
 * that should never silently produce an unverifiable token).
 */
export function signCampaignToken(input: SignCampaignTokenInput): string {
  const secret = getSecret();
  if (!secret) {
    throw new Error("JWT_SECRET is required for campaign token signing");
  }

  const exp =
    input.exp ?? Math.floor(Date.now() / 1000) + CAMPAIGN_TOKEN_TTL_SECONDS;

  const payload: CampaignTokenPayload = {
    userId: input.userId,
    campaignId: input.campaignId,
    sendId: input.sendId,
    exp,
  };

  // Phase 180 (D-01/D-02): ONLY when purpose is explicitly 'login' does the
  // payload gain new fields. Tracking payloads (purpose omitted or
  // 'tracking') stay byte-for-byte identical to pre-Phase-180 tokens.
  if (input.purpose === "login") {
    payload.purpose = "login";
    payload.loginExp =
      input.loginExp ??
      Math.floor(Date.now() / 1000) + CAMPAIGN_LOGIN_TTL_SECONDS;
  }

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  return `${payloadB64}.${signature}`;
}

/**
 * Validate a campaign tracking token. Returns the payload ONLY when the
 * signature matches AND the token has not expired (`exp > now`); otherwise
 * `null`. Never throws on malformed input.
 *
 * D-21 — for tracking (no `purpose`, or `purpose !== 'login'`) callers must
 * treat the returned payload as identification only, never as authorization.
 * This validator's semantics are UNCHANGED by Phase 180: it accepts tokens of
 * BOTH purposes and only ever checks `exp` (30d) — it never inspects
 * `purpose`/`loginExp`. Authorizing the magic-link exchange is the exclusive
 * job of `validateMagicLinkToken`.
 */
export function validateCampaignToken(
  token: string,
): CampaignTokenPayload | null {
  if (typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, providedSignature] = parts;

  const secret = getSecret();
  if (!secret) return null;

  const expectedSignature = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  // CR-03: constant-time compare to avoid a timing oracle on the HMAC. A plain
  // `!==` short-circuits on the first differing byte, leaking signature bytes to
  // an attacker who can submit many tracking requests. timingSafeEqual requires
  // equal-length buffers, so reject a length mismatch up front (also non-leaky).
  const providedBuf = Buffer.from(providedSignature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const parsed = JSON.parse(payloadStr) as Record<string, unknown>;

    if (
      typeof parsed.userId !== "number" ||
      typeof parsed.campaignId !== "number" ||
      typeof parsed.sendId !== "number" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    // D-04: reject expired tokens (exp is epoch seconds). This governs the
    // 30-day tracking window for BOTH purposes — a login token past `exp`
    // also stops tracking, but that's the outer bound; the 7d login window
    // is enforced separately by validateMagicLinkToken via `loginExp`.
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;

    const result: CampaignTokenPayload = {
      userId: parsed.userId,
      campaignId: parsed.campaignId,
      sendId: parsed.sendId,
      exp: parsed.exp,
    };

    // Phase 180: surface `purpose`/`loginExp` ONLY when present so
    // validateMagicLinkToken can reuse this signature+exp validation without
    // re-parsing the payload. Pre-Phase-180 / tracking-only tokens (no
    // `purpose` in the signed payload) keep the original 4-key shape exactly
    // (D-21 payload-shape test: no auth claims leak onto a tracking token).
    if (parsed.purpose === "login" || parsed.purpose === "tracking") {
      result.purpose = parsed.purpose;
    }
    if (typeof parsed.loginExp === "number") {
      result.loginExp = parsed.loginExp;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Validate a magic-link LOGIN token (Phase 180, D-01/D-02). Reuses
 * `validateCampaignToken`'s signature + `exp` (30d) check, and ADDITIONALLY
 * requires `purpose === 'login'` AND a numeric `loginExp` in the future (7d
 * window). Returns `null` for anything else — tracking-only tokens, tampered
 * signatures, expired `exp`, missing/past `loginExp`, or a hand-crafted
 * payload with `purpose: 'login'` but no `loginExp` (fail closed). Never
 * throws. Never log the token or a token prefix (T-180-04).
 *
 * T-180-01 — this is the ONLY function in this module that may authorize the
 * magic-link exchange (`POST /api/campaigns/exchange`). `/track/*` and
 * `/unsubscribe` must keep using `validateCampaignToken`, never this one.
 */
export function validateMagicLinkToken(
  token: string,
): CampaignTokenPayload | null {
  const payload = validateCampaignToken(token);
  if (!payload) return null;

  // Fail closed: only purpose === "login" with a numeric, still-future
  // loginExp authorizes the exchange. Anything else (tracking-only tokens,
  // or a hand-crafted purpose:'login' payload missing loginExp) returns null.
  const isLogin = payload.purpose === "login";
  if (!isLogin) return null;
  if (typeof payload.loginExp !== "number") return null;
  if (payload.loginExp <= Math.floor(Date.now() / 1000)) return null;

  return payload;
}
