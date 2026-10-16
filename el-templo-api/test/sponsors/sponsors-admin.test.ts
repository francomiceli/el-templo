/**
 * Patrocinadores (Fase 199, D-17..D-26) — integración HTTP contra
 * `createTestApp()` de las 7 rutas admin bajo `/api/admin/sponsors`:
 *   GET/POST /            PUT/DELETE /:id
 *   GET/PUT /settings     POST /logo-upload-url
 *
 * Cobertura:
 *   (1) Roles (D-26/D-18): sin token 401; coach, gestion y socio 403; admin de
 *       OTRO gimnasio 403 en las 7 rutas (sin tocar datos); owner y admin de
 *       El Templo 200.
 *   (2) CRUD: alta (201, inactiva por defecto, sortOrder incremental, país AR),
 *       listado con métricas en cero, edición parcial, baja, 404 inexistente,
 *       trim de textos.
 *   (3) Validaciones (D-19): contraste < 4.5, canje por código sin código,
 *       países vacíos, vigencia invertida, fecha inexistente (13/45, 30-feb),
 *       textos vacíos tras trim, hex inválido, logo no https, partner de otro
 *       gimnasio, claves de más.
 *   (3b) Logo del R2 propio (T-199-09/T-199-48): dominio ajeno, sufijo
 *       malicioso, prefijo equivocado, sin R2 configurado; el logo guardado no
 *       se revalida al editar otras columnas.
 *   (4) Límite por país (D-24): default 6, 7ª activa rechazada, otro país no
 *       cuenta, activar por PUT, subir el límite, rango inválido, AR+ES cuenta
 *       en los dos, bajar el límite no desactiva nada ni traba editar una
 *       marca ya activa (solo cuentan los países AGREGADOS), borrar libera cupo.
 *       `PUT /settings` llega a su handler y no al de `PUT /:id`.
 *   (5) Subida de logo (D-19): 200 con R2 / 503 sin R2 (después del guard),
 *       extensión inválida 400, 403 para quien no administra.
 *
 * LIMPIEZA: `sponsor_brands`, `sponsor_views` y `system_settings` están en
 * `TABLES_TO_CLEAN` (`test/helpers.ts`), así que `cleanAllTestData` las vacía.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/sponsors/sponsors-admin.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { S3Client } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  createTestMember,
  getAuthToken,
} from "../helpers";
import {
  branches,
  referralPartners,
  sponsorBrands,
  users,
} from "../../src/db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  addDays,
  DEFAULT_TENANT_TIMEZONE,
  todayInTz,
} from "../../src/modules/shared/date-utils";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const BASE = "/api/admin/sponsors";
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const COACH_EMAIL = "coach-sponsors@test.com";
const GESTION_EMAIL = "gestion-sponsors@test.com";
const ADMIN_EMAIL = "admin-sponsors@test.com";
const STAFF_PASSWORD = "staffpass123";
/** Par que falla el contraste (ratio ~2.67). */
const BAD_BG = "#c4956a";
const BAD_TEXT = "#ffffff";
/** Id que no existe (rango alto de INT, no choca con autoincrement de test). */
const MISSING_ID = 2_000_000_000;
const R2_BASE = "https://r2.test.example";

// ─── Utilidades HTTP ─────────────────────────────────────────────────────────

let app: FastifyInstance;

