/**
 * Fase 175.1 Plan 03 (ISO-03) — batería de AISLAMIENTO de las 10 rutas
 * `tenant-scoped` de `/api/campaigns` (derivadas de `test/tenant-manifest.ts`,
 * transcritas abajo y en el SUMMARY): 7 admin + 3 públicas por token.
 *
 * EL CASO ESPECIAL: LAS 3 RUTAS PÚBLICAS RESUELVEN EL TENANT POR TOKEN (MINA M3)
 * -----------------------------------------------------------------------
 * `GET /track/open`, `GET /track/click` y `GET /unsubscribe` no tienen sesión
 * — el token HMAC (`t=`) solo IDENTIFICA un `sendId` (D-21), nunca autoriza ni
 * carga un `tenantId`. El tenant se resuelve SERVER-SIDE leyendo la fila
 * `campaign_sends` que ese `sendId` referencia (T-175-02, `tracking-service.ts`
 * `getSendEmail`) — la mina M3 (doc 06 §8-Q5) es exactamente que un opt-out o
 * un evento de UN gimnasio termine escrito o resuelto contra OTRO. 175-02 ya
 * cerró esto en código; este archivo lo PRUEBA: un token firmado sobre el send
 * del gimnasio 2 escribe SIEMPRE `tenant_id = TENANT_DOS` en la fila que
 * produce, leída de la base (nunca del payload del token, que ni lo carga).
 *
 * Ninguna de las 3 rutas devuelve el id de la fila que escribe (un GIF, un
 * 302, una página HTML genérica anti-enumeración — D-15), así que la evidencia
 * se relee de la base por (`sendId`,`type`) o por `email` — mismo idioma que
 * `tenantDeLaFila` del resto de la batería (`campaigns-gimnasio-dos.ts`).
 *
 * DATOS: `campaigns-gimnasio-dos.ts` (Task 1)
 * -----------------------------------------------------------------------
 * `sembrarCampanaTemplo` (recurso ajeno) y `sembrarCampaignsGimnasioDos` (lo
 * propio) siembran, CADA UNO, exactamente 1 campaña + 1 send (status='sent') +
 * 1 evento 'open' + 1 baja + 1 socio freemium elegible — la simetría 1=1 es a
 * propósito: si el `tenantWhere` de un método se rompe, un conteo que debería
 * ser 1 (propio) pasa a 2 (mezclado) — mismo idioma de detección que la
 * batería de `analytics` (175.1-02).
 *
 * CERO 403 (D-06 del milestone)
 * -----------------------------------------------------------------------
 * Un id de campaña ajena SIEMPRE resuelve 400 "Campaña no encontrada" (el
 * lookup por PK ya scopeado por `tenantWhere` la trata como inexistente), NUNCA
 * 403 — mismo criterio que el resto de la batería ISO-03.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-campaigns.test.ts
 *
 * @see test/fixtures/campaigns-gimnasio-dos.ts
 * @see test/tenancy/iso-03-analytics.test.ts — el precedente más reciente (175.1-02)
 * @see .planning/phases/175.1-.../175.1-CONTEXT.md — D-01, D-07, D-11
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { sql } from "drizzle-orm";
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
  sembrarCampanaTemplo,
  sembrarCampaignsGimnasioDos,
  limpiarCampaignsDeLaBateria,
  tenantDeLaFilaCampaign,
  ultimoEventoDeLaFila,
  unsubscribePorEmail,
  type FichaCampanaTemplo,
  type FichaCampaignsGimnasioDos,
} from "../fixtures/campaigns-gimnasio-dos";

// ─── Constantes ──────────────────────────────────────────────────────────────

const BASE = "/api/campaigns";

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: FichaCampanaTemplo;
let dos: FichaCampaignsGimnasioDos;
let templeAdminToken: string;

beforeAll(async () => {
  app = await createTestApp();
  // admin@test.com es 'owner' (test/setup.ts) — un único token cubre las
  // rutas de ADMIN_ROLES y OWNER_ROLES para el lado de El Templo.
  templeAdminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

beforeEach(async () => {
  await cleanAllTestData(app);
  // Defensivo (ver docblock del fixture): las 4 tablas de campaigns ya están
  // en TABLES_TO_CLEAN, pero corre ANTES de seedSecondTenant por el mismo
  // motivo de orden que el resto de la batería.
  await limpiarCampaignsDeLaBateria(app);
  gym2 = await seedSecondTenant(app);
  templo = await sembrarCampanaTemplo(app);
  dos = await sembrarCampaignsGimnasioDos(app, gym2);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarCampaignsDeLaBateria(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Utilidades ──────────────────────────────────────────────────────────────

function getComo(url: string, token: string) {
  return app.inject({
    method: "GET",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function postComo(
  url: string,
  token: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

const CREATE_BODY = {
  name: "Campaña de prueba ISO-03",
  subject: "Asunto de prueba",
  copySlots: {
    headline: "Titular de prueba",
    subheadline: "Subtítulo",
    body: "Cuerpo del email de prueba",
  },
};

/** Mensaje compartido de los rojos de AISLAMIENTO. */
function porQueImportaElAislamiento(ruta: string, detalle: string): string {
  return (
    `${ruta} mezcló datos de El Templo (${TENANT_TEMPLO}) y el gimnasio ` +
    `${TENANT_DOS}: ${detalle}. Revisar el \`tenantWhere(tabla, ctx)\` del ` +
    `método que sirve esta ruta en src/modules/campaigns/*.ts. NO "arreglar" ` +
    `esto filtrando en el front.`
  );
}

