/**
 * Segmentation Module Types
 *
 * Defines behavioral segment types, threshold configuration,
 * and display metadata for the admin UI.
 */

// ─── Segment Type ─────────────────────────────────────────────────────────

export type MemberSegment =
  | "nuevo_guerrero"
  | "espartano"
  | "intermitente"
  | "en_riesgo"
  | "digital_warrior"
  | "ghost";

// ─── Settings Keys (stored in system_settings table) ──────────────────────

export const SEGMENT_SETTINGS_KEYS = {
  ESPARTANO_PCT: "segment.espartano_pct",
  INTERMITENTE_PCT: "segment.intermitente_pct",
  EN_RIESGO_WEEKS: "segment.en_riesgo_weeks",
  GHOST_WEEKS: "segment.ghost_weeks",
  NUEVO_GUERRERO_DAYS: "segment.nuevo_guerrero_days",
  WINDOW_DAYS: "segment.window_days",
} as const;

// ─── Default Threshold Values ─────────────────────────────────────────────

export const SEGMENT_DEFAULTS = {
  ESPARTANO_PCT: 80,
  INTERMITENTE_PCT: 40,
  EN_RIESGO_WEEKS: 2,
  GHOST_WEEKS: 8,
  NUEVO_GUERRERO_DAYS: 30,
  WINDOW_DAYS: 28,
} as const;

// ─── Threshold Configuration Interface ────────────────────────────────────

export interface SegmentThresholds {
  espartanoPct: number;
  intermitentePct: number;
  enRiesgoWeeks: number;
  ghostWeeks: number;
  nuevoGuerreroDays: number;
  windowDays: number;
}

// ─── Display Metadata (for admin UI) ──────────────────────────────────────

export const SEGMENT_LABELS: Record<MemberSegment, string> = {
  nuevo_guerrero: "Nuevo Guerrero",
  espartano: "Espartano",
  intermitente: "Intermitente",
  en_riesgo: "En Riesgo",
  digital_warrior: "Digital Warrior",
  ghost: "Ghost",
};

export const SEGMENT_COLORS: Record<MemberSegment, string> = {
  nuevo_guerrero: "blue",
  espartano: "green",
  intermitente: "amber",
  en_riesgo: "orange",
  digital_warrior: "purple",
  ghost: "grey",
};

export const SEGMENT_VALUES: MemberSegment[] = [
  "nuevo_guerrero",
  "espartano",
  "intermitente",
  "en_riesgo",
  "digital_warrior",
  "ghost",
];
