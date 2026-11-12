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
 *   (8) formato evento (2026-11-12, migración 0332): alta/edición con
 *       `evento`, normalización, validaciones, foto solo del R2 propio
 *       (`tv/avisos/`), vuelta a placa con `evento:null`, y la ruta
 *       `/admin/tv-avisos/image-upload-url` (roles, extensiones, 200/503)
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
import { S3Client } from "@aws-sdk/client-s3";
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

  it("(4b) 2026-10-06: `avisos` trae TODOS los manuales activos de la sede (más reciente primero), sin flex ni inactivos ni de otra sede", async () => {
    const crear = async (overrides: Record<string, unknown>) =>
      (
        JSON.parse(
          (
            await postComo(
              "/admin/tv-avisos",
              adminToken,
              buildValidTvAvisoBody({ isActive: true, scopeBranchIds: null, ...overrides }),
            )
          ).body,
        ) as { id: number }
      ).id;
    const regenerativo = await crear({ title: "Yoga regenerativo" });
    const calistenicos = await crear({ title: "Yoga para calisténicos", scopeBranchIds: [branchA] });
    await crear({ title: "Inactivo", isActive: false });
    await crear({ title: "Flex inicio", mode: "flex_inicio" });
    await crear({ title: "Solo branchB", scopeBranchIds: [branchB] });

    const res = await getComo(`/control/tv-aviso-activo?branchId=${branchA}`, adminToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      aviso: { id: number } | null;
      avisos: Array<{ id: number; title: string; mode: string }>;
    };
    expect(body.avisos.map((a) => a.id)).toEqual([calistenicos, regenerativo]);
    expect(body.avisos.every((a) => a.mode === "manual")).toBe(true);
    // Contrato original: `aviso` sigue siendo el más reciente.
    expect(body.aviso?.id).toBe(calistenicos);
  });

  it("(4c) 2026-10-06: tema claro/oscuro — default oscuro, se crea y edita, viaja al control; valor inválido -> 400", async () => {
    const sinTema = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildValidTvAvisoBody({ title: "Sin tema", isActive: true }),
    );
    expect(sinTema.statusCode, sinTema.body).toBe(201);
    const sinTemaBody = JSON.parse(sinTema.body) as { id: number; tema: string };
    expect(sinTemaBody.tema).toBe("oscuro");

    const claro = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildValidTvAvisoBody({ title: "Yoga regenerativo", isActive: true, tema: "claro" }),
    );
    expect(claro.statusCode, claro.body).toBe(201);
    const claroBody = JSON.parse(claro.body) as { id: number; tema: string };
    expect(claroBody.tema).toBe("claro");

    const control = await getComo(`/control/tv-aviso-activo?branchId=${branchA}`, adminToken);
    const controlBody = JSON.parse(control.body) as {
      avisos: Array<{ id: number; tema: string }>;
    };
    expect(controlBody.avisos.find((a) => a.id === claroBody.id)?.tema).toBe("claro");
    expect(controlBody.avisos.find((a) => a.id === sinTemaBody.id)?.tema).toBe("oscuro");

    const editado = await app.inject({
      method: "PUT",
      url: `${BASE}/admin/tv-avisos/${sinTemaBody.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tema: "claro" },
    });
    expect(editado.statusCode, editado.body).toBe(200);
    expect((JSON.parse(editado.body) as { tema: string }).tema).toBe("claro");

    const invalido = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildValidTvAvisoBody({ title: "Tema raro", tema: "gris" }),
    );
    expect(invalido.statusCode).toBe(400);
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

  it("(6) módulo apagado (D-23): con templo-training OFF, las 6 rutas responden 4xx del guard", async () => {
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

    const upload = await postComo("/admin/tv-avisos/image-upload-url", adminToken, {
      filename: "foto.jpg",
    });
    expect(upload.statusCode).toBe(404);

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

// ═══════════════════════════════════════════════════════════════════════════
// (8) Formato evento (2026-11-12, migración 0332)
// ═══════════════════════════════════════════════════════════════════════════

const R2_BASE = "https://r2.test.example";

interface EventoBody {
  fecha: string;
  hora: string;
  lugar: string;
  sello: string | null;
  imageUrl: string | null;
}

interface TvAvisoConEvento {
  id: number;
  title: string;
  body: string;
  evento: EventoBody | null;
}

function buildEvento(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fecha: "2026-11-14",
    hora: "10:00 h",
    lugar: "Cousteau · Gral. Roca 1218",
    sello: "Gratis y abierto a todos",
    ...overrides,
  };
}

function buildEventoAvisoBody(
  eventoOverrides: Record<string, unknown> = {},
  avisoOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    title: "Social Run",
    body: "Aura Club × Cousteau",
    mode: "flex_final",
    evento: buildEvento(eventoOverrides),
    ...avisoOverrides,
  };
}

describe("communications/tv-avisos — formato evento (migración 0332)", () => {
  let previoR2PublicUrl: string | undefined;

  beforeAll(() => {
    previoR2PublicUrl = process.env.R2_PUBLIC_URL;
  });

  beforeEach(() => {
    process.env.R2_PUBLIC_URL = R2_BASE;
  });

  afterAll(() => {
    if (previoR2PublicUrl === undefined) {
      delete process.env.R2_PUBLIC_URL;
    } else {
      process.env.R2_PUBLIC_URL = previoR2PublicUrl;
    }
  });

  it("(8a) un aviso sin `evento` es una placa: `evento:null` en el alta y en el listado", async () => {
    const res = await postComo("/admin/tv-avisos", adminToken, buildValidTvAvisoBody());
    expect(res.statusCode, res.body).toBe(201);
    const created = JSON.parse(res.body) as TvAvisoConEvento;
    expect(created.evento).toBeNull();

    const list = JSON.parse((await getComo("/admin/tv-avisos", adminToken)).body) as {
      avisos: TvAvisoConEvento[];
    };
    expect(list.avisos.find((a) => a.id === created.id)?.evento).toBeNull();
  });

  it("(8b) alta con evento: se guarda normalizado (trim, opcionales vacíos -> null) y viaja en el listado", async () => {
    const res = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildEventoAvisoBody({
        hora: "  10:00 h ",
        lugar: "  Cousteau · Gral. Roca 1218  ",
        sello: "   ",
        imageUrl: "",
      }),
    );
    expect(res.statusCode, res.body).toBe(201);
    const created = JSON.parse(res.body) as TvAvisoConEvento;
    expect(created.title).toBe("Social Run");
    expect(created.body).toBe("Aura Club × Cousteau");
    expect(created.evento).toEqual({
      fecha: "2026-11-14",
      hora: "10:00 h",
      lugar: "Cousteau · Gral. Roca 1218",
      sello: null,
      imageUrl: null,
    });

    const list = JSON.parse((await getComo("/admin/tv-avisos", adminToken)).body) as {
      avisos: TvAvisoConEvento[];
    };
    expect(list.avisos.find((a) => a.id === created.id)?.evento).toEqual(created.evento);

    // La fila guarda el JSON ya normalizado (lo que lee el poll del TV).
    const [row] = await app.db
      .select({ evento: tvAvisos.evento })
      .from(tvAvisos)
      .where(and(tenantWhere(tvAvisos, CTX_TEMPLO), eq(tvAvisos.id, created.id)));
    expect(row.evento).toEqual(created.evento);
  });

  it("(8c) sello y foto opcionales: sin las claves quedan en null; con sello se conserva", async () => {
    const sin = await postComo(
      "/admin/tv-avisos",
      adminToken,
      { ...buildEventoAvisoBody(), evento: { fecha: "2026-11-14", hora: "10:00 h", lugar: "Cousteau" } },
    );
    expect(sin.statusCode, sin.body).toBe(201);
    expect((JSON.parse(sin.body) as TvAvisoConEvento).evento).toEqual({
      fecha: "2026-11-14",
      hora: "10:00 h",
      lugar: "Cousteau",
      sello: null,
      imageUrl: null,
    });

    const con = await postComo("/admin/tv-avisos", adminToken, buildEventoAvisoBody());
    expect(con.statusCode, con.body).toBe(201);
    expect((JSON.parse(con.body) as TvAvisoConEvento).evento?.sello).toBe(
      "Gratis y abierto a todos",
    );
  });

  it("(8d) validaciones del evento -> 400 y no se persiste nada", async () => {
    const casos: Array<[string, Record<string, unknown>]> = [
      ["fecha con otro formato", buildEventoAvisoBody({ fecha: "14/11/2026" })],
      ["fecha inexistente", buildEventoAvisoBody({ fecha: "2026-02-30" })],
      ["fecha vacía", buildEventoAvisoBody({ fecha: "" })],
      ["hora vacía tras trim", buildEventoAvisoBody({ hora: "   " })],
      ["hora larga", buildEventoAvisoBody({ hora: "x".repeat(21) })],
      ["lugar vacío tras trim", buildEventoAvisoBody({ lugar: "  " })],
      ["lugar largo", buildEventoAvisoBody({ lugar: "x".repeat(81) })],
      ["sello largo", buildEventoAvisoBody({ sello: "x".repeat(41) })],
      ["nombre largo", buildEventoAvisoBody({}, { title: "x".repeat(41) })],
      ["subtítulo largo", buildEventoAvisoBody({}, { body: "x".repeat(61) })],
      ["fecha con espacios", buildEventoAvisoBody({ fecha: " 2026-11-14 " })],
      [
        "sin lugar",
        { ...buildEventoAvisoBody(), evento: { fecha: "2026-11-14", hora: "10:00 h" } },
      ],
      ["evento que no es objeto", { ...buildEventoAvisoBody(), evento: "social run" }],
    ];
    for (const [nombre, payload] of casos) {
      const res = await postComo("/admin/tv-avisos", adminToken, payload);
      expect(res.statusCode, `${nombre}: ${res.body}`).toBe(400);
    }

    const list = JSON.parse((await getComo("/admin/tv-avisos", adminToken)).body) as {
      avisos: unknown[];
    };
    expect(list.avisos).toHaveLength(0);
  });

  it("(8d-bis) una clave de más dentro del evento se descarta: ni se guarda ni vuelve en la respuesta", async () => {
    const res = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildEventoAvisoBody({ color: "rojo" }),
    );
    expect(res.statusCode, res.body).toBe(201);
    const created = JSON.parse(res.body) as TvAvisoConEvento;
    expect(created.evento).toEqual({
      fecha: "2026-11-14",
      hora: "10:00 h",
      lugar: "Cousteau · Gral. Roca 1218",
      sello: "Gratis y abierto a todos",
      imageUrl: null,
    });
    const [row] = await app.db
      .select({ evento: tvAvisos.evento })
      .from(tvAvisos)
      .where(and(tenantWhere(tvAvisos, CTX_TEMPLO), eq(tvAvisos.id, created.id)));
    expect(row.evento).toEqual(created.evento);
  });

  it("(8e) los límites cortos de nombre/subtítulo solo rigen para eventos: una placa sigue aceptando 120/400", async () => {
    const res = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildValidTvAvisoBody({ title: "x".repeat(120), body: "y".repeat(400) }),
    );
    expect(res.statusCode, res.body).toBe(201);
  });

  it("(8f) foto: solo se acepta una URL del R2 propio bajo tv/avisos/", async () => {
    const rechazadas = [
      "https://evil.example/tv/avisos/1-foto.jpg",
      `${R2_BASE}.evil.com/tv/avisos/1-foto.jpg`,
      `${R2_BASE}/sponsors/logos/1-foto.jpg`,
      `${R2_BASE}/tv/avisos`,
      "javascript:alert(1)",
    ];
    for (const imageUrl of rechazadas) {
      const res = await postComo(
        "/admin/tv-avisos",
        adminToken,
        buildEventoAvisoBody({ imageUrl }),
      );
      expect(res.statusCode, `${imageUrl}: ${res.body}`).toBe(400);
    }

    const ok = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildEventoAvisoBody({ imageUrl: `${R2_BASE}/tv/avisos/1-cousteau.jpg` }),
    );
    expect(ok.statusCode, ok.body).toBe(201);
    expect((JSON.parse(ok.body) as TvAvisoConEvento).evento?.imageUrl).toBe(
      `${R2_BASE}/tv/avisos/1-cousteau.jpg`,
    );

    // Con la base cargada con barra final se normaliza igual.
    process.env.R2_PUBLIC_URL = `${R2_BASE}/`;
    const conBarra = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildEventoAvisoBody({ imageUrl: `${R2_BASE}/tv/avisos/2-cousteau.jpg` }),
    );
    expect(conBarra.statusCode, conBarra.body).toBe(201);
  });

  it("(8g) sin R2_PUBLIC_URL no se puede asignar una foto, pero sí crear el evento sin foto", async () => {
    process.env.R2_PUBLIC_URL = "";
    const conFoto = await postComo(
      "/admin/tv-avisos",
      adminToken,
      buildEventoAvisoBody({ imageUrl: `${R2_BASE}/tv/avisos/1-cousteau.jpg` }),
    );
    expect(conFoto.statusCode, conFoto.body).toBe(400);

    const sinFoto = await postComo("/admin/tv-avisos", adminToken, buildEventoAvisoBody());
    expect(sinFoto.statusCode, sinFoto.body).toBe(201);
  });

  it("(8h) edición: `evento` reemplaza completo, `evento:null` vuelve a placa y sin la clave no se toca", async () => {
    const created = JSON.parse(
      (
        await postComo(
          "/admin/tv-avisos",
          adminToken,
          buildEventoAvisoBody({ imageUrl: `${R2_BASE}/tv/avisos/1-cousteau.jpg` }),
        )
      ).body,
    ) as TvAvisoConEvento;

    // Sin la clave `evento`: se conserva tal cual.
    const soloActivo = await putComo(`/admin/tv-avisos/${created.id}`, adminToken, {
      isActive: true,
    });
    expect(soloActivo.statusCode, soloActivo.body).toBe(200);
    expect((JSON.parse(soloActivo.body) as TvAvisoConEvento).evento).toEqual(created.evento);

    // Reemplazo COMPLETO: lo que no viene (sello, foto) se pierde.
    const reemplazo = await putComo(`/admin/tv-avisos/${created.id}`, adminToken, {
      evento: { fecha: "2026-12-05", hora: "9:30 h", lugar: "Parque Centenario" },
    });
    expect(reemplazo.statusCode, reemplazo.body).toBe(200);
    expect((JSON.parse(reemplazo.body) as TvAvisoConEvento).evento).toEqual({
      fecha: "2026-12-05",
      hora: "9:30 h",
      lugar: "Parque Centenario",
      sello: null,
      imageUrl: null,
    });

    // Vuelta a placa.
    const aPlaca = await putComo(`/admin/tv-avisos/${created.id}`, adminToken, {
      evento: null,
    });
    expect(aPlaca.statusCode, aPlaca.body).toBe(200);
    expect((JSON.parse(aPlaca.body) as TvAvisoConEvento).evento).toBeNull();

    // Ya como placa, el título vuelve a aceptar más de 40 caracteres.
    const tituloLargo = await putComo(`/admin/tv-avisos/${created.id}`, adminToken, {
      title: "x".repeat(100),
    });
    expect(tituloLargo.statusCode, tituloLargo.body).toBe(200);
  });

  it("(8i) edición: el estado FINAL manda — texto largo sobre un evento, o evento sobre texto largo -> 400", async () => {
    const evento = JSON.parse(
      (await postComo("/admin/tv-avisos", adminToken, buildEventoAvisoBody())).body,
    ) as TvAvisoConEvento;
    const tituloLargo = await putComo(`/admin/tv-avisos/${evento.id}`, adminToken, {
      title: "x".repeat(41),
    });
    expect(tituloLargo.statusCode, tituloLargo.body).toBe(400);
    const cuerpoLargo = await putComo(`/admin/tv-avisos/${evento.id}`, adminToken, {
      body: "y".repeat(61),
    });
    expect(cuerpoLargo.statusCode, cuerpoLargo.body).toBe(400);

    const placa = JSON.parse(
      (
        await postComo(
          "/admin/tv-avisos",
          adminToken,
          buildValidTvAvisoBody({ title: "x".repeat(100) }),
        )
      ).body,
    ) as TvAvisoConEvento;
    const aEvento = await putComo(`/admin/tv-avisos/${placa.id}`, adminToken, {
      evento: buildEvento(),
    });
    expect(aEvento.statusCode, aEvento.body).toBe(400);
    // …y con el texto corto en el mismo PUT, sí.
    const aEventoOk = await putComo(`/admin/tv-avisos/${placa.id}`, adminToken, {
      title: "Social Run",
      body: "Aura Club × Cousteau",
      evento: buildEvento(),
    });
    expect(aEventoOk.statusCode, aEventoOk.body).toBe(200);

    // Nada de lo rechazado se persistió.
    const [row] = await app.db
      .select({ title: tvAvisos.title, body: tvAvisos.body })
      .from(tvAvisos)
      .where(and(tenantWhere(tvAvisos, CTX_TEMPLO), eq(tvAvisos.id, evento.id)));
    expect(row).toEqual({ title: "Social Run", body: "Aura Club × Cousteau" });
  });

  it("(8j) edición: una foto que NO cambia no se revalida si cambió R2_PUBLIC_URL; una nueva sí", async () => {
    const imageUrl = `${R2_BASE}/tv/avisos/1-cousteau.jpg`;
    const created = JSON.parse(
      (await postComo("/admin/tv-avisos", adminToken, buildEventoAvisoBody({ imageUrl }))).body,
    ) as TvAvisoConEvento;

    process.env.R2_PUBLIC_URL = "https://otra-base.example";
    const mismaFoto = await putComo(`/admin/tv-avisos/${created.id}`, adminToken, {
      evento: buildEvento({ imageUrl, hora: "11:00 h" }),
    });
    expect(mismaFoto.statusCode, mismaFoto.body).toBe(200);
    expect((JSON.parse(mismaFoto.body) as TvAvisoConEvento).evento).toMatchObject({
      imageUrl,
      hora: "11:00 h",
    });

    const fotoNueva = await putComo(`/admin/tv-avisos/${created.id}`, adminToken, {
      evento: buildEvento({ imageUrl: `${R2_BASE}/tv/avisos/2-otra.jpg` }),
    });
    expect(fotoNueva.statusCode, fotoNueva.body).toBe(400);
  });

  it("(8k) un coach no puede crear ni editar eventos (403), igual que el resto del CRUD", async () => {
    const post = await postComo("/admin/tv-avisos", coachToken, buildEventoAvisoBody());
    expect(post.statusCode).toBe(403);

    const created = JSON.parse(
      (await postComo("/admin/tv-avisos", adminToken, buildEventoAvisoBody())).body,
    ) as TvAvisoConEvento;
    const put = await putComo(`/admin/tv-avisos/${created.id}`, coachToken, { evento: null });
    expect(put.statusCode).toBe(403);
  });

  it("(8l) el control del profe lista un evento manual activo con su título (el botón no necesita el evento)", async () => {
    const created = JSON.parse(
      (
        await postComo(
          "/admin/tv-avisos",
          adminToken,
          buildEventoAvisoBody({}, { mode: "manual", isActive: true }),
        )
      ).body,
    ) as TvAvisoConEvento;

    const control = await getComo(`/control/tv-aviso-activo?branchId=${branchA}`, coachToken);
    expect(control.statusCode, control.body).toBe(200);
    const body = JSON.parse(control.body) as { avisos: Array<{ id: number; title: string }> };
    expect(body.avisos).toEqual([
      expect.objectContaining({ id: created.id, title: "Social Run" }),
    ]);
  });
});

describe("POST /admin/tv-avisos/image-upload-url (migración 0332)", () => {
  // La firma de la URL es local (sin red). Si el entorno no tiene R2 se
  // inyecta un cliente S3 con credenciales falsas en el decorador de la app
  // (mismo patrón que test/sponsors/sponsors-admin.test.ts).
  const hadR2 = (): boolean => app.hasDecorator("r2");

  it("coach -> 403 (el guard va antes que el 503 y que la validación de R2)", async () => {
    const res = await postComo("/admin/tv-avisos/image-upload-url", coachToken, {
      filename: "foto.jpg",
    });
    expect(res.statusCode).toBe(403);
  });

  it("extensión no permitida o sin filename -> 400 (AVIF incluido: los televisores no lo decodifican)", async () => {
    for (const filename of ["foto.exe", "foto.gif", "foto.avif", "foto", "foto.jpg.exe"]) {
      const res = await postComo("/admin/tv-avisos/image-upload-url", adminToken, {
        filename,
      });
      expect(res.statusCode, filename).toBe(400);
    }
    const sinFilename = await postComo("/admin/tv-avisos/image-upload-url", adminToken, {});
    expect(sinFilename.statusCode).toBe(400);
  });

  it("sin R2 configurado -> 503", async () => {
    if (hadR2()) return; // entorno con R2 real: el caso lo cubre el test de abajo
    const res = await postComo("/admin/tv-avisos/image-upload-url", adminToken, {
      filename: "foto.jpg",
    });
    expect(res.statusCode, res.body).toBe(503);
  });

  describe("con R2", () => {
    let previoR2: S3Client | undefined;
    let previoBucket: string | undefined;
    let previoPublicUrl: string | undefined;

    beforeAll(() => {
      previoR2 = hadR2() ? app.r2 : undefined;
      previoBucket = hadR2() ? app.r2Bucket : undefined;
      previoPublicUrl = process.env.R2_PUBLIC_URL;
      app.r2 = new S3Client({
        region: "auto",
        endpoint: "https://cuenta-falsa.r2.cloudflarestorage.com",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
      });
      app.r2Bucket = "bucket-test";
    });

    beforeEach(() => {
      process.env.R2_PUBLIC_URL = R2_BASE;
    });

    afterAll(() => {
      if (previoR2 !== undefined && previoBucket !== undefined) {
        app.r2 = previoR2;
        app.r2Bucket = previoBucket;
      } else {
        Reflect.deleteProperty(app, "r2");
        Reflect.deleteProperty(app, "r2Bucket");
      }
      if (previoPublicUrl === undefined) {
        delete process.env.R2_PUBLIC_URL;
      } else {
        process.env.R2_PUBLIC_URL = previoPublicUrl;
      }
    });

    it("admin -> 200 con URL bajo tv/avisos/, y esa publicUrl se acepta como foto del evento", async () => {
      for (const filename of ["Cousteau Social Run.JPG", "foto.png", "foto.webp", "foto.jpeg"]) {
        const res = await postComo("/admin/tv-avisos/image-upload-url", adminToken, {
          filename,
        });
        expect(res.statusCode, `${filename}: ${res.body}`).toBe(200);
        const parsed = JSON.parse(res.body) as { uploadUrl: string; publicUrl: string };
        expect(parsed.publicUrl.startsWith(`${R2_BASE}/tv/avisos/`)).toBe(true);
        expect(parsed.uploadUrl).toContain("tv/avisos/");
      }

      const up = JSON.parse(
        (
          await postComo("/admin/tv-avisos/image-upload-url", adminToken, {
            filename: "cousteau.jpg",
          })
        ).body,
      ) as { publicUrl: string };
      const created = await postComo(
        "/admin/tv-avisos",
        adminToken,
        buildEventoAvisoBody({ imageUrl: up.publicUrl }),
      );
      expect(created.statusCode, created.body).toBe(201);
      expect((JSON.parse(created.body) as TvAvisoConEvento).evento?.imageUrl).toBe(up.publicUrl);
    });
  });
});
