/**
 * Push de Novedades (mig 0297) — el paso `queueDueNovedadPushes` del tick de
 * notificaciones (`src/modules/communications/novedades-push.ts`) contra MySQL
 * real.
 *
 * Cobertura:
 *   (1) Apagada por defecto: una novedad sin push no genera filas.
 *   (2) Audiencia: solo socios `activo`, `role = member`, sin borrar, de las
 *       sedes del alcance (NULL/[] = todas), con "Novedades" (`anuncios`) NO
 *       apagado y con device token; ni un socio de otro gimnasio. Conteos de
 *       omitidos y campos de la fila encolada.
 *   (3) Cuándo: programada futura no sale hasta su hora, pausada no sale (y al
 *       reactivarla sí), borrada nunca.
 *   (4) Idempotencia: segundo tick, ticks concurrentes, y editar después de
 *       encolar (400 al tocar los campos de push, nunca reenvía).
 *   (5) Título (propio / nombre del gimnasio) y destino (ninguno / app_section /
 *       whatsapp_sales).
 *   (6) Tandas de INSERT: más socios que `INSERT_CHUNK_SIZE`.
 *   (7) Segundo gimnasio: cada tenant encola lo suyo, con su nombre.
 *   (8) El tick completo (`runNotificationQueueTick`): encola Y despacha en el
 *       mismo pasaje (DRY_RUN: las filas terminan `sent`).
 *   (9) Helpers puros `resolvePushTitle` / `destinationForNovedadPush`.
 *
 * DRY_RUN=true evita envíos FCM reales (mismo criterio que
 * `notifications/send-test.test.ts`). Los device tokens son strings falsos.
 *
 * "Ahora" se pasa como parámetro a `queueDueNovedadPushes` (sin fake timers):
 * un instante futuro simula que pasó la hora de publicación.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/communications/novedades-push.test.ts
 */

process.env.DRY_RUN = "true";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  INSERT_CHUNK_SIZE,
  destinationForNovedadPush,
  queueDueNovedadPushes,
  resolvePushTitle,
} from "../../src/modules/communications/novedades-push";
import { runNotificationQueueTick } from "../../src/jobs/notification-cron";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_TEMPLO,
  TENANT_DOS,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";

const BASE = "/api/communications";
const CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };
const HOUR_MS = 60 * 60 * 1000;

const { novedades, users, pendingNotifications } = schema;

let app: FastifyInstance;
let adminToken: string;
let branchA: number;
let branchB: number;
let gym2: SegundoGimnasio;
let temploName: string;
let seq = 0;

const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR_MS);
const hoursAhead = (h: number) => new Date(Date.now() + h * HOUR_MS);

// ─── Fixtures ────────────────────────────────────────────────────────────────

type NuevoUsuario = typeof users.$inferInsert;

/** Socio por INSERT directo. Default: `member` activo, sin borrar, de El Templo. */
async function insertUser(
  branchId: number,
  over: Partial<NuevoUsuario> = {},
  ctx: TenantContext = CTX,
): Promise<number> {
  seq += 1;
  const [result] = await app.db.insert(users).values(
    tenantValues(ctx, {
      email: `nov-push-${seq}-${Date.now().toString(36)}@test.com`,
      passwordHash: "x",
      firstName: "Push",
      lastName: `Socio ${seq}`,
      role: "member" as const,
      status: "activo" as const,
      branchId,
      ...over,
    }),
  );
  return Number(result.insertId);
}

/** Socio activo CON device token (el que sí debe recibir la push). */
async function insertReachable(
  branchId: number,
  over: Partial<NuevoUsuario> = {},
  ctx: TenantContext = CTX,
): Promise<number> {
  const id = await insertUser(branchId, over, ctx);
  await giveToken(id, ctx);
  return id;
}

async function giveToken(
  userId: number,
  ctx: TenantContext = CTX,
): Promise<void> {
  seq += 1;
  await app.db.insert(schema.deviceTokens).values(
    tenantValues(ctx, {
      userId,
      token: `nov-push-tok-${userId}-${seq}-${Date.now().toString(36)}`,
      platform: "android" as const,
    }),
  );
}

async function setPreference(
  userId: number,
  category: "anuncios" | "motivacion",
  enabled: boolean,
  ctx: TenantContext = CTX,
): Promise<void> {
  await app.db
    .insert(schema.notificationPreferences)
    .values(tenantValues(ctx, { userId, category, enabled }));
}

