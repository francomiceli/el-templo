// Module: referral-partners — tipos del módulo (fase 179).
// Espejo deliberado de `referrals/types.ts` para la entidad "comercio partner"
// (D-01/D-03): tipos propios, sin reusar ni extender los de referidos.

/** Beneficio que recibe quien se registra con el código del partner (D-05/D-09). */
export type PartnerBenefitType = "discount_percent" | "free_pass";

/** Tipo de comisión que cobra el partner por cada membresía confirmada (D-11). */
export type PartnerCommissionType = "none" | "fixed";

/** Moneda del beneficio/comisión, derivada de `branches.country` (D-13). */
export type PartnerCurrency = "ARS" | "EUR";

/**
 * Contexto de tenant mínimo que todo método público del servicio recibe como
 * primer parámetro. `{ tenantId }` plano a propósito — mismo shape que
 * `TenantContext` de `shared/tenant.ts` (estructuralmente compatible con
 * `request.scope` narrowed por `assertTenant`).
 */
export interface TenantCtx {
  tenantId: number;
}

/**
 * Payload para crear un partner. `code` es vanity (input del admin), se
 * normaliza server-side (`normalizeCode`) antes de guardar. `currency` NO
 * forma parte del input: se deriva de `branches.country` (D-13) — nunca del
 * payload (T-179-07).
 */
export interface CreatePartnerInput {
  name: string;
  code: string;
  branchId: number;
  benefitType: PartnerBenefitType;
  /** 1-100 si `discount_percent`; 0 si `free_pass` (D-19: valor fijo). */
  benefitValue: number;
  commissionType: PartnerCommissionType;
  /** Monto fijo (D-11). 0 cuando `commissionType === "none"`. */
  commissionValue: number;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
}

/**
 * Payload para actualizar un partner. Todo opcional salvo que `code` NO es
 * editable (hay tarjetas impresas circulando, ver `updatePartner` en
 * `service.ts`): si viene y difiere del actual, el service lanza
 * `BadRequestError` en vez de aplicar el cambio.
 */
