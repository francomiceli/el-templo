/**
 * Member types for the admin app.
 * Matches the API response shapes from the members module (Plan 47-01).
 */

export type DocumentType = 'DNI' | 'Pasaporte' | 'NIE' | 'NIF' | 'Otro';

// ─── Etiqueta de Asistencia (Phase 136, D-01) ───────────────────────────────
// Reemplaza al segmento conductual de Phase 79 por 4 bandas basadas 100% en el
// % de uso de la membresía sobre una ventana móvil de 28 días (≥75 / 50-74 /
// 1-49 / 0). Los cortes son fijos en código (D-03); no hay thresholds
// configurables. Un miembro con < 1 mes de antigüedad o sin plan activo queda
// con segment NULL (sin etiqueta).

export type MemberSegment = 'optima' | 'regular' | 'alerta' | 'ausente';

export const SEGMENT_LABELS: Record<MemberSegment, string> = {
  optima: 'Óptima',
  regular: 'Regular',
  alerta: 'Alerta',
  ausente: 'Ausente',
};

export const SEGMENT_COLORS: Record<MemberSegment, string> = {
  optima: 'green',
  regular: 'amber',
  alerta: 'orange',
  ausente: 'red',
};

// Short, plain-language meaning of each attendance band, mirroring the % cutoffs
// in the API segmentation service. Shown as a legend so reception/gestion know
// what each chip means.
export const SEGMENT_DESCRIPTIONS: Record<MemberSegment, string> = {
  optima: 'Usa ≥75% de su cupo de clases.',
  regular: 'Usa 50-74% de su cupo.',
  alerta: 'Usa menos de la mitad de su cupo — requiere observación.',
  ausente: 'Sin asistencia en la ventana — detona seguimiento.',
};

// Phase 136 D-05/D-06: tenure ("Antigüedad") band, derived on the fly from
// users.createdAt in the slot endpoints. Surfaced only in Horarios.
export type MemberSeniority = 'nuevo' | '1-3m' | '3-6m' | '6m+';

// Números a secas (sin "meses") para ahorrar espacio en la fila de pills de
// Horarios — deja lugar para la pill de Vencimiento.
export const SENIORITY_LABELS: Record<MemberSeniority, string> = {
  nuevo: 'Nuevo',
  '1-3m': '1-3',
  '3-6m': '3-6',
  '6m+': '+6',
};

// ─── Etiqueta de Vencimiento (cuenta regresiva) ─────────────────────────────
// Cuenta regresiva al vencimiento de la suscripción activa/paused, derivada
// on-the-fly de `endDate` (subscriptions.end_date). BANDAS CONTINUAS: la pill
// está visible todos los días desde los 10 días restantes y escala de color al
// acercarse. Los cortes espejan PLAN_RENEWAL_THRESHOLDS del cron de push
// (api/src/jobs/notification-cron.ts) para que el chip que ve el staff cambie
// el mismo día en que al alumno le entra el aviso.
//   8-10 días → "10 Venc"   1-3 días → "3 Venc" (push a los 3)
//   4-7 días  → "7 Venc"    0 días   → "Hoy"    (push el día de vencimiento)
//   (push a los 7)          < 0      → "Vencida" (si no renovó)

/** Bandas de la pill, de la más urgente a la más lejana. `maxDays` inclusive. */
const EXPIRY_BANDS: ReadonlyArray<{ maxDays: number } & ExpiryBadge> = [
  { maxDays: 0, label: 'Hoy', color: 'red' },
  { maxDays: 3, label: '3 Venc', color: 'red' },
  { maxDays: 7, label: '7 Venc', color: 'deep-orange' },
  { maxDays: 10, label: '10 Venc', color: 'amber' },
];

/** Etiqueta de membresía (espeja MembershipKind de el-templo-api members/types.ts). */
export type MembershipKind = 'paga' | 'bonificada' | 'staff';

export interface ExpiryBadge {
  label: string;
  color: string;
}

