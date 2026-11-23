/**
 * Hotfix 2026-11-23 — un pase especial NUNCA otorga programas.
 *
 * Bug: el form de planes del admin precargaba Foundation al abrirse en
 * presencial y no lo limpiaba al pasar a especial (donde el campo queda
 * oculto). El servidor guardaba el `linkedProgramId` y, al asignar el pase,
 * `enrollFromPlan` cancelaba la inscripción del socio a Foundation y le creaba
 * una nueva desde la semana 1 (le borraba el avance).
 *
 * Fix: createPlan/updatePlan descartan programa vinculado, "todos los
 * programas" y lista cuando el plan (final) es especial. La migración 0357
 * limpia los que ya estaban guardados.
 *
 * Cubre:
 *   - POST especial con programa vinculado + todos + lista → todo vacío (DB).
 *   - PUT de un especial que manda programa → sigue vacío.
 *   - PUT que pasa un presencial con programa y lista a especial → se limpian
 *     el vinculado y la lista (plan_programs).
 *   - E2E del bug: asignar el pase a un socio con Foundation en semana 3 NO
 *     toca su inscripción (misma fila, misma semana, activa).
 *   - Regresión: un presencial conserva su programa vinculado, y en edición
 *     un null lo vacía (lo que ahora manda el admin al borrar el campo).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import {
  SUBSCRIPTIONS_URL,
  basePlan,
  createPlan,
  createMember,
  assignPlan,
} from "./_helpers";
import * as schema from "../../src/db/schema";
import { programs } from "../../src/db/schema/micro-programs";
import { programEnrollments } from "../../src/db/schema/program-enrollments";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

describe("Pase especial sin programas (hotfix 2026-11-23)", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  const especialBase = {
    ...basePlan,
    classesPerWeek: undefined,
    planCategory: "especial",
    monthlyClassBudget: 1,
    durationDays: 7,
    specialLine: "Master 11 h",
  };

  async function createTestProgram(
    name: string,
    goalPlanType: "tren_superior" | "piernas_gluteos" | null,
  ): Promise<number> {
    const result = await app.db.insert(programs).values({
      name,
      description: `${name} de prueba`,
      durationWeeks: 4,
      sessionsPerWeekToAdvance: 3,
      isActive: true,
      goalPlanType,
    });
    return Number(result[0].insertId);
  }

  async function dbPlanPrograms(planId: number): Promise<{
    linkedProgramId: number | null;
    grantsAllPrograms: boolean;
    listIds: number[];
  }> {
    const [plan] = await app.db
      .select({
        linkedProgramId: schema.subscriptionPlans.linkedProgramId,
        grantsAllPrograms: schema.subscriptionPlans.grantsAllPrograms,
      })
      .from(schema.subscriptionPlans)
      .where(
        and(
          tenantWhere(schema.subscriptionPlans, TEMPLO_CTX),
          eq(schema.subscriptionPlans.id, planId),
        ),
      );
    const list = await app.db
      .select({ programId: schema.planPrograms.programId })
      .from(schema.planPrograms)
      .where(
        and(
          tenantWhere(schema.planPrograms, TEMPLO_CTX),
          eq(schema.planPrograms.subscriptionPlanId, planId),
        ),
      );
    return {
      linkedProgramId: plan.linkedProgramId,
      grantsAllPrograms: plan.grantsAllPrograms,
      listIds: list.map((r) => r.programId),
    };
  }

  async function putPlan(planId: number, payload: Record<string, unknown>) {
    return app.inject({
      method: "PUT",
      url: `${SUBSCRIPTIONS_URL}/plans/${planId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });
  }

  it("POST especial descarta programa vinculado, 'todos' y lista", async () => {
    const foundation = await createTestProgram("Foundation", null);
    const otro = await createTestProgram("Tren Superior", "tren_superior");

    const linked = await createPlan(app, adminToken, {
      ...especialBase,
      name: "Pase con Foundation",
      linkedProgramId: foundation,
      programIds: [otro],
    });
    expect(await dbPlanPrograms(linked.id)).toEqual({
      linkedProgramId: null,
      grantsAllPrograms: false,
      listIds: [],
    });

    const todos = await createPlan(app, adminToken, {
      ...especialBase,
      name: "Pase con todos",
      grantsAllPrograms: true,
    });
    expect(await dbPlanPrograms(todos.id)).toEqual({
      linkedProgramId: null,
      grantsAllPrograms: false,
      listIds: [],
    });
  });

  it("PUT de un especial que manda programa vinculado lo deja vacío", async () => {
    const foundation = await createTestProgram("Foundation", null);
    const plan = await createPlan(app, adminToken, {
      ...especialBase,
      name: "Pase editado",
    });

    const res = await putPlan(plan.id, {
      linkedProgramId: foundation,
      grantsAllPrograms: true,
      priceRegular: 30000,
    });
    expect(res.statusCode).toBe(200);

    expect(await dbPlanPrograms(plan.id)).toEqual({
      linkedProgramId: null,
      grantsAllPrograms: false,
      listIds: [],
    });
    // El resto del PUT se aplica igual.
    const [row] = await app.db
      .select({ priceRegular: schema.subscriptionPlans.priceRegular })
      .from(schema.subscriptionPlans)
      .where(
        and(
          tenantWhere(schema.subscriptionPlans, TEMPLO_CTX),
          eq(schema.subscriptionPlans.id, plan.id),
        ),
      );
    expect(Number(row.priceRegular)).toBe(30000);
  });

  it("PUT que pasa un presencial con programa y lista a especial limpia ambos", async () => {
    const foundation = await createTestProgram("Foundation", null);
    const otro = await createTestProgram("Tren Superior", "tren_superior");
    const plan = await createPlan(app, adminToken, {
      name: "Presencial a especial",
      linkedProgramId: foundation,
      programIds: [otro],
    });
    expect(await dbPlanPrograms(plan.id)).toEqual({
      linkedProgramId: foundation,
      grantsAllPrograms: false,
      listIds: [otro],
    });

    // Igual que el admin: cambia la categoría sin mandar los campos de programa.
    const res = await putPlan(plan.id, {
      planCategory: "especial",
      planTier: "other",
      bookingMode: "flexible",
      classesPerWeek: null,
      monthlyClassBudget: 1,
      specialLine: "Master 17 h",
    });
    expect(res.statusCode).toBe(200);

    expect(await dbPlanPrograms(plan.id)).toEqual({
      linkedProgramId: null,
      grantsAllPrograms: false,
      listIds: [],
    });
  });

  it("asignar el pase NO reinicia la inscripción a Foundation del socio", async () => {
    const foundation = await createTestProgram("Foundation", null);
    const presencial = await createPlan(app, adminToken, {
      name: "Presencial con Foundation",
      linkedProgramId: foundation,
    });
    const member = await createMember(app);
    const memberId = member.id;

    const first = await assignPlan(app, adminToken, memberId, {
      planId: presencial.id,
    });
    expect(first.statusCode).toBe(201);

    // Avance en curso: semana 3.
    await app.db
      .update(programEnrollments)
      .set({ currentWeek: 3, sessionsCompletedThisWeek: 2 })
      .where(
        and(
          eq(programEnrollments.userId, memberId),
          eq(programEnrollments.programId, foundation),
        ),
      );
    const [before] = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, memberId),
          eq(programEnrollments.programId, foundation),
          eq(programEnrollments.status, "active"),
        ),
      );

    // El admin viejo mandaba Foundation en el pase: el servidor lo descarta.
    const pase = await createPlan(app, adminToken, {
      ...especialBase,
      name: "Pase Masterclass con Foundation",
      linkedProgramId: foundation,
    });
    const second = await assignPlan(app, adminToken, memberId, {
      planId: pase.id,
    });
    expect(second.statusCode).toBe(201);

    const active = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, memberId),
          eq(programEnrollments.programId, foundation),
          eq(programEnrollments.status, "active"),
        ),
      );
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(before.id);
    expect(active[0].currentWeek).toBe(3);
    expect(active[0].sessionsCompletedThisWeek).toBe(2);

    const cancelled = await app.db
      .select({ id: programEnrollments.id })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, memberId),
          eq(programEnrollments.status, "cancelled"),
        ),
      );
    expect(cancelled).toHaveLength(0);
  });

  it("regresión: un presencial conserva su programa y en edición null lo vacía", async () => {
    const foundation = await createTestProgram("Foundation", null);
    const plan = await createPlan(app, adminToken, {
      name: "Presencial normal",
      linkedProgramId: foundation,
    });
    expect((await dbPlanPrograms(plan.id)).linkedProgramId).toBe(foundation);

    const res = await putPlan(plan.id, { linkedProgramId: null });
    expect(res.statusCode).toBe(200);
    expect((await dbPlanPrograms(plan.id)).linkedProgramId).toBeNull();
  });
});
