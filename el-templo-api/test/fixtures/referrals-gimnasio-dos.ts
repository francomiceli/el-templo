/**
 * Fase 175.1 Plan 05 (ISO-03) — el segundo gimnasio (y su equivalente ajeno en
 * El Templo) para las 3 rutas NUEVAS de `referrals`, sembrable en una llamada.
 *
 * QUE CUBRE Y QUE NO (D-06 del CONTEXT)
 * -----------------------------------------------------------------------
 * Las 2 rutas `GET`/`POST /api/admin/members/:userId/referrals` YA tienen su
 * caso + control en `iso-03-members-ficha.test.ts:490,692` (fase 173-27,
 * porque matchean el prefijo `/api/admin/members`). Este archivo NO las
 * re-siembra ni re-testea — solo alimenta las 3 rutas realmente NUEVAS de
 * este plan:
 *   - `GET /api/admin/referrals/ab-results` (staff, agregado)
 *   - `GET /api/members/referrals` (socio, propio)
 *   - `POST /api/members/referrals/cta-click` (socio, escritura best-effort)
 *
 * EL VINCULO REFERRER/REFERRED CON APELLIDO COLISIONANTE
 * -----------------------------------------------------------------------
 * Mismo criterio que `members-gimnasio-dos.ts` (173-26, apellido
 * "Aislado173" compartido): el referrer de El Templo y el del gimnasio 2
 * comparten el MISMO apellido a propósito ({@link APELLIDO_COLISION}), así
 * el caso de `GET /api/members/referrals` (`getReferralOverview` →
 * resolución de `fullName` de la contraparte, `service.ts` líneas ~340-350)
 * no puede pasar en verde "por casualidad" — la aserción que vale es el
 * `userId` devuelto (un entero, sin ambigüedad posible), no el nombre.
 *
 * REFERRALS YA ESTA EN `TABLES_TO_CLEAN` (test/helpers.ts)
 * -----------------------------------------------------------------------
 * Igual que `campaigns-gimnasio-dos.ts`/`notifications-gimnasio-dos.ts`:
 * `cleanAllTestData` ya vacía `referrals` y `referral_cta_clicks` SIN filtro
 * de tenant en cada `beforeEach`. Este archivo no necesita una función de
 * limpieza propia — los usuarios que crea (`createTestMember`) los limpia
 * `cleanAllTestData` (El Templo) o `limpiarSegundoGimnasio` (gimnasio 2).
 *
 * @see test/fixtures/second-tenant.ts — el esqueleto del gimnasio 2
 * @see test/fixtures/notifications-gimnasio-dos.ts — el precedente inmediato (175.1-04)
 * @see test/tenancy/iso-03-members-ficha.test.ts:490,692 — las 2 rutas ya cubiertas (173-27)
 * @see .planning/phases/175.1-.../175.1-CONTEXT.md — D-01, D-06, D-07, D-11
 */
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { createTestMember } from "../helpers";
import { TENANT_DOS, TENANT_TEMPLO, type SegundoGimnasio } from "./second-tenant";

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Contexto de escritura del gimnasio 2. */
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };

/** Contexto de escritura de El Templo. */
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };

/** Prefijo grepeable de todo lo que este archivo siembra. */
export const MARCA_ISO03REF = "ISO03REF";

/**
 * Apellido COMPARTIDO por el referrer de El Templo y el del gimnasio 2 (ver
 * docblock del archivo) — el insumo del caso de colisión de nombre.
 */
export const APELLIDO_COLISION = `${MARCA_ISO03REF}Colision`;

/** Sufijo único por corrida, mismo generador que el resto de la batería. */
function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Forma de los handles ────────────────────────────────────────────────────

interface FichaReferralsComun {
  branchId: number;
  /** El que trae — apellido {@link APELLIDO_COLISION} en AMBOS tenants. */
  referrerId: number;
  referrerToken: string;
  /** El traído — su GET /api/members/referrals ve `referredBy`. */
  referredId: number;
  referredToken: string;
  /** La fila de `referrals` que vincula ambos, ya sembrada. */
  referralId: number;
}

