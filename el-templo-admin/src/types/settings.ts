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
}

/** Cuerpo del PUT: parcial; `discountCapAmount.<PAIS>: null` borra el tope. */
export type InvitationSettingsPatch = Partial<
  Omit<InvitationSettings, 'discountCapAmount' | 'perLinkPercent' | 'maxPercentCap'>
> & {
  discountCapAmount?: Partial<Record<InvitationCapCountry, number | null>>;
};
