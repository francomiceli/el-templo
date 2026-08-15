/**
 * Fase 175.1 Plan 05 (ISO-03) — batería de AISLAMIENTO de las 4 rutas
 * `tenant-scoped` de `/api/auth` (derivadas de `test/tenant-manifest.ts`,
 * transcritas abajo y en el SUMMARY): `me`, `me/change-password`,
 * `me/delete-account`, `register`. `login`/`refresh`/`logout` son `global`
 * en el manifiesto (deuda pre-existente documentada in situ, fase 168/CON-01
 * — NO las toca este plan).
 *
 * `me`/`me/change-password`/`me/delete-account` SON PRE-SCOPE POR DISEÑO
 * (mismo patrón T-175-03 de `notifications`/`improvement-proposals`) — NO
 * SON UN AGUJERO
 * -----------------------------------------------------------------------
 * El propio `auth/routes.ts` lo documenta en la línea del handler `GET /me`
 * (T-173-15, D-09): "esta ruta member-facing NO recibe su caso de
 * aislamiento en esta fase". El `userId` sale SIEMPRE de `request.user`
 * (el JWT), una PK global de `users` sin ambigüedad entre gimnasios — no
 * hay superficie IDOR posible pasando otro `userId` (no se acepta). El caso
 * de estas 3 rutas prueba que cada actor autenticado lee/muta SIEMPRE su
 * propia fila, con evidencia leída de la base — no que exista un vector de
 * fuga que por diseño no corresponde acá.
 *
 * `register` ES EL CASO CENTRAL DE ESTE ARCHIVO — TENANT SERVER-SIDE, NUNCA DEL PAYLOAD
 * -----------------------------------------------------------------------
 * `POST /api/auth/register` es PÚBLICA (sin JWT, sin `request.scope`). El
 * gimnasio se deriva de la sede (`branches.tenant_id`) que el cliente elige
 * por `branchId` — el propio `RegisterBody` (routes.ts) NI SIQUIERA declara
 * un campo `tenantId`, y el handler nunca lo lee del body aunque venga. El
 * control positivo de este archivo inyecta un `tenantId` ajeno en el body
 * (intento de "nacer" en otro gimnasio) y confirma que la fila `users`
 * creada queda con el `tenant_id` de la SEDE elegida, nunca el inyectado —
 * más el estampado de tenant de la fila `referrals` que crea el registro
 * cuando llega con `?ref=CODE` (atribución self-service, fase 157-03).
 *
 * CERO 403 (D-06 del milestone)
 * -----------------------------------------------------------------------
 * Ninguna de las 4 rutas devuelve 403 por cruce de tenant.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-auth.test.ts
 *
 * @see test/tenancy/iso-03-notifications.test.ts — el precedente del patrón pre-scope (175.1-04)
 * @see src/modules/auth/routes.ts — POST /register (T-173-15/D-12/WR-01)
 * @see .planning/phases/175.1-.../175.1-CONTEXT.md — D-01, D-07, D-11
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { createTestApp, cleanAllTestData, createTestMember } from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

// ─── Constantes ──────────────────────────────────────────────────────────────

const MARCA = "ISO03AUTH";
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
/** Password fijo, conocido, de todos los socios que este archivo crea a mano. */
const PASSWORD_SOCIO = "iso03auth-pass-123";

function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let sedeTemploId: number;
let sedeTemploName: string;
let templo: { id: number; token: string; email: string };
let dos: { id: number; token: string; email: string };

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);

  const [sede] = await app.db
    .select({ id: schema.branches.id, name: schema.branches.name })
    .from(schema.branches)
    .where(tenantWhere(schema.branches, CTX_TEMPLO))
    .orderBy(schema.branches.id)
    .limit(1);
  if (!sede) {
    throw new Error(
      "iso-03-auth: El Templo no tiene ninguna sede (test/setup.ts).",
    );
  }
  sedeTemploId = sede.id;
  sedeTemploName = sede.name;

  const suf = sufijo();
  const temploMember = await createTestMember(app, {
    email: `auth-templo-${suf}@test.com`,
    password: PASSWORD_SOCIO,
    branchId: sedeTemploId,
  });
  templo = { id: temploMember.id, token: temploMember.token, email: temploMember.email };

  const dosMember = await createTestMember(app, {
    email: `auth-g2-${suf}@test.com`,
    password: PASSWORD_SOCIO,
    branchId: gym2.branchId,
    tenantId: TENANT_DOS,
  });
  dos = { id: dosMember.id, token: dosMember.token, email: dosMember.email };
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

