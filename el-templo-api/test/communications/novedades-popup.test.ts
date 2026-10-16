/**
 * Fase 199 plan 07 (D-13) — los avisos pop-up activos aparecen primero en el
 * feed `GET /api/communications/me/novedades` (una sola fuente: sin filas en
 * `novedades`), y el modal `GET /me/prompt` queda como hoy.
 *
 * Cobertura:
 *   (a) aviso pop-up activo global -> primer ítem `source:"aviso"`, `key`,
 *       `text = title`, mismo destino que el pop-up.
 *   (b) con 3 novedades + 1 aviso -> largo 3 (máximo D-4) y el aviso primero.
 *   (c) alcance por sede: aviso de otra sede no aparece; el de la sede propia sí
 *       y trae `branchLabel`.
 *   (d) aviso pausado / borrador no aparece.
 *   (e) vigencia en la zona de la sede (AR): `endsOn` ayer no aparece, `endsOn`
 *       hoy sí; `startsOn` mañana no aparece.
 *   (f) código orquestado (`ORCHESTRATED_POPUP_CODES`) no aparece.
 *   (g) frecuencia "una vez" con `shown` registrado: el pop-up ya no sale pero
 *       el feed SIGUE trayéndolo, con `seen:false`.
 *   (h) `clicked` -> `seen:true`; el evento va a `aviso_events` y nunca a
 *       `novedad_views`. `shown` no apaga el NUEVO.
 *   (i) aislamiento cross-tenant.
 *   (j) `GET /me/prompt` sigue devolviendo el aviso como hoy.
 *
 * LIMPIEZA: `avisos`/`aviso_events` no están en `TABLES_TO_CLEAN` (catálogo de
 * sistema estable): este archivo borra solo lo que crea (custom + eventos).
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/communications/novedades-popup.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { createTestApp, cleanAllTestData, createTestMember } from "../helpers";
import {
  avisos,
  avisoEvents,
  branches,
  novedades,
  novedadViews,
} from "../../src/db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { ORCHESTRATED_POPUP_CODES } from "../../src/modules/communications/prompt-service";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const BASE = "/api/communications";
const CTX_TEMPLO: TenantContext = { tenantId: TENANT_TEMPLO };
const AR_TZ = "America/Argentina/Buenos_Aires";
const HOUR_MS = 60 * 60 * 1000;

// ─── Tipos de respuesta ──────────────────────────────────────────────────────

interface FeedItem {
  source: "novedad" | "aviso";
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

interface PromptBody {
  prompt: {
    kind: string;
    aviso: {
      id: number;
      destination: { route: string };
    };
  } | null;
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

let app: FastifyInstance;
let branchA: number;
let branchAName: string;
let branchB: number;
let branchBName: string;

const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR_MS);

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function feedOf(token: string): Promise<FeedItem[]> {
  const res = await app.inject({
    method: "GET",
    url: `${BASE}/me/novedades`,
    headers: auth(token),
  });
  expect(res.statusCode, res.body).toBe(200);
  return (JSON.parse(res.body) as { novedades: FeedItem[] }).novedades;
}

async function promptOf(token: string): Promise<PromptBody["prompt"]> {
  const res = await app.inject({
    method: "GET",
    url: `${BASE}/me/prompt`,
    headers: auth(token),
  });
  expect(res.statusCode, res.body).toBe(200);
  return (JSON.parse(res.body) as PromptBody).prompt;
}

async function postAvisoEvent(
  token: string,
  avisoId: number,
  type: "shown" | "dismissed" | "clicked",
): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: `${BASE}/me/avisos/${avisoId}/event`,
    headers: auth(token),
    payload: { type },
  });
  expect(res.statusCode, res.body).toBe(200);
}

/** Inserta un aviso pop-up custom activo (global, "una vez" salvo override). */
async function insertAviso(
  over: Partial<typeof avisos.$inferInsert> = {},
  ctx: TenantContext = CTX_TEMPLO,
): Promise<number> {
  const [result] = await app.db.insert(avisos).values(
    tenantValues(ctx, {
      kind: "custom" as const,
      code: null,
      placement: "popup" as const,
      title: "Aviso de prueba 199-07",
      body: "Cuerpo del aviso de prueba",
      buttonText: "Ver",
      destinationType: "app_section" as const,
      destinationSection: "mi_templo",
      whatsappText: null,
      frequencyType: "every_open" as const,
      frequencyDays: null,
      status: "active" as const,
      sortOrder: 0,
      ...over,
    }),
  );
  return Number(result.insertId);
}

async function insertNovedad(
  text: string,
  publishAt: Date,
  ctx: TenantContext = CTX_TEMPLO,
): Promise<number> {
  const [result] = await app.db.insert(novedades).values(
    tenantValues(ctx, {
      text,
      publishAt,
      status: "active" as const,
    }),
  );
  return Number(result.insertId);
}

