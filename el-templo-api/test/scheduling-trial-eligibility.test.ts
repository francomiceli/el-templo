/**
 * Phase 119 — RED scaffold: trial eligibility endpoint.
 *
 * Requirements covered (made GREEN by Wave 2):
 *   - D-20 GET /api/members/scheduling/trial-eligibility exposes whether the
 *     caller can reserve a trial (because /me does NOT expose users.status).
 *
 * Returns { eligible, alreadyBooked, booking? }. Same predicate as the campaign
 * audience (D-08) minus the email/unsubscribe filters.
 *
 * Placeholders (it.todo); the implementing wave replaces them with real
 * assertions against the per-worker MySQL test database via createTestApp().
 */
import { describe, it } from "vitest";

describe("GET /api/members/scheduling/trial-eligibility (Phase 119)", () => {
  it.todo("D-20: eligible=true for a freemium user with no sub and no trial");
  it.todo("D-20: eligible=false for a user with an active subscription");
  it.todo(
    "D-20: alreadyBooked=true (+ booking payload) once a trial is booked",
  );
  it.todo("D-20: eligible=false for a non-freemium status");
});
