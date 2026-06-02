/**
 * Phase 119 — RED scaffold: open/click/unsubscribe tracking.
 *
 * Requirements covered (made GREEN by Wave 3):
 *   - D-15 unsubscribe (público, solo marketing) → campaign_unsubscribes,
 *     idempotente por UNIQUE(email)
 *   - D-18 tracking de aperturas/clicks → campaign_events (forward-only)
 *
 * Public endpoints: GET /track/open (1x1 GIF), GET /track/click (302 to an
 * allowlisted destination), GET /unsubscribe. The token only identifies sendId
 * (D-21) — it never authorizes.
 *
 * Placeholders (it.todo); the implementing wave replaces them with real
 * assertions against the per-worker MySQL test database via createTestApp().
 */
import { describe, it } from "vitest";

describe("campaign tracking endpoints (Phase 119)", () => {
  it.todo("D-18: GET /track/open inserts a campaign_events 'open' row + GIF");
  it.todo(
    "D-18: GET /track/click inserts a 'click' row + 302 to allowlisted url",
  );
  it.todo(
    "D-18: /track/click rejects an off-allowlist destination (open-redirect)",
  );
  it.todo("D-15: GET /unsubscribe inserts a campaign_unsubscribes row");
  it.todo(
    "D-15: unsubscribe is idempotent (UNIQUE(email) — second call no-op)",
  );
});