/**
 * Map an active subscription end date to its Vencimiento pill, or null when the
 * expiry is still further out than the widest band. Both args are 'YYYY-MM-DD'.
 * Day count is a pure calendar-day diff (caller supplies "today" in the branch
 * timezone — an all-branches list must resolve it per row, not per page).
 */
export function expiryBadge(
  endDate: string | null | undefined,
  todayIso: string
): ExpiryBadge | null {
  if (!endDate) return null;
  const end = Date.parse(`${endDate}T00:00:00`);
  const today = Date.parse(`${todayIso}T00:00:00`);
  if (Number.isNaN(end) || Number.isNaN(today)) return null;
  const days = Math.round((end - today) / 86_400_000);

  if (days < 0) return { label: 'Vencida', color: 'red-10' };
  const band = EXPIRY_BANDS.find((b) => days <= b.maxDays);
  return band ? { label: band.label, color: band.color } : null;
}

// Phase 103 (R10): user lifecycle status. NULL only for staff rows
// (members always have a value). UI labels mirror the enum 1:1
// (Freemium, En Prueba, Activo, Inactivo) per CONTEXT D-09.
export type UserStatus = 'freemium' | 'prueba' | 'activo' | 'inactivo';

export interface MemberListItem {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  dni: string | null;
  level: string;
  branchId: number;
  branchName: string;
  // Phase 103 (R10): first-class status (replaces the derived isActive
  // boolean). Plan 02's recomputeUserStatus keeps this in sync with
  // subscription create/cancel transitions.
  status: UserStatus | null;
  documentType: string | null;
  photoUrl: string | null;
  planName: string | null;
  segment: MemberSegment | null;
  avatarType: string | null;
  // Active/paused subscription end date (YYYY-MM-DD) for the Vencimiento pill.
  endDate: string | null;
  createdAt: string;
  hasUsedTrial: boolean;
}

export const AVATAR_LABELS: Record<string, string> = {
  A: 'A - Nunca entreno',
  B: 'B - Solo gym',
  C: 'C - Dejo el gym',
  D: 'D - Yogui/pilatera',
  E: 'E - Cardio',
  F: 'F - Pesas veterano',
  G: 'G - Busca comunidad',
  H: 'H - Longevidad',
  I: 'I - Cuerpo-mente',
  J: 'J - Cuerpo firme',
  K: 'K - Mujer joven',
};

export interface OnboardingProfileSummary {
  goalType: string;
  goalLabel: string;
  experienceLevel: string;
  experienceLabel: string;
  trainingFocus: string;
  focusLabel: string;
  motivationStyle: string;
  motivationLabel: string;
  completedAt: string | null;
}

/**
 * Domiciliación bancaria (SEPA) — datos del deudor para el archivo mensual
 * que la sucursal de España le pasa al banco. NULL cuando nunca se cargaron.
 * El deudor (titular de la cuenta) puede no ser el socio.
 */
export interface SepaDetails {
  debtorName: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  nif: string | null;
  iban: string | null;
}

