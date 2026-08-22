// Module: aura — handler del filter `pricing.adjust` (fase 176 Plan 08, MOD-02)
//
// POR QUÉ EXISTE ESTE ARCHIVO
// ----------------------------
// `subscriptions/pricing.ts` (`resolvePlanPrice`) es el core que arma el
// `PricingAdjustCtx` y dispara `hookRegistry.runFilter("pricing.adjust", ...)`
// sin conocer AURA ni boarding pass. Este archivo es la contraparte: el
// ÚNICO lugar del repo donde esos dos conceptos Templo tocan el precio de
// una suscripción. `pricingAdjustHandler` es lo que
// `aura/module.ts` cuelga en `templo-gamification.filters["pricing.adjust"]`.
//
// PRECEDENCIA boarding > AURA — SEMÁNTICA INTERNA DEL MÓDULO, NO DEL MECANISMO
// -------------------------------------------------------------------------------
// El mecanismo de hooks (`shared/hooks.ts`) no impone orden entre beneficios
// de un mismo módulo — corre un solo handler por (module, hook). Que boarding
// pass gane sobre AURA cuando ambos vienen en el mismo request (el AURA queda
// SILENCIOSAMENTE ignorado, characterization del golden 174-02/176-02) es una
// decisión de negocio de `templo-gamification` (doc 04 §4.4), escrita acá
// como un simple `return` temprano — no una prioridad del registry.
//
// LA EXCLUSIÓN MUTUA CON EL PRORRATEO SE RESUELVE ACÁ, NO EN EL CORE
// -----------------------------------------------------------------------
// El core marca `ctx.priceLocked = "prorate"` cuando el caller ya fijó el
// precio por prorrateo. Este handler es quien decide que boarding pass y
// AURA son incompatibles con eso y tira el `BadRequestError` — el core NUNCA
// vuelve a leer `boardingPass`/`auraSpend` (`subscriptions/pricing.ts` no las
// nombra, ver su docblock).
//
// SIN try/catch — LOS ERRORES PROPAGAN
// ----------------------------------------
// `InsufficientBalanceError` (de `AuraService.spend`) debe abortar el alta:
// el socio eligió pagar con AURA, cobrar el precio con descuento sin haber
// podido descontar el saldo sería un bug de cobro (T-176-07). Este archivo
// no envuelve ninguna llamada en try/catch — la semántica bloqueante del
// filter (`shared/hooks.ts`, "SEMÁNTICA DE ERRORES") depende de esto.
//
// moduleInput/moduleOutput SON OPACOS PARA EL CORE, NO PARA ACÁ
// -------------------------------------------------------------------
// Este handler es el ÚNICO lector legítimo de `moduleInput.auraSpend` /
// `moduleInput.boardingPass` — los estrecha con `typeof`, nunca con `as`
// (T-176-16).
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { BadRequestError, ConflictError } from "../shared/errors";
import { tenantWhere } from "../shared/tenant";
import type { FilterMap } from "../shared/hooks";
import { AURA_DISCOUNT_TIERS } from "../subscriptions/types";
import { AuraService } from "./service";

