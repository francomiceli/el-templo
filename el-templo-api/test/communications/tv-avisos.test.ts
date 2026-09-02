/**
 * Fase 193 Plan 07 (COM-04, D-23/D-24/D-29) — integración HTTP contra
 * `createTestApp()` de las 5 rutas de avisos de TV bajo
 * `/api/communications/tv`. Casos del plan:
 *   (1) CRUD feliz: crear con mode:'manual' sin sedes -> aparece en el
 *       listado; editar título; borrar
 *   (2) D-29: un coach recibe 403 en POST/PUT/DELETE de /admin/tv-avisos,
 *       y 200 en GET /control/tv-aviso-activo de una sede que opera
 *   (3) sedes: un coach que NO opera la sede pedida recibe el rechazo de
 *       requireBranchAccess; un POST con scopeBranchIds que incluye una
 *       sede de otro tenant -> 400
 *   (4) alcance: un aviso con scope_branch_ids:[A] no aparece en
 *       getActiveForBranch(B); con null aparece en las dos
 *   (5) borrado seguro: con tv_class_state apuntando al aviso, el DELETE
 *       responde 200 y la fila de estado queda screen='class'/tv_aviso_id
 *       NULL, sin error de FK
 *   (6) módulo apagado (D-23): con templo-training OFF, las 5 rutas
 *       responden el 4xx del guard de módulo
 *   (7) aislamiento: un PUT/DELETE con id de aviso de TV de otro tenant
 *       -> 404, nunca 403
 *
 * LIMPIEZA (193-03, L2): `tv_avisos` NO está en `TABLES_TO_CLEAN`
 * (`test/helpers.ts`) — sin semilla de sistema (a diferencia de `avisos`),
 * así que este archivo la limpia entera en cada `beforeEach` (mismo
 * criterio que `avisos-admin.test.ts`). `tv_class_state` SÍ está en
 * `TABLES_TO_CLEAN` — `cleanAllTestData` la vacía sola.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/communications/tv-avisos.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql, and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  todayStr,
} from "../helpers";
import { tvAvisos, tvClassState, branches } from "../../src/db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_TEMPLO,
} from "../fixtures/second-tenant";
import { setModuleFlag, restoreTemploFlags } from "../fixtures/module-flags";

const BASE = "/api/communications/tv";
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const COACH_EMAIL = "coach-193-07@test.com";
const COACH_PASSWORD = "coachpass123";

/** 193-03 (L2): `tv_avisos` no tiene semilla de sistema — limpieza global. */
async function limpiarTvAvisosDeLaBateria(app: FastifyInstance): Promise<void> {
  await app.db.execute(
    sql`/* tenant-safe: limpieza global de prueba (patron cleanAllTestData), tv_avisos no tiene semilla de sistema */ DELETE FROM tv_avisos`,
  );
}