export interface MemberProfile extends MemberListItem {
  address: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  role: string;
  segmentUpdatedAt: string | null;
  updatedAt: string;
  onboardingProfile: OnboardingProfileSummary | null;
  // Etiqueta de membresía: override manual (null = automático) + efectiva ya
  // resuelta server-side (override ?? sub vigente ?? 'paga').
  membershipKindOverride: MembershipKind | null;
  /** null = la ficha vino recortada para un rol sin plata (coach_actividad, 2026-10-06). */
  membershipKindEffective: MembershipKind | null;
  // Phase 114 (D-38, D-39): lead-lifecycle fields. Only meaningful when
  // `status === 'prueba'`; AlumnoDetailPage's "Datos de Lead" block gates
  // on that. `createdBy` is denormalized via a self-JOIN server-side so
  // the UI can render "Gestiona: <name>" without a second round-trip; NULL
  // for users created before Plan 01 / via legacy paths (renders "—").
  leadStatus: 'en_seguimiento' | 'ganado' | 'perdido' | null;
  leadNotes: string | null;
  // Hotfix 2026-07: "Plan comprado" — plan que compró el lead al convertir.
  purchasedPlanId: number | null;
  purchasedPlanName: string | null;
  createdBy: { userId: number; name: string } | null;
  /**
   * Latest non-cancelled trial booking for this alumno. Surfaced on the
   * profile so the "Sesión de Prueba" card can render fecha/hora/sucursal/
   * asistencia without a second round-trip. NULL when the alumno has no
   * trial bookings on record. Mirrors the attended derivation used by the
   * trial-sessions report:
   *   'si'  → attendance row exists for the booking
   *   'no'  → booking_date in the past, no attendance row
   *   null  → booking_date is today/future, pending
   */
  latestTrial: {
    bookingId: number;
    bookingDate: string;
    startTime: string;
    branchName: string;
    attended: 'si' | 'no' | null;
  } | null;
  /**
   * País de la sucursal del socio (ISO alfa-2). Gatea la sección de
   * domiciliación bancaria: solo se muestra cuando es 'ES'.
   */
  branchCountry: string;
  /** Domiciliación bancaria (SEPA). NULL si nunca se cargaron datos. */
  sepaDetails: SepaDetails | null;
}

export interface CreateMemberInput {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dni: string;
  branchId: number;
  level?: string;
  documentType?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  /**
   * "Invitado por" (opcional, D-17/D-24): id del socio que lo invitó. En el alta con
   * plan pago es un vínculo de descuento SIN accesos ni cupo. El server valida.
   */
  referredBy?: number | null;
}

/**
 * Soft-register payload for "sesión de prueba" (SP) lead capture.
 * Only the 4 fields the receptionist captures at the door.
 */
export interface CreateTrialMemberInput {
  firstName: string;
  lastName: string;
  phone: string;
  branchId: number;
  /**
   * Fase 194 D-24 "Lo invita" (opcional): id del socio que lo invita. El server
   * valida cupo y elegibilidad ANTES de crear el lead y, si todo va bien, activa
   * la invitación con accesos (mismo `activate` que la app).
   */
  inviterId?: number;
}

// ─── Invitaciones (Fase 194) ────────────────────────────────────────────────
// Espejan el-templo-api/src/modules/referrals (invitation-types.ts,
// invitation-states.ts, types.ts) — contrato de 194-12 y 194-19.

/** Resultado de activar una invitación (canal asistido o alta en prueba). */
export interface InvitationActivation {
  invitationId: number;
  subscriptionId: number;
  /** Último día de los accesos, 'YYYY-MM-DD'. */
  accessExpiresOn: string;
  /** N: cantidad de accesos de la invitación (nunca 3 hardcodeado). `null` = sin tope. */
  classesBudget: number | null;
  branchId: number;
}

/** Motivo (código + texto en español) por el que el servidor no activó la invitación. */
export interface InvitationFailure {
  reason: string;
  message: string;
}

/** Respuesta de POST /admin/members/trial: el perfil + el resultado de "Lo invita". */
export interface CreateTrialMemberResponse extends MemberProfile {
  /** Solo con `inviterId`. `null` si la activación falló después de crear el lead. */
  invitation?: InvitationActivation | null;
  invitationError?: InvitationFailure | null;
}

export interface CreateAssistedInvitationInput {
  /** Socio que invita (el cupo es suyo). */
  inviterId: number;
  /** Sede física donde el invitado entrena. */
  branchId: number;
  /** Sin teléfono, el server usa el guardado del alumno (400 `phone_required` si no hay). */
  phone?: string;
  dni?: string | null;
}

export type InviteeState = 'socio_activo' | 'inactivo' | 'vencido' | 'entrenando' | 'invitado';
export type LeadStage = 'invitado' | 'entrenando' | 'vencido' | 'convertido';

