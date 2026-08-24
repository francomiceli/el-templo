/**
 * Fase 180 Plan 10 (RES-05, D-23) — descripción coherente con la etiqueta
 * mostrada + rutas admin del copy de las etiquetas derivadas.
 *
 * Este es el test que previene el bug de Pitfall 9 del research: la
 * etiqueta que ve el socio en un slot de la actividad genérica ("General")
 * puede aparecer como "Combos"/"Técnica" según `deriveActivityLabel`
 * (derived-label.ts, fase 159-06), y la descripción tiene que seguir a esa
 * etiqueta MOSTRADA — nunca a la de "General" (D-23).
 *
 * Casos cubiertos (Task 2, `getWeeklyGrid`):
 * - (a) slot de "General" en día con sessionMode='combos' aprobado ->
 *   activityName="Combos" y activityDescription = la del KV `combos`, NUNCA
 *   la de "General".
 * - (b) mismo slot en día con sessionMode='tecnica' -> descripción de
 *   `tecnica`.
 * - (c) mismo slot sin modo aprobado -> activityName="General" y
 *   activityDescription = `activities.description` de "General".
 * - (d) actividad especial (isSpecial) en día con combos aprobado -> etiqueta
 *   y descripción de la actividad REAL (la derivación no aplica).
 * - (e) sin descripción cargada (ni KV ni activities.description) ->
 *   activityDescription: null.
 *
 * Casos cubiertos (Task 3, rutas admin):
 * - GET sin nada cargado -> {combos: null, tecnica: null}.
 * - PUT carga una descripción -> el GET posterior la refleja.
 * - PUT con string vacío/solo espacios borra la fila -> vuelve a null.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, like } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "./helpers";
import { activities } from "../src/db/schema/activities";
import { branches } from "../src/db/schema/branches";
import { schedules } from "../src/db/schema/schedules";
import { sessions } from "../src/db/schema/sessions";
import { tenantSettings } from "../src/db/schema";

const ADMIN_URL = "/api/admin/scheduling";
const LABEL_DESCRIPTIONS_URL = `${ADMIN_URL}/class-label-descriptions`;

interface WeeklySlot {
  id: number;
  activityId: number;
  activityName: string;
  activityDescription: string | null;
  dayOfWeek: number;
  isSpecial: boolean;
}

interface DescriptionsResponse {
  descriptions: { combos: string | null; tecnica: string | null };
}

describe("Fase 180 Plan 10 (RES-05, D-23): descripción coherente con la etiqueta derivada", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;

  // Semana 4 SPOM (WEEK_ONE_MONDAY=2026-02-23): lunes 2026-03-16. Fija y
  // alejada de otros archivos de test (159-06 usa la semana 3) para no
  // colisionar con sesiones que dejen otros suites en semanas bajas.
  const WEEK = 4;
  const WEEK_START = "2026-03-16";
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
    // `cleanAllTestData` NO limpia `tenant_settings` (es KV compartido con
    // module-flags, precedente: test/fixtures/module-flags.ts) — cada suite
    // limpia su propio namespace de settingKey entre tests.
    await app.db
      .delete(tenantSettings)
      .where(like(tenantSettings.settingKey, "class_label_description.%"));
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

  async function getDescriptions(): Promise<{
    statusCode: number;
    body: DescriptionsResponse;
  }> {
    const res = await app.inject({
      method: "GET",
      url: LABEL_DESCRIPTIONS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  async function putDescription(
    mode: "combos" | "tecnica",
    description: string,
  ): Promise<{ statusCode: number; body: DescriptionsResponse }> {
    const res = await app.inject({
      method: "PUT",
      url: LABEL_DESCRIPTIONS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { mode, description },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  describe("getWeeklyGrid — activityDescription sigue a la etiqueta MOSTRADA", () => {
    it("Combos: día con sessionMode='combos' aprobado devuelve la descripción de Combos, NO la de General", async () => {
      const [general] = await app.db
        .insert(activities)
        .values({
          name: "General",
          description: "Descripción real de la actividad General",
        })
        .$returningId();

      await app.db.insert(schedules).values({
        branchId: testBranchId,
        activityId: general.id,
        dayOfWeek: DAY_MARTES,
        startTime: "08:00",
        endTime: "09:00",
      });

      await insertApprovedSession("martes", "combos");
      await putDescription("combos", "Circuito de combos: fuerza + cardio");

      const { statusCode, slots } = await getWeeklyGrid();
      expect(statusCode).toBe(200);

      const slot = slots.find(
        (s) => s.activityId === general.id && s.dayOfWeek === DAY_MARTES,
      );
      expect(slot?.activityName).toBe("Combos");
      expect(slot?.activityDescription).toBe(
        "Circuito de combos: fuerza + cardio",
      );
      expect(slot?.activityDescription).not.toBe(
        "Descripción real de la actividad General",
      );
    });

    it("Técnica: día con sessionMode='tecnica' aprobado devuelve la descripción de Técnica", async () => {
      const [general] = await app.db
        .insert(activities)
        .values({
          name: "General",
          description: "Descripción real de la actividad General",
        })
        .$returningId();

      await app.db.insert(schedules).values({
        branchId: testBranchId,
        activityId: general.id,
        dayOfWeek: DAY_MIERCOLES,
        startTime: "08:00",
        endTime: "09:00",
      });

      await insertApprovedSession("miercoles", "tecnica");
      await putDescription("tecnica", "Trabajo técnico de movimiento");

      const { slots } = await getWeeklyGrid();

      const slot = slots.find(
        (s) => s.activityId === general.id && s.dayOfWeek === DAY_MIERCOLES,
      );
      expect(slot?.activityName).toBe("Técnica");
      expect(slot?.activityDescription).toBe("Trabajo técnico de movimiento");
    });

    it("sin modo aprobado: activityName='General' y activityDescription = activities.description de General", async () => {
      const [general] = await app.db
        .insert(activities)
        .values({
          name: "General",
          description: "Descripción real de la actividad General",
        })
        .$returningId();

      await app.db.insert(schedules).values({
        branchId: testBranchId,
        activityId: general.id,
        dayOfWeek: DAY_LUNES,
        startTime: "08:00",
        endTime: "09:00",
      });
      // Lunes: sin sesión combos/tecnica aprobada -> conserva "General".

      const { slots } = await getWeeklyGrid();

      const slot = slots.find(
        (s) => s.activityId === general.id && s.dayOfWeek === DAY_LUNES,
      );
      expect(slot?.activityName).toBe("General");
      expect(slot?.activityDescription).toBe(
        "Descripción real de la actividad General",
      );
    });

    it("actividad especial en día con combos aprobado: la derivación NO aplica, etiqueta y descripción reales", async () => {
      const [special] = await app.db
        .insert(activities)
        .values({
          name: "ROM",
          description: "Movilidad guiada",
          isSpecial: true,
        })
        .$returningId();

      await app.db.insert(schedules).values({
        branchId: testBranchId,
        activityId: special.id,
        dayOfWeek: DAY_MARTES,
        startTime: "09:00",
        endTime: "10:00",
      });

      await insertApprovedSession("martes", "combos");
      await putDescription("combos", "Circuito de combos: fuerza + cardio");

      const { slots } = await getWeeklyGrid();

      const slot = slots.find(
        (s) => s.activityId === special.id && s.dayOfWeek === DAY_MARTES,
      );
      expect(slot?.isSpecial).toBe(true);
      expect(slot?.activityName).toBe("ROM");
      expect(slot?.activityDescription).toBe("Movilidad guiada");
    });

    it("sin descripción cargada (ni KV ni activities.description): activityDescription null", async () => {
      const [general] = await app.db
        .insert(activities)
        .values({ name: "General" }) // sin description
        .$returningId();

      await app.db.insert(schedules).values({
        branchId: testBranchId,
        activityId: general.id,
        dayOfWeek: DAY_MARTES,
        startTime: "08:00",
        endTime: "09:00",
      });

      await insertApprovedSession("martes", "combos");
      // Sin PUT de descripción de combos: el KV queda vacío.

      const { slots } = await getWeeklyGrid();

      const slot = slots.find(
        (s) => s.activityId === general.id && s.dayOfWeek === DAY_MARTES,
      );
      expect(slot?.activityName).toBe("Combos");
      expect(slot?.activityDescription).toBeNull();
    });
  });

  describe("GET/PUT /api/admin/scheduling/class-label-descriptions", () => {
    it("GET sin nada cargado devuelve combos y tecnica en null", async () => {
      const { statusCode, body } = await getDescriptions();
      expect(statusCode).toBe(200);
      expect(body.descriptions).toEqual({ combos: null, tecnica: null });
    });

    it("PUT carga una descripción y el GET posterior la refleja", async () => {
      const put = await putDescription(
        "combos",
        "Circuito de combos: fuerza + cardio",
      );
      expect(put.statusCode).toBe(200);
      expect(put.body.descriptions.combos).toBe(
        "Circuito de combos: fuerza + cardio",
      );
      expect(put.body.descriptions.tecnica).toBeNull();

      const { body } = await getDescriptions();
      expect(body.descriptions.combos).toBe(
        "Circuito de combos: fuerza + cardio",
      );
    });

    it("PUT con string vacío borra la descripción cargada (vuelve a null)", async () => {
      await putDescription("tecnica", "Trabajo técnico de movimiento");
      let { body } = await getDescriptions();
      expect(body.descriptions.tecnica).toBe("Trabajo técnico de movimiento");

      await putDescription("tecnica", "   "); // solo espacios -> borra

      ({ body } = await getDescriptions());
      expect(body.descriptions.tecnica).toBeNull();
    });

    it("PUT con mode fuera del enum cerrado devuelve 400 (T-180-44)", async () => {
      const res = await app.inject({
        method: "PUT",
        url: LABEL_DESCRIPTIONS_URL,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { mode: "rom", description: "no debería aceptarse" },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