/** Cuenta total de filas de una tabla de campaigns (evidencia de "no se tocó nada"). */
async function contarFilas(
  app: FastifyInstance,
  tabla: "campaign_events" | "campaign_unsubscribes",
): Promise<number> {
  const resultado = (await app.db.execute(
    sql`SELECT /* tenant-safe: conteo total de evidencia — no hay ctx posible en una ruta publica sin token valido, y filtrar por tenant seria tautologico para esta asercion */ COUNT(*) AS n FROM ${sql.raw(tabla)}`,
  )) as unknown as [Array<{ n: number }>];
  return Number(resultado[0]?.[0]?.n ?? 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la batería", () => {
  it("las 10 rutas del manifiesto para /api/campaigns coinciden con las 10 de este archivo", async () => {
    // Transcrito a mano desde test/tenant-manifest.ts (líneas 606-626). El
    // SUMMARY vuelve a transcribir esta lista con el conteo derivado.
    const RUTAS_MANIFIESTO = [
      "GET /api/campaigns/admin",
      "GET /api/campaigns/admin/:id/funnel",
      "GET /api/campaigns/admin/eligible-count",
      "GET /api/campaigns/admin/sender",
      "POST /api/campaigns/admin",
      "POST /api/campaigns/admin/:id/send",
      "POST /api/campaigns/admin/:id/test",
      "GET /api/campaigns/track/click",
      "GET /api/campaigns/track/open",
      "GET /api/campaigns/unsubscribe",
    ];
    expect(RUTAS_MANIFIESTO.length).toBe(10);
    expect(new Set(RUTAS_MANIFIESTO).size).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /admin — crear campaña
// ═══════════════════════════════════════════════════════════════════════════

describe("crear campaña — POST /api/campaigns/admin", () => {
  const RUTA = "POST /api/campaigns/admin";

  it("aislamiento: la campaña creada por el gimnasio 2 queda estampada en TENANT_DOS (leído de la base)", async () => {
    const res = await postComo("/admin", gym2.adminToken, CREATE_BODY);
    expect(res.statusCode, res.body).toBe(201);
    const body = JSON.parse(res.body) as { id: number };
    const tenantReal = await tenantDeLaFilaCampaign(app, "campaigns", body.id);
    expect(
      tenantReal,
      porQueImportaElAislamiento(
        RUTA,
        `la campaña creada por el admin del gimnasio ${TENANT_DOS} quedó con tenant_id=${tenantReal}`,
      ),
    ).toBe(TENANT_DOS);
  });

  it("control: El Templo crea su propia campaña, estampada en TENANT_TEMPLO", async () => {
    const res = await postComo("/admin", templeAdminToken, CREATE_BODY);
    expect(res.statusCode, res.body).toBe(201);
    const body = JSON.parse(res.body) as {
      id: number;
      name: string;
      subject: string;
    };
    expect(body.name).toBe(CREATE_BODY.name);
    expect(body.subject).toBe(CREATE_BODY.subject);
    const tenantReal = await tenantDeLaFilaCampaign(app, "campaigns", body.id);
    expect(tenantReal).toBe(TENANT_TEMPLO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /admin — listar campañas
// ═══════════════════════════════════════════════════════════════════════════

describe("listar campañas — GET /api/campaigns/admin", () => {
  const RUTA = "GET /api/campaigns/admin";

  it("aislamiento: el listado del gimnasio 2 trae SOLO su propia campaña, no la de El Templo", async () => {
    const res = await getComo("/admin", gym2.adminToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as Array<{ id: number; name: string }>;
    const nombres = body.map((c) => c.name);
    expect(
      nombres,
      porQueImportaElAislamiento(RUTA, "el listado trae la campaña de El Templo"),
    ).not.toContain(templo.campaignName);
    expect(nombres, porQueImportaElAislamiento(RUTA, "falta la campaña propia")).toContain(
      dos.campaignName,
    );
  });

  it("control: El Templo ve su propia campaña en el listado, no la del gimnasio 2", async () => {
    const res = await getComo("/admin", templeAdminToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as Array<{ id: number; name: string }>;
    const nombres = body.map((c) => c.name);
    expect(nombres).toContain(templo.campaignName);
    expect(nombres).not.toContain(dos.campaignName);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /admin/sender — dirección de envío configurada
// ═══════════════════════════════════════════════════════════════════════════

describe("dirección de envío — GET /api/campaigns/admin/sender", () => {
  // Config GLOBAL (EmailService.campaignSender(), variable de entorno) —
  // no hay ningún campo por-tenant que aislar. El caso de aislamiento acá es
  // trivial por construcción: no existe un vector de fuga (no lee ninguna
  // tabla gym-owned). Se deja el describe con cero-403 en ambos gimnasios,
  // mismo criterio que "especiales/export" en la batería de analytics.
  it("cero 403: ambos gimnasios obtienen 200 con la misma dirección configurada (config global, sin dato por-tenant)", async () => {
    const resDos = await getComo("/admin/sender", gym2.adminToken);
    const resTemplo = await getComo("/admin/sender", templeAdminToken);
    expect(resDos.statusCode, resDos.body).toBe(200);
    expect(resTemplo.statusCode, resTemplo.body).toBe(200);
    const bodyDos = JSON.parse(resDos.body) as { from: string };
    const bodyTemplo = JSON.parse(resTemplo.body) as { from: string };
    expect(bodyDos.from).toBe(bodyTemplo.from);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /admin/eligible-count — tamaño de audiencia elegible
// ═══════════════════════════════════════════════════════════════════════════

describe("audiencia elegible — GET /api/campaigns/admin/eligible-count", () => {
  const RUTA = "GET /api/campaigns/admin/eligible-count";

  it("aislamiento: el conteo del gimnasio 2 es 1 (su propio freemium elegible), no 1+1=2 mezclado con El Templo", async () => {
    const res = await getComo("/admin/eligible-count", gym2.adminToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { count: number };
    expect(
      body.count,
      porQueImportaElAislamiento(
        RUTA,
        "count debería ser 1 (propio: freemiumUserId), no 1+1=2",
      ),
    ).toBe(1);
  });

  it("control: El Templo ve su propio count=1 (su propio freemium elegible)", async () => {
    const res = await getComo("/admin/eligible-count", templeAdminToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { count: number };
    expect(body.count).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /admin/:id/funnel — funnel de conversión por campaña
// ═══════════════════════════════════════════════════════════════════════════

describe("funnel de campaña — GET /api/campaigns/admin/:id/funnel", () => {
  const RUTA = "GET /api/campaigns/admin/:id/funnel";

  it("aislamiento: la campaña ajena (El Templo) resuelve 400 'no encontrada' para el gimnasio 2, nunca 403", async () => {
    const res = await getComo(`/admin/${templo.campaignId}/funnel`, gym2.adminToken);
    expect(
      res.statusCode,
      porQueImportaElAislamiento(RUTA, `esperaba 400, recibió ${res.statusCode}`),
    ).toBe(400);
    const body = JSON.parse(res.body) as { message: string };
    expect(body.message).toContain("Campaña no encontrada");
  });

  it("aislamiento: el funnel de la campaña propia del gimnasio 2 es enviado=1/abierto=1 (propio), no mezclado con El Templo", async () => {
    const res = await getComo(`/admin/${dos.campaignId}/funnel`, gym2.adminToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { enviado: number; abierto: number };
    expect(
      body.enviado,
      porQueImportaElAislamiento(RUTA, "enviado debería ser 1 (propio), no 1+1=2"),
    ).toBe(1);
    expect(
      body.abierto,
      porQueImportaElAislamiento(RUTA, "abierto debería ser 1 (propio), no 1+1=2"),
    ).toBe(1);
  });

  it("control: El Templo ve el funnel de su propia campaña (enviado=1, abierto=1)", async () => {
    const res = await getComo(`/admin/${templo.campaignId}/funnel`, templeAdminToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { enviado: number; abierto: number };
    expect(body.enviado).toBe(1);
    expect(body.abierto).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /admin/:id/test — preview inerte de una campaña
// ═══════════════════════════════════════════════════════════════════════════

describe("preview de campaña — POST /api/campaigns/admin/:id/test", () => {
  const RUTA = "POST /api/campaigns/admin/:id/test";
  const BODY = { email: "preview-destino@test.com" };

  it("aislamiento: la campaña ajena (El Templo) resuelve 400 'no encontrada' para el gimnasio 2, ANTES de intentar enviar el email", async () => {
    const res = await postComo(
      `/admin/${templo.campaignId}/test`,
      gym2.adminToken,
      BODY,
    );
    expect(
      res.statusCode,
      porQueImportaElAislamiento(RUTA, `esperaba 400, recibió ${res.statusCode}`),
    ).toBe(400);
    const body = JSON.parse(res.body) as { message: string };
    expect(
      body.message,
      porQueImportaElAislamiento(
        RUTA,
        "el mensaje debería ser 'Campaña no encontrada' (el lookup por ctx corta ANTES del envío), no el error de RESEND_API_KEY",
      ),
    ).toContain("Campaña no encontrada");
  });

  it("control: el gimnasio 2 sí resuelve su propia campaña (llega al paso de envío — RESEND_API_KEY no configurado en test, 400 distinto)", async () => {
    const res = await postComo(`/admin/${dos.campaignId}/test`, gym2.adminToken, BODY);
    expect(res.statusCode, res.body).toBe(400);
    const body = JSON.parse(res.body) as { message: string };
    // Prueba que el lookup por ctx SÍ encontró la campaña propia: el error es
    // el de configuración de email, no "no encontrada" — RESEND_API_KEY no
    // está seteado en el entorno de test (test/campaigns-send.test.ts D-11).
    expect(body.message).not.toContain("no encontrada");
    expect(body.message).toContain("No se pudo enviar la prueba");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /admin/:id/send — envío masivo (owner-only)
// ═══════════════════════════════════════════════════════════════════════════

describe("enviar campaña — POST /api/campaigns/admin/:id/send", () => {
  const RUTA = "POST /api/campaigns/admin/:id/send";

  it("aislamiento: el owner del gimnasio 2 no puede enviar la campaña de El Templo (400 'no encontrada', nunca 403)", async () => {
    const res = await postComo(`/admin/${templo.campaignId}/send`, dos.ownerToken);
    expect(
      res.statusCode,
      porQueImportaElAislamiento(RUTA, `esperaba 400, recibió ${res.statusCode}`),
    ).toBe(400);
    const body = JSON.parse(res.body) as { message: string };
    expect(body.message).toContain("Campaña no encontrada");
  });

  it("control: el owner del gimnasio 2 envía su propia campaña (audiencia propia: recipientCount=2, newlyEnrolled=1)", async () => {
    const res = await postComo(`/admin/${dos.campaignId}/send`, dos.ownerToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      campaignId: number;
      recipientCount: number;
      newlyEnrolled: number;
    };
    // recipientCount = 1 send sembrado (status='sent') + 1 nuevo enrolamiento
    // del freemiumUserId propio (el único elegible: gym2.socios[0] no es
    // freemium). newlyEnrolled=1 confirma que la audiencia NO se mezcló con
    // el freemium de El Templo (si se mezclara, listEligible traería 2
    // elegibles y newlyEnrolled sería 2).
    expect(body.campaignId).toBe(dos.campaignId);
    expect(
      body.newlyEnrolled,
      porQueImportaElAislamiento(
        RUTA,
        "newlyEnrolled debería ser 1 (solo el freemium propio), no 2 (mezclado con el de El Templo)",
      ),
    ).toBe(1);
    expect(body.recipientCount).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /track/open?t= — pixel de apertura (público, por token — mina M3)
// ═══════════════════════════════════════════════════════════════════════════

describe("pixel de apertura — GET /api/campaigns/track/open", () => {
  const RUTA = "GET /api/campaigns/track/open";

  it("mina M3: un token del send del gimnasio 2 escribe el evento con tenant_id=TENANT_DOS, leído de la base (no del payload del token, que no lo carga)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/track/open?t=${encodeURIComponent(dos.sendToken)}`,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers["content-type"]).toContain("image/gif");
    const evento = await ultimoEventoDeLaFila(app, dos.sendId, "open");
    expect(
      evento,
      "la ruta publica deberia haber escrito un nuevo evento 'open' para el send del gimnasio 2",
    ).not.toBeNull();
    expect(
      evento?.tenantId,
      porQueImportaElAislamiento(
        RUTA,
        `el evento 'open' del send del gimnasio ${TENANT_DOS} quedó con tenant_id=${evento?.tenantId}`,
      ),
    ).toBe(TENANT_DOS);
  });

  it("control: un token del send de El Templo escribe el evento con tenant_id=TENANT_TEMPLO", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/track/open?t=${encodeURIComponent(templo.sendToken)}`,
    });
    expect(res.statusCode, res.body).toBe(200);
    const evento = await ultimoEventoDeLaFila(app, templo.sendId, "open");
    expect(evento?.tenantId).toBe(TENANT_TEMPLO);
  });

  it("un token inválido/ajeno degrada en silencio: 200 + GIF, sin escribir ninguna fila nueva", async () => {
    const antes = await contarFilas(app, "campaign_events");
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/track/open?t=token-invalido-no-resuelve-nada`,
    });
    expect(res.statusCode, res.body).toBe(200);
    const despues = await contarFilas(app, "campaign_events");
    expect(
      despues,
      "un token invalido NUNCA debe insertar una fila — degrada en silencio (D-21)",
    ).toBe(antes);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /track/click?t= — redirect de click (público, por token — mina M3)
// ═══════════════════════════════════════════════════════════════════════════

describe("redirect de click — GET /api/campaigns/track/click", () => {
  const RUTA = "GET /api/campaigns/track/click";

  it("mina M3: un token del send del gimnasio 2 escribe el evento 'click' con tenant_id=TENANT_DOS, leído de la base", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/track/click?t=${encodeURIComponent(dos.sendToken)}`,
    });
    expect(res.statusCode, res.body).toBe(302);
    const evento = await ultimoEventoDeLaFila(app, dos.sendId, "click");
    expect(evento).not.toBeNull();
    expect(
      evento?.tenantId,
      porQueImportaElAislamiento(
        RUTA,
        `el evento 'click' del send del gimnasio ${TENANT_DOS} quedó con tenant_id=${evento?.tenantId}`,
      ),
    ).toBe(TENANT_DOS);
  });

  it("control: un token del send de El Templo escribe el evento 'click' con tenant_id=TENANT_TEMPLO", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/track/click?t=${encodeURIComponent(templo.sendToken)}`,
    });
    expect(res.statusCode, res.body).toBe(302);
    const evento = await ultimoEventoDeLaFila(app, templo.sendId, "click");
    expect(evento?.tenantId).toBe(TENANT_TEMPLO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /unsubscribe?t= — baja de marketing (público, por token — mina M3)
// ═══════════════════════════════════════════════════════════════════════════

describe("baja de marketing — GET /api/campaigns/unsubscribe", () => {
  const RUTA = "GET /api/campaigns/unsubscribe";

  it("mina M3 (cierre 175-02): un token del send del gimnasio 2 escribe la baja con tenant_id=TENANT_DOS y el email/campaignId del send propio, leído de la base", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/unsubscribe?t=${encodeURIComponent(dos.sendToken)}`,
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    const fila = await unsubscribePorEmail(app, dos.sendEmail);
    expect(
      fila,
      "la ruta publica deberia haber escrito una nueva fila de baja para el email del send del gimnasio 2",
    ).not.toBeNull();
    expect(
      fila?.tenantId,
      porQueImportaElAislamiento(
        RUTA,
        `la baja del email del gimnasio ${TENANT_DOS} (token de un send propio, SIN tenantId en el payload) quedó ` +
          `con tenant_id=${fila?.tenantId} — si esto fuera TENANT_TEMPLO (1), la mina M3 estaría abierta de nuevo: ` +
          `un opt-out del gimnasio 2 suprimiría envíos de El Templo para el mismo email`,
      ),
    ).toBe(TENANT_DOS);
  });

  it("control: un token del send de El Templo escribe la baja con tenant_id=TENANT_TEMPLO", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/unsubscribe?t=${encodeURIComponent(templo.sendToken)}`,
    });
    expect(res.statusCode, res.body).toBe(200);
    const fila = await unsubscribePorEmail(app, templo.sendEmail);
    expect(fila?.tenantId).toBe(TENANT_TEMPLO);
  });

  it("un token inválido/ajeno degrada en silencio: 200 + página genérica, sin escribir ninguna fila nueva ni afectar a El Templo", async () => {
    const antes = await contarFilas(app, "campaign_unsubscribes");
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/unsubscribe?t=token-invalido-no-resuelve-nada`,
    });
    expect(res.statusCode, res.body).toBe(200);
    const despues = await contarFilas(app, "campaign_unsubscribes");
    expect(
      despues,
      "un token invalido NUNCA debe insertar una fila de baja — degrada en silencio (D-21)",
    ).toBe(antes);
  });
});