/** Invitado de la lista "Invitó a". Solo nombre de pila + inicial: sin teléfono ni DNI. */
export interface InviteeView {
  /** `null` en los vínculos heredados (`legacy_link`): sin accesos y sin anulación. */
  invitationId: number | null;
  userId: number;
  firstName: string;
  lastInitial: string;
  state: InviteeState;
  accessesUsed: number | null;
  accessesBudget: number | null;
  activatedAt: string | null;
  accessExpiresOn: string | null;
  /** Hoy suma descuento al invitador (vínculo calificado y el invitado con membresía vigente). */
  sumaDescuento: boolean;
  source: 'invitation' | 'legacy_link';
}

export interface InvitationsOverview {
  quota: { limit: number; used: number; remaining: number; month: string };
  inviteUrl: string;
  invitees: InviteeView[];
  discount: { percent: number; activeInvitees: number };
}

/** Bloque "Lo invitó": la invitación activa más reciente donde la persona es la invitada. */
export interface InvitedByView {
  inviterId: number;
  inviterName: string;
  activatedAt: string;
  accessesUsed: number;
  accessesBudget: number;
  accessExpiresOn: string;
  stage: LeadStage;
  branchesTrained: string[];
  channel: 'self_service' | 'assisted';
}

export interface UpdateMemberInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  dni?: string | null;
  branchId?: number;
  level?: string;
  documentType?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  // Override manual de la etiqueta de membresía. null = automático. Ausente = no tocar.
  membershipKindOverride?: MembershipKind | null;
  /**
   * Domiciliación bancaria (SEPA) — solo se envía cuando la sucursal del
   * socio es de España. Ausente = el backend no toca los datos existentes.
   */
  sepaDetails?: {
    debtorName?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
    nif?: string | null;
    iban?: string | null;
  };
}

/** Fase 194 (D-18): origen del alumno para el listado (enum de un valor en el API). */
export type MemberOrigin = 'invitacion';

export interface MemberListParams {
  search?: string;
  branchId?: number;
  multiBranch?: boolean;
  planId?: number;
  level?: string;
  overdue?: boolean;
  segment?: MemberSegment;
  avatarType?: string;
  debtorOnly?: boolean;
  country?: 'AR' | 'ES';
  // Phase 103 (R8): first-class users.status filter (replaces Phase 102's
  // 'leads'/'alumnos' derived values). 'todos' is a no-op default.
  status?: 'todos' | UserStatus;
  // Fase 194 (D-18): 'invitacion' = solo alumnos con una invitación activada.
  // Combinable con `status` (status=prueba + origin=invitacion = leads de invitación).
  origin?: MemberOrigin;
  // Phase 154 (ALUM-05): gatea la columna Nivel del export Excel por la superficie
  // Templo de niveles griegos. Default en el backend true → columna presente.
  includeGreekLevel?: boolean;
  page?: number;
  limit?: number;
}

// ─── Outstanding Balances (Phase 105 Plan 05) ───────────────────────────
// Per-row debt detail and Phase 101 Debt* types were dropped when the
// finance model migrated to financial_transactions + balances. The list
// banner still shows aggregate outstanding balance grouped by currency,
// sourced server-side from balances.amount > 0.

export interface TotalDebtRow {
  currency: string;
  amount: number;
}

export interface MembersListResponse {
  members: MemberListItem[];
  total: number;
  totalDebtByCurrency: TotalDebtRow[];
}

export interface DniCheckResult {
  available: boolean;
  existingMemberName?: string;
}

export interface MemberNote {
  id: number;
  userId: number;
  authorId: number;
  authorName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteInput {
  content: string;
}

export interface UpdateNoteInput {
  content: string;
}

export interface BranchOption {
  id: number;
  name: string;
  isVirtual?: boolean;
  /** ISO alfa-2 (AR/ES) — gatea la UI de domiciliación bancaria (SEPA). */
  country?: string;
  /** IANA tz de la sede — "hoy" de la pill de Vencimiento en listas multi-sede. */
  timezone?: string;
}
