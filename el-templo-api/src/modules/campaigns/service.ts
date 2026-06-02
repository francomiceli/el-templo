/**
 * CampaignService (Phase 119, D-12) — the reusable email-campaign facade.
 *
 * Orchestrates the campaign lifecycle over the Plan 01 schema and the Plan 02
 * email infrastructure:
 *   - listEligible()  — audience query (D-08/09/10)
 *   - create()        — persist a draft campaign (D-12)
 *   - listCampaigns() — admin list with recipient counts (D-19)
 *   - send()          — enroll audience, render HTML, batch-send (D-11/D-12)
 *   - funnel()        — per-campaign 6-stage funnel (D-18/D-19)
 *
 * Facade convention (admin/edit-service.ts): `constructor(db, log, ...deps)`.
 * Pitfall 3 — this module NEVER instantiates Resend; it delegates batching to
 * `EmailService.sendCampaignBatch` (Plan 02).
 */

import type { MySql2Database } from "drizzle-orm/mysql2";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError } from "../shared/errors";
import { EmailService } from "../email/service";
import { signCampaignToken } from "./token-service";
import { trialCampaignHtml } from "./templates";
import type { BranchAddress, TrialCampaignVars } from "./types";
import type {
  CampaignListItem,
  CampaignRecord,
  CreateCampaignInput,
  EligibleUser,
  FunnelStages,
  SendResult,
} from "./types";

/** Resend hard limit: ≤100 messages per batch request. */
const BATCH_SIZE = 100;

/** The web-app host the click redirect targets (D-25, anti open-redirect). */
const TRIAL_DEEP_LINK_BASE = "https://app.eltemplo.org/r/trial";

/** Public API base for the tracking endpoints (open/click/unsubscribe). */
const TRACKING_API_BASE =
  process.env.PUBLIC_API_BASE_URL ?? "https://api.eltemplo.org";

