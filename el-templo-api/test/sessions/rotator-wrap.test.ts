/**
 * Integration test for the rotator week wrap-around (getWeeklyRotator).
 *
 * Complements test/unit/rotator-cycle.test.ts: the unit test proves the pure
 * wrap math; this one proves getWeeklyRotator actually applies it against the
 * real weekly_rotator table.
 *
 * Same catalog caveat as test/sessions/generate-modes.test.ts: weekly_rotator
 * is only populated by `pnpm seed:spom` (CSVs under the git-ignored .docs/
 * tree), which never runs in CI — so these cases skip loudly on an unseeded
 * DB and run in full locally after seeding.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { SpomService } from "../../src/modules/spom/service";
import { createTestApp } from "../helpers";

describe("getWeeklyRotator — week wrap past the planned cycle", () => {
  let app: FastifyInstance;
  let spom: SpomService;
  let cycleWeeks = 0;
  const SKIP_NOTE =
    "SPOM catalog not seeded (CI has no seed:spom / CSVs); run locally after `pnpm seed:spom`";

  beforeAll(async () => {
    app = await createTestApp();
    spom = new SpomService(app.db);
    const [row] = await app.db
      .select({ maxWeek: sql<number | null>`MAX(${schema.weeklyRotator.week})` })
      .from(schema.weeklyRotator);
    cycleWeeks = row?.maxWeek ?? 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the last planned week without wrapping", async (ctx) => {
    if (cycleWeeks <= 0) ctx.skip(SKIP_NOTE);
    const entry = await spom.getWeeklyRotator(cycleWeeks, "lunes", "alfa_delta");
    expect(entry).toBeDefined();
    expect(entry!.week).toBe(cycleWeeks);
  });

  it("wraps the week after the cycle onto week 1 (the W27 incident)", async (ctx) => {
    if (cycleWeeks <= 0) ctx.skip(SKIP_NOTE);
    const wrapped = await spom.getWeeklyRotator(
      cycleWeeks + 1,
      "lunes",
      "alfa_delta",
    );
    const weekOne = await spom.getWeeklyRotator(1, "lunes", "alfa_delta");
    expect(wrapped).toBeDefined();
    expect(weekOne).toBeDefined();
    expect(wrapped!.id).toBe(weekOne!.id);
  });

  it("wraps deep into the second cycle onto the matching planned week", async (ctx) => {
    if (cycleWeeks <= 1) ctx.skip(SKIP_NOTE);
    const wrapped = await spom.getWeeklyRotator(
      cycleWeeks + 2,
      "martes",
      "sigma",
    );
    const weekTwo = await spom.getWeeklyRotator(2, "martes", "sigma");
    expect(wrapped).toBeDefined();
    expect(weekTwo).toBeDefined();
    expect(wrapped!.id).toBe(weekTwo!.id);
  });
});
