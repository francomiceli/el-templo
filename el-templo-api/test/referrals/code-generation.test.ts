/**
 * Fase 157 Plan 02 — Task 1: generación de código + resolución + config.
 *
 * Cubre (acceptance): formato PREFIJO-XXXX, idempotencia (2da llamada = mismo
 * código), colisión forzada → reintenta y persiste distinto, y getReferralConfig
 * con fila sembrada y sin fila (fallback {10,40}).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { createMember } from "../subscriptions/_helpers";
import { ReferralService } from "../../src/modules/referrals/service";
import type { TenantContext } from "../../src/modules/shared/tenant";

// T-173-08: `resolveReferralCode` recibe `ctx` primero.
const CTX: TenantContext = { tenantId: 1 };

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

/** Elimina la calibración local (stale seed = 50) para probar el fallback. */
async function clearReferralConfig(): Promise<void> {
  await app.db.execute(
    sql`DELETE FROM aura_config WHERE aura_config_source_type = 'referral'`,
  );
  await app.db.execute(
    sql`DELETE FROM system_settings WHERE setting_key = 'referral.max_percent_cap'`,
  );
}

/**
 * El registro asigna referral_code EAGER (157-03, auth/routes.ts), así que los
 * fixtures de createMember nacen con código y generateReferralCode devuelve el
 * existente sin consultar el suffixFn inyectado. Los tests que necesitan
 * ejercitar la GENERACIÓN (colisión, prefijo estable) anulan el código primero.
 */
async function clearCode(userId: number): Promise<void> {
  await app.db.execute(
    sql`UPDATE users SET referral_code = NULL WHERE id = ${userId}`,
  );
}

/** Fija la calibración de referidos a valores conocidos. */
async function setReferralConfig(percent: number, cap: number): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO aura_config (aura_config_source_type, default_amount)
        VALUES ('referral', ${percent})
        ON DUPLICATE KEY UPDATE default_amount = ${percent}`,
  );
  await app.db.execute(
    sql`INSERT INTO system_settings (setting_key, setting_value)
        VALUES ('referral.max_percent_cap', ${String(cap)})
        ON DUPLICATE KEY UPDATE setting_value = ${String(cap)}`,
  );
}

describe("ReferralService.generateReferralCode", () => {
  it("genera un código con formato PREFIJO-XXXX derivado del nombre", async () => {
    const member = await createMember(app, {
      email: "franco-code@test.com",
      firstName: "Franco",
    });
    const service = new ReferralService(app.db, app.log);

    const code = await service.generateReferralCode(member.id);

    expect(code).toMatch(/^[A-Z]+-[A-Z0-9]+$/);
    expect(code.startsWith("FRAN-")).toBe(true);
  });

  it("es idempotente: la 2da llamada devuelve el mismo código", async () => {
    const member = await createMember(app, {
      email: "idem-code@test.com",
      firstName: "Ludmila",
    });
    const service = new ReferralService(app.db, app.log);

    const first = await service.generateReferralCode(member.id);
    const second = await service.generateReferralCode(member.id);

    expect(second).toBe(first);
  });

  it("ante colisión del UNIQUE reintenta y persiste un código distinto", async () => {
    const a = await createMember(app, {
      email: "collide-a@test.com",
      firstName: "Franco",
    });
    const b = await createMember(app, {
      email: "collide-b@test.com",
      firstName: "Franco",
    });
    await clearCode(a.id);
    await clearCode(b.id);

    // A ocupa FRAN-AAAA (sufijo fijo).
    const serviceA = new ReferralService(app.db, app.log, () => "AAAA");
    const codeA = await serviceA.generateReferralCode(a.id);
    expect(codeA).toBe("FRAN-AAAA");

    // B intenta FRAN-AAAA (colisión) y luego FRAN-BBBB.
    let call = 0;
    const serviceB = new ReferralService(app.db, app.log, () =>
      call++ === 0 ? "AAAA" : "BBBB",
    );
    const codeB = await serviceB.generateReferralCode(b.id);

    expect(codeB).toBe("FRAN-BBBB");
    expect(codeB).not.toBe(codeA);
  });

  it("usa prefijo estable cuando el nombre no tiene letras", async () => {
    const member = await createMember(app, {
      email: "noletters@test.com",
      firstName: "123",
    });
    await clearCode(member.id);
    const service = new ReferralService(app.db, app.log, () => "ZZZZ");

    const code = await service.generateReferralCode(member.id);

    expect(code).toBe("REF-ZZZZ");
  });
});

describe("ReferralService.resolveReferralCode", () => {
  it("resuelve code → userId y devuelve null si no existe", async () => {
    const member = await createMember(app, {
      email: "resolve@test.com",
      firstName: "Nadia",
    });
    const service = new ReferralService(app.db, app.log);
    const code = await service.generateReferralCode(member.id);

    expect(await service.resolveReferralCode(CTX, code)).toBe(member.id);
    expect(await service.resolveReferralCode(CTX, "NOPE-9999")).toBeNull();
  });
});

describe("ReferralService.getReferralConfig", () => {
  it("sin fila sembrada devuelve el fallback {10, 40}", async () => {
    await clearReferralConfig();
    const service = new ReferralService(app.db, app.log);

    const cfg = await service.getReferralConfig();

    expect(cfg).toEqual({ percentPerLink: 10, maxPercentCap: 40 });
  });

  it("con filas sembradas devuelve los valores configurados", async () => {
    await setReferralConfig(15, 55);
    const service = new ReferralService(app.db, app.log);

    const cfg = await service.getReferralConfig();

    expect(cfg).toEqual({ percentPerLink: 15, maxPercentCap: 55 });
  });
});
