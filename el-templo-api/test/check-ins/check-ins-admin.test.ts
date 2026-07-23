/**
 * Integration tests de la vista admin del Registro del día.
 *
 * Endpoint:
 *  - GET /api/admin/check-ins   (ADMIN_ROLES: admin/owner)
 *
 * Coverage:
 *  - Roles: member, coach y gestion → 403; admin y owner → 200. Es dato de
 *    salud autorreportado con nombre, así que el gate es más cerrado que el de
 *    propuestas (que sí deja entrar a gestion).
 *  - Country scope: el admin AR no ve check-ins de socios de sedes ES.
 *  - Summary: cuenta por tipo/valor sobre TODO el filtro y trae los valores en
 *    0 cuando nadie los eligió (la UI no distingue "0" de "no existe").
 *  - bodyAreas: ranking desc, solo filas con zona.
 *  - Listado: agrupa por (socio, día) — una fila con las 3 respuestas juntas.
 *  - Paginación: total = pares (socio, día) distintos, no respuestas; páginas
 *    disjuntas y sin partir el día de un socio entre dos páginas.
 *  - Filtros: sucursal, rango de fechas, questionType.
 *
 * Runs against the per-worker test MySQL DB. The suite runs in CI on push;
 * locally only `pnpm exec tsc --noEmit` is run.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";

const ADMIN_BASE = "/api/admin/check-ins";

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

/** "YYYY-MM-DD" de hace `daysAgo` días (UTC mediodía). */
function dateDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

interface SeededContext {
  arBranchId: number;
  esBranchId: number;
  ownerToken: string;
  adminArToken: string;
  gestionArToken: string;
  coachArToken: string;
  memberArId: number;
  memberArToken: string;
  memberAr2Id: number;
  memberEsId: number;
}

/**
 * Los check-ins se insertan directo en la tabla: el POST del socio solo escribe
 * "hoy" y estos tests necesitan varios días distintos.
 */
async function seedCheckIn(
  app: FastifyInstance,
  row: {
    userId: number;
    questionType: "energy" | "soreness" | "sleep";
    value: string;
    bodyArea?: string;
    date: string;
  },
): Promise<void> {
  await app.db.insert(schema.checkInResponses).values({
    userId: row.userId,
    questionType: row.questionType,
    value: row.value,
    bodyArea: row.bodyArea ?? null,
    date: row.date,
  });
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-CheckIns-Test",
      code: nextSuffix("ARC"),
      country: "AR",
      isVirtual: false,
      isActive: true,
      timezone: "America/Argentina/Buenos_Aires",
    })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-CheckIns-Test",
      code: nextSuffix("ESC"),
      country: "ES",
      isVirtual: false,
      isActive: true,
      timezone: "Europe/Madrid",
    })
    .$returningId();

  await createStaffUser(app, {
    email: "owner-checkins@test.com",
    password: "owner-pass-123",
    firstName: "Owner",
    lastName: "Boss",
    role: "owner",
    branchId: ar.id,
  });
  const ownerToken = await getAuthToken(
    app,
    "owner-checkins@test.com",
    "owner-pass-123",
  );

  await createStaffUser(app, {
    email: "admin-ar-checkins@test.com",
    password: "admin-pass-123",
    firstName: "Ana",
    lastName: "Admin",
    role: "admin",
    branchId: ar.id,
  });
  const adminArToken = await getAuthToken(
    app,
    "admin-ar-checkins@test.com",
    "admin-pass-123",
  );

  await createStaffUser(app, {
    email: "gestion-ar-checkins@test.com",
    password: "gestion-pass-123",
    firstName: "Gaby",
    lastName: "Gestion",
    role: "gestion",
    branchId: ar.id,
  });
  const gestionArToken = await getAuthToken(
    app,
    "gestion-ar-checkins@test.com",
    "gestion-pass-123",
  );

  await createStaffUser(app, {
    email: "coach-ar-checkins@test.com",
    password: "coach-pass-123",
    firstName: "Caro",
    lastName: "Coach",
    role: "coach",
    branchId: ar.id,
  });
  const coachArToken = await getAuthToken(
    app,
    "coach-ar-checkins@test.com",
    "coach-pass-123",
  );

  const memberAr = await registerUser(app, {
    email: `member-ar-checkins-${Date.now()}@test.com`,
    password: "password123",
    firstName: "Laura",
    lastName: "Socia",
    branchId: ar.id,
  });
  const memberAr2 = await registerUser(app, {
    email: `member-ar2-checkins-${Date.now()}@test.com`,
    password: "password123",
    firstName: "Juan",
    lastName: "Socio",
    branchId: ar.id,
  });
  const memberEs = await registerUser(app, {
    email: `member-es-checkins-${Date.now()}@test.com`,
    password: "password123",
    firstName: "Marta",
    lastName: "Socia",
    branchId: es.id,
  });

  return {
    arBranchId: ar.id,
    esBranchId: es.id,
    ownerToken,
    adminArToken,
    gestionArToken,
    coachArToken,
    memberArId: (memberAr.user as { id: number }).id,
    memberArToken: memberAr.token,
    memberAr2Id: (memberAr2.user as { id: number }).id,
    memberEsId: (memberEs.user as { id: number }).id,
  };
}

