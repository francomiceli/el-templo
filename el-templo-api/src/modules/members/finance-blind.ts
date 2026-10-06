/**
 * Recorte de datos de plata en las respuestas de socios para roles ciegos a las
 * finanzas (`isFinanceBlindRole`, hoy `coach_actividad` — 2026-10-06).
 *
 * El rol entra a Alumnos por MEMBER_ROLES (comparte las rutas con coach), así que
 * el recorte NO puede ser por set de roles: se hace sobre la respuesta, campo a
 * campo, anulando (null) todo lo que revele plan, suscripción, etiqueta de
 * membresía o datos bancarios. Se anula en vez de borrar la key para no cambiar
 * la forma de la respuesta que ya consume el admin.
 */
import type { MemberListItem, MemberProfile } from "./types";

/**
 * Fila de la lista de alumnos: sin plan ni vencimiento de la suscripción.
 * `totalDebtByCurrency` ya viene vacío para este rol (includeTotalDebt solo
 * lo calcula para ADMIN_ROLES).
 */
export function redactMemberListItemForFinanceBlind(
  item: MemberListItem,
): MemberListItem {
  return { ...item, planName: null, endDate: null };
}

/**
 * Ficha del alumno, campos de plata anulados:
 *  - `purchasedPlanId` / `purchasedPlanName`: plan que compró el lead.
 *  - `membershipKindOverride` / `membershipKindEffective`: etiqueta
 *    bonificada/staff (es una condición comercial del plan). La efectiva pasa a
 *    null (el schema de respuesta lo admite).
 *  - `sepaDetails`: IBAN / NIF / domiciliación (dato bancario).
 * Todo lo demás (perfil, contacto, sede, estado, asistencia, trial) se conserva.
 */
export function redactMemberProfileForFinanceBlind(member: MemberProfile): Omit<
  MemberProfile,
  "membershipKindEffective"
> & {
  membershipKindEffective: MemberProfile["membershipKindEffective"] | null;
} {
  return {
    ...member,
    purchasedPlanId: null,
    purchasedPlanName: null,
    membershipKindOverride: null,
    membershipKindEffective: null,
    sepaDetails: null,
  };
}
