/**
 * Phase 161-01 (PASE-01): contratos compartidos del pase "Actividades con Aura".
 *
 * Cubre los 3 artefactos que las olas 2-3 consumen:
 *  - categoryGroup (types.ts): grupo de categoría de 3 valores (presencial/online/especial).
 *  - PassRequiredError (errors.ts): error tipado con code PASS_REQUIRED.
 *  - pickSubscriptionForActivity (service.ts): routing de sub por actividad (especial vs no).
 *
 * Análogo estructural: test/subscriptions/dual-subscription.test.ts (beforeAll/afterAll/
 * beforeEach + cleanAllTestData) y charge-on-assign.test.ts (instanciación del service).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { createPlan, createMember, assignPlan } from "./_helpers";
import { SubscriptionService } from "../../src/modules/subscriptions/service";
import { AuraService } from "../../src/modules/aura";
import { categoryGroup } from "../../src/modules/subscriptions/types";
import {
  PassRequiredError,
  BadRequestError,
} from "../../src/modules/shared/errors";

describe("Phase 161-01 — contratos del pase especial", () => {
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

  describe("categoryGroup", () => {
    it("mapea especial → especial, presencial → presencial, online_* → online", () => {
      expect(categoryGroup("especial")).toBe("especial");
      expect(categoryGroup("presencial")).toBe("presencial");
      expect(categoryGroup("online_regular")).toBe("online");
      expect(categoryGroup("online_coach")).toBe("online");
      expect(categoryGroup("online_goal")).toBe("online");
    });
  });

  describe("PassRequiredError", () => {
    it("tiene code PASS_REQUIRED y es instanceof BadRequestError", () => {
      const err = new PassRequiredError();
      expect(err.code).toBe("PASS_REQUIRED");
      expect(err).toBeInstanceOf(BadRequestError);
      expect(err.statusCode).toBe(400);
    });
  });

  describe("pickSubscriptionForActivity", () => {
    function makeService(): SubscriptionService {
      const aura = new AuraService(app.db);
      return new SubscriptionService(app.db, app.log, aura);
    }

    it("rutea la sub especial cuando isSpecialActivity=true y la no-especial cuando false", async () => {
      const presencialPlan = await createPlan(app, adminToken, {
        name: "Presencial Ruteo",
        planCategory: "presencial",
      });
      const especialPlan = await createPlan(app, adminToken, {
        name: "Pase Especial Ruteo",
        planCategory: "especial",
        classesPerWeek: null,
      });
      const member = await createMember(app);

      const r1 = await assignPlan(app, adminToken, member.id, {
        planId: presencialPlan.id,
      });
      expect(r1.statusCode).toBe(201);
      const r2 = await assignPlan(app, adminToken, member.id, {
        planId: especialPlan.id,
      });
      expect(r2.statusCode).toBe(201);

      const svc = makeService();

      const special = await svc.pickSubscriptionForActivity(
        member.id as number,
        true,
      );
      expect(special).not.toBeNull();
      expect(special?.planCategory).toBe("especial");

      const regular = await svc.pickSubscriptionForActivity(
        member.id as number,
        false,
      );
      expect(regular).not.toBeNull();
      expect(regular?.planCategory).toBe("presencial");
    });

    it("devuelve null cuando no hay sub de la categoría pedida", async () => {
      const presencialPlan = await createPlan(app, adminToken, {
        name: "Presencial Solo",
        planCategory: "presencial",
      });
      const member = await createMember(app);
      const r = await assignPlan(app, adminToken, member.id, {
        planId: presencialPlan.id,
      });
      expect(r.statusCode).toBe(201);

      const svc = makeService();
      const special = await svc.pickSubscriptionForActivity(
        member.id as number,
        true,
      );
      expect(special).toBeNull();
    });
  });
});
