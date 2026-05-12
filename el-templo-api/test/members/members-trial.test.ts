import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { users } from "../../src/db/schema/users";
import argon2 from "argon2";

/**
 * POST /api/admin/members/trial — soft register for "sesión de prueba" (SP).
 *
 * The receptionist-facing flow captures only 4 fields at the door:
 * firstName, lastName, phone, branchId. Everything else (email, DNI,
 * documentType, dateOfBirth, etc.) stays NULL until the lead converts via
 * the standard MemberFormDialog edit + assignPlan flow.
 */
describe("POST /api/admin/members/trial", () => {
  let app: FastifyInstance;
  let adminToken: string;

  const basePayload = () => ({
    firstName: "Juan",
    lastName: "Perez",
    phone: "1155551234",
    branchId: 1,
  });

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  it("creates a trial member with only 4 fields and returns 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePayload(),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("id");
    expect(body.firstName).toBe("Juan");
    expect(body.lastName).toBe("Perez");
    expect(body.phone).toBe("1155551234");
    expect(body.branchId).toBe(1);
    expect(body.status).toBe("prueba");
    expect(body.level).toBe("alfa");
    expect(body.role).toBe("member");
    expect(body).not.toHaveProperty("tempPassword");

    // Verify against DB that the soft-register fields stay NULL (the
    // response serialization coerces null → "" via memberProfileSchema's
    // non-nullable string fields, so the JSON body alone isn't reliable).
    const [row] = await app.db
      .select({
        email: users.email,
        dni: users.dni,
        documentType: users.documentType,
        dateOfBirth: users.dateOfBirth,
        address: users.address,
        gender: users.gender,
      })
      .from(users)
      .where(eq(users.id, body.id));

    expect(row?.email).toBeNull();
    expect(row?.dni).toBeNull();
    expect(row?.documentType).toBeNull();
    expect(row?.dateOfBirth).toBeNull();
    expect(row?.address).toBeNull();
    expect(row?.gender).toBeNull();
  });

  it("sets password to the standard temp password ('eltemplo2026')", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePayload(),
    });
    const body = JSON.parse(res.body);

    const [row] = await app.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, body.id));

    expect(await argon2.verify(row!.passwordHash, "eltemplo2026")).toBe(true);
  });

  it("trims whitespace from firstName and lastName", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        ...basePayload(),
        firstName: "  Soledad  ",
        lastName: "  Mailland  ",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.firstName).toBe("Soledad");
    expect(body.lastName).toBe("Mailland");
  });

  it("normalizes phone to last 10 digits", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePayload(), phone: "+54 9 11 5555-1234" },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.phone).toBe("1155551234");
  });

  it("rejects duplicate phone with 409 (matches via normalized last-10)", async () => {
    // First creation succeeds.
    const first = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePayload(),
    });
    expect(first.statusCode).toBe(201);

    // Same phone with cosmetic differences → still rejected.
    const second = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        ...basePayload(),
        firstName: "Otro",
        lastName: "Nombre",
        phone: "+54 9 11 5555-1234",
      },
    });
    expect(second.statusCode).toBe(409);
    const body = JSON.parse(second.body);
    expect(body.message).toContain("teléfono");
    // Surface existing alumno's name so receptionist knows who they hit.
    expect(body.message).toContain("Juan");
  });

  it("returns 400 when firstName/lastName/phone/branchId is missing", async () => {
    for (const field of [
      "firstName",
      "lastName",
      "phone",
      "branchId",
    ] as const) {
      const payload = basePayload() as Record<string, unknown>;
      delete payload[field];
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members/trial",
        headers: { authorization: `Bearer ${adminToken}` },
        payload,
      });
      expect(res.statusCode, `missing ${field}`).toBe(400);
    }
  });

  it("silently strips extra fields (closed schema removes them)", async () => {
    // Fastify's default AJV is configured with `removeAdditional: true`,
    // so additionalProperties:false strips unknown keys rather than 400-ing.
    // The contract we care about: the extra field never reaches storage.
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePayload(), email: "trial@test.com" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);

    const [row] = await app.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, body.id));
    expect(row?.email).toBeNull();
  });

  it("rejects phone with no digits as 409 invalid", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePayload(), phone: "no-digits-here" },
    });
    expect(res.statusCode).toBe(409);
  });

  // Phase 114 D-31: trial creation seeds the lead lifecycle.
  // lead_status='en_seguimiento' (the only valid initial state for an
  // admin-created trial) and created_by=<JWT admin id> (audit trail).
  it("sets lead_status='en_seguimiento' and created_by from JWT", async () => {
    // Resolve admin@test.com's id so we can assert created_by equals it.
    const [admin] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@test.com"));
    expect(admin?.id).toBeGreaterThan(0);

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePayload(),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);

    const [row] = await app.db
      .select({
        leadStatus: users.leadStatus,
        createdBy: users.createdBy,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, body.id));

    expect(row?.leadStatus).toBe("en_seguimiento");
    expect(row?.createdBy).toBe(admin!.id);
    // Regression guard: pre-existing trial behavior preserved.
    expect(row?.status).toBe("prueba");
  });

  // Phase 114 D-31 / T-114-02-01: a client posting createdBy in the body
  // must NOT be able to spoof the audit trail. Fastify's default AJV is
  // configured with removeAdditional=true, so additionalProperties:false on
  // the schema strips unknown keys before the handler runs (verified in
  // sibling test above). The contract that matters: the spoofed createdBy
  // never reaches storage — created_by comes from the JWT only.
  it("ignores client-supplied createdBy (additionalProperties strips it)", async () => {
    const [admin] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@test.com"));

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePayload(), createdBy: 999999 },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);

    const [row] = await app.db
      .select({ createdBy: users.createdBy })
      .from(users)
      .where(eq(users.id, body.id));

    // The spoofed 999999 is stripped; created_by is the JWT admin id.
    expect(row?.createdBy).toBe(admin!.id);
    expect(row?.createdBy).not.toBe(999999);
  });

  // Phase 114 D-38: GET /api/admin/members/:userId surfaces the
  // lead-lifecycle fields (leadStatus / leadNotes / createdBy) for the
  // admin app's "Datos de Lead" block. The block gates on status='prueba'
  // client-side; this test asserts the API contract that ships the fields.
  it("GET /admin/members/:userId returns leadStatus, leadNotes, createdBy for a trial user", async () => {
    const [admin] = await app.db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(eq(users.email, "admin@test.com"));

    // Create the trial via the public endpoint so createdBy is wired
    // server-side (Plan 02 invariant).
    const createRes = await app.inject({
      method: "POST",
      url: "/api/admin/members/trial",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: basePayload(),
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/members/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("prueba");
    expect(body.leadStatus).toBe("en_seguimiento");
    // leadNotes is NULL until an admin edits it (or the conversion hook
    // prefixes the plan name in Plan 03 — neither applies to a fresh trial).
    expect(body.leadNotes).toBeNull();
    // createdBy is denormalized via the self-JOIN.
    expect(body.createdBy).not.toBeNull();
    expect(body.createdBy.userId).toBe(admin!.id);
    const expectedName = [admin!.firstName, admin!.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (expectedName.length > 0) {
      expect(body.createdBy.name).toBe(expectedName);
    } else {
      // Fallback path in the service: an admin row with both names NULL
      // would surface "—" rather than an empty string.
      expect(body.createdBy.name).toBe("—");
    }
  });
});