async function socioEn(
  branchId: number,
): Promise<{ id: number; token: string }> {
  const member = await createTestMember(app, { branchId });
  return { id: member.id, token: member.token };
}

async function limpiarAvisosDeLaBateria(): Promise<void> {
  await app.db.execute(
    sql`/* tenant-safe: limpieza global de prueba (patron cleanAllTestData) — aviso_events no es TABLES_TO_CLEAN a proposito (193-03, L5) */ DELETE FROM aviso_events`,
  );
  await app.db.execute(
    sql`/* tenant-safe: limpieza global de prueba — solo custom, los avisos de sistema (migracion 0217) son dato semilla estable (193-03, L5) */ DELETE FROM avisos WHERE kind <> 'system'`,
  );
}

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

beforeAll(async () => {
  app = await createTestApp();

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
  branchBName = `Sede B popup ${suffix}`;
  const [branchBRow] = await app.db
    .insert(branches)
    .values(
      tenantValues(CTX_TEMPLO, {
        name: branchBName,
        code: `NP${suffix}`.slice(0, 20),
        country: "AR" as const,
        isActive: true,
        timezone: AR_TZ,
        isVirtual: false,
      }),
    )
    .$returningId();
  branchB = branchBRow.id;
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarAvisosDeLaBateria();
  await limpiarSegundoGimnasio(app);
  await app.db
    .delete(branches)
    .where(and(tenantWhere(branches, CTX_TEMPLO), eq(branches.id, branchB)));
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await limpiarAvisosDeLaBateria();
});

// ═══════════════════════════════════════════════════════════════════════════
// (a) / (j) El aviso aparece primero y el modal sigue igual
// ═══════════════════════════════════════════════════════════════════════════

