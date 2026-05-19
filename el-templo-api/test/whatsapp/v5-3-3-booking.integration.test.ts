/**
 * v5.3.3 Phase 95 — BUG-03 (BOOK-01) booking-reliability RED integration tests.
 *
 * Plan 95-01 (audit-first investigation): each `describe` block discriminates
 * ONE candidate from the 5 enumerated in `.planning/v5.3.3-codebase-audit.md:185-260`
 * and locked in `95-CONTEXT.md` D-01, PLUS a sixth candidate newly discovered
 * during this audit session (see Section B candidate (vi) in 95-AUDIT.md).
 *
 *   - candidate (i)   LIKE-search ambiguity at `el-templo-bot/src/ai/tools.ts:455`
 *   - candidate (ii)  cross-branch result mixing at `tools.ts:285-302`
 *   - candidate (iv)  LIMIT-6 truncation at `tools.ts:301`
 *   - candidate (v)   `booking_count` correlated subquery with today-filter at `tools.ts:267, 281`
 *   - candidate (vi)  NEWLY DISCOVERED — `bk.status` column mismatch at `tools.ts:282`
 *                     (production column is `booking_status`, not `status` —
 *                     causes `check_schedule` SQL to throw on ANY query)
 *
 *   (candidate (iii) Sunday=0 vs Sunday=7 lives in
 *   `el-templo-bot/test/v5-3-3-booking-reliability.test.ts` — it is a
 *   model/prompt-side discriminator, no SQL discriminator possible.)
 *
 * TDD fail-in-main (CONTEXT.md D-20): at least one assertion per candidate
 * MUST fail against current `master`. Plan 95-02 turns these GREEN without
 * test modification at the audit-named code surface (Branch verdict in
 * `95-AUDIT.md` Section C / Section E).
 *
 * Pattern: mirrors `el-templo-api/test/whatsapp/ai-tools.test.ts` —
 * direct mysql2 pool + drizzle + per-test truncate + inline seed + direct
 * `executeTool` invocation. No Fastify, no webhook layer.
 *
 * Namespace conventions (avoid collision with `ai-tools.test.ts` seeds):
 *   - branches.code   LIKE 'TST%'      (this file only)
 *   - users.email     LIKE 'test-book-%' (this file only)
 *   - activities.name LIKE 'Test%'     (shared cleanup with ai-tools.test.ts)
 *
 * Per `el-templo-bot/CLAUDE.md` Standards: no `console.*`, no `any` types,
 * `catch (err: unknown)` with `instanceof Error` narrowing.
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
  // Clean up in reverse FK order. Same namespace as plan §threat-model T-95-01-07.
  await pool.execute("DELETE FROM bookings");
  await pool.execute("DELETE FROM subscriptions");
  await pool.execute("DELETE FROM whatsapp_messages");
  await pool.execute("DELETE FROM whatsapp_conversations");
  await pool.execute("DELETE FROM schedules");
  await pool.execute("DELETE FROM subscription_plans WHERE name LIKE 'Test%'");
  await pool.execute("DELETE FROM users WHERE email LIKE 'test-book-%'");
  await pool.execute("DELETE FROM activities WHERE name LIKE 'Test%'");
  await pool.execute("DELETE FROM branches WHERE code LIKE 'TST%'");
});

// ─────────────────────────────────────────────────────────────────────────────
// Candidate (i) — LIKE-search ambiguity at tools.ts:455
//
// `getLocation` runs `WHERE is_active = true AND name LIKE %branchName%`.
// When two branches share a substring (e.g., "Moreno" and "Mar del Plata
// Moreno"), the LIKE matches BOTH rows. The current production branch set
// (`BRANCH_ADDRESSES` at tools.ts:39-45) has NO substring-overlapping pair,
// so candidate (i) DOES NOT FIRE against real data — but the latent defect
// can be demonstrated by seeding synthetic substring-overlapping branches.
//
// The RED assertion locks the canonical fix shape (exact-match-with-fallback):
//   - exact-match on the full normalized branch name first
//   - LIKE fallback only when no exact match
// On master, the LIKE is the first (and only) lookup, so the substring
// query returns BOTH branches → the assertion `result mentions exactly one
// branch` FAILS.
// ─────────────────────────────────────────────────────────────────────────────

describe("BUG-03 candidate (i) — LIKE-search ambiguity at tools.ts:455", () => {
  beforeEach(async () => {
    // Seed two branches whose names are substring-overlapping. The shorter
    // name ('Moreno') is a substring of the longer one ('Mar del Plata
    // Moreno'). On master, `WHERE name LIKE '%moreno%'` matches BOTH rows.
    await pool.execute(
      `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
       VALUES ('Moreno', 'TSTB1', 20, true, NOW(), NOW())`,
    );
    await pool.execute(
      `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
       VALUES ('Mar del Plata Moreno', 'TSTB2', 20, true, NOW(), NOW())`,
    );
  });

  it("RED: returns exactly one disambiguated branch for substring-match input (FAILS on master)", async () => {
    const result = await executeTool(
      "get_location",
      { branchName: "Moreno" },
      db,
    );

    // Audit-named expected fix (Section E candidate (i)):
    //   exact-match on full normalized name FIRST, LIKE fallback ONLY when
    //   no exact match. Under the fix, branchName="Moreno" hits the exact
    //   row 'Moreno' (TSTB1) and returns ONLY that row.
    //
    // RED expectation: the formatted output mentions 'Moreno' once and
    // does NOT mention 'Mar del Plata Moreno'. On master, both branches
    // are returned by the LIKE and both appear in the result string.
    expect(result).toContain("Moreno");
    expect(result).not.toContain("Mar del Plata Moreno");
  });

  it("RED: falls back to LIKE only when no exact match exists (regression protector for canonical fix)", async () => {
    // When the input does NOT match any exact branch name, the canonical
    // fix MUST fall back to LIKE (preserve substring-search behavior for
    // partial inputs). branchName="del Plata" has no exact-match row;
    // canonical fix returns the LIKE match.
    const result = await executeTool(
      "get_location",
      { branchName: "del Plata" },
      db,
    );

    expect(result).toContain("Mar del Plata Moreno");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Candidate (ii) — Cross-branch result mixing at tools.ts:285-302
//
// `checkSchedule` accepts an OPTIONAL `branchId`. When the model calls the
// tool without `branchId`, the query joins across ALL active branches with
// `LIMIT 6`. The result string interleaves schedules from up to 5 venues
// without any visual disambiguation header — matching the live-test BUG-03
// transcript shape ("se confundió entre Constitución y Moreno").
//
// The RED assertion locks the canonical fix shape (Section E candidate (ii)):
//   require `branchId` OR emit an explicit venue-disambiguation header when
//   the result contains rows from >1 branch.
//
// On master, the result lines look like
//   `- Test CrossFit (TST Alem) — Lunes 08:00-09:00 — 20 cupos disponibles`
//   `- Test CrossFit (TST Constitucion) — Lunes 08:00-09:00 — 15 cupos disponibles`
// with NO header / sentinel indicating multi-venue mixing. The RED
// assertion checks for the post-fix sentinel (either a disambiguation
// header string OR the absence of mixed branches in the output).
// ─────────────────────────────────────────────────────────────────────────────

describe("BUG-03 candidate (ii) — Cross-branch result mixing at tools.ts:285-302", () => {
  let branch1Id: number;
  let branch2Id: number;
  let activityId: number;

  beforeEach(async () => {
    // Seed two distinct branches.
    const [b1] = await pool.execute(
      `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
       VALUES ('TST Alem', 'TSTBA', 20, true, NOW(), NOW())`,
    );
    branch1Id = (b1 as { insertId: number }).insertId;

    const [b2] = await pool.execute(
      `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
       VALUES ('TST Constitucion', 'TSTBC', 15, true, NOW(), NOW())`,
    );
    branch2Id = (b2 as { insertId: number }).insertId;

    // Single shared activity.
    const [act] = await pool.execute(
      `INSERT INTO activities (name, is_active, created_at, updated_at)
       VALUES ('Test CrossFit', true, NOW(), NOW())`,
    );
    activityId = (act as { insertId: number }).insertId;

    // Same day-of-week, same time, both branches — guarantees both rows
    // appear in the unfiltered LIMIT-6 result.
    // NOTE: `start_time`/`end_time` are varchar(5) ("HH:MM") per
    // `el-templo-api/src/db/schema/schedules.ts:15-16`. NOT mysql TIME.
    await pool.execute(
      `INSERT INTO schedules (branch_id, activity_id, day_of_week, start_time, end_time, is_active, created_at, updated_at)
       VALUES (?, ?, 1, '08:00', '09:00', true, NOW(), NOW())`,
      [branch1Id, activityId],
    );
    await pool.execute(
      `INSERT INTO schedules (branch_id, activity_id, day_of_week, start_time, end_time, is_active, created_at, updated_at)
       VALUES (?, ?, 1, '08:00', '09:00', true, NOW(), NOW())`,
      [branch2Id, activityId],
    );
  });

  it("RED: check_schedule without branchId does NOT return rows from multiple branches without disambiguation (FAILS on master)", async () => {
    const result = await executeTool("check_schedule", { dayOfWeek: 1 }, db);

    const mentionsBranch1 = result.includes("TST Alem");
    const mentionsBranch2 = result.includes("TST Constitucion");

    // Audit-named expected fix (Section E candidate (ii)):
    //   when result-rows span >1 branch, either (a) the tool requires
    //   `branchId` and returns a disambiguation-request string, OR (b) the
    //   output groups rows under explicit per-branch headers.
    //
    // RED expectation: the result MUST NOT silently list both branches
    // with the existing flat format (which the model is then expected to
    // visually disambiguate). The two `expect(...).toBe(true)` assertions
    // below cannot BOTH hold post-fix.
    //
    // On master: both branches appear, both booleans are true → assertion
    // fails.
    expect([mentionsBranch1, mentionsBranch2]).not.toEqual([true, true]);
  });

  it("RED: when both branches share a slot, output includes per-branch disambiguation prefix (FAILS on master)", async () => {
    const result = await executeTool("check_schedule", { dayOfWeek: 1 }, db);

    // If candidate (ii)'s canonical fix is option (b) (per-branch header)
    // rather than (a) (require branchId), the output must contain at
    // minimum one of these disambiguation tokens:
    //   - "*TST Alem*" / "*TST Constitucion*" (markdown section headers)
    //   - "En TST Alem:" / "En TST Constitucion:" (Spanish prefix)
    //   - "Sede TST Alem:" / "Sede TST Constitucion:"
    //
    // On master, the format is `- {activity} ({branch}) — {day} {time}...`
    // with NO section header, so none of these patterns match → assertion
    // fails.
    expect(result).toMatch(
      /\*TST Alem\*|\*TST Constitucion\*|En TST Alem:|En TST Constitucion:|Sede TST Alem:|Sede TST Constitucion:/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Candidate (iv) — LIMIT-6 truncation at tools.ts:301
//
// `ORDER BY s.day_of_week, s.start_time LIMIT 6` fetches 6 rows but the
// formatter only displays the first 5. If a user's relevant schedule sorts
// to position 7+, the tool returns "Hay más clases disponibles. ¿Querés
// filtrar por día o tipo de clase?" — a generic message that does NOT
// include a real total count (the comment at `tools.ts:325` says "We can't
// know the exact total without a COUNT query").
//
// The RED assertion locks the canonical fix shape (Section E candidate (iv)):
//   either (a) increase LIMIT and paginate, (b) emit a real COUNT(*) total,
//   or (c) display all matching rows up to a reasonable cap with the actual
//   number quoted ("hay 9 clases más" not "hay más clases").
//
// On master: 7+ schedules → output truncates to the first 5 displayed +
// generic "Hay más clases" suffix → no numeric total → assertion fails.
// ─────────────────────────────────────────────────────────────────────────────

describe("BUG-03 candidate (iv) — LIMIT-6 truncation at tools.ts:301", () => {
  let branchId: number;
  let activityId: number;

  beforeEach(async () => {
    const [b] = await pool.execute(
      `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
       VALUES ('TST LimitBranch', 'TSTLB', 20, true, NOW(), NOW())`,
    );
    branchId = (b as { insertId: number }).insertId;

    const [act] = await pool.execute(
      `INSERT INTO activities (name, is_active, created_at, updated_at)
       VALUES ('Test LimitYoga', true, NOW(), NOW())`,
    );
    activityId = (act as { insertId: number }).insertId;

    // Seed 7 schedules whose (day_of_week, start_time) ordering places six
    // schedules on day_of_week=1 at times 08:00..13:00 (rows 1-6 under
    // ORDER BY) and a 7th schedule on day_of_week=6 (Saturday) at 21:00.
    // The 7th will be at row position 7+ and therefore truncated by
    // `LIMIT 6` / `displayRows.slice(0, 5)`.
    // NOTE: `start_time`/`end_time` are varchar(5) ("HH:MM") per schema.
    const startTimes = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00"];
    for (const startTime of startTimes) {
      const endHour = Number(startTime.slice(0, 2)) + 1;
      const endTime = `${String(endHour).padStart(2, "0")}:00`;
      await pool.execute(
        `INSERT INTO schedules (branch_id, activity_id, day_of_week, start_time, end_time, is_active, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, true, NOW(), NOW())`,
        [branchId, activityId, startTime, endTime],
      );
    }
    // Position 7: Saturday 21:00 — the "target" schedule the user wants.
    await pool.execute(
      `INSERT INTO schedules (branch_id, activity_id, day_of_week, start_time, end_time, is_active, created_at, updated_at)
       VALUES (?, ?, 6, '21:00', '22:00', true, NOW(), NOW())`,
      [branchId, activityId],
    );
  });

  it("RED: unfiltered check_schedule surfaces a real total count for >6 matches (FAILS on master)", async () => {
    const result = await executeTool("check_schedule", {}, db);

    // Audit-named expected fix (Section E candidate (iv)):
    //   emit a real COUNT(*) total in the "hay más" message — e.g.,
    //   "Hay 7 clases en total" or "hay 2 clases más" rather than the
    //   current generic "Hay más clases disponibles. ¿Querés filtrar..."
    //
    // RED expectation: result string contains a digit somewhere in the
    // "más / total / clases" phrase. The current master message has NO
    // digit, so the regex `\d+\s+clases? (más|en total)` fails.
    //
    // On master, the truncation message is:
    //   "Hay más clases disponibles. ¿Querés filtrar por día o tipo de clase?"
    // No digit before "clases" → assertion fails.
    expect(result).toMatch(/\d+\s+clases?\s+(más|en total)/i);
  });

  it("RED: target Saturday 21:00 schedule is reachable in unfiltered query (FAILS on master)", async () => {
    const result = await executeTool("check_schedule", {}, db);

    // Audit-named expected fix (Section E candidate (iv)) alternative
    // shape: bump LIMIT or expose pagination so position-7+ rows are
    // discoverable. On master, the 7th row (Sábado 21:00) is dropped by
    // `LIMIT 6` + `slice(0,5)` and never appears in the formatted output.
    expect(result).toContain("Sábado");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Candidate (v) — `booking_count` correlated subquery with today-filter
// at tools.ts:267, 281
//
//   const today = new Date().toISOString().slice(0, 10);
//   ... WHERE bk.booking_date = ${today} AND bk.status != 'cancelado'
//
// The subquery hard-codes `today` regardless of which date the user is
// asking about. So for any "mañana" query, the booking_count is 0 (no
// bookings ON today for tomorrow's schedules), and "cupos disponibles"
// reports `max_capacity` instead of `max_capacity - actual_tomorrow_count`.
//
// The RED assertion locks the canonical fix shape (Section E candidate (v)):
//   either (a) parameterize booking_date by the user-requested date, or
//   (b) drop the date filter and count all future-bookings, or (c) compute
//   the next occurrence of the schedule's day_of_week and use THAT date.
//
// The seed in this test creates a booking dated TOMORROW for a schedule
// whose day_of_week matches tomorrow. On master, the count returned for
// that schedule is 0 (the today-filter excludes the tomorrow booking) →
// spotsRemaining = 10 - 0 = 10 → "10 cupos disponibles". Post-fix, the
// count would be 1 → spotsRemaining = 9 → "9 cupos disponibles".
// ─────────────────────────────────────────────────────────────────────────────

describe("BUG-03 candidate (v) — booking_count today-filter at tools.ts:267, 281", () => {
  let branchId: number;
  let activityId: number;
  let scheduleId: number;
  let memberId: number;

  beforeEach(async () => {
    // Branch with max_capacity=10 (chosen so spotsRemaining is unambiguous
    // — pre-fix: 10, post-fix: 9).
    const [b] = await pool.execute(
      `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
       VALUES ('TST TomorrowBranch', 'TSTBT', 10, true, NOW(), NOW())`,
    );
    branchId = (b as { insertId: number }).insertId;

    const [act] = await pool.execute(
      `INSERT INTO activities (name, is_active, created_at, updated_at)
       VALUES ('Test TomorrowYoga', true, NOW(), NOW())`,
    );
    activityId = (act as { insertId: number }).insertId;

    // Compute tomorrow's date (UTC, YYYY-MM-DD).
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(now.getUTCDate() + 1);
    const tomorrowDate = tomorrow.toISOString().slice(0, 10);

    // MySQL DAYOFWEEK convention: Sunday=1, Monday=2, ..., Saturday=7.
    // `tools.ts:25-33` uses Sunday=0..Saturday=6 — but the comparison the
    // SQL does (`s.day_of_week = ${dayOfWeek}`) is just integer match
    // against the stored value. We mirror the value used by the rest of
    // the codebase: `Date.getUTCDay()` returns Sunday=0..Saturday=6.
    const tomorrowDayOfWeek = tomorrow.getUTCDay();

    // NOTE: `start_time`/`end_time` are varchar(5) ("HH:MM") per schema.
    const [sch] = await pool.execute(
      `INSERT INTO schedules (branch_id, activity_id, day_of_week, start_time, end_time, is_active, created_at, updated_at)
       VALUES (?, ?, ?, '08:00', '09:00', true, NOW(), NOW())`,
      [branchId, activityId, tomorrowDayOfWeek],
    );
    scheduleId = (sch as { insertId: number }).insertId;

    // Seed a member.
    const [u] = await pool.execute(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, branch_id, is_active, created_at, updated_at)
       VALUES ('test-book-tomorrow@test.com', 'hash', 'Test', 'Booker', '5491100000700', 'member', ?, true, NOW(), NOW())`,
      [branchId],
    );
    memberId = (u as { insertId: number }).insertId;

    // Seed a confirmed booking for TOMORROW (not today). The today-filter
    // at tools.ts:281 (`bk.booking_date = ${today}`) will NOT match this
    // booking, so booking_count returned by the subquery is 0 on master.
    //
    // NOTE: the bookings table column is `booking_status` (from
    // `mysqlEnum("booking_status", ...)` at
    // `el-templo-api/src/db/schema/bookings.ts:15`), NOT `status`. The
    // production source at `tools.ts:282` references `bk.status` —
    // which is the NEWLY DISCOVERED candidate (vi) bug surfaced during
    // this audit (see 95-AUDIT.md Section B candidate (vi)).
    await pool.execute(
      `INSERT INTO bookings (member_id, schedule_id, booking_date, booking_status, booked_at)
       VALUES (?, ?, ?, 'reservado', NOW())`,
      [memberId, scheduleId, tomorrowDate],
    );
  });

  it("RED: cupos disponibles reflects tomorrow's actual bookings, not today's zero (FAILS on master)", async () => {
    const result = await executeTool("check_schedule", {}, db);

    // Sanity: the schedule itself must appear in the result (otherwise
    // the test isn't exercising the discriminator).
    expect(result).toContain("Test TomorrowYoga");

    // Audit-named expected fix (Section E candidate (v)):
    //   booking_count is parameterized by the schedule's next occurrence
    //   date (or a user-supplied date), not hardcoded to `today`. Under
    //   the fix, the seeded tomorrow-booking is counted →
    //     spotsRemaining = 10 - 1 = 9
    //     spotsText = "9 cupos disponibles"
    //
    // On master, the today-filter excludes the tomorrow booking →
    //   booking_count = 0
    //   spotsRemaining = 10 - 0 = 10
    //   spotsText = "10 cupos disponibles"
    // → assertion `result.toContain("9 cupos disponibles")` fails.
    expect(result).toContain("9 cupos disponibles");
    expect(result).not.toContain("10 cupos disponibles");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Candidate (vi) — NEWLY DISCOVERED — `bk.status` column mismatch at
// tools.ts:282
//
// `checkSchedule`'s correlated subquery at `tools.ts:279-282` references
// `bk.status`, but the bookings table column is named `booking_status`
// (declared via `mysqlEnum("booking_status", ...)` at
// `el-templo-api/src/db/schema/bookings.ts:15`). MySQL throws
// `Unknown column 'bk.status' in 'where clause'` for ANY `check_schedule`
// invocation in this codebase.
//
// This candidate is NOT enumerated in `.planning/v5.3.3-codebase-audit.md:185-260`
// (the static codebase audit reviewed the JS-side reasoning but did not
// run the SQL). It was discovered when authoring the RED tests for
// candidates (ii), (iv), (v) — all three crashed with the same SQL error
// before reaching their respective discriminators.
//
// This is the PROXIMATE cause of BUG-03's user-facing symptom — if
// `check_schedule` throws, the model receives an empty / error tool
// result and proceeds to fabricate a response based on partial context.
// The "se confundió entre Constitución y Moreno" transcript shape is
// consistent with the model never receiving real schedule data.
//
// The RED assertion locks the canonical fix: rename `bk.status` to
// `bk.booking_status` at tools.ts:282 (one-character SQL fix). On
// master, `executeTool('check_schedule', ...)` rejects with the SQL
// error → `await` throws → the test catches and asserts the error
// shape, which on master matches but on POST-fix should NOT match
// (the call should resolve successfully).
// ─────────────────────────────────────────────────────────────────────────────

describe("BUG-03 candidate (vi) — `bk.status` column mismatch at tools.ts:282 (NEWLY DISCOVERED)", () => {
  let branchId: number;
  let activityId: number;

  beforeEach(async () => {
    // Minimal seed — just enough for check_schedule to find SOMETHING.
    // The candidate (vi) bug fires before any row evaluation (parse-time
    // error on `bk.status`), so the seed shape doesn't matter much.
    const [b] = await pool.execute(
      `INSERT INTO branches (name, code, max_capacity, is_active, created_at, updated_at)
       VALUES ('TST SmokeBranch', 'TSTSM', 20, true, NOW(), NOW())`,
    );
    branchId = (b as { insertId: number }).insertId;

    const [act] = await pool.execute(
      `INSERT INTO activities (name, is_active, created_at, updated_at)
       VALUES ('Test SmokeActivity', true, NOW(), NOW())`,
    );
    activityId = (act as { insertId: number }).insertId;

    await pool.execute(
      `INSERT INTO schedules (branch_id, activity_id, day_of_week, start_time, end_time, is_active, created_at, updated_at)
       VALUES (?, ?, 1, '08:00', '09:00', true, NOW(), NOW())`,
      [branchId, activityId],
    );
  });

  it("RED: executeTool('check_schedule') resolves successfully against real eltemplo_test schema (FAILS on master with SQL error)", async () => {
    // Audit-named expected fix (Section E candidate (vi)):
    //   rename `bk.status` to `bk.booking_status` at tools.ts:282.
    //   One-character SQL fix. On master, the call rejects with
    //   `Unknown column 'bk.status' in 'where clause'`. Post-fix, the
    //   call resolves successfully with a non-empty string response.
    let result: string | undefined;
    let caught: unknown;
    try {
      result = await executeTool("check_schedule", {}, db);
    } catch (err: unknown) {
      caught = err;
    }

    // RED expectation: no error was thrown. On master, an SQL error IS
    // thrown → `caught` is non-undefined → assertion fails.
    expect(caught).toBeUndefined();
    expect(typeof result).toBe("string");
    expect(result).toContain("Test SmokeActivity");
  });

  it("RED: check_schedule does not throw the `bk.status` SQL error specifically (FAILS on master)", async () => {
    // Sharper discriminator that matches the EXACT error shape on master
    // — useful for the audit's Section F transcript correlation. Post-fix,
    // no error of any shape is thrown.
    let caughtMessage = "";
    try {
      await executeTool("check_schedule", {}, db);
    } catch (err: unknown) {
      caughtMessage = err instanceof Error ? err.message : String(err);
    }

    // RED expectation: error message does NOT mention "bk.status" or
    // "Unknown column". On master, it does → assertion fails.
    expect(caughtMessage).not.toMatch(/bk\.status|Unknown column/i);
  });
});
