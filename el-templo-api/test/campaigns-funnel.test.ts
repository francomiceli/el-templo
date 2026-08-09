/**
 * Phase 119 — per-campaign funnel aggregation. D-18 / D-19.
 *
 *   - D-18 funnel: enviado → abierto → click → reservó → asistió → convirtió,
 *     crossing campaign_sends + campaign_events × bookings × attendance ×
 *     user_status_history (source='self_service', booked_at >= sent_at).
 *   - D-19 the funnel endpoint returns the 6 stage counts per campaign.
 *   - "abierto" carries an approximate flag (Apple Mail Privacy / images-off).
 *   - "convirtió" = a user_status_history transition to 'activo' after the send
 *     (aligns with funnel-service.ts "activo" — A6).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createEligibleFreemium,
  createTestCampaign,
  createTestSend,
  todayStr,
} from "./helpers";
import { CampaignService } from "../src/modules/campaigns/service";
import { EmailService } from "../src/modules/email/service";
import {
  tenantWhere,
  type TenantContext,
} from "../src/modules/shared/tenant";
import * as schema from "../src/db/schema";

let app: FastifyInstance;
let ownerId: number;
let branchId: number;

// T-173-08: `funnel()` recibe `ctx` primero (user_status_history es strict).
const CTX: TenantContext = { tenantId: 1 };

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  const [owner] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  ownerId = owner.id;
  const [branch] = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(eq(schema.branches.code, "TEST"))
    .limit(1);
  branchId = branch.id;
});

function makeService(): CampaignService {
  return new CampaignService(app.db, app.log, new EmailService(app.log));
}

/** Seed a 'sent' campaign with sent_at in the past. Returns its id. */
async function seedSentCampaign(): Promise<number> {
  const campaignId = await createTestCampaign(app, ownerId, {
    status: "sent",
  });
  await app.db
    .update(schema.campaigns)
    .set({ sentAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) })
    .where(eq(schema.campaigns.id, campaignId));
  return campaignId;
}

/** Seed a self_service is_trial booking (after the campaign sent_at) for user. */
async function seedSelfServiceTrial(userId: number): Promise<void> {
  const [activity] = await app.db
    .insert(schema.activities)
    .values({ name: "Funnel Activity" })
    .$returningId();
  const [sched] = await app.db
    .insert(schema.schedules)
    .values({
      branchId,
      activityId: activity.id,
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "11:00",
    })
    .$returningId();
  await app.db.insert(schema.bookings).values({
    memberId: userId,
    scheduleId: sched.id,
    bookingDate: todayStr(),
    status: "reservado",
    isTrial: true,
    source: "self_service",
  });
}

describe("campaign funnel (Phase 119)", () => {
  it("D-18: enviado counts sends with status='sent'", async () => {
    const campaignId = await seedSentCampaign();
    const { id: u1, email: e1 } = await createEligibleFreemium(app, {
      branchId,
    });
    const { id: u2, email: e2 } = await createEligibleFreemium(app, {
      branchId,
    });
    await createTestSend(app, campaignId, u1, e1, { status: "sent" });
    await createTestSend(app, campaignId, u2, e2, { status: "pending" });

    const funnel = await makeService().funnel(CTX, campaignId);
    expect(funnel.enviado).toBe(1);
    expect(funnel.aperturaAproximada).toBe(true);
  });

  it("D-18: abierto/click count DISTINCT send_id per event type", async () => {
    const campaignId = await seedSentCampaign();
    const { id: u1, email: e1 } = await createEligibleFreemium(app, {
      branchId,
    });
    const sendId = await createTestSend(app, campaignId, u1, e1, {
      status: "sent",
    });
    // Two opens + one click on the same send → DISTINCT collapses opens to 1.
    await app.db.insert(schema.campaignEvents).values([
      { sendId, type: "open" },
      { sendId, type: "open" },
      { sendId, type: "click" },
    ]);

    const funnel = await makeService().funnel(CTX, campaignId);
    expect(funnel.abierto).toBe(1);
    expect(funnel.click).toBe(1);
  });

  it("D-18: reservó/asistió/convirtió cross bookings × attendance × history", async () => {
    const campaignId = await seedSentCampaign();
    const { id: userId, email } = await createEligibleFreemium(app, {
      branchId,
    });
    await createTestSend(app, campaignId, userId, email, { status: "sent" });

    // reservó: a self_service is_trial booking after sent_at.
    await seedSelfServiceTrial(userId);

    // asistió: a confirmed attendance row for the same user.
    await app.db.insert(schema.attendance).values({
      memberId: userId,
      branchId,
      sessionDate: todayStr(),
      status: "confirmado",
      source: "manual",
    });

    // convirtió: a user_status_history transition to 'activo' after sent_at.
    await app.db.insert(schema.userStatusHistory).values({
      userId,
      fromStatus: "prueba",
      toStatus: "activo",
      source: "admin",
    });

    const funnel = await makeService().funnel(CTX, campaignId);
    expect(funnel.reservo).toBe(1);
    expect(funnel.asistio).toBe(1);
    expect(funnel.convirtio).toBe(1);
  });

  it("D-18: a booking before sent_at is NOT attributed to the campaign", async () => {
    const campaignId = await seedSentCampaign();
    const { id: userId, email } = await createEligibleFreemium(app, {
      branchId,
    });
    await createTestSend(app, campaignId, userId, email, { status: "sent" });

    // A self_service trial booked BEFORE the campaign sent_at (booked_at default
    // = now, but we force it into the past below).
    const [activity] = await app.db
      .insert(schema.activities)
      .values({ name: "Pre Activity" })
      .$returningId();
    const [sched] = await app.db
      .insert(schema.schedules)
      .values({
        branchId,
        activityId: activity.id,
        dayOfWeek: 2,
        startTime: "12:00",
        endTime: "13:00",
      })
      .$returningId();
    const [bk] = await app.db
      .insert(schema.bookings)
      .values({
        memberId: userId,
        scheduleId: sched.id,
        bookingDate: todayStr(),
        status: "reservado",
        isTrial: true,
        source: "self_service",
      })
      .$returningId();
    // Push booked_at well before the campaign sent_at (-30 days).
    await app.db
      .update(schema.bookings)
      .set({ bookedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) })
      .where(eq(schema.bookings.id, bk.id));

    const funnel = await makeService().funnel(CTX, campaignId);
    expect(funnel.reservo).toBe(0);
  });

  it("D-19: funnel returns all 6 stage counts for an empty campaign", async () => {
    const campaignId = await seedSentCampaign();
    const funnel = await makeService().funnel(CTX, campaignId);
    expect(funnel).toMatchObject({
      enviado: 0,
      abierto: 0,
      click: 0,
      reservo: 0,
      asistio: 0,
      convirtio: 0,
      aperturaAproximada: true,
    });
  });
});
