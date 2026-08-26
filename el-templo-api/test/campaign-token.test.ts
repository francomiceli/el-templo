/**
 * Phase 119 — campaign HMAC token (unit). D-04 / D-21.
 *
 * Pure unit test of sign/validate (HMAC-SHA256 + base64url, JWT_SECRET),
 * mirroring src/modules/shared/qr-token.ts. No DB.
 *   - D-04 token carries a 30-day expiry (exp) and expired tokens are rejected
 *   - D-21 the token NEVER authorizes — it only identifies a sendId for
 *     tracking and carries exp; reserve-trial revalidates state server-side
 */
import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  signCampaignToken,
  validateCampaignToken,
  validateMagicLinkToken,
  CAMPAIGN_TOKEN_TTL_SECONDS,
  CAMPAIGN_LOGIN_TTL_SECONDS,
} from "../src/modules/campaigns/token-service";

describe("campaign token sign/validate (Phase 119)", () => {
  it("D-04: validate() accepts a freshly signed, non-expired token", () => {
    const token = signCampaignToken({
      userId: 7,
      campaignId: 3,
      sendId: 42,
    });
    const payload = validateCampaignToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe(7);
    expect(payload?.campaignId).toBe(3);
    expect(payload?.sendId).toBe(42);
  });

  it("D-04: a freshly signed token carries a ~30-day expiry", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signCampaignToken({ userId: 1, campaignId: 1, sendId: 1 });
    const payload = validateCampaignToken(token);
    expect(payload).not.toBeNull();
    const expectedExp = before + CAMPAIGN_TOKEN_TTL_SECONDS;
    // Allow a few seconds of slack for clock/exec time.
    expect(payload!.exp).toBeGreaterThanOrEqual(expectedExp - 5);
    expect(payload!.exp).toBeLessThanOrEqual(expectedExp + 5);
  });

  it("D-04: validate() rejects an expired token (exp in the past)", () => {
    const token = signCampaignToken({
      userId: 1,
      campaignId: 1,
      sendId: 1,
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    expect(validateCampaignToken(token)).toBeNull();
  });

  it("D-21: validate() rejects a tampered payload (signature mismatch)", () => {
    const token = signCampaignToken({ userId: 1, campaignId: 1, sendId: 1 });
    const [, sig] = token.split(".");
    // Re-encode a different payload but keep the original signature.
    const forgedPayload = Buffer.from(
      JSON.stringify({
        userId: 999,
        campaignId: 999,
        sendId: 999,
        exp: Math.floor(Date.now() / 1000) + 1000,
      }),
    ).toString("base64url");
    expect(validateCampaignToken(`${forgedPayload}.${sig}`)).toBeNull();
  });

  it("D-21: malformed tokens return null (never throw)", () => {
    expect(validateCampaignToken("")).toBeNull();
    expect(validateCampaignToken("garbage")).toBeNull();
    expect(validateCampaignToken("a.b.c")).toBeNull();
    expect(validateCampaignToken("notbase64.sig")).toBeNull();
  });

  it("D-21: payload exposes sendId/userId/campaignId but no auth claims", () => {
    const token = signCampaignToken({ userId: 5, campaignId: 8, sendId: 13 });
    const payload = validateCampaignToken(token);
    expect(payload).not.toBeNull();
    // The payload carries identity + exp ONLY — no role / scope / auth field.
    expect(Object.keys(payload as object).sort()).toEqual([
      "campaignId",
      "exp",
      "sendId",
      "userId",
    ]);
  });
});

describe("magic link (D-01/D-02)", () => {
  it("purpose:'login' freshly signed: both validators accept it", () => {
    const token = signCampaignToken({
      userId: 7,
      campaignId: 3,
      sendId: 42,
      purpose: "login",
    });

    const trackingPayload = validateCampaignToken(token);
    expect(trackingPayload).not.toBeNull();
    expect(trackingPayload?.userId).toBe(7);

    const loginPayload = validateMagicLinkToken(token);
    expect(loginPayload).not.toBeNull();
    expect(loginPayload?.userId).toBe(7);
    expect(loginPayload?.sendId).toBe(42);
  });

  it("purpose:'login' freshly signed carries a ~7-day loginExp (D-02, not 30d)", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signCampaignToken({
      userId: 1,
      campaignId: 1,
      sendId: 1,
      purpose: "login",
    });
    const payload = validateCampaignToken(token);
    expect(payload).not.toBeNull();
    const expectedLoginExp = before + CAMPAIGN_LOGIN_TTL_SECONDS;
    // Allow a few seconds of slack for clock/exec time.
    expect(payload!.loginExp).toBeGreaterThanOrEqual(expectedLoginExp - 5);
    expect(payload!.loginExp).toBeLessThanOrEqual(expectedLoginExp + 5);
    // loginExp (7d) must be strictly shorter than exp (30d) on the same token.
    expect(payload!.loginExp).toBeLessThan(payload!.exp);
  });

  it("day 8 (loginExp vencido, exp vigente): tracking sigue OK, magic link ya no", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signCampaignToken({
      userId: 9,
      campaignId: 2,
      sendId: 55,
      purpose: "login",
      loginExp: now - 60, // vencido hace 1 minuto
      // exp por defecto sigue siendo now + 30d (vigente)
    });

    const trackingPayload = validateCampaignToken(token);
    expect(trackingPayload).not.toBeNull();
    expect(trackingPayload?.sendId).toBe(55);

    expect(validateMagicLinkToken(token)).toBeNull();
  });

  it("token de tracking (sin purpose): nunca se puede canjear por sesión", () => {
    const token = signCampaignToken({ userId: 1, campaignId: 1, sendId: 1 });
    expect(validateCampaignToken(token)).not.toBeNull();
    expect(validateMagicLinkToken(token)).toBeNull();
  });

  it("firma alterada en 1 byte: ambos validadores rechazan", () => {
    const token = signCampaignToken({
      userId: 1,
      campaignId: 1,
      sendId: 1,
      purpose: "login",
    });
    const [payloadB64, sig] = token.split(".");
    // Flip the last character of the signature (still valid base64url charset).
    const lastChar = sig.at(-1);
    const flippedChar = lastChar === "A" ? "B" : "A";
    const tamperedSig = sig.slice(0, -1) + flippedChar;
    const tamperedToken = `${payloadB64}.${tamperedSig}`;

    expect(validateCampaignToken(tamperedToken)).toBeNull();
    expect(validateMagicLinkToken(tamperedToken)).toBeNull();
  });

  it("purpose:'login' sin loginExp (payload manipulado a mano): magic link null (fail closed)", () => {
    const secret = process.env.JWT_SECRET as string;
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      userId: 3,
      campaignId: 4,
      sendId: 5,
      exp: now + CAMPAIGN_TOKEN_TTL_SECONDS,
      purpose: "login",
      // loginExp deliberately omitted — simulates a hand-crafted payload.
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );
    const signature = createHmac("sha256", secret)
      .update(payloadB64)
      .digest("base64url");
    const handCraftedToken = `${payloadB64}.${signature}`;

    // Tracking validation still accepts it (only exp matters there).
    expect(validateCampaignToken(handCraftedToken)).not.toBeNull();
    // But the magic-link validator fails closed — loginExp is required.
    expect(validateMagicLinkToken(handCraftedToken)).toBeNull();
  });

  it("malformed tokens return null for validateMagicLinkToken (never throw)", () => {
    expect(validateMagicLinkToken("")).toBeNull();
    expect(validateMagicLinkToken("garbage")).toBeNull();
    expect(validateMagicLinkToken("a.b.c")).toBeNull();
    expect(validateMagicLinkToken("notbase64.sig")).toBeNull();
  });
});
