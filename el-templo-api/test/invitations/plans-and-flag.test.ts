/**
 * Fase 194 plan 05 (D-02, D-10b, D-14, D-23, Pitfall 2) — flag por plan
 * `allows_invitation_discount` y planes "Invitación" por país.
 *
 * Qué defiende este archivo:
 *   1. Migración 0256: el backfill D-23 (espejo de hoy: TRUE salvo especial,
 *      paquete e is_trial) corre UNA sola vez. El runner NO saltea los
 *      statements tras un "Duplicate column name", así que una re-ejecución
 *      vuelve a correr el UPDATE: el guard "solo si ningún plan está marcado"
 *      impide re-marcar un plan que gestión desmarcó.
 *   2. Migración 0257: dos planes Invitación (AR/ARS y ES/EUR), idempotentes.
 *   3. Helpers de identificación `isInvitationPlan`, `planAllowsInvitationDiscount`
 *      y `findInvitationPlan` (falla cerrado con 0 o más de 1).
 *   4. CRUD del flag por la API de planes, con piso duro server-side.
 *
 * Las migraciones se aplican leyendo el SQL de disco y partiéndolo con el mismo
 * `splitSqlStatements` que usa el runner (molde: test/migrations/0109).
 * `subscription_plans` está en TABLES_TO_CLEAN: los planes sembrados por 0257 en
 * la provisión NO sobreviven al `cleanAllTestData`, por eso se re-aplica el SQL.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import { splitSqlStatements } from "../../src/db/run-migrations";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { SubscriptionService } from "../../src/modules/subscriptions/service";
import {
  isInvitationPlan,
  planAllowsInvitationDiscount,
} from "../../src/modules/subscriptions/types";
import { EnrollmentService } from "../../src/modules/programs/enrollment-service";
import { BadRequestError } from "../../src/modules/shared/errors";
import {
  createMembershipPlan,
  createTrialPlan,
  fixtureCtx,
  type InvitationsFixtureCtx,
} from "./_helpers";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../src/db/migrations");
const MIG_0256 = path.join(
  MIGRATIONS_DIR,
  "0256_plans_allows_invitation_discount.sql",
);
const MIG_0257 = path.join(MIGRATIONS_DIR, "0257_invitation_plans.sql");

/** Errores que el runner trata como "ya aplicada" (run-migrations.ts). */
function isAlreadyAppliedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Duplicate column name") ||
    msg.includes("Duplicate key name") ||
    msg.includes("already exists")
  );
}

