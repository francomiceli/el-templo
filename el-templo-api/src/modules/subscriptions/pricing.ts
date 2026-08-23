// Module: subscriptions — `resolvePlanPrice`, la única función core que
// habla con el filter `pricing.adjust` (fase 176 Plan 08, MOD-02)
//
// POR QUÉ EXISTE ESTE ARCHIVO
// ----------------------------
// Hasta este plan la cadena de precio de `assignPlan` (y sus 3 hermanas:
// `changePlanNow`, `changePlanAfterCurrent`/`renewSubscription`,
// `getPricingPreview`) tenía el concepto "boarding pass" y "AURA" escritos
// inline en `subscriptions/service.ts`, importando `AuraService` directo
// (dirección `core → módulo`, prohibida por el doc 04 §1 salvo vía hooks).
// Este archivo es el punto único donde el core arma el `PricingAdjustCtx`
// (`shared/hooks.ts`, plan 176-06) y dispara `hookRegistry.runFilter`. A
// partir de acá el core no vuelve a nombrar "aura" ni "boardingPass" en el
// camino del alta — esos dos conceptos viven exclusivamente en
// `aura/pricing-benefits.ts`.
//
// QUÉ ES CORE Y QUÉ ES MÓDULO (corrección verificada del doc 04 y del CONTEXT)
// ------------------------------------------------------------------------------
// CORE (se queda acá / en el caller): prorrateo hasta fin de mes, override
// con reason, precio base (`getBasePrice`), referidos.
// MÓDULO `templo-gamification` (cruza al filter): boarding pass y descuento
// AURA. Son SOLO DOS los que cruzan, no cuatro — los referidos están
// clasificados `tenant-scoped` en el manifiesto de tenancy, es decir CORE, y
// quedan completamente FUERA de esta función (el caller los aplica después,
// con sus dos guards de siempre: `planCategory !== "especial"` y, en
// `assignPlan`, `!prorateToMonthEnd`).
//
// ORDEN CANÓNICO QUE ESTA FUNCIÓN PRESERVA
// -------------------------------------------
//   [prorrateo | override | filter(boarding) | base+filter(AURA)] → referidos
// El prorrateo y el override son mutuamente excluyentes y CORE: el caller
// decide cuál de los dos corre (o ninguno) ANTES de llamar acá, pasando
// como mucho uno de `prorate`/`override`. Con cualquiera de los dos
// presentes, `priceLocked` queda seteado y el filter SIGUE corriendo (paso
// 4 de abajo) — es lo que permite que el módulo tire sus dos
// `BadRequestError` de exclusión mutua (boarding pass / AURA con prorrateo)
// sin que el core vuelva a leer esas keys. Los referidos corren en el
// caller, DESPUÉS de que esta función devuelve — nunca acá.
//
// QUÉ NO HACE ESTA FUNCIÓN
// ---------------------------
// - No decide si el caller manda `override` o `prorate` (esa decisión, con
//   el `>= 0` guard de `priceOverrideAmount` y el chequeo de tope
//   "el precio prorrateado no puede superar el precio del mes completo", es
//   de `assignPlan`).
// - No conoce `auraSpend` ni `boardingPass` — esas keys viajan opacas en
//   `moduleInput` y las interpreta únicamente el handler del módulo.
// - No aplica referidos.
// - No tiene `try/catch`: todo error (`BadRequestError` de exclusión,
//   `ConflictError` del pase repetido, `InsufficientBalanceError` de AURA)
//   PROPAGA tal cual al caller (doc 04 §4.1, semántica bloqueante del filter,
//   ver docblock de `shared/hooks.ts`).

import { BadRequestError } from "../shared/errors";
import { hookRegistry } from "../shared/hooks";
import type {
  AppliedBenefit,
  HookCallCtx,
  PricingAdjustCtx,
  PricingCallSite,
  PricingSupports,
} from "../shared/hooks";
import type { PlanCategory, PriceType } from "./types";

export interface ResolvePlanPriceParams {
  hook: HookCallCtx;
  userId: number;
  planId: number;
  planCategory: PlanCategory;
  callSite: PricingCallSite;
  supports: PricingSupports;
  /** false = preview: calcular sin gastar ni marcar (se propaga al ctx). */
  commit: boolean;
  priceTypeRequested: PriceType;
  /** Callback del caller — normaliza credit_card/zero según las reglas de settings. */
  resolvePriceType: (t: PriceType) => Promise<PriceType>;
  /** Callback del caller — precio de lista del plan para un priceType dado. */
  basePriceFor: (t: PriceType) => number;
  /** Opaco: esta función NO le hace `as` ni lee sus keys. */
  moduleInput: Record<string, unknown>;
  /** CORE: precio personalizado con razón. Mutuamente excluyente con `prorate`. */
  override?: { amount: number; reason?: string };
  /** CORE: precio prorrateado YA calculado por el caller (puro, no tira). */
  prorate?: { computed: number };
}

