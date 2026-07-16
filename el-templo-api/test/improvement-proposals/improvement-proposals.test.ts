/**
 * Integration tests for the improvement-proposals module.
 *
 * Endpoints:
 *  - GET  /api/members/improvement-proposals/prompt-status
 *  - POST /api/members/improvement-proposals          (submit)
 *  - GET  /api/admin/improvement-proposals            (listado con filtros)
 *  - GET  /api/admin/improvement-proposals/export     (xlsx)
 *
 * Coverage:
 *  - Submit: 201, la sucursal sale de users.branch_id (el cliente no la manda),
 *    el texto se trimea; texto en blanco → 400.
 *  - Anti-spam: 3 envíos en la ventana de 24h pasan, el 4to → 400.
 *  - Prompt-status: shouldPrompt true sin envíos, false después del primero.
 *  - Roles: member y coach → 403 en el listado admin; gestion y owner → 200.
 *  - Country scope: gestion AR no ve propuestas de sedes ES; owner ve todo.
 *  - Filtros: sucursal, keyword literal (escape de %), rango de fechas.
 *  - Paginación: total estable, páginas disjuntas.
 *  - Export: 200 con content-type xlsx y filename propuestas-mejora.
 *
 * Runs against the per-worker test MySQL DB. The suite runs in CI on push;
 * locally only `pnpm exec tsc --noEmit` is run.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";

const MEMBER_BASE = "/api/members/improvement-proposals";
const ADMIN_BASE = "/api/admin/improvement-proposals";

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

interface SeededContext {
  arBranchId: number;
  esBranchId: number;
  ownerToken: string;
  gestionArToken: string;
  coachArToken: string;
  memberArId: number;
  memberArToken: string;
  memberEsToken: string;
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-Proposals-Test",
      code: nextSuffix("ARP"),
      country: "AR",
      isVirtual: false,
      isActive: true,
      timezone: "America/Argentina/Buenos_Aires",
    })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-Proposals-Test",
      code: nextSuffix("ESP"),
      country: "ES",
      isVirtual: false,
      isActive: true,
      timezone: "Europe/Madrid",
    })
    .$returningId();

  await createStaffUser(app, {
    email: "owner-proposals@test.com",
    password: "owner-pass-123",
    firstName: "Owner",
    lastName: "Boss",
    role: "owner",
    branchId: ar.id,
  });
  const ownerToken = await getAuthToken(
    app,
    "owner-proposals@test.com",
    "owner-pass-123",
  );

  await createStaffUser(app, {
    email: "gestion-ar-proposals@test.com",
    password: "gestion-pass-123",
    firstName: "Gaby",
    lastName: "Gestion",
    role: "gestion",
    branchId: ar.id,
  });
  const gestionArToken = await getAuthToken(
    app,
    "gestion-ar-proposals@test.com",
    "gestion-pass-123",
  );

  await createStaffUser(app, {
    email: "coach-ar-proposals@test.com",
    password: "coach-pass-123",
    firstName: "Carlos",
    lastName: "Profe",
    role: "coach",
    branchId: ar.id,
  });
  const coachArToken = await getAuthToken(
    app,
    "coach-ar-proposals@test.com",
    "coach-pass-123",
  );

  const memberAr = await registerUser(app, {
    email: "member-ar-proposals@test.com",
    password: "member-pass-123",
    firstName: "Mati",
    lastName: "Alumno",
    branchId: ar.id,
  });
  const memberEs = await registerUser(app, {
    email: "member-es-proposals@test.com",
    password: "member-pass-123",
    firstName: "Elena",
    lastName: "Alumna",
    branchId: es.id,
  });

  return {
    arBranchId: ar.id,
    esBranchId: es.id,
    ownerToken,
    gestionArToken,
    coachArToken,
    memberArId: (memberAr.user as { id: number }).id,
    memberArToken: memberAr.token,
    memberEsToken: memberEs.token,
  };
}

async function submitProposal(
  app: FastifyInstance,
  token: string,
  proposal: string,
): Promise<number> {
  const res = await app.inject({
    method: "POST",
    url: MEMBER_BASE,
    headers: { authorization: `Bearer ${token}` },
    payload: { proposal },
  });
  return res.statusCode;
}

describe("improvement-proposals", () => {
  let app: FastifyInstance;
  let ctx: SeededContext;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    ctx = await seedFixtures(app);
  });

  describe("member submit", () => {
    it("inserts the proposal with the member's branch resolved server-side", async () => {
      const status = await submitProposal(
        app,
        ctx.memberArToken,
        "  Más barras paralelas por favor  ",
      );
      expect(status).toBe(201);

      const rows = await app.db
        .select()
        .from(schema.improvementProposals)
        .where(eq(schema.improvementProposals.memberId, ctx.memberArId));
      expect(rows).toHaveLength(1);
      expect(rows[0].branchId).toBe(ctx.arBranchId);
      expect(rows[0].proposal).toBe("Más barras paralelas por favor");
    });

    it("rejects whitespace-only proposals", async () => {
      const status = await submitProposal(app, ctx.memberArToken, "   ");
      expect(status).toBe(400);
    });

    it("allows 3 proposals per 24h window and rejects the 4th", async () => {
      expect(await submitProposal(app, ctx.memberArToken, "Idea 1")).toBe(201);
      expect(await submitProposal(app, ctx.memberArToken, "Idea 2")).toBe(201);
      expect(await submitProposal(app, ctx.memberArToken, "Idea 3")).toBe(201);

      const res = await app.inject({
        method: "POST",
        url: MEMBER_BASE,
        headers: { authorization: `Bearer ${ctx.memberArToken}` },
        payload: { proposal: "Idea 4" },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain("propuestas");

      // El límite es por socio: otro socio sigue pudiendo enviar.
      expect(await submitProposal(app, ctx.memberEsToken, "Otra idea")).toBe(
        201,
      );
    });

    it("requires authentication", async () => {
      const res = await app.inject({
        method: "POST",
        url: MEMBER_BASE,
        payload: { proposal: "Sin token" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("prompt-status", () => {
    it("prompts until the member submits, then stops", async () => {
      const before = await app.inject({
        method: "GET",
        url: `${MEMBER_BASE}/prompt-status`,
        headers: { authorization: `Bearer ${ctx.memberArToken}` },
      });
      expect(before.statusCode).toBe(200);
      const beforeBody = JSON.parse(before.body);
      expect(beforeBody.shouldPrompt).toBe(true);
      expect(beforeBody.campaign).toBeGreaterThanOrEqual(1);

      await submitProposal(app, ctx.memberArToken, "Ya participé");

      const after = await app.inject({
        method: "GET",
        url: `${MEMBER_BASE}/prompt-status`,
        headers: { authorization: `Bearer ${ctx.memberArToken}` },
      });
      expect(JSON.parse(after.body).shouldPrompt).toBe(false);
    });

    it("is per-member: another member's submit does not silence the prompt", async () => {
      await submitProposal(app, ctx.memberEsToken, "Propuesta ajena");

      const res = await app.inject({
        method: "GET",
        url: `${MEMBER_BASE}/prompt-status`,
        headers: { authorization: `Bearer ${ctx.memberArToken}` },
      });
      expect(JSON.parse(res.body).shouldPrompt).toBe(true);
    });
  });

  describe("admin list — roles y scope", () => {
    it("rejects member and coach, accepts gestion and owner", async () => {
      for (const [token, expected] of [
        [ctx.memberArToken, 403],
        [ctx.coachArToken, 403],
        [ctx.gestionArToken, 200],
        [ctx.ownerToken, 200],
      ] as const) {
        const res = await app.inject({
          method: "GET",
          url: ADMIN_BASE,
          headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(expected);
      }
    });

    it("owner sees all branches; gestion AR only sees AR proposals", async () => {
      await submitProposal(app, ctx.memberArToken, "Propuesta argentina");
      await submitProposal(app, ctx.memberEsToken, "Propuesta española");

      const ownerRes = await app.inject({
        method: "GET",
        url: ADMIN_BASE,
        headers: { authorization: `Bearer ${ctx.ownerToken}` },
      });
      const ownerBody = JSON.parse(ownerRes.body);
      expect(ownerBody.total).toBe(2);

      const gestionRes = await app.inject({
        method: "GET",
        url: ADMIN_BASE,
        headers: { authorization: `Bearer ${ctx.gestionArToken}` },
      });
      const gestionBody = JSON.parse(gestionRes.body);
      expect(gestionBody.total).toBe(1);
      expect(gestionBody.rows[0].proposal).toBe("Propuesta argentina");
      expect(gestionBody.rows[0].memberName).toBe("Mati Alumno");
      expect(gestionBody.rows[0].branchName).toBe("AR-Proposals-Test");
    });
  });

  describe("admin list — filtros", () => {
    beforeEach(async () => {
      await submitProposal(app, ctx.memberArToken, "Faltan barras paralelas");
      await submitProposal(app, ctx.memberArToken, "Más horarios a la mañana");
      await submitProposal(app, ctx.memberEsToken, "Paralelas nuevas en ES");
    });

    async function listAsOwner(qs: string): Promise<{
      total: number;
      rows: Array<{ proposal: string; branchName: string }>;
    }> {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_BASE}${qs}`,
        headers: { authorization: `Bearer ${ctx.ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      return JSON.parse(res.body);
    }

    it("filters by branch", async () => {
      const body = await listAsOwner(`?branchId=${ctx.esBranchId}`);
      expect(body.total).toBe(1);
      expect(body.rows[0].proposal).toBe("Paralelas nuevas en ES");
    });

    it("filters by keyword across branches", async () => {
      const body = await listAsOwner("?q=paralelas");
      expect(body.total).toBe(2);
      const proposals = body.rows.map((r) => r.proposal).sort();
      expect(proposals).toEqual([
        "Faltan barras paralelas",
        "Paralelas nuevas en ES",
      ]);
    });

    it("treats LIKE metacharacters in the keyword literally", async () => {
      // "%" como wildcard matchearía todo; escapado no matchea nada.
      const body = await listAsOwner("?q=%25");
      expect(body.total).toBe(0);
    });

    it("filters by date range", async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const empty = await listAsOwner(`?dateFrom=${tomorrow}`);
      expect(empty.total).toBe(0);

      const today = new Date().toISOString().split("T")[0];
      const all = await listAsOwner(`?dateFrom=${today}&dateTo=${today}`);
      expect(all.total).toBe(3);
    });

    it("paginates with a stable total", async () => {
      const page1 = await listAsOwner("?limit=2&page=1");
      expect(page1.total).toBe(3);
      expect(page1.rows).toHaveLength(2);

      const page2 = await listAsOwner("?limit=2&page=2");
      expect(page2.total).toBe(3);
      expect(page2.rows).toHaveLength(1);

      const seen = new Set(
        [...page1.rows, ...page2.rows].map((r) => r.proposal),
      );
      expect(seen.size).toBe(3);
    });
  });

  describe("admin export", () => {
    it("returns an xlsx download honoring filters", async () => {
      await submitProposal(app, ctx.memberArToken, "Faltan barras paralelas");
      await submitProposal(app, ctx.memberEsToken, "Propuesta española");

      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_BASE}/export?branchId=${ctx.arBranchId}`,
        headers: { authorization: `Bearer ${ctx.ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("spreadsheetml");
      expect(res.headers["content-disposition"]).toContain("propuestas-mejora");
      expect(res.rawPayload.length).toBeGreaterThan(0);
    });

    it("is staff-only", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_BASE}/export`,
        headers: { authorization: `Bearer ${ctx.memberArToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
