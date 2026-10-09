/**
 * Integration tests — staff-attendance: cierre forzado de una jornada abierta
 * (2026-10-08).
 *
 *   POST /api/admin/staff-attendance/shifts/:id/force-checkout
 *
 * Los inserts van directo a la DB con `tenantValues` y las lecturas con
 * `tenantWhere` (el sentinel de tenancy rechaza queries sin tenant_id). Todas
 * las horas se calculan RELATIVAS a "ahora": ningún assert depende de la hora
 * UTC en que corre CI.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { todayInTz } from "../../src/modules/shared/date-utils";
import { generateQrToken } from "../../src/modules/shared/qr-token";
import { BRANCH_OUT_OF_SCOPE } from "../../src/modules/shared/branch-access";

const BASE = "/api/admin/staff-attendance";
const ME_URL = `${BASE}/me`;
const CHECK_IN_URL = `${BASE}/check-in`;
const SHIFTS_URL = `${BASE}/shifts`;

const CTX = { tenantId: TENANT_TEMPLO };
const TZ_AR = "America/Argentina/Buenos_Aires";
const TZ_ES = "Europe/Madrid";
const HOUR = 60 * 60 * 1000;

function uniqueSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 10000)
    .toString(36)
    .padStart(3, "0");
  return `${prefix}${t}${r}`;
}

interface ShiftBody {
  id: number;
  userId: number;
  branchId: number;
  checkedInAt: string;
  checkedOutAt: string | null;
  durationMinutes: number | null;
  forcedByName: string | null;
  forcedReason: string | null;
  checklist: unknown;
}

describe("Staff Attendance — forzar check-out", () => {
  let app: FastifyInstance;

  let branchAId: number;
  let branchEsId: number;

  let adminId: number;
  let adminToken: string;
  let ownerToken: string;
  let coachToken: string;
  let personToken: string;
  let personId: number;
  let fillerId: number;

  let u: string;
  let todayAr: string;
  let todayEs: string;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanAllTestData(app);

    u = uniqueSuffix("FC");
    todayAr = todayInTz(TZ_AR);
    todayEs = todayInTz(TZ_ES);

    const insertBranch = async (
      label: string,
      country: "AR" | "ES",
      timezone: string,
    ): Promise<number> => {
      const [row] = await app.db
        .insert(schema.branches)
        .values(
          tenantValues(CTX, {
            name: `Force ${label} ${u}`,
            code: `F${label}-${u}`.slice(0, 20),
            country,
            isActive: true,
            timezone,
            isVirtual: false,
          }),
        )
        .$returningId();
      return row.id;
    };
    branchAId = await insertBranch("A", "AR", TZ_AR);
    branchEsId = await insertBranch("E", "ES", TZ_ES);

    const mkUser = async (
      key: string,
      role: string,
      country?: "AR" | "ES",
    ): Promise<{ id: number; email: string }> => {
      const email = `${key}-${u}@test.local`;
      const id = await createStaffUser(app, {
        email,
        password: "test1234",
        firstName: key,
        lastName: `Force${u}`,
        role,
        branchId: branchAId,
        country,
      });
      return { id, email };
    };

    const admin = await mkUser("admin", "admin", "AR");
    const owner = await mkUser("owner", "owner");
    const coach = await mkUser("coach", "coach");
    const person = await mkUser("persona", "coach");
    const filler = await mkUser("relleno", "recepcion");
    adminId = admin.id;
    personId = person.id;
    fillerId = filler.id;
    adminToken = await getAuthToken(app, admin.email, "test1234");
    ownerToken = await getAuthToken(app, owner.email, "test1234");
    coachToken = await getAuthToken(app, coach.email, "test1234");
    personToken = await getAuthToken(app, person.email, "test1234");
  });

  afterAll(async () => {
    await app.close();
  });

  /** Inserta una jornada y devuelve id + entrada. Por defecto abierta, entró hace 5 h. */
  const insertShift = async (v: {
    userId: number;
    branchId: number;
    shiftDate?: string;
    checkedInAt?: Date;
    checkedOutAt?: Date | null;
  }): Promise<{ id: number; checkedInAt: Date }> => {
    const checkedInAt = v.checkedInAt ?? new Date(Date.now() - 5 * HOUR);
    const [row] = await app.db
      .insert(schema.staffShifts)
      .values(
        tenantValues(CTX, {
          userId: v.userId,
          branchId: v.branchId,
          shiftDate: v.shiftDate ?? todayAr,
          checkedInAt,
          checkedOutAt: v.checkedOutAt ?? null,
        }),
      )
      .$returningId();
    return { id: row.id, checkedInAt };
  };

  const force = (id: number, token: string, payload: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: `${SHIFTS_URL}/${id}/force-checkout`,
      headers: { Authorization: `Bearer ${token}` },
      payload,
    });

  // Sin milisegundos: `checked_out_at` es TIMESTAMP(0) y la respuesta sale de
  // la DB, así que un valor con ms no volvería idéntico.
  const hoursAgo = (h: number): string =>
    new Date(Math.floor((Date.now() - h * HOUR) / 1000) * 1000).toISOString();

  it("admin fuerza una abierta -> 200, guarda hora, motivo, checklist null y audit_log", async () => {
    const { id } = await insertShift({
      userId: personId,
      branchId: branchAId,
    });
    const checkedOutAt = hoursAgo(1);

    const res = await force(id, adminToken, {
      checkedOutAt,
      reason: "  Se olvidó de fichar la salida  ",
    });
    expect(res.statusCode).toBe(200);
    const shift: ShiftBody = JSON.parse(res.body).shift;
    expect(shift.id).toBe(id);
    expect(shift.checkedOutAt).toBe(checkedOutAt);
    expect(shift.durationMinutes).toBe(240);
    expect(shift.checklist).toBeNull();
    expect(shift.forcedByName).toBe(`admin Force${u}`);
    expect(shift.forcedReason).toBe("Se olvidó de fichar la salida");

    // Persistido en la DB (forced_checkout_by = el actor).
    const [row] = await app.db
      .select({
        checkedOutAt: schema.staffShifts.checkedOutAt,
        checklist: schema.staffShifts.checklist,
        forcedBy: schema.staffShifts.forcedCheckoutBy,
      })
      .from(schema.staffShifts)
      .where(
        and(
          tenantWhere(schema.staffShifts, CTX),
          eq(schema.staffShifts.id, id),
        ),
      );
    expect(row.checkedOutAt?.toISOString()).toBe(checkedOutAt);
    expect(row.checklist).toBeNull();
    expect(row.forcedBy).toBe(adminId);

    // audit_log en la misma operación.
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, CTX),
          eq(schema.auditLog.action, "staff_shift_forced_checkout"),
          eq(schema.auditLog.targetId, id),
        ),
      );
    expect(audit).toHaveLength(1);
    expect(audit[0].actorId).toBe(adminId);
    expect(audit[0].targetKind).toBe("staff_shift");
    expect(audit[0].payloadJson).toMatchObject({
      shiftId: id,
      userId: personId,
      branchId: branchAId,
      checkedOutAt,
      reason: "Se olvidó de fichar la salida",
    });
  });

  it("el registro (/shifts) expone forcedByName y forcedReason", async () => {
    const { id } = await insertShift({
      userId: fillerId,
      branchId: branchAId,
    });
    const ok = await force(id, adminToken, {
      checkedOutAt: hoursAgo(2),
      reason: "Cierre de la última clase",
    });
    expect(ok.statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: `${SHIFTS_URL}?branchId=${branchAId}&from=${todayAr}&to=${todayAr}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const rows: ShiftBody[] = JSON.parse(res.body).shifts;
    const forced = rows.find((r) => r.id === id);
    expect(forced?.forcedByName).toBe(`admin Force${u}`);
    expect(forced?.forcedReason).toBe("Cierre de la última clase");
  });

  it("después del cierre forzado la persona ya no tiene jornada abierta y puede fichar de nuevo", async () => {
    const stale = await insertShift({
      userId: personId,
      branchId: branchAId,
      shiftDate: todayAr,
      checkedInAt: new Date(Date.now() - 30 * HOUR),
    });

    // Con la jornada colgada, el check-in está bloqueado.
    const blocked = await app.inject({
      method: "POST",
      url: CHECK_IN_URL,
      headers: { Authorization: `Bearer ${personToken}` },
      payload: { qrToken: generateQrToken(branchAId) },
    });
    expect(blocked.statusCode).toBe(409);

    const res = await force(stale.id, ownerToken, {
      checkedOutAt: hoursAgo(26),
      reason: "Jornada colgada de ayer",
    });
    expect(res.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: ME_URL,
      headers: { Authorization: `Bearer ${personToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(JSON.parse(me.body).open).toBeNull();

    const checkIn = await app.inject({
      method: "POST",
      url: CHECK_IN_URL,
      headers: { Authorization: `Bearer ${personToken}` },
      payload: { qrToken: generateQrToken(branchAId) },
    });
    expect(checkIn.statusCode).toBe(201);
  });

  it("coach -> 403 y la jornada sigue abierta", async () => {
    const { id } = await insertShift({
      userId: fillerId,
      branchId: branchAId,
    });
    const res = await force(id, coachToken, {
      checkedOutAt: hoursAgo(1),
      reason: "Intento de un coach",
    });
    expect(res.statusCode).toBe(403);

    const [row] = await app.db
      .select({ checkedOutAt: schema.staffShifts.checkedOutAt })
      .from(schema.staffShifts)
      .where(
        and(
          tenantWhere(schema.staffShifts, CTX),
          eq(schema.staffShifts.id, id),
        ),
      );
    expect(row.checkedOutAt).toBeNull();
  });

  it("jornada ya cerrada -> 409 (también al forzar dos veces)", async () => {
    const closedIn = new Date(Date.now() - 6 * HOUR);
    const closed = await insertShift({
      userId: fillerId,
      branchId: branchAId,
      checkedInAt: closedIn,
      checkedOutAt: new Date(Date.now() - 3 * HOUR),
    });
    const res = await force(closed.id, adminToken, {
      checkedOutAt: hoursAgo(1),
      reason: "Ya estaba cerrada",
    });
    expect(res.statusCode).toBe(409);

    const open = await insertShift({ userId: fillerId, branchId: branchAId });
    const first = await force(open.id, adminToken, {
      checkedOutAt: hoursAgo(1),
      reason: "Primer cierre",
    });
    expect(first.statusCode).toBe(200);
    const second = await force(open.id, adminToken, {
      checkedOutAt: hoursAgo(0.5),
      reason: "Segundo cierre",
    });
    expect(second.statusCode).toBe(409);
  });

  it("jornada inexistente -> 404", async () => {
    const res = await force(2_000_000_000, adminToken, {
      checkedOutAt: hoursAgo(1),
      reason: "No existe",
    });
    expect(res.statusCode).toBe(404);
  });

  it("salida anterior a la entrada -> 400", async () => {
    const { id, checkedInAt } = await insertShift({
      userId: fillerId,
      branchId: branchAId,
    });
    const res = await force(id, adminToken, {
      checkedOutAt: new Date(checkedInAt.getTime() - HOUR).toISOString(),
      reason: "Antes de entrar",
    });
    expect(res.statusCode).toBe(400);
  });

  it("salida en el futuro -> 400", async () => {
    const { id } = await insertShift({ userId: fillerId, branchId: branchAId });
    const res = await force(id, adminToken, {
      checkedOutAt: new Date(Date.now() + 24 * HOUR).toISOString(),
      reason: "Mañana",
    });
    expect(res.statusCode).toBe(400);
  });

  it("fecha inválida o sin fecha -> 400", async () => {
    const { id } = await insertShift({ userId: fillerId, branchId: branchAId });
    const invalid = await force(id, adminToken, {
      checkedOutAt: "no-es-una-fecha",
      reason: "Fecha rota",
    });
    expect(invalid.statusCode).toBe(400);
    const missing = await force(id, adminToken, { reason: "Sin fecha" });
    expect(missing.statusCode).toBe(400);
  });

  it("sin motivo, motivo corto, solo espacios o muy largo -> 400", async () => {
    const { id } = await insertShift({ userId: fillerId, branchId: branchAId });
    const checkedOutAt = hoursAgo(1);
    for (const payload of [
      { checkedOutAt },
      { checkedOutAt, reason: "ab" },
      { checkedOutAt, reason: "     " },
      { checkedOutAt, reason: "x".repeat(256) },
    ]) {
      const res = await force(id, adminToken, payload);
      expect(res.statusCode).toBe(400);
    }
  });

  it("admin AR sobre una jornada de sede de España -> 403; owner -> 200", async () => {
    const { id } = await insertShift({
      userId: fillerId,
      branchId: branchEsId,
      shiftDate: todayEs,
    });
    const checkedOutAt = hoursAgo(1);

    const denied = await force(id, adminToken, {
      checkedOutAt,
      reason: "Sede de otro país",
    });
    expect(denied.statusCode).toBe(403);
    expect(JSON.parse(denied.body).code).toBe(BRANCH_OUT_OF_SCOPE);

    const ok = await force(id, ownerToken, {
      checkedOutAt,
      reason: "Cierre del owner",
    });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).shift.branchId).toBe(branchEsId);
  });

  it("sin token -> 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${SHIFTS_URL}/1/force-checkout`,
      payload: { checkedOutAt: hoursAgo(1), reason: "Sin sesión" },
    });
    expect(res.statusCode).toBe(401);
  });
});
