// Module: referral-partners — code-resolver (fase 179, D-02/D-03).
//
// Resolución UNIFICADA del campo manual único de código del registro
// (RegisterPage.vue): un string puede ser un código de partner, un código de
// promo o un código de socio (`users.referral_code`). Los 3 espacios se
// validan DISJUNTOS al crear un partner (`service.ts:createPartner`, D-03),
// así que en el caso sano el string matchea a lo sumo UNO de los tres.
//
// ORDEN DE RESOLUCIÓN: partner → promo → socio. Solo importa ante datos
// preexistentes corruptos (los 3 espacios ya se validan disjuntos al crear —
// ver arriba): si alguna vez un mismo código apareciera en dos espacios, gana
// el primero en este orden.
//
// TENANT SIN SCOPE (D-02): la ruta de registro NO está autenticada, así que
// no hay `request.scope`. Cuando `opts.branchId` viene (caso normal —
// RegisterPage.vue siempre lo manda), el tenant se deriva UNA vez de esa sede
// y se reusa para acotar tanto la rama partner como la promo. Cuando no viene,
// la rama partner exige EXACTAMENTE un match cross-tenant (la ambigüedad se
// resuelve como `unknown`, nunca se adivina el tenant) y la rama promo
// replica el comportamiento sin-scope que ya tiene HOY `auth/routes.ts`
// (deuda heredada, no nueva: ese archivo está grandfathered en el allowlist
// de tenancy y este módulo no lo toca).
//
// LA RAMA `member` DELEGA en `ReferralService.resolveReferralCode` — el
// CONTEXT prohíbe generalizar o editar ese método, así que el acceso a
// `users.referral_code` vive enteramente dentro de `referrals/service.ts`,
// fuera del alcance de este archivo.
//
// NUNCA LANZA (T-157-11): es una pieza consumida por el bloque best-effort
// del alta — cualquier error de base se atrapa, se loguea con `log.warn` y
// devuelve `{ kind: "unknown" }`. Un código inexistente y un error interno
// son indistinguibles para el llamador, a propósito (T-179-06): ninguno de
// los dos puede bloquear el registro ni revelar si un código existe.

import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import { referralPartners, branches, promoPlans } from "../../db/schema";
import { tenantWhere } from "../shared/tenant";
import { ReferralService } from "../referrals/service";
import { normalizeCode } from "./service";
import type { PartnerBenefitType } from "./types";

type DbInstance = MySql2Database<typeof schema>;

/**
 * Resultado de resolver un código de registro — union discriminada por
 * `kind`, las 4 ramas posibles. El cliente NUNCA manda `partnerId` ni
 * `benefitValue`: viajan solo acá, leídos server-side de la fila del partner
 * (T-179-05).
 */
export type SignupCode =
  | {
      kind: "partner";
      partnerId: number;
      tenantId: number;
      branchId: number;
      benefitType: PartnerBenefitType;
      benefitValue: number;
    }
  | { kind: "member"; referrerId: number }
  | { kind: "promo"; promoId: number }
  | { kind: "unknown" };

/**
 * Resuelve un string de código de registro a una de las 4 ramas de
 * {@link SignupCode}. Nunca lanza (ver docblock del módulo). El código se
 * normaliza (`normalizeCode`, upper + strip) antes de buscar en cualquiera de
 * los 3 espacios, así que `"cafex"`, `" CAFEX "` y `"CAFE-X"` resuelven igual.
 */
export async function resolveSignupCode(
  db: DbInstance,
  log: FastifyBaseLogger,
  code: string,
  opts: { branchId?: number | null },
): Promise<SignupCode> {
  try {
    const normalized = normalizeCode(code);
    if (!normalized) {
      return { kind: "unknown" };
    }

    // Deriva el tenant UNA sola vez (si hay sede) y lo reusa en las dos ramas
    // que lo necesitan. `tenantId: branches.tenantId` en la proyección deja
    // el gimnasio visible en el statement — no es un filtro, es una
    // dereferencia por PK (branchId es dato público del selector de sede).
    let tenantId: number | null = null;
    if (opts.branchId != null) {
      const [branch] = await db
        .select({ tenantId: branches.tenantId })
        .from(branches)
        .where(eq(branches.id, opts.branchId))
        .limit(1);
      tenantId = branch?.tenantId ?? null;
    }

    const partnerResult = await resolvePartner(db, log, normalized, tenantId);
    if (partnerResult) {
      return partnerResult;
    }

    const promoResult = await resolvePromo(db, normalized, tenantId);
    if (promoResult) {
      return promoResult;
    }

    // Rama socio: a diferencia de partner/promo, el código de socio
    // (`generateReferralCode`, `referrals/service.ts`) tiene formato
    // `PREFIJO-XXXX` — el GUION es parte del código, no un separador
    // cosmético a stripear. `normalized` (via `normalizeCode`, que arranca
    // todo lo no-alfanumérico) nunca matchearía un `users.referral_code`
    // real. Se preserva el guion: solo trim + upper (mismo criterio de
    // tolerancia a mayúsculas/espacios que las otras 2 ramas, sin tocar
    // `resolveReferralCode`, prohibido de editar por el CONTEXT).
    // T-173-08 (tren v6.0): `resolveReferralCode` exige `ctx` — el código de
    // socio es UNIQUE compuesto con tenant_id (el mismo código puede existir
    // en dos gimnasios). Sin sede elegida (tenant no derivable) la rama socio
    // no puede resolverse de forma segura y se saltea — mismo criterio
    // fail-closed que el resto del resolver.
    if (tenantId !== null) {
      const memberCode = code.trim().toUpperCase();
      const referrerId = await new ReferralService(db, log).resolveReferralCode(
        { tenantId },
        memberCode,
      );
      if (referrerId !== null) {
        return { kind: "member", referrerId };
      }
    }

    return { kind: "unknown" };
  } catch (err: unknown) {
    log.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        code,
      },
      "referral-partners: fallo al resolver código de registro (graceful degradation)",
    );
    return { kind: "unknown" };
  }
}