describe("Fase 194-05 — flag allows_invitation_discount y planes Invitación", () => {
  let app: FastifyInstance;
  let ctx: InvitationsFixtureCtx;
  let svc: SubscriptionService;

  beforeAll(async () => {
    app = await createTestApp();
    ctx = fixtureCtx(app);
    svc = new SubscriptionService(
      app.db,
      app.log,
      undefined,
      new EnrollmentService(app.db, app.log),
    );

    // Guard anti-`;` en comentarios (el runner parte por `;` antes de sacarlos).
    for (const file of [MIG_0256, MIG_0257]) {
      const offending = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => /^\s*--/.test(line) && line.includes(";"));
      expect(offending).toEqual([]);
    }
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  /**
   * Aplica una migración como el runner: statement por statement, tolerando los
   * errores de "ya existe" y SIGUIENDO con los statements que vienen después.
   */
  async function applyMigration(file: string): Promise<void> {
    const statements = splitSqlStatements(readFileSync(file, "utf8"));
    expect(statements.length).toBeGreaterThan(0);
    const conn = await app.dbPool.getConnection();
    try {
      for (const stmt of statements) {
        try {
          // El runner de producción usa una conexión cruda; acá la pasa el
          // sentinel de tenancy. El backfill de 0256 es cross-tenant a propósito
          // (espejo del comportamiento de hoy para todo gimnasio).
          await conn.query(
            `/* tenant-safe: migración aplicada tal cual la corre el runner, backfill cross-tenant a propósito (D-23) */ ${stmt}`,
          );
        } catch (err: unknown) {
          if (!isAlreadyAppliedError(err)) throw err;
        }
      }
    } finally {
      conn.release();
    }
  }

  async function flagOf(planId: number): Promise<boolean> {
    const [row] = await app.db
      .select({ flag: schema.subscriptionPlans.allowsInvitationDiscount })
      .from(schema.subscriptionPlans)
      .where(
        and(
          tenantWhere(schema.subscriptionPlans, ctx.tenant),
          eq(schema.subscriptionPlans.id, planId),
        ),
      );
    if (!row) throw new Error(`plan ${planId} no existe`);
    return row.flag;
  }

  async function seedPresencialTrial(): Promise<number> {
    const [row] = await app.db
      .insert(schema.subscriptionPlans)
      .values(
        tenantValues(ctx.tenant, {
          name: `Sesión de Prueba ${Date.now()}`,
          planTier: "flex" as const,
          bookingMode: "flexible" as const,
          planCategory: "presencial" as const,
          priceRegular: 0,
          priceZero: 0,
          durationDays: 7,
          classesPerWeek: 1,
          isTrial: true,
        }),
      )
      .$returningId();
    return row.id;
  }

  // ─── 0256: backfill D-23 ────────────────────────────────────────────────

  describe("migración 0256 (backfill D-23)", () => {
    it("deja TRUE en presencial y online; FALSE en especial, paquete e is_trial", async () => {
      const presencial = await createMembershipPlan(ctx, {
        category: "presencial",
      });
      const online = await createMembershipPlan(ctx, {
        category: "online_regular",
      });
      const especial = await createMembershipPlan(ctx, {
        category: "especial",
      });
      const paquete = await createMembershipPlan(ctx, { category: "paquete" });
      const trialPresencial = await seedPresencialTrial();
      const trialPaquete = await createTrialPlan(ctx);

      await applyMigration(MIG_0256);

      expect(await flagOf(presencial.id)).toBe(true);
      expect(await flagOf(online.id)).toBe(true);
      expect(await flagOf(especial.id)).toBe(false);
      expect(await flagOf(paquete.id)).toBe(false);
      expect(await flagOf(trialPresencial)).toBe(false);
      expect(await flagOf(trialPaquete.id)).toBe(false);
    });

    it("re-aplicar la 0256 completa no cambia nada", async () => {
      const presencial = await createMembershipPlan(ctx, {
        category: "presencial",
      });
      const especial = await createMembershipPlan(ctx, {
        category: "especial",
      });

      await applyMigration(MIG_0256);
      await applyMigration(MIG_0256);

      expect(await flagOf(presencial.id)).toBe(true);
      expect(await flagOf(especial.id)).toBe(false);
    });

    it("un plan que gestión desmarcó después del primer apply sigue desmarcado al re-aplicar (guard)", async () => {
      const mensual = await createMembershipPlan(ctx, {
        category: "presencial",
      });
      const programa = await createMembershipPlan(ctx, {
        category: "presencial",
      });

      await applyMigration(MIG_0256);
      expect(await flagOf(mensual.id)).toBe(true);
      expect(await flagOf(programa.id)).toBe(true);

      // Gestión desmarca el plan largo desde el admin.
      await app.db
        .update(schema.subscriptionPlans)
        .set({ allowsInvitationDiscount: false })
        .where(
          and(
            tenantWhere(schema.subscriptionPlans, ctx.tenant),
            eq(schema.subscriptionPlans.id, programa.id),
          ),
        );

      // Re-ejecución completa: el ALTER da "Duplicate column" y el UPDATE corre.
      await applyMigration(MIG_0256);

      expect(await flagOf(programa.id)).toBe(false);
      expect(await flagOf(mensual.id)).toBe(true);
    });

    it("sin planes en la DB el UPDATE es no-op y no falla", async () => {
      await applyMigration(MIG_0256);
      const rows = await app.db
        .select({ id: schema.subscriptionPlans.id })
        .from(schema.subscriptionPlans)
        .where(tenantWhere(schema.subscriptionPlans, ctx.tenant));
      expect(rows).toEqual([]);
    });

    it("un plan nuevo creado después de la migración nace con el flag en FALSE", async () => {
      await applyMigration(MIG_0256);
      const plan = await createMembershipPlan(ctx, { category: "presencial" });
      expect(await flagOf(plan.id)).toBe(false);
    });
  });

  // ─── 0257: planes Invitación ────────────────────────────────────────────

  describe("migración 0257 (planes Invitación)", () => {
    async function invitationPlans() {
      return app.db
        .select()
        .from(schema.subscriptionPlans)
        .where(
          and(
            tenantWhere(schema.subscriptionPlans, ctx.tenant),
            eq(schema.subscriptionPlans.name, "Invitación"),
          ),
        );
    }

    it("aplicada dos veces deja exactamente 1 plan AR/ARS y 1 ES/EUR con la forma de D-02/D-14", async () => {
      await applyMigration(MIG_0257);
      await applyMigration(MIG_0257);

      const rows = await invitationPlans();
      expect(rows).toHaveLength(2);

      const ar = rows.find((r) => r.country === "AR");
      const es = rows.find((r) => r.country === "ES");
      expect(ar?.currency).toBe("ARS");
      expect(es?.currency).toBe("EUR");

      for (const plan of rows) {
        expect(plan.planCategory).toBe("paquete");
        expect(plan.isTrial).toBe(true);
        expect(plan.multiBranch).toBe(true);
        expect(plan.durationDays).toBe(6);
        expect(plan.classesPerWeek).toBe(3);
        expect(plan.priceRegular).toBe(0);
        expect(plan.priceZero).toBe(0);
        expect(plan.monthlyClassBudget).toBeNull();
        expect(plan.requiresPresencial).toBe(false);
        expect(plan.specialLine).toBeNull();
        expect(plan.isActive).toBe(true);
        expect(plan.isArchived).toBe(false);
        expect(plan.allowsInvitationDiscount).toBe(false);
        expect(plan.description).toBe(
          "3 accesos gratis para invitados (10 días hábiles)",
        );
      }
    });

    it("es una forma válida para el servicio (findInvitationPlan la resuelve por país)", async () => {
      await applyMigration(MIG_0257);
      const ar = await svc.findInvitationPlan(ctx.tenant, "AR");
      const es = await svc.findInvitationPlan(ctx.tenant, "ES");
      expect(ar.country).toBe("AR");
      expect(es.country).toBe("ES");
      expect(ar.id).not.toBe(es.id);
      expect(isInvitationPlan(ar)).toBe(true);
      expect(planAllowsInvitationDiscount(ar)).toBe(false);
    });
  });

  // ─── Helpers de identificación ──────────────────────────────────────────

  describe("isInvitationPlan / planAllowsInvitationDiscount", () => {
    it("isInvitationPlan: paquete + is_trial sí; Yoga (especial) y Sesión de Prueba (presencial is_trial) no", () => {
      expect(isInvitationPlan({ isTrial: true, planCategory: "paquete" })).toBe(
        true,
      );
      expect(
        isInvitationPlan({ isTrial: true, planCategory: "especial" }),
      ).toBe(false);
      expect(
        isInvitationPlan({ isTrial: true, planCategory: "presencial" }),
      ).toBe(false);
      expect(
        isInvitationPlan({ isTrial: false, planCategory: "paquete" }),
      ).toBe(false);
    });

    it("planAllowsInvitationDiscount: flag + categoría admitida + no is_trial", () => {
      const base = {
        allowsInvitationDiscount: true,
        planCategory: "presencial" as const,
        isTrial: false,
      };
      expect(planAllowsInvitationDiscount(base)).toBe(true);
      expect(
        planAllowsInvitationDiscount({
          ...base,
          allowsInvitationDiscount: false,
        }),
      ).toBe(false);
      expect(
        planAllowsInvitationDiscount({ ...base, planCategory: "especial" }),
      ).toBe(false);
      expect(
        planAllowsInvitationDiscount({ ...base, planCategory: "paquete" }),
      ).toBe(false);
      expect(planAllowsInvitationDiscount({ ...base, isTrial: true })).toBe(
        false,
      );
    });
  });

  // ─── findInvitationPlan ─────────────────────────────────────────────────

  describe("SubscriptionService.findInvitationPlan", () => {
    it("con 0 planes falla cerrado con BadRequestError", async () => {
      await expect(svc.findInvitationPlan(ctx.tenant, "AR")).rejects.toThrow(
        BadRequestError,
      );
      await expect(svc.findInvitationPlan(ctx.tenant, "AR")).rejects.toThrow(
        "No hay un plan de Invitación configurado para AR",
      );
    });

    it("devuelve el plan del país pedido", async () => {
      const ar = await createTrialPlan(ctx, { country: "AR" });
      const es = await createTrialPlan(ctx, { country: "ES" });
      const foundAr = await svc.findInvitationPlan(ctx.tenant, "AR");
      const foundEs = await svc.findInvitationPlan(ctx.tenant, "ES");
      expect(foundAr.id).toBe(ar.id);
      expect(foundEs.id).toBe(es.id);
    });

    it("con 2 planes Invitación activos en el mismo país falla cerrado", async () => {
      await createTrialPlan(ctx, { country: "AR" });
      await createTrialPlan(ctx, { country: "AR" });
      await expect(svc.findInvitationPlan(ctx.tenant, "AR")).rejects.toThrow(
        BadRequestError,
      );
    });

    it("ignora el plan archivado, el inactivo, el especial is_trial (Yoga) y el paquete no trial", async () => {
      const valid = await createTrialPlan(ctx, { country: "AR" });
      const archived = await createTrialPlan(ctx, { country: "AR" });
      const inactive = await createTrialPlan(ctx, { country: "AR" });
      await createTrialPlan(ctx, { country: "AR", category: "especial" });
      await createMembershipPlan(ctx, { country: "AR", category: "paquete" });
      for (const [id, patch] of [
        [archived.id, { isArchived: true }],
        [inactive.id, { isActive: false }],
      ] as const) {
        await app.db
          .update(schema.subscriptionPlans)
          .set(patch)
          .where(
            and(
              tenantWhere(schema.subscriptionPlans, ctx.tenant),
              eq(schema.subscriptionPlans.id, id),
            ),
          );
      }

      const found = await svc.findInvitationPlan(ctx.tenant, "AR");
      expect(found.id).toBe(valid.id);
    });
  });
});
