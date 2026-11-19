/**
 * Roles y alcance del seguimiento de invitados bajo `/api/admin/referrals`:
 *
 *   - Seguimiento (`INVITATION_FOLLOWUP_ROLES`: gestion, admin_sede, admin, owner) en las 4
 *     rutas: bandeja, `pending-count`, `PATCH .../followup` y `POST .../notes`. Recepción y
 *     coach -> 403; sin token -> 401.
 *   - `admin_sede` ve y opera SOLO las invitaciones de sus sedes (`invitations.branch_id`):
 *     lectura acotada, escritura sobre otra sede -> 404 indistinguible de una inexistente.
 *   - gestión/admin quedan acotados a su país; el owner ve todo.
 *   - Los reportes agregados (`GET /ab-results`, `GET /invitations/report`) siguen EXACTAMENTE
 *     como antes: gestion/admin/owner, y `admin_sede` -> 403.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { todayInTz } from "../../src/modules/shared/date-utils";
import { tenantWhere } from "../../src/modules/shared/tenant";
import {
  createInvitedUser,
  createInviterWithCode,
  ensurePhysicalBranch,
  fixtureCtx,
  type InvitationsFixtureCtx,
  type InvitedUserEnv,
} from "./_helpers";
import {
  BASE,
  createExtraBranch,
  createStaffToken,
  followupRow,
  getLeads,
  getPendingCount,
  ownerToken,
  seedFollowupFixtures,
  sendJson,
} from "./_followup-helpers";

describe("Seguimiento de invitados — roles y alcance", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let env: InvitedUserEnv;
  let arTimezone: string;
  let branchA: number;
  let branchB: number;
  let branchEs: number;
  /** Invitaciones en `para_contactar`, una por sede. */
  let invA: Awaited<ReturnType<typeof createInvitedUser>>;
  let invB: Awaited<ReturnType<typeof createInvitedUser>>;
  let invEs: Awaited<ReturnType<typeof createInvitedUser>>;
  let owner: string;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    owner = await ownerToken(app);
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const fixtures = await seedFollowupFixtures(ctx);
    env = fixtures.env;
    arTimezone = fixtures.arTimezone;
    branchA = env.branchId;
    branchB = await createExtraBranch(ctx, {
      country: "AR",
      timezone: arTimezone,
    });
    const es = await ensurePhysicalBranch(ctx, "ES");
    branchEs = es.id;

    const arInviter = await createInviterWithCode(ctx);
    const esInviter = await createInviterWithCode(ctx, { country: "ES" });
    // Las tres con plazo vencido ayer: las tres son `para_contactar`.
    const late = { expiresOffset: -1 };
    invA = await createInvitedUser(ctx, env, arInviter.id, late);
    invB = await createInvitedUser(
      ctx,
      { ...env, branchId: branchB },
      arInviter.id,
      late,
    );
    invEs = await createInvitedUser(
      ctx,
      { ...env, branchId: branchEs, today: todayInTz(es.timezone) },
      esInviter.id,
      late,
    );
  });

  const staff = (
    role: Parameters<typeof createStaffToken>[1],
    opts: Partial<Parameters<typeof createStaffToken>[2]> = {},
  ) => createStaffToken(ctx, role, { branchId: branchA, ...opts });

  const ids = (page: { rows: Array<{ invitationId: number }> }): number[] =>
    page.rows.map((r) => r.invitationId).sort((x, y) => x - y);
  const sorted = (...xs: number[]) => xs.sort((x, y) => x - y);

  // ─── Recepción y coach ─────────────────────────────────────────────────

  it("recepción y coach reciben 403 en las 4 rutas, sin escribir nada; sin token 401", async () => {
    for (const role of ["recepcion", "coach"] as const) {
      const token = await staff(role);
      const calls = [
        sendJson(app, "GET", BASE, token),
        sendJson(app, "GET", `${BASE}/pending-count`, token),
        sendJson(app, "PATCH", `${BASE}/${invA.invitationId}/followup`, token, {
          messageCount: 1,
        }),
        sendJson(app, "POST", `${BASE}/${invA.invitationId}/notes`, token, {
          content: "hola",
        }),
      ];
      const results = await Promise.all(calls);
      expect(
        results.map((r) => r.statusCode),
        role,
      ).toEqual([403, 403, 403, 403]);
    }
    expect(await followupRow(ctx, invA.subscriptionId)).toBeUndefined();

    for (const [method, url] of [
      ["GET", BASE],
      ["GET", `${BASE}/pending-count`],
      ["PATCH", `${BASE}/${invA.invitationId}/followup`],
      ["POST", `${BASE}/${invA.invitationId}/notes`],
    ] as const) {
      expect((await sendJson(app, method, url, null, {})).statusCode, url).toBe(
        401,
      );
    }
  });

  // ─── admin_sede ────────────────────────────────────────────────────────

  describe("admin_sede: solo las invitaciones de SUS sedes", () => {
    it("bandeja: ve únicamente las de su sede; branchId de otra sede da una página vacía (no 403)", async () => {
      const sede = await staff("admin_sede");

      const all = await getLeads(app, sede);
      expect(all.statusCode).toBe(200);
      expect(ids(all.body)).toEqual([invA.invitationId]);
      expect(all.body.total).toBe(1);

      expect(
        ids((await getLeads(app, sede, `?branchId=${branchA}`)).body),
      ).toEqual([invA.invitationId]);
      const other = await getLeads(app, sede, `?branchId=${branchB}`);
      expect(other.statusCode).toBe(200);
      expect(other.body).toMatchObject({ total: 0, rows: [] });
      const foreign = await getLeads(app, sede, `?branchId=${branchEs}`);
      expect(foreign.statusCode).toBe(200);
      expect(foreign.body.total).toBe(0);
    });

    it("admin_sede de varias sedes ve las suyas y puede filtrar por una", async () => {
      const sede = await staff("admin_sede", { extraBranchIds: [branchB] });

      expect(ids((await getLeads(app, sede)).body)).toEqual(
        sorted(invA.invitationId, invB.invitationId),
      );
      expect(
        ids((await getLeads(app, sede, `?branchId=${branchB}`)).body),
      ).toEqual([invB.invitationId]);
    });

    it("pending-count: cuenta solo las de su sede", async () => {
      const sede = await staff("admin_sede");
      const both = await staff("admin_sede", { extraBranchIds: [branchB] });

      expect((await getPendingCount(app, sede)).body).toEqual({
        open: 1,
        uncontacted: 1,
      });
      expect((await getPendingCount(app, both)).body).toEqual({
        open: 2,
        uncontacted: 2,
      });
    });

    it("PATCH followup: 200 sobre su sede; 404 sobre otra sede (y no escribe), indistinguible de una inexistente", async () => {
      const sede = await staff("admin_sede");

      const own = await sendJson(
        app,
        "PATCH",
        `${BASE}/${invA.invitationId}/followup`,
        sede,
        { messageCount: 1 },
      );
      expect(own.statusCode, own.raw).toBe(200);
      expect((await followupRow(ctx, invA.subscriptionId))?.messageCount).toBe(
        1,
      );

      const foreign = await sendJson(
        app,
        "PATCH",
        `${BASE}/${invB.invitationId}/followup`,
        sede,
        { messageCount: 1 },
      );
      const missing = await sendJson(
        app,
        "PATCH",
        `${BASE}/2000000000/followup`,
        sede,
        { messageCount: 1 },
      );
      expect(foreign.statusCode).toBe(404);
      expect(foreign.body).toEqual(missing.body);
      expect(await followupRow(ctx, invB.subscriptionId)).toBeUndefined();
      // Otro PAÍS del mismo gimnasio: también 404.
      const spain = await sendJson(
        app,
        "PATCH",
        `${BASE}/${invEs.invitationId}/followup`,
        sede,
        { messageCount: 1 },
      );
      expect(spain.statusCode).toBe(404);
      expect(await followupRow(ctx, invEs.subscriptionId)).toBeUndefined();
    });

    it("POST notes: 201 sobre su sede; 404 sobre otra sede (y no escribe la nota)", async () => {
      const sede = await staff("admin_sede");

      const own = await sendJson(
        app,
        "POST",
        `${BASE}/${invA.invitationId}/notes`,
        sede,
        { content: "Llamar mañana" },
      );
      expect(own.statusCode, own.raw).toBe(201);

      const foreign = await sendJson(
        app,
        "POST",
        `${BASE}/${invB.invitationId}/notes`,
        sede,
        { content: "No debería guardarse" },
      );
      expect(foreign.statusCode).toBe(404);
      const notes = await app.db
        .select({ id: schema.memberNotes.id })
        .from(schema.memberNotes)
        .where(
          and(
            tenantWhere(schema.memberNotes, ctx.tenant),
            eq(schema.memberNotes.userId, invB.userId),
          ),
        );
      expect(notes).toHaveLength(0);
    });

    it("sin ninguna sede asignada no ve nada ni puede escribir", async () => {
      const sede = await staff("admin_sede");
      await app.db
        .delete(schema.userBranches)
        .where(tenantWhere(schema.userBranches, ctx.tenant));

      const page = await getLeads(app, sede);
      expect(page.statusCode).toBe(200);
      expect(page.body).toMatchObject({ total: 0, rows: [] });
      expect((await getPendingCount(app, sede)).body).toEqual({
        open: 0,
        uncontacted: 0,
      });
      const res = await sendJson(
        app,
        "PATCH",
        `${BASE}/${invA.invitationId}/followup`,
        sede,
        { messageCount: 1 },
      );
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── gestión / admin: por país ─────────────────────────────────────────

  describe("gestión: acotada por país; owner ve todo", () => {
    it("bandeja y contador: gestión AR ve las 2 de Argentina, gestión ES la de España, owner las 3", async () => {
      const gestionAr = await staff("gestion", { country: "AR" });
      const gestionEs = await staff("gestion", {
        country: "ES",
        branchId: branchEs,
      });

      const ar = await getLeads(app, gestionAr);
      expect(ar.statusCode).toBe(200);
      expect(ids(ar.body)).toEqual(
        sorted(invA.invitationId, invB.invitationId),
      );
      expect(ids((await getLeads(app, gestionEs)).body)).toEqual([
        invEs.invitationId,
      ]);
      expect(ids((await getLeads(app, owner)).body)).toEqual(
        sorted(invA.invitationId, invB.invitationId, invEs.invitationId),
      );

      expect((await getPendingCount(app, gestionAr)).body.open).toBe(2);
      expect((await getPendingCount(app, gestionEs)).body.open).toBe(1);
      expect((await getPendingCount(app, owner)).body.open).toBe(3);
    });

    it("escrituras: gestión opera su país (cualquier sede) y recibe 404 sobre el otro país", async () => {
      const gestionAr = await staff("gestion", { country: "AR" });

      const ok = await sendJson(
        app,
        "PATCH",
        `${BASE}/${invB.invitationId}/followup`,
        gestionAr,
        { messageCount: 2 },
      );
      expect(ok.statusCode, ok.raw).toBe(200);

      const foreign = await sendJson(
        app,
        "PATCH",
        `${BASE}/${invEs.invitationId}/followup`,
        gestionAr,
        { messageCount: 2 },
      );
      expect(foreign.statusCode).toBe(404);
      expect(await followupRow(ctx, invEs.subscriptionId)).toBeUndefined();
      const note = await sendJson(
        app,
        "POST",
        `${BASE}/${invEs.invitationId}/notes`,
        gestionAr,
        { content: "otro país" },
      );
      expect(note.statusCode).toBe(404);
    });

    it("el owner opera cualquier sede de cualquier país", async () => {
      for (const inv of [invA, invB, invEs]) {
        const res = await sendJson(
          app,
          "PATCH",
          `${BASE}/${inv.invitationId}/followup`,
          owner,
          { messageCount: 1 },
        );
        expect(res.statusCode, res.raw).toBe(200);
      }
    });
  });

  // ─── Reportes agregados: sin cambios ───────────────────────────────────

  it("GET /ab-results y GET /invitations/report siguen igual: gestion/admin/owner 200; admin_sede, recepción y coach 403", async () => {
    const reports = ["/api/admin/referrals/ab-results", `${BASE}/report`];
    for (const url of reports) {
      expect((await sendJson(app, "GET", url, owner)).statusCode, url).toBe(
        200,
      );
      expect(
        (await sendJson(app, "GET", url, await staff("gestion"))).statusCode,
        url,
      ).toBe(200);
      for (const role of ["admin_sede", "recepcion", "coach"] as const) {
        expect(
          (await sendJson(app, "GET", url, await staff(role))).statusCode,
          `${role} ${url}`,
        ).toBe(403);
      }
      expect((await sendJson(app, "GET", url, null)).statusCode, url).toBe(401);
    }
  });
});
