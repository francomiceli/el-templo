/**
 * Campaign types (Phase 119 — reusable email-campaign system).
 * Mirror the API shapes from el-templo-api/src/modules/campaigns/types.ts
 * (CampaignRecord / CampaignListItem / FunnelStages / CreateCampaignInput / SendResult).
 */

export type CampaignCountry = 'AR' | 'ES' | null;

export type CampaignStatus = 'draft' | 'sending' | 'sent';

/** Per-section copy the trial template consumes (D-12). */
export interface CampaignCopySlots {
  headline: string;
  subheadline: string;
  body: string;
}

/** Input to create a draft campaign (D-12). */
export interface CreateCampaignInput {
  name: string;
  subject: string;
  /** Optional country scope; null/undefined = global. */
  country?: CampaignCountry;
  /** Optional self-hosted hero image URL (D-27). */
  heroImageUrl?: string;
  copySlots: CampaignCopySlots;
}

/** A persisted campaign row. */
export interface CampaignRecord {
  id: number;
  name: string;
  subject: string;
  status: string;
  createdBy: number;
  country: string | null;
  createdAt: string;
  sentAt: string | null;
}

/** A campaign in the admin list, augmented with its recipient count. */
export interface CampaignListItem extends CampaignRecord {
  recipientCount: number;
}

/** Result of a send() call (idempotent). */
export interface SendResult {
  campaignId: number;
  recipientCount: number;
  newlyEnrolled: number;
}

/**
 * The 6-stage per-campaign funnel (D-18). `aperturaAproximada` flags that the
 * "abierto" stage is inherently approximate (Apple Mail Privacy / images-off).
 */
export interface CampaignFunnel {
  enviado: number;
  abierto: number;
  click: number;
  reservo: number;
  asistio: number;
  convirtio: number;
  aperturaAproximada: boolean;
}

/** GET /admin/eligible-count response. */
export interface EligibleCount {
  count: number;
}
