/**
 * Campaign tracking token (Phase 119, D-04 / D-21).
 *
 * Stateless HMAC-SHA256 signed token that identifies a single `campaign_sends`
 * row inside a tracking pixel / click redirect / unsubscribe URL. Mirrors the
 * structure of `src/modules/shared/qr-token.ts` (base64url(payload).sig).
 *
 * D-21 — the token NEVER authorizes. It only IDENTIFIES a sendId for tracking
 * and carries an expiry. The self-service trial reservation (Plan 03) ignores
 * this token entirely and revalidates eligibility from server-side state.
 *
 * D-04 — the token carries a 30-day expiry (`exp`, epoch seconds). Expired
 * tokens are rejected by `validateCampaignToken`.
 */

import { createHmac } from "crypto";

/** Default token lifetime: 30 days (D-04), expressed in seconds. */
export const CAMPAIGN_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface CampaignTokenPayload {
  userId: number;
  campaignId: number;
  sendId: number;
  /** Expiry as epoch SECONDS (Date.now()/1000 + ttl). */
  exp: number;
}

/**
 * Input to sign a token. `exp` is optional — when omitted it defaults to
 * `now + 30 days` (D-04).
 */
export interface SignCampaignTokenInput {
  userId: number;
  campaignId: number;
  sendId: number;
  exp?: number;
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
 * D-21 — callers must treat the returned payload as identification only, never
 * as authorization.
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

  // Constant-time-ish compare via length + value; signature mismatch → reject.
  if (providedSignature !== expectedSignature) return null;

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

    // D-04: reject expired tokens (exp is epoch seconds).
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;

    return {
      userId: parsed.userId,
      campaignId: parsed.campaignId,
      sendId: parsed.sendId,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
