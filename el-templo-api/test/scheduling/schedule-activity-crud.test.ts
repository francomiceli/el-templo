/**
 * Phase 113 Plan 01: schedule + activity CRUD hardening.
 *
 * Covers the 7 truths from the plan's must_haves block plus a sanity case:
 * - createSchedule overlap rejection on active rows in same branch+day.
 * - back-to-back slots NOT considered conflict.
 * - inactive historic slot does NOT block new slot at the same time (D-12).
 * - createActivity name uniqueness across active activities (D-16).
 * - reuse of an inactive activity's name allowed.
 * - rename collision against another active activity rejected.
 * - deactivating activity with active referencing schedules → 409 with
 *   structured affectedSchedules payload (D-13).
 * - deactivating activity with no active referencing schedules → 200 (D-14).
 *
 * Runs against the per-worker MySQL test database via createTestApp().
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { branches } from "../../src/db/schema/branches";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";

const ADMIN_URL = "/api/admin/scheduling";

interface ActivityResponse {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  maxCapacity?: number | null;
  isSpecial?: boolean;
  createdAt: string;
  updatedAt: string;
}

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

interface ConflictBody {
  error: string;
  message: string;
  affectedSchedules?: Array<{
    id: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    branchName: string;
  }>;
}

describe("Phase 113: schedule + activity CRUD hardening", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;

  beforeAll(async () => {
    // Pin to Wednesday 10:00 UTC for consistency with scheduling.test.ts.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-11T10:00:00Z"));

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Use the first non-virtual seeded branch — same pattern as
    // scheduling.test.ts. cleanAllTestData does NOT touch branches.
    const [branch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isVirtual, false));
    testBranchId = branch.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  beforeEach(async () => {
    // Wipe schedules + activities + their dependents between cases.
    // cleanAllTestData honors FK order and preserves admin@test.com + branches.
    await cleanAllTestData(app);
  });

  /**
   * Helper: create an activity via API (admin-authenticated).
   */
  async function createActivity(name: string): Promise<ActivityResponse> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body) as ActivityResponse;
  }

  /**
   * Helper: create a schedule via API.
   */
  async function postSchedule(
    activityId: number,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
  ): Promise<{ statusCode: number; body: unknown }> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId: testBranchId,
        activityId,
        dayOfWeek,
        startTime,
        endTime,
      },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  // ─── Truth 1: overlap on active slot rejected ─────────────────────────────
  it("rechaza overlap activo en mismo branch+day", async () => {
    const activity = await createActivity("Calistenia");

    // Pre-insert active 10:30-11:30 directly via DB to avoid API path under
    // test interfering with fixture setup.
    await app.db.insert(schedules).values({
      branchId: testBranchId,
      activityId: activity.id,
      dayOfWeek: 1,
      startTime: "10:30",
      endTime: "11:30",
      isActive: true,
    });

    const { statusCode, body } = await postSchedule(
      activity.id,
      1,
      "10:00",
      "11:00",
    );
    expect(statusCode).toBe(409);
    expect((body as { message: string }).message).toContain("se solapa");
  });

  // ─── Truth 2: back-to-back allowed ─────────────────────────────────────────
  it("permite back-to-back (10-11 + 11-12)", async () => {
    const activity = await createActivity("Calistenia");

    const first = await postSchedule(activity.id, 1, "10:00", "11:00");
    expect(first.statusCode).toBe(201);

    const second = await postSchedule(activity.id, 1, "11:00", "12:00");
    expect(second.statusCode).toBe(201);
  });

  // ─── Truth 3: inactive slot does not block new slot ───────────────────────
  it("ignora overlap con slot inactivo (D-12)", async () => {
    const activity = await createActivity("Calistenia");

    await app.db.insert(schedules).values({
      branchId: testBranchId,
      activityId: activity.id,
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "11:00",
      isActive: false,
    });

    const { statusCode, body } = await postSchedule(
      activity.id,
      1,
      "10:00",
      "11:00",
    );
    expect(statusCode).toBe(201);
    expect((body as ScheduleResponse).startTime).toBe("10:00");
  });

  // ─── Truth 4: activity name uniqueness on create ─────────────────────────
  it("rechaza activity con name duplicado entre activas", async () => {
    await createActivity("Calistenia");

    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Calistenia" },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { message: string };
    expect(body.message).toContain("Ya existe una actividad activa");
  });

  // ─── Truth 5: inactive activity name reusable ─────────────────────────────
  it("permite reusar nombre de activity inactiva", async () => {
    const first = await createActivity("ROM");

    // Deactivate via API (no schedules referencing it, so cascade allows).
    const deactivate = await app.inject({
      method: "PUT",
      url: `${ADMIN_URL}/activities/${first.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive: false },
    });
    expect(deactivate.statusCode).toBe(200);

    // Recreate by name — must succeed because the only collision row is
    // now isActive=false.
    const second = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "ROM" },
    });
    expect(second.statusCode).toBe(201);
  });

  // ─── Truth 6: rename collision rejected ────────────────────────────────────
  it("rechaza rename a nombre tomado por otra activa", async () => {
    const a = await createActivity("Calistenia");
    const b = await createActivity("ROM");

    const res = await app.inject({
      method: "PUT",
      url: `${ADMIN_URL}/activities/${a.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "ROM" },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { message: string };
    expect(body.message).toContain("Ya existe otra actividad activa");
    // Sanity: original ROM activity untouched.
    expect(b.id).toBeGreaterThan(0);
  });

  // ─── Truth 7: deactivation cascade-block + affectedSchedules payload ──────
  it("bloquea desactivar activity con schedules activos y devuelve affectedSchedules", async () => {
    const activity = await createActivity("Calistenia");

    const create = await postSchedule(activity.id, 2, "09:00", "10:00");
    expect(create.statusCode).toBe(201);
    const schedule = create.body as ScheduleResponse;

    const res = await app.inject({
      method: "PUT",
      url: `${ADMIN_URL}/activities/${activity.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as ConflictBody;
    expect(body.error).toBe("Conflicto");
    expect(body.message).toContain("No se puede desactivar");
    expect(body.affectedSchedules).toBeDefined();
    expect(body.affectedSchedules).toHaveLength(1);
    const affected = body.affectedSchedules![0];
    expect(affected.id).toBe(schedule.id);
    expect(affected.dayOfWeek).toBe(2);
    expect(affected.startTime).toBe("09:00");
    expect(affected.endTime).toBe("10:00");
    expect(typeof affected.branchName).toBe("string");
    expect(affected.branchName.length).toBeGreaterThan(0);

    // Sanity: activity remains active because deactivation was blocked.
    const [row] = await app.db
      .select({ isActive: activities.isActive })
      .from(activities)
      .where(eq(activities.id, activity.id));
    expect(row.isActive).toBe(true);
  });

  // ─── Sanity 8: deactivation succeeds when no schedules reference activity ──
  it("permite desactivar activity sin schedules activos", async () => {
    const activity = await createActivity("Pilates");

    const res = await app.inject({
      method: "PUT",
      url: `${ADMIN_URL}/activities/${activity.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as ActivityResponse;
    expect(body.isActive).toBe(false);
  });

  // ─── Fase 161 (ACT-01): persistencia del flag is_special ──────────────────
  // El CRUD acepta, persiste y devuelve isSpecial ida-y-vuelta (POST true →
  // GET → PUT false). Es el contrato que consume el gating del pase
  // "Actividades con Aura" (Plan 06) y el ABM del admin (fase 162).

  it("POST /activities con isSpecial=true persiste el flag", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Verticales", isSpecial: true },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as ActivityResponse;
    expect(body.isSpecial).toBe(true);

    // Persistido en DB, no sólo en el response.
    const [row] = await app.db
      .select({ isSpecial: activities.isSpecial })
      .from(activities)
      .where(eq(activities.id, body.id));
    expect(row.isSpecial).toBe(true);
  });

  it("POST /activities sin isSpecial default false (actividad regular)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Calistenia" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as ActivityResponse;
    expect(body.isSpecial).toBe(false);
  });

  it("GET /activities devuelve isSpecial por actividad", async () => {
    const special = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Acrobacias", isSpecial: true },
    });
    expect(special.statusCode).toBe(201);
    const specialId = (JSON.parse(special.body) as ActivityResponse).id;
    await createActivity("Regular");

    const list = await app.inject({
      method: "GET",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(list.statusCode).toBe(200);
    const { activities: rows } = JSON.parse(list.body) as {
      activities: ActivityResponse[];
    };
    const acro = rows.find((a) => a.id === specialId);
    const regular = rows.find((a) => a.name === "Regular");
    expect(acro?.isSpecial).toBe(true);
    expect(regular?.isSpecial).toBe(false);
  });

  it("PUT /activities/:id con isSpecial=false actualiza el flag", async () => {
    const created = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Open Gym", isSpecial: true },
    });
    expect(created.statusCode).toBe(201);
    const id = (JSON.parse(created.body) as ActivityResponse).id;

    const update = await app.inject({
      method: "PUT",
      url: `${ADMIN_URL}/activities/${id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isSpecial: false },
    });
    expect(update.statusCode).toBe(200);
    expect((JSON.parse(update.body) as ActivityResponse).isSpecial).toBe(false);

    // Round-trip: GET confirma el nuevo valor persistido.
    const [row] = await app.db
      .select({ isSpecial: activities.isSpecial })
      .from(activities)
      .where(eq(activities.id, id));
    expect(row.isSpecial).toBe(false);
  });
});
