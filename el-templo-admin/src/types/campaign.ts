/**
 * Campaign types (Phase 119 — reusable email-campaign system).
 * Mirror the API shapes from el-templo-api/src/modules/campaigns/types.ts
 * (CampaignRecord / CampaignListItem / FunnelStages / CreateCampaignInput / SendResult).
 */

export type CampaignCountry = 'AR' | 'ES' | null;

export type CampaignStatus = 'draft' | 'sending' | 'sent';

/**
 * The 5 predefined campaign audience segments (Phase 180, D-11/D-12).
 * Mirror of the closed list in el-templo-api/src/modules/campaigns/types.ts
 * (`CAMPAIGN_SEGMENTS`) — a campaign has exactly one segment (D-14, no
 * multi-select).
 */
export type CampaignSegment =
  | 'freemium_elegibles'
  | 'bajas'
  | 'prueba_no_convertida'
  | 'alerta_ausente'
  | 'referidos_pendientes';

/** Human-readable labels for the segment selector and the listing (D-11/D-14). */
export const CAMPAIGN_SEGMENT_LABELS: Record<CampaignSegment, string> = {
  freemium_elegibles: 'Freemium elegibles',
  bajas: 'Bajas (ex socios)',
  prueba_no_convertida: 'Probaron y no compraron',
  alerta_ausente: 'En alerta o ausentes',
  referidos_pendientes: 'Referidos sin calificar',
};

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
  /** Audience segment (Phase 180, D-11/D-14). When omitted, the API default applies. */
  segment?: CampaignSegment;
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
  /** Persisted audience segment (Phase 180, D-11/D-14). */
  segment: CampaignSegment;
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
