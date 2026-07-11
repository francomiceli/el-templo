/**
 * Fase 157 Plan 02 — Task 3: backfill idempotente de referralCode (D-25).
 *
 * Cubre (acceptance): los socios sin código quedan con formato PREFIJO-XXXX tras
 * el backfill; idempotencia (2da corrida no cambia códigos ya asignados); un
 * socio con código previo no es tocado; dry-run no escribe.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { createMember } from "../subscriptions/_helpers";
import { backfillReferralCodes } from "../../src/scripts/backfill-referral-codes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
  await getAuthToken(app, "admin@test.com", "adminpass123");
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
});

async function readCode(userId: number): Promise<string | null> {
  const [rows] = await app.db.execute(
    sql`SELECT referral_code FROM users WHERE id = ${userId}`,
  );
  return (rows as Array<{ referral_code: string | null }>)[0]?.referral_code;
}

/**
 * El registro asigna referral_code EAGER (157-03, auth/routes.ts), así que
 * todo fixture de createMember nace con código. El backfill existe para los
 * socios legacy pre-157: estos tests simulan ese estado anulando el código.
 */
async function clearCode(userId: number): Promise<void> {
  await app.db.execute(
    sql`UPDATE users SET referral_code = NULL WHERE id = ${userId}`,
  );
}

describe("backfillReferralCodes", () => {
  it("asigna un código válido a los socios sin referral_code", async () => {
    const a = await createMember(app, {
      email: "bf-a@test.com",
      firstName: "Franco",
    });
    const b = await createMember(app, {
      email: "bf-b@test.com",
      firstName: "Ludmila",
    });
    await clearCode(a.id);
    await clearCode(b.id);

    const result = await backfillReferralCodes(app.db, { apply: true });

    expect(result.assigned).toBeGreaterThanOrEqual(2);
    expect(result.errors).toBe(0);
    expect(await readCode(a.id)).toMatch(/^[A-Z]+-[A-Z0-9]+$/);
    expect(await readCode(b.id)).toMatch(/^[A-Z]+-[A-Z0-9]+$/);
  });

  it("es idempotente: la 2da corrida no cambia los códigos ya asignados", async () => {
    const m = await createMember(app, {
      email: "bf-idem@test.com",
      firstName: "Nadia",
    });
    await clearCode(m.id);

    await backfillReferralCodes(app.db, { apply: true });
    const codeAfterFirst = await readCode(m.id);

    const second = await backfillReferralCodes(app.db, { apply: true });
    const codeAfterSecond = await readCode(m.id);

    expect(codeAfterSecond).toBe(codeAfterFirst);
    // La 2da corrida no encuentra candidatos con el código ya poblado.
    expect(second.assigned).toBe(0);
  });

  it("no toca a un socio que ya tenía código", async () => {
    const withCode = await createMember(app, {
      email: "bf-pre@test.com",
      firstName: "Pedro",
    });
    await app.db.execute(
      sql`UPDATE users SET referral_code = 'PREEXIST-1' WHERE id = ${withCode.id}`,
    );
    const without = await createMember(app, {
      email: "bf-null@test.com",
      firstName: "Sofia",
    });
    await clearCode(without.id);

    await backfillReferralCodes(app.db, { apply: true });

    expect(await readCode(withCode.id)).toBe("PREEXIST-1");
    expect(await readCode(without.id)).toMatch(/^[A-Z]+-[A-Z0-9]+$/);
  });

  it("dry-run reporta candidatos sin escribir", async () => {
    const m = await createMember(app, {
      email: "bf-dry@test.com",
      firstName: "Ivan",
    });
    await clearCode(m.id);

    const result = await backfillReferralCodes(app.db, { apply: false });

    expect(result.candidates).toBeGreaterThanOrEqual(1);
    expect(result.assigned).toBe(0);
    expect(await readCode(m.id)).toBeNull();
  });
});
