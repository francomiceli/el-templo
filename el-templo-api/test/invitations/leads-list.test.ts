/**
 * Fase 194-20 (D-18) — bandeja de leads de invitación
 * (`GET /api/admin/referrals/invitations`) y filtro `origin=invitacion` del
 * listado de alumnos (`GET /api/admin/members`).
 *
 * Servicio + HTTP contra MySQL real por worker. Fechas siempre relativas a
 * `todayInTz(<tz de la sede>)`; el único reloj falso es el del caso de zonas
 * horarias (solo `Date`, y solo alrededor de la llamada al servicio). El
 * aislamiento entre gimnasios vive en `iso-03-referrals.test.ts`.
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
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  cleanAllTestData,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  InvitationLeadList,
  type InvitationLeadPage,
} from "../../src/modules/referrals/invitation-lead-list";
import { deriveLeadStage } from "../../src/modules/referrals/invitation-states";
import {
  createInvitedUser,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  createMembershipPlan,
  createTrialPlan,
  ensurePhysicalBranch,
  fixtureCtx,
  uniquePhone10,
  type InvitationsFixtureCtx,
  type InvitedUserEnv,
} from "./_helpers";

const URL = "/api/admin/referrals/invitations";

describe("Fase 194-20 D-18 — bandeja de leads de invitación", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let list: InvitationLeadList;
  let ownerToken: string;
  let env: InvitedUserEnv;
  let arTimezone: string;
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    list = new InvitationLeadList(app.db);
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    vi.useRealTimers();
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    vi.useRealTimers();
    await cleanAllTestData(app);
    const branch = await ensurePhysicalBranch(ctx, "AR");
    arTimezone = branch.timezone;
    env = {
      branchId: branch.id,
      today: todayInTz(branch.timezone),
      trialPlanId: (await createTrialPlan(ctx)).id,
      membershipPlanId: (await createMembershipPlan(ctx)).id,
    };
  });

  async function staffToken(
    role: "gestion" | "coach" | "recepcion",
    country: "AR" | "ES" = "AR",
  ): Promise<string> {
    const branch = await ensurePhysicalBranch(ctx, country);
    const email = `${role}-inv-lead-${country}-${suffix}-${Math.random().toString(36).slice(2, 6)}@test.local`;
    await createStaffUser(app, {
      email,
      password: "pass123456",
      firstName: role,
      lastName: "InvLeads",
      role,
      branchId: branch.id,
      country: role === "gestion" ? country : null,
    });
    return getAuthToken(app, email, "pass123456");
  }

  async function http(
    token: string,
    query = "",
  ): Promise<{ statusCode: number; body: InvitationLeadPage }> {
    const res = await app.inject({
      method: "GET",
      url: `${URL}${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as InvitationLeadPage,
    };
  }

  async function attend(
    userId: number,
    branchId: number,
    sessionDate: string,
  ): Promise<void> {
    await app.db.insert(schema.attendance).values(
      tenantValues(ctx.tenant, {
        memberId: userId,
        branchId,
        sessionDate,
        source: "manual" as const,
      }),
    );
  }

  // ─── Forma de la fila ──────────────────────────────────────────────────

  it("fila completa: invitado con teléfono, invitador, activación, x/N, vencimiento, sedes, etapa, lead_status y canal", async () => {
    const inviter = await createInviterWithCode(ctx);
    const phone = uniquePhone10();
    const invited = await createInvitedUser(ctx, env, inviter.id, {
      remaining: 2,
      channel: "assisted",
      phone,
    });
    await attend(invited.userId, env.branchId, addDays(env.today, -1));
    await app.db
      .update(schema.users)
      .set({ leadStatus: "en_seguimiento" })
      .where(
        and(
          tenantWhere(schema.users, ctx.tenant),
          eq(schema.users.id, invited.userId),
        ),
      );
    const [branchRow] = await app.db
      .select({ name: schema.branches.name })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx.tenant),
          eq(schema.branches.id, env.branchId),
        ),
      );

    const page = await list.list(ctx.tenant);

    expect(page.total).toBe(1);
    expect(page.rows).toEqual([
      {
        invitationId: invited.invitationId,
        invitee: {
          userId: invited.userId,
          firstName: "Fisico",
          lastName: expect.stringContaining("Fixture"),
          phone,
        },
        inviter: {
          userId: inviter.id,
          name: expect.stringContaining("Fixture"),
        },
        activatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        accessesUsed: 2,
        accessesBudget: 4,
        accessExpiresOn: addDays(env.today, 3),
        branchId: env.branchId,
        branchName: branchRow.name,
        branchesTrained: [branchRow.name],
        stage: "entrenando",
        leadStatus: "en_seguimiento",
        channel: "assisted",
      },
    ]);
  });

  it("las invitaciones anuladas no se listan", async () => {
    const inviter = await createInviterWithCode(ctx);
    await createInvitedUser(ctx, env, inviter.id, {});
    await createInvitedUser(ctx, env, inviter.id, { status: "voided" });

    const page = await list.list(ctx.tenant);

    expect(page.total).toBe(1);
    expect(page.rows).toHaveLength(1);
  });

  // ─── Etapa en SQL ──────────────────────────────────────────────────────

  it("filtro por etapa: cada etapa devuelve solo sus filas", async () => {
    const inviter = await createInviterWithCode(ctx);
    const convertido = await createInvitedUser(ctx, env, inviter.id, {
      converted: true,
      expiresOffset: -2,
      remaining: 0,
    });
    const vencidoFecha = await createInvitedUser(ctx, env, inviter.id, {
      expiresOffset: -1,
    });
    const vencidoAgotado = await createInvitedUser(ctx, env, inviter.id, {
      remaining: 0,
    });
    const entrenando = await createInvitedUser(ctx, env, inviter.id, {
      remaining: 1,
    });
    const invitado = await createInvitedUser(ctx, env, inviter.id, {});

    const ids = async (stage: string): Promise<number[]> =>
      (await list.list(ctx.tenant, { stage: stage as "invitado" })).rows
        .map((row) => row.invitationId)
        .sort((a, b) => a - b);
    const sorted = (...xs: number[]): number[] => xs.sort((a, b) => a - b);

    expect(await ids("convertido")).toEqual([convertido.invitationId]);
    expect(await ids("vencido")).toEqual(
      sorted(vencidoFecha.invitationId, vencidoAgotado.invitationId),
    );
    expect(await ids("entrenando")).toEqual([entrenando.invitationId]);
    expect(await ids("invitado")).toEqual([invitado.invitationId]);
  });

  it("paginación exacta con filtro de etapa: 30 invitaciones, 12 entrenando repartidas -> total 12 y páginas de 5, 5 y 2", async () => {
    const inviter = await createInviterWithCode(ctx);
    const trainingIdx = new Set([0, 2, 5, 7, 9, 12, 14, 17, 20, 22, 25, 28]);
    const trainingIds = new Set<number>();
    for (let n = 0; n < 30; n++) {
      if (trainingIdx.has(n)) {
        const row = await createInvitedUser(ctx, env, inviter.id, {
          remaining: 2,
        });
        trainingIds.add(row.invitationId);
      } else {
        // El resto: invitados sin uso, vencidos por fecha y convertidos.
        const variant = n % 3;
        await createInvitedUser(ctx, env, inviter.id, {
          expiresOffset: variant === 1 ? -1 : 3,
          converted: variant === 2,
        });
      }
    }
    expect(trainingIds.size).toBe(12);

    const seen: number[] = [];
    const sizes: number[] = [];
    for (const page of [1, 2, 3]) {
      const res = await list.list(ctx.tenant, {
        stage: "entrenando",
        page,
        pageSize: 5,
      });
      expect(res.total).toBe(12);
      expect(res.rows.every((row) => row.stage === "entrenando")).toBe(true);
      sizes.push(res.rows.length);
      seen.push(...res.rows.map((row) => row.invitationId));
    }
    expect(sizes).toEqual([5, 5, 2]);
    expect(new Set(seen)).toEqual(trainingIds);

    // Una página más allá del final: sin filas pero el total sigue siendo exacto.
    const beyond = await list.list(ctx.tenant, {
      stage: "entrenando",
      page: 4,
      pageSize: 5,
    });
    expect(beyond.rows).toEqual([]);
    expect(beyond.total).toBe(12);
  });

  it("consistencia: la etapa calculada en SQL coincide fila por fila con deriveLeadStage", async () => {
    const inviter = await createInviterWithCode(ctx);
    const specs = [
      { expiresOffset: 0 }, // último día: sigue vigente
      { expiresOffset: -1 },
      { expiresOffset: 3, remaining: 0 },
      { expiresOffset: 3, remaining: 2 },
      { expiresOffset: 3, remaining: 4 },
      { expiresOffset: -4, converted: true },
      { expiresOffset: 3, remaining: 1, converted: true },
      { expiresOffset: 5, budget: 6, remaining: 5 },
    ];
    for (const spec of specs) {
      await createInvitedUser(ctx, env, inviter.id, spec);
    }

    const page = await list.list(ctx.tenant, { pageSize: 100 });
    expect(page.rows).toHaveLength(specs.length);

    const stored = await app.db
      .select({
        id: schema.invitations.id,
        convertedAt: schema.invitations.convertedAt,
        accessExpiresOn: schema.invitations.accessExpiresOn,
        classesBudget: schema.subscriptions.classesBudget,
        classesRemaining: schema.subscriptions.classesRemaining,
      })
      .from(schema.invitations)
      .leftJoin(
        schema.subscriptions,
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, schema.invitations.subscriptionId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          inArray(
            schema.invitations.id,
            page.rows.map((row) => row.invitationId),
          ),
        ),
      );
    expect(stored).toHaveLength(specs.length);
    for (const row of stored) {
      const expected = deriveLeadStage({
        converted: row.convertedAt !== null,
        today: todayInTz(arTimezone),
        accessExpiresOn: row.accessExpiresOn,
        classesBudget: row.classesBudget,
        classesRemaining: row.classesRemaining,
      });
      const actual = page.rows.find((r) => r.invitationId === row.id)?.stage;
      expect(actual, `invitación ${row.id}`).toBe(expected);
    }
    // El set cubre las 4 etapas (si no, la comparación sería parcial).
    expect(new Set(page.rows.map((row) => row.stage))).toEqual(
      new Set(["invitado", "entrenando", "vencido", "convertido"]),
    );
  });

  it("el `hoy` de cada fila es el de la zona horaria de SU sede (Argentina y España no cambian de día juntas)", async () => {
    const esBranch = await ensurePhysicalBranch(ctx, "ES");
    expect(esBranch.timezone).toMatch(/^Europe\//);
    const arInviter = await createInviterWithCode(ctx);
    const esInviter = await createInviterWithCode(ctx, { country: "ES" });

    // 23:30 UTC del día D: en Argentina todavía es D (20:30) y en España ya es D+1.
    const utcDay = new Date().toISOString().slice(0, 10);
    const sameExpiry = { expiresOffset: 0, activatedDaysAgo: 2 };
    const arEnv: InvitedUserEnv = { ...env, today: utcDay };
    const esEnv: InvitedUserEnv = {
      ...env,
      branchId: esBranch.id,
      today: utcDay,
      trialPlanId: env.trialPlanId,
    };
    const ar = await createInvitedUser(ctx, arEnv, arInviter.id, sameExpiry);
    const es = await createInvitedUser(ctx, esEnv, esInviter.id, sameExpiry);

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(`${utcDay}T23:30:00Z`));
      const page = await list.list(ctx.tenant, { pageSize: 100 });
      const stageOf = (id: number) =>
        page.rows.find((row) => row.invitationId === id)?.stage;
      // Mismo último día de accesos (D): vigente en AR, ya vencido en ES.
      expect(stageOf(ar.invitationId)).toBe("invitado");
      expect(stageOf(es.invitationId)).toBe("vencido");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sin invitaciones: total 0 y filas vacías (la query no depende de que haya datos)", async () => {
    const page = await list.list(ctx.tenant);

    expect(page).toEqual({ rows: [], total: 0, page: 1, pageSize: 25 });
  });

  // ─── Otros filtros ─────────────────────────────────────────────────────

  it("filtro por sede (donde se activó) y por rango de fechas de activación", async () => {
    const esBranch = await ensurePhysicalBranch(ctx, "ES");
    const arInviter = await createInviterWithCode(ctx);
    const esInviter = await createInviterWithCode(ctx, { country: "ES" });
    const esEnv: InvitedUserEnv = {
      ...env,
      branchId: esBranch.id,
      today: todayInTz(esBranch.timezone),
    };
    const recentAr = await createInvitedUser(ctx, env, arInviter.id, {
      activatedDaysAgo: 2,
    });
    const oldAr = await createInvitedUser(ctx, env, arInviter.id, {
      activatedDaysAgo: 40,
      expiresOffset: -20,
    });
    const recentEs = await createInvitedUser(ctx, esEnv, esInviter.id, {
      activatedDaysAgo: 2,
    });

    const ids = (page: InvitationLeadPage): number[] =>
      page.rows.map((row) => row.invitationId).sort((a, b) => a - b);

    const bySede = await list.list(ctx.tenant, { branchId: esBranch.id });
    expect(ids(bySede)).toEqual([recentEs.invitationId]);

    const recentOnly = await list.list(ctx.tenant, {
      from: addDays(env.today, -10),
    });
    expect(ids(recentOnly)).toEqual(
      [recentAr.invitationId, recentEs.invitationId].sort((a, b) => a - b),
    );

    const oldOnly = await list.list(ctx.tenant, {
      to: addDays(env.today, -20),
    });
    expect(ids(oldOnly)).toEqual([oldAr.invitationId]);
  });

  // ─── HTTP ──────────────────────────────────────────────────────────────

  it("HTTP: gestión de un país ve solo las invitaciones de sedes de su país; el owner ve ambos", async () => {
    const esBranch = await ensurePhysicalBranch(ctx, "ES");
    const arInviter = await createInviterWithCode(ctx);
    const esInviter = await createInviterWithCode(ctx, { country: "ES" });
    await createInvitedUser(ctx, env, arInviter.id, {});
    await createInvitedUser(
      ctx,
      { ...env, branchId: esBranch.id, today: todayInTz(esBranch.timezone) },
      esInviter.id,
      {},
    );

    const gestionAr = await http(await staffToken("gestion", "AR"));
    const gestionEs = await http(await staffToken("gestion", "ES"));
    const owner = await http(ownerToken);

    expect(gestionAr.statusCode).toBe(200);
    expect(gestionAr.body.total).toBe(1);
    expect(gestionEs.body.total).toBe(1);
    expect(owner.body.total).toBe(2);
  });

  it("HTTP: recepción y coach reciben 403; sin token 401", async () => {
    expect((await http(await staffToken("recepcion"))).statusCode).toBe(403);
    expect((await http(await staffToken("coach"))).statusCode).toBe(403);
    const anon = await app.inject({ method: "GET", url: URL });
    expect(anon.statusCode).toBe(401);
  });

  it("HTTP: querystring validado (etapa desconocida, pageSize > 100, page 0, fecha mal formada, branchId no numérico)", async () => {
    for (const query of [
      "?stage=foo",
      "?pageSize=101",
      "?page=0",
      "?from=2026-1-1",
      "?to=ayer",
      "?branchId=abc",
    ]) {
      expect((await http(ownerToken, query)).statusCode, query).toBe(400);
    }
  });

  it("HTTP: pagina con page/pageSize y devuelve el shape paginado", async () => {
    const inviter = await createInviterWithCode(ctx);
    for (let n = 0; n < 3; n++) {
      await createInvitedUser(ctx, env, inviter.id, {});
    }

    const res = await http(ownerToken, "?page=2&pageSize=2");

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.rows).toHaveLength(1);
  });
});