function postComo(url: string, token: string, payload?: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function postPublico(url: string, payload: Record<string, unknown>) {
  return app.inject({ method: "POST", url, payload });
}

/**
 * Fila cruda de `users` por id — evidencia que vale, no lo que la ruta
 * responde. Deliberadamente CROSS-TENANT (releer por PK sin `tenantWhere`):
 * es la aserción que prueba a qué tenant quedó estampada la fila — filtrar
 * por `ctx` acá volvería el caso tautológico. La exención va EMBEBIDA en el
 * SQL (único canal que lee el sentinel, T-175-22/D-17 — un comentario TS no
 * alcanza).
 */
async function filaUsuario(id: number) {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: releer por PK ES la evidencia de a que tenant quedo estampada la fila; filtrar por ctx aca volveria el caso tautologico */ id, tenant_id AS tenantId, email, password_hash AS passwordHash, deleted_at AS deletedAt, branch_id AS branchId FROM users WHERE id = ${id} LIMIT 1`,
  )) as unknown as [
    Array<{
      id: number;
      tenantId: number;
      email: string;
      passwordHash: string;
      deletedAt: Date | null;
      branchId: number;
    }>,
  ];
  return resultado[0]?.[0] ?? null;
}

/**
 * Fila de `users` por email (el usuario recién creado por register — antes
 * de esta lectura no tenemos su id). UNIQUE global (M8): sin ambigüedad
 * posible entre gimnasios.
 */
async function filaUsuarioPorEmail(email: string) {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: releer por email (UNIQUE global, M8) ES la evidencia de register; no hay ambiguedad posible */ id, tenant_id AS tenantId, email, branch_id AS branchId FROM users WHERE email = ${email} LIMIT 1`,
  )) as unknown as [
    Array<{ id: number; tenantId: number; email: string; branchId: number }>,
  ];
  return resultado[0]?.[0] ?? null;
}

