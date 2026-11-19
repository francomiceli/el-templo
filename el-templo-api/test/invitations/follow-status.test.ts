/**
 * Estado de seguimiento de la bandeja de Invitaciones: `deriveFollowStatus` y
 * `deriveEndReason` (puros, fuente de verdad) y su espejo en SQL
 * (`invitationFollowStatusSql` / `invitationEndReasonSql`), igual que el test de paridad
 * de la etapa en `leads-list.test.ts`.
 *
 * Orden de `deriveFollowStatus`: compro -> compro_tarde -> no_sigue -> para_contactar ->
 * con_accesos. La matriz pura no toca la base; el bloque de paridad cruza la función con la
 * SQL fila por fila. Fechas relativas a `todayInTz(<tz de la sede>)`.
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
import { createTestApp, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { InvitationLeadList } from "../../src/modules/referrals/invitation-lead-list";
import {
  deriveEndReason,
  deriveFollowStatus,
  type FollowStatusInput,
  type InvitationFollowStatus,
} from "../../src/modules/referrals/invitation-states";
import {
  createInvitedUser,
  createInviterWithCode,
  ensurePhysicalBranch,
  fixtureCtx,
  type InvitationsFixtureCtx,
  type InvitedUserEnv,
  type InvitedUserSpec,
} from "./_helpers";
import { seedFollowupFixtures } from "./_followup-helpers";

// Las funciones puras reciben `today`: acá es el de hoy (cualquier sede AR) y todo lo demás
// se arma por offsets, nunca con fechas fijas.
const TODAY = todayInTz("America/Argentina/Buenos_Aires");
const YESTERDAY = addDays(TODAY, -1);
const LONG_AGO = addDays(TODAY, -20);

/** Invitación vigente sin gestión: base de la matriz pura. */
const BASE: FollowStatusInput = {
  today: TODAY,
  accessExpiresOn: addDays(TODAY, 5),
  classesBudget: 4,
  classesRemaining: 4,
  converted: false,
  purchasedSinceActivation: false,
  manualStatus: null,
};

describe("deriveFollowStatus (puro) — matriz de reglas y orden", () => {
  const cases: Array<{
    name: string;
    input: Partial<FollowStatusInput>;
    expected: InvitationFollowStatus;
  }> = [
    { name: "vigente sin gestión", input: {}, expected: "con_accesos" },
    {
      name: "vigente con seguimiento en_proceso",
      input: { manualStatus: "en_proceso" },
      expected: "con_accesos",
    },
    {
      name: "último día del plazo todavía es con_accesos",
      input: { accessExpiresOn: TODAY },
      expected: "con_accesos",
    },
    {
      name: "plazo vencido ayer",
      input: { accessExpiresOn: YESTERDAY },
      expected: "para_contactar",
    },
    {
      name: "accesos agotados con plazo vigente",
      input: { classesRemaining: 0 },
      expected: "para_contactar",
    },
    {
      name: "sin cupo definido y sin vencimiento no termina nunca",
      input: {
        classesBudget: null,
        classesRemaining: null,
        accessExpiresOn: null,
      },
      expected: "con_accesos",
    },
    {
      name: "no_renovo con accesos vigentes",
      input: { manualStatus: "no_renovo" },
      expected: "no_sigue",
    },
    {
      name: "no_renovo con accesos terminados",
      input: { manualStatus: "no_renovo", classesRemaining: 0 },
      expected: "no_sigue",
    },
    {
      name: "compró fuera de la ventana (sin converted_at)",
      input: { purchasedSinceActivation: true },
      expected: "compro_tarde",
    },
    {
      name: "compro_tarde le gana a no_renovo",
      input: { purchasedSinceActivation: true, manualStatus: "no_renovo" },
      expected: "compro_tarde",
    },
    {
      name: "compro_tarde le gana a accesos terminados",
      input: { purchasedSinceActivation: true, classesRemaining: 0 },
      expected: "compro_tarde",
    },
    {
      name: "convertida",
      input: { converted: true },
      expected: "compro",
    },
    {
      name: "compro le gana a todo (compra tardía, no_renovo y accesos terminados)",
      input: {
        converted: true,
        purchasedSinceActivation: true,
        manualStatus: "no_renovo",
        classesRemaining: 0,
        accessExpiresOn: LONG_AGO,
      },
      expected: "compro",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(deriveFollowStatus({ ...BASE, ...c.input })).toBe(c.expected);
    });
  }

  it("la matriz cubre los 5 estados", () => {
    expect(new Set(cases.map((c) => c.expected))).toEqual(
      new Set([
        "con_accesos",
        "para_contactar",
        "compro",
        "compro_tarde",
        "no_sigue",
      ]),
    );
  });
});