function getComo(url: string, token: string) {
  return app.inject({
    method: "GET",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function postComo(url: string, token: string, payload?: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function putComo(url: string, token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "PUT",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function deleteComo(url: string, token: string) {
  return app.inject({
    method: "DELETE",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function buildValidTvAvisoBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    title: "Aviso de TV de prueba 193-07",
    body: "Cuerpo del aviso de TV de prueba",
    mode: "manual",
    ...overrides,
  };
}

let app: FastifyInstance;
let adminToken: string;
let branchA: number;
let branchB: number;
let coachToken: string;

beforeAll(async () => {
  app = await createTestApp();
  // admin@test.com es 'owner' (test/setup.ts) — cubre ADMIN_ROLES (D-29) y
  // bypassea requireBranchAccess (Regla 2, owner) para el uso de branchA/B.
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  // branchA = la sede sembrada por test/setup.ts (code 'TEST'). branchB es
  // una SEGUNDA sede de El Templo, creada una sola vez para todo el archivo
  // (mismo criterio que test/branch-access.test.ts): el coach de este
  // archivo SOLO opera branchA.
  const [testBranch] = await app.db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.code, "TEST"))
    .limit(1);
  if (!testBranch) {
    throw new Error("Sede 'TEST' no encontrada — ¿corrió test/setup.ts?");
  }
  branchA = testBranch.id;

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const [branchBRow] = await app.db
    .insert(branches)
    .values({
      name: "Sede B 193-07",
      code: `B193-${suffix}`.slice(0, 20),
      country: "AR",
      isActive: true,
      timezone: "America/Argentina/Buenos_Aires",
      isVirtual: false,
    })
    .$returningId();
  branchB = branchBRow.id;
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarTvAvisosDeLaBateria(app);
  await app.db.delete(branches).where(eq(branches.id, branchB));
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await limpiarTvAvisosDeLaBateria(app);
  // cleanAllTestData borra TODOS los users salvo admin@test.com — el coach
  // se re-siembra en cada test, operando SOLO branchA.
  await createStaffUser(app, {
    email: COACH_EMAIL,
    password: COACH_PASSWORD,
    firstName: "Coach",
    lastName: "193-07",
    role: "coach",
    branchId: branchA,
  });
  coachToken = await getAuthToken(app, COACH_EMAIL, COACH_PASSWORD);
});

afterEach(async () => {
  // module-flags.ts (176-01): todo test que toque flags DEBE restaurar acá
  // — dejar un módulo apagado filtra al siguiente archivo del mismo worker
  // (`isolate: false`). Idempotente para los tests que no tocan flags.
  await restoreTemploFlags(app);
});

describe("communications/tv-avisos (COM-04, D-24/D-29)", () => {
  it("(1) CRUD feliz: crear sin sedes aparece en el listado, editar título, borrar", async () => {
    const createRes = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildValidTvAvisoBody(),
    );
    expect(createRes.statusCode, createRes.body).toBe(201);
    const created = JSON.parse(createRes.body) as {
      id: number;
      title: string;
      mode: string;
      isActive: boolean;
      scopeBranchIds: number[] | null;
    };
    expect(created.mode).toBe("manual");
    expect(created.isActive).toBe(false);
    expect(created.scopeBranchIds).toBeNull();

    const listRes = await getComo("/admin/tv-avisos", adminToken);
    expect(listRes.statusCode, listRes.body).toBe(200);
    const listBody = JSON.parse(listRes.body) as {
      avisos: Array<{ id: number; title: string }>;
    };
    expect(listBody.avisos.some((a) => a.id === created.id)).toBe(true);

    const putRes = await putComo(`/admin/tv-avisos/${created.id}`, adminToken, {
      title: "Título editado 193-07",
    });
    expect(putRes.statusCode, putRes.body).toBe(200);
    expect((JSON.parse(putRes.body) as { title: string }).title).toBe(
      "Título editado 193-07",
    );

    const delRes = await deleteComo(`/admin/tv-avisos/${created.id}`, adminToken);
    expect(delRes.statusCode, delRes.body).toBe(200);

    const listAfter = await getComo("/admin/tv-avisos", adminToken);
    const bodyAfter = JSON.parse(listAfter.body) as {
      avisos: Array<{ id: number }>;
    };
    expect(bodyAfter.avisos.some((a) => a.id === created.id)).toBe(false);
  });

  it("(2) D-29: un coach recibe 403 en POST/PUT/DELETE admin, y 200 en GET control de su sede", async () => {
    const createRes = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildValidTvAvisoBody({ isActive: true }),
    );
    const created = JSON.parse(createRes.body) as { id: number };

    const post = await postComo(
      "/admin/tv-avisos",
      coachToken,
      buildValidTvAvisoBody(),
    );
    expect(post.statusCode).toBe(403);

    const put = await putComo(`/admin/tv-avisos/${created.id}`, coachToken, {
      title: "hackeado",
    });
    expect(put.statusCode).toBe(403);

    const del = await deleteComo(`/admin/tv-avisos/${created.id}`, coachToken);
    expect(del.statusCode).toBe(403);

    const control = await getComo(
      `/control/tv-aviso-activo?branchId=${branchA}`,
      coachToken,
    );
    expect(control.statusCode, control.body).toBe(200);
    const controlBody = JSON.parse(control.body) as {
      aviso: { id: number; title: string; body: string; mode: string } | null;
    };
    expect(controlBody.aviso?.id).toBe(created.id);
  });

  it("(3a) sedes: un coach que NO opera branchB recibe el rechazo de requireBranchAccess", async () => {
    const res = await getComo(
      `/control/tv-aviso-activo?branchId=${branchB}`,
      coachToken,
    );
    expect(res.statusCode, res.body).toBe(403);
    const body = JSON.parse(res.body) as { code?: string };
    expect(body.code).toBe("BRANCH_OUT_OF_SCOPE");
  });

  it("(3b) sedes: POST con scopeBranchIds que incluye una sede de otro tenant -> 400", async () => {
    const gym2 = await seedSecondTenant(app);
    try {
      const res = await postComo(
        "/admin/tv-avisos",
        adminToken,
        buildValidTvAvisoBody({ scopeBranchIds: [branchA, gym2.branchId] }),
      );
      expect(res.statusCode, res.body).toBe(400);

      const listRes = await getComo("/admin/tv-avisos", adminToken);
      const listBody = JSON.parse(listRes.body) as { avisos: unknown[] };
      expect(listBody.avisos).toHaveLength(0);
    } finally {
      await limpiarSegundoGimnasio(app);
    }
  });

  it("(4) alcance: scope_branch_ids:[A] no aparece en getActiveForBranch(B); null aparece en las dos", async () => {
    const scoped = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildValidTvAvisoBody({
        title: "Aviso solo branchA",
        isActive: true,
        scopeBranchIds: [branchA],
      }),
    );
    const scopedId = (JSON.parse(scoped.body) as { id: number }).id;

    const unscoped = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildValidTvAvisoBody({
        title: "Aviso todas las sedes",
        isActive: true,
        scopeBranchIds: null,
      }),
    );
    const unscopedId = (JSON.parse(unscoped.body) as { id: number }).id;

    // adminToken es 'owner': bypassea requireBranchAccess (Regla 2), así que
    // puede consultar branchA y branchB sin sembrar un segundo coach.
    const resA = await getComo(
      `/control/tv-aviso-activo?branchId=${branchA}`,
      adminToken,
    );
    const bodyA = JSON.parse(resA.body) as { aviso: { id: number } | null };
    // El más reciente (id desc) entre los dos que aplican a branchA es el
    // recién creado sin scope (unscopedId > scopedId).
    expect(bodyA.aviso?.id).toBe(unscopedId);

    const resB = await getComo(
      `/control/tv-aviso-activo?branchId=${branchB}`,
      adminToken,
    );
    const bodyB = JSON.parse(resB.body) as { aviso: { id: number } | null };
    // Solo el aviso SIN scope aplica a branchB — el de scope [branchA] no.
    expect(bodyB.aviso?.id).toBe(unscopedId);
    expect(bodyB.aviso?.id).not.toBe(scopedId);
  });

  it("(5) borrado seguro: DELETE con tv_class_state apuntando al aviso limpia la referencia sin error de FK", async () => {
    const createRes = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildValidTvAvisoBody({ isActive: true }),
    );
    const created = JSON.parse(createRes.body) as { id: number };

    await app.db.insert(tvClassState).values(
      tenantValues(CTX_TEMPLO, {
        branchId: branchA,
        classDate: todayStr(),
        blockRole: "INITIUM",
        level: "avanzado",
        screen: "aviso",
        tvAvisoId: created.id,
      }),
    );

    const delRes = await deleteComo(`/admin/tv-avisos/${created.id}`, adminToken);
    expect(delRes.statusCode, delRes.body).toBe(200);

    const [stateRow] = await app.db
      .select({ screen: tvClassState.screen, tvAvisoId: tvClassState.tvAvisoId })
      .from(tvClassState)
      .where(
        and(tenantWhere(tvClassState, CTX_TEMPLO), eq(tvClassState.branchId, branchA)),
      )
      .limit(1);
    expect(stateRow?.screen).toBe("class");
    expect(stateRow?.tvAvisoId).toBeNull();
  });

  it("(6) módulo apagado (D-23): con templo-training OFF, las 5 rutas responden 4xx del guard", async () => {
    const createRes = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildValidTvAvisoBody({ isActive: true }),
    );
    const created = JSON.parse(createRes.body) as { id: number };

    await setModuleFlag(app, TENANT_TEMPLO, "templo-training", false);

    const list = await getComo("/admin/tv-avisos", adminToken);
    expect(list.statusCode).toBe(404);

    const post = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildValidTvAvisoBody(),
    );
    expect(post.statusCode).toBe(404);

    const put = await putComo(`/admin/tv-avisos/${created.id}`, adminToken, {
      title: "no debería aplicar",
    });
    expect(put.statusCode).toBe(404);

    const del = await deleteComo(`/admin/tv-avisos/${created.id}`, adminToken);
    expect(del.statusCode).toBe(404);

    const control = await getComo(
      `/control/tv-aviso-activo?branchId=${branchA}`,
      coachToken,
    );
    expect(control.statusCode).toBe(404);
  });

  it("(7) aislamiento: PUT/DELETE con id de aviso de TV de otro tenant -> 404, nunca 403", async () => {
    const gym2 = await seedSecondTenant(app);
    try {
      const [result] = await app.db.insert(tvAvisos).values(
        tenantValues(
          { tenantId: gym2.tenantId },
          {
            title: "Aviso del gimnasio 2",
            body: "Cuerpo del gimnasio 2",
            mode: "manual" as const,
            isActive: false,
          },
        ),
      );
      const gym2AvisoId = Number(result.insertId);

      const putRes = await putComo(`/admin/tv-avisos/${gym2AvisoId}`, adminToken, {
        title: "intento cross-tenant",
      });
      expect(putRes.statusCode, putRes.body).toBe(404);

      const delRes = await deleteComo(`/admin/tv-avisos/${gym2AvisoId}`, adminToken);
      expect(delRes.statusCode, delRes.body).toBe(404);
    } finally {
      await limpiarSegundoGimnasio(app);
    }
  });
});
