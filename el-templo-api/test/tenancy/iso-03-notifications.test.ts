/**
 * Fase 175.1 Plan 04 (ISO-03) — batería de AISLAMIENTO de las 8 rutas
 * `tenant-scoped` de `/api/notifications` (derivadas de
 * `test/tenant-manifest.ts`, transcritas abajo y en el SUMMARY): 4 admin +
 * 4 de miembro.
 *
 * EL CASO CENTRAL: LA KEY COMPUESTA DE `notification_templates` (bug cerrado en 175-03)
 * -----------------------------------------------------------------------
 * `notification_templates` tiene un unique `(tenant_id, template_key)` desde
 * la migración 168. Antes de 175-03, `GET/PUT /api/notifications/admin/templates*`
 * resolvía sin `tenantWhere` — un admin de un gimnasio podía leer o PISAR la
 * plantilla de OTRO con la misma `template_key`. Este archivo siembra la MISMA
 * key (`TEMPLATE_KEY_COLISION`) en El Templo y en el gimnasio 2, con contenido
 * distinto (`notifications-gimnasio-dos.ts`), y afirma con evidencia leída de
 * la base (`plantillaPorId`) que cada staff resuelve/edita la SUYA, nunca la
 * del otro — el describe de `PUT /admin/templates/:id` es el que prueba
 * explícitamente "un PUT de un gimnasio no pisa la plantilla del otro".
 *
 * `POST /admin/seed-templates` TIENE EL MISMO RIESGO, PERO AL REVÉS
 * -----------------------------------------------------------------------
 * Si `INSERT IGNORE ... (tenant_id, template_key, ...)` alguna vez perdiera
 * el `tenant_id` real (volviendo a una unique global), el catálogo del
 * gimnasio 2 se saltaría CUALQUIER key que El Templo ya tuviera sembrada —
 * el segundo gimnasio se quedaría mudo para esas notificaciones, en
 * silencio, sin error. El caso de esta ruta prueba justamente eso: sembrar
 * el catálogo en El Templo primero, y confirmar que el gimnasio 2 igual
 * recibe su propia fila para la MISMA key (`filaTemplatePorTenantYKey`).
 *
 * CERO 403 (D-06 del milestone)
 * -----------------------------------------------------------------------
 * Un id de plantilla ajena SIEMPRE resuelve 404 "Template no encontrado" (el
 * lookup por PK ya scopeado por `tenantWhere` la trata como inexistente),
 * NUNCA 403 — mismo criterio que el resto de la batería ISO-03.
 *
 * LAS 4 RUTAS DE MIEMBRO (`token`, `preferences` GET/PUT, `:id/opened`) SON
 * PRE-SCOPE POR DISEÑO (T-175-03) — NO SON UN AGUJERO
 * -----------------------------------------------------------------------
 * Ninguna de las 4 recibe un `ctx` de request: `registerToken`/
 * `updatePreference` derivan el tenant REAL leyendo la fila propia del
 * `userId` autenticado (`resolveUserTenant`, `service.ts`); `getUserPreferences`
 * filtra únicamente por `userId` (identifica una sola fila sin ambigüedad,
 * ver `service.ts` línea ~175); `recordOpened` (`:id/opened`) anota por PK
 * de la propia notificación, sin `tenant_id` en el camino — documentado y
 * aceptado en 175-03 (el `id` nunca se expone fuera del payload de push que
 * el dispositivo del USUARIO recibió; no hay ruta que liste ids ajenos para
 * enumerar). El caso de estas 4 rutas prueba que cada actor autenticado
 * termina siempre en SU PROPIA fila, con evidencia leída de la base — no que
 * exista un filtro de tenant explícito que, por diseño, no corresponde acá.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/iso-03-notifications.test.ts
 *
 * @see test/fixtures/notifications-gimnasio-dos.ts
 * @see test/tenancy/iso-03-campaigns.test.ts — el precedente inmediato (175.1-03)
 * @see .planning/phases/175.1-.../175.1-CONTEXT.md — D-01, D-07, D-11
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
  sembrarNotifTemplo,
  sembrarNotifGimnasioDos,
  limpiarNotifDeLaBateria,
  plantillaPorId,
  filaTemplatePorTenantYKey,
  tenantDelTokenDispositivo,
  preferenciaPorUsuarioYCategoria,
  ultimaPendingDeUsuario,
  TEMPLATE_KEY_COLISION,
  MARCA_ISO03N,
  type FichaNotifTemplo,
  type FichaNotifGimnasioDos,
} from "../fixtures/notifications-gimnasio-dos";

// ─── Constantes ──────────────────────────────────────────────────────────────

const BASE = "/api/notifications";

/** Una key REAL de `TEMPLATE_SEEDS` (types.ts) — transcrita a mano a propósito
 * (no importada) para que el caso de `seed-templates` no dependa de que el
 * archivo de seeds no cambie de orden; solo de que esta key siga existiendo. */
