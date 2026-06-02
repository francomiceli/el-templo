/**
 * Phase 119 — RED scaffold: self-service trial reservation.
 *
 * Requirements covered (made GREEN by Wave 2):
 *   - D-01 freemium reserva su sesión de prueba self-service
 *   - D-03 sin afordance de cancelar (una sola sesión de prueba)
 *   - D-05 ventana de reserva extendida a 30 días para trials
 *   - D-21 el token NUNCA autoriza — el endpoint revalida estado server-side
 *
 * POST /api/members/scheduling/reserve-trial promotes freemium→prueba and
 * inserts a is_trial booking with source='self_service' in one transaction.
 *
 * These are placeholders (it.todo) so the harness is Nyquist-valid for
 * downstream waves; the implementing wave replaces them with real assertions
 * against the per-worker MySQL test database via createTestApp().
 */
import { describe, it } from "vitest";

describe("POST /api/members/scheduling/reserve-trial (Phase 119)", () => {
  it.todo("D-01: a freemium user reserves a self-service trial (201)");
  it.todo("D-01: promotes the user freemium→prueba inside one transaction");
  it.todo(
    "D-01: writes a is_trial booking with source='self_service' (D-18 attribution)",
  );
  it.todo("D-03: rejects a second trial for a user who already booked one");
  it.todo("D-05: allows a trial date up to 30 days ahead (vs +2 for /reserve)");
  it.todo(
    "D-21: ignores any campaign token — revalidates eligibility server-side",
  );
  it.todo("D-21: rejects reservation against a virtual branch");
});
