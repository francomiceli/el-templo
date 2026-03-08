/**
 * Integration tests for AuraService
 *
 * Tests award/spend/getBalance against the eltemplo_test database.
 * Requires AURA schema tables (aura_transactions, aura_balances, aura_config)
 * to exist from migration 0030.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp, registerUser } from "../helpers";
import { AuraService } from "../../src/modules/aura/service";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";

let app: FastifyInstance;
let auraService: AuraService;
let testUserId: number;

beforeAll(async () => {
  app = await createTestApp();
  auraService = new AuraService(app.db, app.log);

  // Create a test user
  const result = await registerUser(app, {
    email: `aura-test-${Date.now()}@test.com`,
    password: "TestPass123!",
    firstName: "Aura",
    lastName: "Tester",
    branchId: 1,
  });
  testUserId = result.user.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  // Clean AURA tables before each test
  await app.db.execute(sql`DELETE FROM aura_transactions`);
  await app.db.execute(sql`DELETE FROM aura_balances`);
  await app.db.execute(sql`DELETE FROM aura_config`);

  // Seed aura_config with test defaults
  await app.db.execute(sql`
    INSERT INTO aura_config (aura_config_source_type, default_amount, description, is_active)
    VALUES
      ('training_completion', 10, 'Training session completed', true),
      ('attendance', 5, 'Class attendance', true),
      ('streak_bonus', 20, 'Streak bonus', true),
      ('manual_adjustment', 0, 'Manual adjustment', true)
  `);
});

describe("AuraService.award()", () => {
  it("creates a ledger entry and updates balance atomically", async () => {
    const newBalance = await auraService.award({
      userId: testUserId,
      sourceType: "training_completion",
      referenceType: "session",
      referenceId: 1,
    });

    expect(newBalance).toBe(10); // default from aura_config
  });

  it("uses explicit amount when provided, overriding config default", async () => {
    const newBalance = await auraService.award({
      userId: testUserId,
      sourceType: "training_completion",
      referenceType: "session",
      referenceId: 1,
      amount: 25,
    });

    expect(newBalance).toBe(25);
  });

  it("accumulates balance across multiple awards", async () => {
    await auraService.award({
      userId: testUserId,
      sourceType: "training_completion",
      referenceType: "session",
      referenceId: 1,
    });

    const newBalance = await auraService.award({
      userId: testUserId,
      sourceType: "attendance",
      referenceType: "class",
      referenceId: 1,
    });

    expect(newBalance).toBe(15); // 10 + 5
  });

  it("rejects duplicate awards (same userId + sourceType + referenceType + referenceId)", async () => {
    await auraService.award({
      userId: testUserId,
      sourceType: "training_completion",
      referenceType: "session",
      referenceId: 1,
    });

    await expect(
      auraService.award({
        userId: testUserId,
        sourceType: "training_completion",
        referenceType: "session",
        referenceId: 1,
      }),
    ).rejects.toThrow();
  });

  it("stores optional description in the ledger entry", async () => {
    await auraService.award({
      userId: testUserId,
      sourceType: "training_completion",
      referenceType: "session",
      referenceId: 1,
      description: "Completed Week 12 Day 3",
    });

    // Verify by querying the transaction directly
    const [rows] = await app.db.execute(
      sql`SELECT description FROM aura_transactions WHERE user_id = ${testUserId}`,
    );
    expect((rows as Array<{ description: string }>)[0].description).toBe(
      "Completed Week 12 Day 3",
    );
  });
});

describe("AuraService.spend()", () => {
  it("creates a negative ledger entry and decrements balance", async () => {
    // First award some AURA
    await auraService.award({
      userId: testUserId,
      sourceType: "training_completion",
      referenceType: "session",
      referenceId: 1,
      amount: 50,
    });

    const newBalance = await auraService.spend({
      userId: testUserId,
      amount: 20,
      description: "Spent on reward",
    });

    expect(newBalance).toBe(30);
  });

  it("rejects spend when balance is insufficient", async () => {
    // Award 10 AURA
    await auraService.award({
      userId: testUserId,
      sourceType: "training_completion",
      referenceType: "session",
      referenceId: 1,
      amount: 10,
    });

    await expect(
      auraService.spend({
        userId: testUserId,
        amount: 50,
        description: "Too expensive",
      }),
    ).rejects.toThrow("Insufficient");

    // Verify balance unchanged
    const balance = await auraService.getBalance(testUserId);
    expect(balance).toBe(10);
  });

  it("rejects spend when user has no balance record", async () => {
    await expect(
      auraService.spend({
        userId: testUserId,
        amount: 10,
        description: "No balance",
      }),
    ).rejects.toThrow("Insufficient");
  });
});

describe("AuraService.getBalance()", () => {
  it("returns current balance for a user", async () => {
    await auraService.award({
      userId: testUserId,
      sourceType: "training_completion",
      referenceType: "session",
      referenceId: 1,
      amount: 42,
    });

    const balance = await auraService.getBalance(testUserId);
    expect(balance).toBe(42);
  });

  it("returns 0 for a user with no balance record", async () => {
    const balance = await auraService.getBalance(testUserId);
    expect(balance).toBe(0);
  });

  it("returns 0 for a non-existent user", async () => {
    const balance = await auraService.getBalance(999999);
    expect(balance).toBe(0);
  });
});