describe("D-13 — aviso pop-up como primera novedad", () => {
  it("(a) un aviso pop-up activo global es el primer ítem del feed, con su destino", async () => {
    const socio = await socioEn(branchA);
    const avisoId = await insertAviso({ title: "Promo de octubre" });

    const feed = await feedOf(socio.token);

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      source: "aviso",
      key: `aviso:${avisoId}`,
      id: avisoId,
      text: "Promo de octubre",
      branchLabel: null,
      seen: false,
    });
    expect(feed[0].destination).toMatchObject({
      type: "app_section",
      section: "mi_templo",
    });
    expect(typeof feed[0].publishedAt).toBe("string");
    expect(Number.isNaN(Date.parse(feed[0].publishedAt))).toBe(false);

    // Mismo destino que el modal.
    const prompt = await promptOf(socio.token);
    expect(prompt?.aviso.id).toBe(avisoId);
    expect(feed[0].destination?.route).toBe(prompt?.aviso.destination.route);
  });

  it("(a2) un aviso whatsapp_sales trae el texto por defecto resuelto", async () => {
    const socio = await socioEn(branchA);
    await insertAviso({
      destinationType: "whatsapp_sales",
      destinationSection: null,
      whatsappText: null,
    });

    const feed = await feedOf(socio.token);

    expect(feed[0].destination?.type).toBe("whatsapp_sales");
    expect(feed[0].destination?.whatsappText).toBeTruthy();
  });

  it("(a3) las novedades normales llevan source 'novedad' y key 'novedad:<id>'", async () => {
    const socio = await socioEn(branchA);
    const id = await insertNovedad("Solo novedad", hoursAgo(1));

    const feed = await feedOf(socio.token);

    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      source: "novedad",
      key: `novedad:${id}`,
      id,
    });
  });

  it("(a4) un aviso y una novedad no se pisan: cada uno trae su key", async () => {
    const socio = await socioEn(branchA);
    await insertAviso();
    await insertNovedad("Una novedad", hoursAgo(1));

    const feed = await feedOf(socio.token);

    expect(feed).toHaveLength(2);
    expect(new Set(feed.map((i) => i.key)).size).toBe(2);
    expect(feed.map((i) => i.source)).toEqual(["aviso", "novedad"]);
  });

  it("(b) con 3 novedades + 1 aviso el feed tiene 3 y el aviso va primero", async () => {
    const socio = await socioEn(branchA);
    const n1 = await insertNovedad("Más vieja", hoursAgo(3));
    const n2 = await insertNovedad("Media", hoursAgo(2));
    const n3 = await insertNovedad("Más nueva", hoursAgo(1));
    const avisoId = await insertAviso();

    const feed = await feedOf(socio.token);

    expect(feed).toHaveLength(3);
    expect(feed[0].key).toBe(`aviso:${avisoId}`);
    // Se desplaza la más vieja: quedan las dos más nuevas, en el orden de hoy.
    expect(feed.slice(1).map((i) => i.id)).toEqual([n3, n2]);
    expect(feed.map((i) => i.id)).not.toContain(n1);
  });

  it("(b2) varios avisos van por sortOrder, id y respetan el máximo de 3", async () => {
    const socio = await socioEn(branchA);
    const segundo = await insertAviso({ title: "Segundo", sortOrder: 2 });
    const primero = await insertAviso({ title: "Primero", sortOrder: 1 });
    const tercero = await insertAviso({ title: "Tercero", sortOrder: 3 });
    await insertAviso({ title: "Cuarto", sortOrder: 4 });
    await insertNovedad("No entra", hoursAgo(1));

    const feed = await feedOf(socio.token);

    expect(feed.map((i) => i.id)).toEqual([primero, segundo, tercero]);
    expect(feed.every((i) => i.source === "aviso")).toBe(true);
  });

  it("(j) GET /me/prompt sigue devolviendo el aviso como hoy (el modal no cambia)", async () => {
    const socio = await socioEn(branchA);
    const avisoId = await insertAviso({ title: "Para el modal" });

    const prompt = await promptOf(socio.token);

    expect(prompt?.kind).toBe("aviso");
    expect(prompt?.aviso.id).toBe(avisoId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (c) / (d) / (e) / (f) Filtros: mismos que el pop-up, sin frecuencia
// ═══════════════════════════════════════════════════════════════════════════

describe("D-13 — filtros del espejo (los del pop-up, sin frecuencia)", () => {
  it("(c) un aviso de otra sede no aparece; el de la sede propia sí, con branchLabel", async () => {
    const socioA = await socioEn(branchA);
    const deB = await insertAviso({ scopeBranchIds: [branchB] });
    const deA = await insertAviso({ scopeBranchIds: [branchA] });

    const feedA = await feedOf(socioA.token);
    expect(feedA.map((i) => i.key)).toEqual([`aviso:${deA}`]);
    expect(feedA[0].branchLabel).toBe(branchAName);

    const socioB = await socioEn(branchB);
    const feedB = await feedOf(socioB.token);
    expect(feedB.map((i) => i.key)).toEqual([`aviso:${deB}`]);
    expect(feedB[0].branchLabel).toBe(branchBName);
  });

  it("(c2) un aviso con alcance de país ajeno no aparece", async () => {
    const socio = await socioEn(branchA);
    await insertAviso({ scopeCountries: ["ES"] });

    expect(await feedOf(socio.token)).toEqual([]);
  });

  it("(d) un aviso pausado o en borrador no aparece", async () => {
    const socio = await socioEn(branchA);
    await insertAviso({ status: "paused" });
    await insertAviso({ status: "draft" });

    expect(await feedOf(socio.token)).toEqual([]);
  });

  it("(d2) una tarjeta (placement tarjeta) no aparece como novedad", async () => {
    const socio = await socioEn(branchA);
    await insertAviso({ placement: "tarjeta" });

    expect(await feedOf(socio.token)).toEqual([]);
  });

  it("(e) endsOn ayer (zona AR) no aparece; endsOn hoy (zona AR) sí", async () => {
    const socio = await socioEn(branchA);
    const hoyAr = todayInTz(AR_TZ);
    const ayerAr = addDays(hoyAr, -1);
    await insertAviso({ title: "Vencido", endsOn: ayerAr });
    const vigente = await insertAviso({ title: "Vence hoy", endsOn: hoyAr });

    const feed = await feedOf(socio.token);

    expect(feed.map((i) => i.key)).toEqual([`aviso:${vigente}`]);
  });

  it("(e2) startsOn mañana (zona AR) todavía no aparece; startsOn hoy sí", async () => {
    const socio = await socioEn(branchA);
    const hoyAr = todayInTz(AR_TZ);
    await insertAviso({ title: "Futuro", startsOn: addDays(hoyAr, 1) });
    const empiezaHoy = await insertAviso({
      title: "Empieza hoy",
      startsOn: hoyAr,
    });

    const feed = await feedOf(socio.token);

    expect(feed.map((i) => i.key)).toEqual([`aviso:${empiezaHoy}`]);
    // publishedAt del espejo = startsOn a medianoche UTC.
    expect(feed[0].publishedAt).toBe(`${hoyAr}T00:00:00.000Z`);
  });

  it("(f) un aviso de sistema orquestado no aparece como novedad", async () => {
    const socio = await socioEn(branchA);
    // Los 3 codes orquestados vienen sembrados (mig 0217) y activos: el feed
    // no debe reflejarlos ni siquiera con status activo.
    for (const code of ORCHESTRATED_POPUP_CODES) {
      await app.db
        .update(avisos)
        .set({ status: "active" })
        .where(and(tenantWhere(avisos, CTX_TEMPLO), eq(avisos.code, code)));
    }

    expect(await feedOf(socio.token)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (g) / (h) Frecuencia ignorada y eventos
// ═══════════════════════════════════════════════════════════════════════════

describe("D-13 — cerrar el pop-up no borra la novedad", () => {
  it("(g) con frecuencia 'una vez' y un shown ya registrado, el modal no sale pero el feed SIGUE trayéndolo (seen:false)", async () => {
    const socio = await socioEn(branchA);
    const avisoId = await insertAviso({ frequencyType: "once" });

    // Antes del shown, el modal lo devuelve.
    expect((await promptOf(socio.token))?.aviso.id).toBe(avisoId);

    await postAvisoEvent(socio.token, avisoId, "shown");
    await postAvisoEvent(socio.token, avisoId, "dismissed");

    // El modal ya no lo muestra (frecuencia "una vez"). Puede tocar otro
    // escalón (p. ej. propuesta de mejora), por eso se compara contra el id.
    expect((await promptOf(socio.token))?.aviso.id).not.toBe(avisoId);
    // ...pero la novedad sigue, y el NUEVO sigue prendido.
    const feed = await feedOf(socio.token);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ key: `aviso:${avisoId}`, seen: false });
  });

  it("(h) clicked apaga el NUEVO, queda en aviso_events y nunca en novedad_views", async () => {
    const socio = await socioEn(branchA);
    const avisoId = await insertAviso();

    await postAvisoEvent(socio.token, avisoId, "clicked");

    const feed = await feedOf(socio.token);
    expect(feed[0]).toMatchObject({ key: `aviso:${avisoId}`, seen: true });

    const events = await app.db
      .select({ eventType: avisoEvents.eventType })
      .from(avisoEvents)
      .where(
        and(
          tenantWhere(avisoEvents, CTX_TEMPLO),
          eq(avisoEvents.userId, socio.id),
          eq(avisoEvents.avisoId, avisoId),
        ),
      );
    expect(events.map((e) => e.eventType)).toEqual(["clicked"]);

    const views = await app.db
      .select({ id: novedadViews.id })
      .from(novedadViews)
      .where(
        and(
          tenantWhere(novedadViews, CTX_TEMPLO),
          eq(novedadViews.userId, socio.id),
        ),
      );
    expect(views).toHaveLength(0);
  });

  it("(h2) el clicked de un socio no apaga el NUEVO de otro socio", async () => {
    const socio = await socioEn(branchA);
    const otro = await socioEn(branchA);
    const avisoId = await insertAviso();

    await postAvisoEvent(socio.token, avisoId, "clicked");

    expect((await feedOf(otro.token))[0]).toMatchObject({
      key: `aviso:${avisoId}`,
      seen: false,
    });
  });

  it("(h3) el clicked del aviso espejo no marca como vista a una novedad del feed", async () => {
    const socio = await socioEn(branchA);
    const avisoId = await insertAviso();
    const novedadId = await insertNovedad("Novedad", hoursAgo(1));

    await postAvisoEvent(socio.token, avisoId, "clicked");

    const feed = await feedOf(socio.token);
    const aviso = feed.find((i) => i.key === `aviso:${avisoId}`);
    const novedad = feed.find((i) => i.key === `novedad:${novedadId}`);
    expect(aviso?.seen).toBe(true);
    expect(novedad?.seen).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (i) Aislamiento cross-tenant
// ═══════════════════════════════════════════════════════════════════════════

describe("D-13 — aislamiento entre gimnasios", () => {
  let gym2: SegundoGimnasio;
  let ctxDos: TenantContext;

  beforeEach(async () => {
    gym2 = await seedSecondTenant(app);
    ctxDos = { tenantId: gym2.tenantId };
  });

  it("(i) el socio del gimnasio 2 no ve el aviso de El Templo, y el socio de El Templo no ve el del gimnasio 2", async () => {
    const temploAviso = await insertAviso({ title: "De El Templo" });
    const gym2Aviso = await insertAviso({ title: "Del gimnasio 2" }, ctxDos);

    const feedDos = await feedOf(gym2.socios[0].token);
    expect(feedDos.map((i) => i.key)).toEqual([`aviso:${gym2Aviso}`]);
    expect(feedDos[0].text).toBe("Del gimnasio 2");

    const socioTemplo = await socioEn(branchA);
    const feedTemplo = await feedOf(socioTemplo.token);
    expect(feedTemplo.map((i) => i.key)).toEqual([`aviso:${temploAviso}`]);
  });

  it("(i2) el socio del gimnasio 2 no puede reportar un clicked sobre un aviso de El Templo (404)", async () => {
    const temploAviso = await insertAviso();

    const res = await app.inject({
      method: "POST",
      url: `${BASE}/me/avisos/${temploAviso}/event`,
      headers: auth(gym2.socios[0].token),
      payload: { type: "clicked" },
    });

    expect(res.statusCode, res.body).toBe(404);
  });
});