export interface ResolvedPlanPrice {
  price: number;
  priceType: PriceType;
  basePrice: number;
  applied: AppliedBenefit[];
  moduleOutput: Record<string, unknown>;
  exclusive: boolean;
  priceOverrideAmount: number | null;
  priceOverrideReason: string | null;
}

/**
 * Resuelve el precio final de un plan corriendo la cadena canónica CORE +
 * el filter `pricing.adjust`. Ver docblock del archivo para el orden exacto
 * y la frontera core/módulo.
 */
export async function resolvePlanPrice(
  params: ResolvePlanPriceParams,
): Promise<ResolvedPlanPrice> {
  // 1. Tipo y precio de lista, vía los callbacks del caller.
  const priceType = await params.resolvePriceType(params.priceTypeRequested);
  const basePrice = params.basePriceFor(priceType);

  // 2. `priceLocked`: prorrateo gana sobre override (mutuamente excluyentes
  // por construcción del caller). Sin ninguno de los dos, null — el módulo
  // queda libre de aplicar boarding pass o AURA.
  const priceLocked: PricingAdjustCtx["priceLocked"] = params.prorate
    ? "prorate"
    : params.override
      ? "override"
      : null;

  if (params.override && !params.override.reason) {
    // Mensaje byte-idéntico a `service.ts` (regla core, no delegable al módulo).
    throw new BadRequestError(
      "Se requiere una razon para el precio personalizado",
    );
  }

  // 3. Precio inicial, antes del filter.
  const price = params.prorate
    ? params.prorate.computed
    : params.override
      ? params.override.amount
      : basePrice;

  // 4. Arma el ctx y SIEMPRE llama al filter — incluso con priceLocked
  // seteado, porque es lo que permite que el módulo tire sus exclusiones.
  // Sin try/catch: ver docblock del archivo.
  const ctx: PricingAdjustCtx = {
    callSite: params.callSite,
    userId: params.userId,
    planId: params.planId,
    planCategory: params.planCategory,
    priceType,
    basePrice,
    price,
    priceLocked,
    commit: params.commit,
    supports: params.supports,
    moduleInput: params.moduleInput,
    moduleOutput: {},
    applied: [],
    exclusive: false,
    resolvePriceType: params.resolvePriceType,
    basePriceFor: params.basePriceFor,
  };

  await hookRegistry.runFilter("pricing.adjust", params.hook, ctx);

  // 5. Devuelve leyendo del ctx POST-filter — el módulo puede haber mutado
  // priceType/basePrice/price (boarding pass) o solo price (AURA).
  return {
    price: ctx.price,
    priceType: ctx.priceType,
    basePrice: ctx.basePrice,
    applied: ctx.applied,
    moduleOutput: ctx.moduleOutput,
    exclusive: ctx.exclusive,
    priceOverrideAmount: params.override ? params.override.amount : null,
    priceOverrideReason: params.override
      ? (params.override.reason ?? null)
      : null,
  };
}

/**
 * Proyección EXPLÍCITA de `moduleOutput` a las tres columnas de trazabilidad
 * (`auraDiscount`, `auraDiscountPercent`, `boardingPassUsed`) que viven en la
 * tabla CORE `subscriptions`. Es deuda consciente: esas columnas son
 * conceptualmente de El Templo (`templo-gamification`) pero viven en una
 * tabla core porque promoverlas a una tabla propia del módulo está fuera de
 * alcance de esta fase (doc 04 §8.2). El narrowing es por `typeof` — nunca
 * `as` — porque `moduleOutput` es opaco para el core.
 */
export function readModuleColumns(resolved: ResolvedPlanPrice): {
  auraDiscount: number | null;
  auraDiscountPercent: number | null;
  boardingPassUsed: boolean;
} {
  const { moduleOutput } = resolved;
  const auraDiscount =
    typeof moduleOutput.auraDiscount === "number"
      ? moduleOutput.auraDiscount
      : null;
  const auraDiscountPercent =
    typeof moduleOutput.auraDiscountPercent === "number"
      ? moduleOutput.auraDiscountPercent
      : null;
  const boardingPassUsed = moduleOutput.boardingPassUsed === true;
  return { auraDiscount, auraDiscountPercent, boardingPassUsed };
}
