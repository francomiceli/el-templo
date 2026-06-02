/**
 * Phase 119 — RED scaffold: campaign HMAC token (unit).
 *
 * Requirements covered (made GREEN by Wave 2/3):
 *   - D-04 token carries a 30-day expiry (exp)
 *   - D-21 the token NEVER authorizes — it only identifies a sendId for
 *     tracking and carries exp; reserve-trial revalidates state server-side
 *
 * Pure unit test of sign/validate (HMAC-SHA256 + base64url, JWT_SECRET),
 * mirroring src/modules/shared/qr-token.ts. No DB.
 *
 * Placeholders (it.todo); the implementing wave replaces them with real
 * assertions once src/modules/campaigns/token-service.ts lands.
 */
import { describe, it } from "vitest";

describe("campaign token sign/validate (Phase 119)", () => {
  it.todo("D-04: validate() accepts a freshly signed, non-expired token");
  it.todo("D-04: validate() rejects an expired token (exp in the past)");
  it.todo("D-21: validate() rejects a tampered payload (signature mismatch)");
  it.todo("D-21: payload exposes sendId/userId/campaignId but grants no auth");
});
