/**
 * Fase 204 (D-01/D-03/D-07/D-08/D-09/D-12) — la etiqueta Wellhub en alumnos es
 * un hecho del servidor.
 *
 * Las tres personas del brief (fixtures de `wellhub-personas.ts`):
 *   - visitante nuevo: status 'wellhub', sin plan
 *   - ex-alumno vinculado: 'inactivo' + gympass_id
 *   - socio activo con gympass_id (la marca NO se ve, D-03)
 * mas un socio comun sin gympass_id.
 *
 * Todo via `app.inject` (la serializacion de la respuesta descarta lo que el
 * schema no declara). Los asserts se filtran por los ids creados: otros tests
 * comparten la base. Fechas relativas a "hoy" (5 y 45 dias atras, con margen
 * amplio contra la ventana de 30 dias).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { Workbook } from "exceljs";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { AudienceService } from "../../src/modules/campaigns/audience-service";
import {
  createTestApp,
  createTestMember,
  createTestPlan,
  cleanAllTestData,
  dateOffsetStr,
  getAuthToken,
} from "../helpers";
import {
  TEMPLO_CTX,
  createWellhubExAlumno,
  createWellhubSocioActivo,
  createWellhubVisitor,
  insertActivityWithSchedule,
  insertAttendance,
  insertBooking,
  type WellhubExAlumno,
  type WellhubSocioActivo,
  type WellhubVisitor,
} from "../fixtures/wellhub-personas";

const BRANCH_ID = 1;

interface ListRow {
  id: number;
  status: string | null;
  isWellhub: boolean;
  showWellhubLabel: boolean;
}

interface ListBody {
  members: ListRow[];
  total: number;
}

interface SearchRow {
  id: number;
  isWellhub?: boolean;
  showWellhubLabel: boolean;
}

describe("Fase 204: etiqueta Wellhub en alumnos (D-01/D-03/D-07/D-08/D-09/D-12)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let planId: number;
  let scheduleId: number;

  let visitor: WellhubVisitor;
  let exAlumno: WellhubExAlumno;
  /** Socio activo con gympass_id y una reserva Wellhub de hace 5 dias. */
  let socioReciente: WellhubSocioActivo;
  /** Socio activo con gympass_id y una visita Wellhub de hace 3 dias. */
  let socioVisita: WellhubSocioActivo;
  /** Socio activo con gympass_id y actividad Wellhub solo de hace 45 dias. */
  let socioViejo: WellhubSocioActivo;
  /** Socio activo con gympass_id y una reserva PROPIA (source NULL) de hace 5 dias. */
  let socioPropia: WellhubSocioActivo;
  /** Socio comun, sin gympass_id. */
  let comun: { id: number; token: string; email: string };

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const plan = await createTestPlan(app, adminToken, {
      name: `Plan 204-07 ${Date.now().toString(36)}`,
      classesPerWeek: 3,
      durationDays: 30,
    });
    planId = plan.id;
    ({ scheduleId } = await insertActivityWithSchedule(app, {
      branchId: BRANCH_ID,
    }));

    visitor = await createWellhubVisitor(app, { branchId: BRANCH_ID });
    exAlumno = await createWellhubExAlumno(app, adminToken, {
      branchId: BRANCH_ID,
      planId,
    });

    socioReciente = await createWellhubSocioActivo(app, adminToken, {
      planId,
      branchId: BRANCH_ID,
    });
    await insertBooking(app, {
      memberId: socioReciente.id,
      scheduleId,
      bookingDate: dateOffsetStr(-5),
      status: "confirmado",
      source: "wellhub",
    });

    socioVisita = await createWellhubSocioActivo(app, adminToken, {
      planId,
      branchId: BRANCH_ID,
    });
    await insertAttendance(app, {
      memberId: socioVisita.id,
      branchId: BRANCH_ID,
      scheduleId,
      sessionDate: dateOffsetStr(-3),
      source: "wellhub",
    });

    socioViejo = await createWellhubSocioActivo(app, adminToken, {
      planId,
      branchId: BRANCH_ID,
    });
    await insertBooking(app, {
      memberId: socioViejo.id,
      scheduleId,
      bookingDate: dateOffsetStr(-45),
      status: "confirmado",
      source: "wellhub",
    });
    await insertAttendance(app, {
      memberId: socioViejo.id,
      branchId: BRANCH_ID,
      scheduleId,
      sessionDate: dateOffsetStr(-45),
      source: "wellhub_manual",
    });

    socioPropia = await createWellhubSocioActivo(app, adminToken, {
      planId,
      branchId: BRANCH_ID,
    });
    await insertBooking(app, {
      memberId: socioPropia.id,
      scheduleId,
      bookingDate: dateOffsetStr(-5),
      status: "confirmado",
      source: null,
    });

    comun = await createTestMember(app, { branchId: BRANCH_ID });
  });

  async function listMembers(query: string): Promise<{
    statusCode: number;
    body: ListBody;
  }> {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members?${query}&limit=100`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) as ListBody };
  }

  function byId(rows: ListRow[], id: number): ListRow | undefined {
    return rows.find((r) => r.id === id);
  }

  it("status=wellhub responde 200 y trae solo visitantes", async () => {
    const { statusCode, body } = await listMembers("status=wellhub");

    expect(statusCode).toBe(200);
    expect(byId(body.members, visitor.id)).toBeDefined();
    expect(byId(body.members, exAlumno.id)).toBeUndefined();
    expect(byId(body.members, socioReciente.id)).toBeUndefined();
    expect(byId(body.members, comun.id)).toBeUndefined();
    // Todo lo que vuelve es un visitante.
    for (const row of body.members) {
      expect(row.status).toBe("wellhub");
    }
  });

  it("la etiqueta se ve para visitante y ex-alumno y no para el socio activo", async () => {
    const { statusCode, body } = await listMembers("status=todos");
    expect(statusCode).toBe(200);

    const v = byId(body.members, visitor.id);
    expect(v?.isWellhub).toBe(true);
    expect(v?.showWellhubLabel).toBe(true);

    const ex = byId(body.members, exAlumno.id);
    expect(ex?.status).toBe("inactivo");
    expect(ex?.isWellhub).toBe(true);
    expect(ex?.showWellhubLabel).toBe(true);

    const socio = byId(body.members, socioReciente.id);
    expect(socio?.status).toBe("activo");
    expect(socio?.isWellhub).toBe(true);
    expect(socio?.showWellhubLabel).toBe(false);

    const c = byId(body.members, comun.id);
    expect(c?.isWellhub).toBe(false);
    expect(c?.showWellhubLabel).toBe(false);
  });

  it("Solo Wellhub incluye socios activos con actividad Wellhub de los últimos 30 días", async () => {
    const { statusCode, body } = await listMembers("wellhubOnly=true");
    expect(statusCode).toBe(200);

    // (a) etiqueta visible
    expect(byId(body.members, visitor.id)).toBeDefined();
    expect(byId(body.members, exAlumno.id)).toBeDefined();
    // (b) socio activo con reserva / visita Wellhub reciente
    expect(byId(body.members, socioReciente.id)).toBeDefined();
    expect(byId(body.members, socioVisita.id)).toBeDefined();
    // Socio activo con gympass pero solo actividad Wellhub de hace 45 dias
    expect(byId(body.members, socioViejo.id)).toBeUndefined();
    // Una reserva propia (source NULL) no cuenta como actividad Wellhub
    expect(byId(body.members, socioPropia.id)).toBeUndefined();
    // Sin gympass_id
    expect(byId(body.members, comun.id)).toBeUndefined();
  });

  it("Solo Wellhub se combina con el estado", async () => {
    const { statusCode, body } = await listMembers(
      "wellhubOnly=true&status=inactivo",
    );
    expect(statusCode).toBe(200);

    expect(byId(body.members, exAlumno.id)).toBeDefined();
    expect(byId(body.members, visitor.id)).toBeUndefined();
    expect(byId(body.members, socioReciente.id)).toBeUndefined();
    for (const row of body.members) {
      expect(row.status).toBe("inactivo");
      expect(row.isWellhub).toBe(true);
    }
  });

  it("el buscador marca al visitante Wellhub", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/search?search=Wellhub&limit=50`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { members: SearchRow[] };

    const v = body.members.find((m) => m.id === visitor.id);
    expect(v).toBeDefined();
    expect(v?.showWellhubLabel).toBe(true);
    expect(v?.isWellhub).toBe(true);

    // El socio comun ("Test Member") aparece sin marca.
    const resComun = await app.inject({
      method: "GET",
      url: `/api/admin/members/search?search=Member&limit=50`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(resComun.statusCode).toBe(200);
    const bodyComun = JSON.parse(resComun.body) as { members: SearchRow[] };
    const c = bodyComun.members.find((m) => m.id === comun.id);
    expect(c).toBeDefined();
    expect(c?.showWellhubLabel).toBe(false);
    expect(c?.isWellhub).toBe(false);
  });

  it("la ficha trae showWellhubLabel del ex-alumno", async () => {
    const get = async (id: number) => {
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      return JSON.parse(res.body) as {
        isWellhub: boolean;
        showWellhubLabel: boolean;
      };
    };

    const ex = await get(exAlumno.id);
    expect(ex.isWellhub).toBe(true);
    expect(ex.showWellhubLabel).toBe(true);

    const socio = await get(socioReciente.id);
    expect(socio.isWellhub).toBe(true);
    expect(socio.showWellhubLabel).toBe(false);

    const c = await get(comun.id);
    expect(c.isWellhub).toBe(false);
    expect(c.showWellhubLabel).toBe(false);
  });

  it("export: la columna Estado dice Wellhub e Inactivo · Wellhub", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/export`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);

    const wb = new Workbook();
    await wb.xlsx.load(res.rawPayload);
    const sheet = wb.getWorksheet("Alumnos");
    expect(sheet).toBeDefined();
    if (!sheet) return;

    const header = sheet.getRow(1);
    let emailCol = -1;
    let estadoCol = -1;
    header.eachCell((cell, col) => {
      if (cell.value === "Email") emailCol = col;
      if (cell.value === "Estado") estadoCol = col;
    });
    expect(emailCol).toBeGreaterThan(0);
    expect(estadoCol).toBeGreaterThan(0);

    const estadoDe = (email: string): string | undefined => {
      let found: string | undefined;
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        if (String(row.getCell(emailCol).value) === email) {
          found = String(row.getCell(estadoCol).value);
        }
      });
      return found;
    };

    expect(estadoDe(visitor.email)).toBe("Wellhub");
    expect(estadoDe(exAlumno.email)).toBe("Inactivo · Wellhub");
    expect(estadoDe(socioReciente.email)).toBe("Activo");
  });

  it("la campaña bajas excluye al ex-alumno que viene por Wellhub", async () => {
    // Ex-alumno comun: mismo historial pagado pero sin gympass_id.
    const exComun = await createWellhubExAlumno(app, adminToken, {
      branchId: BRANCH_ID,
      planId,
    });
    await app.db
      .update(schema.users)
      .set({ gympassId: null })
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, exComun.id),
        ),
      );

    const audience = new AudienceService(app.db, app.log);
    const eligible = await audience.resolveAudience(TEMPLO_CTX, "bajas", null);
    const ids = eligible.map((e) => e.userId);

    expect(ids).toContain(exComun.id);
    expect(ids).not.toContain(exAlumno.id);
  });
});