/**
 * Rama partner. Con `tenantId` conocido, acota con `tenantWhere` (compliant,
 * un solo match posible por la unique compuesta). Sin `tenantId`, es el
 * ÚNICO acceso del módulo genuinamente sin scope de tenant: exige
 * EXACTAMENTE un match cross-tenant o resuelve `unknown` (ver el
 * `tenant-safe` pegado abajo). Un partner inactivo (`is_active = 0`) también
 * resuelve `unknown` — NO cae a la rama promo/socio, porque los 3 espacios
 * son disjuntos (D-03): si matcheó acá, es el único lugar donde puede matchear.
 */
async function resolvePartner(
  db: DbInstance,
  log: FastifyBaseLogger,
  code: string,
  tenantId: number | null,
): Promise<SignupCode | null> {
  if (tenantId !== null) {
    const [partner] = await db
      .select({
        id: referralPartners.id,
        tenantId: referralPartners.tenantId,
        branchId: referralPartners.branchId,
        benefitType: referralPartners.benefitType,
        benefitValue: referralPartners.benefitValue,
        isActive: referralPartners.isActive,
      })
      .from(referralPartners)
      .where(
        and(
          tenantWhere(referralPartners, { tenantId }),
          eq(referralPartners.code, code),
        ),
      )
      .limit(1);
    if (!partner) {
      return null;
    }
    if (!partner.isActive) {
      return { kind: "unknown" };
    }
    return {
      kind: "partner",
      partnerId: partner.id,
      tenantId: partner.tenantId,
      branchId: partner.branchId,
      benefitType: partner.benefitType as PartnerBenefitType,
      benefitValue: partner.benefitValue,
    };
  }

  /* tenant-safe: resolución de código en ruta pública sin scope; el tenant se deriva de la fila del partner (fuente legítima documentada en shared/tenant.ts) y la ambigüedad multi-tenant se resuelve como desconocida */
  const candidates = await db
    .select({
      id: referralPartners.id,
      tenantId: referralPartners.tenantId,
      branchId: referralPartners.branchId,
      benefitType: referralPartners.benefitType,
      benefitValue: referralPartners.benefitValue,
      isActive: referralPartners.isActive,
    })
    .from(referralPartners)
    .where(eq(referralPartners.code, code));

  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length > 1) {
    log.warn(
      { code },
      "referral-partners: código de partner ambiguo entre tenants sin branchId, se resuelve como desconocido",
    );
    return { kind: "unknown" };
  }

  const [partner] = candidates;
  if (!partner.isActive) {
    return { kind: "unknown" };
  }
  return {
    kind: "partner",
    partnerId: partner.id,
    tenantId: partner.tenantId,
    branchId: partner.branchId,
    benefitType: partner.benefitType as PartnerBenefitType,
    benefitValue: partner.benefitValue,
  };
}

/**
 * Rama promo. Con `tenantId` conocido, acota con `tenantWhere` — mejora
 * sobre el bloque promo actual de `auth/routes.ts` (que nunca tuvo scope).
 * Sin `tenantId`, replica EXACTAMENTE ese comportamiento heredado (deuda
 * preexistente, no nueva: `promoPlans.promoCode` no es unique global desde la
 * fase 168, pero el bloque de auth nunca se migró a tenantWhere). El
 * `tenantWhere(` de la rama con-tenant queda en el mismo statement que la
 * rama sin-tenant (ternario), así que el sitio entero es compliant con el
 * lint de tenancy sin necesitar una exención aparte.
 */
async function resolvePromo(
  db: DbInstance,
  code: string,
  tenantId: number | null,
): Promise<SignupCode | null> {
  const [promo] = await db
    .select({ id: promoPlans.id, isActive: promoPlans.isActive })
    .from(promoPlans)
    .where(
      tenantId !== null
        ? and(
            tenantWhere(promoPlans, { tenantId }),
            eq(promoPlans.promoCode, code),
          )
        : eq(promoPlans.promoCode, code),
    )
    .limit(1);

  if (!promo || !promo.isActive) {
    return null;
  }
  return { kind: "promo", promoId: promo.id };
}
