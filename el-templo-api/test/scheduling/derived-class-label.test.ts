/**
 * Phase 159 Plan 06: etiqueta de clase derivada de la sesion (SEM-13) +
 * rename "Calistenia" -> "General" (D-16).
 *
 * Garantiza por integracion el comportamiento de D-15/D-16/D-17: el nombre
 * de la clase en el horario semanal se deriva de la sesion aprobada del dia
 * (combos -> "Combos", tecnica -> "Tecnica", si no -> "General"), SOLO para
 * la actividad generica y SOLO cuando no es especial -- reservas, cupos y
 * gating quedan intactos. Corre en CI contra el MySQL de test; el gate
 * local es solo tsc (no se corre el suite completo localmente).
 *
 * Casos:
 * - (a) Sesion aprobada session_mode='combos' para (week, martes) -> el slot
 *   de la actividad generica ese dia devuelve activityName="Combos".
 * - (a) Sesion aprobada session_mode='tecnica' para (week, miercoles) -> el
 *   slot generico de ese dia devuelve activityName="Tecnica".
 * - (a) Dia sin sesion combos/tecnica (lunes) -> el slot generico conserva
 *   "General".
 * - (b) Un slot isSpecial en el MISMO dia de combos NO se renombra (guarda
 *   D-17: la derivacion nunca toca actividades especiales).
 * - (c) Sembrar una sede NUEVA con seedDefaultSchedules despues del rename
 *   NO duplica la fila "General" (Pitfall 4): sigue existiendo una sola fila
 *   "General" y cero filas "Calistenia" en toda la base.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { activities } from "../../src/db/schema/activities";
import { branches } from "../../src/db/schema/branches";
import { schedules } from "../../src/db/schema/schedules";
import { sessions } from "../../src/db/schema/sessions";

const ADMIN_URL = "/api/admin/scheduling";

interface WeeklySlot {
  id: number;
  activityId: number;
  activityName: string;
  dayOfWeek: number;
  isSpecial: boolean;
}

describe("Phase 159-06: etiqueta de clase derivada (D-15/D-16/D-17)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;

  // Semana 3 SPOM (WEEK_ONE_MONDAY=2026-02-23): lunes 2026-03-09. Fija y
  // alejada de otros archivos de test para no colisionar con sesiones que
  // dejen otros suites en semanas bajas.
  const WEEK = 3;
  const WEEK_START = "2026-03-09";
  const DAY_MARTES = 2; // combos
  const DAY_MIERCOLES = 3; // tecnica
  const DAY_LUNES = 1; // sin sesion combos/tecnica -> queda "General"

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [branch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isVirtual, false))
      .limit(1);
    testBranchId = branch.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  async function getWeeklyGrid(): Promise<{
    statusCode: number;
    slots: WeeklySlot[];
  }> {
    const res = await app.inject({
      method: "GET",
      url: `${ADMIN_URL}/schedules/weekly?branchId=${testBranchId}&weekStart=${WEEK_START}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const body = JSON.parse(res.body) as { slots: WeeklySlot[] };
    return { statusCode: res.statusCode, slots: body.slots };
  }

  async function insertApprovedSession(
    day: string,
    sessionMode: string,
  ): Promise<void> {
    await app.db.insert(sessions).values({
      dayId: `W${WEEK}-${day}-alfa_delta-${sessionMode}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      week: WEEK,
      day,
      levelGroup: "alfa_delta",
      blockCount: 1,
      sessionMode,
      status: "approved",
    });
  }

  it("deriva Combos/Tecnica/General para la actividad generica y respeta la guarda isSpecial", async () => {
    // Estado post-rename (D-16): la actividad generica se llama "General".
    const [general] = await app.db
      .insert(activities)
      .values({ name: "General", description: "Clase grupal" })
      .$returningId();
    const [special] = await app.db
      .insert(activities)
      .values({ name: "Yoga", description: "Actividad especial", isSpecial: true })
      .$returningId();

    await app.db.insert(schedules).values([
      {
        branchId: testBranchId,
        activityId: general.id,
        dayOfWeek: DAY_LUNES,
        startTime: "08:00",
        endTime: "09:00",
      },
      {
        branchId: testBranchId,
        activityId: general.id,
        dayOfWeek: DAY_MARTES,
        startTime: "08:00",
        endTime: "09:00",
      },
      {
        branchId: testBranchId,
        activityId: general.id,
        dayOfWeek: DAY_MIERCOLES,
        startTime: "08:00",
        endTime: "09:00",
      },
      {
        // Slot especial el MISMO dia que la sesion combos -- NO debe
        // renombrarse (D-17: la derivacion es solo para la actividad
        // generica, un slot isSpecial nunca se toca).
        branchId: testBranchId,
        activityId: special.id,
        dayOfWeek: DAY_MARTES,
        startTime: "09:00",
        endTime: "10:00",
      },
    ]);

    await insertApprovedSession("martes", "combos");
    await insertApprovedSession("miercoles", "tecnica");
    // Lunes: sin sesion combos/tecnica -> el slot generico conserva "General".

    const { statusCode, slots } = await getWeeklyGrid();
    expect(statusCode).toBe(200);

    const generalLunes = slots.find(
      (s) => s.activityId === general.id && s.dayOfWeek === DAY_LUNES,
    );
    const generalMartes = slots.find(
      (s) => s.activityId === general.id && s.dayOfWeek === DAY_MARTES,
    );
    const generalMiercoles = slots.find(
      (s) => s.activityId === general.id && s.dayOfWeek === DAY_MIERCOLES,
    );
    const specialMartes = slots.find(
      (s) => s.activityId === special.id && s.dayOfWeek === DAY_MARTES,
    );

    expect(generalLunes?.activityName).toBe("General");
    expect(generalMartes?.activityName).toBe("Combos");
    expect(generalMiercoles?.activityName).toBe("Técnica");
    // Guarda D-17: el slot especial del mismo dia de combos no se renombra.
    expect(specialMartes?.activityName).toBe("Yoga");
    expect(specialMartes?.isSpecial).toBe(true);
  });

  it("sembrar una sede nueva tras el rename no duplica la actividad generica (Pitfall 4)", async () => {
    // Simula el estado post-migracion 0204: ya existe UNA fila "General"
    // (la migracion la renombro desde "Calistenia").
    await app.db.insert(activities).values({
      name: "General",
      description: "Clase grupal de entrenamiento funcional",
    });

    const [newBranch] = await app.db
      .insert(branches)
      .values({
        name: "Sede Nueva 159-06",
        code: `S159-${Date.now().toString(36)}`.slice(0, 20),
        country: "AR",
        isActive: true,
        timezone: "America/Argentina/Buenos_Aires",
        isVirtual: false,
      })
      .$returningId();

    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_URL}/schedules/seed`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { branchId: newBranch.id },
    });
    expect(res.statusCode).toBe(201);

    const generalRows = await app.db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.name, "General"));
    const calisteniaRows = await app.db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.name, "Calistenia"));

    expect(generalRows).toHaveLength(1);
    expect(calisteniaRows).toHaveLength(0);
  });
});
