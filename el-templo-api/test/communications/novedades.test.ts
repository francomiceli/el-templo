/**
 * Novedades en Mi Templo (mig 0275) — integración HTTP contra `createTestApp()`
 * de las 6 rutas bajo `/api/communications`:
 *   admin:  GET/POST /admin/novedades, PUT/DELETE /admin/novedades/:id
 *   socio:  GET /me/novedades, POST /me/novedades/:id/event
 *
 * Cobertura (spec `.docs/novedades-mi-templo-spec.md`):
 *   (1) CRUD admin y validaciones: texto vacío / de 121, destino incoherente,
 *       sede de otro tenant, status inválido, props de más.
 *   (2) Roles: coach y socio reciben 403 en las 4 rutas admin, sin token 401.
 *   (3) `/me/novedades`: filtra por sede (global, otra sede, multi-sede),
 *       excluye pausadas y futuras, máximo 3 y en orden, `branchLabel`,
 *       destino resuelto, `seen` después del evento.
 *   (4) Eventos: idempotencia, `clicked` sin `seen` previo, 404 en los casos
 *       de "no debería verla", conteos views/clicks del listado admin.
 *   (5) Aislamiento cross-tenant con el fixture del segundo gimnasio.
 *
 * LIMPIEZA: `novedades`/`novedad_views` están en `TABLES_TO_CLEAN`
 * (`test/helpers.ts`), así que `cleanAllTestData` las vacía sola.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/communications/novedades.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  createTestMember,
  getAuthToken,
} from "../helpers";
import {
  avisos,
  branches,
  novedades,
  novedadViews,
  users,
} from "../../src/db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const BASE = "/api/communications";
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const COACH_EMAIL = "coach-novedades@test.com";
const COACH_PASSWORD = "coachpass123";
const HOUR_MS = 60 * 60 * 1000;

// ─── Utilidades HTTP ─────────────────────────────────────────────────────────

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

const getComo = (url: string, token: string | null) => req("GET", url, token);
const postComo = (
  url: string,
  token: string | null,
  payload?: Record<string, unknown>,
) => req("POST", url, token, payload);
const putComo = (
  url: string,
  token: string | null,
  payload: Record<string, unknown>,
) => req("PUT", url, token, payload);
const deleteComo = (url: string, token: string | null) =>
  req("DELETE", url, token);

// ─── Tipos de respuesta ──────────────────────────────────────────────────────

interface AdminNovedad {
  id: number;
  text: string;
  scopeBranchIds: number[] | null;
  destinationType: "app_section" | "whatsapp_sales" | null;
  destinationSection: string | null;
  whatsappText: string | null;
  publishAt: string;
  status: "active" | "paused";
  pushRequested: boolean;
  pushTitle: string | null;
  pushQueuedAt: string | null;
  createdBy: number | null;
  createdAt: string;
  views: number;
  clicks: number;
}

interface MemberNovedad {
  key: string;
  id: number;
  text: string;
  branchLabel: string | null;
  publishedAt: string;
  destination: {
    type: "app_section" | "whatsapp_sales";
    section: string | null;
    route: string;
    whatsappText: string | null;
  } | null;
  seen: boolean;
}

async function listAdmin(token: string): Promise<AdminNovedad[]> {
  const res = await getComo("/admin/novedades", token);
  expect(res.statusCode, res.body).toBe(200);
  return (JSON.parse(res.body) as { novedades: AdminNovedad[] }).novedades;
}

async function listMember(token: string): Promise<MemberNovedad[]> {
  const res = await getComo("/me/novedades", token);
  expect(res.statusCode, res.body).toBe(200);
  return (JSON.parse(res.body) as { novedades: MemberNovedad[] }).novedades;
}

// ─── Fixtures de datos ───────────────────────────────────────────────────────

let app: FastifyInstance;
let adminToken: string;
let adminId: number;
let coachToken: string;
let branchA: number;
let branchAName: string;
let branchB: number;
let branchBName: string;

const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR_MS);
const hoursAhead = (h: number) => new Date(Date.now() + h * HOUR_MS);

/** Inserta una novedad directo en la base (default: activa, global, publicada hace 1 h). */
async function insertNovedad(
  over: Partial<typeof novedades.$inferInsert> = {},
  ctx: TenantContext = CTX_TEMPLO,
): Promise<number> {
  const [result] = await app.db.insert(novedades).values(
    tenantValues(ctx, {
      text: "Novedad de prueba",
      publishAt: hoursAgo(1),
      status: "active" as const,
      ...over,
    }),
  );
  return Number(result.insertId);
}

async function viewsOf(novedadId: number, ctx: TenantContext = CTX_TEMPLO) {
  return app.db
    .select()
    .from(novedadViews)
    .where(
      and(
        tenantWhere(novedadViews, ctx),
        eq(novedadViews.novedadId, novedadId),
      ),
    );
}

async function novedadRow(id: number, ctx: TenantContext) {
  const [row] = await app.db
    .select()
    .from(novedades)
    .where(and(tenantWhere(novedades, ctx), eq(novedades.id, id)))
    .limit(1);
  return row ?? null;
}

/** Socio de El Templo en la sede dada, ya autenticado. */
async function socioEn(
  branchId: number,
): Promise<{ id: number; token: string }> {
  const member = await createTestMember(app, { branchId });
  return { id: member.id, token: member.token };
}

beforeAll(async () => {
  app = await createTestApp();
  // admin@test.com es 'owner' (test/setup.ts) — cubre ADMIN_ROLES.
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  const [admin] = await app.db
    .select({ id: users.id })
    .from(users)
    .where(
      and(tenantWhere(users, CTX_TEMPLO), eq(users.email, "admin@test.com")),
    )
    .limit(1);
  if (!admin)
    throw new Error("admin@test.com no encontrado — ¿corrió test/setup.ts?");
  adminId = admin.id;

  // branchA = la sede sembrada por test/setup.ts (code 'TEST'); branchB es una
  // SEGUNDA sede de El Templo, creada una vez para todo el archivo.
  const [testBranch] = await app.db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(and(tenantWhere(branches, CTX_TEMPLO), eq(branches.code, "TEST")))
    .limit(1);
  if (!testBranch)
    throw new Error("Sede 'TEST' no encontrada — ¿corrió test/setup.ts?");
  branchA = testBranch.id;
  branchAName = testBranch.name;

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  branchBName = `Sede B novedades ${suffix}`;
  const [branchBRow] = await app.db
    .insert(branches)
    .values(
      tenantValues(CTX_TEMPLO, {
        name: branchBName,
        code: `NV${suffix}`.slice(0, 20),
        country: "AR" as const,
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      }),
    )
    .$returningId();
  branchB = branchBRow.id;
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.db
    .delete(branches)
    .where(and(tenantWhere(branches, CTX_TEMPLO), eq(branches.id, branchB)));
  await app.close();
});

