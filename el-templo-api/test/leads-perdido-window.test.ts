/**
 * Phase 163-01 (AUTO-02 / D-05, D-06) — integration tests for the configurable
 * "En seguimiento → Perdido" window reader on SettingsService.
 *
 *   SettingsService.getPerdidoWindowDays(): Promise<number>
 *
 * Behavior under test (real eltemplo_test DB, key `leads.perdido_window_days`):
 *   1. absent key            → default 14
 *   2. non-numeric value     → default 14
 *   3. zero / negative value → default 14
 *   4. valid stored integer  → that integer (e.g. 21)
 *
 * systemSettings is in TABLES_TO_CLEAN (helpers.ts), so we clean between tests
 * and seed the key directly via Drizzle where a value is required.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData } from "./helpers";
import * as schema from "../src/db/schema";
import { SettingsService } from "../src/modules/settings/service";
import { LEADS_SETTINGS_KEYS } from "../src/modules/settings/keys";

let app: FastifyInstance;
let service: SettingsService;

beforeAll(async () => {
  app = await createTestApp();
  service = new SettingsService(app.db, app.log);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
});

async function seedWindow(value: string): Promise<void> {
  await app.db.insert(schema.systemSettings).values({
    settingKey: LEADS_SETTINGS_KEYS.perdidoWindowDays,
    settingValue: value,
  });
}

describe("SettingsService.getPerdidoWindowDays", () => {
  it("returns the default 14 when the key is absent", async () => {
    expect(await service.getPerdidoWindowDays()).toBe(14);
  });

  it("returns the default 14 when the stored value is non-numeric", async () => {
    await seedWindow("no-soy-un-numero");
    expect(await service.getPerdidoWindowDays()).toBe(14);
  });

  it("returns the default 14 when the stored value is zero or negative", async () => {
    await seedWindow("0");
    expect(await service.getPerdidoWindowDays()).toBe(14);

    await cleanAllTestData(app);
    await seedWindow("-7");
    expect(await service.getPerdidoWindowDays()).toBe(14);
  });

  it("returns the stored integer window when a valid row is seeded", async () => {
    await seedWindow("21");
    expect(await service.getPerdidoWindowDays()).toBe(21);
  });

  it("truncates a fractional stored value to an integer", async () => {
    await seedWindow("18.9");
    expect(await service.getPerdidoWindowDays()).toBe(18);
  });
});
