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
}
