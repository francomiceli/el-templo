/**
 * Phase 119 — RED scaffold: campaign funnel aggregation.
 *
 * Requirements covered (made GREEN by Wave 3/4):
 *   - D-18 funnel: enviado → abierto → click → reservó → asistió → convirtió,
 *     cruzando campaign_sends + campaign_events × bookings × attendance ×
 *     user_status_history (source='self_service', booked_at >= sent_at)
 *   - D-19 sección admin que muestra el funnel por campaña
 *
 * Placeholders (it.todo); the implementing wave replaces them with real
 * assertions against the per-worker MySQL test database via createTestApp().
 */
import { describe, it } from "vitest";

describe("campaign funnel (Phase 119)", () => {
  it.todo("D-18: enviado = count of campaign_sends with status='sent'");
  it.todo("D-18: abierto = COUNT(DISTINCT send_id) with an 'open' event");
  it.todo("D-18: click = COUNT(DISTINCT send_id) with a 'click' event");
  it.todo(
    "D-18: reservó = distinct users with a self_service is_trial booking",
  );
  it.todo("D-18: asistió = of those, with confirmed attendance");
  it.todo("D-18: convirtió = of those, later reaching status='activo'");
  it.todo("D-19: funnel endpoint returns the 6 stage counts per campaign");
});
