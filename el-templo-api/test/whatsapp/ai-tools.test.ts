/**
 * Integration tests for AI tool execution functions.
 *
 * Tests the 4 info tools (check_schedule, check_membership, get_location,
 * request_human) against a real MySQL test database.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../src/db/schema/index";
import { executeTool } from "../../../el-templo-bot/src/ai/tools";

type DB = ReturnType<typeof drizzle<typeof schema>>;

// ─── Test Setup ──────────────────────────────────────────────────────────────

let pool: mysql.Pool;
let db: DB;

// Track IDs for cleanup and reference
let branchId: number;
let activityId: number;
let scheduleId: number;
let userId: number;
let planId: number;
let conversationId: number;

beforeAll(async () => {
  pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: "eltemplo_test",
  });

  db = drizzle(pool, { schema, mode: "default" });
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  // Clean up in reverse FK order
  await pool.execute("DELETE FROM bookings");
  await pool.execute("DELETE FROM subscriptions");
  await pool.execute("DELETE FROM whatsapp_messages");
  await pool.execute("DELETE FROM whatsapp_conversations");
  await pool.execute("DELETE FROM schedules");
  await pool.execute("DELETE FROM subscription_plans WHERE name LIKE 'Test%'");
  await pool.execute("DELETE FROM users WHERE email LIKE 'test-tool-%'");
  await pool.execute("DELETE FROM activities WHERE name LIKE 'Test%'");
  await pool.execute("DELETE FROM branches WHERE code LIKE 'TST%'");

  // Seed a branch
  const [branchResult] = await pool.execute(
    `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
     VALUES ('Test Alem', 'alem', 20, true, NOW(), NOW())`,
  );
  branchId = (branchResult as { insertId: number }).insertId;

  // Seed an activity
  const [activityResult] = await pool.execute(
    `INSERT INTO activities (name, is_active, created_at, updated_at)
     VALUES ('Test CrossFit', true, NOW(), NOW())`,
  );
  activityId = (activityResult as { insertId: number }).insertId;

  // Seed a schedule (Monday = 1, 08:00-09:00)
  const [scheduleResult] = await pool.execute(
    `INSERT INTO schedules (branch_id, activity_id, day_of_week, start_time, end_time, is_active, created_at, updated_at)
     VALUES (?, ?, 1, '08:00', '09:00', true, NOW(), NOW())`,
    [branchId, activityId],
  );
  scheduleId = (scheduleResult as { insertId: number }).insertId;

  // Seed a user with phone
  const [userResult] = await pool.execute(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, branch_id, is_active, created_at, updated_at)
     VALUES ('test-tool-member@test.com', 'hash123', 'Juan', 'Perez', '5491100000099', 'member', ?, true, NOW(), NOW())`,
    [branchId],
  );
  userId = (userResult as { insertId: number }).insertId;

  // Seed a subscription plan
  const [planResult] = await pool.execute(
    `INSERT INTO subscription_plans (name, plan_tier, booking_mode, price_regular, price_zero, duration_days, classes_per_week, multi_branch, is_trial, is_active, is_archived, created_at, updated_at)
     VALUES ('Test Foundation 3x', 'foundation', 'fixed', 15000, 12000, 30, 3, false, false, true, false, NOW(), NOW())`,
  );
  planId = (planResult as { insertId: number }).insertId;

  // Seed a conversation
  const [convResult] = await pool.execute(
    `INSERT INTO whatsapp_conversations (phone, contact_name, conversation_status, client_state, last_message_at, created_at, updated_at)
     VALUES ('5491100000099', 'Juan Perez', 'active', 'active_member', NOW(), NOW(), NOW())`,
  );
  conversationId = (convResult as { insertId: number }).insertId;
});

// ─── check_schedule ──────────────────────────────────────────────────────────

describe("check_schedule", () => {
  it("returns formatted schedule data", async () => {
    const result = await executeTool("check_schedule", {}, db);

    expect(result).toContain("Test CrossFit");
    expect(result).toContain("Test Alem");
    expect(result).toContain("Lunes");
    expect(result).toContain("08:00-09:00");
    expect(result).toContain("20 lugares");
  });

  it("filters by branchId", async () => {
    // Create a second branch with a schedule
    const [branch2Result] = await pool.execute(
      `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
       VALUES ('Test Constitucion', 'TSTB', 15, true, NOW(), NOW())`,
    );
    const branch2Id = (branch2Result as { insertId: number }).insertId;

    await pool.execute(
      `INSERT INTO schedules (branch_id, activity_id, day_of_week, start_time, end_time, is_active, created_at, updated_at)
       VALUES (?, ?, 2, '10:00', '11:00', true, NOW(), NOW())`,
      [branch2Id, activityId],
    );

    const result = await executeTool(
      "check_schedule",
      { branchId: branch2Id },
      db,
    );

    expect(result).toContain("Test Constitucion");
    expect(result).not.toContain("Test Alem");
  });

  it("filters by dayOfWeek", async () => {
    const result = await executeTool("check_schedule", { dayOfWeek: 1 }, db);

    expect(result).toContain("Lunes");
    expect(result).toContain("Test CrossFit");
  });

  it("returns no-results message when nothing matches", async () => {
    const result = await executeTool("check_schedule", { dayOfWeek: 0 }, db);

    expect(result).toContain("No encontré clases disponibles");
  });

  it("accounts for bookings in spots remaining", async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Add 18 bookings
    for (let i = 0; i < 18; i++) {
      const email = `test-tool-booker${i}@test.com`;
      const [uResult] = await pool.execute(
        `INSERT INTO users (email, password_hash, first_name, role, branch_id, is_active, created_at, updated_at)
         VALUES (?, 'hash', 'Booker', 'member', ?, true, NOW(), NOW())`,
        [email, branchId],
      );
      const bookerId = (uResult as { insertId: number }).insertId;

      await pool.execute(
        `INSERT INTO bookings (member_id, schedule_id, booking_date, status, booked_at)
         VALUES (?, ?, ?, 'reservado', NOW())`,
        [bookerId, scheduleId, today],
      );
    }

    const result = await executeTool("check_schedule", { dayOfWeek: 1 }, db);

    expect(result).toContain("2 lugares");
  });

  it("shows 'lleno' when at capacity", async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Fill to capacity (20 bookings)
    for (let i = 0; i < 20; i++) {
      const email = `test-tool-full${i}@test.com`;
      const [uResult] = await pool.execute(
        `INSERT INTO users (email, password_hash, first_name, role, branch_id, is_active, created_at, updated_at)
         VALUES (?, 'hash', 'Full', 'member', ?, true, NOW(), NOW())`,
        [email, branchId],
      );
      const fullId = (uResult as { insertId: number }).insertId;

      await pool.execute(
        `INSERT INTO bookings (member_id, schedule_id, booking_date, status, booked_at)
         VALUES (?, ?, ?, 'reservado', NOW())`,
        [fullId, scheduleId, today],
      );
    }

    const result = await executeTool("check_schedule", { dayOfWeek: 1 }, db);

    expect(result).toContain("lleno");
  });

  it("does not count cancelled bookings in spots", async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Add 20 cancelled bookings -- should not affect spots
    for (let i = 0; i < 20; i++) {
      const email = `test-tool-cancel${i}@test.com`;
      const [uResult] = await pool.execute(
        `INSERT INTO users (email, password_hash, first_name, role, branch_id, is_active, created_at, updated_at)
         VALUES (?, 'hash', 'Cancel', 'member', ?, true, NOW(), NOW())`,
        [email, branchId],
      );
      const cancelId = (uResult as { insertId: number }).insertId;

      await pool.execute(
        `INSERT INTO bookings (member_id, schedule_id, booking_date, status, booked_at)
         VALUES (?, ?, ?, 'cancelado', NOW())`,
        [cancelId, scheduleId, today],
      );
    }

    const result = await executeTool("check_schedule", { dayOfWeek: 1 }, db);

    // All 20 spots should be available since all bookings are cancelled
    expect(result).toContain("20 lugares");
  });
});

// ─── check_membership ────────────────────────────────────────────────────────

describe("check_membership", () => {
  it("returns subscription info for active member", async () => {
    // Create active subscription
    await pool.execute(
      `INSERT INTO subscriptions (user_id, plan_id, branch_id, status, start_date, end_date, price_paid, price_type_applied, created_at, updated_at)
       VALUES (?, ?, ?, 'active', '2026-03-01', '2026-03-31', 15000, 'regular', NOW(), NOW())`,
      [userId, planId, branchId],
    );

    const result = await executeTool(
      "check_membership",
      { phone: "5491100000099" },
      db,
    );

    expect(result).toContain("Juan Perez");
    expect(result).toContain("Test Foundation 3x");
    expect(result).toContain("Activa");
    expect(result).toContain("2026-03-01");
    expect(result).toContain("2026-03-31");
    expect(result).toContain("$15000");
    expect(result).toContain("3 clases/semana");
  });

  it("returns no-account message for unknown phone", async () => {
    const result = await executeTool(
      "check_membership",
      { phone: "0000000000" },
      db,
    );

    expect(result).toContain("No encontré una cuenta con ese número");
    expect(result).toContain("registrado con otro número");
  });

  it("returns available plans when no active subscription", async () => {
    const result = await executeTool(
      "check_membership",
      { phone: "5491100000099" },
      db,
    );

    expect(result).toContain("Juan Perez");
    expect(result).toContain("no tiene una suscripción activa");
    expect(result).toContain("Test Foundation 3x");
    expect(result).toContain("$15000");
    expect(result).toContain("30 días");
  });

  it("excludes trial plans from available plans list", async () => {
    // Add a trial plan
    await pool.execute(
      `INSERT INTO subscription_plans (name, plan_tier, booking_mode, price_regular, price_zero, duration_days, classes_per_week, is_trial, is_active, is_archived, created_at, updated_at)
       VALUES ('Test Trial', 'flex', 'flexible', 0, 0, 7, 1, true, true, false, NOW(), NOW())`,
    );

    const result = await executeTool(
      "check_membership",
      { phone: "5491100000099" },
      db,
    );

    expect(result).not.toContain("Test Trial");
    expect(result).toContain("Test Foundation 3x");
  });

  it("returns error when no phone provided", async () => {
    const result = await executeTool("check_membership", {}, db);

    expect(result).toContain("número de teléfono");
  });
});

// ─── get_location ────────────────────────────────────────────────────────────

describe("get_location", () => {
  it("returns all active branches with maps links", async () => {
    const result = await executeTool("get_location", {}, db);

    expect(result).toContain("Test Alem");
    expect(result).toContain("google.com/maps/search");
    expect(result).toContain("Av. Leandro N. Alem 896");
  });

  it("filters by branch name", async () => {
    // Add a second branch
    await pool.execute(
      `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
       VALUES ('Test Constitucion', 'constitucion', 15, true, NOW(), NOW())`,
    );

    const result = await executeTool(
      "get_location",
      { branchName: "Constitucion" },
      db,
    );

    expect(result).toContain("Test Constitucion");
    expect(result).toContain("Av. Constitución 1050");
    expect(result).not.toContain("Test Alem");
  });

  it("returns all branches when name filter has no match", async () => {
    const result = await executeTool(
      "get_location",
      { branchName: "NoExiste" },
      db,
    );

    expect(result).toContain("No encontré una sede con");
    expect(result).toContain("Test Alem");
  });

  it("returns no-branches message when none are active", async () => {
    // Deactivate all branches
    await pool.execute("UPDATE branches SET is_active = false");

    const result = await executeTool("get_location", {}, db);

    expect(result).toContain("No encontré sedes disponibles");
  });
});

// ─── request_human ───────────────────────────────────────────────────────────

describe("request_human", () => {
  it("updates conversation status to human_takeover", async () => {
    const result = await executeTool(
      "request_human",
      { reason: "El usuario quiere hablar con alguien" },
      db,
      conversationId,
    );

    expect(result).toContain("transferida a un agente humano");
    expect(result).toContain("El usuario quiere hablar con alguien");

    // Verify DB was updated
    const [rows] = await pool.execute(
      "SELECT conversation_status FROM whatsapp_conversations WHERE id = ?",
      [conversationId],
    );
    const conversations = rows as Record<string, unknown>[];
    expect(conversations[0].conversation_status).toBe("human_takeover");
  });

  it("returns error when no conversation ID provided", async () => {
    const result = await executeTool("request_human", { reason: "test" }, db);

    expect(result).toContain("ID de conversación no disponible");
  });

  it("uses default reason when none provided", async () => {
    const result = await executeTool("request_human", {}, db, conversationId);

    expect(result).toContain("Sin motivo especificado");
  });
});

// ─── executeTool dispatcher ──────────────────────────────────────────────────

describe("executeTool", () => {
  it("returns error for unknown tool name", async () => {
    const result = await executeTool("unknown_tool", {}, db);

    expect(result).toContain("no disponible");
  });
});