export const pricingAdjustHandler: FilterMap["pricing.adjust"] = async (
  ctx,
  hook,
) => {
  // Narrowing sin `as`: moduleInput es Record<string, unknown> (T-176-16).
  const boardingPass = ctx.moduleInput.boardingPass === true;
  const auraSpend =
    typeof ctx.moduleInput.auraSpend === "number"
      ? ctx.moduleInput.auraSpend
      : undefined;

  // ── Exclusión mutua con el prorrateo (CORE ya fijó el precio) ──
  // Mensajes byte a byte de `subscriptions/service.ts` (características
  // 174-02/176-02): el golden depende de esta redacción exacta.
  if (ctx.priceLocked === "prorate") {
    if (boardingPass) {
      throw new BadRequestError(
        "No se puede combinar el prorrateo hasta fin de mes con el boarding pass",
      );
    }
    if (auraSpend && auraSpend > 0) {
      throw new BadRequestError(
        "No se puede combinar el prorrateo hasta fin de mes con un descuento AURA",
      );
    }
    return;
  }

  // ── Override CORE: gana en silencio, boarding/AURA se ignoran ──
  if (ctx.priceLocked === "override") {
    return;
  }

  const auraService = new AuraService(hook.db);
  let auraBalance: number | undefined;

  // ── Preview (getPricingPreview): lecturas que el response necesita, ──
  // SIEMPRE, haya o no auraSpend — paridad con el comportamiento de hoy.
  if (ctx.callSite === "preview") {
    auraBalance = await auraService.getBalance(ctx.userId);
    const [userRow] = await hook.db
      .select({ boardingPassUsed: schema.users.boardingPassUsed })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, { tenantId: hook.tenantId }),
          eq(schema.users.id, ctx.userId),
        ),
      );
    ctx.moduleOutput.auraBalance = auraBalance;
    ctx.moduleOutput.boardingPassEligible = userRow
      ? !userRow.boardingPassUsed
      : false;
    ctx.moduleOutput.availableTiers = AURA_DISCOUNT_TIERS.filter(
      (t) => t.spend <= auraBalance!,
    );
  }

  // ── Boarding pass (rama exclusiva) ──
  // ⚠️ El string "boarding pass" del `benefit` NO es decorativo: el plan
  // 176-09 arma con él la razón "Cambio de plan (boarding pass): credito $..."
  // byte a byte como hoy.
  if (boardingPass && ctx.supports.exclusiveBenefits) {
    const [userRow] = await hook.db
      .select({ boardingPassUsed: schema.users.boardingPassUsed })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, { tenantId: hook.tenantId }),
          eq(schema.users.id, ctx.userId),
        ),
      );
    if (userRow?.boardingPassUsed) {
      throw new ConflictError("El boarding pass ya fue utilizado");
    }
    ctx.priceType = await ctx.resolvePriceType("zero");
    ctx.basePrice = ctx.basePriceFor(ctx.priceType);
    ctx.price = ctx.basePrice;
    if (ctx.commit) {
      // T-176-22: el tenant sale del hook, JAMÁS de moduleInput.
      await hook.db
        .update(schema.users)
        .set({ boardingPassUsed: true })
        .where(
          and(
            tenantWhere(schema.users, { tenantId: hook.tenantId }),
            eq(schema.users.id, ctx.userId),
          ),
        );
    }
    ctx.applied.push({ module: "templo-gamification", benefit: "boarding pass" });
    ctx.moduleOutput.boardingPassUsed = true;
    ctx.exclusive = true;
    return;
  }

  // ── AURA (rama de descuento) ──
  if (ctx.supports.discounts && auraSpend && auraSpend > 0) {
    const tier = AURA_DISCOUNT_TIERS.find((t) => t.spend === auraSpend);
    let applyDiscount: boolean;

    if (ctx.commit) {
      if (!tier) {
        throw new BadRequestError(
          `Monto de AURA invalido. Opciones: ${AURA_DISCOUNT_TIERS.map((t) => t.spend).join(", ")}`,
        );
      }
      // Sin try/catch: InsufficientBalanceError debe abortar el alta (T-176-07).
      await auraService.spend({
        userId: ctx.userId,
        amount: tier.spend,
        description: `Descuento de suscripcion: ${tier.percent}% off`,
        referenceType: "subscription",
      });
      applyDiscount = true;
    } else {
      // Preview: TOLERANTE — sin tier o sin saldo, no aplica y NO tira
      // (paridad con getPricingPreview de hoy).
      const balance = auraBalance ?? (await auraService.getBalance(ctx.userId));
      applyDiscount = tier !== undefined && auraSpend <= balance;
    }

    if (applyDiscount && tier) {
      const discountAmount = Math.floor(ctx.basePrice * (tier.percent / 100));
      ctx.price = ctx.basePrice - discountAmount;
      ctx.moduleOutput.auraDiscount = tier.spend;
      ctx.moduleOutput.auraDiscountPercent = tier.percent;
      if (ctx.callSite === "preview") {
        ctx.moduleOutput.discountType = "aura";
        ctx.moduleOutput.discountAmount = discountAmount;
        ctx.moduleOutput.auraToSpend = tier.spend;
      }
      ctx.applied.push({ module: "templo-gamification", benefit: "aura" });
    }
  }
};
