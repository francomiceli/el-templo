/**
 * Settings types for the admin app.
 */

/** Países con tope en dinero de invitaciones (AR en ARS, ES en EUR). */
export type InvitationCapCountry = 'AR' | 'ES';

/**
 * Fase 194 (D-10c): parámetros del programa de Invitaciones.
 * Respuesta de GET/PUT /admin/settings/invitations.
 */
export interface InvitationSettings {
  /** Cupo de invitaciones por mes y socio (1-10). */
  monthlyQuota: number;
  /** Vigencia de los accesos, en días hábiles (1-30). */
  accessBusinessDays: number;
  /** Ventana de reinvitación a la misma persona, en días (0-365). */
  reinviteWindowDays: number;
  /** Meses sin membresía para que un ex socio sea invitable (0-36). */
  exMemberInactivityMonths: number;
  /** Días tras vencer los accesos en que una compra todavía da el descuento (0-180). */
  latePurchaseWindowDays: number;
  /** % de descuento del invitado que compra (0-50). */
  inviteePercent: number;
  /** Tope de descuento en dinero por país. `null` = sin tope. */
  discountCapAmount: Record<InvitationCapCountry, number | null>;
  /** Solo lectura: % por invitado activo (configuración AURA). */
  perLinkPercent: number;
  /** Solo lectura: tope % acumulable. */
  maxPercentCap: number;
  /**
   * Accesos que da cada invitación, por país (`classes_per_week` del plan Invitación activo).
   * `null` = el país no tiene plan Invitación (no se puede editar).
   */
  accessesPerInvitation: Record<InvitationCapCountry, number | null>;
  /** Rangos inclusivos que valida el servidor (fuente única: el admin no los duplica). */
  limits: InvitationSettingsLimits;
}

export interface InvitationRange {
  min: number;
  max: number;
}

/** Claves numéricas enteras del programa que se editan como un único valor. */
export type InvitationIntKey =
  | 'monthlyQuota'
  | 'accessBusinessDays'
  | 'reinviteWindowDays'
  | 'exMemberInactivityMonths'
  | 'latePurchaseWindowDays'
  | 'inviteePercent';

export type InvitationSettingsLimits = Record<
  InvitationIntKey | 'accessesPerInvitation',
  InvitationRange
>;

/** Cuerpo del PUT: parcial; `discountCapAmount.<PAIS>: null` borra el tope. */
export type InvitationSettingsPatch = Partial<Pick<InvitationSettings, InvitationIntKey>> & {
  discountCapAmount?: Partial<Record<InvitationCapCountry, number | null>>;
  /** Por país, entero en el rango de `limits.accessesPerInvitation` (sin `null`). */
  accessesPerInvitation?: Partial<Record<InvitationCapCountry, number>>;
};
