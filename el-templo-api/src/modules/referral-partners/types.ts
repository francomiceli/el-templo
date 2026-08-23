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
