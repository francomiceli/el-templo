/**
 * Phase 119 — RED scaffold: campaign send pipeline.
 *
 * Requirements covered (made GREEN by Wave 3):
 *   - D-12 reusable campaign send: create campaign_sends, render HTML, push to
 *     Resend (resend.batch.send, ≤100/req), record resend_message_id + status
 *
 * Resend is mocked (no live network). Send must be idempotent on the
 * UNIQUE(campaign_id, user_id) constraint.
 *
 * Placeholders (it.todo); the implementing wave replaces them with real
 * assertions against the per-worker MySQL test database via createTestApp(),
 * with the Resend client mocked.
 */
import { describe, it } from "vitest";

describe("campaign send pipeline (Phase 119)", () => {
  it.todo("D-12: send() creates one campaign_sends row per audience member");
  it.todo("D-12: send() records resend_message_id + status='sent' per row");
  it.todo("D-12: send() batches to Resend in chunks of ≤100");
  it.todo("D-12: send() is idempotent — second send does not duplicate sends");
  it.todo("D-12: send() degrades gracefully when RESEND_API_KEY is unset");
});