/** Novedad por INSERT directo: activa, global, publicada hace 1 h, CON push pedida. */
async function insertNovedad(
  over: Partial<typeof novedades.$inferInsert> = {},
  ctx: TenantContext = CTX,
): Promise<number> {
  const [result] = await app.db.insert(novedades).values(
    tenantValues(ctx, {
      text: "Incorporamos clases de yoga",
      publishAt: hoursAgo(1),
      status: "active" as const,
      pushRequested: true,
      ...over,
    }),
  );
  return Number(result.insertId);
}

async function novedadRow(id: number, ctx: TenantContext = CTX) {
  const [row] = await app.db
    .select()
    .from(novedades)
    .where(and(tenantWhere(novedades, ctx), eq(novedades.id, id)))
    .limit(1);
  return row ?? null;
}

async function pendingRows(ctx: TenantContext = CTX) {
  return app.db
    .select()
    .from(pendingNotifications)
    .where(tenantWhere(pendingNotifications, ctx));
}

const userIdsOf = (rows: Array<{ userId: number }>) =>
  rows.map((r) => r.userId).sort((a, b) => a - b);

const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

function tick(ctx: TenantContext = CTX, now?: Date) {
  return queueDueNovedadPushes(app.db, ctx, app.log, now);
}

function putNovedad(id: number, payload: Record<string, unknown>) {
  return app.inject({
    method: "PUT",
    url: `${BASE}/admin/novedades/${id}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload,
  });
}

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  const [testBranch] = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(
      and(tenantWhere(schema.branches, CTX), eq(schema.branches.code, "TEST")),
    )
    .limit(1);
  if (!testBranch) throw new Error("Sede 'TEST' no encontrada");
  branchA = testBranch.id;

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const [branchBRow] = await app.db
    .insert(schema.branches)
    .values(
      tenantValues(CTX, {
        name: `Sede B push ${suffix}`,
        code: `NP${suffix}`.slice(0, 20),
        country: "AR" as const,
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      }),
    )
    .$returningId();
  branchB = branchBRow.id;

  const [tenant] = await app.db
    .select({ name: schema.tenants.name })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, TENANT_TEMPLO));
  if (!tenant) throw new Error("tenant 1 no encontrado");
  temploName = tenant.name;
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.db
    .delete(schema.branches)
    .where(
      and(tenantWhere(schema.branches, CTX), eq(schema.branches.id, branchB)),
    );
  await app.close();
});

beforeEach(async () => {
  // PRIMERO limpiar, DESPUÉS sembrar el gimnasio 2 (ver second-tenant.ts).
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
});

// ═══════════════════════════════════════════════════════════════════════════
// (1) Apagada por defecto
// ═══════════════════════════════════════════════════════════════════════════

describe("push de novedades — apagada por defecto", () => {
  it("una novedad sin push pedida no encola nada, aunque esté publicada", async () => {
    await insertReachable(branchA);
    const id = await insertNovedad({ pushRequested: false });

    const result = await tick();

    expect(result).toMatchObject({ novedades: 0, queued: 0, failed: 0 });
    expect(await pendingRows()).toHaveLength(0);
    expect((await novedadRow(id))?.pushQueuedAt).toBeNull();
  });

  it("crear por la API sin sendPush deja la push apagada y el tick no hace nada", async () => {
    await insertReachable(branchA);
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/admin/novedades`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { text: "Sin push" },
    });
    expect(res.statusCode, res.body).toBe(201);

    await tick();
    expect(await pendingRows()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (2) Audiencia
// ═══════════════════════════════════════════════════════════════════════════

describe("push de novedades — audiencia", () => {
  it("encola solo a socios activos del alcance, con 'Novedades' prendido y con token", async () => {
    const ok = await insertReachable(branchA);
    // Apagó solo otra categoría: sigue recibiendo "Novedades".
    const okOtraCategoria = await insertReachable(branchA);
    await setPreference(okOtraCategoria, "motivacion", false);
    // Prendido explícitamente: también recibe.
    const okExplicito = await insertReachable(branchA);
    await setPreference(okExplicito, "anuncios", true);

    const optOut = await insertReachable(branchA);
    await setPreference(optOut, "anuncios", false);
    const sinToken = await insertUser(branchA);
    const noActivo = await insertReachable(branchA, { status: "freemium" });
    const borrado = await insertReachable(branchA, { deletedAt: new Date() });
    const coach = await insertReachable(branchA, { role: "coach" });
    const otraSede = await insertReachable(branchB);
    const ajeno = await insertReachable(gym2.branchId, {}, CTX_DOS);

    const id = await insertNovedad({ scopeBranchIds: [branchA] });
    const result = await tick();

    // Conteos: omitidos por opt-out y por falta de token (el resto no es audiencia).
    expect(result).toEqual({
      novedades: 1,
      queued: 3,
      skippedOptOut: 1,
      skippedNoToken: 1,
      failed: 0,
    });

    const rows = await pendingRows();
    expect(userIdsOf(rows)).toEqual(sorted([ok, okOtraCategoria, okExplicito]));
    for (const excluded of [
      optOut,
      sinToken,
      noActivo,
      borrado,
      coach,
      otraSede,
      ajeno,
    ]) {
      expect(userIdsOf(rows)).not.toContain(excluded);
    }
    // Nada se escribió en el gimnasio 2.
    expect(await pendingRows(CTX_DOS)).toHaveLength(0);

    const [row] = rows;
    expect(row.tenantId).toBe(TENANT_TEMPLO);
    expect(row.status).toBe("pending");
    expect(row.templateId).toBeNull();
    expect(row.title).toBe(temploName);
    expect(row.body).toBe("Incorporamos clases de yoga");
    expect(row.scheduledAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    const claimed = await novedadRow(id);
    expect(claimed?.pushQueuedAt).not.toBeNull();
  });

  it("alcance NULL o [] = todas las sedes del gimnasio", async () => {
    const enA = await insertReachable(branchA);
    const enB = await insertReachable(branchB);
    const ajeno = await insertReachable(gym2.branchId, {}, CTX_DOS);

    await insertNovedad({ scopeBranchIds: null });
    await tick();
    expect(userIdsOf(await pendingRows())).toEqual(sorted([enA, enB]));

    // Mismo resultado con [] (nueva novedad, nuevo reclamo).
    await app.db
      .delete(pendingNotifications)
      .where(tenantWhere(pendingNotifications, CTX));
    await insertNovedad({ scopeBranchIds: [], text: "Otra con alcance vacío" });
    await tick();
    expect(userIdsOf(await pendingRows())).toEqual(sorted([enA, enB]));
    expect(userIdsOf(await pendingRows(CTX_DOS))).not.toContain(ajeno);
  });

  it("alcance de varias sedes", async () => {
    const enA = await insertReachable(branchA);
    const enB = await insertReachable(branchB);
    await insertNovedad({ scopeBranchIds: [branchA, branchB] });
    await tick();
    expect(userIdsOf(await pendingRows())).toEqual(sorted([enA, enB]));
  });

  it("un alcance sin audiencia reclama la novedad igual (no se reintenta en loop)", async () => {
    await insertUser(branchA); // activo pero sin token
    const id = await insertNovedad();

    const first = await tick();
    expect(first).toMatchObject({ novedades: 1, queued: 0, failed: 0 });
    expect(await pendingRows()).toHaveLength(0);
    expect((await novedadRow(id))?.pushQueuedAt).not.toBeNull();

    expect(await tick()).toMatchObject({ novedades: 0, queued: 0, failed: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (3) Cuándo sale
// ═══════════════════════════════════════════════════════════════════════════

describe("push de novedades — cuándo sale", () => {
  it("programada a futuro no sale hasta que pasa su hora", async () => {
    const socio = await insertReachable(branchA);
    const id = await insertNovedad({ publishAt: hoursAhead(3) });

    expect(await tick()).toMatchObject({ novedades: 0, queued: 0, failed: 0 });
    expect(await pendingRows()).toHaveLength(0);
    expect((await novedadRow(id))?.pushQueuedAt).toBeNull();

    // Un tick antes de la hora tampoco.
    await tick(CTX, hoursAhead(2));
    expect(await pendingRows()).toHaveLength(0);

    // Pasada la hora de publicación, sale.
    const result = await tick(CTX, hoursAhead(4));
    expect(result.novedades).toBe(1);
    expect(userIdsOf(await pendingRows())).toEqual([socio]);
  });

  it("pausada no sale; al reactivarla (ya publicada) sale en el próximo tick", async () => {
    const socio = await insertReachable(branchA);
    const id = await insertNovedad({ status: "paused" });

    expect(await tick()).toMatchObject({ novedades: 0, queued: 0, failed: 0 });
    expect(await pendingRows()).toHaveLength(0);

    const res = await putNovedad(id, { status: "active" });
    expect(res.statusCode, res.body).toBe(200);

    await tick();
    expect(userIdsOf(await pendingRows())).toEqual([socio]);
  });

  it("borrada antes de publicarse no sale nunca", async () => {
    await insertReachable(branchA);
    const id = await insertNovedad({ publishAt: hoursAhead(1) });

    const del = await app.inject({
      method: "DELETE",
      url: `${BASE}/admin/novedades/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(del.statusCode, del.body).toBe(200);

    await tick(CTX, hoursAhead(2));
    expect(await pendingRows()).toHaveLength(0);
  });

  it("pedir la push de una novedad ya publicada: sale en el próximo tick", async () => {
    const socio = await insertReachable(branchA);
    const id = await insertNovedad({ pushRequested: false });
    await tick();
    expect(await pendingRows()).toHaveLength(0);

    const res = await putNovedad(id, { sendPush: true, pushTitle: "Aviso" });
    expect(res.statusCode, res.body).toBe(200);

    await tick();
    const rows = await pendingRows();
    expect(userIdsOf(rows)).toEqual([socio]);
    expect(rows[0].title).toBe("Aviso");
  });

  it("apagar la push antes de que se encole la cancela", async () => {
    await insertReachable(branchA);
    const id = await insertNovedad({
      pushTitle: "Titulo",
      publishAt: hoursAhead(1),
    });

    const res = await putNovedad(id, { sendPush: false });
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as {
      pushRequested: boolean;
      pushTitle: string | null;
    };
    expect(body.pushRequested).toBe(false);
    expect(body.pushTitle).toBeNull();

    await tick(CTX, hoursAhead(2));
    expect(await pendingRows()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (4) Idempotencia
// ═══════════════════════════════════════════════════════════════════════════

describe("push de novedades — idempotencia", () => {
  it("un segundo tick no duplica", async () => {
    await insertReachable(branchA);
    await insertReachable(branchA);
    await insertNovedad();

    await tick();
    const after1 = await pendingRows();
    expect(after1).toHaveLength(2);

    expect(await tick()).toMatchObject({ novedades: 0, queued: 0, failed: 0 });
    expect(await pendingRows()).toHaveLength(2);
  });

  it("dos ticks concurrentes encolan una sola vez (el reclamo condicional)", async () => {
    const socios = [
      await insertReachable(branchA),
      await insertReachable(branchA),
      await insertReachable(branchB),
    ];
    await insertNovedad();

    const [a, b] = await Promise.all([tick(), tick()]);

    expect(a.novedades + b.novedades).toBe(1);
    expect(a.queued + b.queued).toBe(3);
    expect(userIdsOf(await pendingRows())).toEqual(sorted(socios));
  });

  it("después de encolada: cambiar los campos de push da 400 y editar el texto no reenvía", async () => {
    await insertReachable(branchA);
    const id = await insertNovedad({ pushTitle: "Original" });
    await tick();
    expect(await pendingRows()).toHaveLength(1);

    for (const payload of [
      { sendPush: false },
      { pushTitle: "Otro" },
      { pushTitle: null },
      { sendPush: true, pushTitle: "Otro" },
    ]) {
      const res = await putNovedad(id, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.body).toContain("ya se envió");
    }

    // Editar lo demás sigue permitido y NO reenvía.
    const edit = await putNovedad(id, {
      text: "Texto corregido",
      publishAt: new Date().toISOString(),
    });
    expect(edit.statusCode, edit.body).toBe(200);
    const body = JSON.parse(edit.body) as {
      pushRequested: boolean;
      pushTitle: string | null;
      pushQueuedAt: string | null;
    };
    expect(body.pushRequested).toBe(true);
    expect(body.pushTitle).toBe("Original");
    expect(body.pushQueuedAt).not.toBeNull();

    await tick(CTX, hoursAhead(1));
    const rows = await pendingRows();
    expect(rows).toHaveLength(1);
    // La fila ya encolada conserva el texto con el que salió.
    expect(rows[0].body).toBe("Incorporamos clases de yoga");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (5) Título y destino
// ═══════════════════════════════════════════════════════════════════════════

describe("push de novedades — título", () => {
  it("usa el título propio, sin espacios de más", async () => {
    await insertReachable(branchA);
    await insertNovedad({ pushTitle: "  Gran novedad  " });
    await tick();
    expect((await pendingRows())[0].title).toBe("Gran novedad");
  });

  it("sin título propio cae al nombre del gimnasio (tenants.name)", async () => {
    await insertReachable(branchA);
    await insertNovedad({ pushTitle: null });
    await tick();
    expect((await pendingRows())[0].title).toBe(temploName);
  });

  it("título guardado en blanco (dato viejo) también cae al nombre del gimnasio", async () => {
    await insertReachable(branchA);
    await insertNovedad({ pushTitle: "   " });
    await tick();
    expect((await pendingRows())[0].title).toBe(temploName);
  });
});

describe("push de novedades — destino", () => {
  it("sin destino: mi_templo", async () => {
    await insertReachable(branchA);
    await insertNovedad();
    await tick();
    const [row] = await pendingRows();
    expect(row.destinationType).toBe("app_section");
    expect(row.destinationSection).toBe("mi_templo");
    expect(row.whatsappText).toBeNull();
    expect(row.route).toBe("/mi-templo");
  });

  it("app_section: la sección y su ruta", async () => {
    await insertReachable(branchA);
    await insertNovedad({
      destinationType: "app_section",
      destinationSection: "reservas",
    });
    await tick();
    const [row] = await pendingRows();
    expect(row.destinationType).toBe("app_section");
    expect(row.destinationSection).toBe("reservas");
    expect(row.route).toBe("/reservas");
  });

  it("whatsapp_sales: tipo, texto y ruta de fallback para apps viejas", async () => {
    await insertReachable(branchA);
    await insertNovedad({
      destinationType: "whatsapp_sales",
      whatsappText: "Hola, quiero info",
    });
    await tick();
    const [row] = await pendingRows();
    expect(row.destinationType).toBe("whatsapp_sales");
    expect(row.destinationSection).toBeNull();
    expect(row.whatsappText).toBe("Hola, quiero info");
    expect(row.route).toBe("/mi-templo");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (6) Tandas de INSERT
// ═══════════════════════════════════════════════════════════════════════════

describe("push de novedades — audiencia grande", () => {
  it("encola a todos cuando hay más socios que INSERT_CHUNK_SIZE", async () => {
    const total = INSERT_CHUNK_SIZE + 7;
    const stamp = Date.now().toString(36);
    await app.db.insert(users).values(
      Array.from({ length: total }, (_, i) =>
        tenantValues(CTX, {
          email: `nov-push-bulk-${stamp}-${i}@test.com`,
          passwordHash: "x",
          firstName: "Bulk",
          lastName: `Socio ${i}`,
          role: "member" as const,
          status: "activo" as const,
          branchId: branchA,
        }),
      ),
    );
    const bulk = await app.db
      .select({ id: users.id })
      .from(users)
      .where(and(tenantWhere(users, CTX), eq(users.firstName, "Bulk")));
    expect(bulk).toHaveLength(total);
    await app.db.insert(schema.deviceTokens).values(
      bulk.map(({ id }) =>
        tenantValues(CTX, {
          userId: id,
          token: `nov-push-bulk-tok-${stamp}-${id}`,
          platform: "ios" as const,
        }),
      ),
    );

    await insertNovedad();
    const result = await tick();

    expect(result).toMatchObject({ novedades: 1, queued: total, failed: 0 });
    expect(userIdsOf(await pendingRows())).toEqual(
      sorted(bulk.map((b) => b.id)),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (7) Segundo gimnasio
// ═══════════════════════════════════════════════════════════════════════════

describe("push de novedades — aislamiento entre gimnasios", () => {
  it("cada gimnasio encola lo suyo, con su nombre, y un tick no reclama novedades ajenas", async () => {
    const delTemplo = await insertReachable(branchA);
    const delDos = await insertReachable(gym2.branchId, {}, CTX_DOS);
    const novTemplo = await insertNovedad();
    const novDos = await insertNovedad(
      { text: "Novedad del gimnasio 2" },
      CTX_DOS,
    );

    const [dosRow] = await app.db
      .select({ name: schema.tenants.name })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, TENANT_DOS));

    // Tick del gimnasio 2: solo toca lo suyo.
    const resultDos = await tick(CTX_DOS);
    expect(resultDos).toMatchObject({ novedades: 1, queued: 1, failed: 0 });
    expect((await novedadRow(novTemplo))?.pushQueuedAt).toBeNull();
    expect(await pendingRows(CTX)).toHaveLength(0);
    const rowsDos = await pendingRows(CTX_DOS);
    expect(userIdsOf(rowsDos)).toEqual([delDos]);
    expect(rowsDos[0].title).toBe(dosRow.name);
    expect(rowsDos[0].body).toBe("Novedad del gimnasio 2");
    expect(rowsDos[0].tenantId).toBe(TENANT_DOS);

    // Tick de El Templo: solo lo suyo.
    const resultTemplo = await tick(CTX);
    expect(resultTemplo).toMatchObject({ novedades: 1, queued: 1, failed: 0 });
    expect((await novedadRow(novDos, CTX_DOS))?.pushQueuedAt).not.toBeNull();
    const rowsTemplo = await pendingRows(CTX);
    expect(userIdsOf(rowsTemplo)).toEqual([delTemplo]);
    expect(rowsTemplo[0].title).toBe(temploName);
    expect(await pendingRows(CTX_DOS)).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (8) Tick completo
// ═══════════════════════════════════════════════════════════════════════════

describe("push de novedades — tick completo del cron", () => {
  it("runNotificationQueueTick encola y despacha en el mismo pasaje (DRY_RUN: sent)", async () => {
    const socio = await insertReachable(branchA);
    const id = await insertNovedad({ pushTitle: "Desde el tick" });

    const result = await runNotificationQueueTick(app.db);
    expect(result.sent).toBeGreaterThanOrEqual(1);

    expect((await novedadRow(id))?.pushQueuedAt).not.toBeNull();
    const rows = (await pendingRows()).filter((r) => r.userId === socio);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Desde el tick");
    expect(rows[0].status).toBe("sent");

    // Otro tick: ni reencola ni reenvía.
    await runNotificationQueueTick(app.db);
    expect(
      (await pendingRows()).filter((r) => r.userId === socio),
    ).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// (9) Helpers puros
// ═══════════════════════════════════════════════════════════════════════════

describe("resolvePushTitle", () => {
  it("prioriza el título propio recortado", () => {
    expect(resolvePushTitle("  Hola  ", "Gimnasio")).toBe("Hola");
  });
  it("sin título propio usa el nombre del gimnasio", () => {
    expect(resolvePushTitle(null, "  Gimnasio  ")).toBe("Gimnasio");
    expect(resolvePushTitle("   ", "Gimnasio")).toBe("Gimnasio");
  });
  it("sin nada cae a El Templo", () => {
    expect(resolvePushTitle(null, null)).toBe("El Templo");
    expect(resolvePushTitle(null, "   ")).toBe("El Templo");
  });
});

describe("destinationForNovedadPush", () => {
  it("sin destino -> mi_templo", () => {
    expect(
      destinationForNovedadPush({
        destinationType: null,
        destinationSection: null,
        whatsappText: null,
      }),
    ).toEqual({
      type: "app_section",
      section: "mi_templo",
      whatsappText: null,
    });
  });
  it("sección desconocida (dato corrupto) -> mi_templo, nunca lanza", () => {
    expect(
      destinationForNovedadPush({
        destinationType: "app_section",
        destinationSection: "no_existe",
        whatsappText: null,
      }),
    ).toEqual({
      type: "app_section",
      section: "mi_templo",
      whatsappText: null,
    });
  });
  it("app_section válida", () => {
    expect(
      destinationForNovedadPush({
        destinationType: "app_section",
        destinationSection: "guia",
        whatsappText: "ignorado",
      }),
    ).toEqual({ type: "app_section", section: "guia", whatsappText: null });
  });
  it("whatsapp_sales conserva el texto", () => {
    expect(
      destinationForNovedadPush({
        destinationType: "whatsapp_sales",
        destinationSection: "reservas",
        whatsappText: "Hola",
      }),
    ).toEqual({ type: "whatsapp_sales", section: null, whatsappText: "Hola" });
  });
});
