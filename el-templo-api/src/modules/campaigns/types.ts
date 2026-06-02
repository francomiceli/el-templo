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

/**
 * A freemium user eligible for the trial-session campaign (D-08/09/10).
 * Returned by `CampaignService.listEligible()`; carries only what the send
 * pipeline needs (the email snapshot + the user's branch for sede addressing).
 */
export interface EligibleUser {
  userId: number;
  email: string;
  branchId: number;
  /** ISO-2 country of the user's branch ('AR' | 'ES'), used for WhatsApp link. */
  country: string | null;
}

/**
 * Per-section copy the trial template consumes (D-12). User-supplied per the
 * UI-SPEC Copywriting Contract — the template defines structure, not copy.
 */
export interface CampaignCopySlots {
  headline: string;
  subheadline: string;
  body: string;
}

/**
 * Input to create a draft campaign (D-12). `heroImageUrl` must be an
 * eltemplo.org-hosted asset (D-27) — stored as-is, never fetched.
 */
export interface CreateCampaignInput {
  name: string;
  subject: string;
  /** Optional country scope ('AR' | 'ES'); null/undefined = global. */
  country?: "AR" | "ES" | null;
  /** Optional self-hosted hero image URL (D-27). */
  heroImageUrl?: string;
  /** Per-section copy for the template. */
  copySlots: CampaignCopySlots;
}

/** A persisted campaign row (the `campaigns` table shape). */
export interface CampaignRecord {
  id: number;
  name: string;
  subject: string;
  status: string;
  createdBy: number;
  country: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

/** A campaign in the admin list, augmented with its recipient count. */
export interface CampaignListItem extends CampaignRecord {
  recipientCount: number;
}

/** Result of a `CampaignService.send()` call. */
export interface SendResult {
  campaignId: number;
  /** Number of campaign_sends rows after this send (idempotent total). */
  recipientCount: number;
  /** Number of NEW recipients enrolled by this call. */
  newlyEnrolled: number;
}

/**
 * The 6-stage per-campaign funnel (D-18/D-19). `aperturaAproximada` flags that
 * the "abierto" stage under-counts (Apple Mail Privacy / images-off).
 */
export interface FunnelStages {
  enviado: number;
  abierto: number;
  click: number;
  reservo: number;
  asistio: number;
  convirtio: number;
  /** Always true — opens are inherently approximate (D-18). */
  aperturaAproximada: boolean;
}
