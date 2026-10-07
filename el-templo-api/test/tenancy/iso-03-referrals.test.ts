/**
 * Fase 175.1 Plan 05 (ISO-03) — batería de AISLAMIENTO de las 3 rutas
 * `tenant-scoped` NUEVAS de `referrals` (derivadas de `test/tenant-manifest.ts`,
 * transcritas abajo y en el SUMMARY).
 *
 * LAS 2 RUTAS QUE ESTE ARCHIVO **NO** CUBRE — YA ESTÁN PROBADAS (D-06)
 * -----------------------------------------------------------------------
 * `GET`/`POST /api/admin/members/:userId/referrals` matchean el prefijo
 * `/api/admin/members` (no `/api/admin/referrals` ni `/api/members/referrals`)
 * y YA tienen su caso + control positivo en
 * `iso-03-members-ficha.test.ts:490,692` (fase 173-27):
 *   - línea 490: `describe("referidos de la ficha — GET /api/admin/members/:userId/referrals")`
 *   - línea 692: `describe("asignar referidor — POST /api/admin/members/:userId/referrals")`
 * Referencia literal para el gate de cobertura (175.1-06,
 * `EXCEPCIONES_NOMBRADAS`): NO re-testear acá, NO perderlas del conteo.
 *
 * LAS 5 RUTAS QUE SÍ CUBRE ESTE ARCHIVO
 * -----------------------------------------------------------------------
 *   - `GET /api/admin/referrals/ab-results` — staff, agregado.
 *   - `GET /api/members/referrals` — socio, propio.
 *   - `POST /api/members/referrals/cta-click` — socio, escritura best-effort.
 *   - `GET /api/members/referrals/invitations/eligibility` — socio (fase
 *     194-10): un código de OTRO gimnasio no resuelve (404, nunca 403).
 *   - `POST /api/members/referrals/invitations/activate` — socio (fase
 *     194-10): idem, y no escribe ninguna fila en ningún gimnasio.
 *
 * `GET /api/admin/referrals/ab-results` — ACOTADO AL GIMNASIO DEL REQUEST
 * (decisión de Franco 2026-08-18; revierte la exención global de 173/175-04)
 * -----------------------------------------------------------------------
 * `ReferralService.getAbTestResults(ctx)` (`referrals/service.ts`) ahora recibe
 * `ctx` y sus 3 queries filtran por `tenantWhere(tabla, ctx)` como el resto del
 * módulo. Cada gimnasio ve SOLO sus propios números por variante — dejó de ser
 * una superficie de negocio cross-tenant.
 *
 * El test de esta ruta, entonces, SÍ es un caso de aislamiento: un clic del
 * gimnasio 2 y un clic de El Templo NO aparecen en los mismos números. El staff
 * del gimnasio 2 ve solo su propio delta (+1), nunca el de El Templo (evita el
 * +2 que probaría fuga). "Cero 403" se verifica para cada staff sobre SU propio
 * gimnasio (el gate de ROL — `ANALYTICS_OPERATIONAL_ROLES` — sigue vigente).
 *
 * CERO 403 (D-06 del milestone) EN LAS OTRAS 2 RUTAS
 * -----------------------------------------------------------------------
 * Un id/relación ajena siempre resuelve 404 o "no trae nada", NUNCA 403.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-referrals.test.ts
 *
 * @see test/fixtures/referrals-gimnasio-dos.ts
 * @see test/tenancy/iso-03-members-ficha.test.ts — las 2 rutas ya cubiertas (173-27)
 * @see test/tenancy/iso-03-notifications.test.ts — el precedente inmediato (175.1-04)
 * @see .planning/phases/175.1-.../175.1-CONTEXT.md — D-01, D-06, D-07, D-11
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  createActiveSub,
  createMembershipPlan,
  createTrialPlan,
  fixtureCtx,
  uniquePhone10,
} from "../invitations/_helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  sembrarReferralsTemplo,
  sembrarReferralsGimnasioDos,
  ultimoCtaClickDeUsuario,
  APELLIDO_COLISION,
  type FichaReferralsTemplo,
  type FichaReferralsGimnasioDos,
} from "../fixtures/referrals-gimnasio-dos";

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: FichaReferralsTemplo;
let dos: FichaReferralsGimnasioDos;
let templeAdminToken: string;

beforeAll(async () => {
  app = await createTestApp();
  // admin@test.com es 'owner' (test/setup.ts) — cubre ANALYTICS_OPERATIONAL_ROLES.
  templeAdminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
  templo = await sembrarReferralsTemplo(app);
  dos = await sembrarReferralsGimnasioDos(app, gym2);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades ──────────────────────────────────────────────────────────────

function getComo(url: string, token: string) {
  return app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${token}` },
  });
}

function postComo(url: string, token: string) {
  return app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Mensaje compartido de los rojos de AISLAMIENTO. */
