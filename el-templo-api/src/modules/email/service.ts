/**
 * Email Service
 *
 * Transactional email sending using Resend.
 * Gracefully degrades when RESEND_API_KEY is not configured.
 * Follows existing project pattern (see franchise/service.ts, gladius/service.ts).
 */

import { Resend } from "resend";
import type { FastifyBaseLogger } from "fastify";
import { passwordSetEmailHtml, PASSWORD_SET_SUBJECT } from "./templates";

const EMAIL_FROM = "El Templo <noreply@eltemplo.org>";

/**
 * Sender address for marketing campaign emails (D-17).
 * Uses a dedicated sending subdomain so campaign deliverability is isolated
 * from transactional mail. Falls back to the transactional `from` when the
 * env var is not yet configured (the prod subdomain is set up in Plan 07).
 */
const CAMPAIGN_FROM = process.env.CAMPAIGN_EMAIL_FROM || EMAIL_FROM;

export class EmailService {
  constructor(private log: FastifyBaseLogger) {}

  /**
   * Send password-set email to a newly created member.
   * Skips silently if RESEND_API_KEY is not configured (dev environments).
   */
  async sendPasswordSetEmail(
    to: string,
    firstName: string,
    tempPassword: string,
  ): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      this.log.info(
        "RESEND_API_KEY not configured, skipping password-set email",
      );
      return;
    }

    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: PASSWORD_SET_SUBJECT,
      html: passwordSetEmailHtml(firstName, tempPassword),
    });

    this.log.info({ to }, "Password-set email sent");
  }

  /**
   * Send a batch of campaign emails via Resend's batch API (D-12).
   *
   * Each message is sent from the campaign sending subdomain (CAMPAIGN_FROM).
   * The `idempotencyKey` guards against duplicate sends on retry — Resend
   * de-duplicates batch requests carrying the same key (T-119-02-01).
   *
   * Skips silently when RESEND_API_KEY is not configured (dev / pre-Plan-07),
   * mirroring the transactional degradation guard so no accidental sends happen
   * locally.
   *
   * Resend constraints: ≤100 messages per batch request. Callers (Wave 4
   * CampaignService) are responsible for chunking the audience into batches.
   */
  async sendCampaignBatch(
    messages: { to: string; subject: string; html: string }[],
    idempotencyKey: string,
  ): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      this.log.info("RESEND_API_KEY not configured, skipping campaign batch");
      return;
    }

    if (messages.length === 0) {
      this.log.info("sendCampaignBatch called with no messages, skipping");
      return;
    }

    const resend = new Resend(apiKey);

    try {
      await resend.batch.send(
        messages.map((m) => ({ from: CAMPAIGN_FROM, ...m })),
        { idempotencyKey },
      );
      this.log.info(
        { count: messages.length, idempotencyKey },
        "Campaign batch sent",
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(
        { err: message, idempotencyKey },
        "Campaign batch send failed",
      );
      throw err;
    }
  }

  /** The configured campaign sender address (shown in the admin preview UI). */
  campaignSender(): string {
    return CAMPAIGN_FROM;
  }

  /**
   * Send a single PREVIEW/test email. Unlike sendCampaignBatch (which is part of
   * an irreversible mass send), this is meant for "send me a test first":
   *   - it throws when RESEND_API_KEY is unset (a silent no-op would make the
   *     admin think the test was delivered), and
   *   - it inspects Resend's `{ error }` response and throws on it, so a sandbox
   *     rejection ("you can only send to your own address") surfaces to the UI
   *     instead of being swallowed.
   */
  async sendCampaignTest(message: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "El servicio de email no está configurado (RESEND_API_KEY)",
      );
    }

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: CAMPAIGN_FROM,
      ...message,
    });
    if (error) {
      throw new Error(error.message || "Resend rechazó el envío de prueba");
    }
    this.log.info({ to: message.to }, "Campaign test email sent");
  }
}
