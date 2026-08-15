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
 * LAS 3 RUTAS QUE SÍ CUBRE ESTE ARCHIVO
 * -----------------------------------------------------------------------
 *   - `GET /api/admin/referrals/ab-results` — staff, agregado.
 *   - `GET /api/members/referrals` — socio, propio.
 *   - `POST /api/members/referrals/cta-click` — socio, escritura best-effort.
 *
 * `GET /api/admin/referrals/ab-results` ES DELIBERADAMENTE GLOBAL — NO ES UN CASO
 * DE AISLAMIENTO CONVENCIONAL (hallazgo de este plan, ya revisado y shippeado en
 * fase 175-04)
 * -----------------------------------------------------------------------
 * `ReferralService.getAbTestResults()` (`referrals/service.ts` líneas ~657-703)
 * NO recibe `ctx` — sus 3 queries llevan una exención `tenant-safe` EMBEBIDA en
 * el SQL, con el motivo transcrito literal: "A/B test global de todo el sistema
 * de referidos (...); acotarlo por gimnasio cambiaria lo que la metrica mide".
 * Esta decisión ya fue tomada y shippeada por la fase 175 (`175-04-SUMMARY.md`
 * línea 84: "getAbTestResults con exención propia por statement"), NO es un
 * hallazgo nuevo de este plan ni algo que este plan deba corregir (Rule 4 —
 * cambio arquitectónico, fuera de alcance de una batería de tests).
 *
 * El test de esta ruta, entonces, no busca un 404/403 cross-tenant — busca
 * DOCUMENTAR Y VERIFICAR el comportamiento global tal como está diseñado: un
 * clic del gimnasio 2 y un clic de El Templo aparecen en LOS MISMOS números,
 * vistos por CUALQUIER staff con acceso (gym2 o Templo). "Cero 403" acá se
 * cumple trivialmente porque la ruta nunca filtró por tenant — el gate es
 * solo de ROL (`ANALYTICS_OPERATIONAL_ROLES`), no de gimnasio.
 *
 * ⚠ NOTA PARA FRANCO (flag, no fix): en un SaaS multi-tenant, un tab de
 * Analíticas de CUALQUIER gimnasio mostrando el volumen A/B combinado de
 * TODOS los gimnasios es una superficie de negocio cross-tenant real (no
 * solo un detalle de implementación) — vale una revisión de producto cuando
 * se onboardee el segundo gimnasio de verdad (fuera del alcance de 175.1-05).
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
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
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
    `método que sirve esta ruta en src/modules/referrals/*.ts. NO "arreglar" ` +
    `esto filtrando en el front.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la batería", () => {
  it("las 3 rutas NUEVAS de este archivo son las que faltan del manifiesto (las otras 2 ya las cubre iso-03-members-ficha.test.ts:490,692)", () => {
    const RUTAS_NUEVAS_DE_ESTE_ARCHIVO = [
      "GET /api/admin/referrals/ab-results",
      "GET /api/members/referrals",
      "POST /api/members/referrals/cta-click",
    ];
    expect(RUTAS_NUEVAS_DE_ESTE_ARCHIVO.length).toBe(3);
    expect(new Set(RUTAS_NUEVAS_DE_ESTE_ARCHIVO).size).toBe(3);
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
    };
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
// GET /api/admin/referrals/ab-results — DELIBERADAMENTE GLOBAL (ver docblock)
// ═══════════════════════════════════════════════════════════════════════════

describe("resultados A/B — GET /api/admin/referrals/ab-results (deliberadamente global, T-175-04)", () => {
  const RUTA = "GET /api/admin/referrals/ab-results";

  it("documentado: un clic de El Templo Y uno del gimnasio 2 aparecen en LOS MISMOS números, vistos por CUALQUIER staff (no hay filtro de tenant — por diseño, ver docblock)", async () => {
    const antes = await getComo(
      "/api/admin/referrals/ab-results",
      gym2.adminToken,
    );
    expect(antes.statusCode, `${RUTA} falló: ${antes.body}`).toBe(200);
    const bodyAntes = JSON.parse(antes.body) as {
      variants: Array<{ totalClicks: number }>;
    };
    const totalAntes = bodyAntes.variants.reduce(
      (suma, v) => suma + v.totalClicks,
      0,
    );

    // Un clic de CADA tenant.
    await postComo("/api/members/referrals/cta-click", dos.referredToken);
    await postComo("/api/members/referrals/cta-click", templo.referredToken);

    const despuesComoGdos = await getComo(
      "/api/admin/referrals/ab-results",
      gym2.adminToken,
    );
    expect(despuesComoGdos.statusCode, despuesComoGdos.body).toBe(200);
    const bodyDespuesGdos = JSON.parse(despuesComoGdos.body) as {
      variants: Array<{ totalClicks: number }>;
    };
    const totalDespuesGdos = bodyDespuesGdos.variants.reduce(
      (suma, v) => suma + v.totalClicks,
      0,
    );
    expect(
      totalDespuesGdos,
      `${RUTA}: se esperaba que el staff del gimnasio 2 viera AMBOS clics ` +
        `nuevos en el total (diseño deliberadamente global, T-175-04) — antes=${totalAntes}, después=${totalDespuesGdos}`,
    ).toBe(totalAntes + 2);

    // El staff de El Templo ve EXACTAMENTE el mismo número — misma fuente global.
    const despuesComoTemplo = await getComo(
      "/api/admin/referrals/ab-results",
      templeAdminToken,
    );
    expect(despuesComoTemplo.statusCode, despuesComoTemplo.body).toBe(200);
    const bodyDespuesTemplo = JSON.parse(despuesComoTemplo.body) as {
      variants: Array<{ totalClicks: number }>;
    };
    expect(
      bodyDespuesTemplo,
      `${RUTA}: el staff de El Templo y el del gimnasio 2 deberían ver ` +
        `EXACTAMENTE los mismos números (agregado global) — si difieren, la ` +
        `ruta dejó de ser global sin que este test se haya actualizado`,
    ).toEqual(bodyDespuesGdos);
  });

  it("cero 403: cualquier staff con rol operativo (gestion/admin/owner) de CUALQUIER gimnasio accede — el gate es de ROL, no de tenant", async () => {
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