function porQueImportaElAislamiento(ruta: string, detalle: string): string {
  return (
    `${ruta} mezcló datos de El Templo (${TENANT_TEMPLO}) y el gimnasio ` +
    `${TENANT_DOS}: ${detalle}. Revisar el \`tenantWhere(tabla, ctx)\` del ` +
    `método que sirve esta ruta en los .ts de src/modules/referrals. NO ` +
    `"arreglar" esto filtrando en el front.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la batería", () => {
  it("las 5 rutas de este archivo son las que faltan del manifiesto (las otras 2 ya las cubre iso-03-members-ficha.test.ts:490,692)", () => {
    const RUTAS_NUEVAS_DE_ESTE_ARCHIVO = [
      "GET /api/admin/referrals/ab-results",
      "GET /api/members/referrals",
      "POST /api/members/referrals/cta-click",
      "GET /api/members/referrals/invitations/eligibility",
      "POST /api/members/referrals/invitations/activate",
    ];
    expect(RUTAS_NUEVAS_DE_ESTE_ARCHIVO.length).toBe(5);
    expect(new Set(RUTAS_NUEVAS_DE_ESTE_ARCHIVO).size).toBe(5);
  });

  it("el referrer de El Templo y el del gimnasio 2 comparten el MISMO apellido a propósito (insumo del caso de colisión de nombre)", async () => {
    expect(templo.referrerId).not.toBe(dos.referrerId);
    // La evidencia de que comparten apellido vale por construcción del
    // fixture (APELLIDO_COLISION en ambos sembrados) — este test documenta
    // la precondición, no la vuelve a sembrar.
    expect(APELLIDO_COLISION.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/members/referrals — overview propio (socio)
// ═══════════════════════════════════════════════════════════════════════════

describe("ver mis referidos — GET /api/members/referrals", () => {
  const RUTA = "GET /api/members/referrals";

  it("aislamiento: el referido del gimnasio 2 ve a SU referrer por userId, no al de El Templo (mismo apellido en ambos, NO alcanza para pasar en verde por casualidad)", async () => {
    const res = await getComo("/api/members/referrals", dos.referredToken);
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      referredBy: { userId: number; fullName: string } | null;
      invitations: { inviteUrl: string; invitees: Array<{ userId: number }> };
      invitedBy: { inviterId: number } | null;
    };
    // Fase 194-19: los bloques nuevos también son del gimnasio del token — el
    // referido de G2 no tiene invitados ni invitador de El Templo.
    expect(Array.isArray(body.invitations.invitees)).toBe(true);
    expect(
      body.invitations.invitees.some((i) => i.userId === templo.referrerId),
      porQueImportaElAislamiento(
        RUTA,
        "invitations.invitees mezcló usuarios de El Templo",
      ),
    ).toBe(false);
    expect(body.invitedBy?.inviterId ?? null).not.toBe(templo.referrerId);
    expect(
      body.referredBy?.userId,
      porQueImportaElAislamiento(
        RUTA,
        `esperaba referredBy.userId=${dos.referrerId} (propio), recibió ${body.referredBy?.userId}`,
      ),
    ).toBe(dos.referrerId);
    expect(
      body.referredBy?.userId,
      porQueImportaElAislamiento(
        RUTA,
        `referredBy.userId coincide con el referrer de El Templo (${templo.referrerId}) — filtró por apellido en vez de por tenant`,
      ),
    ).not.toBe(templo.referrerId);
    expect(body.referredBy?.fullName).toContain(APELLIDO_COLISION);
  });

  it("control: el referido de El Templo ve a SU referrer por userId, no al del gimnasio 2", async () => {
    const res = await getComo("/api/members/referrals", templo.referredToken);
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as {
      referredBy: { userId: number; fullName: string } | null;
    };
    expect(body.referredBy?.userId).toBe(templo.referrerId);
    expect(body.referredBy?.userId).not.toBe(dos.referrerId);
    expect(body.referredBy?.fullName).toContain(APELLIDO_COLISION);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/members/referrals/cta-click — escritura best-effort (socio)
// ═══════════════════════════════════════════════════════════════════════════

describe("click en el CTA — POST /api/members/referrals/cta-click", () => {
  const RUTA = "POST /api/members/referrals/cta-click";

  it("aislamiento: el clic del socio del gimnasio 2 queda estampado TENANT_DOS en referral_cta_clicks", async () => {
    const res = await postComo(
      "/api/members/referrals/cta-click",
      dos.referredToken,
    );
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(204);
    const fila = await ultimoCtaClickDeUsuario(app, dos.referredId);
    expect(
      fila?.tenantId,
      porQueImportaElAislamiento(
        RUTA,
        `el clic del socio del gimnasio ${TENANT_DOS} quedó con tenant_id=${fila?.tenantId}`,
      ),
    ).toBe(TENANT_DOS);
  });

  it("control: el clic del socio de El Templo queda estampado TENANT_TEMPLO en referral_cta_clicks", async () => {
    const res = await postComo(
      "/api/members/referrals/cta-click",
      templo.referredToken,
    );
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(204);
    const fila = await ultimoCtaClickDeUsuario(app, templo.referredId);
    expect(fila?.tenantId).toBe(TENANT_TEMPLO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Invitaciones del socio (fase 194-10) — el código de OTRO gimnasio no resuelve
// ═══════════════════════════════════════════════════════════════════════════

/** Le pone un código de invitación propio a un socio (fila de SU gimnasio). */
async function darCodigoDeInvitacion(
  userId: number,
  tenantId: number,
  code: string,
): Promise<void> {
  await app.db
    .update(schema.users)
    .set({ referralCode: code })
    .where(
      and(tenantWhere(schema.users, { tenantId }), eq(schema.users.id, userId)),
    );
}

/**
 * Invitador de El Templo listo para invitar: membresía vigente, plan Invitación
 * del país de la sede del fixture y código `ISO03INV-TEMPLO`. `subscription_plans`
 * se vacía en cada `beforeEach`, por eso se siembra dentro de cada caso.
 */
async function sembrarInvitadorConMembresiaTemplo() {
  const ctxTemplo = fixtureCtx(app, TENANT_TEMPLO);
  const [sede] = await app.db
    .select({ country: schema.branches.country })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, ctxTemplo.tenant),
        eq(schema.branches.id, templo.branchId),
      ),
    );
  const country = sede?.country === "ES" ? "ES" : "AR";
  await createTrialPlan(ctxTemplo, { country });
  const plan = await createMembershipPlan(ctxTemplo, { country });
  await createActiveSub(ctxTemplo, {
    userId: templo.referrerId,
    planId: plan.id,
    branchId: templo.branchId,
  });
  await darCodigoDeInvitacion(
    templo.referrerId,
    TENANT_TEMPLO,
    "ISO03INV-TEMPLO",
  );
  return ctxTemplo;
}

/** Ids de TODAS las sedes de un gimnasio (para comprobar pertenencia, no filtrar). */
async function idsDeSedes(tenantId: number): Promise<number[]> {
  const filas = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(tenantWhere(schema.branches, { tenantId }));
  return filas.map((f) => f.id);
}

describe("invitaciones: elegibilidad — GET /api/members/referrals/invitations/eligibility", () => {
  const RUTA = "GET /api/members/referrals/invitations/eligibility";
  const URL_ELEGIBILIDAD = "/api/members/referrals/invitations/eligibility";

  interface PreviewBody {
    inviterFirstName: string | null;
    branches: Array<{ id: number }>;
  }

  it("aislamiento: el socio del gimnasio 2 con el código de un invitador de El Templo recibe 404 (no 403) y nada del otro gimnasio", async () => {
    await darCodigoDeInvitacion(
      templo.referrerId,
      TENANT_TEMPLO,
      "ISO03INV-TEMPLO",
    );

    const res = await getComo(
      `${URL_ELEGIBILIDAD}?code=ISO03INV-TEMPLO`,
      dos.referredToken,
    );
    expect(
      res.statusCode,
      porQueImportaElAislamiento(
        RUTA,
        `el código de El Templo resolvió desde el gimnasio ${TENANT_DOS} (status ${res.statusCode}): ${res.body}`,
      ),
    ).toBe(404);
    expect(res.body).not.toContain(APELLIDO_COLISION);
    expect((JSON.parse(res.body) as { reason: string }).reason).toBe(
      "inviter_not_found",
    );
  });

  it("aislamiento inverso: el socio de El Templo con el código del gimnasio 2 recibe 404", async () => {
    await darCodigoDeInvitacion(dos.referrerId, TENANT_DOS, "ISO03INV-DOS");

    const res = await getComo(
      `${URL_ELEGIBILIDAD}?code=ISO03INV-DOS`,
      templo.referredToken,
    );
    expect(res.statusCode, porQueImportaElAislamiento(RUTA, res.body)).toBe(
      404,
    );
  });

  it("control: cada socio ve el código de SU gimnasio (200) y solo las sedes físicas de SU gimnasio", async () => {
    await darCodigoDeInvitacion(
      templo.referrerId,
      TENANT_TEMPLO,
      "ISO03INV-TEMPLO",
    );
    await darCodigoDeInvitacion(dos.referrerId, TENANT_DOS, "ISO03INV-DOS");

    const comoTemplo = await getComo(
      `${URL_ELEGIBILIDAD}?code=ISO03INV-TEMPLO`,
      templo.referredToken,
    );
    expect(comoTemplo.statusCode, comoTemplo.body).toBe(200);
    const bodyTemplo = JSON.parse(comoTemplo.body) as PreviewBody;
    // Las sedes de El Templo (el fixture puede estar en una inactiva o virtual,
    // por eso no se exige `templo.branchId`): ofrece alguna y TODAS son suyas.
    const sedesTemplo = await idsDeSedes(TENANT_TEMPLO);
    expect(bodyTemplo.branches.length).toBeGreaterThan(0);
    for (const sede of bodyTemplo.branches) {
      expect(sedesTemplo).toContain(sede.id);
    }
    expect(bodyTemplo.branches.map((b) => b.id)).not.toContain(dos.branchId);

    const comoDos = await getComo(
      `${URL_ELEGIBILIDAD}?code=ISO03INV-DOS`,
      dos.referredToken,
    );
    expect(comoDos.statusCode, comoDos.body).toBe(200);
    const bodyDos = JSON.parse(comoDos.body) as PreviewBody;
    const sedesDos = await idsDeSedes(TENANT_DOS);
    for (const sede of bodyDos.branches) {
      expect(
        sedesDos,
        porQueImportaElAislamiento(
          RUTA,
          `el selector de sedes del gimnasio 2 incluyó la sede ${sede.id}, que no es suya`,
        ),
      ).toContain(sede.id);
    }
    expect(bodyDos.branches.map((b) => b.id)).not.toContain(templo.branchId);
  });
});

describe("invitaciones: activación — POST /api/members/referrals/invitations/activate", () => {
  const RUTA = "POST /api/members/referrals/invitations/activate";
  const URL_ACTIVAR = "/api/members/referrals/invitations/activate";

  function activar(token: string, payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: URL_ACTIVAR,
      payload,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  /** Filas de `invitations` de AMBOS gimnasios: la ruta no tiene que escribir en ninguno. */
  async function filasDeInvitaciones(): Promise<number> {
    let total = 0;
    for (const tenantId of [TENANT_TEMPLO, TENANT_DOS]) {
      const filas = await app.db
        .select({ id: schema.invitations.id })
        .from(schema.invitations)
        .where(tenantWhere(schema.invitations, { tenantId }));
      total += filas.length;
    }
    return total;
  }

  it("aislamiento: el socio del gimnasio 2 activando con el código de El Templo recibe 404 y NO se escribe ninguna invitación", async () => {
    await darCodigoDeInvitacion(
      templo.referrerId,
      TENANT_TEMPLO,
      "ISO03INV-TEMPLO",
    );
    const antes = await filasDeInvitaciones();

    const res = await activar(dos.referredToken, {
      code: "ISO03INV-TEMPLO",
      branchId: dos.branchId,
      phone: uniquePhone10(),
    });
    expect(
      res.statusCode,
      porQueImportaElAislamiento(
        RUTA,
        `el código de El Templo activó desde el gimnasio ${TENANT_DOS} (status ${res.statusCode}): ${res.body}`,
      ),
    ).toBe(404);
    expect(await filasDeInvitaciones()).toBe(antes);
  });

  it("aislamiento: la sede de otro gimnasio como destino resuelve 404 y no escribe filas", async () => {
    await sembrarInvitadorConMembresiaTemplo();
    const antes = await filasDeInvitaciones();

    const res = await activar(templo.referredToken, {
      code: "ISO03INV-TEMPLO",
      branchId: dos.branchId,
      phone: uniquePhone10(),
    });
    expect(res.statusCode, porQueImportaElAislamiento(RUTA, res.body)).toBe(
      404,
    );
    expect(await filasDeInvitaciones()).toBe(antes);
  });

  it("control: el socio de El Templo activa con el código de SU gimnasio (201) y la fila queda estampada TENANT_TEMPLO", async () => {
    const ctxTemplo = await sembrarInvitadorConMembresiaTemplo();

    const res = await activar(templo.referredToken, {
      code: "ISO03INV-TEMPLO",
      branchId: templo.branchId,
      phone: uniquePhone10(),
    });
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(201);

    const [fila] = await app.db
      .select({
        tenantId: schema.invitations.tenantId,
        invitedUserId: schema.invitations.invitedUserId,
      })
      .from(schema.invitations)
      .where(
        and(
          tenantWhere(schema.invitations, ctxTemplo.tenant),
          eq(schema.invitations.invitedUserId, templo.referredId),
        ),
      );
    expect(fila?.tenantId).toBe(TENANT_TEMPLO);
    expect(fila?.invitedUserId).toBe(templo.referredId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/admin/referrals/ab-results — ACOTADO AL GIMNASIO (ver docblock)
// ═══════════════════════════════════════════════════════════════════════════

describe("resultados A/B — GET /api/admin/referrals/ab-results (acotado al gimnasio, T-175.1)", () => {
  const RUTA = "GET /api/admin/referrals/ab-results";

  /** Suma de totalClicks de todas las variantes en un body de ab-results. */
  function totalClicksDe(body: string): number {
    const parsed = JSON.parse(body) as {
      variants: Array<{ totalClicks: number }>;
    };
    return parsed.variants.reduce((suma, v) => suma + v.totalClicks, 0);
  }

  it("aislamiento: un clic del gimnasio 2 y uno de El Templo NO se mezclan — cada staff ve SOLO el +1 de su propio gimnasio (nunca +2)", async () => {
    // Baseline por-tenant (cada uno visto por SU propio staff).
    const baseGdos = totalClicksDe(
      (await getComo("/api/admin/referrals/ab-results", gym2.adminToken)).body,
    );
    const baseTemplo = totalClicksDe(
      (await getComo("/api/admin/referrals/ab-results", templeAdminToken)).body,
    );

    // Un clic de CADA tenant.
    await postComo("/api/members/referrals/cta-click", dos.referredToken);
    await postComo("/api/members/referrals/cta-click", templo.referredToken);

    // El staff del gimnasio 2 ve SOLO su propio clic (+1), no el de El Templo.
    const gdos = await getComo(
      "/api/admin/referrals/ab-results",
      gym2.adminToken,
    );
    expect(gdos.statusCode, `${RUTA} falló: ${gdos.body}`).toBe(200);
    const totalGdos = totalClicksDe(gdos.body);
    expect(
      totalGdos,
      porQueImportaElAislamiento(
        RUTA,
        `el staff del gimnasio ${TENANT_DOS} vio ${totalGdos} clics (esperaba ` +
          `${baseGdos + 1}=solo el suyo); si es ${baseGdos + 2} la ruta contó ` +
          `también el clic de El Templo`,
      ),
    ).toBe(baseGdos + 1);

    // El staff de El Templo ve SOLO su propio clic (+1), no el del gimnasio 2.
    const comoTemplo = await getComo(
      "/api/admin/referrals/ab-results",
      templeAdminToken,
    );
    expect(comoTemplo.statusCode, comoTemplo.body).toBe(200);
    const totalTemplo = totalClicksDe(comoTemplo.body);
    expect(
      totalTemplo,
      porQueImportaElAislamiento(
        RUTA,
        `el staff de El Templo vio ${totalTemplo} clics (esperaba ` +
          `${baseTemplo + 1}=solo el suyo)`,
      ),
    ).toBe(baseTemplo + 1);
  });

  it("cero 403: cada staff con rol operativo (gestion/admin/owner) accede a los números de SU gimnasio — el gate de ROL sigue vigente sobre el scope propio", async () => {
    const comoGdos = await getComo(
      "/api/admin/referrals/ab-results",
      gym2.adminToken,
    );
    expect(comoGdos.statusCode).toBe(200);
    const comoTemplo = await getComo(
      "/api/admin/referrals/ab-results",
      templeAdminToken,
    );
    expect(comoTemplo.statusCode).toBe(200);
  });
});
