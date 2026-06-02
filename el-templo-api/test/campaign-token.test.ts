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
import {
  signCampaignToken,
  validateCampaignToken,
  CAMPAIGN_TOKEN_TTL_SECONDS,
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