/** El recurso ajeno: el vínculo de referidos de El Templo. */
export interface FichaReferralsTemplo extends FichaReferralsComun {}

/** Lo propio: el vínculo de referidos del gimnasio 2. */
export interface FichaReferralsGimnasioDos extends FichaReferralsComun {}

// ─── Evidencia leída de la BASE ──────────────────────────────────────────────

/** Una fila de `referral_cta_clicks`, releída de la base por `userId` (la más nueva). */
export interface CtaClickLeido {
  id: number;
  tenantId: number;
  variant: string;
}

export async function ultimoCtaClickDeUsuario(
  app: FastifyInstance,
  userId: number,
): Promise<CtaClickLeido | null> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: releer el cta-click mas nuevo de ESTE userId ES la asercion del caso — la ruta responde 204 sin body, no hay otra forma de verificar el tenant estampado */ id, tenant_id AS tenantId, variant FROM referral_cta_clicks WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1`,
  )) as unknown as [Array<{ id: number; tenantId: number; variant: string }>];
  return resultado[0]?.[0] ?? null;
}

// ─── Siembra: El Templo (recurso ajeno) ─────────────────────────────────────

/**
 * Siembra el vínculo de referidos de El Templo: el recurso AJENO que el
 * socio del gimnasio 2 no tiene que poder leer desde `GET /members/referrals`.
 */
export async function sembrarReferralsTemplo(
  app: FastifyInstance,
): Promise<FichaReferralsTemplo> {
  const suf = sufijo();

  const [sede] = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(tenantWhere(schema.branches, CTX_TEMPLO))
    .orderBy(schema.branches.id)
    .limit(1);
  if (!sede) {
    throw new Error(
      "sembrarReferralsTemplo: El Templo no tiene ninguna sede. La siembra " +
        "test/setup.ts — revisar ese archivo.",
    );
  }

  const referrer = await createTestMember(app, {
    email: `ref-referrer-templo-${suf}@test.com`,
    branchId: sede.id,
    lastName: APELLIDO_COLISION,
  });
  const referred = await createTestMember(app, {
    email: `ref-referred-templo-${suf}@test.com`,
    branchId: sede.id,
  });

  const [row] = await app.db
    .insert(schema.referrals)
    .values(
      tenantValues(CTX_TEMPLO, {
        referrerId: referrer.id,
        referredId: referred.id,
        status: "pending" as const,
        attributionChannel: "assisted" as const,
      }),
    )
    .$returningId();

  return {
    branchId: sede.id,
    referrerId: referrer.id,
    referrerToken: referrer.token,
    referredId: referred.id,
    referredToken: referred.token,
    referralId: row.id,
  };
}

// ─── Siembra: gimnasio 2 (lo propio) ────────────────────────────────────────

/**
 * Siembra el vínculo de referidos del gimnasio 2. Va SIEMPRE después de
 * `seedSecondTenant` (necesita `gym2.branchId`).
 */
export async function sembrarReferralsGimnasioDos(
  app: FastifyInstance,
  gym2: SegundoGimnasio,
): Promise<FichaReferralsGimnasioDos> {
  const suf = sufijo();

  const referrer = await createTestMember(app, {
    email: `ref-referrer-g2-${suf}@test.com`,
    branchId: gym2.branchId,
    tenantId: TENANT_DOS,
    lastName: APELLIDO_COLISION,
  });
  const referred = await createTestMember(app, {
    email: `ref-referred-g2-${suf}@test.com`,
    branchId: gym2.branchId,
    tenantId: TENANT_DOS,
  });

  const [row] = await app.db
    .insert(schema.referrals)
    .values(
      tenantValues(CTX_DOS, {
        referrerId: referrer.id,
        referredId: referred.id,
        status: "pending" as const,
        attributionChannel: "assisted" as const,
      }),
    )
    .$returningId();

  return {
    branchId: gym2.branchId,
    referrerId: referrer.id,
    referrerToken: referrer.token,
    referredId: referred.id,
    referredToken: referred.token,
    referralId: row.id,
  };
}