interface AdminCheckInsBody {
  summary: Record<string, Record<string, number>>;
  bodyAreas: Array<{ area: string; count: number }>;
  rows: Array<{
    userId: number;
    memberName: string;
    branchName: string | null;
    date: string;
    entries: Array<{
      questionType: string;
      value: string;
      bodyArea: string | null;
    }>;
  }>;
  total: number;
  page: number;
  limit: number;
}

describe("Admin check-ins view", () => {
  let app: FastifyInstance;
  let ctx: SeededContext;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    ctx = await seedFixtures(app);
  });

  it("cierra el endpoint a member, coach y gestion; deja pasar admin y owner", async () => {
    const denied: Array<[string, string]> = [
      ["member", ctx.memberArToken],
      ["coach", ctx.coachArToken],
      ["gestion", ctx.gestionArToken],
    ];
    for (const [label, token] of denied) {
      const res = await app.inject({
        method: "GET",
        url: ADMIN_BASE,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode, `${label} debería recibir 403`).toBe(403);
    }

    for (const [label, token] of [
      ["admin", ctx.adminArToken],
      ["owner", ctx.ownerToken],
    ] as Array<[string, string]>) {
      const res = await app.inject({
        method: "GET",
        url: ADMIN_BASE,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode, `${label} debería recibir 200`).toBe(200);
    }
  });

  it("agrupa el listado por socio y día, con las respuestas de ese día juntas", async () => {
    const hoy = dateDaysAgo(0);
    await seedCheckIn(app, {
      userId: ctx.memberArId,
      questionType: "energy",
      value: "bajo",
      date: hoy,
    });
    await seedCheckIn(app, {
      userId: ctx.memberArId,
      questionType: "soreness",
      value: "moderada",
      bodyArea: "espalda",
      date: hoy,
    });
    await seedCheckIn(app, {
      userId: ctx.memberArId,
      questionType: "sleep",
      value: "mal",
      date: hoy,
    });

    const res = await app.inject({
      method: "GET",
      url: ADMIN_BASE,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as AdminCheckInsBody;

    // 3 respuestas → UNA fila: el total cuenta días, no respuestas.
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    const row = body.rows[0];
    expect(row.memberName).toBe("Laura Socia");
    expect(row.branchName).toBe("AR-CheckIns-Test");
    expect(row.date).toBe(hoy);
    // Orden estable energía → dolor → sueño.
    expect(row.entries.map((e) => e.questionType)).toEqual([
      "energy",
      "soreness",
      "sleep",
    ]);
    const soreness = row.entries.find((e) => e.questionType === "soreness");
    expect(soreness?.value).toBe("moderada");
    expect(soreness?.bodyArea).toBe("espalda");
  });

  it("devuelve el summary con todos los valores posibles, en 0 los no elegidos", async () => {
    await seedCheckIn(app, {
      userId: ctx.memberArId,
      questionType: "energy",
      value: "bajo",
      date: dateDaysAgo(0),
    });
    await seedCheckIn(app, {
      userId: ctx.memberAr2Id,
      questionType: "energy",
      value: "bajo",
      date: dateDaysAgo(0),
    });
    await seedCheckIn(app, {
      userId: ctx.memberArId,
      questionType: "energy",
      value: "alto",
      date: dateDaysAgo(1),
    });

    const res = await app.inject({
      method: "GET",
      url: ADMIN_BASE,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    const body = JSON.parse(res.body) as AdminCheckInsBody;

    expect(body.summary.energy).toEqual({ bajo: 2, normal: 0, alto: 1 });
    // Los tipos sin ninguna respuesta igual vienen completos en 0.
    expect(body.summary.sleep).toEqual({ mal: 0, ok: 0, bien: 0 });
    expect(body.summary.soreness).toEqual({
      ninguna: 0,
      leve: 0,
      moderada: 0,
    });
  });

  it("rankea las zonas del cuerpo por cantidad, ignorando las respuestas sin zona", async () => {
    const dias = [dateDaysAgo(0), dateDaysAgo(1), dateDaysAgo(2)];
    for (const date of dias) {
      await seedCheckIn(app, {
        userId: ctx.memberArId,
        questionType: "soreness",
        value: "leve",
        bodyArea: "espalda",
        date,
      });
    }
    await seedCheckIn(app, {
      userId: ctx.memberAr2Id,
      questionType: "soreness",
      value: "moderada",
      bodyArea: "piernas",
      date: dias[0],
    });
    // "ninguna" no lleva zona: no debe aparecer en el ranking.
    await seedCheckIn(app, {
      userId: ctx.memberAr2Id,
      questionType: "soreness",
      value: "ninguna",
      date: dias[1],
    });

    const res = await app.inject({
      method: "GET",
      url: ADMIN_BASE,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    const body = JSON.parse(res.body) as AdminCheckInsBody;

    expect(body.bodyAreas).toEqual([
      { area: "espalda", count: 3 },
      { area: "piernas", count: 1 },
    ]);
  });

  it("aplica el scope de país: el admin AR no ve check-ins de socios ES", async () => {
    await seedCheckIn(app, {
      userId: ctx.memberArId,
      questionType: "energy",
      value: "normal",
      date: dateDaysAgo(0),
    });
    await seedCheckIn(app, {
      userId: ctx.memberEsId,
      questionType: "energy",
      value: "alto",
      date: dateDaysAgo(0),
    });

    const arRes = await app.inject({
      method: "GET",
      url: ADMIN_BASE,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    const arBody = JSON.parse(arRes.body) as AdminCheckInsBody;
    expect(arBody.total).toBe(1);
    expect(arBody.rows[0]?.userId).toBe(ctx.memberArId);
    // El summary también respeta el scope: el "alto" del socio ES no suma.
    expect(arBody.summary.energy).toEqual({ bajo: 0, normal: 1, alto: 0 });

    // El owner ve las dos.
    const ownerRes = await app.inject({
      method: "GET",
      url: ADMIN_BASE,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    const ownerBody = JSON.parse(ownerRes.body) as AdminCheckInsBody;
    expect(ownerBody.total).toBe(2);
  });

  it("filtra por sucursal, rango de fechas y tipo de pregunta", async () => {
    await seedCheckIn(app, {
      userId: ctx.memberArId,
      questionType: "energy",
      value: "bajo",
      date: dateDaysAgo(0),
    });
    await seedCheckIn(app, {
      userId: ctx.memberArId,
      questionType: "sleep",
      value: "mal",
      date: dateDaysAgo(10),
    });
    await seedCheckIn(app, {
      userId: ctx.memberEsId,
      questionType: "energy",
      value: "alto",
      date: dateDaysAgo(0),
    });

    const porSucursal = await app.inject({
      method: "GET",
      url: `${ADMIN_BASE}?branchId=${ctx.esBranchId}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    const sucursalBody = JSON.parse(porSucursal.body) as AdminCheckInsBody;
    expect(sucursalBody.total).toBe(1);
    expect(sucursalBody.rows[0]?.userId).toBe(ctx.memberEsId);

    // Rango que deja fuera el check-in de hace 10 días.
    const porFecha = await app.inject({
      method: "GET",
      url: `${ADMIN_BASE}?dateFrom=${dateDaysAgo(3)}&dateTo=${dateDaysAgo(0)}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    const fechaBody = JSON.parse(porFecha.body) as AdminCheckInsBody;
    expect(fechaBody.total).toBe(2);
    expect(fechaBody.summary.sleep.mal).toBe(0);

    const porTipo = await app.inject({
      method: "GET",
      url: `${ADMIN_BASE}?questionType=sleep`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    const tipoBody = JSON.parse(porTipo.body) as AdminCheckInsBody;
    expect(tipoBody.total).toBe(1);
    expect(tipoBody.rows[0]?.entries).toHaveLength(1);
    expect(tipoBody.rows[0]?.entries[0]?.questionType).toBe("sleep");
  });

  it("con un tipo filtrado no cuela las otras respuestas del mismo día", async () => {
    // Mismo socio, mismo día, dos preguntas: el día entra al listado por el
    // sueño, pero la energía no tiene que aparecer en la fila.
    const hoy = dateDaysAgo(0);
    await seedCheckIn(app, {
      userId: ctx.memberArId,
      questionType: "sleep",
      value: "mal",
      date: hoy,
    });
    await seedCheckIn(app, {
      userId: ctx.memberArId,
      questionType: "energy",
      value: "alto",
      date: hoy,
    });

    const res = await app.inject({
      method: "GET",
      url: `${ADMIN_BASE}?questionType=sleep`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    const body = JSON.parse(res.body) as AdminCheckInsBody;
    expect(body.total).toBe(1);
    expect(body.rows[0]?.entries).toHaveLength(1);
    expect(body.rows[0]?.entries[0]?.questionType).toBe("sleep");
    // Y el summary del tipo filtrado tampoco cuenta la energía.
    expect(body.summary.energy).toEqual({ bajo: 0, normal: 0, alto: 0 });
    expect(body.summary.sleep.mal).toBe(1);
  });

  it("pagina sobre días sin partir el día de un socio entre páginas", async () => {
    // 2 socios × 2 días = 4 filas, cada una con 2 respuestas.
    const dias = [dateDaysAgo(0), dateDaysAgo(1)];
    for (const userId of [ctx.memberArId, ctx.memberAr2Id]) {
      for (const date of dias) {
        await seedCheckIn(app, {
          userId,
          questionType: "energy",
          value: "normal",
          date,
        });
        await seedCheckIn(app, {
          userId,
          questionType: "sleep",
          value: "ok",
          date,
        });
      }
    }

    const page1 = await app.inject({
      method: "GET",
      url: `${ADMIN_BASE}?page=1&limit=2`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    const p1 = JSON.parse(page1.body) as AdminCheckInsBody;
    // 8 respuestas, pero 4 pares (socio, día).
    expect(p1.total).toBe(4);
    expect(p1.rows).toHaveLength(2);
    // Cada fila llega completa aunque la página corte: las 2 respuestas juntas.
    for (const row of p1.rows) {
      expect(row.entries).toHaveLength(2);
    }

    const page2 = await app.inject({
      method: "GET",
      url: `${ADMIN_BASE}?page=2&limit=2`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    const p2 = JSON.parse(page2.body) as AdminCheckInsBody;
    expect(p2.total).toBe(4);
    expect(p2.rows).toHaveLength(2);

    // Páginas disjuntas.
    const key = (r: AdminCheckInsBody["rows"][number]) =>
      `${r.userId}|${r.date}`;
    const keys1 = p1.rows.map(key);
    const keys2 = p2.rows.map(key);
    expect(keys1.filter((k) => keys2.includes(k))).toHaveLength(0);
    expect(new Set([...keys1, ...keys2]).size).toBe(4);
  });

  it("devuelve summary vacío y sin filas cuando no hay check-ins", async () => {
    const res = await app.inject({
      method: "GET",
      url: ADMIN_BASE,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as AdminCheckInsBody;
    expect(body.total).toBe(0);
    expect(body.rows).toEqual([]);
    expect(body.bodyAreas).toEqual([]);
    expect(body.summary.energy).toEqual({ bajo: 0, normal: 0, alto: 0 });
  });

  it("rechaza filtros mal formados", async () => {
    const bad = [
      "questionType=animo",
      "dateFrom=ayer",
      "branchId=0",
      "limit=500",
    ];
    for (const qs of bad) {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_BASE}?${qs}`,
        headers: { authorization: `Bearer ${ctx.ownerToken}` },
      });
      expect(res.statusCode, `${qs} debería ser 400`).toBe(400);
    }
  });

  it("ignora un parámetro desconocido en vez de rechazarlo", async () => {
    // additionalProperties:false NO devuelve 400 acá: Fastify compila ajv con
    // removeAdditional:true (default de @fastify/ajv-compiler), así que el
    // parámetro de más se descarta y la request sigue. Se fija el
    // comportamiento real para que no vuelva a escribirse un test que espere
    // 400 -- y para notar el día que alguien cambie esa opción global.
    await seedCheckIn(app, {
      userId: ctx.memberArId,
      questionType: "energy",
      value: "normal",
      date: dateDaysAgo(0),
    });

    const res = await app.inject({
      method: "GET",
      url: `${ADMIN_BASE}?foo=bar`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    // Y el parámetro colado no filtró nada: devuelve lo mismo que sin él.
    const body = JSON.parse(res.body) as AdminCheckInsBody;
    expect(body.total).toBe(1);
  });
});
