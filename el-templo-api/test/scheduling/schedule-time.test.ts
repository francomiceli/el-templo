/**
 * PATCH /admin/scheduling/schedules/:scheduleId/time — feedback profes
 * (2026-09): Open Gym (y el resto de las actividades) podía cambiar sede y
 * actividad de un horario ya creado, pero no la HORA. La única salida era
 * desactivar el slot y crear uno nuevo, perdiendo el historial/id del
 * horario original. Esta ruta cierra ese hueco.
 *
 * Cubre:
 *   - éxito: cambia start/end, la respuesta y la fila en DB reflejan el
 *     nuevo horario.
 *   - 400 cuando startTime >= endTime.
 *   - 409 cuando la nueva ventana se solapa con OTRO horario de la MISMA
 *     actividad/sede/día (mismo probe que createSchedule/updateScheduleActivity).
 *   - 409 cuando el horario tiene reservas FUTURAS (hoy cuenta como futuro).
 *   - éxito cuando el horario tiene UNA reserva PASADA solamente (no bloquea).
 *   - 404 con un scheduleId inexistente.
 *
 * Mismo molde que schedule-activity-crud.test.ts (Phase 113 Plan 01): app
 * real via createTestApp(), branch seed no-virtual, cleanAllTestData entre
 * casos.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createTestMember,
  dateOffsetStr,
} from "../helpers";
import { branches } from "../../src/db/schema/branches";
import { schedules } from "../../src/db/schema/schedules";
import { bookings } from "../../src/db/schema/bookings";
import { tenantWhere, type TenantContext } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const ADMIN_URL = "/api/admin/scheduling";

// `schedules`/`bookings` son tablas strict del sentinel de tenancy (módulo
// `scheduling` en TENANT_STRICT_MODULES, src/db/tenant-tables.ts) — toda
// lectura directa de este archivo (fuera del camino API, que ya filtra por
// ctx) necesita este `tenantWhere` o el sentinel hace throw. Este archivo es
// single-tenant (nunca siembra un segundo gimnasio), así que siempre es
// El Templo.
const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };

interface ScheduleResponse {
  id: number;
  branchId: number;
  branchName: string;
  activityId: number;
  activityName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

interface ErrorBody {
  error: string;
  message: string;
}

describe("PATCH /admin/scheduling/schedules/:scheduleId/time", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [branch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isVirtual, false));
    testBranchId = branch.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  async function createActivity(name: string): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    return (JSON.parse(res.body) as { id: number }).id;
  }

  async function createSchedule(
    activityId: number,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
  ): Promise<ScheduleResponse> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { branchId: testBranchId, activityId, dayOfWeek, startTime, endTime },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body) as ScheduleResponse;
  }

  async function patchTime(
    scheduleId: number,
    startTime: string,
    endTime: string,
  ): Promise<{ statusCode: number; body: unknown }> {
    const res = await app.inject({
      method: "PATCH",
      url: `${ADMIN_URL}/schedules/${scheduleId}/time`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { startTime, endTime },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  it("cambia la hora del horario y la respuesta + la fila en DB reflejan el nuevo horario", async () => {
    const activityId = await createActivity("Open Gym");
    const slot = await createSchedule(activityId, 1, "10:00", "11:00");

    const { statusCode, body } = await patchTime(slot.id, "12:00", "13:30");
    expect(statusCode).toBe(200);
    const updated = body as ScheduleResponse;
    expect(updated.startTime).toBe("12:00");
    expect(updated.endTime).toBe("13:30");
    // El resto del slot no se toca.
    expect(updated.id).toBe(slot.id);
    expect(updated.activityId).toBe(activityId);
    expect(updated.branchId).toBe(testBranchId);

    const [row] = await app.db
      .select({ startTime: schedules.startTime, endTime: schedules.endTime })
      .from(schedules)
      .where(and(tenantWhere(schedules, TEMPLO_CTX), eq(schedules.id, slot.id)));
    expect(row).toEqual({ startTime: "12:00", endTime: "13:30" });
  });

  it("rechaza con 400 cuando startTime >= endTime", async () => {
    const activityId = await createActivity("Open Gym");
    const slot = await createSchedule(activityId, 1, "10:00", "11:00");

    const { statusCode, body } = await patchTime(slot.id, "11:00", "10:00");
    expect(statusCode).toBe(400);
    expect((body as ErrorBody).message).toContain(
      "La hora de fin debe ser posterior al inicio",
    );

    // No se tocó nada.
    const [row] = await app.db
      .select({ startTime: schedules.startTime, endTime: schedules.endTime })
      .from(schedules)
      .where(and(tenantWhere(schedules, TEMPLO_CTX), eq(schedules.id, slot.id)));
    expect(row).toEqual({ startTime: "10:00", endTime: "11:00" });
  });

  it("rechaza con 409 cuando la nueva ventana se solapa con otro horario de la misma actividad/sede/día", async () => {
    const activityId = await createActivity("Open Gym");
    await createSchedule(activityId, 1, "10:00", "11:00");
    const slotB = await createSchedule(activityId, 1, "14:00", "15:00");

    const { statusCode, body } = await patchTime(slotB.id, "10:30", "11:30");
    expect(statusCode).toBe(409);
    expect((body as ErrorBody).message).toContain("se solapa");

    // slotB sigue con su horario original.
    const [row] = await app.db
      .select({ startTime: schedules.startTime, endTime: schedules.endTime })
      .from(schedules)
      .where(and(tenantWhere(schedules, TEMPLO_CTX), eq(schedules.id, slotB.id)));
    expect(row).toEqual({ startTime: "14:00", endTime: "15:00" });
  });

  it("rechaza con 409 cuando el horario tiene reservas futuras", async () => {
    const activityId = await createActivity("Open Gym");
    const slot = await createSchedule(activityId, 1, "10:00", "11:00");
    const member = await createTestMember(app);

    await app.db.insert(bookings).values({
      memberId: member.id as number,
      scheduleId: slot.id,
      bookingDate: dateOffsetStr(3),
      status: "reservado",
    });

    const { statusCode, body } = await patchTime(slot.id, "12:00", "13:00");
    expect(statusCode).toBe(409);
    expect((body as ErrorBody).message).toContain("reserva");
    expect((body as ErrorBody).message).toContain("futura");

    const [row] = await app.db
      .select({ startTime: schedules.startTime, endTime: schedules.endTime })
      .from(schedules)
      .where(and(tenantWhere(schedules, TEMPLO_CTX), eq(schedules.id, slot.id)));
    expect(row).toEqual({ startTime: "10:00", endTime: "11:00" });
  });

  it("cambia la hora sin bloquear cuando el horario tiene UNA reserva PASADA solamente", async () => {
    const activityId = await createActivity("Open Gym");
    const slot = await createSchedule(activityId, 1, "10:00", "11:00");
    const member = await createTestMember(app);

    await app.db.insert(bookings).values({
      memberId: member.id as number,
      scheduleId: slot.id,
      bookingDate: dateOffsetStr(-3),
      status: "reservado",
    });

    const { statusCode, body } = await patchTime(slot.id, "12:00", "13:00");
    expect(statusCode).toBe(200);
    const updated = body as ScheduleResponse;
    expect(updated.startTime).toBe("12:00");
    expect(updated.endTime).toBe("13:00");
  });

  it("responde 404 con un scheduleId inexistente", async () => {
    const { statusCode } = await patchTime(999999, "12:00", "13:00");
    expect(statusCode).toBe(404);
  });
});
