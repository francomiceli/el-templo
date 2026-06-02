/**
 * Phase 119 — RED scaffold: campaign audience query.
 *
 * Requirements covered (made GREEN by Wave 3):
 *   - D-08 audience = freemium + no active/paused/scheduled sub + no
 *     non-cancelled is_trial booking + email IS NOT NULL + not unsubscribed
 *   - D-09 audience idempotency (UNIQUE(campaign_id, user_id) on sends)
 *   - D-10 freshness guard: created_at < NOW() - INTERVAL 3 DAY
 *
 * Placeholders (it.todo); the implementing wave replaces them with real
 * assertions against the per-worker MySQL test database via createTestApp()
 * and createEligibleFreemium().
 */
import { describe, it } from "vitest";

describe("campaign audience query (Phase 119)", () => {
  it.todo("D-08: includes an eligible freemium user with an email");
  it.todo("D-08: excludes users with an active/paused/scheduled subscription");
  it.todo("D-08: excludes users with a non-cancelled is_trial booking");
  it.todo("D-08: excludes users with a null email");
  it.todo("D-08: excludes unsubscribed emails (suppression list)");
  it.todo("D-10: excludes users created within the last 3 days");
  it.todo("D-09: send() is idempotent — re-running does not double-enroll");
});
