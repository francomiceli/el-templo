/**
 * Etiqueta "invitado" del roster de una clase (para el profe): `invitation: { accessesUsed,
 * accessesBudget } | null` por alumno, en los DOS rosters:
 *   - `GET /api/admin/attendance/slot/:scheduleId/:date` (hoy / pasado), y
 *   - `GET /api/admin/scheduling/schedules/:scheduleId/detail?date=` (clases futuras, el que
 *     alimenta SlotDetailDialog del admin) -> en cada elemento de `bookings`.
 *
 * No nulo SOLO para un invitado que todavía no compró: invitación `active` sin `converted_at`
 * y `users.status = 'prueba'`. Nulo para un socio común, para un invitado que ya compró
 * (convirtió o ya no está en prueba) y para una invitación anulada. Si hay más de una
 * invitación, vale la más reciente. Todo por `app.inject` (la serialización descarta lo que el
 * schema de respuesta no declara).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  insertActivityWithSchedule,
  insertBooking,
} from "../fixtures/wellhub-personas";
import {
  createAccessSub,
  createInvitationRow,
  createInvitedUser,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  fixtureCtx,
  type InvitationsFixtureCtx,
  type InvitedUserEnv,
} from "./_helpers";
import {
  ownerToken,
  seedFollowupFixtures,
  sendJson,
} from "./_followup-helpers";

interface Tag {
  accessesUsed: number | null;
  accessesBudget: number | null;
}

describe("Etiqueta de invitado en el roster de una clase", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let env: InvitedUserEnv;
  let token: string;
  let inviterId: number;
  let scheduleId: number;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    token = await ownerToken(app);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    env = (await seedFollowupFixtures(ctx)).env;
    inviterId = (await createInviterWithCode(ctx)).id;
    scheduleId = (
      await insertActivityWithSchedule(app, { branchId: env.branchId })
    ).scheduleId;
  });

  async function book(userId: number): Promise<void> {
    await insertBooking(app, {
      memberId: userId,
      scheduleId,
      bookingDate: env.today,
    });
  }

  /** `memberId -> invitation` del roster de asistencia. */
  async function attendanceTags(): Promise<Map<number, Tag | null>> {
    const res = await sendJson(
      app,
      "GET",
      `/api/admin/attendance/slot/${scheduleId}/${env.today}`,
      token,
    );
    expect(res.statusCode, res.raw).toBe(200);
    const body = res.body as {
      members: Array<{ memberId: number; invitation: Tag | null }>;
    };
    return new Map(body.members.map((m) => [m.memberId, m.invitation]));
  }

  /** `memberId -> invitation` del detalle de slot (clases futuras). */
  async function detailTags(): Promise<Map<number, Tag | null>> {
    const res = await sendJson(
      app,
      "GET",
      `/api/admin/scheduling/schedules/${scheduleId}/detail?date=${env.today}`,
      token,
    );
    expect(res.statusCode, res.raw).toBe(200);
    const body = res.body as {
      bookings: Array<{ memberId: number; invitation?: Tag | null }>;
    };
    return new Map(
      body.bookings.map((b) => {
        // La clave tiene que viajar siempre (null o etiqueta): no puede faltar.
        expect(b, `booking de ${b.memberId}`).toHaveProperty("invitation");
        return [b.memberId, b.invitation ?? null];
      }),
    );
  }

  async function setUserStatus(
    userId: number,
    status: "prueba" | "activo",
  ): Promise<void> {
    await app.db
      .update(schema.users)
      .set({ status })
      .where(
        and(tenantWhere(schema.users, ctx.tenant), eq(schema.users.id, userId)),
      );
  }

  it("invitado que todavía no compró: accesos usados y presupuesto (en los dos rosters)", async () => {
    // 4 accesos, queda 1 -> usó 3.
    const invited = await createInvitedUser(ctx, env, inviterId, {
      budget: 4,
      remaining: 1,
    });
    await book(invited.userId);

    expect((await attendanceTags()).get(invited.userId)).toEqual({
      accessesUsed: 3,
      accessesBudget: 4,
    });
    expect((await detailTags()).get(invited.userId)).toEqual({
      accessesUsed: 3,
      accessesBudget: 4,
    });
  });

  it("nulo para un socio común, para un invitado ya convertido o fuera de prueba y para una invitación anulada", async () => {
    const regular = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    const converted = await createInvitedUser(ctx, env, inviterId, {
      converted: true,
    });
    const noLongerTrial = await createInvitedUser(ctx, env, inviterId, {});
    await setUserStatus(noLongerTrial.userId, "activo");
    const voided = await createInvitedUser(ctx, env, inviterId, {
      status: "voided",
    });
    for (const id of [
      regular.id,
      converted.userId,
      noLongerTrial.userId,
      voided.userId,
    ]) {
      await book(id);
    }

    for (const tags of [await attendanceTags(), await detailTags()]) {
      for (const id of [
        regular.id,
        converted.userId,
        noLongerTrial.userId,
        voided.userId,
      ]) {
        expect(tags.has(id), `alumno ${id} está en el roster`).toBe(true);
        expect(tags.get(id), `alumno ${id}`).toBeNull();
      }
    }
  });

  it("walk-in (asistencia sin reserva) de un invitado también lleva la etiqueta", async () => {
    const invited = await createInvitedUser(ctx, env, inviterId, {
      budget: 4,
      remaining: 4,
    });
    await app.db.insert(schema.attendance).values(
      tenantValues(ctx.tenant, {
        memberId: invited.userId,
        branchId: env.branchId,
        scheduleId,
        sessionDate: env.today,
        status: "confirmado" as const,
        source: "qr" as const,
      }),
    );

    expect((await attendanceTags()).get(invited.userId)).toEqual({
      accessesUsed: 0,
      accessesBudget: 4,
    });
  });

  it("con más de una invitación activa vale la más reciente", async () => {
    const invited = await createInvitedUser(ctx, env, inviterId, {
      budget: 4,
      remaining: 4,
      activatedDaysAgo: 20,
    });
    // Una invitación más nueva del mismo invitado, con otro cupo.
    const newerSub = await createAccessSub(ctx, {
      userId: invited.userId,
      planId: env.trialPlanId,
      branchId: env.branchId,
      budget: 6,
      remaining: 5,
    });
    await createInvitationRow(ctx, {
      inviterId,
      invitedUserId: invited.userId,
      branchId: env.branchId,
      subscriptionId: newerSub,
      activatedAt: new Date(),
    });
    await book(invited.userId);

    expect((await attendanceTags()).get(invited.userId)).toEqual({
      accessesUsed: 1,
      accessesBudget: 6,
    });
    expect((await detailTags()).get(invited.userId)).toEqual({
      accessesUsed: 1,
      accessesBudget: 6,
    });
  });

  it("varios alumnos en el mismo roster: cada uno con SU etiqueta", async () => {
    const a = await createInvitedUser(ctx, env, inviterId, {
      budget: 4,
      remaining: 4,
    });
    const b = await createInvitedUser(ctx, env, inviterId, {
      budget: 3,
      remaining: 1,
    });
    const regular = await createMemberInPhysicalBranch(ctx, {
      status: "activo",
    });
    for (const id of [a.userId, b.userId, regular.id]) await book(id);

    const tags = await attendanceTags();
    expect(tags.get(a.userId)).toEqual({ accessesUsed: 0, accessesBudget: 4 });
    expect(tags.get(b.userId)).toEqual({ accessesUsed: 2, accessesBudget: 3 });
    expect(tags.get(regular.id)).toBeNull();
  });
});
