/**
 * CampaignTrackingService (Phase 119, D-15 / D-18).
 *
 * Append-only recording of email engagement events plus the marketing
 * suppression list. Mirrors the insert-event ethos of the userStatusHistory
 * writes (members/service.ts). Constructor DI (db, log) per Phase 56.
 *
 * D-18 — open/click events are forward-only inserts into `campaign_events`.
 * D-15 — unsubscribe inserts into `campaign_unsubscribes`, idempotent on the
 * UNIQUE(email) index so a duplicate call is a no-op (never an error). These
 * record methods are driven exclusively by the PUBLIC tracking routes; the
 * token that reaches them only IDENTIFIES a sendId (D-21) — it never authorizes.
 */

import type { MySql2Database } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";

export class CampaignTrackingService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /** Record an email-open event for a send (D-18). */
  async recordOpen(sendId: number): Promise<void> {
    await this.db
      .insert(schema.campaignEvents)
      .values({ sendId, type: "open" });
  }

  /**
   * Record a click event for a send (D-18). `destination` is the allowlisted
   * redirect target (never raw query input) — stored as forward-only metadata.
   */
  async recordClick(sendId: number, destination?: string): Promise<void> {
    await this.db.insert(schema.campaignEvents).values({
      sendId,
      type: "click",
      metadata: destination ? destination.slice(0, 512) : null,
    });
  }

  /**
   * Add an email to the marketing suppression list (D-15). Idempotent on the
   * UNIQUE(email) index — a second unsubscribe for the same email is a no-op.
   * `userId` / `campaignId` are optional attribution metadata.
   */
  async recordUnsubscribe(
    email: string,
    opts: { userId?: number; campaignId?: number } = {},
  ): Promise<void> {
    await this.db
      .insert(schema.campaignUnsubscribes)
      .values({
        email,
        userId: opts.userId ?? null,
        campaignId: opts.campaignId ?? null,
      })
      .onDuplicateKeyUpdate({
        // No-op update preserves the original row (idempotent suppression).
        set: { email: sql`${schema.campaignUnsubscribes.email}` },
      });
    this.log.info(
      { campaignId: opts.campaignId },
      "campaign unsubscribe recorded",
    );
  }

  /**
   * Resolve the email snapshot for a send id (so unsubscribe can suppress the
   * exact address the campaign was delivered to). Returns null when the send
   * does not exist.
   */
  async getSendEmail(
    sendId: number,
  ): Promise<{ email: string; userId: number; campaignId: number } | null> {
    const [row] = await this.db
      .select({
        email: schema.campaignSends.email,
        userId: schema.campaignSends.userId,
        campaignId: schema.campaignSends.campaignId,
      })
      .from(schema.campaignSends)
      .where(sql`${schema.campaignSends.id} = ${sendId}`)
      .limit(1);
    return row ?? null;
  }
}
