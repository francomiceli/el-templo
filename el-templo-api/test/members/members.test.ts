import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  createStaffUser,
} from "../helpers";
import { users } from "../../src/db/schema/users";
import { memberNotes } from "../../src/db/schema/member-notes";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { auraTransactions } from "../../src/db/schema/aura-transactions";
import { auraBalances } from "../../src/db/schema/aura-balances";
import { attendance } from "../../src/db/schema/attendance";
import { bookings } from "../../src/db/schema/bookings";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";
import { holidays } from "../../src/db/schema/holidays";
import { subscriptionSchedules } from "../../src/db/schema/subscription-schedules";
import { memberProfiles } from "../../src/db/schema/member-profiles";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";
import { balances } from "../../src/db/schema/balances";

describe("Members Management Routes", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testPlanId: number;

  // Reusable member payload (planId set in beforeEach after plan creation)
  const getBaseMember = () => ({
    email: "member@test-members.com",
    firstName: "Juan",
    lastName: "Perez",
    phone: "+5491155551234",
    dni: "30123456",
    branchId: 1,
    planId: testPlanId,
  });

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Helper: clean up test members (not the admin seed user).
   * Also cleans up member_notes, subscriptions, plans.
   */
  async function cleanupTestMembers(): Promise<void> {
    await cleanAllTestData(app);
  }

  /**
   * Helper: create a test subscription plan and return its ID.
   */
  async function createTestPlan(): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/subscriptions/plans",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Test Plan",
        planTier: "foundation",
        bookingMode: "flexible",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
      },
    });
    const body = JSON.parse(res.body);
    return body.id;
  }

  /**
   * Helper: create a member via the API and return the profile.
   */
  async function createMember(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; [key: string]: unknown }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...getBaseMember(), ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  // =========================================================================
  // GET /api/admin/members -- List Members
  // =========================================================================
  describe("GET /api/admin/members", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("returns paginated list of members with total count", async () => {
      await createMember();
      await createMember({
        email: "member2@test.com",
        dni: "30123457",
        firstName: "Maria",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body).toHaveProperty("page", 1);
      expect(body).toHaveProperty("limit", 20);
    });

    it("filters by search (name/email/DNI substring)", async () => {
      await createMember({ firstName: "Carlos", dni: "40111222" });
      await createMember({
        email: "maria@test.com",
        firstName: "Maria",
        dni: "40333444",
      });

      // Search by name
      const resByName = await app.inject({
        method: "GET",
        url: "/api/admin/members?search=Carlos",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyByName = JSON.parse(resByName.body);
      expect(bodyByName.members).toHaveLength(1);
      expect(bodyByName.members[0].firstName).toBe("Carlos");

      // Search by DNI
      const resByDni = await app.inject({
        method: "GET",
        url: "/api/admin/members?search=40333",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyByDni = JSON.parse(resByDni.body);
      expect(bodyByDni.members).toHaveLength(1);
      expect(bodyByDni.members[0].firstName).toBe("Maria");
    });

    it("search matches full name across firstName + lastName tokens", async () => {
      await createMember({
        email: "mf@test.com",
        firstName: "Martin",
        lastName: "Figueras",
        dni: "40555666",
      });
      // Decoy member: same first name, different last name
      await createMember({
        email: "mg@test.com",
        firstName: "Martin",
        lastName: "Gomez",
        dni: "40777888",
      });

      // First name alone finds both Martins
      const resFirst = await app.inject({
        method: "GET",
        url: "/api/admin/members?search=Martin",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyFirst = JSON.parse(resFirst.body);
      expect(bodyFirst.members.length).toBeGreaterThanOrEqual(2);

      // Full name in order finds only Martin Figueras
      const resFull = await app.inject({
        method: "GET",
        url: "/api/admin/members?search=Martin%20Figueras",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyFull = JSON.parse(resFull.body);
      expect(bodyFull.members).toHaveLength(1);
      expect(bodyFull.members[0].lastName).toBe("Figueras");

      // Full name in reversed order also finds Martin Figueras
      const resReversed = await app.inject({
        method: "GET",
        url: "/api/admin/members?search=Figueras%20Martin",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyReversed = JSON.parse(resReversed.body);
      expect(bodyReversed.members).toHaveLength(1);
      expect(bodyReversed.members[0].lastName).toBe("Figueras");
    });

    it("filters by branchId", async () => {
      await createMember();

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members?branchId=1",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
      for (const m of body.members) {
        expect(m.branchId).toBe(1);
      }
    });

    it("filters by status=inactivo returns only inactive members (Phase 103 R8)", async () => {
      const member = await createMember();

      // Phase 103: cancelling the last active sub triggers Plan 02's
      // recomputeUserStatus, which flips users.status -> 'inactivo'.
      await app.inject({
        method: "POST",
        url: `/api/admin/subscriptions/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members?status=inactivo",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body.members.length).toBe(1);
      expect(body.members[0].status).toBe("inactivo");
    });

    it("returns planName field for members with active subscription", async () => {
      await createMember();

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
      // Member was created with planId => auto-subscription => planName should be set
      expect(body.members[0]).toHaveProperty("planName", "Test Plan");
    });

    it("filters by planId returns only members with that plan", async () => {
      // Create a second plan
      const secondPlanRes = await app.inject({
        method: "POST",
        url: "/api/admin/subscriptions/plans",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Second Plan",
          planTier: "flex",
          bookingMode: "flexible",
          priceRegular: 5000,
          priceZero: 0,
          durationDays: 30,
        },
      });
      const secondPlanId = JSON.parse(secondPlanRes.body).id;

      await createMember();
      await createMember({
        email: "member2@test.com",
        dni: "40555666",
        planId: secondPlanId,
      });

      // Filter by first plan
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members?planId=${testPlanId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body.members).toHaveLength(1);
      expect(body.members[0].planName).toBe("Test Plan");
    });

    it("filters by planId=0 returns members without active subscription", async () => {
      // Create member with subscription
      await createMember();

      // Create member without subscription by registering via auth (no plan)
      await registerUser(app, {
        email: "noplan@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members?planId=0",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body.members).toHaveLength(1);
      expect(body.members[0].email).toBe("noplan@test.com");
      expect(body.members[0].planName).toBeNull();
    });

    it("exposes totalDebtByCurrency to admin but withholds it from gestion", async () => {
      // No-plan member (so the assignment charge doesn't seed its own balance)
      // with a single outstanding row → the aggregate is deterministic.
      const { user } = await registerUser(app, {
        email: "debtor@test-members.com",
        password: "password123",
        branchId: 1,
      });
      await app.db.insert(balances).values({
        memberId: user.id as number,
        targetKind: "subscription",
        targetId: 999999,
        currency: "ARS",
        amount: 5000,
      });

      // owner/admin: sees the financial aggregate.
      const adminRes = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(adminRes.statusCode).toBe(200);
      expect(JSON.parse(adminRes.body).totalDebtByCurrency).toEqual([
        { currency: "ARS", amount: 5000 },
      ]);

      // gestion: still gets the members list, but the debt figure is withheld
      // server-side (defense in depth behind the AlumnosPage banner gate).
      await createStaffUser(app, {
        email: "gestion@test-members.com",
        password: "gestionpass123",
        firstName: "Ges",
        lastName: "Tion",
        role: "gestion",
        branchId: 1,
      });
      const gestionToken = await getAuthToken(
        app,
        "gestion@test-members.com",
        "gestionpass123",
      );
      const gestionRes = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${gestionToken}` },
      });
      expect(gestionRes.statusCode).toBe(200);
      const gestionBody = JSON.parse(gestionRes.body);
      expect(gestionBody.members.length).toBeGreaterThan(0);
      expect(gestionBody.totalDebtByCurrency).toEqual([]);
    });
  });

  // =========================================================================
  // POST /api/admin/members -- Create Member
  // =========================================================================
  describe("POST /api/admin/members", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("creates a member with all required fields and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: getBaseMember(),
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("id");
      expect(body.email).toBe(getBaseMember().email);
      expect(body.firstName).toBe(getBaseMember().firstName);
      expect(body.lastName).toBe(getBaseMember().lastName);
      expect(body.phone).toBe(getBaseMember().phone);
      expect(body.dni).toBe(getBaseMember().dni);
      expect(body.branchId).toBe(getBaseMember().branchId);
      // Phase 103 (R7): admin-create with planId triggers assignPlan ->
      // recomputeUserStatus -> 'activo'. Without planId it would be 'prueba'.
      expect(body.status).toBe("activo");
      expect(body.level).toBe("alfa");
      expect(body.role).toBe("member");
      expect(body).toHaveProperty("branchName");
      expect(body).toHaveProperty("createdAt");
      // tempPassword must NOT leak in response
      expect(body).not.toHaveProperty("tempPassword");
    });

    it("auto-creates subscription when member is created with planId", async () => {
      const member = await createMember();

      // Verify subscription exists via subscriptions API
      const subRes = await app.inject({
        method: "GET",
        url: `/api/admin/subscriptions/members/${member.id}/subscription`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(subRes.statusCode).toBe(200);
      const subBody = JSON.parse(subRes.body);
      expect(subBody).toHaveProperty("id");
      expect(subBody.planId).toBe(testPlanId);
      expect(subBody.status).toBe("active");
      expect(subBody.planName).toBe("Test Plan");
    });

    it("returns 409 for duplicate email", async () => {
      await createMember();

      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ...getBaseMember(), dni: "99999999" }, // different DNI, same email
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("email");
    });

    it("returns 409 for duplicate DNI", async () => {
      await createMember();

      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...getBaseMember(),
          email: "different@test.com", // different email, same DNI
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("DNI");
    });

    // Phase 111-01 (REQ-9, D-26): trim firstName/lastName on create.
    // Prevents the Soledad Mailland bug (lastName="Mailland " stored
    // with trailing space).
    it("trims trailing/leading whitespace from firstName and lastName on create", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...getBaseMember(),
          firstName: "  Soledad  ",
          lastName: "  Mailland  ",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.firstName).toBe("Soledad");
      expect(body.lastName).toBe("Mailland");

      // Confirm against DB (defense against API-level transform that
      // doesn't reach storage).
      const [row] = await app.db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(eq(users.id, body.id));
      expect(row?.firstName).toBe("Soledad");
      expect(row?.lastName).toBe("Mailland");
    });
  });

  // =========================================================================
  // GET /api/admin/members/:userId -- Get Member Profile
  // =========================================================================
  describe("GET /api/admin/members/:userId", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("returns full member profile", async () => {
      const member = await createMember({
        dateOfBirth: "1990-05-15",
        gender: "male",
        emergencyContactName: "Ana Perez",
        emergencyContactPhone: "+5491155559999",
        emergencyContactRelationship: "Madre",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(member.id);
      expect(body.dateOfBirth).toBe("1990-05-15");
      expect(body.gender).toBe("male");
      expect(body.emergencyContactName).toBe("Ana Perez");
      expect(body.emergencyContactPhone).toBe("+5491155559999");
      expect(body.emergencyContactRelationship).toBe("Madre");
    });

    it("returns 404 for non-existent member", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/99999",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns latestTrial = null for member without trial bookings", async () => {
      const member = await createMember({
        email: "no-trial@test-members.com",
        dni: "35404040",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.latestTrial).toBeNull();
    });

    it("returns latestTrial with attended=null for a future trial booking", async () => {
      const member = await createMember({
        email: "future-trial@test-members.com",
        dni: "35414141",
      });

      const [actIns] = await app.db
        .insert(activities)
        .values({ name: "Test Trial Activity Future" })
        .$returningId();
      const [schedIns] = await app.db
        .insert(schedules)
        .values({
          branchId: 1,
          activityId: actIns.id,
          dayOfWeek: 1,
          startTime: "10:00",
          endTime: "11:00",
          maxCapacity: 10,
        })
        .$returningId();
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      await app.db.insert(bookings).values({
        memberId: member.id,
        scheduleId: schedIns.id,
        bookingDate: futureDate,
        status: "reservado",
        isTrial: true,
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.latestTrial).not.toBeNull();
      expect(body.latestTrial.bookingDate).toBe(futureDate);
      expect(body.latestTrial.startTime).toBe("10:00");
      expect(body.latestTrial.attended).toBeNull();
    });

    it("returns latestTrial with attended='no' for past trial without attendance", async () => {
      const member = await createMember({
        email: "past-no-show@test-members.com",
        dni: "35424242",
      });

      const [actIns] = await app.db
        .insert(activities)
        .values({ name: "Test Trial Activity Past" })
        .$returningId();
      const [schedIns] = await app.db
        .insert(schedules)
        .values({
          branchId: 1,
          activityId: actIns.id,
          dayOfWeek: 1,
          startTime: "11:00",
          endTime: "12:00",
          maxCapacity: 10,
        })
        .$returningId();
      const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      await app.db.insert(bookings).values({
        memberId: member.id,
        scheduleId: schedIns.id,
        bookingDate: pastDate,
        status: "reservado",
        isTrial: true,
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.latestTrial.attended).toBe("no");
    });

    it("returns latestTrial with attended='si' when an attendance row exists", async () => {
      const member = await createMember({
        email: "past-attended@test-members.com",
        dni: "35434343",
      });

      const [actIns] = await app.db
        .insert(activities)
        .values({ name: "Test Trial Activity Attended" })
        .$returningId();
      const [schedIns] = await app.db
        .insert(schedules)
        .values({
          branchId: 1,
          activityId: actIns.id,
          dayOfWeek: 1,
          startTime: "12:00",
          endTime: "13:00",
          maxCapacity: 10,
        })
        .$returningId();
      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      await app.db.insert(bookings).values({
        memberId: member.id,
        scheduleId: schedIns.id,
        bookingDate: pastDate,
        status: "qr_escaneado",
        isTrial: true,
      });
      await app.db.insert(attendance).values({
        memberId: member.id,
        scheduleId: schedIns.id,
        branchId: 1,
        sessionDate: pastDate,
        status: "confirmado",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.latestTrial.attended).toBe("si");
    });
  });

  // =========================================================================
  // PUT /api/admin/members/:userId -- Update Member
  // =========================================================================
  describe("PUT /api/admin/members/:userId", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("updates profile fields", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          firstName: "Carlos",
          phone: "+5491199998888",
          level: "delta",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.firstName).toBe("Carlos");
      expect(body.phone).toBe("+5491199998888");
      expect(body.level).toBe("delta");
      // Unchanged fields preserved
      expect(body.lastName).toBe(getBaseMember().lastName);
    });

    it("returns 404 for non-existent member", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/admin/members/99999",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { firstName: "Ghost" },
      });

      expect(res.statusCode).toBe(404);
    });

    // Phase 111-01 (REQ-9, D-26): trim firstName/lastName on update.
    it("trims trailing/leading whitespace from firstName and lastName on update", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          firstName: "  Updated ",
          lastName: "  Mailland  ",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.firstName).toBe("Updated");
      expect(body.lastName).toBe("Mailland");

      // Confirm against DB.
      const [row] = await app.db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(eq(users.id, member.id as number));
      expect(row?.firstName).toBe("Updated");
      expect(row?.lastName).toBe("Mailland");
    });

    // Write-once email: a trial (email=NULL) can have its email set via the
    // standard edit flow on the way to becoming an alumno.
    it("sets the email when the member has none yet (trial → alumno)", async () => {
      const trialRes = await app.inject({
        method: "POST",
        url: "/api/admin/members/trial",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          firstName: "Lead",
          lastName: "SinMail",
          phone: "+5491166660001",
          branchId: 1,
        },
      });
      expect(trialRes.statusCode).toBe(201);
      const trial = JSON.parse(trialRes.body);

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${trial.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { email: "nuevo-alumno@test.com" },
      });

      expect(res.statusCode).toBe(200);
      const [row] = await app.db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, trial.id as number));
      expect(row?.email).toBe("nuevo-alumno@test.com");
    });

    // An email already on file is immutable — the field is the member's app
    // login identity. The generic edit path silently ignores email changes.
    it("ignores email change when the member already has one", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { email: "otro@test.com" },
      });

      expect(res.statusCode).toBe(200);
      const [row] = await app.db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, member.id as number));
      expect(row?.email).toBe(getBaseMember().email);
    });

    it("returns 409 when setting an email already used by another member", async () => {
      const member = await createMember(); // owns getBaseMember().email
      const trialRes = await app.inject({
        method: "POST",
        url: "/api/admin/members/trial",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          firstName: "Lead",
          lastName: "Dup",
          phone: "+5491166660002",
          branchId: 1,
        },
      });
      const trial = JSON.parse(trialRes.body);

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${trial.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { email: getBaseMember().email },
      });

      expect(res.statusCode).toBe(409);
      // The trial stays without an email.
      const [row] = await app.db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, trial.id as number));
      expect(row?.email).toBeNull();
      void member;
    });
  });

  // =========================================================================
  // DELETE /api/admin/members/:userId -- Soft-delete a member
  // =========================================================================
  describe("DELETE /api/admin/members/:userId", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("admin soft-deletes a member; GETs return 404 and email/dni are freed", async () => {
      const member = await createMember({
        email: "reusable@test-members.com",
        dni: "35111222",
      });

      // Delete
      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(delRes.statusCode).toBe(204);

      // Single-member GET returns 404
      const getRes = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(getRes.statusCode).toBe(404);

      // List endpoint hides the deleted row
      const listRes = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const listBody = JSON.parse(listRes.body) as {
        members: Array<{ id: number }>;
      };
      expect(listBody.members.map((m) => m.id)).not.toContain(member.id);

      // The original email and DNI are now reusable: re-register with them.
      const reregRes = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "reusable@test-members.com",
          password: "newpass123",
          branchId: 1,
          firstName: "Reborn",
          lastName: "Alumno",
          dni: "35111222",
          gender: "male",
        },
      });
      expect(reregRes.statusCode).toBe(200);
    });

    it("second delete on the same id returns 404 (row already scrubbed)", async () => {
      const member = await createMember({
        email: "double-delete@test-members.com",
        dni: "35333444",
      });

      const first = await app.inject({
        method: "DELETE",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(first.statusCode).toBe(204);

      const second = await app.inject({
        method: "DELETE",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(second.statusCode).toBe(404);
    });

    it("returns 404 for non-existent member id", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/admin/members/99999",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it("cancels the active subscription and future bookings on delete", async () => {
      // createMember(planId=...) auto-creates an active subscription, so the
      // member starts with one active/paused sub on the books.
      const member = await createMember({
        email: "sub-cancel@test-members.com",
        dni: "35777888",
      });

      // Stand up a schedule + a future booking so the inline booking
      // cancellation branch has something to catch. The booking is NOT tied
      // through subscription_schedules — it stands in for trial bookings or
      // stale reservations that cancelSubscription would otherwise miss.
      const [actIns] = await app.db
        .insert(activities)
        .values({ name: "Test Activity Delete" })
        .$returningId();
      const [schedIns] = await app.db
        .insert(schedules)
        .values({
          branchId: 1,
          activityId: actIns.id,
          dayOfWeek: 1,
          startTime: "10:00",
          endTime: "11:00",
          maxCapacity: 10,
        })
        .$returningId();
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      await app.db.insert(bookings).values({
        memberId: member.id,
        scheduleId: schedIns.id,
        bookingDate: tomorrow,
        status: "reservado",
      });

      // Delete
      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(delRes.statusCode).toBe(204);

      // Every subscription for this member is now cancelled.
      const subs = await app.db
        .select({ status: subscriptions.status })
        .from(subscriptions)
        .where(eq(subscriptions.userId, member.id));
      expect(subs.length).toBeGreaterThan(0);
      for (const s of subs) expect(s.status).toBe("cancelled");

      // The future booking is cancelled too.
      const [book] = await app.db
        .select({ status: bookings.status })
        .from(bookings)
        .where(eq(bookings.memberId, member.id));
      expect(book.status).toBe("cancelado");
    });

    it("refuses delete with 400 SUB_HAS_ACTIVE_TRANSACTIONS when sub has non-voided charges", async () => {
      // Phase 111 REQ-3: cancelSubscription throws when there are active
      // charge transactions on the sub. The DELETE route surfaces this as a
      // structured 400 so the admin frontend can render an actionable
      // "anular en Detalle Financiero" message.
      const member = await createMember({
        email: "blocked-by-charges@test-members.com",
        dni: "35888999",
      });

      // Find the auto-created active subscription
      const [sub] = await app.db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.userId, member.id));
      expect(sub).toBeDefined();

      // Find admin user id for recordedBy
      const [admin] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, "admin@test.com"));

      // Insert a non-voided charge transaction linked to the sub
      const today = new Date().toISOString().split("T")[0];
      const [txIns] = await app.db
        .insert(financialTransactions)
        .values({
          memberId: member.id,
          kind: "plan_charge",
          direction: "inflow",
          amount: 65000,
          currency: "ARS",
          paymentMethod: "cash",
          transactionDate: today,
          effectiveDate: today,
          branchId: 1,
          recordedBy: admin.id,
        })
        .$returningId();
      await app.db.insert(transactionLinks).values({
        transactionId: txIns.id,
        targetKind: "subscription",
        targetId: sub.id,
        allocatedAmount: 65000,
      });

      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(delRes.statusCode).toBe(400);
      const body = JSON.parse(delRes.body) as {
        code?: string;
        details?: {
          transactionIds?: number[];
          totalAmount?: number;
          currency?: string;
        };
      };
      expect(body.code).toBe("SUB_HAS_ACTIVE_TRANSACTIONS");
      expect(body.details?.transactionIds).toContain(txIns.id);
      expect(body.details?.totalAmount).toBe(65000);
      expect(body.details?.currency).toBe("ARS");

      // The member is still readable — the delete never landed.
      const getRes = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(getRes.statusCode).toBe(200);
    });

    it("coach cannot delete a member (403) — ADMIN_ROLES gate", async () => {
      const member = await createMember({
        email: "coach-cannot-delete@test-members.com",
        dni: "35555666",
      });

      await createStaffUser(app, {
        email: "coach-delete-test@test.com",
        password: "coachpass123",
        firstName: "Coach",
        lastName: "Test",
        role: "coach",
        branchId: 1,
      });
      const coachToken = await getAuthToken(
        app,
        "coach-delete-test@test.com",
        "coachpass123",
      );

      const res = await app.inject({
        method: "DELETE",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${coachToken}` },
      });
      expect(res.statusCode).toBe(403);

      // The member is still readable afterwards — the delete never landed.
      const getRes = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(getRes.statusCode).toBe(200);
    });

    it("refuses to delete non-member rows (role=coach) — returns 400", async () => {
      await createStaffUser(app, {
        email: "protected-coach@test.com",
        password: "coachpass123",
        firstName: "Protected",
        lastName: "Coach",
        role: "coach",
        branchId: 1,
      });
      const [row] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, "protected-coach@test.com"));

      const res = await app.inject({
        method: "DELETE",
        url: `/api/admin/members/${row.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("alumnos");
    });
  });

  // =========================================================================
  // GET /api/admin/members/check-dni -- DNI Uniqueness Check
  // =========================================================================
  describe("GET /api/admin/members/check-dni", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("returns available=true for unused DNI", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/check-dni?dni=99999999",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.available).toBe(true);
    });

    it("returns available=false with existing member name for taken DNI", async () => {
      await createMember({ firstName: "Pedro", lastName: "Garcia" });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/check-dni?dni=${getBaseMember().dni}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.available).toBe(false);
      expect(body.existingMemberName).toBe("Pedro Garcia");
    });

    it("excludes a specific user from uniqueness check", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/check-dni?dni=${getBaseMember().dni}&excludeUserId=${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.available).toBe(true);
    });
  });

  // =========================================================================
  // Notes CRUD
  // =========================================================================
  describe("Notes", () => {
    let memberId: number;

    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
      const member = await createMember();
      memberId = member.id;
    });

    it("POST creates a note and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { content: "Primera sesion de evaluacion completada." },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("id");
      expect(body.userId).toBe(memberId);
      expect(body.content).toBe("Primera sesion de evaluacion completada.");
      expect(body).toHaveProperty("authorName");
      expect(body).toHaveProperty("createdAt");
    });

    it("GET returns notes with author info ordered by most recent", async () => {
      // Create two notes
      await app.inject({
        method: "POST",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { content: "Nota 1" },
      });
      await app.inject({
        method: "POST",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { content: "Nota 2" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.notes).toHaveLength(2);
      // Most recent first
      expect(body.notes[0].content).toBe("Nota 2");
      expect(body.notes[1].content).toBe("Nota 1");
      // Author info present
      expect(body.notes[0]).toHaveProperty("authorId");
      expect(body.notes[0]).toHaveProperty("authorName");
    });

    it("PUT updates note content", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { content: "Original" },
      });
      const note = JSON.parse(createRes.body);

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${memberId}/notes/${note.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { content: "Updated content" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.content).toBe("Updated content");
    });

    it("DELETE removes note", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { content: "To be deleted" },
      });
      const note = JSON.parse(createRes.body);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/admin/members/${memberId}/notes/${note.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      // Verify it's gone
      const listRes = await app.inject({
        method: "GET",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const listBody = JSON.parse(listRes.body);
      expect(listBody.notes).toHaveLength(0);
    });
  });

  // =========================================================================
  // Authorization
  // =========================================================================
  describe("Authorization", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("non-admin user gets 403 on all /admin/members endpoints", async () => {
      // Register a regular member
      const { token: memberToken } = await registerUser(app, {
        email: "regular-member-auth@test.com",
        password: "pass123456",
        branchId: 1,
        firstName: "Regular",
        lastName: "Member",
      });

      const endpoints = [
        { method: "GET" as const, url: "/api/admin/members" },
        { method: "GET" as const, url: "/api/admin/members/1" },
        {
          method: "POST" as const,
          url: "/api/admin/members",
          payload: getBaseMember(),
        },
        {
          method: "PUT" as const,
          url: "/api/admin/members/1",
          payload: { firstName: "Hacked" },
        },
        {
          method: "GET" as const,
          url: "/api/admin/members/check-dni?dni=12345",
        },
        { method: "GET" as const, url: "/api/admin/members/1/notes" },
        {
          method: "POST" as const,
          url: "/api/admin/members/1/notes",
          payload: { content: "hacked" },
        },
      ];

      for (const ep of endpoints) {
        const res = await app.inject({
          method: ep.method,
          url: ep.url,
          headers: { authorization: `Bearer ${memberToken}` },
          payload: "payload" in ep ? ep.payload : undefined,
        });

        expect(
          res.statusCode,
          `Expected 403 for ${ep.method} ${ep.url}, got ${res.statusCode}`,
        ).toBe(403);
      }
    });
  });

  // =========================================================================
  // documentType and address fields
  // =========================================================================
  describe("documentType and address fields", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("POST creates member with documentType and address", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...getBaseMember(),
          documentType: "DNI",
          address: "Calle Falsa 123",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.documentType).toBe("DNI");
      expect(body.address).toBe("Calle Falsa 123");
    });

    it("POST creates member without documentType/address (backward compatible)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: getBaseMember(),
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.documentType).toBeNull();
      expect(body.address).toBeNull();
    });

    it("PUT updates documentType and address", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          documentType: "Pasaporte",
          address: "Av. Siempre Viva 742",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.documentType).toBe("Pasaporte");
      expect(body.address).toBe("Av. Siempre Viva 742");
    });

    it("PUT with documentType=null clears the field", async () => {
      const member = await createMember({
        documentType: "DNI",
        address: "Calle Test 456",
      });

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          documentType: null,
          address: null,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.documentType).toBeNull();
      expect(body.address).toBeNull();
    });

    it("GET member profile returns documentType and address", async () => {
      const member = await createMember({
        documentType: "NIE",
        address: "Gran Via 100, Madrid",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.documentType).toBe("NIE");
      expect(body.address).toBe("Gran Via 100, Madrid");
    });

    it("GET member list includes documentType", async () => {
      await createMember({ documentType: "NIF" });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
      expect(body.members[0]).toHaveProperty("documentType");
      expect(body.members[0].documentType).toBe("NIF");
    });
  });

  // =========================================================================
  // Member export
  // =========================================================================
  describe("Member export", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("export returns 200 with xlsx Content-Type and Content-Disposition", async () => {
      await createMember({ firstName: "Juan", lastName: "Perez" });
      await createMember({
        email: "member2@test.com",
        dni: "40111222",
        firstName: "Maria",
        lastName: "Lopez",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/export",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const disposition = res.headers["content-disposition"] as string;
      expect(disposition).toContain("attachment");
      expect(disposition).toContain(".xlsx");
      // Response body should be a non-empty buffer
      expect(res.rawPayload.length).toBeGreaterThan(0);
    });

    it("filter params (status=activo) reduce result set correctly (Phase 103 R8)", async () => {
      // Create active member
      await createMember({
        firstName: "Activo",
        lastName: "Member",
        email: "activo@test.com",
        dni: "50111111",
      });
      // Create member then deactivate by cancelling their subscription.
      // Phase 103: cancellation triggers Plan 02 recomputeUserStatus →
      // users.status flips to 'inactivo'.
      const inactive = await createMember({
        firstName: "Inactivo",
        lastName: "Member",
        email: "inactivo@test.com",
        dni: "50222222",
      });
      await app.inject({
        method: "POST",
        url: `/api/admin/subscriptions/members/${inactive.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/export?status=activo",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);

      // Parse the xlsx buffer with exceljs to verify contents
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      await workbook.xlsx.load(res.rawPayload);

      const sheet = workbook.getWorksheet("Alumnos");
      expect(sheet).toBeDefined();

      // Row 1 is header, data rows start at 2
      // Only the active member should appear
      expect(sheet!.rowCount).toBe(2); // 1 header + 1 data row

      const dataRow = sheet!.getRow(2);
      // Column 1 = Nombre, Column 8 = Estado
      expect(dataRow.getCell(1).value).toBe("Activo Member");
      expect(dataRow.getCell(8).value).toBe("Activo");
    });
  });

  // =========================================================================
  // Member photo upload URL
  // =========================================================================
  describe("Member photo upload URL", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("returns 503 when R2 is not configured", async () => {
      // In the test environment, R2 is not configured (no R2_ACCOUNT_ID env var),
      // so fastify.r2 should be undefined and the endpoint should return 503.
      const hasR2 = !!process.env.R2_ACCOUNT_ID;
      if (hasR2) {
        // If R2 is configured in test env, skip this test
        return;
      }

      const member = await createMember();

      const res = await app.inject({
        method: "POST",
        url: `/api/admin/members/${member.id}/photo/upload-url`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { filename: "profile.jpg" },
      });

      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.body);
      expect(body.message).toBe("Almacenamiento de imagenes no configurado");
    });

    it("returns photoUrl field in member profile (null by default)", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("photoUrl");
      expect(body.photoUrl).toBeNull();
    });

    it("returns photoUrl field in member list (null by default)", async () => {
      await createMember();

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
      expect(body.members[0]).toHaveProperty("photoUrl");
      expect(body.members[0].photoUrl).toBeNull();
    });

    it("photoUrl persists after update via PUT", async () => {
      const member = await createMember();
      const testUrl = "https://cdn.example.com/members/photos/1-12345.jpg";

      // Update photoUrl via PUT member endpoint
      const updateRes = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { photoUrl: testUrl },
      });

      expect(updateRes.statusCode).toBe(200);
      const updateBody = JSON.parse(updateRes.body);
      expect(updateBody.photoUrl).toBe(testUrl);

      // Verify it persists on GET
      const getRes = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(getRes.statusCode).toBe(200);
      const getBody = JSON.parse(getRes.body);
      expect(getBody.photoUrl).toBe(testUrl);
    });
  });

  // =========================================================================
  // avatarType filter and response field
  // =========================================================================
  describe("avatarType filter and response field", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("GET /members returns avatarType in list response", async () => {
      const member = await createMember();

      // Seed member_profiles with avatarType
      await app.db.insert(memberProfiles).values({
        userId: member.id,
        avatarType: "B",
        onboardingCompletedAt: new Date(),
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const found = body.members.find(
        (m: Record<string, unknown>) => m.id === member.id,
      );
      expect(found).toBeDefined();
      expect(found.avatarType).toBe("B");
    });

    it("GET /members?avatarType=B filters to matching members only", async () => {
      const memberA = await createMember({
        email: "avatar-a@test.com",
        dni: "60111111",
      });
      const memberB = await createMember({
        email: "avatar-b@test.com",
        dni: "60222222",
      });

      await app.db.insert(memberProfiles).values({
        userId: memberA.id,
        avatarType: "A",
        onboardingCompletedAt: new Date(),
      });
      await app.db.insert(memberProfiles).values({
        userId: memberB.id,
        avatarType: "B",
        onboardingCompletedAt: new Date(),
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members?avatarType=B",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members).toHaveLength(1);
      expect(body.members[0].avatarType).toBe("B");
      expect(body.members[0].id).toBe(memberB.id);
    });

    it("GET /members?avatarType=none filters to members without avatar", async () => {
      const memberWithAvatar = await createMember({
        email: "has-avatar@test.com",
        dni: "60333333",
      });
      const memberWithout = await createMember({
        email: "no-avatar@test.com",
        dni: "60444444",
      });

      // Only memberWithAvatar gets an avatar
      await app.db.insert(memberProfiles).values({
        userId: memberWithAvatar.id,
        avatarType: "A",
        onboardingCompletedAt: new Date(),
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members?avatarType=none",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // memberWithout has no profile row, so no avatar_type
      const ids = body.members.map((m: Record<string, unknown>) => m.id);
      expect(ids).toContain(memberWithout.id);
      expect(ids).not.toContain(memberWithAvatar.id);
    });

    it("GET /members/:id returns avatarType in detail response", async () => {
      const member = await createMember();

      await app.db.insert(memberProfiles).values({
        userId: member.id,
        avatarType: "K",
        onboardingCompletedAt: new Date(),
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.avatarType).toBe("K");
    });

    it("GET /members/:id returns null avatarType when not set", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.avatarType).toBeNull();
    });
  });

  // =========================================================================
  // DELETE — gestion role can soft-delete (MEMBER_LIFECYCLE_ROLES)
  // =========================================================================
  describe("DELETE /api/admin/members/:userId — gestion role", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("gestion role can soft-delete a member", async () => {
      const member = await createMember({
        email: "gestion-can-delete@test-members.com",
        dni: "36111222",
      });

      await createStaffUser(app, {
        email: "gestion-delete@test.com",
        password: "gestionpass123",
        firstName: "Mica",
        lastName: "Gestion",
        role: "gestion",
        branchId: 1,
      });
      const gestionToken = await getAuthToken(
        app,
        "gestion-delete@test.com",
        "gestionpass123",
      );

      const res = await app.inject({
        method: "DELETE",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${gestionToken}` },
      });
      expect(res.statusCode).toBe(204);

      const getRes = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(getRes.statusCode).toBe(404);
    });

    it("recepcion role still cannot soft-delete (not in MEMBER_LIFECYCLE_ROLES)", async () => {
      const member = await createMember({
        email: "recepcion-blocked@test-members.com",
        dni: "36333444",
      });

      await createStaffUser(app, {
        email: "recepcion-delete@test.com",
        password: "recepass123",
        firstName: "Recep",
        lastName: "Cion",
        role: "recepcion",
        branchId: 1,
      });
      const recepcionToken = await getAuthToken(
        app,
        "recepcion-delete@test.com",
        "recepass123",
      );

      const res = await app.inject({
        method: "DELETE",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${recepcionToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // =========================================================================
  // PUT /api/admin/members/:userId/password -- Reset to "eltemplo2026"
  // =========================================================================
  describe("PUT /api/admin/members/:userId/password", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("admin resets password; member can log in with eltemplo2026", async () => {
      const member = await createMember({
        email: "pwd-reset-admin@test-members.com",
        dni: "37111222",
      });

      // Manually set a different password to prove the reset overwrites it.
      const argon2Mod = await import("argon2");
      const otherHash = await argon2Mod.default.hash("someOtherPass!");
      await app.db
        .update(users)
        .set({ passwordHash: otherHash })
        .where(eq(users.id, member.id));

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}/password`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(204);

      const token = await getAuthToken(
        app,
        "pwd-reset-admin@test-members.com",
        "eltemplo2026",
      );
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("gestion role can reset a member's password", async () => {
      const member = await createMember({
        email: "pwd-reset-gestion@test-members.com",
        dni: "37333444",
      });

      await createStaffUser(app, {
        email: "gestion-pwd@test.com",
        password: "gestionpass123",
        firstName: "Mica",
        lastName: "Gestion",
        role: "gestion",
        branchId: 1,
      });
      const gestionToken = await getAuthToken(
        app,
        "gestion-pwd@test.com",
        "gestionpass123",
      );

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}/password`,
        headers: { authorization: `Bearer ${gestionToken}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it("coach cannot reset passwords (403)", async () => {
      const member = await createMember({
        email: "pwd-reset-coach-blocked@test-members.com",
        dni: "37555666",
      });

      await createStaffUser(app, {
        email: "coach-pwd@test.com",
        password: "coachpass123",
        firstName: "Coach",
        lastName: "Test",
        role: "coach",
        branchId: 1,
      });
      const coachToken = await getAuthToken(
        app,
        "coach-pwd@test.com",
        "coachpass123",
      );

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}/password`,
        headers: { authorization: `Bearer ${coachToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("recepcion cannot reset passwords (403)", async () => {
      const member = await createMember({
        email: "pwd-reset-rec-blocked@test-members.com",
        dni: "37777888",
      });

      await createStaffUser(app, {
        email: "recepcion-pwd@test.com",
        password: "recepass123",
        firstName: "Recep",
        lastName: "Cion",
        role: "recepcion",
        branchId: 1,
      });
      const recToken = await getAuthToken(
        app,
        "recepcion-pwd@test.com",
        "recepass123",
      );

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}/password`,
        headers: { authorization: `Bearer ${recToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("refuses to reset a non-member row (target=coach) — 400", async () => {
      await createStaffUser(app, {
        email: "protected-coach-pwd@test.com",
        password: "coachpass123",
        firstName: "Protected",
        lastName: "Coach",
        role: "coach",
        branchId: 1,
      });
      const [row] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, "protected-coach-pwd@test.com"));

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${row.id}/password`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 404 for non-existent member id", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/admin/members/99999/password",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // PUT /api/admin/members/:userId — virtual→presencial conversion
  // =========================================================================
  describe("PUT /api/admin/members/:userId — virtual→presencial conversion", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    /**
     * Helper: register a freemium online member (defaults to the ONLINE
     * virtual branch when branchId is omitted from /auth/register).
     */
    async function registerOnlineMember(email: string): Promise<number> {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email,
          password: "onlinepass123",
          firstName: "Online",
          lastName: "Alumno",
          gender: "male",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      return body.user.id;
    }

    it("blocks conversion when presencial required fields are missing", async () => {
      const userId = await registerOnlineMember(
        "conv-missing@test-members.com",
      );

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${userId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          branchId: 1, // physical Test branch
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("convertir a presencial");
      expect(body.message).toMatch(/DNI|Tipo de documento|Fecha/i);

      // Branch did not change.
      const [row] = await app.db
        .select({ branchId: users.branchId, status: users.status })
        .from(users)
        .where(eq(users.id, userId));
      expect(row.branchId).not.toBe(1);
      expect(row.status).toBe("freemium");
    });

    it("converts a freemium online member to presencial and forces status=inactivo", async () => {
      const userId = await registerOnlineMember("conv-ok@test-members.com");

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${userId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          branchId: 1,
          dni: "38111222",
          documentType: "DNI",
          dateOfBirth: "1990-01-01",
          address: "Av. Siempreviva 742",
          emergencyContactName: "Fer",
          emergencyContactPhone: "+5491155557777",
          emergencyContactRelationship: "Hermana",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.branchId).toBe(1);
      expect(body.status).toBe("inactivo");
    });

    it("accepts conversion when missing fields were already on the row", async () => {
      // Register, then patch missing presencial fields directly into the row
      // without changing the branch — simulates a user who finished
      // onboarding online and only the branch flip is left.
      const userId = await registerOnlineMember("conv-merge@test-members.com");
      await app.db
        .update(users)
        .set({
          dni: "38333444",
          documentType: "DNI",
          dateOfBirth: "1990-05-05",
          address: "Calle Falsa 123",
          emergencyContactName: "Mica",
          emergencyContactPhone: "+5491100009999",
          emergencyContactRelationship: "Madre",
        })
        .where(eq(users.id, userId));

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${userId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { branchId: 1 },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.branchId).toBe(1);
      expect(body.status).toBe("inactivo");
    });

    it("a non-branch PUT on a presencial member does not flip status to inactivo", async () => {
      // Member is already presencial (createMember uses branchId=1) and has
      // a subscription from the seeded plan — non-conversion edits must not
      // touch status. We assert status is NOT 'inactivo' (the conversion
      // sentinel) rather than pinning the exact post-create value, since
      // the recomputeUserStatus 'prueba' vs 'activo' branch depends on
      // start_date semantics that are out of scope for this test.
      const member = await createMember({
        email: "conv-noop@test-members.com",
        dni: "38555666",
      });

      const beforeRow = await app.db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, member.id))
        .limit(1);
      const statusBefore = beforeRow[0]?.status;

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { phone: "+5491100001111" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).not.toBe("inactivo");
      expect(body.status).toBe(statusBefore);
    });
  });

  // =========================================================================
  // PUT /api/admin/members/:userId — SP → legajo auto-promotion
  // =========================================================================
  // Soft-registered "sesión de prueba" leads (status='prueba') start with
  // most fields NULL. When the admin completes the presencial-required
  // fields (DNI, tipo de documento, fecha de nacimiento) via the edit
  // dialog, the handler must flip status to 'inactivo' so the Suscripción
  // tab in the admin detail page unlocks and the admin can assign a plan.
  // Without this flip the tab stays hidden (it gates on status !== 'prueba')
  // and the save looks silently lost from the admin's POV.
  describe("PUT /api/admin/members/:userId — SP → legajo auto-promotion", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
    });

    /**
     * Helper: soft-register an SP lead and return the new userId. Mirrors
     * the receptionist-at-the-door flow — only firstName/lastName/phone/
     * branchId are captured; everything else stays NULL.
     */
    async function softRegisterTrial(phone = "1155557777"): Promise<number> {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members/trial",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          firstName: "Sebastian",
          lastName: "Lead",
          phone,
          branchId: 1,
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("prueba");
      return body.id;
    }

    it("promotes an SP lead to 'inactivo' when all presencial fields are completed in one PUT", async () => {
      const userId = await softRegisterTrial();

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${userId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          firstName: "Sebastian",
          lastName: "Lead",
          email: "sp-promote@test-members.com",
          dni: "39111222",
          documentType: "DNI",
          dateOfBirth: "1992-03-04",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("inactivo");

      // Confirm against DB (response shape independence).
      const [row] = await app.db
        .select({ status: users.status, dni: users.dni })
        .from(users)
        .where(eq(users.id, userId));
      expect(row?.status).toBe("inactivo");
      expect(row?.dni).toBe("39111222");
    });

    it("keeps SP lead in 'prueba' when a required field is still missing after the PUT", async () => {
      const userId = await softRegisterTrial("1155558888");

      // Submit dni + documentType but NO dateOfBirth — still incomplete.
      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${userId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          firstName: "Sebastian",
          lastName: "Lead",
          dni: "39333444",
          documentType: "DNI",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("prueba");

      const [row] = await app.db
        .select({ status: users.status, dni: users.dni })
        .from(users)
        .where(eq(users.id, userId));
      expect(row?.status).toBe("prueba");
      expect(row?.dni).toBe("39333444"); // personal data still persisted
    });

    it("promotes SP lead via merged view (existing row fields + small PUT)", async () => {
      // Simulates a two-step completion: a previous PUT already filled
      // dni + documentType, and this second PUT only adds dateOfBirth.
      // The merged view should be complete → status flips to 'inactivo'.
      const userId = await softRegisterTrial("1155559999");

      await app.db
        .update(users)
        .set({
          dni: "39555666",
          documentType: "DNI",
        })
        .where(eq(users.id, userId));

      // Sanity: still in 'prueba' because no PUT has triggered the flip yet.
      const [pre] = await app.db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, userId));
      expect(pre?.status).toBe("prueba");

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${userId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          firstName: "Sebastian",
          lastName: "Lead",
          dateOfBirth: "1992-03-04",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("inactivo");
    });
  });
});
