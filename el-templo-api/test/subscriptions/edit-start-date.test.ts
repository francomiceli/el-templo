/**
 * PATCH /api/admin/subscriptions/subscriptions/:id/start-date — editar la fecha
 * de inicio de una programada ("arranca cuando venga": la fecha es un tope) y
 * el tope de +90 días del alta.
 *
 * Fechas relativas a hoy (dateOffsetStr) para no depender del calendario.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  dateOffsetStr,
} from "./_helpers";
import { START_DATE_FUTURE_LIMIT_DAYS } from "../../src/modules/subscriptions/service";

// Gimnasio de este archivo: las queries directas a tablas ya migradas al
// sentinel de tenancy (users, member_notes) van filtradas con tenantWhere.
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

describe("Subscriptions — editar fecha de inicio de una programada", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminUserId: number;
  let planId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    const [admin] = await app.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.email, "admin@test.com"),
        ),
      );
    adminUserId = admin.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const plan = await createPlan(app, adminToken, { durationDays: 30 });
    planId = plan.id;
  });

  async function scheduledSub(
    email: string,
    startOffsetDays: number,
  ): Promise<{ memberId: number; subscriptionId: number }> {
    const member = await createMember(app, { email });
    const res = await assignPlan(app, adminToken, member.id, {
      planId,
      startDate: dateOffsetStr(startOffsetDays),
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe("scheduled");
    return { memberId: member.id, subscriptionId: res.body.id as number };
  }

  function patchStartDate(subscriptionId: number, startDate: string) {
    return app.inject({
      method: "PATCH",
      url: `${SUBSCRIPTIONS_URL}/subscriptions/${subscriptionId}/start-date`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { startDate },
    });
  }

  it("mueve el tope hacia adelante: recalcula vencimiento, sigue programada y deja nota", async () => {
    const { memberId, subscriptionId } = await scheduledSub(
      "edit-start-1@test.com",
      20,
    );

    const res = await patchStartDate(subscriptionId, dateOffsetStr(45));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("scheduled");
    expect(body.startDate).toBe(dateOffsetStr(45));
    expect(body.endDate).toBe(dateOffsetStr(75));

    const notes = await app.db
      .select({
        content: schema.memberNotes.content,
        authorId: schema.memberNotes.authorId,
      })
      .from(schema.memberNotes)
      .where(
        and(
          tenantWhere(schema.memberNotes, TEMPLO_CTX),
          eq(schema.memberNotes.userId, memberId),
        ),
      );
    expect(notes).toHaveLength(1);
    expect(notes[0].content).toContain("Fecha de inicio movida del");
    expect(notes[0].authorId).toBe(adminUserId);
  });

  it("mueve el inicio a hoy: la programada pasa a activa y el socio a activo", async () => {
    const { memberId, subscriptionId } = await scheduledSub(
      "edit-start-2@test.com",
      20,
    );

    const res = await patchStartDate(subscriptionId, dateOffsetStr(0));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe("active");

    const [user] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(
        and(
          tenantWhere(schema.users, TEMPLO_CTX),
          eq(schema.users.id, memberId),
        ),
      );
    expect(user.status).toBe("activo");
  });

  it("rechaza una fecha más allá del tope de +90 días", async () => {
    const { subscriptionId } = await scheduledSub("edit-start-3@test.com", 20);

    const res = await patchStartDate(
      subscriptionId,
      dateOffsetStr(START_DATE_FUTURE_LIMIT_DAYS + 1),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      `${START_DATE_FUTURE_LIMIT_DAYS} días en el futuro`,
    );
  });

  it("el alta acepta un inicio a 75 días (antes el tope era 60)", async () => {
    const member = await createMember(app, { email: "edit-start-4@test.com" });
    const res = await assignPlan(app, adminToken, member.id, {
      planId,
      startDate: dateOffsetStr(75),
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe("scheduled");
  });

  it("rechaza sin autenticación", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `${SUBSCRIPTIONS_URL}/subscriptions/1/start-date`,
      payload: { startDate: dateOffsetStr(10) },
    });
    expect(res.statusCode).toBe(401);
  });
});
