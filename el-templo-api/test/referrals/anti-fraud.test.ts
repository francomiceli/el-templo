/**
 * Fase 157 Plan 03 — Task 2: canal asistido "¿Quién lo trajo?" + antifraude.
 *
 * El alta admin (POST /api/admin/members) acepta un `referredBy` opcional. El
 * server lo valida (socio real, nunca crudo — Security V4) y, dentro de
 * createMember (ANTES del assignPlan del route), escribe users.referred_by +
 * un vínculo referrals(pending, assisted, createdBy=<admin JWT>). Antifraude:
 *  - auto-referido / referrer inexistente → sin vínculo, el alta igual sale OK
 *  - doble-referidor: un 2do vínculo para el mismo referred_id falla (UNIQUE, D-14)
 *  - dedup por DNI existente (fase 148) respetado (D-15)
 *  - toda alta exitosa deja el nuevo socio con referral_code eager (D-25)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { users } from "../../src/db/schema/users";
import { referrals } from "../../src/db/schema/referrals";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 173 (ADO-02): gimnasio de las lecturas DIRECTAS de `users` en este
 * archivo. Con `members` en TENANT_STRICT_MODULES una lectura sin estampa
 * hace throw antes de llegar a MySQL.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

let app: FastifyInstance;
let adminToken: string;
let adminId: number;
const branchId = 1;
const CODE_RE = /^[A-Z]+-[A-Z0-9]+$/;

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [admin] = await app.db
    .select({ id: users.id })
    .from(users)
    .where(
      and(tenantWhere(users, TEMPLO_CTX), eq(users.email, "admin@test.com")),
    )
    .limit(1);
  adminId = admin.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
});

let dniCounter = 51000000;

/** Alta asistida via el route admin. Devuelve la respuesta cruda. */
async function altaAsistida(
  overrides: Record<string, unknown> = {},
): ReturnType<FastifyInstance["inject"]> {
  const n = dniCounter++;
  return app.inject({
    method: "POST",
    url: "/api/admin/members",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      email: `alta-${n}@test.com`,
      firstName: "Alta",
      lastName: "Asistida",
      phone: `115${n}`,
      dni: `${n}`,
      branchId,
      ...overrides,
    },
  });
}

/** Siembra un socio existente (posible referidor) y devuelve su id. */
async function seedReferrer(email: string): Promise<number> {
  const [row] = await app.db
    .insert(users)
    .values({
      email,
      passwordHash: "x",
      firstName: "Ref",
      lastName: "Errer",
      branchId,
      role: "member",
      level: "alfa",
      status: "prueba" as const,
    })
    .$returningId();
  return row.id;
}

describe("POST /api/admin/members — canal asistido + antifraude (157-03)", () => {
  it("(a) alta asistida crea un vínculo pending assisted con created_by = admin (REF-03)", async () => {
    const referrerId = await seedReferrer("ref-a@test.com");
    const res = await altaAsistida({ referredBy: referrerId });
    expect(res.statusCode).toBe(201);
    const memberId = JSON.parse(res.body).id as number;

    const [link] = await app.db
      .select()
      .from(referrals)
      .where(eq(referrals.referredId, memberId));
    expect(link).toBeDefined();
    expect(link.referrerId).toBe(referrerId);
    expect(link.status).toBe("pending");
    expect(link.attributionChannel).toBe("assisted");
    expect(link.createdBy).toBe(adminId);

    const [u] = await app.db
      .select({ referredBy: users.referredBy })
      .from(users)
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, memberId)))
      .limit(1);
    expect(u.referredBy).toBe(referrerId);
  });

  it("(b) referrer inexistente / auto-referido: sin vínculo pero el alta sale OK (D-13, graceful)", async () => {
    const res = await altaAsistida({ referredBy: 999999999 });
    expect(res.statusCode).toBe(201);
    const memberId = JSON.parse(res.body).id as number;

    const links = await app.db
      .select()
      .from(referrals)
      .where(eq(referrals.referredId, memberId));
    expect(links).toHaveLength(0);

    const [u] = await app.db
      .select({ referredBy: users.referredBy })
      .from(users)
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, memberId)))
      .limit(1);
    expect(u.referredBy).toBeNull();
  });

  it("(c) doble-referidor: un 2do vínculo para el mismo referred_id falla por UNIQUE (D-14)", async () => {
    const referrerA = await seedReferrer("ref-da@test.com");
    const referrerB = await seedReferrer("ref-db@test.com");
    const res = await altaAsistida({ referredBy: referrerA });
    expect(res.statusCode).toBe(201);
    const memberId = JSON.parse(res.body).id as number;

    // El primer vínculo (assisted) ya existe. Un 2do INSERT directo con el
    // mismo referred_id debe romper por el UNIQUE de referrals.referred_id.
    await expect(
      app.db.insert(referrals).values({
        referrerId: referrerB,
        referredId: memberId,
        status: "pending",
        attributionChannel: "assisted",
      }),
    ).rejects.toThrow();
  });

  it("(d) alta sin referredBy no crea vínculo y no falla, con código eager (D-25)", async () => {
    const res = await altaAsistida();
    expect(res.statusCode).toBe(201);
    const memberId = JSON.parse(res.body).id as number;

    const links = await app.db
      .select()
      .from(referrals)
      .where(eq(referrals.referredId, memberId));
    expect(links).toHaveLength(0);

    const [u] = await app.db
      .select({ code: users.referralCode })
      .from(users)
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, memberId)))
      .limit(1);
    expect(u.code).toMatch(CODE_RE);
  });

  it("(e) dedup por DNI existente (fase 148) respetado: alta duplicada → 409 (D-15)", async () => {
    const first = await altaAsistida({
      dni: "52000001",
      email: "dup-1@test.com",
    });
    expect(first.statusCode).toBe(201);

    const dup = await altaAsistida({
      dni: "52000001",
      email: "dup-2@test.com",
    });
    expect(dup.statusCode).toBe(409);
  });

  it("(f) toda alta exitosa (con referredBy) deja el socio con referral_code eager (D-25)", async () => {
    const referrerId = await seedReferrer("ref-f@test.com");
    const res = await altaAsistida({ referredBy: referrerId });
    expect(res.statusCode).toBe(201);
    const memberId = JSON.parse(res.body).id as number;

    const [u] = await app.db
      .select({ code: users.referralCode })
      .from(users)
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.id, memberId)))
      .limit(1);
    expect(u.code).toMatch(CODE_RE);
  });
});
