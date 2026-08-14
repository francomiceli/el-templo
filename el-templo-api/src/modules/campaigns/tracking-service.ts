/**
 * CampaignTrackingService (Phase 119, D-15 / D-18).
 *
 * Append-only recording of email engagement events plus the marketing
 * suppression list. Mirrors the insert-event ethos of the userStatusHistory
 * writes (members/service.ts). Constructor DI (db, log) per Phase 56.
 *
 * D-18 — open/click events are forward-only inserts into `campaign_events`.
 * D-15 — unsubscribe inserts into `campaign_unsubscribes`, idempotent on the
 * UNIQUE(tenant_id, email) index so a duplicate call is a no-op (never an
 * error). These record methods are driven exclusively by the PUBLIC tracking
 * routes; the token that reaches them only IDENTIFIES a sendId (D-21) — it
 * never authorizes.
 *
 * T-175-02 — tenancy. The signed token carries `sendId` but NEVER
 * `tenantId` (see `token-service.ts`): the tenant is resolved server-side by
 * reading `campaign_sends` by that `sendId` (the row the send pipeline
 * stamped with `tenantValues(ctx, ...)` at enroll time, 175-01). That SELECT
 * by PK is a legitimate PRE-SCOPE — there is no actor/ctx possible on a
 * public, unauthenticated route — so it carries an embedded `tenant-safe`
 * exemption (same idiom as `auth/routes.ts` refresh-by-opaque-token, T-173-22:
 * the TS comment exempts the LINT, the embedded `sql` comment exempts the
 * SENTINEL). The `tenant_id` that comes back is what gets stamped on the
 * `campaign_events` / `campaign_unsubscribes` INSERT — never `ctx`, because
 * there isn't one. A token whose `sendId` no longer resolves (expired/rotated
 * data) is a silent no-op: a public tracking route must never throw.
 */

import type { MySql2Database } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { tenantValues } from "../shared/tenant";

/** The `campaign_sends` row resolved by `sendId`, pre-scope (T-175-02). */
interface ResolvedSend {
  tenantId: number;
  email: string;
  userId: number;
  campaignId: number;
}

export class CampaignTrackingService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Resolve the `campaign_sends` row for a `sendId` (T-175-02).
   *
   * This is the SINGLE place that reads `campaign_sends` by PK for the
   * public tracking routes — `recordOpen`/`recordClick`/`recordUnsubscribe`
   * all funnel through it so the tenant is derived exactly once per call,
   * the same way every time. Returns `null` when the id does not resolve
   * (token identifies a send that was deleted/never existed) — callers treat
   * that as a no-op, never a throw (D-21: a public route degrades silently).
   */
  async getSendEmail(sendId: number): Promise<ResolvedSend | null> {
    const [row] = await this.db
      .select({
        tenantId: schema.campaignSends.tenantId,
        email: schema.campaignSends.email,
        userId: schema.campaignSends.userId,
        campaignId: schema.campaignSends.campaignId,
      })
      .from(schema.campaignSends)
      .where(
        sql`/* tenant-safe: sendId del token firmado (D-21), resuelve el tenant antes de tener ctx — pre-scope, no hay actor en esta ruta publica (T-175-02) */ ${schema.campaignSends.id} = ${sendId}`,
      )
      .limit(1);
    return row ?? null;
  }

  /** Record an email-open event for a send (D-18). Tenant derived from the send (T-175-02). */
  async recordOpen(sendId: number): Promise<void> {
    const send = await this.getSendEmail(sendId);
    if (!send) return;
    await this.db
      .insert(schema.campaignEvents)
      .values(
        tenantValues({ tenantId: send.tenantId }, { sendId, type: "open" }),
      );
  }

  /**
   * Record a click event for a send (D-18). `destination` is the allowlisted
   * redirect target (never raw query input) — stored as forward-only
   * metadata. Tenant derived from the send (T-175-02).
   */
  async recordClick(sendId: number, destination?: string): Promise<void> {
    const send = await this.getSendEmail(sendId);
    if (!send) return;
    await this.db.insert(schema.campaignEvents).values(
      tenantValues(
        { tenantId: send.tenantId },
        {
          sendId,
          type: "click",
          metadata: destination ? destination.slice(0, 512) : null,
        },
      ),
    );
  }

  /**
   * Add an email to the marketing suppression list (D-15, closes mina M3).
   * Idempotent on the UNIQUE(tenant_id, email) index — a second unsubscribe
   * for the same (tenant, email) is a no-op. The tenant is derived from the
   * `campaign_sends` row for `sendId` (T-175-02) — an opt-out in tenant A can
   * therefore never suppress a send belonging to tenant B, even when both
   * share the same physical email address.
   */
  async recordUnsubscribe(sendId: number): Promise<void> {
    const send = await this.getSendEmail(sendId);
    if (!send) return;
    await this.db
      .insert(schema.campaignUnsubscribes)
      .values(
        tenantValues(
          { tenantId: send.tenantId },
          {
            email: send.email,
            userId: send.userId,
            campaignId: send.campaignId,
          },
        ),
      )
      .onDuplicateKeyUpdate({
        // No-op update preserves the original row (idempotent suppression).
        set: { email: sql`${schema.campaignUnsubscribes.email}` },
      });
    this.log.info(
      { campaignId: send.campaignId },
      "campaign unsubscribe recorded",
    );
  }
}
