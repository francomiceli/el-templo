/**
 * Shared types for the campaigns module (Phase 119).
 */

/**
 * A physical branch row as rendered in the campaign email's "sedes" table.
 * Sourced from `branches.address` (D-24); canonical values live in
 * `el-templo-web/data/sedes.ts`.
 */
export interface BranchAddress {
  /** Branch display name, e.g. "Constitución". */
  name: string;
  /** Street address, e.g. "Av. Constitución 6745". */
  address: string;
  /** Optional Google Maps link rendered as a "Cómo llegar" text link. */
  mapsUrl?: string;
  /** Optional grouping label (city) when a send spans multiple countries. */
  city?: string;
}

/**
 * Merge variables for the trial-campaign email template.
 * Copy slots (headline/subheadline/body) are user-supplied per the UI-SPEC
 * Copywriting Contract; the template only defines structure, not final copy.
 */
export interface TrialCampaignVars {
  /** Offer headline, e.g. "Tu primera sesión es gratis". */
  headline: string;
  /** Sub-headline below the headline. */
  subheadline: string;
  /** Body copy (1–2 short paragraphs; supports plain text). */
  body: string;
  /** Open-tracking pixel URL (GET /api/campaigns/track/open?t=<token>). */
  trackingPixelUrl: string;
  /** Primary CTA URL (click-tracked redirect to the trial deep link). */
  ctaAppUrl: string;
  /** WhatsApp CTA URL (wa.me link, per-recipient country). */
  whatsappUrl: string;
  /** Active physical branches to list in the "Nuestras sedes" table. */
  sedes: BranchAddress[];
  /** Unsubscribe URL (GET /api/campaigns/unsubscribe?t=<token>). */
  unsubscribeUrl: string;
}
