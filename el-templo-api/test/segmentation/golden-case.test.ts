/**
 * Phase 123 Plan 03 — Frequency golden-case segmentation override (FREQ-05/06).
 *
 * Real-MySQL integration for the ONLY frequency → segment override added by
 * Phase 123 (D-123-02): an ACTIVE (paying) member with 0 visits in the tuneable
 * `segment.frequency_zero_visit_window_days` window → `en_riesgo`. The override
 * is placed AFTER the nuevo guard and gated on an active/paused subscription, so
 * brand-new members stay "nuevo" and non-paying members are not forced.
 *
 * Coverage:
 *   (a) active member, 0 visits in window → en_riesgo (the golden case);
 *   (b) active member WITH visits in window → NOT forced to en_riesgo by the
 *       override (the legacy ladder result stands — espartano here);
 *   (c) NO active subscription + 0 visits → the golden override does NOT fire
 *       (gated on active-paid-sub); the inline helper returns false;
 *   (d) brand-new member (createdAt within NUEVO_DAYS) → "nuevo" (guard wins);
 *   (e) explicit { isFrequencyGoldenCase: true } forces en_riesgo for an active
 *       member (the batch path);
 *   (f) the threshold is read from system_settings — a narrow window means a
 *       slightly-older visit falls OUTSIDE it → en_riesgo, proving the tuneable
 *       key is honored (vs the default 28-day window where the same visit counts).
 *
 * All timestamps derive from now() offsets so the rolling-window assertions stay
 * TZ-flake-safe. CI-only — do NOT run locally.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { SegmentationService } from "../../src/modules/segmentation/service";
import { SEGMENT_SETTINGS_KEYS } from "../../src/modules/segmentation/types";

describe("Frequency golden-case override (Phase 123 Plan 03)", () => {
  let app: FastifyInstance;
  let svc: SegmentationService;

  const MS_PER_DAY = 86_400_000;

  /** A Date `daysAgo` days before now. */
  function daysAgo(days: number): Date {
    return new Date(Date.now() - days * MS_PER_DAY);
  }

  /** "YYYY-MM-DD" of a Date. */
  function ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  beforeAll(async () => {
    app = await createTestApp();
    await getAuthToken(app, "admin@test.com", "adminpass123");
    svc = new SegmentationService(app.db, app.log);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // Seed the full segment threshold set (nuevo_days governs the nuevo guard;
    // frequency_zero_visit_window_days governs the golden-case window).
    await app.db.insert(schema.systemSettings).values([
      { settingKey: SEGMENT_SETTINGS_KEYS.ESPARTANO_PCT, settingValue: "80" },
      {
        settingKey: SEGMENT_SETTINGS_KEYS.INTERMITENTE_PCT,
        settingValue: "40",
      },
      { settingKey: SEGMENT_SETTINGS_KEYS.EN_RIESGO_WEEKS, settingValue: "2" },
      { settingKey: SEGMENT_SETTINGS_KEYS.GHOST_WEEKS, settingValue: "8" },
      { settingKey: SEGMENT_SETTINGS_KEYS.NUEVO_DAYS, settingValue: "30" },
      { settingKey: SEGMENT_SETTINGS_KEYS.WINDOW_DAYS, settingValue: "28" },
      {
        settingKey: SEGMENT_SETTINGS_KEYS.FREQUENCY_ZERO_VISIT_WINDOW_DAYS,
        settingValue: "28",
      },
    ]);
  });

  // ─── Fixtures ──────────────────────────────────────────────────────────

  /** Create a member with a controlled `users.created_at`. */
  async function createMember(email: string, createdAt: Date): Promise<number> {
    const { user } = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: 1,
    });
    const userId = (user as { id: number }).id;
    await app.db
      .update(schema.users)
      .set({ createdAt })
      .where(eq(schema.users.id, userId));
    return userId;
  }

  /** Give a member an active subscription (makes them part of the population). */
  async function addActiveSub(
    userId: number,
    classesPerWeek = 3,
  ): Promise<void> {
    const [plan] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: `GoldenPlan-${userId}-${Date.now()}`,
        planTier: "foundation",
        bookingMode: "flexible",
        priceRegular: 15000,
        priceZero: 10000,
        durationDays: 30,
        classesPerWeek,
      })
      .$returningId();

    await app.db.insert(schema.subscriptions).values({
      userId,
      planId: plan.id,
      branchId: 1,
      status: "active",
      startDate: ymd(daysAgo(60)),
      endDate: ymd(daysAgo(-30)),
      pricePaid: 15000,
      priceTypeApplied: "regular",
      classesBudget: classesPerWeek * 4,
    });
  }

  /** Insert one attendance check-in at a controlled timestamp. */
  async function addVisit(userId: number, checkedInAt: Date): Promise<void> {
    await app.db.insert(schema.attendance).values({
      memberId: userId,
      branchId: 1,
      scheduleId: null,
      sessionDate: ymd(checkedInAt),
      checkedInAt,
    });
  }

  // ─── (a) active + 0 visits → en_riesgo (the golden case) ─────────────────

  it("(a) active member with 0 visits in window → en_riesgo (D-123-02)", async () => {
    const u = await createMember("golden-zero@test.com", daysAgo(60));
    await addActiveSub(u);

    const segment = await svc.calculateSegment(u);

    expect(segment).toBe("en_riesgo");
  });

  // ─── (b) active + visits → NOT forced en_riesgo by the override ───────────

  it("(b) active member WITH visits is not forced to en_riesgo (ladder stands)", async () => {
    const u = await createMember("golden-active@test.com", daysAgo(60));
    await addActiveSub(u, 3); // expected ~12 classes in 28d

    // 12 visits in the current window → 100% of budget → espartano (>= 80%).
    for (let i = 0; i < 12; i++) {
      await addVisit(u, daysAgo(1 + i * 2));
    }

    const segment = await svc.calculateSegment(u);

    // The golden override does NOT fire (member has visits); the legacy ladder
    // classifies them by budget → espartano, NOT en_riesgo.
    expect(segment).not.toBe("en_riesgo");
    expect(segment).toBe("espartano");
  });

  // ─── (c) no active sub + 0 visits → golden override gated off ─────────────

  it("(c) member with NO active subscription is not a golden case (gated on active-paid-sub)", async () => {
    const u = await createMember("golden-nosub@test.com", daysAgo(60));
    // No subscription at all → not part of the active population.

    // The inline golden-case helper is gated on an active/paused sub, so it
    // returns false. We assert via the explicit batch path that the override
    // is NOT applied for a non-active member: passing isFrequencyGoldenCase
    // false (as the batch does for anyone outside its golden set) leaves the
    // legacy ladder to decide — and the override never fired.
    const segment = await svc.calculateSegment(u, {
      isFrequencyGoldenCase: false,
    });

    // With no activity and no sub the legacy ladder yields "ghost" (no
    // attendance / login / session at all) — crucially NOT forced by the
    // golden override.
    expect(segment).toBe("ghost");
  });

  // ─── (d) brand-new member → nuevo (guard wins over golden case) ───────────

  it("(d) brand-new active member with 0 visits stays nuevo (guard wins)", async () => {
    // createdAt within NUEVO_DAYS (30): registered 5 days ago.
    const u = await createMember("golden-new@test.com", daysAgo(5));
    await addActiveSub(u);

    const segment = await svc.calculateSegment(u);

    expect(segment).toBe("nuevo");
  });

  // ─── (e) explicit batch opt forces en_riesgo for an active member ─────────

  it("(e) explicit { isFrequencyGoldenCase: true } forces en_riesgo (batch path)", async () => {
    // Active member WITH plenty of visits (ladder would say espartano), but the
    // batch supplies the cooling-down golden signal → override forces en_riesgo.
    const u = await createMember("golden-batch@test.com", daysAgo(60));
    await addActiveSub(u, 3);
    for (let i = 0; i < 12; i++) {
      await addVisit(u, daysAgo(1 + i * 2));
    }

    const segment = await svc.calculateSegment(u, {
      isFrequencyGoldenCase: true,
    });

    expect(segment).toBe("en_riesgo");
  });

  // ─── (f) threshold read from system_settings (tuneable window) ────────────

  it("(f) honors the tuneable segment.frequency_zero_visit_window_days threshold", async () => {
    // Narrow the golden-case window to 7 days for this test.
    await app.db
      .update(schema.systemSettings)
      .set({ settingValue: "7" })
      .where(
        eq(
          schema.systemSettings.settingKey,
          SEGMENT_SETTINGS_KEYS.FREQUENCY_ZERO_VISIT_WINDOW_DAYS,
        ),
      );

    const u = await createMember("golden-window@test.com", daysAgo(60));
    await addActiveSub(u, 3);
    // 12 visits spread across days 8..27: INSIDE the default 28d window (would
    // be espartano), but ZERO of them fall in the narrowed 7d golden window →
    // golden case fires → en_riesgo. The most recent visit is 8 days ago, so
    // last-activity (~1.14 weeks) is below enRiesgoWeeks(2) — the legacy
    // inactivity branch does NOT independently force en_riesgo, isolating the
    // tuneable golden-window threshold as the cause.
    for (let i = 0; i < 12; i++) {
      await addVisit(u, daysAgo(8 + i));
    }

    const segment = await svc.calculateSegment(u);

    expect(segment).toBe("en_riesgo");
  });
});