beforeEach(async () => {
  // cleanAllTestData borra TODOS los users salvo admin@test.com y vacía
  // novedades/novedad_views: el coach se re-siembra en cada test.
  await cleanAllTestData(app);
  await createStaffUser(app, {
    email: COACH_EMAIL,
    password: COACH_PASSWORD,
    firstName: "Coach",
    lastName: "Novedades",
    role: "coach",
    branchId: branchA,
  });
  coachToken = await getAuthToken(app, COACH_EMAIL, COACH_PASSWORD);
});

// ═══════════════════════════════════════════════════════════════════════════
// (1) CRUD admin
// ═══════════════════════════════════════════════════════════════════════════

describe("admin — CRUD", () => {
  it("crea con los defaults: activa, publicada ahora, todas las sedes, sin destino", async () => {
    const before = Date.now();
    const res = await postComo("/admin/novedades", adminToken, {
      text: "Incorporamos clases de yoga",
    });
    expect(res.statusCode, res.body).toBe(201);
    const created = JSON.parse(res.body) as AdminNovedad;

    expect(created.text).toBe("Incorporamos clases de yoga");
    expect(created.status).toBe("active");
    expect(created.scopeBranchIds).toBeNull();
    expect(created.destinationType).toBeNull();
    expect(created.destinationSection).toBeNull();
    expect(created.whatsappText).toBeNull();
    expect(created.views).toBe(0);
    expect(created.clicks).toBe(0);
    expect(created.createdBy).toBe(adminId);
    // publishAt ≈ ahora (DATETIME trunca los ms, de ahí la tolerancia).
    const publishMs = new Date(created.publishAt).getTime();
    expect(publishMs).toBeGreaterThan(before - 2000);
    expect(publishMs).toBeLessThan(Date.now() + 2000);

    const row = await novedadRow(created.id, CTX_TEMPLO);
    expect(row?.tenantId).toBe(TENANT_TEMPLO);
  });

  it("hace trim del texto y acepta justo 120 caracteres", async () => {
    const trimmed = await postComo("/admin/novedades", adminToken, {
      text: "   Open gym el sábado   ",
    });
    expect(trimmed.statusCode, trimmed.body).toBe(201);
    expect((JSON.parse(trimmed.body) as AdminNovedad).text).toBe(
      "Open gym el sábado",
    );

    const exact = await postComo("/admin/novedades", adminToken, {
      text: "x".repeat(120),
    });
    expect(exact.statusCode, exact.body).toBe(201);

    // 120 caracteres reales + espacios alrededor: el largo se mide DESPUÉS del trim.
    const padded = await postComo("/admin/novedades", adminToken, {
      text: `  ${"y".repeat(120)}  `,
    });
    expect(padded.statusCode, padded.body).toBe(201);
  });

  it.each([
    ["vacío", ""],
    ["solo espacios", "     "],
    ["de 121 caracteres", "z".repeat(121)],
  ])("rechaza un texto %s con 400 y no persiste", async (_label, text) => {
    const res = await postComo("/admin/novedades", adminToken, { text });
    expect(res.statusCode, res.body).toBe(400);
    expect(await listAdmin(adminToken)).toHaveLength(0);
  });

  it("rechaza un body sin texto, con status o fecha inválidos o con sedes mal formadas", async () => {
    for (const payload of [
      {},
      { text: "ok", status: "draft" },
      { text: "ok", publishAt: "mañana" },
      { text: "ok", scopeBranchIds: ["a"] },
    ]) {
      const res = await postComo("/admin/novedades", adminToken, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
  });

  it("ignora un tenantId del body: el gimnasio sale siempre del servidor", async () => {
    // Fastify descarta las props que el schema no declara (removeAdditional).
    const res = await postComo("/admin/novedades", adminToken, {
      text: "Mass assignment",
      tenantId: 99999,
    });
    expect(res.statusCode, res.body).toBe(201);
    const created = JSON.parse(res.body) as AdminNovedad;
    expect((await novedadRow(created.id, CTX_TEMPLO))?.tenantId).toBe(
      TENANT_TEMPLO,
    );
  });

  describe("coherencia del destino", () => {
    it("acepta app_section con una sección válida", async () => {
      const res = await postComo("/admin/novedades", adminToken, {
        text: "Reservá tu clase",
        destinationType: "app_section",
        destinationSection: "reservas",
      });
      expect(res.statusCode, res.body).toBe(201);
      const created = JSON.parse(res.body) as AdminNovedad;
      expect(created.destinationType).toBe("app_section");
      expect(created.destinationSection).toBe("reservas");
      expect(created.whatsappText).toBeNull();
    });

    it("acepta whatsapp_sales con y sin texto", async () => {
      const sinTexto = await postComo("/admin/novedades", adminToken, {
        text: "Consultá por el pase",
        destinationType: "whatsapp_sales",
      });
      expect(sinTexto.statusCode, sinTexto.body).toBe(201);
      expect(
        (JSON.parse(sinTexto.body) as AdminNovedad).whatsappText,
      ).toBeNull();

      const conTexto = await postComo("/admin/novedades", adminToken, {
        text: "Consultá por el pase",
        destinationType: "whatsapp_sales",
        whatsappText: "Hola, quiero el pase",
      });
      expect(conTexto.statusCode, conTexto.body).toBe(201);
      expect((JSON.parse(conTexto.body) as AdminNovedad).whatsappText).toBe(
        "Hola, quiero el pase",
      );
    });

    it.each([
      ["app_section sin sección", { destinationType: "app_section" }],
      [
        "app_section con una sección fuera de la lista curada",
        { destinationType: "app_section", destinationSection: "inexistente" },
      ],
      [
        "app_section con texto de WhatsApp",
        {
          destinationType: "app_section",
          destinationSection: "reservas",
          whatsappText: "hola",
        },
      ],
      [
        "whatsapp_sales con sección",
        { destinationType: "whatsapp_sales", destinationSection: "reservas" },
      ],
      [
        "whatsapp_sales con un link en el texto",
        {
          destinationType: "whatsapp_sales",
          whatsappText: "mirá https://x.com",
        },
      ],
      [
        "whatsapp_sales con texto de 301 caracteres",
        { destinationType: "whatsapp_sales", whatsappText: "w".repeat(301) },
      ],
      ["tipo de destino desconocido", { destinationType: "email" }],
      ["sin destino pero con sección", { destinationSection: "reservas" }],
      ["sin destino pero con texto de WhatsApp", { whatsappText: "hola" }],
      [
        "destino null explícito pero con sección",
        { destinationType: null, destinationSection: "reservas" },
      ],
    ])("rechaza %s con 400", async (_label, destino) => {
      const res = await postComo("/admin/novedades", adminToken, {
        text: "Destino incoherente",
        ...destino,
      });
      expect(res.statusCode, res.body).toBe(400);
      expect(await listAdmin(adminToken)).toHaveLength(0);
    });
  });

  describe("sedes", () => {
    it("persiste un alcance de sedes del tenant (sin duplicados) y normaliza [] a todas", async () => {
      const res = await postComo("/admin/novedades", adminToken, {
        text: "Solo en dos sedes",
        scopeBranchIds: [branchA, branchB, branchA],
      });
      expect(res.statusCode, res.body).toBe(201);
      expect((JSON.parse(res.body) as AdminNovedad).scopeBranchIds).toEqual([
        branchA,
        branchB,
      ]);

      const vacio = await postComo("/admin/novedades", adminToken, {
        text: "Para todas",
        scopeBranchIds: [],
      });
      expect(vacio.statusCode, vacio.body).toBe(201);
      expect(
        (JSON.parse(vacio.body) as AdminNovedad).scopeBranchIds,
      ).toBeNull();
    });

    it("rechaza con 400 una sede inexistente", async () => {
      const res = await postComo("/admin/novedades", adminToken, {
        text: "Sede fantasma",
        scopeBranchIds: [branchA, 99999999],
      });
      expect(res.statusCode, res.body).toBe(400);
      expect(await listAdmin(adminToken)).toHaveLength(0);
    });
  });

  it("programa: una publishAt futura se persiste y la novedad no se ve todavía", async () => {
    const future = hoursAhead(48);
    const res = await postComo("/admin/novedades", adminToken, {
      text: "Programada",
      publishAt: future.toISOString(),
    });
    expect(res.statusCode, res.body).toBe(201);
    const created = JSON.parse(res.body) as AdminNovedad;
    // DATETIME trunca los ms.
    expect(
      Math.abs(new Date(created.publishAt).getTime() - future.getTime()),
    ).toBeLessThan(1000);

    const socio = await socioEn(branchA);
    expect(await listMember(socio.token)).toHaveLength(0);
  });

  describe("PUT", () => {
    it("edita texto, estado y fecha", async () => {
      const id = await insertNovedad({ text: "Original" });
      const newDate = hoursAgo(10);

      const res = await putComo(`/admin/novedades/${id}`, adminToken, {
        text: "  Editada  ",
        status: "paused",
        publishAt: newDate.toISOString(),
      });
      expect(res.statusCode, res.body).toBe(200);
      const updated = JSON.parse(res.body) as AdminNovedad;
      expect(updated.text).toBe("Editada");
      expect(updated.status).toBe("paused");
      expect(
        Math.abs(new Date(updated.publishAt).getTime() - newDate.getTime()),
      ).toBeLessThan(1000);
    });

    it("cambiar el destino con destinationType reemplaza el destino ENTERO", async () => {
      const id = await insertNovedad({
        destinationType: "app_section",
        destinationSection: "reservas",
      });

      // De app_section a whatsapp_sales sin mandar la sección: queda en null.
      const toWa = await putComo(`/admin/novedades/${id}`, adminToken, {
        destinationType: "whatsapp_sales",
        whatsappText: "Hola, consulta",
      });
      expect(toWa.statusCode, toWa.body).toBe(200);
      const wa = JSON.parse(toWa.body) as AdminNovedad;
      expect(wa.destinationType).toBe("whatsapp_sales");
      expect(wa.destinationSection).toBeNull();
      expect(wa.whatsappText).toBe("Hola, consulta");

      // A "sin destino": limpia sección y texto aunque no se manden.
      const clear = await putComo(`/admin/novedades/${id}`, adminToken, {
        destinationType: null,
      });
      expect(clear.statusCode, clear.body).toBe(200);
      const cleared = JSON.parse(clear.body) as AdminNovedad;
      expect(cleared.destinationType).toBeNull();
      expect(cleared.destinationSection).toBeNull();
      expect(cleared.whatsappText).toBeNull();
    });

    it("sin destinationType, la sección/texto se mezclan con el destino actual", async () => {
      const id = await insertNovedad({
        destinationType: "whatsapp_sales",
        whatsappText: "Texto viejo",
      });

      const res = await putComo(`/admin/novedades/${id}`, adminToken, {
        whatsappText: "Texto nuevo",
      });
      expect(res.statusCode, res.body).toBe(200);
      const updated = JSON.parse(res.body) as AdminNovedad;
      expect(updated.destinationType).toBe("whatsapp_sales");
      expect(updated.whatsappText).toBe("Texto nuevo");
    });

    it("rechaza con 400 un destino incoherente al editar (sección sin destino)", async () => {
      const id = await insertNovedad();
      const res = await putComo(`/admin/novedades/${id}`, adminToken, {
        destinationSection: "reservas",
      });
      expect(res.statusCode, res.body).toBe(400);
      expect((await novedadRow(id, CTX_TEMPLO))?.destinationSection).toBeNull();
    });

    it("rechaza con 400 texto de 121, sede ajena y body vacío", async () => {
      const id = await insertNovedad({ text: "Intacta" });
      for (const payload of [
        { text: "z".repeat(121) },
        { scopeBranchIds: [99999999] },
        {},
      ]) {
        const res = await putComo(
          `/admin/novedades/${id}`,
          adminToken,
          payload,
        );
        expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      }
      expect((await novedadRow(id, CTX_TEMPLO))?.text).toBe("Intacta");
    });

    it("un id inexistente da 404", async () => {
      const res = await putComo("/admin/novedades/99999999", adminToken, {
        text: "x",
      });
      expect(res.statusCode, res.body).toBe(404);
    });
  });

  describe("DELETE", () => {
    it("borra físicamente y las vistas caen en cascada", async () => {
      const id = await insertNovedad();
      const socio = await socioEn(branchA);
      const seen = await postComo(`/me/novedades/${id}/event`, socio.token, {
        type: "seen",
      });
      expect(seen.statusCode, seen.body).toBe(200);
      expect(await viewsOf(id)).toHaveLength(1);

      const res = await deleteComo(`/admin/novedades/${id}`, adminToken);
      expect(res.statusCode, res.body).toBe(200);

      expect(await novedadRow(id, CTX_TEMPLO)).toBeNull();
      expect(await viewsOf(id)).toHaveLength(0);
      expect(await listAdmin(adminToken)).toHaveLength(0);
    });

    it("un id inexistente da 404", async () => {
      const res = await deleteComo("/admin/novedades/99999999", adminToken);
      expect(res.statusCode, res.body).toBe(404);
    });
  });

  describe("listado", () => {
    it("incluye pausadas y programadas, ordenadas por publishAt DESC", async () => {
      const vieja = await insertNovedad({
        text: "vieja",
        publishAt: hoursAgo(30),
      });
      const pausada = await insertNovedad({
        text: "pausada",
        publishAt: hoursAgo(5),
        status: "paused",
      });
      const activa = await insertNovedad({
        text: "activa",
        publishAt: hoursAgo(2),
      });
      const programada = await insertNovedad({
        text: "programada",
        publishAt: hoursAhead(24),
      });

      const items = await listAdmin(adminToken);
      expect(items.map((n) => n.id)).toEqual([
        programada,
        activa,
        pausada,
        vieja,
      ]);
    });

    it("devuelve vistas y clics únicos por novedad (sin N+1: una novedad sin eventos da 0)", async () => {
      const conEventos = await insertNovedad({
        text: "con eventos",
        destinationType: "app_section",
        destinationSection: "reservas",
      });
      const sinEventos = await insertNovedad({ text: "sin eventos" });

      const a = await socioEn(branchA);
      const b = await socioEn(branchB);
      const c = await socioEn(branchA);
      await postComo(`/me/novedades/${conEventos}/event`, a.token, {
        type: "seen",
      });
      await postComo(`/me/novedades/${conEventos}/event`, a.token, {
        type: "clicked",
      });
      await postComo(`/me/novedades/${conEventos}/event`, a.token, {
        type: "clicked",
      });
      await postComo(`/me/novedades/${conEventos}/event`, b.token, {
        type: "seen",
      });
      await postComo(`/me/novedades/${conEventos}/event`, c.token, {
        type: "clicked",
      });

      const items = await listAdmin(adminToken);
      const con = items.find((n) => n.id === conEventos);
      const sin = items.find((n) => n.id === sinEventos);
      // a: visto+clic, b: solo visto, c: clic sin visto previo → 3 vistas, 2 clics.
      expect(con?.views).toBe(3);
      expect(con?.clicks).toBe(2);
      expect(sin?.views).toBe(0);
      expect(sin?.clicks).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (2) Roles
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// (1b) Push opcional (mig 0297) — campos y validaciones del CRUD
//      El envío en sí (cron) se prueba en novedades-push.test.ts.
// ═══════════════════════════════════════════════════════════════════════════

describe("admin — push opcional", () => {
  it("por defecto la push está apagada y sin título ni envío", async () => {
    const res = await postComo("/admin/novedades", adminToken, {
      text: "Sin push",
    });
    expect(res.statusCode, res.body).toBe(201);
    const created = JSON.parse(res.body) as AdminNovedad;
    expect(created.pushRequested).toBe(false);
    expect(created.pushTitle).toBeNull();
    expect(created.pushQueuedAt).toBeNull();

    const [listed] = await listAdmin(adminToken);
    expect(listed?.pushRequested).toBe(false);
  });

  it("crea con sendPush y título (recortado)", async () => {
    const res = await postComo("/admin/novedades", adminToken, {
      text: "Con push",
      sendPush: true,
      pushTitle: "  El Templo Alberti  ",
    });
    expect(res.statusCode, res.body).toBe(201);
    const created = JSON.parse(res.body) as AdminNovedad;
    expect(created.pushRequested).toBe(true);
    expect(created.pushTitle).toBe("El Templo Alberti");
    expect(created.pushQueuedAt).toBeNull();

    const row = await novedadRow(created.id, CTX_TEMPLO);
    expect(row?.pushRequested).toBe(true);
    expect(row?.pushTitle).toBe("El Templo Alberti");
    expect(row?.pushQueuedAt).toBeNull();
  });

  it("sendPush sin título (o con null) guarda null: se usa el nombre del gimnasio al enviar", async () => {
    for (const extra of [{}, { pushTitle: null }]) {
      const res = await postComo("/admin/novedades", adminToken, {
        text: "Con push",
        sendPush: true,
        ...extra,
      });
      expect(res.statusCode, res.body).toBe(201);
      const created = JSON.parse(res.body) as AdminNovedad;
      expect(created.pushRequested).toBe(true);
      expect(created.pushTitle).toBeNull();
    }
  });

  it("acepta un título de exactamente 50 caracteres", async () => {
    const res = await postComo("/admin/novedades", adminToken, {
      text: "Con push",
      sendPush: true,
      pushTitle: "t".repeat(50),
    });
    expect(res.statusCode, res.body).toBe(201);
  });

  it.each([
    ["de 51 caracteres", "t".repeat(51)],
    ["vacío", ""],
    ["solo espacios", "     "],
  ])(
    "rechaza un título %s con push prendida y no persiste",
    async (_l, pushTitle) => {
      const res = await postComo("/admin/novedades", adminToken, {
        text: "Con push",
        sendPush: true,
        pushTitle,
      });
      expect(res.statusCode, res.body).toBe(400);
      expect(await listAdmin(adminToken)).toHaveLength(0);
    },
  );

  it("con la push apagada el título se ignora (queda null)", async () => {
    const res = await postComo("/admin/novedades", adminToken, {
      text: "Sin push",
      sendPush: false,
      pushTitle: "Ignorado",
    });
    expect(res.statusCode, res.body).toBe(201);
    const created = JSON.parse(res.body) as AdminNovedad;
    expect(created.pushRequested).toBe(false);
    expect(created.pushTitle).toBeNull();
  });

  it("rechaza sendPush que no es booleano", async () => {
    const res = await postComo("/admin/novedades", adminToken, {
      text: "Con push",
      sendPush: "si",
    });
    expect(res.statusCode, res.body).toBe(400);
  });

  it("PUT: prende la push, cambia el título y la apaga (limpia el título)", async () => {
    const id = await insertNovedad();

    const on = await putComo(`/admin/novedades/${id}`, adminToken, {
      sendPush: true,
      pushTitle: "Primero",
    });
    expect(on.statusCode, on.body).toBe(200);
    expect(JSON.parse(on.body)).toMatchObject({
      pushRequested: true,
      pushTitle: "Primero",
      pushQueuedAt: null,
    });

    // Solo el título: la push sigue prendida.
    const retitled = await putComo(`/admin/novedades/${id}`, adminToken, {
      pushTitle: "Segundo",
    });
    expect(retitled.statusCode, retitled.body).toBe(200);
    expect(JSON.parse(retitled.body)).toMatchObject({
      pushRequested: true,
      pushTitle: "Segundo",
    });

    const off = await putComo(`/admin/novedades/${id}`, adminToken, {
      sendPush: false,
    });
    expect(off.statusCode, off.body).toBe(200);
    expect(JSON.parse(off.body)).toMatchObject({
      pushRequested: false,
      pushTitle: null,
    });
  });

  it("PUT: valida el título al editar", async () => {
    const id = await insertNovedad({ pushRequested: true, pushTitle: "Ok" });
    for (const pushTitle of ["", "   ", "t".repeat(51)]) {
      const res = await putComo(`/admin/novedades/${id}`, adminToken, {
        pushTitle,
      });
      expect(res.statusCode, `título "${pushTitle}"`).toBe(400);
    }
    expect((await novedadRow(id, CTX_TEMPLO))?.pushTitle).toBe("Ok");
  });

  it("PUT: editar solo el texto de una novedad con push no toca la push", async () => {
    const id = await insertNovedad({ pushRequested: true, pushTitle: "Ok" });
    const res = await putComo(`/admin/novedades/${id}`, adminToken, {
      text: "Texto nuevo",
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      text: "Texto nuevo",
      pushRequested: true,
      pushTitle: "Ok",
    });
  });

  describe("una vez encolada la push", () => {
    const queuedAt = hoursAgo(2);

    it("expone pushQueuedAt en el listado", async () => {
      const id = await insertNovedad({
        pushRequested: true,
        pushTitle: "Ya salió",
        pushQueuedAt: queuedAt,
      });
      const listed = (await listAdmin(adminToken)).find((n) => n.id === id);
      expect(listed?.pushRequested).toBe(true);
      expect(listed?.pushTitle).toBe("Ya salió");
      expect(listed?.pushQueuedAt).not.toBeNull();
      // DATETIME trunca los ms: tolerancia de 2 s.
      expect(
        Math.abs(
          new Date(listed!.pushQueuedAt!).getTime() - queuedAt.getTime(),
        ),
      ).toBeLessThan(2000);
    });

    it.each([
      ["apagar la push", { sendPush: false }],
      ["cambiar el título", { pushTitle: "Otro" }],
      ["borrar el título", { pushTitle: null }],
      ["prender con otro título", { sendPush: true, pushTitle: "Otro" }],
    ])("rechaza %s con 400 y un mensaje claro", async (_l, payload) => {
      const id = await insertNovedad({
        pushRequested: true,
        pushTitle: "Ya salió",
        pushQueuedAt: queuedAt,
      });
      const res = await putComo(`/admin/novedades/${id}`, adminToken, payload);
      expect(res.statusCode, res.body).toBe(400);
      expect(res.body).toContain("La notificación push ya se envió");

      const row = await novedadRow(id, CTX_TEMPLO);
      expect(row?.pushRequested).toBe(true);
      expect(row?.pushTitle).toBe("Ya salió");
      expect(row?.pushQueuedAt).not.toBeNull();
    });

    it("repetir los mismos valores de push junto con otro cambio es válido", async () => {
      const id = await insertNovedad({
        pushRequested: true,
        pushTitle: "Ya salió",
        pushQueuedAt: queuedAt,
      });
      const res = await putComo(`/admin/novedades/${id}`, adminToken, {
        text: "Texto nuevo",
        sendPush: true,
        pushTitle: "Ya salió",
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({
        text: "Texto nuevo",
        pushRequested: true,
        pushTitle: "Ya salió",
      });
    });

    it("el resto de la novedad sigue editable (texto, estado) y pushQueuedAt no cambia", async () => {
      const id = await insertNovedad({
        pushRequested: true,
        pushQueuedAt: queuedAt,
      });
      const res = await putComo(`/admin/novedades/${id}`, adminToken, {
        text: "Corregida",
        status: "paused",
      });
      expect(res.statusCode, res.body).toBe(200);
      const body = JSON.parse(res.body) as AdminNovedad;
      expect(body.text).toBe("Corregida");
      expect(body.status).toBe("paused");
      expect(body.pushQueuedAt).not.toBeNull();
      expect(
        Math.abs(new Date(body.pushQueuedAt!).getTime() - queuedAt.getTime()),
      ).toBeLessThan(2000);
    });
  });

  it("un coach no puede crear con push (403)", async () => {
    const res = await postComo("/admin/novedades", coachToken, {
      text: "Intento",
      sendPush: true,
    });
    expect(res.statusCode, res.body).toBe(403);
  });
});

describe("roles", () => {
  it("un coach y un socio reciben 403 en las 4 rutas admin", async () => {
    const id = await insertNovedad({ text: "Intacta" });
    const socio = await socioEn(branchA);

    for (const token of [coachToken, socio.token]) {
      expect((await getComo("/admin/novedades", token)).statusCode).toBe(403);
      expect(
        (await postComo("/admin/novedades", token, { text: "hack" }))
          .statusCode,
      ).toBe(403);
      expect(
        (await putComo(`/admin/novedades/${id}`, token, { text: "hack" }))
          .statusCode,
      ).toBe(403);
      expect(
        (await deleteComo(`/admin/novedades/${id}`, token)).statusCode,
      ).toBe(403);
    }

    const row = await novedadRow(id, CTX_TEMPLO);
    expect(row?.text).toBe("Intacta");
    expect(await listAdmin(adminToken)).toHaveLength(1);
  });

  it("sin token todas las rutas dan 401", async () => {
    const id = await insertNovedad();
    expect((await getComo("/admin/novedades", null)).statusCode).toBe(401);
    expect(
      (await postComo("/admin/novedades", null, { text: "x" })).statusCode,
    ).toBe(401);
    expect(
      (await putComo(`/admin/novedades/${id}`, null, { text: "x" })).statusCode,
    ).toBe(401);
    expect((await deleteComo(`/admin/novedades/${id}`, null)).statusCode).toBe(
      401,
    );
    expect((await getComo("/me/novedades", null)).statusCode).toBe(401);
    expect(
      (await postComo(`/me/novedades/${id}/event`, null, { type: "seen" }))
        .statusCode,
    ).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (3) GET /me/novedades
// ═══════════════════════════════════════════════════════════════════════════

describe("socio — GET /me/novedades", () => {
  it("sin novedades devuelve []", async () => {
    const socio = await socioEn(branchA);
    expect(await listMember(socio.token)).toEqual([]);
  });

  it("filtra por sede: global, otra sede y multi-sede", async () => {
    const global = await insertNovedad({
      text: "global",
      publishAt: hoursAgo(1),
    });
    const globalVacia = await insertNovedad({
      text: "global []",
      publishAt: hoursAgo(2),
      scopeBranchIds: [],
    });
    const soloA = await insertNovedad({
      text: "solo A",
      publishAt: hoursAgo(3),
      scopeBranchIds: [branchA],
    });
    const soloB = await insertNovedad({
      text: "solo B",
      publishAt: hoursAgo(4),
      scopeBranchIds: [branchB],
    });

    const enA = await socioEn(branchA);
    const enB = await socioEn(branchB);

    expect((await listMember(enA.token)).map((n) => n.id)).toEqual([
      global,
      globalVacia,
      soloA,
    ]);
    expect((await listMember(enB.token)).map((n) => n.id)).toEqual([
      global,
      globalVacia,
      soloB,
    ]);
  });

  it("una novedad multi-sede se ve en cada sede incluida", async () => {
    const multi = await insertNovedad({ scopeBranchIds: [branchA, branchB] });
    const enA = await socioEn(branchA);
    const enB = await socioEn(branchB);
    expect((await listMember(enA.token)).map((n) => n.id)).toEqual([multi]);
    expect((await listMember(enB.token)).map((n) => n.id)).toEqual([multi]);
  });

  it("una novedad de una sola sede no se ve en las demás (id de sede que es prefijo no confunde)", async () => {
    // JSON_CONTAINS compara el valor entero: [branchA] no debe matchear a un
    // socio cuya sede es, por ejemplo, un id que contiene los mismos dígitos.
    await insertNovedad({ scopeBranchIds: [branchA] });
    const enB = await socioEn(branchB);
    expect(await listMember(enB.token)).toEqual([]);
  });

  it("excluye pausadas y programadas (futuras)", async () => {
    await insertNovedad({ text: "pausada", status: "paused" });
    await insertNovedad({ text: "futura", publishAt: hoursAhead(1) });
    const visible = await insertNovedad({ text: "visible" });

    const socio = await socioEn(branchA);
    expect((await listMember(socio.token)).map((n) => n.id)).toEqual([visible]);
  });

  it("una novedad pausada que se reactiva, o una programada que llega su hora, aparece", async () => {
    const id = await insertNovedad({ status: "paused" });
    const socio = await socioEn(branchA);
    expect(await listMember(socio.token)).toHaveLength(0);

    const res = await putComo(`/admin/novedades/${id}`, adminToken, {
      status: "active",
    });
    expect(res.statusCode, res.body).toBe(200);
    expect((await listMember(socio.token)).map((n) => n.id)).toEqual([id]);
  });

  it("devuelve como máximo 3, las más recientes, en orden publishAt DESC", async () => {
    const ids: number[] = [];
    // De la más vieja (10 h) a la más nueva (1 h).
    for (const h of [10, 8, 6, 4, 2, 1]) {
      ids.push(
        await insertNovedad({ text: `hace ${h}h`, publishAt: hoursAgo(h) }),
      );
    }
    const socio = await socioEn(branchA);
    const items = await listMember(socio.token);
    expect(items).toHaveLength(3);
    // ids[5] = hace 1h, ids[4] = hace 2h, ids[3] = hace 4h
    expect(items.map((n) => n.id)).toEqual([ids[5], ids[4], ids[3]]);
  });

  it("con la misma publishAt desempata por id DESC", async () => {
    const mismaHora = hoursAgo(3);
    const primera = await insertNovedad({
      text: "primera",
      publishAt: mismaHora,
    });
    const segunda = await insertNovedad({
      text: "segunda",
      publishAt: mismaHora,
    });
    const socio = await socioEn(branchA);
    expect((await listMember(socio.token)).map((n) => n.id)).toEqual([
      segunda,
      primera,
    ]);
  });

  it("el tope de 3 se aplica DESPUÉS de filtrar por sede", async () => {
    // 3 novedades más nuevas de OTRA sede no deben desplazar a la de mi sede.
    await insertNovedad({ publishAt: hoursAgo(1), scopeBranchIds: [branchB] });
    await insertNovedad({ publishAt: hoursAgo(2), scopeBranchIds: [branchB] });
    await insertNovedad({ publishAt: hoursAgo(3), scopeBranchIds: [branchB] });
    const mia = await insertNovedad({
      publishAt: hoursAgo(9),
      scopeBranchIds: [branchA],
    });

    const socio = await socioEn(branchA);
    expect((await listMember(socio.token)).map((n) => n.id)).toEqual([mia]);
  });

  it("branchLabel es null si es global y el nombre de la sede del socio si no", async () => {
    const global = await insertNovedad({
      text: "global",
      publishAt: hoursAgo(1),
    });
    const multi = await insertNovedad({
      text: "multi",
      publishAt: hoursAgo(2),
      scopeBranchIds: [branchA, branchB],
    });
    const soloB = await insertNovedad({
      text: "solo B",
      publishAt: hoursAgo(3),
      scopeBranchIds: [branchB],
    });

    const enB = await socioEn(branchB);
    const items = await listMember(enB.token);
    const byId = new Map(items.map((n) => [n.id, n]));
    expect(byId.get(global)?.branchLabel).toBeNull();
    // multi-sede: la etiqueta es la sede DEL SOCIO (B), no la primera del scope.
    expect(byId.get(multi)?.branchLabel).toBe(branchBName);
    expect(byId.get(soloB)?.branchLabel).toBe(branchBName);

    const enA = await socioEn(branchA);
    const itemsA = await listMember(enA.token);
    expect(itemsA.find((n) => n.id === multi)?.branchLabel).toBe(branchAName);
  });

  it("publishedAt es ISO y destination viene resuelto (o null)", async () => {
    const publish = hoursAgo(5);
    const sinDestino = await insertNovedad({
      text: "informa",
      publishAt: publish,
    });
    const seccion = await insertNovedad({
      text: "reservas",
      publishAt: hoursAgo(6),
      destinationType: "app_section",
      destinationSection: "reservas",
    });
    const waDefault = await insertNovedad({
      text: "wa default",
      publishAt: hoursAgo(7),
      destinationType: "whatsapp_sales",
    });

    const socio = await socioEn(branchA);
    const items = await listMember(socio.token);
    const byId = new Map(items.map((n) => [n.id, n]));

    const informa = byId.get(sinDestino);
    expect(informa?.destination).toBeNull();
    expect(informa?.publishedAt).toBe(
      new Date(informa?.publishedAt ?? "").toISOString(),
    );
    expect(
      Math.abs(
        new Date(informa?.publishedAt ?? 0).getTime() - publish.getTime(),
      ),
    ).toBeLessThan(1000);

    expect(byId.get(seccion)?.destination).toEqual({
      type: "app_section",
      section: "reservas",
      route: "/reservas",
      whatsappText: null,
    });
    expect(byId.get(waDefault)?.destination).toMatchObject({
      type: "whatsapp_sales",
      section: null,
      route: "/contacto-ventas",
    });
    // Sin texto propio, el default global de ventas (nunca null).
    expect(byId.get(waDefault)?.destination?.whatsappText).toBeTruthy();
  });

  it("un destino whatsapp_sales con texto propio lo conserva", async () => {
    await insertNovedad({
      destinationType: "whatsapp_sales",
      whatsappText: "Quiero el pase",
    });
    const socio = await socioEn(branchA);
    expect((await listMember(socio.token))[0]?.destination).toMatchObject({
      type: "whatsapp_sales",
      whatsappText: "Quiero el pase",
    });
  });

  it("seen pasa a true después del evento, solo para ese socio", async () => {
    const id = await insertNovedad();
    const a = await socioEn(branchA);
    const b = await socioEn(branchA);

    expect((await listMember(a.token))[0]?.seen).toBe(false);
    const ev = await postComo(`/me/novedades/${id}/event`, a.token, {
      type: "seen",
    });
    expect(ev.statusCode, ev.body).toBe(200);
    expect(JSON.parse(ev.body)).toEqual({ success: true });

    expect((await listMember(a.token))[0]?.seen).toBe(true);
    expect((await listMember(b.token))[0]?.seen).toBe(false);
  });

  it("clicked también marca la novedad como vista", async () => {
    const id = await insertNovedad({
      destinationType: "app_section",
      destinationSection: "reservas",
    });
    const socio = await socioEn(branchA);
    await postComo(`/me/novedades/${id}/event`, socio.token, {
      type: "clicked",
    });
    expect((await listMember(socio.token))[0]?.seen).toBe(true);
  });

  it("los avisos pop-up de Comunicaciones NO aparecen en el feed (Novedades es solo la tabla novedades)", async () => {
    // Regresión de la reversión de D-13 (fase 199): un aviso pop-up activo,
    // global y vigente no se espeja como novedad. `avisos` no está en
    // TABLES_TO_CLEAN: este test borra el aviso que crea.
    const [inserted] = await app.db.insert(avisos).values(
      tenantValues(CTX_TEMPLO, {
        kind: "custom" as const,
        code: null,
        placement: "popup" as const,
        title: "Aviso pop-up que no es novedad",
        body: "Cuerpo del aviso",
        buttonText: "Ver",
        destinationType: "app_section" as const,
        destinationSection: "mi_templo",
        whatsappText: null,
        frequencyType: "every_open" as const,
        frequencyDays: null,
        status: "active" as const,
        sortOrder: 0,
      }),
    );
    const avisoId = Number(inserted.insertId);
    try {
      const socio = await socioEn(branchA);

      // Sin novedades: el feed es [] aunque haya un aviso pop-up vigente.
      expect(await listMember(socio.token)).toEqual([]);

      // Con una novedad: el feed trae solo esa, nunca el aviso.
      const id = await insertNovedad({ text: "Solo novedades" });
      const feed = await listMember(socio.token);
      expect(feed.map((n) => n.id)).toEqual([id]);
      expect(feed.map((n) => n.key)).toEqual([`novedad:${id}`]);
      expect(feed.map((n) => n.text)).not.toContain(
        "Aviso pop-up que no es novedad",
      );
    } finally {
      await app.db
        .delete(avisos)
        .where(and(tenantWhere(avisos, CTX_TEMPLO), eq(avisos.id, avisoId)));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (4) POST /me/novedades/:id/event
// ═══════════════════════════════════════════════════════════════════════════

describe("socio — POST /me/novedades/:id/event", () => {
  it("seen es idempotente: una sola fila y first_seen_at no se mueve", async () => {
    const id = await insertNovedad();
    const socio = await socioEn(branchA);

    const first = await postComo(`/me/novedades/${id}/event`, socio.token, {
      type: "seen",
    });
    expect(first.statusCode, first.body).toBe(200);
    const [row1] = await viewsOf(id);
    expect(row1?.userId).toBe(socio.id);
    expect(row1?.tenantId).toBe(TENANT_TEMPLO);
    expect(row1?.clickedAt).toBeNull();

    const second = await postComo(`/me/novedades/${id}/event`, socio.token, {
      type: "seen",
    });
    expect(second.statusCode, second.body).toBe(200);
    const rows = await viewsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.firstSeenAt.getTime()).toBe(row1?.firstSeenAt.getTime());
  });

  it("clicked sin seen previo crea la fila con first_seen_at y clicked_at", async () => {
    const id = await insertNovedad({
      destinationType: "app_section",
      destinationSection: "reservas",
    });
    const socio = await socioEn(branchA);

    const res = await postComo(`/me/novedades/${id}/event`, socio.token, {
      type: "clicked",
    });
    expect(res.statusCode, res.body).toBe(200);
    const rows = await viewsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.firstSeenAt).toBeInstanceOf(Date);
    expect(rows[0]?.clickedAt).toBeInstanceOf(Date);
  });

  it("clicked después de seen completa clicked_at y es idempotente (conserva el primer clic)", async () => {
    const id = await insertNovedad();
    const socio = await socioEn(branchA);

    await postComo(`/me/novedades/${id}/event`, socio.token, { type: "seen" });
    const [seenRow] = await viewsOf(id);
    expect(seenRow?.clickedAt).toBeNull();

    await postComo(`/me/novedades/${id}/event`, socio.token, {
      type: "clicked",
    });
    const [clickedRow] = await viewsOf(id);
    expect(clickedRow?.clickedAt).toBeInstanceOf(Date);
    expect(clickedRow?.firstSeenAt.getTime()).toBe(
      seenRow?.firstSeenAt.getTime(),
    );

    await postComo(`/me/novedades/${id}/event`, socio.token, {
      type: "clicked",
    });
    await postComo(`/me/novedades/${id}/event`, socio.token, { type: "seen" });
    const rows = await viewsOf(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.clickedAt?.getTime()).toBe(
      clickedRow?.clickedAt?.getTime(),
    );
  });

  it("dos socios generan dos filas independientes", async () => {
    const id = await insertNovedad();
    const a = await socioEn(branchA);
    const b = await socioEn(branchA);
    await postComo(`/me/novedades/${id}/event`, a.token, { type: "seen" });
    await postComo(`/me/novedades/${id}/event`, b.token, { type: "seen" });
    expect((await viewsOf(id)).map((r) => r.userId).sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });

  it("rechaza con 400 un type inválido o un body sin type", async () => {
    const id = await insertNovedad();
    const socio = await socioEn(branchA);
    for (const payload of [{ type: "dismissed" }, {}]) {
      const res = await postComo(
        `/me/novedades/${id}/event`,
        socio.token,
        payload,
      );
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(await viewsOf(id)).toHaveLength(0);
  });

  it("el userId sale siempre del token: un userId en el body se ignora", async () => {
    const id = await insertNovedad();
    const socio = await socioEn(branchA);
    const otro = await socioEn(branchA);
    const res = await postComo(`/me/novedades/${id}/event`, socio.token, {
      type: "seen",
      userId: otro.id,
    });
    expect(res.statusCode, res.body).toBe(200);
    const rows = await viewsOf(id);
    expect(rows.map((r) => r.userId)).toEqual([socio.id]);
  });

  describe("404 cuando el socio no debería verla (y no se crea ninguna fila)", () => {
    it("novedad inexistente", async () => {
      const socio = await socioEn(branchA);
      const res = await postComo("/me/novedades/99999999/event", socio.token, {
        type: "seen",
      });
      expect(res.statusCode, res.body).toBe(404);
    });

    it.each([
      ["pausada", { status: "paused" as const }],
      ["futura", { publishAt: hoursAhead(2) }],
    ])("novedad %s", async (_label, over) => {
      const id = await insertNovedad(over);
      const socio = await socioEn(branchA);
      for (const type of ["seen", "clicked"] as const) {
        const res = await postComo(`/me/novedades/${id}/event`, socio.token, {
          type,
        });
        expect(res.statusCode, res.body).toBe(404);
      }
      expect(await viewsOf(id)).toHaveLength(0);
    });

    it("novedad de otra sede", async () => {
      const id = await insertNovedad({ scopeBranchIds: [branchB] });
      const enA = await socioEn(branchA);
      const res = await postComo(`/me/novedades/${id}/event`, enA.token, {
        type: "seen",
      });
      expect(res.statusCode, res.body).toBe(404);
      expect(await viewsOf(id)).toHaveLength(0);

      // Control: el socio de la sede correcta sí puede.
      const enB = await socioEn(branchB);
      const ok = await postComo(`/me/novedades/${id}/event`, enB.token, {
        type: "seen",
      });
      expect(ok.statusCode, ok.body).toBe(200);
    });

    it("una novedad que deja de verse (la desplazaron 3 más nuevas) sigue reportable mientras esté activa", async () => {
      // El tope de 3 es de presentación: el chequeo de eventos valida
      // visibilidad por sede/estado/fecha, no por ranking.
      const vieja = await insertNovedad({ publishAt: hoursAgo(20) });
      for (const h of [1, 2, 3])
        await insertNovedad({ publishAt: hoursAgo(h) });
      const socio = await socioEn(branchA);
      const res = await postComo(`/me/novedades/${vieja}/event`, socio.token, {
        type: "seen",
      });
      expect(res.statusCode, res.body).toBe(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (5) Aislamiento cross-tenant
// ═══════════════════════════════════════════════════════════════════════════

describe("aislamiento entre gimnasios", () => {
  let gym2: SegundoGimnasio;
  let ctxDos: TenantContext;
  let temploId: number;
  let gym2Id: number;

  beforeEach(async () => {
    gym2 = await seedSecondTenant(app);
    ctxDos = { tenantId: gym2.tenantId };
    temploId = await insertNovedad({
      text: "De El Templo",
      publishAt: hoursAgo(1),
    });
    gym2Id = await insertNovedad(
      { text: "Del gimnasio 2", publishAt: hoursAgo(1) },
      ctxDos,
    );
  });

  it("el listado admin de cada gimnasio solo trae SUS novedades", async () => {
    const dos = await listAdmin(gym2.adminToken);
    expect(dos.map((n) => n.id)).toEqual([gym2Id]);
    const templo = await listAdmin(adminToken);
    expect(templo.map((n) => n.id)).toEqual([temploId]);
  });

  it("el feed del socio de cada gimnasio solo trae SUS novedades (aunque las dos sean globales)", async () => {
    const socioDos = gym2.socios[0];
    expect((await listMember(socioDos.token)).map((n) => n.id)).toEqual([
      gym2Id,
    ]);

    const socioTemplo = await socioEn(branchA);
    expect((await listMember(socioTemplo.token)).map((n) => n.id)).toEqual([
      temploId,
    ]);
  });

  it("PUT sobre una novedad ajena da 404 (nunca 403) y no la modifica", async () => {
    const res = await putComo(`/admin/novedades/${temploId}`, gym2.adminToken, {
      text: "Pisada",
      status: "paused",
    });
    expect(res.statusCode, res.body).toBe(404);
    const row = await novedadRow(temploId, CTX_TEMPLO);
    expect(row?.text).toBe("De El Templo");
    expect(row?.status).toBe("active");

    const inverso = await putComo(`/admin/novedades/${gym2Id}`, adminToken, {
      text: "Pisada",
    });
    expect(inverso.statusCode, inverso.body).toBe(404);
    expect((await novedadRow(gym2Id, ctxDos))?.text).toBe("Del gimnasio 2");
  });

  it("DELETE sobre una novedad ajena da 404 (nunca 403) y no la borra", async () => {
    const res = await deleteComo(
      `/admin/novedades/${temploId}`,
      gym2.adminToken,
    );
    expect(res.statusCode, res.body).toBe(404);
    expect(await novedadRow(temploId, CTX_TEMPLO)).not.toBeNull();

    const inverso = await deleteComo(`/admin/novedades/${gym2Id}`, adminToken);
    expect(inverso.statusCode, inverso.body).toBe(404);
    expect(await novedadRow(gym2Id, ctxDos)).not.toBeNull();
  });

  it("el evento de un socio sobre una novedad de otro gimnasio da 404 y no crea filas", async () => {
    const socioDos = gym2.socios[0];
    const res = await postComo(
      `/me/novedades/${temploId}/event`,
      socioDos.token,
      {
        type: "seen",
      },
    );
    expect(res.statusCode, res.body).toBe(404);
    expect(await viewsOf(temploId)).toHaveLength(0);
    expect(await viewsOf(temploId, ctxDos)).toHaveLength(0);

    const socioTemplo = await socioEn(branchA);
    const inverso = await postComo(
      `/me/novedades/${gym2Id}/event`,
      socioTemplo.token,
      {
        type: "clicked",
      },
    );
    expect(inverso.statusCode, inverso.body).toBe(404);
    expect(await viewsOf(gym2Id, ctxDos)).toHaveLength(0);
  });

  it("las vistas de un gimnasio no suman a las métricas del otro", async () => {
    const socioDos = gym2.socios[0];
    await postComo(`/me/novedades/${gym2Id}/event`, socioDos.token, {
      type: "seen",
    });
    await postComo(`/me/novedades/${gym2Id}/event`, socioDos.token, {
      type: "clicked",
    });

    const dos = await listAdmin(gym2.adminToken);
    expect(dos[0]?.views).toBe(1);
    expect(dos[0]?.clicks).toBe(1);
    const templo = await listAdmin(adminToken);
    expect(templo[0]?.views).toBe(0);
    expect(templo[0]?.clicks).toBe(0);
  });

  it("crear con una sede de otro gimnasio da 400 en ambos sentidos", async () => {
    const aTemplo = await postComo("/admin/novedades", gym2.adminToken, {
      text: "Sede ajena",
      scopeBranchIds: [branchA],
    });
    expect(aTemplo.statusCode, aTemplo.body).toBe(400);

    const aDos = await postComo("/admin/novedades", adminToken, {
      text: "Sede ajena",
      scopeBranchIds: [gym2.branchId],
    });
    expect(aDos.statusCode, aDos.body).toBe(400);

    // Control: con su propia sede sí.
    const ok = await postComo("/admin/novedades", gym2.adminToken, {
      text: "Sede propia",
      scopeBranchIds: [gym2.branchId],
    });
    expect(ok.statusCode, ok.body).toBe(201);
    const creada = JSON.parse(ok.body) as AdminNovedad;
    expect((await novedadRow(creada.id, ctxDos))?.tenantId).toBe(gym2.tenantId);
  });
});