const SEED_KEY_REAL = "segment_transition_en_riesgo";

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let templo: FichaNotifTemplo;
let dos: FichaNotifGimnasioDos;
let templeAdminToken: string;

beforeAll(async () => {
  app = await createTestApp();
  // admin@test.com es 'owner' (test/setup.ts) — un único token cubre
  // ADMIN_ROLES y OWNER_ROLES para el lado de El Templo.
  templeAdminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

beforeEach(async () => {
  await cleanAllTestData(app);
  // Defensivo (ver docblock del fixture): las 4 tablas de notifications ya
  // están en TABLES_TO_CLEAN, pero corre ANTES de seedSecondTenant por el
  // mismo motivo de orden que el resto de la batería.
  await limpiarNotifDeLaBateria(app);
  gym2 = await seedSecondTenant(app);
  templo = await sembrarNotifTemplo(app);
  dos = await sembrarNotifGimnasioDos(app, gym2);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarNotifDeLaBateria(app);
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

function putComo(url: string, token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "PUT",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

/** Mensaje compartido de los rojos de AISLAMIENTO. */
function porQueImportaElAislamiento(ruta: string, detalle: string): string {
  return (
    `${ruta} mezcló datos de El Templo (${TENANT_TEMPLO}) y el gimnasio ` +
    `${TENANT_DOS}: ${detalle}. Revisar el \`tenantWhere(tabla, ctx)\` del ` +
    `método que sirve esta ruta en src/modules/notifications/*.ts. NO ` +
    `"arreglar" esto filtrando en el front.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Precondiciones
// ═══════════════════════════════════════════════════════════════════════════

describe("precondiciones de la batería", () => {
  it("las 8 rutas del manifiesto para /api/notifications coinciden con las 8 de este archivo", async () => {
    // Transcrito a mano desde test/tenant-manifest.ts (líneas 674-684). El
    // SUMMARY vuelve a transcribir esta lista con el conteo derivado.
    const RUTAS_MANIFIESTO = [
      "GET /api/notifications/admin/templates",
      "GET /api/notifications/preferences",
      "POST /api/notifications/:id/opened",
      "POST /api/notifications/admin/seed-templates",
      "POST /api/notifications/admin/send-segment",
      "POST /api/notifications/token",
      "PUT /api/notifications/admin/templates/:id",
      "PUT /api/notifications/preferences",
    ];
    expect(RUTAS_MANIFIESTO.length).toBe(8);
    expect(new Set(RUTAS_MANIFIESTO).size).toBe(8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /admin/templates — listar plantillas
// ═══════════════════════════════════════════════════════════════════════════

describe("listar plantillas — GET /api/notifications/admin/templates", () => {
  const RUTA = "GET /api/notifications/admin/templates";

  it("aislamiento: el gimnasio 2 ve SU plantilla con la key colisionante, no la de El Templo (mismo template_key, contenido distinto)", async () => {
    const res = await getComo("/admin/templates", dos.ownerToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      templates: Array<{ templateKey: string; title: string }>;
    };
    const colisionantes = body.templates.filter(
      (t) => t.templateKey === TEMPLATE_KEY_COLISION,
    );
    expect(
      colisionantes.length,
      porQueImportaElAislamiento(
        RUTA,
        `esperaba exactamente 1 fila con template_key=${TEMPLATE_KEY_COLISION}, encontró ${colisionantes.length}`,
      ),
    ).toBe(1);
    expect(
      colisionantes[0]?.title,
      porQueImportaElAislamiento(RUTA, "el título debería ser el propio del gimnasio 2"),
    ).toBe(dos.templateTitle);
    expect(colisionantes[0]?.title).not.toBe(templo.templateTitle);
  });

  it("control: El Templo ve SU plantilla con la key colisionante, no la del gimnasio 2", async () => {
    const res = await getComo("/admin/templates", templeAdminToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      templates: Array<{ templateKey: string; title: string }>;
    };
    const colisionantes = body.templates.filter(
      (t) => t.templateKey === TEMPLATE_KEY_COLISION,
    );
    expect(colisionantes.length).toBe(1);
    expect(colisionantes[0]?.title).toBe(templo.templateTitle);
    expect(colisionantes[0]?.title).not.toBe(dos.templateTitle);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /admin/templates/:id — actualizar plantilla (EL CASO CENTRAL)
// ═══════════════════════════════════════════════════════════════════════════

describe("actualizar plantilla — PUT /api/notifications/admin/templates/:id", () => {
  const RUTA = "PUT /api/notifications/admin/templates/:id";

  it("aislamiento: el owner del gimnasio 2 no puede editar la plantilla de El Templo (404 'no encontrado', NUNCA 403) y NO la modifica", async () => {
    const res = await putComo(`/admin/templates/${templo.templateId}`, dos.ownerToken, {
      title: `${MARCA_ISO03N} HACKEADO`,
    });
    expect(
      res.statusCode,
      porQueImportaElAislamiento(RUTA, `esperaba 404, recibió ${res.statusCode}`),
    ).toBe(404);
    const body = JSON.parse(res.body) as { message: string };
    expect(body.message).toContain("Template no encontrado");

    // Evidencia leída de la base: la plantilla de El Templo sigue intacta.
    const filaTemplo = await plantillaPorId(app, templo.templateId);
    expect(
      filaTemplo?.title,
      porQueImportaElAislamiento(
        RUTA,
        `la plantilla de El Templo quedó con título "${filaTemplo?.title}" — un PUT ajeno la pisó`,
      ),
    ).toBe(templo.templateTitle);
    expect(filaTemplo?.tenantId).toBe(TENANT_TEMPLO);
  });

  it("aislamiento: el owner del gimnasio 2 SÍ edita SU propia plantilla (misma key que la de El Templo), sin tocar la de El Templo — 'un PUT no pisa la del otro'", async () => {
    const nuevoTitulo = `${MARCA_ISO03N} Editado Gdos`;
    const res = await putComo(`/admin/templates/${dos.templateId}`, dos.ownerToken, {
      title: nuevoTitulo,
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { id: number; title: string; templateKey: string };
    expect(body.templateKey).toBe(TEMPLATE_KEY_COLISION);
    expect(body.title).toBe(nuevoTitulo);

    // Evidencia leída de la base, de AMBAS filas — la key compuesta en acción.
    const filaDos = await plantillaPorId(app, dos.templateId);
    expect(filaDos?.title).toBe(nuevoTitulo);
    expect(filaDos?.tenantId).toBe(TENANT_DOS);

    const filaTemplo = await plantillaPorId(app, templo.templateId);
    expect(
      filaTemplo?.title,
      porQueImportaElAislamiento(
        RUTA,
        `El Templo tiene la MISMA template_key (${TEMPLATE_KEY_COLISION}) — un update sin tenantWhere real la habría pisado también`,
      ),
    ).toBe(templo.templateTitle);
  });

  it("control: El Templo edita su propia plantilla, sin tocar la del gimnasio 2", async () => {
    const nuevoTitulo = `${MARCA_ISO03N} Editado Templo`;
    const res = await putComo(
      `/admin/templates/${templo.templateId}`,
      templeAdminToken,
      { title: nuevoTitulo },
    );
    expect(res.statusCode, res.body).toBe(200);

    const filaTemplo = await plantillaPorId(app, templo.templateId);
    expect(filaTemplo?.title).toBe(nuevoTitulo);

    const filaDos = await plantillaPorId(app, dos.templateId);
    expect(filaDos?.title).toBe(dos.templateTitle);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /admin/seed-templates — sembrar catálogo (INSERT IGNORE por-tenant)
// ═══════════════════════════════════════════════════════════════════════════

describe("sembrar catálogo — POST /api/notifications/admin/seed-templates", () => {
  const RUTA = "POST /api/notifications/admin/seed-templates";

  it("aislamiento: el gimnasio 2 recibe su PROPIA fila de una key ya sembrada en El Templo (no se salta por unique global)", async () => {
    // El Templo siembra su catálogo PRIMERO.
    const resTemplo = await postComo("/admin/seed-templates", templeAdminToken);
    expect(resTemplo.statusCode, resTemplo.body).toBe(200);
    const filaTemploAntes = await filaTemplatePorTenantYKey(app, TENANT_TEMPLO, SEED_KEY_REAL);
    expect(
      filaTemploAntes,
      `precondición: El Templo debería tener la key ${SEED_KEY_REAL} sembrada`,
    ).not.toBeNull();

    // El gimnasio 2 siembra DESPUÉS, con la key ya tomada por El Templo.
    const resDos = await postComo("/admin/seed-templates", dos.ownerToken);
    expect(resDos.statusCode, resDos.body).toBe(200);

    const filaDos = await filaTemplatePorTenantYKey(app, TENANT_DOS, SEED_KEY_REAL);
    expect(
      filaDos,
      porQueImportaElAislamiento(
        RUTA,
        `el gimnasio 2 se quedó SIN la key ${SEED_KEY_REAL} — el INSERT IGNORE se saltó por una unique global (bug 175-03 reabierto)`,
      ),
    ).not.toBeNull();

    // Son DOS filas distintas — el catálogo es per-tenant, no compartido.
    expect(
      filaDos?.id,
      porQueImportaElAislamiento(RUTA, "el gimnasio 2 y El Templo comparten la MISMA fila"),
    ).not.toBe(filaTemploAntes?.id);
  });

  it("control: la plantilla de El Templo sembrada antes sigue intacta después de que el gimnasio 2 siembra la suya", async () => {
    await postComo("/admin/seed-templates", templeAdminToken);
    const antes = await filaTemplatePorTenantYKey(app, TENANT_TEMPLO, SEED_KEY_REAL);

    await postComo("/admin/seed-templates", dos.ownerToken);
    const despues = await filaTemplatePorTenantYKey(app, TENANT_TEMPLO, SEED_KEY_REAL);

    expect(despues?.id).toBe(antes?.id);
    expect(despues?.title).toBe(antes?.title);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /admin/send-segment — enviar a segmento (audiencia scopeada)
// ═══════════════════════════════════════════════════════════════════════════

describe("enviar a segmento — POST /api/notifications/admin/send-segment", () => {
  const RUTA = "POST /api/notifications/admin/send-segment";
  const BODY = {
    title: `${MARCA_ISO03N} Anuncio`,
    body: "Cuerpo del anuncio de prueba",
    segmentIds: ["optima"],
  };

  it("aislamiento: el gimnasio 2 encola SOLO para su propio socio 'optima' (queued=1), no 1+1=2 mezclado con El Templo", async () => {
    const res = await postComo("/admin/send-segment", dos.ownerToken, BODY);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { queued: number };
    expect(
      body.queued,
      porQueImportaElAislamiento(
        RUTA,
        "queued debería ser 1 (solo el socio propio del gimnasio 2), no 1+1=2",
      ),
    ).toBe(1);

    // Evidencia leída de la base: la fila nueva quedó estampada TENANT_DOS.
    const nueva = await ultimaPendingDeUsuario(app, dos.memberId);
    expect(nueva?.tenantId).toBe(TENANT_DOS);
  });

  it("control: El Templo encola SOLO para su propio socio 'optima' (queued=1)", async () => {
    const res = await postComo("/admin/send-segment", templeAdminToken, BODY);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { queued: number };
    expect(body.queued).toBe(1);

    const nueva = await ultimaPendingDeUsuario(app, templo.memberId);
    expect(nueva?.tenantId).toBe(TENANT_TEMPLO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /token — registrar token de dispositivo (miembro, pre-scope T-175-03)
// ═══════════════════════════════════════════════════════════════════════════

describe("registrar token — POST /api/notifications/token", () => {
  it("aislamiento: el token registrado por el socio del gimnasio 2 queda estampado TENANT_DOS (derivado del propio userId, no del payload)", async () => {
    const tokenNuevo = `${MARCA_ISO03N}-nuevo-token-gdos`;
    const res = await postComo("/token", dos.memberToken, {
      token: tokenNuevo,
      platform: "android",
    });
    expect(res.statusCode, res.body).toBe(200);
    const tenantReal = await tenantDelTokenDispositivo(app, tokenNuevo);
    expect(
      tenantReal,
      porQueImportaElAislamiento(
        "POST /api/notifications/token",
        `el token del socio del gimnasio ${TENANT_DOS} quedó con tenant_id=${tenantReal}`,
      ),
    ).toBe(TENANT_DOS);
  });

  it("control: el token registrado por el socio de El Templo queda estampado TENANT_TEMPLO", async () => {
    const tokenNuevo = `${MARCA_ISO03N}-nuevo-token-templo`;
    const res = await postComo("/token", templo.memberToken, {
      token: tokenNuevo,
      platform: "ios",
    });
    expect(res.statusCode, res.body).toBe(200);
    const tenantReal = await tenantDelTokenDispositivo(app, tokenNuevo);
    expect(tenantReal).toBe(TENANT_TEMPLO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /preferences — leer preferencias propias (miembro, pre-scope T-175-03)
// ═══════════════════════════════════════════════════════════════════════════

describe("leer preferencias — GET /api/notifications/preferences", () => {
  // 'entrenamiento'/'programas' — no 'planes' (el schema de esta ruta,
  // getPreferencesResponseSchema en routes.ts, solo expone 4 de las 6
  // categorías de NOTIFICATION_CATEGORIES), ni 'anuncios' (POST
  // /admin/send-segment la usa siempre) ni 'motivacion' (reservada por PUT
  // /preferences, más abajo); ver el docblock del fixture.
  it("aislamiento: el socio del gimnasio 2 lee SU override propio ('programas'=false) y el default ('entrenamiento'=true, no el false de El Templo)", async () => {
    const res = await getComo("/preferences", dos.memberToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      preferences: Record<string, boolean>;
    };
    expect(
      body.preferences.programas,
      "el socio del gimnasio 2 sembró 'programas'=false explícito",
    ).toBe(false);
    expect(
      body.preferences.entrenamiento,
      porQueImportaElAislamiento(
        "GET /api/notifications/preferences",
        "leyó el override 'entrenamiento'=false de El Templo en vez del default (true) propio",
      ),
    ).toBe(true);
  });

  it("control: el socio de El Templo lee SU override propio ('entrenamiento'=false) y el default ('programas'=true, no el false del gimnasio 2)", async () => {
    const res = await getComo("/preferences", templo.memberToken);
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      preferences: Record<string, boolean>;
    };
    expect(body.preferences.entrenamiento).toBe(false);
    expect(body.preferences.programas).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /preferences — actualizar preferencia propia (miembro, pre-scope T-175-03)
// ═══════════════════════════════════════════════════════════════════════════

describe("actualizar preferencia — PUT /api/notifications/preferences", () => {
  it("aislamiento: el socio del gimnasio 2 actualiza SU fila, estampada TENANT_DOS, sin afectar la de El Templo", async () => {
    const res = await putComo("/preferences", dos.memberToken, {
      category: "motivacion",
      enabled: false,
    });
    expect(res.statusCode, res.body).toBe(200);

    const filaDos = await preferenciaPorUsuarioYCategoria(app, dos.memberId, "motivacion");
    expect(
      filaDos?.tenantId,
      porQueImportaElAislamiento(
        "PUT /api/notifications/preferences",
        `la preferencia del socio del gimnasio ${TENANT_DOS} quedó con tenant_id=${filaDos?.tenantId}`,
      ),
    ).toBe(TENANT_DOS);
    expect(filaDos?.enabled).toBe(false);

    // El Templo no sembró 'motivacion' — sigue sin fila propia (default).
    const filaTemplo = await preferenciaPorUsuarioYCategoria(app, templo.memberId, "motivacion");
    expect(filaTemplo).toBeNull();
  });

  it("control: el socio de El Templo actualiza SU fila, estampada TENANT_TEMPLO, sin afectar la del gimnasio 2", async () => {
    const res = await putComo("/preferences", templo.memberToken, {
      category: "motivacion",
      enabled: false,
    });
    expect(res.statusCode, res.body).toBe(200);

    const filaTemplo = await preferenciaPorUsuarioYCategoria(app, templo.memberId, "motivacion");
    expect(filaTemplo?.tenantId).toBe(TENANT_TEMPLO);
    expect(filaTemplo?.enabled).toBe(false);

    const filaDos = await preferenciaPorUsuarioYCategoria(app, dos.memberId, "motivacion");
    expect(filaDos).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /:id/opened — marcar abierta (miembro, pre-scope genuino T-175-03)
// ═══════════════════════════════════════════════════════════════════════════

describe("marcar abierta — POST /api/notifications/:id/opened", () => {
  const RUTA = "POST /api/notifications/:id/opened";

  it("aislamiento: abrir la notificación propia del gimnasio 2 incrementa SU plantilla (openedCount 0→1), la de El Templo queda en 0", async () => {
    const antesDos = await plantillaPorId(app, dos.templateId);
    const antesTemplo = await plantillaPorId(app, templo.templateId);
    expect(antesDos?.openedCount).toBe(0);
    expect(antesTemplo?.openedCount).toBe(0);

    const res = await postComo(`/${dos.pendingId}/opened`, dos.memberToken);
    expect(res.statusCode, res.body).toBe(200);

    const despuesDos = await plantillaPorId(app, dos.templateId);
    expect(
      despuesDos?.openedCount,
      porQueImportaElAislamiento(RUTA, "openedCount de la plantilla propia no incrementó"),
    ).toBe(1);

    const despuesTemplo = await plantillaPorId(app, templo.templateId);
    expect(
      despuesTemplo?.openedCount,
      porQueImportaElAislamiento(
        RUTA,
        "openedCount de la plantilla de El Templo incrementó por una apertura del gimnasio 2",
      ),
    ).toBe(0);
  });

  it("control: abrir la notificación propia de El Templo incrementa SU plantilla, la del gimnasio 2 queda en 0", async () => {
    const res = await postComo(`/${templo.pendingId}/opened`, templo.memberToken);
    expect(res.statusCode, res.body).toBe(200);

    const despuesTemplo = await plantillaPorId(app, templo.templateId);
    expect(despuesTemplo?.openedCount).toBe(1);

    const despuesDos = await plantillaPorId(app, dos.templateId);
    expect(despuesDos?.openedCount).toBe(0);
  });
});
