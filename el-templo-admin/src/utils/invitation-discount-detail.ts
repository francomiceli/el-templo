import type { InvitationDiscountDetail, InvitationDiscountReason } from 'src/types/subscription';

/**
 * Textos y ajuste del detalle del descuento por invitación (solo informativo: el
 * servidor decide el descuento, acá solo se explica).
 */

/** Frase del motivo cuando NO se aplicó y no es por falta de plan vigente de la otra persona. */
export const INVITATION_REASON_TEXT: Record<
  Exclude<InvitationDiscountReason, 'counterparty_not_covered'>,
  string
> = {
  plan_not_eligible: 'Este plan no admite descuento por invitación',
  prorated: 'El cobro proporcional no lleva descuento. Se aplica desde la próxima renovación',
  price_override: 'Con precio personalizado no se aplica',
  other_discount_won: 'Se aplica otro descuento mayor (no se suman)',
};

/** Aviso "Su plan vence ..." para un vínculo activo que vence pronto. */
export function expiresSoonText(daysLeft: number | null): string {
  if (daysLeft === null || daysLeft <= 0) return 'Su plan vence hoy';
  if (daysLeft === 1) return 'Su plan vence mañana';
  return `Su plan vence en ${daysLeft} días`;
}

/**
 * Estados de precio que el cliente conoce y los previews del servidor NO reciben
 * (el prorrateo y el precio personalizado se editan en pantalla y el preview se pide
 * sin ellos). Con alguno activo, el cobro no lleva descuento por invitación aunque el
 * preview del servidor diga que se aplicaría: el detalle tiene que decir lo mismo que
 * muestra la pantalla.
 */
export interface ClientPricingState {
  prorated: boolean;
  priceOverride: boolean;
}

/**
 * Mismo orden de prioridad que el árbitro del servidor: un plan que no admite el
 * descuento sigue siendo ese motivo; después el prorrateo; después el precio
 * personalizado. Los vínculos viajan igual.
 */
export function withClientPricingState(
  detail: InvitationDiscountDetail | null | undefined,
  state: ClientPricingState
): InvitationDiscountDetail | null {
  if (!detail) return null;
  if (detail.reason === 'plan_not_eligible') return detail;
  if (state.prorated) return { ...detail, applied: false, reason: 'prorated' };
  if (state.priceOverride) return { ...detail, applied: false, reason: 'price_override' };
  return detail;
}