function req(
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  token: string | null,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url: `${BASE}${url}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload,
  });
}

// ─── Tipos de respuesta ──────────────────────────────────────────────────────

interface AdminSponsor {
  id: number;
  name: string;
  category: string;
  logoUrl: string | null;
  icon: string | null;
  bgColor: string;
  textColor: string;
  benefit: string;
  detail: string;
  conditions: string | null;
  redeemType: "code" | "carnet";
  redeemCode: string | null;
  countries: Array<"AR" | "ES">;
  startsOn: string | null;
  endsOn: string | null;
  isActive: boolean;
  sortOrder: number;
  partnerId: number | null;
  views: number;
  taps: number;
  redeems: number;
}

interface ErrorBody {
  error: string;
  message: string;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

let ownerToken: string;
let ownerId: number;
let coachToken: string;
let gestionToken: string;
let adminToken: string;
let branchA: number;

/** Cuerpo de alta mínimo y válido; `over` pisa lo que haga falta. */
function body(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Marca de prueba",
    category: "Salud",
    bgColor: "#4c6b3c",
    textColor: "#f2ede5",
    benefit: "20% OFF",
    detail: "en tu primera consulta",
    redeemType: "carnet",
    countries: ["AR"],
    ...over,
  };
}

/** Alta por API como owner; falla con el body de la respuesta si no da 201. */
async function crear(
  over: Record<string, unknown> = {},
): Promise<AdminSponsor> {
  const res = await req("POST", "", ownerToken, body(over));
  expect(res.statusCode, res.body).toBe(201);
  return (JSON.parse(res.body) as { sponsor: AdminSponsor }).sponsor;
}

async function listar(
  token: string = ownerToken,
): Promise<{ sponsors: AdminSponsor[]; maxActivePerCountry: number }> {
  const res = await req("GET", "", token);
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as {
    sponsors: AdminSponsor[];
    maxActivePerCountry: number;
  };
}

async function brandRow(id: number) {
  const [row] = await app.db
    .select()
    .from(sponsorBrands)
    .where(eq(sponsorBrands.id, id))
    .limit(1);
  return row ?? null;
}

async function setLimit(value: number): Promise<void> {
  const res = await req("PUT", "/settings", ownerToken, {
    maxActivePerCountry: value,
  });
  expect(res.statusCode, res.body).toBe(200);
}

beforeAll(async () => {
  app = await createTestApp();
  // admin@test.com es 'owner' (test/setup.ts) — cubre ADMIN_ROLES.
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  const [owner] = await app.db
    .select({ id: users.id })
    .from(users)
    .where(
      and(tenantWhere(users, CTX_TEMPLO), eq(users.email, "admin@test.com")),
    )
    .limit(1);
  if (!owner)
    throw new Error("admin@test.com no encontrado — ¿corrió test/setup.ts?");
  ownerId = owner.id;

  const [testBranch] = await app.db
    .select({ id: branches.id })
    .from(branches)
    .where(and(tenantWhere(branches, CTX_TEMPLO), eq(branches.code, "TEST")))
    .limit(1);
  if (!testBranch)
    throw new Error("Sede 'TEST' no encontrada — ¿corrió test/setup.ts?");
  branchA = testBranch.id;
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

beforeEach(async () => {
  // cleanAllTestData borra TODOS los users salvo admin@test.com y vacía
  // sponsor_brands / sponsor_views / system_settings: el staff se re-siembra.
  await cleanAllTestData(app);
  for (const [email, role, firstName] of [
    [COACH_EMAIL, "coach", "Coach"],
    [GESTION_EMAIL, "gestion", "Gestion"],
    [ADMIN_EMAIL, "admin", "Admin"],
  ] as const) {
    await createStaffUser(app, {
      email,
      password: STAFF_PASSWORD,
      firstName,
      lastName: "Sponsors",
      role,
      branchId: branchA,
    });
  }
  coachToken = await getAuthToken(app, COACH_EMAIL, STAFF_PASSWORD);
  gestionToken = await getAuthToken(app, GESTION_EMAIL, STAFF_PASSWORD);
  adminToken = await getAuthToken(app, ADMIN_EMAIL, STAFF_PASSWORD);
});

// ═══════════════════════════════════════════════════════════════════════════
// (1) Roles
// ═══════════════════════════════════════════════════════════════════════════

describe("roles (D-26/D-18)", () => {
  it("sin token las 7 rutas dan 401", async () => {
    expect((await req("GET", "", null)).statusCode).toBe(401);
    expect((await req("POST", "", null, body())).statusCode).toBe(401);
    expect((await req("PUT", "/1", null, { name: "x" })).statusCode).toBe(401);
    expect((await req("DELETE", "/1", null)).statusCode).toBe(401);
    expect((await req("GET", "/settings", null)).statusCode).toBe(401);
    expect(
      (await req("PUT", "/settings", null, { maxActivePerCountry: 3 }))
        .statusCode,
    ).toBe(401);
    expect(
      (await req("POST", "/logo-upload-url", null, { filename: "logo.png" }))
        .statusCode,
    ).toBe(401);
  });

  it("coach, gestion y socio reciben 403 en las 7 rutas y no modifican nada", async () => {
    const existente = await crear({ name: "Intacta" });
    const socio = await createTestMember(app, { branchId: branchA });

    for (const token of [coachToken, gestionToken, socio.token]) {
      expect((await req("GET", "", token)).statusCode).toBe(403);
      expect((await req("POST", "", token, body())).statusCode).toBe(403);
      expect(
        (await req("PUT", `/${existente.id}`, token, { name: "hack" }))
          .statusCode,
      ).toBe(403);
      expect((await req("DELETE", `/${existente.id}`, token)).statusCode).toBe(
        403,
      );
      expect((await req("GET", "/settings", token)).statusCode).toBe(403);
      expect(
        (await req("PUT", "/settings", token, { maxActivePerCountry: 2 }))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await req("POST", "/logo-upload-url", token, {
            filename: "logo.png",
          })
        ).statusCode,
      ).toBe(403);
    }

    const { sponsors, maxActivePerCountry } = await listar();
    expect(sponsors.map((s) => s.name)).toEqual(["Intacta"]);
    expect(maxActivePerCountry).toBe(6);
  });

  describe("admin de otro gimnasio", () => {
    let gym2: SegundoGimnasio;

    beforeEach(async () => {
      gym2 = await seedSecondTenant(app);
    });

    it("recibe 403 en las 7 rutas aunque tenga rol admin, y no modifica nada", async () => {
      const existente = await crear({ name: "De la plataforma" });
      const token = gym2.adminToken;

      expect((await req("GET", "", token)).statusCode).toBe(403);
      expect((await req("POST", "", token, body())).statusCode).toBe(403);
      expect(
        (await req("PUT", `/${existente.id}`, token, { name: "hack" }))
          .statusCode,
      ).toBe(403);
      expect((await req("DELETE", `/${existente.id}`, token)).statusCode).toBe(
        403,
      );
      expect((await req("GET", "/settings", token)).statusCode).toBe(403);
      expect(
        (await req("PUT", "/settings", token, { maxActivePerCountry: 2 }))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await req("POST", "/logo-upload-url", token, {
            filename: "logo.png",
          })
        ).statusCode,
      ).toBe(403);

      const { sponsors, maxActivePerCountry } = await listar();
      expect(sponsors).toHaveLength(1);
      expect(sponsors[0].name).toBe("De la plataforma");
      expect(maxActivePerCountry).toBe(6);
    });

    it("el coach y el socio del otro gimnasio tampoco entran", async () => {
      expect((await req("GET", "", gym2.coachToken)).statusCode).toBe(403);
      expect((await req("GET", "", gym2.socios[0].token)).statusCode).toBe(403);
    });
  });

  it("el owner y un admin de El Templo entran (200) y el admin puede crear (201)", async () => {
    expect((await req("GET", "", ownerToken)).statusCode).toBe(200);
    expect((await req("GET", "", adminToken)).statusCode).toBe(200);
    const res = await req("POST", "", adminToken, body({ name: "Del admin" }));
    expect(res.statusCode, res.body).toBe(201);
    const creada = (JSON.parse(res.body) as { sponsor: AdminSponsor }).sponsor;
    expect((await brandRow(creada.id))?.createdBy).not.toBeNull();
    expect((await brandRow(creada.id))?.createdBy).not.toBe(ownerId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (2) CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe("CRUD", () => {
  it("el alta devuelve 201, inactiva, país AR y registra quién la creó", async () => {
    const creada = await crear();
    expect(creada.isActive).toBe(false);
    expect(creada.countries).toEqual(["AR"]);
    expect(creada.sortOrder).toBe(0);
    expect(creada.redeemType).toBe("carnet");
    expect(creada.logoUrl).toBeNull();
    expect(creada.partnerId).toBeNull();
    expect((await brandRow(creada.id))?.createdBy).toBe(ownerId);
  });

  it("sortOrder es incremental cuando no se manda", async () => {
    const a = await crear({ name: "A" });
    const b = await crear({ name: "B" });
    const c = await crear({ name: "C" });
    expect([a.sortOrder, b.sortOrder, c.sortOrder]).toEqual([0, 1, 2]);

    const explicita = await crear({ name: "D", sortOrder: 40 });
    expect(explicita.sortOrder).toBe(40);
    const siguiente = await crear({ name: "E" });
    expect(siguiente.sortOrder).toBe(41);
  });

  it("el listado trae la marca con views/taps/redeems en 0 y el límite vigente", async () => {
    const creada = await crear({ name: "Listada" });
    const { sponsors, maxActivePerCountry } = await listar();
    expect(maxActivePerCountry).toBe(6);
    expect(sponsors).toHaveLength(1);
    expect(sponsors[0].id).toBe(creada.id);
    expect(sponsors[0].views).toBe(0);
    expect(sponsors[0].taps).toBe(0);
    expect(sponsors[0].redeems).toBe(0);
  });

  it("el listado incluye inactivas y vencidas, ordenadas por sortOrder", async () => {
    const hoy = todayInTz(DEFAULT_TENANT_TIMEZONE);
    await crear({ name: "Segunda", sortOrder: 5 });
    await crear({
      name: "Vencida",
      sortOrder: 1,
      startsOn: addDays(hoy, -30),
      endsOn: addDays(hoy, -10),
    });
    await crear({ name: "Activa", sortOrder: 3, isActive: true });
    const { sponsors } = await listar();
    expect(sponsors.map((s) => s.name)).toEqual([
      "Vencida",
      "Activa",
      "Segunda",
    ]);
  });

  it("hace trim de los textos y acepta vigencia con fechas de hoy en adelante", async () => {
    const hoy = todayInTz(DEFAULT_TENANT_TIMEZONE);
    const creada = await crear({
      name: "  Marca  ",
      category: " Gym ",
      benefit: " 10% ",
      detail: "  detalle  ",
      startsOn: hoy,
      endsOn: addDays(hoy, 30),
    });
    expect(creada.name).toBe("Marca");
    expect(creada.category).toBe("Gym");
    expect(creada.benefit).toBe("10%");
    expect(creada.detail).toBe("detalle");
    expect(creada.startsOn).toBe(hoy);
    expect(creada.endsOn).toBe(addDays(hoy, 30));
  });

  it("alta con canje por código guarda el código", async () => {
    const conCodigo = await crear({
      name: "Con código",
      redeemType: "code",
      redeemCode: "TEMPLO20",
    });
    expect(conCodigo.redeemType).toBe("code");
    expect(conCodigo.redeemCode).toBe("TEMPLO20");
  });

  it("alta en ES y AR guarda los dos países", async () => {
    const creada = await crear({ countries: ["AR", "ES"] });
    expect(creada.countries).toEqual(["AR", "ES"]);
    const soloEs = await crear({ name: "Solo ES", countries: ["ES"] });
    expect(soloEs.countries).toEqual(["ES"]);
  });

  it("PUT parcial cambia solo lo enviado", async () => {
    const creada = await crear({
      name: "Original",
      conditions: "Válido de lunes a viernes",
      countries: ["AR", "ES"],
      sortOrder: 7,
    });
    const res = await req("PUT", `/${creada.id}`, ownerToken, {
      benefit: "30% OFF",
    });
    expect(res.statusCode, res.body).toBe(200);
    const editada = (JSON.parse(res.body) as { sponsor: AdminSponsor }).sponsor;

    expect(editada.id).toBe(creada.id);
    expect(editada.benefit).toBe("30% OFF");
    expect(editada.name).toBe("Original");
    expect(editada.category).toBe(creada.category);
    expect(editada.detail).toBe(creada.detail);
    expect(editada.conditions).toBe("Válido de lunes a viernes");
    expect(editada.countries).toEqual(["AR", "ES"]);
    expect(editada.sortOrder).toBe(7);
    expect(editada.isActive).toBe(false);
  });

  it("PUT permite limpiar campos opcionales con null y cambiar el canje a código", async () => {
    const creada = await crear({ conditions: "Condiciones", icon: "spa" });
    const res = await req("PUT", `/${creada.id}`, ownerToken, {
      conditions: null,
      icon: null,
      redeemType: "code",
      redeemCode: "ABC-123",
    });
    expect(res.statusCode, res.body).toBe(200);
    const editada = (JSON.parse(res.body) as { sponsor: AdminSponsor }).sponsor;
    expect(editada.conditions).toBeNull();
    expect(editada.icon).toBeNull();
    expect(editada.redeemType).toBe("code");
    expect(editada.redeemCode).toBe("ABC-123");
  });

  it("DELETE responde 200 y la marca desaparece del listado y de la base", async () => {
    const creada = await crear();
    const res = await req("DELETE", `/${creada.id}`, ownerToken);
    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });
    expect((await listar()).sponsors).toHaveLength(0);
    expect(await brandRow(creada.id)).toBeNull();
  });

  it("PUT y DELETE de un id inexistente dan 404 (también tras borrarlo)", async () => {
    expect(
      (await req("PUT", `/${MISSING_ID}`, ownerToken, { name: "x" }))
        .statusCode,
    ).toBe(404);
    expect((await req("DELETE", `/${MISSING_ID}`, ownerToken)).statusCode).toBe(
      404,
    );

    const creada = await crear();
    await req("DELETE", `/${creada.id}`, ownerToken);
    expect((await req("DELETE", `/${creada.id}`, ownerToken)).statusCode).toBe(
      404,
    );
    expect(
      (await req("PUT", `/${creada.id}`, ownerToken, { name: "x" })).statusCode,
    ).toBe(404);
  });

  it("PUT con body vacío o con id inválido da 400", async () => {
    const creada = await crear();
    expect((await req("PUT", `/${creada.id}`, ownerToken, {})).statusCode).toBe(
      400,
    );
    expect((await req("PUT", "/0", ownerToken, { name: "x" })).statusCode).toBe(
      400,
    );
    expect(
      (await req("PUT", "/abc", ownerToken, { name: "x" })).statusCode,
    ).toBe(400);
  });

  it("el alta sin campos obligatorios da 400 y no persiste", async () => {
    const sinCampos = await req("POST", "", ownerToken, {
      name: "Solo nombre",
    });
    expect(sinCampos.statusCode).toBe(400);
    expect((await req("POST", "", ownerToken, {})).statusCode).toBe(400);
    expect((await listar()).sponsors).toHaveLength(0);
  });

  it("mass assignment: createdBy, métricas y tenantId del body se descartan (Fastify removeAdditional)", async () => {
    const res = await req(
      "POST",
      "",
      ownerToken,
      body({ createdBy: MISSING_ID, views: 500, taps: 500, tenantId: 2 }),
    );
    expect(res.statusCode, res.body).toBe(201);
    const creada = (JSON.parse(res.body) as { sponsor: AdminSponsor }).sponsor;
    expect(creada.views).toBe(0);
    expect(creada.taps).toBe(0);
    expect((await brandRow(creada.id))?.createdBy).toBe(ownerId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (3) Validaciones
// ═══════════════════════════════════════════════════════════════════════════

describe("validaciones (D-19)", () => {
  it("contraste < 4.5 → 400 con mensaje que menciona 4.5, en alta y en edición", async () => {
    const res = await req(
      "POST",
      "",
      ownerToken,
      body({ bgColor: BAD_BG, textColor: BAD_TEXT }),
    );
    expect(res.statusCode, res.body).toBe(400);
    expect((JSON.parse(res.body) as ErrorBody).message).toContain("4.5");
    expect((await listar()).sponsors).toHaveLength(0);

    const ok = await crear();
    const edit = await req("PUT", `/${ok.id}`, ownerToken, {
      bgColor: BAD_BG,
      textColor: BAD_TEXT,
    });
    expect(edit.statusCode, edit.body).toBe(400);
    expect((JSON.parse(edit.body) as ErrorBody).message).toContain("4.5");

    // Cambiar SOLO un color también se evalúa contra el otro ya guardado.
    const solo = await req("PUT", `/${ok.id}`, ownerToken, {
      textColor: "#4c6b3c",
    });
    expect(solo.statusCode, solo.body).toBe(400);
    expect((await brandRow(ok.id))?.textColor).toBe("#f2ede5");
  });

  it("un par justo por encima del umbral se acepta", async () => {
    const res = await req(
      "POST",
      "",
      ownerToken,
      body({ bgColor: "#96593a", textColor: "#ffffff" }),
    );
    expect(res.statusCode, res.body).toBe(201);
  });

  it("canje por código sin código → 400 (alta, edición y vaciando el código)", async () => {
    const sinCodigo = await req(
      "POST",
      "",
      ownerToken,
      body({ redeemType: "code" }),
    );
    expect(sinCodigo.statusCode, sinCodigo.body).toBe(400);
    const espacios = await req(
      "POST",
      "",
      ownerToken,
      body({ redeemType: "code", redeemCode: null }),
    );
    expect(espacios.statusCode, espacios.body).toBe(400);

    const carnet = await crear();
    const aCodigo = await req("PUT", `/${carnet.id}`, ownerToken, {
      redeemType: "code",
    });
    expect(aCodigo.statusCode, aCodigo.body).toBe(400);

    const conCodigo = await crear({
      name: "Con código",
      redeemType: "code",
      redeemCode: "CODIGO1",
    });
    const vaciar = await req("PUT", `/${conCodigo.id}`, ownerToken, {
      redeemCode: null,
    });
    expect(vaciar.statusCode, vaciar.body).toBe(400);
    expect((await brandRow(conCodigo.id))?.redeemCode).toBe("CODIGO1");
  });

  it("countries vacío → 400 en alta y en edición", async () => {
    expect(
      (await req("POST", "", ownerToken, body({ countries: [] }))).statusCode,
    ).toBe(400);
    const ok = await crear();
    expect(
      (await req("PUT", `/${ok.id}`, ownerToken, { countries: [] })).statusCode,
    ).toBe(400);
    expect(
      (await req("PUT", `/${ok.id}`, ownerToken, { countries: ["BR"] }))
        .statusCode,
    ).toBe(400);
    expect(
      (await req("PUT", `/${ok.id}`, ownerToken, { countries: ["AR", "AR"] }))
        .statusCode,
    ).toBe(400);
  });

  it("startsOn > endsOn → 400, también cuando solo se edita una de las dos", async () => {
    const hoy = todayInTz(DEFAULT_TENANT_TIMEZONE);
    const invertida = await req(
      "POST",
      "",
      ownerToken,
      body({ startsOn: addDays(hoy, 10), endsOn: addDays(hoy, 5) }),
    );
    expect(invertida.statusCode, invertida.body).toBe(400);

    const creada = await crear({
      startsOn: addDays(hoy, 1),
      endsOn: addDays(hoy, 10),
    });
    const edit = await req("PUT", `/${creada.id}`, ownerToken, {
      endsOn: hoy,
    });
    expect(edit.statusCode, edit.body).toBe(400);
    expect((await brandRow(creada.id))?.endsOn).toBe(addDays(hoy, 10));

    // Mismo día en las dos puntas es una vigencia válida de un solo día.
    const unDia = await req(
      "POST",
      "",
      ownerToken,
      body({ name: "Un día", startsOn: hoy, endsOn: hoy }),
    );
    expect(unDia.statusCode, unDia.body).toBe(201);
  });

  it("fechas con forma válida pero inexistentes → 400 (13/45, 30-feb), no 500", async () => {
    for (const startsOn of ["2026-13-45", "2027-02-30", "2026-00-10"]) {
      const res = await req("POST", "", ownerToken, body({ startsOn }));
      expect(res.statusCode, startsOn).toBe(400);
    }
    const res = await req(
      "POST",
      "",
      ownerToken,
      body({ endsOn: "2026-13-45" }),
    );
    expect(res.statusCode, res.body).toBe(400);

    const ok = await crear();
    const edit = await req("PUT", `/${ok.id}`, ownerToken, {
      endsOn: "2027-02-30",
    });
    expect(edit.statusCode, edit.body).toBe(400);
    const formato = await req(
      "POST",
      "",
      ownerToken,
      body({ startsOn: "mañana" }),
    );
    expect(formato.statusCode).toBe(400);
  });

  it("textos vacíos o solo espacios tras el trim → 400 (alta y edición)", async () => {
    for (const campo of ["name", "category", "benefit", "detail"]) {
      const res = await req("POST", "", ownerToken, body({ [campo]: "   " }));
      expect(res.statusCode, `${campo}: ${res.body}`).toBe(400);
    }
    const ok = await crear();
    for (const campo of ["name", "category", "benefit", "detail"]) {
      const res = await req("PUT", `/${ok.id}`, ownerToken, { [campo]: "   " });
      expect(res.statusCode, `${campo}: ${res.body}`).toBe(400);
    }
    expect((await brandRow(ok.id))?.name).toBe("Marca de prueba");
  });

  it("largos máximos del schema: benefit de 13 y detail de 81 → 400; 12 y 80 → 201", async () => {
    expect(
      (await req("POST", "", ownerToken, body({ benefit: "x".repeat(13) })))
        .statusCode,
    ).toBe(400);
    expect(
      (await req("POST", "", ownerToken, body({ detail: "y".repeat(81) })))
        .statusCode,
    ).toBe(400);
    const limite = await req(
      "POST",
      "",
      ownerToken,
      body({ benefit: "x".repeat(12), detail: "y".repeat(80) }),
    );
    expect(limite.statusCode, limite.body).toBe(201);
  });

  it("PUT: benefit de 13 → 400 y la fila conserva el original, de 12 → 200", async () => {
    const creada = await crear({ benefit: "20% OFF" });

    const larga = await req("PUT", `/${creada.id}`, ownerToken, {
      benefit: "x".repeat(13),
    });
    expect(larga.statusCode, larga.body).toBe(400);
    expect((await brandRow(creada.id))?.benefit).toBe("20% OFF");

    const limite = await req("PUT", `/${creada.id}`, ownerToken, {
      benefit: "x".repeat(12),
    });
    expect(limite.statusCode, limite.body).toBe(200);
    expect((await brandRow(creada.id))?.benefit).toBe("x".repeat(12));
  });

  it("bgColor/textColor que no son #rrggbb → 400 (schema)", async () => {
    for (const bgColor of ["rojo", "#fff", "4c6b3c", "#4c6b3cff", "#gggggg"]) {
      const res = await req("POST", "", ownerToken, body({ bgColor }));
      expect(res.statusCode, bgColor).toBe(400);
    }
    expect(
      (await req("POST", "", ownerToken, body({ textColor: "blanco" })))
        .statusCode,
    ).toBe(400);
  });

  it("logoUrl que no es https → 400", async () => {
    const http = await req(
      "POST",
      "",
      ownerToken,
      body({ logoUrl: "http://r2.test.example/sponsors/logos/1-logo.png" }),
    );
    expect(http.statusCode, http.body).toBe(400);
    const ftp = await req(
      "POST",
      "",
      ownerToken,
      body({ logoUrl: "ftp://r2.test.example/sponsors/logos/1-logo.png" }),
    );
    expect(ftp.statusCode, ftp.body).toBe(400);
  });

  describe("partnerId (T-199-08)", () => {
    let gym2: SegundoGimnasio;

    beforeEach(async () => {
      gym2 = await seedSecondTenant(app);
    });

    async function insertPartner(ctx: TenantContext, branchId: number) {
      const code =
        `SP${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
          .toUpperCase()
          .slice(0, 24);
      const [row] = await app.db
        .insert(referralPartners)
        .values(
          tenantValues(ctx, {
            name: `Partner ${code}`,
            code,
            branchId,
            benefitType: "discount_percent" as const,
            benefitValue: 10,
            commissionType: "none" as const,
            commissionValue: 0,
            currency: "ARS" as const,
          }),
        )
        .$returningId();
      return row.id;
    }

    it("un partner de OTRO gimnasio → 400 en alta y en edición (no se filtra si existe)", async () => {
      const ajeno = await insertPartner(
        { tenantId: gym2.tenantId },
        gym2.branchId,
      );

      const alta = await req(
        "POST",
        "",
        ownerToken,
        body({ partnerId: ajeno }),
      );
      expect(alta.statusCode, alta.body).toBe(400);
      expect((await listar()).sponsors).toHaveLength(0);

      const ok = await crear();
      const edit = await req("PUT", `/${ok.id}`, ownerToken, {
        partnerId: ajeno,
      });
      expect(edit.statusCode, edit.body).toBe(400);
      expect((await brandRow(ok.id))?.partnerId).toBeNull();
    });

    it("un partner inexistente → 400", async () => {
      const res = await req(
        "POST",
        "",
        ownerToken,
        body({ partnerId: MISSING_ID }),
      );
      expect(res.statusCode, res.body).toBe(400);
    });

    it("un partner del propio gimnasio se acepta (alta y edición) y null lo desvincula", async () => {
      const propio = await insertPartner(CTX_TEMPLO, branchA);
      const creada = await crear({ partnerId: propio });
      expect(creada.partnerId).toBe(propio);

      const otra = await crear({ name: "Otra" });
      const edit = await req("PUT", `/${otra.id}`, ownerToken, {
        partnerId: propio,
      });
      expect(edit.statusCode, edit.body).toBe(200);

      const quitar = await req("PUT", `/${otra.id}`, ownerToken, {
        partnerId: null,
      });
      expect(quitar.statusCode, quitar.body).toBe(200);
      expect((await brandRow(otra.id))?.partnerId).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (3b) Logo del R2 propio
// ═══════════════════════════════════════════════════════════════════════════

describe("logoUrl del R2 propio (T-199-09/T-199-48)", () => {
  let previo: string | undefined;

  beforeAll(() => {
    previo = process.env.R2_PUBLIC_URL;
    process.env.R2_PUBLIC_URL = R2_BASE;
  });

  afterAll(() => {
    if (previo === undefined) {
      delete process.env.R2_PUBLIC_URL;
    } else {
      process.env.R2_PUBLIC_URL = previo;
    }
  });

  it("un dominio ajeno → 400", async () => {
    const res = await req(
      "POST",
      "",
      ownerToken,
      body({ logoUrl: "https://otro.example/logo.png" }),
    );
    expect(res.statusCode, res.body).toBe(400);
    expect((await listar()).sponsors).toHaveLength(0);
  });

  it("un sufijo malicioso sobre el dominio propio → 400", async () => {
    const res = await req(
      "POST",
      "",
      ownerToken,
      body({
        logoUrl: "https://r2.test.example.evil.com/sponsors/logos/1-logo.png",
      }),
    );
    expect(res.statusCode, res.body).toBe(400);
  });

  it("el dominio propio con otro prefijo (blog/images) → 400", async () => {
    const res = await req(
      "POST",
      "",
      ownerToken,
      body({ logoUrl: `${R2_BASE}/blog/images/1-logo.png` }),
    );
    expect(res.statusCode, res.body).toBe(400);
  });

  it("el dominio propio con el prefijo sponsors/logos → 201", async () => {
    const logoUrl = `${R2_BASE}/sponsors/logos/1-logo.png`;
    const res = await req("POST", "", ownerToken, body({ logoUrl }));
    expect(res.statusCode, res.body).toBe(201);
    expect(
      (JSON.parse(res.body) as { sponsor: AdminSponsor }).sponsor.logoUrl,
    ).toBe(logoUrl);
  });

  it("R2_PUBLIC_URL con barra final también acepta el prefijo propio", async () => {
    process.env.R2_PUBLIC_URL = `${R2_BASE}/`;
    try {
      const res = await req(
        "POST",
        "",
        ownerToken,
        body({ logoUrl: `${R2_BASE}/sponsors/logos/2-logo.png` }),
      );
      expect(res.statusCode, res.body).toBe(201);
    } finally {
      process.env.R2_PUBLIC_URL = R2_BASE;
    }
  });

  describe("la publicUrl que devuelve /logo-upload-url se acepta como logoUrl (WR-01)", () => {
    // La firma de la URL es local (sin red). Si CI no tiene R2 se inyecta un
    // cliente S3 con credenciales falsas en el decorador de la app.
    const hadR2 = (): boolean => app.hasDecorator("r2");
    let previoR2: S3Client | undefined;
    let previoBucket: string | undefined;

    beforeAll(() => {
      previoR2 = hadR2() ? app.r2 : undefined;
      previoBucket = hadR2() ? app.r2Bucket : undefined;
      app.r2 = new S3Client({
        region: "auto",
        endpoint: "https://cuenta-falsa.r2.cloudflarestorage.com",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
      });
      app.r2Bucket = "bucket-test";
    });

    afterAll(() => {
      if (previoR2 !== undefined && previoBucket !== undefined) {
        app.r2 = previoR2;
        app.r2Bucket = previoBucket;
      } else {
        // CI sin R2: sacar el cliente inyectado para que el resto del archivo
        // siga viendo la app sin almacenamiento (503).
        Reflect.deleteProperty(app, "r2");
        Reflect.deleteProperty(app, "r2Bucket");
      }
    });

    async function subirYGuardar(): Promise<{
      publicUrl: string;
      guardado: AdminSponsor;
    }> {
      const up = await req("POST", "/logo-upload-url", ownerToken, {
        filename: "logo.png",
      });
      expect(up.statusCode, up.body).toBe(200);
      const { publicUrl } = JSON.parse(up.body) as { publicUrl: string };
      const res = await req(
        "POST",
        "",
        ownerToken,
        body({ logoUrl: publicUrl }),
      );
      expect(res.statusCode, res.body).toBe(201);
      return {
        publicUrl,
        guardado: (JSON.parse(res.body) as { sponsor: AdminSponsor }).sponsor,
      };
    }

    it("base sin barra final → el logo subido se guarda", async () => {
      const { publicUrl, guardado } = await subirYGuardar();
      expect(publicUrl.startsWith(`${R2_BASE}/sponsors/logos/`)).toBe(true);
      expect(guardado.logoUrl).toBe(publicUrl);
    });

    it("base CON barra final → sin '//' y el logo subido se guarda", async () => {
      process.env.R2_PUBLIC_URL = `${R2_BASE}/`;
      try {
        const { publicUrl, guardado } = await subirYGuardar();
        expect(publicUrl.startsWith(`${R2_BASE}/sponsors/logos/`)).toBe(true);
        expect(publicUrl.replace("https://", "")).not.toContain("//");
        expect(guardado.logoUrl).toBe(publicUrl);
      } finally {
        process.env.R2_PUBLIC_URL = R2_BASE;
      }
    });

    it("base con varias barras finales → misma normalización", async () => {
      process.env.R2_PUBLIC_URL = `${R2_BASE}///`;
      try {
        const { publicUrl } = await subirYGuardar();
        expect(publicUrl.startsWith(`${R2_BASE}/sponsors/logos/`)).toBe(true);
      } finally {
        process.env.R2_PUBLIC_URL = R2_BASE;
      }
    });
  });

  it("logoUrl null → 201 (sin logo)", async () => {
    const res = await req("POST", "", ownerToken, body({ logoUrl: null }));
    expect(res.statusCode, res.body).toBe(201);
    expect(
      (JSON.parse(res.body) as { sponsor: AdminSponsor }).sponsor.logoUrl,
    ).toBeNull();
  });

  it("PUT con un logoUrl ajeno → 400 y no pisa el guardado", async () => {
    const logoUrl = `${R2_BASE}/sponsors/logos/3-logo.png`;
    const creada = await crear({ logoUrl });
    const res = await req("PUT", `/${creada.id}`, ownerToken, {
      logoUrl: "https://otro.example/logo.png",
    });
    expect(res.statusCode, res.body).toBe(400);
    expect((await brandRow(creada.id))?.logoUrl).toBe(logoUrl);
  });

  it("PUT con un logoUrl propio nuevo → 200; con null lo borra", async () => {
    const creada = await crear({
      logoUrl: `${R2_BASE}/sponsors/logos/4-logo.png`,
    });
    const nuevo = `${R2_BASE}/sponsors/logos/5-logo.png`;
    const cambia = await req("PUT", `/${creada.id}`, ownerToken, {
      logoUrl: nuevo,
    });
    expect(cambia.statusCode, cambia.body).toBe(200);
    expect((await brandRow(creada.id))?.logoUrl).toBe(nuevo);

    const borra = await req("PUT", `/${creada.id}`, ownerToken, {
      logoUrl: null,
    });
    expect(borra.statusCode, borra.body).toBe(200);
    expect((await brandRow(creada.id))?.logoUrl).toBeNull();
  });

  it("PUT de OTRA columna sobre una marca con logo válido → 200 aunque R2_PUBLIC_URL haya cambiado (no revalida lo guardado)", async () => {
    const logoUrl = `${R2_BASE}/sponsors/logos/6-logo.png`;
    const creada = await crear({ logoUrl });

    process.env.R2_PUBLIC_URL = "https://cdn-nuevo.example";
    try {
      const res = await req("PUT", `/${creada.id}`, ownerToken, {
        benefit: "15% OFF",
      });
      expect(res.statusCode, res.body).toBe(200);
      expect((await brandRow(creada.id))?.logoUrl).toBe(logoUrl);
    } finally {
      process.env.R2_PUBLIC_URL = R2_BASE;
    }
  });

  it("sin R2_PUBLIC_URL configurada, un logoUrl no nulo → 400; sin logo sigue funcionando", async () => {
    delete process.env.R2_PUBLIC_URL;
    try {
      const conLogo = await req(
        "POST",
        "",
        ownerToken,
        body({ logoUrl: `${R2_BASE}/sponsors/logos/7-logo.png` }),
      );
      expect(conLogo.statusCode, conLogo.body).toBe(400);

      const sinLogo = await req("POST", "", ownerToken, body());
      expect(sinLogo.statusCode, sinLogo.body).toBe(201);
    } finally {
      process.env.R2_PUBLIC_URL = R2_BASE;
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (4) Límite por país
// ═══════════════════════════════════════════════════════════════════════════

describe("límite de activas por país (D-24)", () => {
  it("GET /settings sin fila devuelve el default 6", async () => {
    const res = await req("GET", "/settings", ownerToken);
    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ maxActivePerCountry: 6 });
  });

  it("seis activas en AR entran; la 7ª activa en AR → 400 con el 6 en el mensaje", async () => {
    for (let n = 1; n <= 6; n += 1) {
      await crear({ name: `AR ${n}`, isActive: true });
    }
    const septima = await req(
      "POST",
      "",
      ownerToken,
      body({ name: "AR 7", isActive: true }),
    );
    expect(septima.statusCode, septima.body).toBe(400);
    expect((JSON.parse(septima.body) as ErrorBody).message).toContain("6");
    expect((await listar()).sponsors).toHaveLength(6);
  });

  it("una marca ES activa sigue entrando con 6 activas en AR (otro país no cuenta)", async () => {
    for (let n = 1; n <= 6; n += 1) {
      await crear({ name: `AR ${n}`, isActive: true });
    }
    const es = await req(
      "POST",
      "",
      ownerToken,
      body({ name: "ES 1", countries: ["ES"], isActive: true }),
    );
    expect(es.statusCode, es.body).toBe(201);
  });

  it("una 7ª INACTIVA se puede crear; activarla por PUT → 400", async () => {
    for (let n = 1; n <= 6; n += 1) {
      await crear({ name: `AR ${n}`, isActive: true });
    }
    const septima = await crear({ name: "AR 7" });
    expect(septima.isActive).toBe(false);

    const activar = await req("PUT", `/${septima.id}`, ownerToken, {
      isActive: true,
    });
    expect(activar.statusCode, activar.body).toBe(400);
    expect((await brandRow(septima.id))?.isActive).toBe(false);
  });

  it("subir el límite a 7 → 200 y entonces la activación pasa; PUT /settings llega a su handler, no al de /:id", async () => {
    for (let n = 1; n <= 6; n += 1) {
      await crear({ name: `AR ${n}`, isActive: true });
    }
    const septima = await crear({ name: "AR 7" });

    const res = await req("PUT", "/settings", ownerToken, {
      maxActivePerCountry: 7,
    });
    expect(res.statusCode, res.body).toBe(200);
    const parsed = JSON.parse(res.body) as Record<string, unknown>;
    expect(parsed).toEqual({ maxActivePerCountry: 7 });
    expect(parsed).not.toHaveProperty("sponsor");

    const lectura = await req("GET", "/settings", ownerToken);
    expect(JSON.parse(lectura.body)).toEqual({ maxActivePerCountry: 7 });
    expect((await listar()).maxActivePerCountry).toBe(7);

    const activar = await req("PUT", `/${septima.id}`, ownerToken, {
      isActive: true,
    });
    expect(activar.statusCode, activar.body).toBe(200);

    const octava = await req(
      "POST",
      "",
      ownerToken,
      body({ name: "AR 8", isActive: true }),
    );
    expect(octava.statusCode, octava.body).toBe(400);
  });

  it("PUT /settings fuera de rango o mal tipado → 400", async () => {
    for (const maxActivePerCountry of [0, -1, 51, 7.5, "abc", null]) {
      const res = await req("PUT", "/settings", ownerToken, {
        maxActivePerCountry,
      });
      expect(res.statusCode, String(maxActivePerCountry)).toBe(400);
    }
    expect((await req("PUT", "/settings", ownerToken, {})).statusCode).toBe(
      400,
    );
    expect((await req("GET", "/settings", ownerToken)).statusCode).toBe(200);
    expect(
      JSON.parse((await req("GET", "/settings", ownerToken)).body),
    ).toEqual({
      maxActivePerCountry: 6,
    });
  });

  it("los extremos 1 y 50 del rango se aceptan", async () => {
    await setLimit(1);
    expect(
      JSON.parse((await req("GET", "/settings", ownerToken)).body),
    ).toEqual({ maxActivePerCountry: 1 });
    await setLimit(50);
    expect(
      JSON.parse((await req("GET", "/settings", ownerToken)).body),
    ).toEqual({ maxActivePerCountry: 50 });
  });

  it("una marca AR+ES cuenta en los dos países", async () => {
    await setLimit(2);
    await crear({ name: "Ambas", countries: ["AR", "ES"], isActive: true });
    await crear({ name: "ES 2", countries: ["ES"], isActive: true });

    // ES ya tiene 2 (Ambas + ES 2): una tercera en ES se rechaza y nombra el país.
    const es = await req(
      "POST",
      "",
      ownerToken,
      body({ name: "ES 3", countries: ["ES"], isActive: true }),
    );
    expect(es.statusCode, es.body).toBe(400);
    expect((JSON.parse(es.body) as ErrorBody).message).toContain("España");

    // AR tiene 1 (Ambas): entra una más y llena AR.
    await crear({ name: "AR 2", countries: ["AR"], isActive: true });

    // Ahora AR también está llena: una AR+ES nueva se rechaza por AR.
    const ambas = await req(
      "POST",
      "",
      ownerToken,
      body({ name: "Ambas 2", countries: ["AR", "ES"], isActive: true }),
    );
    expect(ambas.statusCode, ambas.body).toBe(400);
  });

  it("bajar el límite no desactiva nada", async () => {
    for (let n = 1; n <= 3; n += 1) {
      await crear({ name: `AR ${n}`, isActive: true });
    }
    await setLimit(1);
    const { sponsors, maxActivePerCountry } = await listar();
    expect(maxActivePerCountry).toBe(1);
    expect(sponsors.filter((s) => s.isActive)).toHaveLength(3);
  });

  it("con el límite bajado, editar una marca YA activa no se traba (solo cuentan los países agregados)", async () => {
    const vieja = await crear({ name: "Vieja", isActive: true });
    await crear({ name: "Otra", isActive: true });
    await setLimit(1);

    // AR está por encima del límite, pero la marca ya estaba activa en AR.
    const rename = await req("PUT", `/${vieja.id}`, ownerToken, {
      name: "Vieja renombrada",
    });
    expect(rename.statusCode, rename.body).toBe(200);

    const reactivar = await req("PUT", `/${vieja.id}`, ownerToken, {
      isActive: true,
    });
    expect(reactivar.statusCode, reactivar.body).toBe(200);
  });

  it("agregar un país a una marca activa chequea el límite de ESE país", async () => {
    const vieja = await crear({ name: "Vieja", isActive: true });
    await setLimit(1);
    const es = await crear({
      name: "ES activa",
      countries: ["ES"],
      isActive: true,
    });

    // ES está llena (1/1): sumarlo a la marca activa de AR se rechaza.
    const agrega = await req("PUT", `/${vieja.id}`, ownerToken, {
      countries: ["AR", "ES"],
    });
    expect(agrega.statusCode, agrega.body).toBe(400);
    expect((await brandRow(vieja.id))?.countryEs).toBe(false);

    // Liberando el cupo de ES, el mismo PUT pasa.
    const baja = await req("PUT", `/${es.id}`, ownerToken, { isActive: false });
    expect(baja.statusCode, baja.body).toBe(200);
    const reintento = await req("PUT", `/${vieja.id}`, ownerToken, {
      countries: ["AR", "ES"],
    });
    expect(reintento.statusCode, reintento.body).toBe(200);
  });

  it("desactivar o borrar una activa libera el cupo", async () => {
    await setLimit(2);
    const a = await crear({ name: "A", isActive: true });
    const b = await crear({ name: "B", isActive: true });
    const llena = await req(
      "POST",
      "",
      ownerToken,
      body({ name: "C", isActive: true }),
    );
    expect(llena.statusCode, llena.body).toBe(400);

    await req("PUT", `/${a.id}`, ownerToken, { isActive: false });
    const c = await req(
      "POST",
      "",
      ownerToken,
      body({ name: "C", isActive: true }),
    );
    expect(c.statusCode, c.body).toBe(201);

    const otraLlena = await req(
      "POST",
      "",
      ownerToken,
      body({ name: "D", isActive: true }),
    );
    expect(otraLlena.statusCode, otraLlena.body).toBe(400);
    expect((await req("DELETE", `/${b.id}`, ownerToken)).statusCode).toBe(200);
    const d = await req(
      "POST",
      "",
      ownerToken,
      body({ name: "D", isActive: true }),
    );
    expect(d.statusCode, d.body).toBe(201);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (5) Subida de logo
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /logo-upload-url (D-19)", () => {
  it("como owner da 200 con URL bajo sponsors/logos si hay R2, o 503 si no (CI)", async () => {
    const res = await req("POST", "/logo-upload-url", ownerToken, {
      filename: "logo.png",
    });
    if (app.hasDecorator("r2")) {
      expect(res.statusCode, res.body).toBe(200);
      const parsed = JSON.parse(res.body) as {
        uploadUrl: string;
        publicUrl: string;
      };
      expect(parsed.publicUrl).toContain("sponsors/logos/");
      expect(parsed.uploadUrl).toContain("sponsors/logos/");
    } else {
      expect(res.statusCode, res.body).toBe(503);
      expect((JSON.parse(res.body) as { error: string }).error).toBe(
        "Almacenamiento de imagenes no configurado",
      );
    }
  });

  it("el admin de El Templo recibe el mismo resultado que el owner (no 403)", async () => {
    const res = await req("POST", "/logo-upload-url", adminToken, {
      filename: "logo.webp",
    });
    expect(res.statusCode).not.toBe(403);
    expect([200, 503]).toContain(res.statusCode);
  });

  it("una extensión no permitida → 400 (antes de mirar R2)", async () => {
    for (const filename of ["logo.exe", "logo.gif", "logo", "logo.png.exe"]) {
      const res = await req("POST", "/logo-upload-url", ownerToken, {
        filename,
      });
      expect(res.statusCode, filename).toBe(400);
    }
    expect(
      (await req("POST", "/logo-upload-url", ownerToken, {})).statusCode,
    ).toBe(400);
  });

  it("coach y socio reciben 403 aunque R2 no esté configurado (el guard va antes que el 503)", async () => {
    const socio = await createTestMember(app, { branchId: branchA });
    expect(
      (
        await req("POST", "/logo-upload-url", coachToken, {
          filename: "logo.png",
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await req("POST", "/logo-upload-url", socio.token, {
          filename: "logo.png",
        })
      ).statusCode,
    ).toBe(403);
  });
});