describe("deriveEndReason (puro)", () => {
  it("null mientras los accesos siguen vigentes (también el último día)", () => {
    expect(deriveEndReason(BASE)).toBeNull();
    expect(deriveEndReason({ ...BASE, accessExpiresOn: TODAY })).toBeNull();
  });

  it("agotados: classes_remaining = 0 (aunque además haya vencido el plazo)", () => {
    expect(deriveEndReason({ ...BASE, classesRemaining: 0 })).toBe("agotados");
    expect(
      deriveEndReason({
        ...BASE,
        classesRemaining: 0,
        accessExpiresOn: LONG_AGO,
      }),
    ).toBe("agotados");
  });

  it("plazo: venció con accesos sin usar (o sin cupo definido)", () => {
    const expired = { ...BASE, accessExpiresOn: YESTERDAY };
    expect(deriveEndReason(expired)).toBe("plazo");
    expect(
      deriveEndReason({
        ...expired,
        classesBudget: null,
        classesRemaining: null,
      }),
    ).toBe("plazo");
  });
});

describe("followStatus / endReason en SQL — paridad con las funciones puras", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let env: InvitedUserEnv;
  let arTimezone: string;
  let list: InvitationLeadList;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    list = new InvitationLeadList(app.db);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    vi.useRealTimers();
    await cleanAllTestData(app);
    const fixtures = await seedFollowupFixtures(ctx);
    env = fixtures.env;
    arTimezone = fixtures.arTimezone;
  });

  /** Seguimiento manual puesto directo en la tabla (sin pasar por el PATCH). */
  async function setManualStatus(
    subscriptionId: number,
    userId: number,
    manualStatus: "en_proceso" | "no_renovo",
  ): Promise<void> {
    await app.db.insert(schema.renewalFollowups).values(
      tenantValues(ctx.tenant, {
        subscriptionId,
        userId,
        manualStatus,
        messageCount: 0,
      }),
    );
  }

  it("la SQL coincide fila por fila con deriveFollowStatus y deriveEndReason", async () => {
    const inviter = await createInviterWithCode(ctx);
    const specs: Array<{
      spec: InvitedUserSpec;
      manual?: "en_proceso" | "no_renovo";
    }> = [
      { spec: {} },
      { spec: {}, manual: "en_proceso" },
      { spec: {}, manual: "no_renovo" },
      { spec: { expiresOffset: 0 } },
      { spec: { expiresOffset: -1 } },
      { spec: { expiresOffset: -1 }, manual: "no_renovo" },
      { spec: { remaining: 0 } },
      { spec: { remaining: 0, expiresOffset: -3 } },
      { spec: { remaining: 2 } },
      { spec: { converted: true, remaining: 0, expiresOffset: -2 } },
      { spec: { converted: true }, manual: "no_renovo" },
      { spec: { purchase: "vigente" } },
      { spec: { purchase: "vigente", remaining: 0 }, manual: "no_renovo" },
      { spec: { purchase: "vencida", expiresOffset: -1 } },
    ];
    for (const { spec, manual } of specs) {
      const row = await createInvitedUser(ctx, env, inviter.id, spec);
      if (manual) await setManualStatus(row.subscriptionId, row.userId, manual);
    }

    const page = await list.list(ctx.tenant, { pageSize: 100 });
    expect(page.rows).toHaveLength(specs.length);

    // Insumos leídos de la base (no del servicio bajo prueba).
    const stored = await app.db
      .select({
        id: schema.invitations.id,
        userId: schema.invitations.invitedUserId,
        activatedAt: schema.invitations.activatedAt,
        convertedAt: schema.invitations.convertedAt,
        accessExpiresOn: schema.invitations.accessExpiresOn,
        classesBudget: schema.subscriptions.classesBudget,
        classesRemaining: schema.subscriptions.classesRemaining,
        manualStatus: schema.renewalFollowups.manualStatus,
      })
      .from(schema.invitations)
      .leftJoin(
        schema.subscriptions,
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.id, schema.invitations.subscriptionId),
        ),
      )
      .leftJoin(
        schema.renewalFollowups,
        and(
          tenantWhere(schema.renewalFollowups, ctx.tenant),
          eq(
            schema.renewalFollowups.subscriptionId,
            schema.invitations.subscriptionId,
          ),
        ),
      )
      .where(
        and(
          tenantWhere(schema.invitations, ctx.tenant),
          inArray(
            schema.invitations.id,
            page.rows.map((r) => r.invitationId),
          ),
        ),
      );
    expect(stored).toHaveLength(specs.length);

    // "Compró desde la activación": sub paga de un plan que no es is_trial, creada en o
    // después de la activación (definición de `invitation-purchase.ts`).
    const paid = await app.db
      .select({
        userId: schema.subscriptions.userId,
        createdAt: schema.subscriptions.createdAt,
        pricePaid: schema.subscriptions.pricePaid,
        isTrial: schema.subscriptionPlans.isTrial,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        and(
          tenantWhere(schema.subscriptionPlans, ctx.tenant),
          eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
        ),
      )
      .where(tenantWhere(schema.subscriptions, ctx.tenant));

    const today = todayInTz(arTimezone);
    for (const row of stored) {
      const window = {
        today,
        accessExpiresOn: row.accessExpiresOn,
        classesBudget: row.classesBudget,
        classesRemaining: row.classesRemaining,
      };
      const expectedStatus = deriveFollowStatus({
        ...window,
        converted: row.convertedAt !== null,
        purchasedSinceActivation: paid.some(
          (s) =>
            s.userId === row.userId &&
            !s.isTrial &&
            Number(s.pricePaid) > 0 &&
            s.createdAt >= row.activatedAt,
        ),
        manualStatus: row.manualStatus,
      });
      const actual = page.rows.find((r) => r.invitationId === row.id);
      expect(actual?.followStatus, `followStatus de ${row.id}`).toBe(
        expectedStatus,
      );
      expect(actual?.endReason, `endReason de ${row.id}`).toBe(
        deriveEndReason(window),
      );
    }

    // El set cubre los 5 estados y los 3 valores de endReason (si no, sería parcial).
    expect(new Set(page.rows.map((r) => r.followStatus))).toEqual(
      new Set([
        "con_accesos",
        "para_contactar",
        "compro",
        "compro_tarde",
        "no_sigue",
      ]),
    );
    expect(new Set(page.rows.map((r) => r.endReason))).toEqual(
      new Set([null, "agotados", "plazo"]),
    );
  });

  it("el `hoy` de cada fila es el de la zona de SU sede: AR y ES no cambian de estado juntas", async () => {
    const esBranch = await ensurePhysicalBranch(ctx, "ES");
    const arInviter = await createInviterWithCode(ctx);
    const esInviter = await createInviterWithCode(ctx, { country: "ES" });

    // 23:30 UTC del día D: en Argentina todavía es D y en España ya es D+1.
    const utcDay = new Date().toISOString().slice(0, 10);
    const same = { expiresOffset: 0, activatedDaysAgo: 2 };
    const ar = await createInvitedUser(
      ctx,
      { ...env, today: utcDay },
      arInviter.id,
      same,
    );
    const es = await createInvitedUser(
      ctx,
      { ...env, branchId: esBranch.id, today: utcDay },
      esInviter.id,
      same,
    );

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(`${utcDay}T23:30:00Z`));
      const page = await list.list(ctx.tenant, { pageSize: 100 });
      const of = (id: number) => page.rows.find((r) => r.invitationId === id);
      // Mismo último día de accesos (D): vigente en AR, ya terminado por plazo en ES.
      expect(of(ar.invitationId)?.followStatus).toBe("con_accesos");
      expect(of(ar.invitationId)?.endReason).toBeNull();
      expect(of(es.invitationId)?.followStatus).toBe("para_contactar");
      expect(of(es.invitationId)?.endReason).toBe("plazo");
    } finally {
      vi.useRealTimers();
    }
  });
});