export interface UpdatePartnerInput {
  name?: string;
  code?: string;
  benefitType?: PartnerBenefitType;
  benefitValue?: number;
  commissionType?: PartnerCommissionType;
  commissionValue?: number;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

/**
 * Fila que consume la UI del admin: los datos del partner + los contadores
 * agregados de vínculos/comisiones que la página de Partners muestra en la
 * tabla, resueltos en la MISMA query de `listPartners`/`getPartner` (sin
 * N+1: `LEFT JOIN` + `COUNT`/`SUM` agrupados, no una query por partner).
 */
export interface PartnerListItem {
  id: number;
  name: string;
  code: string;
  branchId: number;
  branchName: string;
  country: string;
  benefitType: PartnerBenefitType;
  benefitValue: number;
  commissionType: PartnerCommissionType;
  commissionValue: number;
  currency: PartnerCurrency;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  /** Cantidad total de vínculos (`partner_referrals`) del partner. */
  vinculosTotal: number;
  /** Cantidad de vínculos en estado `qualified`. */
  vinculosQualified: number;
  /** Cantidad de comisiones `pending` sin liquidar. */
  comisionesPendientes: number;
  /** Suma de `amount` de las comisiones `pending` (misma moneda del partner). */
  montoPendiente: number;
}

/**
 * Origen actual de un socio (D-12: exclusividad de origen — `referrals` XOR
 * `partner_referrals`). Devuelto por `findOriginForMember`: `null` cuando el
 * socio todavía no tiene ningún origen.
 */
export type PartnerOrigin =
  | { kind: "member" }
  | { kind: "partner"; partnerId: number; linkId: number }
  | null;

/**
 * Vínculo socio↔partner con el detalle que la ficha del alumno necesita
 * mostrar (D-15, plan 179-14: sección "Partner" de `MemberReferralsTab.vue`
 * en el admin — asignación retroactiva + revocación). Devuelto por
 * `getMemberPartnerLink`, `null` cuando el socio no tiene vínculo. Mismo
 * recorte de columnas que `ConversionRow` (nombre/código del partner, fecha,
 * estado del vínculo y del beneficio), sin los campos de comisión — la ficha
 * del alumno no gestiona liquidación, solo atribución de origen.
 */
export interface MemberPartnerLink {
  linkId: number;
  partnerId: number;
  partnerName: string;
  partnerCode: string;
  status: "pending" | "qualified" | "revoked";
  benefitType: PartnerBenefitType;
  benefitStatus: "pending" | "consumed" | "expired";
  createdAt: Date;
}

/**
 * Shape del beneficio de partner que consume la respuesta de `POST
 * /api/auth/register` (`partnerBenefit`, plan 179-04) y que la app usa para
 * el badge/mensaje de éxito (plan 179-14). `null` cuando no hubo atribución
 * (código inválido/inactivo/ambiguo, o el socio ya tenía origen — D-12).
 */
export type PartnerSignupResult = {
  partnerName: string;
  benefitType: PartnerBenefitType;
  benefitValue: number;
} | null;

/**
 * Fila del reporte "conversiones por partner" (D-20, plan 179-10): una fila
 * por vínculo `partner_referrals`, con el nombre del socio, el partner de
 * origen, el estado del vínculo/beneficio y el estado+monto de la comisión
 * asociada (si existe). `commission*` es `null` cuando el vínculo todavía no
 * generó comisión (pending sin cualificar, o partner con `commissionType
 * === "none"`).
 *
 * Asume 0-o-1 comisión por vínculo: el flip `pending → qualified` ocurre una
 * sola vez en la vida de un vínculo (`qualifyAndCommission` /
 * `assignPartnerToMember`), y la comisión que genera ese flip es idempotente
 * por `subscription_id` (`unique_partner_commission_sub`). Si esa garantía de
 * negocio cambiara (varias comisiones por vínculo), este reporte tendría que
 * pre-agregar por `partner_referral_id` como hace `queryPartners` — hoy no
 * hace falta.
 */
export interface ConversionRow {
  linkId: number;
  referredId: number;
  referredName: string;
  partnerId: number;
  partnerName: string;
  partnerCode: string;
  status: "pending" | "qualified" | "revoked";
  benefitType: PartnerBenefitType;
  benefitStatus: "pending" | "consumed" | "expired";
  qualifiedAt: Date | null;
  createdAt: Date;
  commissionId: number | null;
  commissionStatus: "pending" | "settled" | "void" | null;
  commissionAmount: number | null;
  commissionCurrency: PartnerCurrency | null;
}

/**
 * Fila del reporte "beneficios de partner sin conversión" (D-08 reescrita,
 * plan 179-10): seguimiento manual de la sede para socios que canjearon un
 * beneficio de partner y no convirtieron. Dos `motivo` mutuamente
 * excluyentes (ver `listBenefitsWithoutConversion` en `service.ts` para el
 * predicado exacto de cada uno):
 *  - `"semana_sin_conversion"`: activó la semana gratis (`free_pass`,
 *    `benefitStatus="consumed"`) hace más de 7 días y el vínculo nunca llegó
 *    a `qualified`.
 *  - `"beneficio_vencido_sin_uso"`: el beneficio (de cualquier tipo) quedó
 *    `pending` y su `benefitExpiresAt` ya pasó (D-07).
 *
 * Este reporte reemplaza la idea original de mandar al funnel de leads
 * (D-08 original): el funnel de leads exige `users.status='prueba'` +
 * booking `is_trial` (`expire-lost-leads.ts`), incompatible con el
 * consumidor de semana de partner, que después de consumirla queda
 * `inactivo`/`freemium` según el resultado de la reserva, nunca `prueba`.
 */
export interface BenefitWithoutConversionRow {
  linkId: number;
  referredId: number;
  referredName: string;
  referredPhone: string | null;
  partnerId: number;
  partnerName: string;
  benefitType: PartnerBenefitType;
  benefitStatus: "pending" | "consumed" | "expired";
  motivo: "semana_sin_conversion" | "beneficio_vencido_sin_uso";
  /** Fecha relevante: consumo (`semana_sin_conversion`) o vencimiento (`beneficio_vencido_sin_uso`). */
  fechaRelevante: Date;
}
