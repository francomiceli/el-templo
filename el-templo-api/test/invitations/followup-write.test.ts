/**
 * Escritura del seguimiento de invitados:
 *   PATCH /api/admin/referrals/invitations/:invitationId/followup
 *   POST  /api/admin/referrals/invitations/:invitationId/notes
 *
 * Mismo cuerpo y mismas reglas que Renovaciones (se reusa su núcleo): `messageCount` 0-4,
 * `manualStatus`, motivo obligatorio y activo al pasar a `no_renovo` (400 `REASON_REQUIRED`),
 * limpieza del motivo al volver a `en_proceso`, audit en transacción. Además: sincronía con
 * `users.lead_status`, 409 sin sub de accesos y que Renovaciones NO ve estas filas.
 *
 * Los roles y el alcance por sede/país viven en `followup-roles.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { addDays } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import type { InvitationLeadRow } from "../../src/modules/referrals/invitation-lead-list";
import {
  createInvitedUser,
  createInviterWithCode,
  fixtureCtx,
  getAdminUserId,
  type InvitationsFixtureCtx,
  type InvitedUserEnv,
} from "./_helpers";
import {
  BASE,
  followupRow,
  getLeads,
  leadStatusOf,
  ownerToken,
  reasonIdByLabel,
  seedFollowupFixtures,
  sendJson,
  setLeadStatus,
} from "./_followup-helpers";

interface ErrorBody {
  error: string;
  message: string;
  code?: string;
}

describe("Seguimiento de invitados — PATCH followup y POST notes", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let env: InvitedUserEnv;
  let token: string;
  let inviterId: number;
  let inactiveReasonId: number;
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    token = await ownerToken(app);
    // Motivo DESACTIVADO propio (el catálogo sembrado no se toca).
    const [created] = await app.db
      .insert(schema.renewalReasons)
      .values(
        tenantValues(ctx.tenant, {
          label: `Inactivo ${suffix}`,
          isActive: false,
        }),
      )
      .$returningId();
    inactiveReasonId = created.id;
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.db
      .delete(schema.renewalReasons)
      .where(
        and(
          tenantWhere(schema.renewalReasons, ctx.tenant),
          eq(schema.renewalReasons.id, inactiveReasonId),
        ),
      );
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    env = (await seedFollowupFixtures(ctx)).env;
    inviterId = (await createInviterWithCode(ctx)).id;
  });

  async function patch(
    invitationId: number,
    payload: Record<string, unknown>,
    asToken: string = token,
  ) {
    return sendJson(
      app,
      "PATCH",
      `${BASE}/${invitationId}/followup`,
      asToken,
      payload,
    );
  }

  async function newInvited(
    spec: Parameters<typeof createInvitedUser>[3] = {},
  ) {
    return createInvitedUser(ctx, env, inviterId, spec);
  }

  // ─── PATCH: mensajes ───────────────────────────────────────────────────

  it("messageCount: devuelve la fila de la bandeja actualizada, guarda quién y cuándo, y escribe el audit", async () => {
    const invited = await newInvited({ expiresOffset: -1 });
    const adminId = await getAdminUserId(ctx);

    const res = await patch(invited.invitationId, { messageCount: 2 });

    expect(res.statusCode, res.raw).toBe(200);
    const row = res.body as InvitationLeadRow;
    expect(row.invitationId).toBe(invited.invitationId);
    expect(row.followStatus).toBe("para_contactar");
    expect(row.followup.subscriptionId).toBe(invited.subscriptionId);
    expect(row.followup.messageCount).toBe(2);
    expect(row.followup.lastMessageAt).toEqual(expect.any(String));

    // Se guardó sobre la sub de accesos y el invitado, con el actor.
    const stored = await followupRow(ctx, invited.subscriptionId);
    expect(stored).toMatchObject({
      subscriptionId: invited.subscriptionId,
      userId: invited.userId,
      messageCount: 2,
      manualStatus: "en_proceso",
      updatedBy: adminId,
    });

    // Audit con acción propia de invitaciones (no la de Renovaciones).
    const audit = await app.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, ctx.tenant),
          eq(schema.auditLog.targetKind, "renewal_followup"),
          eq(schema.auditLog.targetId, stored.id),
        ),
      );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "invitation_followup_updated",
      actorId: adminId,
    });
  });

  it("messageCount 0-4 válido; fuera de rango (5, -1) o no entero -> 400", async () => {
    const invited = await newInvited();
    for (const messageCount of [0, 1, 2, 3, 4]) {
      const ok = await patch(invited.invitationId, { messageCount });
      expect(ok.statusCode, `messageCount=${messageCount}: ${ok.raw}`).toBe(
        200,
      );
      expect((ok.body as InvitationLeadRow).followup.messageCount).toBe(
        messageCount,
      );
    }
    for (const messageCount of [5, -1, 1.5]) {
      const bad = await patch(invited.invitationId, { messageCount });
      expect(bad.statusCode, `messageCount=${messageCount}`).toBe(400);
    }
    expect(
      (await patch(invited.invitationId, { manualStatus: "perdido" }))
        .statusCode,
    ).toBe(400);
  });

  it("lastMessageAt solo se mueve cuando el contador cambia", async () => {
    const invited = await newInvited();
    const first = await patch(invited.invitationId, { messageCount: 1 });
    const firstAt = (first.body as InvitationLeadRow).followup.lastMessageAt;
    expect(firstAt).not.toBeNull();

    // Mismo contador: no cuenta como un mensaje nuevo.
    const same = await patch(invited.invitationId, { messageCount: 1 });
    expect((same.body as InvitationLeadRow).followup.lastMessageAt).toBe(
      firstAt,
    );
  });

  // ─── PATCH: motivo ─────────────────────────────────────────────────────

  describe("no_renovo exige un motivo activo (400 REASON_REQUIRED)", () => {
    it("sin motivo, con reasonId null, inexistente o inactivo -> 400 con code", async () => {
      const invited = await newInvited();
      const attempts: Array<Record<string, unknown>> = [
        { manualStatus: "no_renovo" },
        { manualStatus: "no_renovo", reasonId: null },
        { manualStatus: "no_renovo", reasonId: 2_000_000_000 },
        { manualStatus: "no_renovo", reasonId: inactiveReasonId },
      ];
      for (const payload of attempts) {
        const res = await patch(invited.invitationId, payload);
        expect(res.statusCode, JSON.stringify(payload)).toBe(400);
        expect((res.body as ErrorBody).code).toBe("REASON_REQUIRED");
      }
      // Nada se guardó.
      expect(await followupRow(ctx, invited.subscriptionId)).toBeUndefined();
    });

    it("con un motivo activo: pasa a no_sigue y la fila trae la etiqueta y la nota del motivo", async () => {
      const invited = await newInvited();
      const reasonId = await reasonIdByLabel(ctx, "Precio");

      const res = await patch(invited.invitationId, {
        manualStatus: "no_renovo",
        reasonId,
        reasonNote: "Lo ve caro",
      });

      expect(res.statusCode, res.raw).toBe(200);
      const row = res.body as InvitationLeadRow;
      expect(row.followStatus).toBe("no_sigue");
      expect(row.followup).toMatchObject({
        manualStatus: "no_renovo",
        reasonId,
        reasonLabel: "Precio",
        reasonNote: "Lo ve caro",
      });
    });

    it("volver a en_proceso limpia el motivo y la nota (sin importar lo que venga en el body)", async () => {
      const invited = await newInvited();
      const reasonId = await reasonIdByLabel(ctx, "Viaje");
      await patch(invited.invitationId, {
        manualStatus: "no_renovo",
        reasonId,
        reasonNote: "Se va de viaje",
      });

      const res = await patch(invited.invitationId, {
        manualStatus: "en_proceso",
        reasonId,
        reasonNote: "no debería guardarse",
      });

      expect(res.statusCode, res.raw).toBe(200);
      const row = res.body as InvitationLeadRow;
      expect(row.followStatus).toBe("con_accesos");
      expect(row.followup).toMatchObject({
        manualStatus: "en_proceso",
        reasonId: null,
        reasonLabel: null,
        reasonNote: null,
      });
      const stored = await followupRow(ctx, invited.subscriptionId);
      expect(stored?.reasonId).toBeNull();
      expect(stored?.reasonNote).toBeNull();
    });

    it("un PATCH que solo mueve el contador sobre una fila en no_renovo conserva el motivo", async () => {
      const invited = await newInvited();
      const reasonId = await reasonIdByLabel(ctx, "Otro");
      await patch(invited.invitationId, {
        manualStatus: "no_renovo",
        reasonId,
      });

      const res = await patch(invited.invitationId, { messageCount: 3 });

      expect(res.statusCode, res.raw).toBe(200);
      expect((res.body as InvitationLeadRow).followup).toMatchObject({
        manualStatus: "no_renovo",
        reasonId,
        messageCount: 3,
      });
    });
  });

  // ─── PATCH: errores ────────────────────────────────────────────────────

  it("409 con mensaje claro si la invitación no tiene sub de accesos", async () => {
    const invited = await newInvited();
    await app.db
      .update(schema.invitations)
      .set({ subscriptionId: null })
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          eq(schema.invitations.id, invited.invitationId),
        ),
      );

    const res = await patch(invited.invitationId, { messageCount: 1 });

    expect(res.statusCode).toBe(409);
    expect((res.body as ErrorBody).message).toMatch(/suscripci/i);
    expect(await followupRow(ctx, invited.subscriptionId)).toBeUndefined();
  });

  it("404 si la invitación no existe o está anulada (y no escribe nada)", async () => {
    const voided = await newInvited({ status: "voided" });

    expect((await patch(2_000_000_000, { messageCount: 1 })).statusCode).toBe(
      404,
    );
    const res = await patch(voided.invitationId, { messageCount: 1 });
    expect(res.statusCode).toBe(404);
    expect(await followupRow(ctx, voided.subscriptionId)).toBeUndefined();
  });

  it("validación de params: invitationId no numérico -> 400; sin token -> 401", async () => {
    expect(
      (await sendJson(app, "PATCH", `${BASE}/abc/followup`, token, {}))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await sendJson(app, "PATCH", `${BASE}/1/followup`, null, {
          messageCount: 1,
        })
      ).statusCode,
    ).toBe(401);
  });

  // ─── Sincronía con el lead ─────────────────────────────────────────────

  describe("sincronía con users.lead_status (misma transacción)", () => {
    it("no_renovo y no compró -> perdido; volver a en_proceso -> en_seguimiento", async () => {
      const invited = await newInvited();
      await setLeadStatus(ctx, invited.userId, "en_seguimiento");
      const reasonId = await reasonIdByLabel(ctx, "Precio");

      const closed = await patch(invited.invitationId, {
        manualStatus: "no_renovo",
        reasonId,
      });
      expect(closed.statusCode, closed.raw).toBe(200);
      expect(await leadStatusOf(ctx, invited.userId)).toBe("perdido");
      // La fila de la bandeja ya lo trae actualizado.
      expect((closed.body as InvitationLeadRow).leadStatus).toBe("perdido");
      // Misma regla que el PATCH manual del lead: queda marcado como edición manual.
      const [user] = await app.db
        .select({ source: schema.users.leadStatusSource })
        .from(schema.users)
        .where(
          and(
            tenantWhere(schema.users, ctx.tenant),
            eq(schema.users.id, invited.userId),
          ),
        );
      expect(user?.source).toBe("manual");

      const reopened = await patch(invited.invitationId, {
        manualStatus: "en_proceso",
      });
      expect(reopened.statusCode, reopened.raw).toBe(200);
      expect(await leadStatusOf(ctx, invited.userId)).toBe("en_seguimiento");
      expect((reopened.body as InvitationLeadRow).leadStatus).toBe(
        "en_seguimiento",
      );
    });

    it("un lead ganado (con plan comprado) nunca se toca", async () => {
      const invited = await newInvited();
      await setLeadStatus(ctx, invited.userId, "ganado", env.membershipPlanId);

      const res = await patch(invited.invitationId, {
        manualStatus: "no_renovo",
        reasonId: await reasonIdByLabel(ctx, "Otro"),
      });

      expect(res.statusCode, res.raw).toBe(200);
      expect(await leadStatusOf(ctx, invited.userId)).toBe("ganado");
    });

    it("si el invitado compró (dentro o fuera de la ventana de compra tardía), el lead no se pierde", async () => {
      const comproTarde = await newInvited({ purchase: "vigente" });
      const convertido = await newInvited({ converted: true });
      for (const invited of [comproTarde, convertido]) {
        await setLeadStatus(ctx, invited.userId, "en_seguimiento");
        const res = await patch(invited.invitationId, {
          manualStatus: "no_renovo",
          reasonId: await reasonIdByLabel(ctx, "Otro"),
        });
        expect(res.statusCode, res.raw).toBe(200);
        expect(await leadStatusOf(ctx, invited.userId)).toBe("en_seguimiento");
      }
      // El estado de seguimiento sigue mostrando que compró.
      const page = await getLeads(app, token);
      const byId = new Map(page.body.rows.map((r) => [r.invitationId, r]));
      expect(byId.get(comproTarde.invitationId)?.followStatus).toBe(
        "compro_tarde",
      );
      expect(byId.get(convertido.invitationId)?.followStatus).toBe("compro");
    });

    it("solo actúa en la transición: mover el contador no pisa un lead_status cambiado a mano", async () => {
      const invited = await newInvited();
      await setLeadStatus(ctx, invited.userId, "en_seguimiento");
      await patch(invited.invitationId, {
        manualStatus: "no_renovo",
        reasonId: await reasonIdByLabel(ctx, "Precio"),
      });
      expect(await leadStatusOf(ctx, invited.userId)).toBe("perdido");
      // Alguien reabre el lead a mano (PATCH /api/admin/leads/:userId).
      await setLeadStatus(ctx, invited.userId, "en_seguimiento");

      const res = await patch(invited.invitationId, { messageCount: 2 });

      expect(res.statusCode, res.raw).toBe(200);
      expect(await leadStatusOf(ctx, invited.userId)).toBe("en_seguimiento");
    });

    it("volver a en_proceso no toca un lead que no estaba perdido", async () => {
      const invited = await newInvited();
      await setLeadStatus(ctx, invited.userId, "en_seguimiento");
      await patch(invited.invitationId, {
        manualStatus: "no_renovo",
        reasonId: await reasonIdByLabel(ctx, "Precio"),
      });
      await setLeadStatus(ctx, invited.userId, "ganado", env.membershipPlanId);

      const res = await patch(invited.invitationId, {
        manualStatus: "en_proceso",
      });

      expect(res.statusCode, res.raw).toBe(200);
      expect(await leadStatusOf(ctx, invited.userId)).toBe("ganado");
    });
  });

  // ─── Renovaciones no ve estas filas ────────────────────────────────────

  it("la fila de seguimiento de una sub de invitación NO aparece en GET /api/admin/renewals (ni se puede tocar desde ahí)", async () => {
    // Plazo vencido ayer: caería en la ventana de vencimientos si Renovaciones listara trials.
    const invited = await newInvited({ expiresOffset: -1 });
    const reasonId = await reasonIdByLabel(ctx, "Precio");
    const res = await patch(invited.invitationId, {
      messageCount: 1,
      manualStatus: "no_renovo",
      reasonId,
    });
    expect(res.statusCode, res.raw).toBe(200);
    expect(await followupRow(ctx, invited.subscriptionId)).toBeDefined();

    const list = await sendJson(
      app,
      "GET",
      `/api/admin/renewals?dateFrom=${addDays(env.today, -30)}&dateTo=${addDays(env.today, 30)}`,
      token,
    );
    expect(list.statusCode, list.raw).toBe(200);
    const body = list.body as {
      rows: Array<{ subscriptionId: number; userId: number }>;
    };
    expect(
      body.rows.some(
        (r) =>
          r.subscriptionId === invited.subscriptionId ||
          r.userId === invited.userId,
      ),
    ).toBe(false);

    const viaRenewals = await sendJson(
      app,
      "PATCH",
      `/api/admin/renewals/${invited.subscriptionId}`,
      token,
      { messageCount: 3 },
    );
    expect(viaRenewals.statusCode).toBe(404);
  });

  // ─── Notas ─────────────────────────────────────────────────────────────

  describe("POST /invitations/:invitationId/notes", () => {
    it("crea la nota del invitado (autor = el actor) y la bandeja la trae como lastNote", async () => {
      const invited = await newInvited();
      const adminId = await getAdminUserId(ctx);

      const res = await sendJson(
        app,
        "POST",
        `${BASE}/${invited.invitationId}/notes`,
        token,
        { content: "Quiere probar la clase de las 19" },
      );

      expect(res.statusCode, res.raw).toBe(201);
      expect(res.body).toMatchObject({
        userId: invited.userId,
        authorId: adminId,
        content: "Quiere probar la clase de las 19",
      });
      const stored = await app.db
        .select({ userId: schema.memberNotes.userId })
        .from(schema.memberNotes)
        .where(
          and(
            tenantWhere(schema.memberNotes, ctx.tenant),
            eq(schema.memberNotes.userId, invited.userId),
          ),
        );
      expect(stored).toHaveLength(1);

      const [row] = (await getLeads(app, token)).body.rows;
      expect(row.lastNote?.content).toBe("Quiere probar la clase de las 19");
    });

    it("contenido vacío o mayor a 2000 caracteres -> 400; invitación inexistente o anulada -> 404", async () => {
      const invited = await newInvited();
      const voided = await newInvited({ status: "voided" });
      const url = (id: number) => `${BASE}/${id}/notes`;

      expect(
        (
          await sendJson(app, "POST", url(invited.invitationId), token, {
            content: "",
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await sendJson(app, "POST", url(invited.invitationId), token, {
            content: "x".repeat(2001),
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await sendJson(app, "POST", url(2_000_000_000), token, {
            content: "hola",
          })
        ).statusCode,
      ).toBe(404);
      const onVoided = await sendJson(
        app,
        "POST",
        url(voided.invitationId),
        token,
        {
          content: "hola",
        },
      );
      expect(onVoided.statusCode).toBe(404);
      const notes = await app.db
        .select({ id: schema.memberNotes.id })
        .from(schema.memberNotes)
        .where(
          and(
            tenantWhere(schema.memberNotes, ctx.tenant),
            eq(schema.memberNotes.userId, voided.userId),
          ),
        );
      expect(notes).toHaveLength(0);
    });
  });
});
