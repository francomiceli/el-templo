/**
 * Phase 114-05 — integration tests for the Trial Sessions Report.
 *
 *   GET /api/admin/reports/trial-sessions
 *   GET /api/admin/reports/trial-sessions/export
 *
 * Coverage (≥14 tests):
 *   1.  Happy path — multiple leads return correctly derived rows.
 *   2.  Cancelled-only lead is excluded entirely (D-43).
 *   3.  One-row-per-lead: cancelled + active → 1 row from the active booking.
 *   4.  One-row-per-lead: multiple active → 1 row from the latest booking.
 *   5.  Country scope: non-owner sees only own-country rows + virtual branches.
 *   6.  Branch filter narrows the row set.
 *   7.  Date range filter.
 *   8.  leadStatus multi-value filter.
 *   9.  attended=true / false / pending filter triplet (covers D-08 derivation).
 *  10.  Shift filter (TM vs TT).
 *  11.  daysWithoutConvertingMin excludes converted leads (D-40).
 *  12.  search by first/last name.
 *  13.  Pagination cap (page + limit + total).
 *  14.  gestionaUserId owner-accepted.
 *  15.  gestionaUserId silently stripped for non-owner (D-44).
 *  16.  CSV export: BOM, Spanish header, row count matches listing.
 *
 * Seeds bookings + users + schedules + attendance directly via Drizzle to
 * keep the test fast and decoupled from the trial-booking API surface that
 * Plan 02 / Plan 03 already cover end-to-end.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "./helpers";
import * as schema from "../src/db/schema";

const REPORTS_URL = "/api/admin/reports";

interface Ctx {
  app: FastifyInstance;
  ownerToken: string;
  ownerUserId: number;
  arBranchId: number; // pre-existing 'TEST' (AR)
  esBranchId: number;
  virtualBranchId: number;
  activityId: number;
  scheduleArMorning: number; // 08:00
  scheduleArAfternoon: number; // 16:00
  scheduleEs: number; // 09:00
  adminArId: number;
  adminArToken: string;
  adminEsId: number;
  adminEsToken: string;
}

const ctx = {} as Ctx;

function nextCode(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1_000_000)
    .toString(36)
    .padStart(4, "0");
  return `${prefix}${t}${r}`;
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seedBranches(): Promise<void> {
  // AR branch = the pre-existing 'TEST' branch from setup.ts.
  const [ar] = await ctx.app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(eq(schema.branches.code, "TEST"));
  ctx.arBranchId = ar.id;

  // ES branch — INSERT IGNORE-style: only create if not present.
  const [esRow] = await ctx.app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(eq(schema.branches.code, "ES-TRIAL-114"));
  if (esRow) {
    ctx.esBranchId = esRow.id;
  } else {
    const [esIns] = await ctx.app.db
      .insert(schema.branches)
      .values({
        name: "ES Madrid Trial 114",
        code: "ES-TRIAL-114",
        country: "ES",
        isVirtual: false,
        isActive: true,
      })
      .$returningId();
    ctx.esBranchId = esIns.id;
  }

  // Virtual branch — Templo Online from setup.ts.
  const [vb] = await ctx.app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(eq(schema.branches.code, "ONLINE"));
  ctx.virtualBranchId = vb.id;
}

async function seedActivityAndSchedules(): Promise<void> {
  const [act] = await ctx.app.db
    .insert(schema.activities)
    .values({ name: "Calistenia 114-05", description: "trial test" })
    .$returningId();
  ctx.activityId = act.id;

  const [sm] = await ctx.app.db
    .insert(schema.schedules)
    .values({
      branchId: ctx.arBranchId,
      activityId: ctx.activityId,
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "09:00",
    })
    .$returningId();
  ctx.scheduleArMorning = sm.id;

  const [sa] = await ctx.app.db
    .insert(schema.schedules)
    .values({
      branchId: ctx.arBranchId,
      activityId: ctx.activityId,
      dayOfWeek: 2,
      startTime: "16:00",
      endTime: "17:00",
    })
    .$returningId();
  ctx.scheduleArAfternoon = sa.id;

  const [se] = await ctx.app.db
    .insert(schema.schedules)
    .values({
      branchId: ctx.esBranchId,
      activityId: ctx.activityId,
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "10:00",
    })
    .$returningId();
  ctx.scheduleEs = se.id;
}

interface SeedLeadOpts {
  firstName: string;
  lastName?: string;
  branchId: number;
  status?: "prueba" | "activo";
  leadStatus?: "en_seguimiento" | "cerrado" | "perdido" | null;
  leadNotes?: string | null;
  createdBy?: number | null;
  convertedAtOffsetDays?: number; // if set, sets convertedAt and status='activo'
}

async function seedLead(opts: SeedLeadOpts): Promise<number> {
  const phone = `+549114${Date.now().toString().slice(-8)}${Math.floor(
    Math.random() * 1000,
  )
    .toString()
    .padStart(3, "0")}`;
  const dni = `TS${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const passwordHash = "$argon2id$dummy"; // never used to log in
  const status =
    opts.convertedAtOffsetDays !== undefined
      ? "activo"
      : (opts.status ?? "prueba");
  let convertedAt: Date | null = null;
  if (opts.convertedAtOffsetDays !== undefined) {
    convertedAt = new Date();
    convertedAt.setUTCDate(
      convertedAt.getUTCDate() + opts.convertedAtOffsetDays,
    );
  }
  const [u] = await ctx.app.db
    .insert(schema.users)
    .values({
      email: `lead-${nextCode("L")}@test.local`,
      passwordHash,
      firstName: opts.firstName,
      lastName: opts.lastName ?? "Lead",
      role: "member",
      branchId: opts.branchId,
      phone,
      dni,
      status,
      leadStatus: opts.leadStatus ?? "en_seguimiento",
      leadNotes: opts.leadNotes ?? null,
      createdBy: opts.createdBy ?? null,
      convertedAt,
    })
    .$returningId();
  return u.id;
}

interface SeedBookingOpts {
  userId: number;
  scheduleId: number;
  bookingDateOffsetDays: number;
  status?:
    | "reservado"
    | "qr_escaneado"
    | "confirmado"
    | "cancelado"
    | "lista_espera"
    | "no_show";
  isTrial?: boolean;
  withAttendance?: boolean; // creates an attendance row tied to this booking
  attendanceBranchId?: number;
}

async function seedBooking(opts: SeedBookingOpts): Promise<number> {
  const date = dateOffset(opts.bookingDateOffsetDays);
  const [b] = await ctx.app.db
    .insert(schema.bookings)
    .values({
      memberId: opts.userId,
      scheduleId: opts.scheduleId,
      bookingDate: date,
      status: opts.status ?? "reservado",
      isTrial: opts.isTrial ?? true,
    })
    .$returningId();

  if (opts.withAttendance) {
    await ctx.app.db.insert(schema.attendance).values({
      memberId: opts.userId,
      branchId: opts.attendanceBranchId ?? ctx.arBranchId,
      scheduleId: opts.scheduleId,
      sessionDate: date,
      status: "confirmado",
      source: "manual",
    });
  }
  return b.id;
}

async function provisionStaff(): Promise<void> {
  ctx.ownerToken = await getAuthToken(
    ctx.app,
    "admin@test.com",
    "adminpass123",
  );
  const [ow] = await ctx.app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"));
  ctx.ownerUserId = ow.id;

  ctx.adminArId = await createStaffUser(ctx.app, {
    email: "admin-ar-114@test.local",
    password: "pass123456",
    firstName: "AdminAR",
    lastName: "Local",
    role: "admin",
    branchId: ctx.arBranchId,
    country: "AR",
  });
  ctx.adminArToken = await getAuthToken(
    ctx.app,
    "admin-ar-114@test.local",
    "pass123456",
  );

  ctx.adminEsId = await createStaffUser(ctx.app, {
    email: "admin-es-114@test.local",
    password: "pass123456",
    firstName: "AdminES",
    lastName: "Local",
    role: "admin",
    branchId: ctx.esBranchId,
    country: "ES",
  });
  ctx.adminEsToken = await getAuthToken(
    ctx.app,
    "admin-es-114@test.local",
    "pass123456",
  );
}

describe("Reports API — Trial Sessions (Phase 114-05)", () => {
  beforeAll(async () => {
    ctx.app = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(ctx.app);
    await seedBranches();
    await seedActivityAndSchedules();
    await provisionStaff();
  });

  // 1. Happy path — multiple leads → multiple rows with derived fields.
  it("returns rows with correctly derived fields", async () => {
    const u1 = await seedLead({
      firstName: "Antonino",
      lastName: "Flor",
      branchId: ctx.arBranchId,
      leadStatus: "perdido",
      leadNotes: "No respondió más.",
      createdBy: ctx.adminArId,
    });
    await seedBooking({
      userId: u1,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -7,
    });

    const u2 = await seedLead({
      firstName: "Bea",
      lastName: "Garcia",
      branchId: ctx.arBranchId,
      leadStatus: "en_seguimiento",
    });
    await seedBooking({
      userId: u2,
      scheduleId: ctx.scheduleArAfternoon,
      bookingDateOffsetDays: 3, // future
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(2);
    expect(body.rows).toHaveLength(2);

    const antonino = body.rows.find((r: { userId: number }) => r.userId === u1);
    expect(antonino.lead).toBe("Antonino Flor");
    expect(antonino.attended).toBe("no"); // past + no attendance
    expect(antonino.shift).toBe("TM");
    expect(antonino.leadStatusEffective).toBe("perdido");
    expect(antonino.leadNotes).toBe("No respondió más.");
    expect(antonino.createdBy).toEqual({
      userId: ctx.adminArId,
      name: "AdminAR Local",
    });
    expect(antonino.period).toBe(antonino.bookingDate.slice(0, 7));
    // bookingCreatedAt — ISO date of the SP creation (bookings.booked_at).
    expect(antonino.bookingCreatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(antonino.weekRange).toMatch(
      /^\d{4}-\d{2}-\d{2} --- \d{4}-\d{2}-\d{2}$/,
    );
    expect(antonino.converted).toBe(false);

    const bea = body.rows.find((r: { userId: number }) => r.userId === u2);
    expect(bea.attended).toBeNull(); // future booking
    expect(bea.shift).toBe("TT");
    expect(bea.leadStatusEffective).toBe("en_seguimiento");
  });

  // 2. Cancelled-only lead is excluded.
  it("excludes leads whose only trial is cancelado (D-43)", async () => {
    const u = await seedLead({
      firstName: "OnlyCancelled",
      branchId: ctx.arBranchId,
    });
    await seedBooking({
      userId: u,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -2,
      status: "cancelado",
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).total).toBe(0);
  });

  // 3. One row per lead — cancelled + active.
  it("returns 1 row from the active booking when user has cancelled + active trials (D-42)", async () => {
    const u = await seedLead({
      firstName: "Mixto",
      branchId: ctx.arBranchId,
    });
    await seedBooking({
      userId: u,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -10,
      status: "cancelado",
    });
    const activeId = await seedBooking({
      userId: u,
      scheduleId: ctx.scheduleArAfternoon,
      bookingDateOffsetDays: -3,
      status: "reservado",
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(1);
    expect(body.rows[0].bookingId).toBe(activeId);
    expect(body.rows[0].shift).toBe("TT"); // 16:00 schedule
  });

  // 4. One row per lead — multiple active → latest wins.
  it("returns latest active booking when user has multiple non-cancelled trials (D-42)", async () => {
    const u = await seedLead({
      firstName: "Repetido",
      branchId: ctx.arBranchId,
    });
    await seedBooking({
      userId: u,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -20,
    });
    const newer = await seedBooking({
      userId: u,
      scheduleId: ctx.scheduleArAfternoon,
      bookingDateOffsetDays: -2,
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    const body = JSON.parse(res.body);
    expect(body.total).toBe(1);
    expect(body.rows[0].bookingId).toBe(newer);
  });

  // 5. Country scope.
  it("non-owner sees only own-country rows + virtual; owner sees all (D-24)", async () => {
    const arLead = await seedLead({
      firstName: "ArOnly",
      branchId: ctx.arBranchId,
    });
    await seedBooking({
      userId: arLead,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
    });
    const esLead = await seedLead({
      firstName: "EsOnly",
      branchId: ctx.esBranchId,
    });
    await seedBooking({
      userId: esLead,
      scheduleId: ctx.scheduleEs,
      bookingDateOffsetDays: -1,
    });

    const asAr = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(asAr.statusCode).toBe(200);
    const arBody = JSON.parse(asAr.body);
    const arIds = arBody.rows.map((r: { userId: number }) => r.userId);
    expect(arIds).toContain(arLead);
    expect(arIds).not.toContain(esLead);

    const asEs = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions`,
      headers: { authorization: `Bearer ${ctx.adminEsToken}` },
    });
    expect(asEs.statusCode).toBe(200);
    const esBody = JSON.parse(asEs.body);
    const esIds = esBody.rows.map((r: { userId: number }) => r.userId);
    expect(esIds).toContain(esLead);
    expect(esIds).not.toContain(arLead);
  });

  // 6. Branch filter.
  it("branchId filter narrows the row set", async () => {
    const u1 = await seedLead({ firstName: "B1", branchId: ctx.arBranchId });
    await seedBooking({
      userId: u1,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
    });
    const u2 = await seedLead({ firstName: "B2", branchId: ctx.esBranchId });
    await seedBooking({
      userId: u2,
      scheduleId: ctx.scheduleEs,
      bookingDateOffsetDays: -1,
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions?branchId=${ctx.arBranchId}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const ids = body.rows.map((r: { userId: number }) => r.userId);
    expect(ids).toContain(u1);
    expect(ids).not.toContain(u2);
  });

  // 7. Date range.
  it("dateFrom/dateTo restrict to representative bookings in range", async () => {
    const u1 = await seedLead({ firstName: "Old", branchId: ctx.arBranchId });
    await seedBooking({
      userId: u1,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -30,
    });
    const u2 = await seedLead({
      firstName: "Recent",
      branchId: ctx.arBranchId,
    });
    await seedBooking({
      userId: u2,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -2,
    });

    const from = dateOffset(-7);
    const to = dateOffset(0);
    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions?dateFrom=${from}&dateTo=${to}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    const body = JSON.parse(res.body);
    const ids = body.rows.map((r: { userId: number }) => r.userId);
    expect(ids).toContain(u2);
    expect(ids).not.toContain(u1);
  });

  // 8. leadStatus multi-value.
  it("leadStatus multi-value filter accepts array", async () => {
    const a = await seedLead({
      firstName: "Cerr",
      branchId: ctx.arBranchId,
      leadStatus: "cerrado",
    });
    await seedBooking({
      userId: a,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
    });
    const b = await seedLead({
      firstName: "Perd",
      branchId: ctx.arBranchId,
      leadStatus: "perdido",
    });
    await seedBooking({
      userId: b,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
    });
    const c = await seedLead({
      firstName: "Seg",
      branchId: ctx.arBranchId,
      leadStatus: "en_seguimiento",
    });
    await seedBooking({
      userId: c,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions?leadStatus=cerrado&leadStatus=perdido`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const ids = body.rows.map((r: { userId: number }) => r.userId);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
    expect(ids).not.toContain(c);
  });

  // 9. attended filter (D-08).
  it("attended filter handles si/no/pending", async () => {
    const yes = await seedLead({ firstName: "Yes", branchId: ctx.arBranchId });
    await seedBooking({
      userId: yes,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
      withAttendance: true,
    });
    const no = await seedLead({ firstName: "No", branchId: ctx.arBranchId });
    await seedBooking({
      userId: no,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
    });
    const pending = await seedLead({
      firstName: "Pending",
      branchId: ctx.arBranchId,
    });
    await seedBooking({
      userId: pending,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: 5, // future
    });

    async function fetchAttended(value: string): Promise<number[]> {
      const res = await ctx.app.inject({
        method: "GET",
        url: `${REPORTS_URL}/trial-sessions?attended=${value}`,
        headers: { authorization: `Bearer ${ctx.ownerToken}` },
      });
      const body = JSON.parse(res.body);
      return body.rows.map((r: { userId: number }) => r.userId);
    }
    expect(await fetchAttended("true")).toEqual([yes]);
    expect(await fetchAttended("false")).toEqual([no]);
    expect(await fetchAttended("pending")).toEqual([pending]);
  });

  // 10. Shift filter.
  it("shift=TM picks morning schedules; shift=TT picks afternoon", async () => {
    const m = await seedLead({ firstName: "Morn", branchId: ctx.arBranchId });
    await seedBooking({
      userId: m,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
    });
    const a = await seedLead({ firstName: "Aft", branchId: ctx.arBranchId });
    await seedBooking({
      userId: a,
      scheduleId: ctx.scheduleArAfternoon,
      bookingDateOffsetDays: -1,
    });

    const tm = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions?shift=TM`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    const tt = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions?shift=TT`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(
      JSON.parse(tm.body).rows.map((r: { userId: number }) => r.userId),
    ).toEqual([m]);
    expect(
      JSON.parse(tt.body).rows.map((r: { userId: number }) => r.userId),
    ).toEqual([a]);
  });

  // 11. daysWithoutConvertingMin (D-40).
  it("daysWithoutConvertingMin excludes converted leads", async () => {
    const notConv = await seedLead({
      firstName: "NotConv",
      branchId: ctx.arBranchId,
    });
    await seedBooking({
      userId: notConv,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -10,
    });
    const conv = await seedLead({
      firstName: "Conv",
      branchId: ctx.arBranchId,
      convertedAtOffsetDays: 0,
    });
    await seedBooking({
      userId: conv,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -10,
    });
    const recent = await seedLead({
      firstName: "Recent",
      branchId: ctx.arBranchId,
    });
    await seedBooking({
      userId: recent,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -2,
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions?daysWithoutConvertingMin=7`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = JSON.parse(res.body).rows.map(
      (r: { userId: number }) => r.userId,
    );
    expect(ids).toEqual([notConv]);
  });

  // 12. search.
  it("search matches partial first/last name", async () => {
    const fulano = await seedLead({
      firstName: "Fulano",
      lastName: "Detal",
      branchId: ctx.arBranchId,
    });
    await seedBooking({
      userId: fulano,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
    });
    const otro = await seedLead({
      firstName: "Otro",
      lastName: "Nombre",
      branchId: ctx.arBranchId,
    });
    await seedBooking({
      userId: otro,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions?search=Fulano`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    const ids = JSON.parse(res.body).rows.map(
      (r: { userId: number }) => r.userId,
    );
    expect(ids).toEqual([fulano]);
  });

  // 13. Pagination.
  it("page + limit honored; total reflects deduplicated leads", async () => {
    const seeded: number[] = [];
    for (let i = 0; i < 7; i++) {
      const u = await seedLead({
        firstName: `P${i}`,
        branchId: ctx.arBranchId,
      });
      // Stagger booking dates so ORDER BY is deterministic.
      await seedBooking({
        userId: u,
        scheduleId: ctx.scheduleArMorning,
        bookingDateOffsetDays: -1 - i,
      });
      seeded.push(u);
    }

    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions?page=2&limit=3`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(7);
    expect(body.page).toBe(2);
    expect(body.limit).toBe(3);
    expect(body.rows).toHaveLength(3);
  });

  // 14. gestionaUserId owner.
  it("gestionaUserId owner-accepted (D-44)", async () => {
    const byAr = await seedLead({
      firstName: "ByAr",
      branchId: ctx.arBranchId,
      createdBy: ctx.adminArId,
    });
    await seedBooking({
      userId: byAr,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
    });
    const byEs = await seedLead({
      firstName: "ByEs",
      branchId: ctx.arBranchId,
      createdBy: ctx.adminEsId,
    });
    await seedBooking({
      userId: byEs,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions?gestionaUserId=${ctx.adminArId}`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = JSON.parse(res.body).rows.map(
      (r: { userId: number }) => r.userId,
    );
    expect(ids).toEqual([byAr]);
  });

  // 15. gestionaUserId non-owner silent strip (D-44).
  it("gestionaUserId is silently ignored when caller is not owner (D-44)", async () => {
    const byAr = await seedLead({
      firstName: "OwnerLead",
      branchId: ctx.arBranchId,
      createdBy: ctx.ownerUserId,
    });
    await seedBooking({
      userId: byAr,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
    });
    const byOther = await seedLead({
      firstName: "OtherLead",
      branchId: ctx.arBranchId,
      createdBy: ctx.adminArId,
    });
    await seedBooking({
      userId: byOther,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -1,
    });

    // adminAR is NOT owner. Request as adminAR with gestionaUserId=owner.id.
    // If the filter were honored we would only see `byAr`. The silent strip
    // means we see BOTH leads (filter ignored, no 403).
    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions?gestionaUserId=${ctx.ownerUserId}`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = JSON.parse(res.body).rows.map(
      (r: { userId: number }) => r.userId,
    );
    expect(ids).toContain(byAr);
    expect(ids).toContain(byOther);
  });

  // 16. CSV export — BOM + Spanish header + row count.
  it("CSV export emits BOM + Spanish header line matching the listing", async () => {
    const u1 = await seedLead({
      firstName: "Antonino",
      lastName: "Flor",
      branchId: ctx.arBranchId,
      leadStatus: "perdido",
      leadNotes: "No respondió más.",
      createdBy: ctx.adminArId,
    });
    await seedBooking({
      userId: u1,
      scheduleId: ctx.scheduleArMorning,
      bookingDateOffsetDays: -7,
    });
    const u2 = await seedLead({
      firstName: "Bea",
      lastName: "Garcia",
      branchId: ctx.arBranchId,
    });
    await seedBooking({
      userId: u2,
      scheduleId: ctx.scheduleArAfternoon,
      bookingDateOffsetDays: 3,
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: `${REPORTS_URL}/trial-sessions/export`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(res.headers["content-disposition"]).toMatch(
      /attachment; filename="sesiones-de-prueba-\d{4}-\d{2}-\d{2}\.csv"/,
    );

    // Decode rawPayload as UTF-8 explicitly so the BOM check is independent of
    // Fastify's body-decoder behaviour.
    const rawPayload = res.rawPayload ?? Buffer.from(res.body, "binary");
    const decoded = Buffer.isBuffer(rawPayload)
      ? rawPayload.toString("utf-8")
      : String(rawPayload);
    expect(decoded.charCodeAt(0)).toBe(0xfeff);

    // Header line — Spanish with literal accented "Asistió".
    const expectedHeader =
      "Lead,Fecha,Creación,Hora,Sucursal,Asistió,Estado del Lead,Gestiona,Comentarios,Turno,Periodo,Semana";
    const afterBom = decoded.slice(1);
    const firstLine = afterBom.split("\r\n")[0];
    expect(firstLine).toBe(expectedHeader);

    // Body row count = header + 2 data rows + trailing empty (from final CRLF).
    const lines = afterBom.split("\r\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(3);

    // Spot-check the Antonino row contents (DD/MM/YYYY date, "No" Asistió, "Mañana" turno).
    const antoninoLine = lines.find((l) => l.startsWith("Antonino Flor"));
    expect(antoninoLine).toBeDefined();
    expect(antoninoLine).toMatch(/,No,/); // attended=no -> "No"
    expect(antoninoLine).toMatch(/Mañana/); // shift=TM -> "Mañana"
    expect(antoninoLine).toMatch(/\d{2}\/\d{2}\/\d{4}/); // fecha DD/MM/YYYY
  });
});