export class CampaignService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private email: EmailService,
  ) {}

  /**
   * Audience query (D-08/09/10). Returns freemium users that:
   *   - have status='freemium'
   *   - have a non-null email
   *   - registered more than 3 days ago (D-10 freshness guard)
   *   - have NO active/paused/scheduled subscription
   *   - have NO non-cancelled is_trial booking (already used / pending a trial)
   *   - are NOT on the marketing suppression list (by email, D-15)
   *
   * Ghosts / inactives are intentionally included — there is no activity filter
   * (D-09). An optional country scope filters by the user's branch country.
   */
  async listEligible(country?: "AR" | "ES" | null): Promise<EligibleUser[]> {
    const u = schema.users;
    const s = schema.subscriptions;
    const b = schema.bookings;
    const unsub = schema.campaignUnsubscribes;
    const br = schema.branches;

    const conditions = [
      eq(u.status, "freemium"),
      sql`${u.email} IS NOT NULL`,
      // D-10: registered strictly more than 3 days ago.
      sql`${u.createdAt} < (NOW() - INTERVAL 3 DAY)`,
      // No active/paused/scheduled subscription.
      sql`NOT EXISTS (
        SELECT 1 FROM ${s}
        WHERE ${s.userId} = ${u.id}
          AND ${s.status} IN ('active', 'paused', 'scheduled')
      )`,
      // No non-cancelled is_trial booking (already used or pending a trial).
      sql`NOT EXISTS (
        SELECT 1 FROM ${b}
        WHERE ${b.memberId} = ${u.id}
          AND ${b.isTrial} = TRUE
          AND ${b.status} <> 'cancelado'
      )`,
      // Not on the marketing suppression list (D-15).
      sql`NOT EXISTS (
        SELECT 1 FROM ${unsub}
        WHERE ${unsub.email} = ${u.email}
      )`,
    ];

    if (country === "AR" || country === "ES") {
      conditions.push(eq(br.country, country));
    }

    const rows = await this.db
      .select({
        userId: u.id,
        email: u.email,
        branchId: u.branchId,
        country: br.country,
      })
      .from(u)
      .innerJoin(br, eq(br.id, u.branchId))
      .where(and(...conditions));

    // email IS NOT NULL is enforced in SQL; narrow the nullable column here.
    return rows
      .filter((r): r is typeof r & { email: string } => r.email !== null)
      .map((r) => ({
        userId: r.userId,
        email: r.email,
        branchId: r.branchId,
        country: r.country,
      }));
  }

  /**
   * Create a draft campaign (D-12). Validates name + subject non-empty, then
   * INSERTs a row in 'draft' status scoped to `country` (null = global). The
   * `heroImageUrl` + `copySlots` are template inputs carried at send time; the
   * hero URL must already be an eltemplo.org-hosted asset (D-27) — stored as a
   * string, never fetched.
   */
  async create(
    input: CreateCampaignInput,
    adminUserId: number,
  ): Promise<CampaignRecord> {
    const name = input.name?.trim();
    const subject = input.subject?.trim();

    if (!name)
      throw new BadRequestError("El nombre de la campaña es requerido");
    if (!subject) throw new BadRequestError("El asunto es requerido");

    const country =
      input.country === "AR" || input.country === "ES" ? input.country : null;

    const [inserted] = await this.db
      .insert(schema.campaigns)
      .values({
        name,
        subject,
        status: "draft",
        createdBy: adminUserId,
        country,
      })
      .$returningId();

    const [row] = await this.db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, inserted.id))
      .limit(1);

    this.log.info({ campaignId: row.id, country }, "campaign created (draft)");

    return this.toRecord(row);
  }

  /**
   * List campaigns newest-first, each with a `recipientCount` (D-19). An
   * optional country scope restricts the list for non-owner admins (NULL-scoped
   * global campaigns are always visible).
   */
  async listCampaigns(
    country?: "AR" | "ES" | null,
  ): Promise<CampaignListItem[]> {
    const c = schema.campaigns;

    const where =
      country === "AR" || country === "ES"
        ? sql`(${c.country} = ${country} OR ${c.country} IS NULL)`
        : undefined;

    const rows = await this.db
      .select({
        id: c.id,
        name: c.name,
        subject: c.subject,
        status: c.status,
        createdBy: c.createdBy,
        country: c.country,
        createdAt: c.createdAt,
        sentAt: c.sentAt,
        recipientCount: sql<number>`(
          SELECT COUNT(*) FROM ${schema.campaignSends}
          WHERE ${schema.campaignSends.campaignId} = ${c.id}
        )`,
      })
      .from(c)
      .where(where)
      .orderBy(desc(c.createdAt));

    return rows.map((r) => ({
      ...this.toRecord(r),
      recipientCount: Number(r.recipientCount),
    }));
  }

  /**
   * Send a campaign (D-11/D-12). Idempotent + degrades silently:
   *   1. Resolve the eligible audience (listEligible, scoped to the campaign).
   *   2. INSERT one campaign_sends row per user — UNIQUE(campaign_id, user_id)
   *      makes re-running converge (no duplicate enrollment).
   *   3. For each PENDING send: sign a per-send token, render the trial HTML
   *      with that send's tracking URLs + sede addresses, chunk ≤100, and call
   *      EmailService.sendCampaignBatch with an idempotencyKey.
   *   4. Mark sends 'sent' + set the campaign status 'sent' + sent_at.
   *
   * When RESEND_API_KEY is unset the batch call no-ops (Plan 02 guard) — send
   * still records the audience without crashing.
   */
  async send(campaignId: number): Promise<SendResult> {
    const [campaign] = await this.db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1);

    if (!campaign) throw new BadRequestError("Campaña no encontrada");

    const scopeCountry =
      campaign.country === "AR" || campaign.country === "ES"
        ? campaign.country
        : null;

    const eligible = await this.listEligible(scopeCountry);

    // ── Enroll audience idempotently ──────────────────────────────────────
    let newlyEnrolled = 0;
    for (const user of eligible) {
      const result = await this.db
        .insert(schema.campaignSends)
        .values({
          campaignId,
          userId: user.userId,
          email: user.email,
          status: "pending",
        })
        .onDuplicateKeyUpdate({
          // No-op update so the existing row's id is preserved (idempotent).
          set: { email: sql`${schema.campaignSends.email}` },
        });
      // affectedRows: 1 = inserted, 2 = updated (existing) under ON DUPLICATE.
      const affected = (result as unknown as { affectedRows?: number })
        .affectedRows;
      if (affected === 1) newlyEnrolled += 1;
    }

    // ── Load the PENDING sends (skip already-sent rows on re-run) ──────────
    const pendingSends = await this.db
      .select({
        id: schema.campaignSends.id,
        userId: schema.campaignSends.userId,
        email: schema.campaignSends.email,
      })
      .from(schema.campaignSends)
      .where(
        and(
          eq(schema.campaignSends.campaignId, campaignId),
          eq(schema.campaignSends.status, "pending"),
        ),
      );

    // Sede addresses for the email (shared across all recipients in scope).
    const sedes = await this.loadSedes(scopeCountry);

    // ── Render + batch-send in chunks of ≤100 ─────────────────────────────
    for (let i = 0; i < pendingSends.length; i += BATCH_SIZE) {
      const chunk = pendingSends.slice(i, i + BATCH_SIZE);

      const messages: { to: string; subject: string; html: string }[] = [];
      for (const send of chunk) {
        const token = signCampaignToken({
          userId: send.userId,
          campaignId,
          sendId: send.id,
        });
        const vars = this.buildTemplateVars(campaign, token, sedes);
        const html = await trialCampaignHtml(vars);
        messages.push({ to: send.email, subject: campaign.subject, html });
      }

      await this.email.sendCampaignBatch(
        messages,
        `campaign-${campaignId}-batch-${i / BATCH_SIZE}`,
      );

      // Mark this chunk's sends as 'sent'.
      const chunkIds = chunk.map((s) => s.id);
      if (chunkIds.length > 0) {
        await this.db
          .update(schema.campaignSends)
          .set({ status: "sent", sentAt: new Date() })
          .where(
            sql`${schema.campaignSends.id} IN (${sql.join(
              chunkIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          );
      }
    }

    // ── Mark the campaign sent ────────────────────────────────────────────
    await this.db
      .update(schema.campaigns)
      .set({ status: "sent", sentAt: campaign.sentAt ?? new Date() })
      .where(eq(schema.campaigns.id, campaignId));

    const [{ total }] = await this.db
      .select({
        total: sql<number>`COUNT(*)`,
      })
      .from(schema.campaignSends)
      .where(eq(schema.campaignSends.campaignId, campaignId));

    this.log.info(
      { campaignId, recipientCount: Number(total), newlyEnrolled },
      "campaign send complete",
    );

    return {
      campaignId,
      recipientCount: Number(total),
      newlyEnrolled,
    };
  }

  /**
   * Per-campaign 6-stage funnel (D-18/D-19), crossing campaign_sends +
   * campaign_events × bookings × attendance × user_status_history:
   *   - enviado   = sends with status='sent'
   *   - abierto   = DISTINCT send_id with an 'open' event (approximate, D-18)
   *   - click     = DISTINCT send_id with a 'click' event
   *   - reservó   = DISTINCT recipients with a self_service is_trial booking
   *                 booked at/after the campaign's sent_at
   *   - asistió   = of those, with a confirmed attendance row
   *   - convirtió = of those, later reaching status='activo' in
   *                 user_status_history (aligns with funnel-service.ts — A6)
   */
  async funnel(campaignId: number): Promise<FunnelStages> {
    const [campaign] = await this.db
      .select({ id: schema.campaigns.id, sentAt: schema.campaigns.sentAt })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.id, campaignId))
      .limit(1);

    if (!campaign) throw new BadRequestError("Campaña no encontrada");

    // sent_at anchors the booking attribution window; if the campaign was never
    // sent, no post-send conversions can be attributed (use epoch as a floor).
    const sentAtSql = campaign.sentAt
      ? sql`${campaign.sentAt}`
      : sql`'1970-01-01 00:00:00'`;

    const [enviadoRow] = await this.db
      .select({ n: sql<number>`COUNT(*)` })
      .from(schema.campaignSends)
      .where(
        and(
          eq(schema.campaignSends.campaignId, campaignId),
          eq(schema.campaignSends.status, "sent"),
        ),
      );

    const [abiertoRow] = await this.db
      .select({
        n: sql<number>`COUNT(DISTINCT ${schema.campaignEvents.sendId})`,
      })
      .from(schema.campaignEvents)
      .innerJoin(
        schema.campaignSends,
        eq(schema.campaignSends.id, schema.campaignEvents.sendId),
      )
      .where(
        and(
          eq(schema.campaignSends.campaignId, campaignId),
          eq(schema.campaignEvents.type, "open"),
        ),
      );

    const [clickRow] = await this.db
      .select({
        n: sql<number>`COUNT(DISTINCT ${schema.campaignEvents.sendId})`,
      })
      .from(schema.campaignEvents)
      .innerJoin(
        schema.campaignSends,
        eq(schema.campaignSends.id, schema.campaignEvents.sendId),
      )
      .where(
        and(
          eq(schema.campaignSends.campaignId, campaignId),
          eq(schema.campaignEvents.type, "click"),
        ),
      );

    // reservó: DISTINCT recipients of this campaign with a self_service is_trial
    // booking placed at/after the campaign's sent_at.
    const [reservoRow] = await this.db
      .select({
        n: sql<number>`COUNT(DISTINCT ${schema.campaignSends.userId})`,
      })
      .from(schema.campaignSends)
      .innerJoin(
        schema.bookings,
        eq(schema.bookings.memberId, schema.campaignSends.userId),
      )
      .where(
        and(
          eq(schema.campaignSends.campaignId, campaignId),
          eq(schema.bookings.isTrial, true),
          eq(schema.bookings.source, "self_service"),
          sql`${schema.bookings.status} <> 'cancelado'`,
          sql`${schema.bookings.bookedAt} >= ${sentAtSql}`,
        ),
      );

    // asistió: of those reservó recipients, with a confirmed attendance row.
    const [asistioRow] = await this.db
      .select({
        n: sql<number>`COUNT(DISTINCT ${schema.campaignSends.userId})`,
      })
      .from(schema.campaignSends)
      .innerJoin(
        schema.bookings,
        and(
          eq(schema.bookings.memberId, schema.campaignSends.userId),
          eq(schema.bookings.isTrial, true),
          eq(schema.bookings.source, "self_service"),
          sql`${schema.bookings.bookedAt} >= ${sentAtSql}`,
        ),
      )
      .innerJoin(
        schema.attendance,
        and(
          eq(schema.attendance.memberId, schema.campaignSends.userId),
          eq(schema.attendance.status, "confirmado"),
        ),
      )
      .where(eq(schema.campaignSends.campaignId, campaignId));

    // convirtió: of those recipients, later reaching status='activo' in
    // user_status_history after the campaign send (aligns with funnel-service —
    // A6: do NOT invent a new "activo" definition).
    const [convirtioRow] = await this.db
      .select({
        n: sql<number>`COUNT(DISTINCT ${schema.campaignSends.userId})`,
      })
      .from(schema.campaignSends)
      .innerJoin(
        schema.bookings,
        and(
          eq(schema.bookings.memberId, schema.campaignSends.userId),
          eq(schema.bookings.isTrial, true),
          eq(schema.bookings.source, "self_service"),
          sql`${schema.bookings.bookedAt} >= ${sentAtSql}`,
        ),
      )
      .innerJoin(
        schema.userStatusHistory,
        and(
          eq(schema.userStatusHistory.userId, schema.campaignSends.userId),
          eq(schema.userStatusHistory.toStatus, "activo"),
          sql`${schema.userStatusHistory.changedAt} >= ${sentAtSql}`,
        ),
      )
      .where(eq(schema.campaignSends.campaignId, campaignId));

    return {
      enviado: Number(enviadoRow?.n ?? 0),
      abierto: Number(abiertoRow?.n ?? 0),
      click: Number(clickRow?.n ?? 0),
      reservo: Number(reservoRow?.n ?? 0),
      asistio: Number(asistioRow?.n ?? 0),
      convirtio: Number(convirtioRow?.n ?? 0),
      aperturaAproximada: true,
    };
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  /** Map a raw `campaigns` row to the public CampaignRecord shape. */
  private toRecord(row: {
    id: number;
    name: string;
    subject: string;
    status: string;
    createdBy: number;
    country: string | null;
    createdAt: Date;
    sentAt: Date | null;
  }): CampaignRecord {
    return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      status: row.status,
      createdBy: row.createdBy,
      country: row.country,
      createdAt: row.createdAt,
      sentAt: row.sentAt,
    };
  }

  /** Load active physical (non-virtual) sedes with an address, scoped by country. */
  private async loadSedes(
    country?: "AR" | "ES" | null,
  ): Promise<BranchAddress[]> {
    const br = schema.branches;
    const conditions = [
      eq(br.isActive, true),
      eq(br.isVirtual, false),
      sql`${br.address} IS NOT NULL`,
    ];
    if (country === "AR" || country === "ES") {
      conditions.push(eq(br.country, country));
    }

    const rows = await this.db
      .select({ name: br.name, address: br.address })
      .from(br)
      .where(and(...conditions));

    return rows
      .filter((r): r is { name: string; address: string } => r.address !== null)
      .map((r) => ({ name: r.name, address: r.address }));
  }

  /** Build the template merge vars for one recipient's tracking token. */
  private buildTemplateVars(
    campaign: { id: number; subject: string },
    token: string,
    sedes: BranchAddress[],
  ): TrialCampaignVars {
    const encoded = encodeURIComponent(token);
    return {
      headline: campaign.subject,
      subheadline: "",
      body: "",
      trackingPixelUrl: `${TRACKING_API_BASE}/api/campaigns/track/open?t=${encoded}`,
      // Click is tracked server-side; the redirect target is derived from an
      // allowlist (app.eltemplo.org), never echoed from query input (D-25).
      ctaAppUrl: `${TRACKING_API_BASE}/api/campaigns/track/click?t=${encoded}`,
      whatsappUrl: "https://wa.me/5492234567890",
      sedes,
      unsubscribeUrl: `${TRACKING_API_BASE}/api/campaigns/unsubscribe?t=${encoded}`,
    };
  }

  /** The allowlisted deep-link the click redirect resolves to (D-25). */
  static trialDeepLink(token: string): string {
    return `${TRIAL_DEEP_LINK_BASE}?t=${encodeURIComponent(token)}`;
  }
}