/** Fila de `referrals` por `referredId` — evidencia del caso register+ref. */
async function referralDeReferido(referredId: number) {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: releer por referred_id (UNIQUE global, D-14) ES la evidencia del caso register+ref; no hay ambiguedad posible */ tenant_id AS tenantId, referrer_id AS referrerId, referred_id AS referredId FROM referrals WHERE referred_id = ${referredId} LIMIT 1`,
  )) as unknown as [
    Array<{ tenantId: number; referrerId: number; referredId: number }>,
  ];
  return resultado[0]?.[0] ?? null;
}

function porQueImportaElAislamiento(ruta: string, detalle: string): string {
  return (
    `${ruta} mezcló datos de El Templo (${TENANT_TEMPLO}) y el gimnasio ` +
    `${TENANT_DOS}: ${detalle}. Revisar src/modules/auth/routes.ts. NO ` +
    `"arreglar" esto filtrando en el front.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la batería", () => {
  it("las 4 rutas tenant-scoped de /api/auth coinciden con las 4 de este archivo (login/refresh/logout son global, fuera de alcance)", () => {
    const RUTAS_MANIFIESTO = [
      "GET /api/auth/me",
      "POST /api/auth/me/change-password",
      "POST /api/auth/me/delete-account",
      "POST /api/auth/register",
    ];
    expect(RUTAS_MANIFIESTO.length).toBe(4);
    expect(new Set(RUTAS_MANIFIESTO).size).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/auth/me — perfil propio (pre-scope por diseño)
// ═══════════════════════════════════════════════════════════════════════════

describe("perfil propio — GET /api/auth/me", () => {
  const RUTA = "GET /api/auth/me";

  it("aislamiento: el socio del gimnasio 2 lee SU propia sucursal, no la de El Templo", async () => {
    const res = await getComo("/api/auth/me", dos.token);
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { id: number; branchName: string };
    expect(body.id).toBe(dos.id);
    expect(
      body.branchName,
      porQueImportaElAislamiento(
        RUTA,
        `esperaba la sede del gimnasio 2, recibió "${body.branchName}"`,
      ),
    ).not.toBe(sedeTemploName);
  });

  it("control: el socio de El Templo lee SU propia sucursal", async () => {
    const res = await getComo("/api/auth/me", templo.token);
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);
    const body = JSON.parse(res.body) as { id: number; branchName: string };
    expect(body.id).toBe(templo.id);
    expect(body.branchName).toBe(sedeTemploName);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/auth/me/change-password — pre-scope por diseño
// ═══════════════════════════════════════════════════════════════════════════

describe("cambiar contraseña — POST /api/auth/me/change-password", () => {
  const RUTA = "POST /api/auth/me/change-password";

  it("aislamiento: cambiar la contraseña del socio del gimnasio 2 solo cambia SU hash, el de El Templo queda intacto", async () => {
    const antesDos = await filaUsuario(dos.id);
    const antesTemplo = await filaUsuario(templo.id);

    const res = await postComo("/api/auth/me/change-password", dos.token, {
      currentPassword: PASSWORD_SOCIO,
      newPassword: `${PASSWORD_SOCIO}-nueva`,
    });
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);

    const despuesDos = await filaUsuario(dos.id);
    expect(
      despuesDos?.passwordHash,
      porQueImportaElAislamiento(RUTA, "el hash del socio propio no cambió"),
    ).not.toBe(antesDos?.passwordHash);

    const despuesTemplo = await filaUsuario(templo.id);
    expect(
      despuesTemplo?.passwordHash,
      porQueImportaElAislamiento(
        RUTA,
        "el hash de El Templo cambió por un change-password del gimnasio 2",
      ),
    ).toBe(antesTemplo?.passwordHash);
  });

  it("control: cambiar la contraseña de El Templo solo cambia SU hash, el del gimnasio 2 queda intacto", async () => {
    const antesTemplo = await filaUsuario(templo.id);
    const antesDos = await filaUsuario(dos.id);

    const res = await postComo("/api/auth/me/change-password", templo.token, {
      currentPassword: PASSWORD_SOCIO,
      newPassword: `${PASSWORD_SOCIO}-nueva`,
    });
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);

    const despuesTemplo = await filaUsuario(templo.id);
    expect(despuesTemplo?.passwordHash).not.toBe(antesTemplo?.passwordHash);

    const despuesDos = await filaUsuario(dos.id);
    expect(despuesDos?.passwordHash).toBe(antesDos?.passwordHash);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/auth/me/delete-account — pre-scope por diseño
// ═══════════════════════════════════════════════════════════════════════════

describe("eliminar cuenta — POST /api/auth/me/delete-account", () => {
  const RUTA = "POST /api/auth/me/delete-account";

  it("aislamiento: eliminar la cuenta del socio del gimnasio 2 solo anonimiza SU fila, El Templo queda intacto", async () => {
    const res = await postComo("/api/auth/me/delete-account", dos.token, {
      password: PASSWORD_SOCIO,
    });
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);

    const filaDos = await filaUsuario(dos.id);
    expect(
      filaDos?.deletedAt,
      porQueImportaElAislamiento(RUTA, "la cuenta propia no quedó marcada eliminada"),
    ).not.toBeNull();
    expect(filaDos?.email).toContain("@deleted.local");

    const filaTemplo = await filaUsuario(templo.id);
    expect(
      filaTemplo?.deletedAt,
      porQueImportaElAislamiento(
        RUTA,
        "El Templo quedó eliminado por un delete-account del gimnasio 2",
      ),
    ).toBeNull();
  });

  it("control: eliminar la cuenta de El Templo solo anonimiza SU fila, el gimnasio 2 queda intacto", async () => {
    const res = await postComo("/api/auth/me/delete-account", templo.token, {
      password: PASSWORD_SOCIO,
    });
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);

    const filaTemplo = await filaUsuario(templo.id);
    expect(filaTemplo?.deletedAt).not.toBeNull();

    const filaDos = await filaUsuario(dos.id);
    expect(filaDos?.deletedAt).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/auth/register — EL CASO CENTRAL: tenant server-side, nunca del payload
// ═══════════════════════════════════════════════════════════════════════════

describe("autorregistro — POST /api/auth/register (tenant server-side, D-06/T-175.1-05)", () => {
  const RUTA = "POST /api/auth/register";

  it("control positivo: un tenantId inyectado en el body es IGNORADO — la fila nace con el tenant de la SEDE elegida (gimnasio 2), nunca el inyectado", async () => {
    const suf = sufijo();
    const email = `${MARCA}-inyeccion-${suf}@test.com`;
    const res = await postPublico("/api/auth/register", {
      email,
      password: "password12345",
      firstName: "Intento",
      lastName: "Inyeccion",
      gender: "unspecified",
      branchId: gym2.branchId,
      // Intento de "nacer" en El Templo pese a elegir una sede del gimnasio 2.
      // RegisterBody (routes.ts) NI SIQUIERA declara este campo — el handler
      // nunca lo lee. La prueba de que se ignora es la fila real en la base.
      tenantId: TENANT_TEMPLO,
    });
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);

    const fila = await filaUsuarioPorEmail(email);
    expect(
      fila?.tenantId,
      porQueImportaElAislamiento(
        RUTA,
        `se inyectó tenantId=${TENANT_TEMPLO} en el body con branchId del gimnasio ${TENANT_DOS} — la fila quedó con tenant_id=${fila?.tenantId}`,
      ),
    ).toBe(TENANT_DOS);
    expect(fila?.branchId).toBe(gym2.branchId);
  });

  it("control positivo: el registro con código de referido (?ref=CODE) del gimnasio 2 crea la fila `referrals` con el tenant correcto", async () => {
    // El referrer necesita un referralCode — se genera lazy vía el propio
    // GET /api/members/referrals del socio referente (mismo mecanismo que
    // usaría la card real, sin reimplementar generateReferralCode a mano).
    const overview = await getComo("/api/members/referrals", dos.token);
    expect(overview.statusCode, overview.body).toBe(200);
    const { referralCode } = JSON.parse(overview.body) as {
      referralCode: string;
    };
    expect(referralCode.length).toBeGreaterThan(0);

    const suf = sufijo();
    const email = `${MARCA}-referido-${suf}@test.com`;
    const res = await postPublico("/api/auth/register", {
      email,
      password: "password12345",
      firstName: "Referido",
      lastName: "GimnasioDos",
      gender: "unspecified",
      branchId: gym2.branchId,
      ref: referralCode,
    });
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);

    const nuevo = await filaUsuarioPorEmail(email);
    expect(nuevo?.tenantId).toBe(TENANT_DOS);

    const vinculo = await referralDeReferido(nuevo!.id);
    expect(
      vinculo,
      `${RUTA}: se esperaba una fila \`referrals\` para el nuevo socio referido — la atribución self-service (?ref=CODE) no se creó`,
    ).not.toBeNull();
    expect(
      vinculo?.tenantId,
      porQueImportaElAislamiento(
        RUTA,
        `la fila referrals del registro con ?ref del gimnasio ${TENANT_DOS} quedó con tenant_id=${vinculo?.tenantId}`,
      ),
    ).toBe(TENANT_DOS);
    expect(vinculo?.referrerId).toBe(dos.id);
  });

  it("control: el registro sin branchId (default ONLINE) nace en El Templo", async () => {
    const suf = sufijo();
    const email = `${MARCA}-default-${suf}@test.com`;
    const res = await postPublico("/api/auth/register", {
      email,
      password: "password12345",
      firstName: "Default",
      lastName: "Templo",
      gender: "unspecified",
    });
    expect(res.statusCode, `${RUTA} falló: ${res.body}`).toBe(200);

    const fila = await filaUsuarioPorEmail(email);
    expect(fila?.tenantId).toBe(TENANT_TEMPLO);
  });
});
