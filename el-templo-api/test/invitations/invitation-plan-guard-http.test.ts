/**
 * Fase 194 plan 06 (T-194-18) — por HTTP real, el plan Invitación NO se puede
 * asignar a mano: ni con el body pelado ni con campos inventados que
 * pretendan habilitarlo (`viaInvitation`, `allowInvitationPlan`). No existe
 * ningún flag en `AssignPlanInput`: lo que mande el body no puede abrir la
 * puerta.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { assignPlan } from "../subscriptions/_helpers";
import {
  createMemberInPhysicalBranch,
  createTrialPlan,
  fixtureCtx,
  type InvitationsFixtureCtx,
} from "./_helpers";

describe("Fase 194 T-194-18 — assign HTTP rechaza el plan Invitación", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  const variants: Array<[string, Record<string, unknown>]> = [
    ["body pelado", {}],
    ["con priceOverrideAmount 0", { priceOverrideAmount: 0 }],
    ["con viaInvitation: true", { viaInvitation: true }],
    ["con allowInvitationPlan: true", { allowInvitationPlan: true }],
    [
      "con ambos flags inventados + override 0",
      {
        viaInvitation: true,
        allowInvitationPlan: true,
        priceOverrideAmount: 0,
      },
    ],
  ];

  for (const [label, extra] of variants) {
    it(`400 ${label}`, async () => {
      const member = await createMemberInPhysicalBranch(ctx);
      const trial = await createTrialPlan(ctx);

      const res = await assignPlan(app, adminToken, member.id, {
        planId: trial.id,
        branchId: member.branchId,
        startDate: todayStr(),
        ...extra,
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.message as string).toContain(
        "El plan Invitación se asigna solo activando una invitación",
      );

      // Nada quedó asignado.
      const subs = await app.db
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .where(
          and(
            tenantWhere(schema.subscriptions, ctx.tenant),
            eq(schema.subscriptions.userId, member.id),
          ),
        );
      expect(subs).toHaveLength(0);
    });
  }
});
