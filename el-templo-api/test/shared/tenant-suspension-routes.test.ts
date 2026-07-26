/**
 * Fase 166 (FUND-03 / FUND-04) — enforcement de tenant sobre RUTAS REALES.
 *
 * El plan 166-04 probó el hook llamándolo directo. Este archivo prueba lo que
 * le importa al negocio: que las registraciones del hook en los módulos reales
 * heredan el corte, atravesando Fastify entero (routing, guard de rol,
 * serialización del error). Es la única forma de saber que el `code` del 403
 * llega efectivamente al body de la respuesta HTTP y no se pierde en el
 * serializador — el docblock de `AppError` advierte justamente que el mapper de
 * errores de las rutas lo descarta; el camino de un `throw` desde un hook
 * `onRequest` es otro, y acá queda verificado.
 *
 * Superficies cubiertas (CD-01: la suspensión alcanza TODO lo autenticado):
 *   - staff / admin  → GET /api/admin/members/ y GET /api/admin/subscriptions/plans
 *   - member app     → GET /api/members/subscription/plans
 *   - pre-scope      → POST /api/auth/login (NO registra el hook: debe seguir vivo)
 *
 * ⚠️ Higiene obligatoria: la DB de test es por worker y compartida entre
 * archivos del mismo fork (`isolate: false`). Dejar el gimnasio suspendido
 * rompería TODAS las suites siguientes del worker — de ahí el `afterEach`
 * incondicional, el mismo update en el `afterAll` y el `try/finally` en cada
 * caso que suspende.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { sql } from "drizzle-orm";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { TENANT_SUSPENDED } from "../../src/modules/shared/country-scope";
import * as schema from "../../src/db/schema";

const EL_TEMPLO_TENANT_ID = 1;
const TEST_BRANCH_ID = 1;

const ADMIN_MEMBERS_URL = "/api/admin/members/";
const ADMIN_PLANS_URL = "/api/admin/subscriptions/plans";
const MEMBER_PLANS_URL = "/api/members/subscription/plans";
const LOGIN_URL = "/api/auth/login";

const STAFF_EMAIL = "tenant-susp-admin@test.com";
const STAFF_PASSWORD = "tenant-susp-pass";
const MEMBER_EMAIL = "tenant-susp-member@test.com";
const MEMBER_PASSWORD = "tenant-susp-member-pass";

const SUSPENDED_MESSAGE = "Acceso suspendido para este gimnasio";

/** Body que Fastify serializa cuando un hook `onRequest` lanza un `AppError`. */
type ErrorBody = {
  statusCode?: number;
  code?: string;
  error?: string;
  message?: string;
};

type MembersListBody = { members: Array<{ id: number; email: string }> };
type PlansListBody = { plans: Array<{ id: number }> };

/**
 * Estado observable de las tres superficies. El bloque de restauración compara
 * este objeto contra el capturado con el gimnasio activo: si la suspensión
 * dejara algún efecto residual, la comparación lo delata.
 */
type Snapshot = {
  adminMembers: number;
  adminPlans: number;
  memberPlans: number;
  memberIds: number[];
};

let app: FastifyInstance;
let staffId: number;
let staffToken: string;
let memberId: number;
let memberToken: string;
let controlSnapshot: Snapshot;

function staffAuth(extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${staffToken}`, ...extra };
}

function memberAuth(
  extra: Record<string, string> = {},
): Record<string, string> {
  return { authorization: `Bearer ${memberToken}`, ...extra };
}

async function setTenantStatus(status: string): Promise<void> {
  await app.db.execute(
    sql`UPDATE tenants SET status = ${status} WHERE id = ${EL_TEMPLO_TENANT_ID}`,
  );
}

async function restoreTenant(): Promise<void> {
  await app.db.execute(
    sql`UPDATE tenants SET status='active' WHERE id = ${EL_TEMPLO_TENANT_ID}`,
  );
}

function memberIdsOf(res: LightMyRequestResponse): number[] {
  if (res.statusCode !== 200) return [];
  const body = JSON.parse(res.body) as MembersListBody;
  return body.members.map((m) => m.id).sort((a, b) => a - b);
}

/** Las tres rutas, con los tokens que les corresponden. */
async function snapshot(): Promise<Snapshot> {
  const adminMembersRes = await app.inject({
    method: "GET",
    url: ADMIN_MEMBERS_URL,
    headers: staffAuth(),
  });
  const adminPlansRes = await app.inject({
    method: "GET",
    url: ADMIN_PLANS_URL,
    headers: staffAuth(),
  });
  const memberPlansRes = await app.inject({
    method: "GET",
    url: MEMBER_PLANS_URL,
    headers: memberAuth(),
  });

  return {
    adminMembers: adminMembersRes.statusCode,
    adminPlans: adminPlansRes.statusCode,
    memberPlans: memberPlansRes.statusCode,
    memberIds: memberIdsOf(adminMembersRes),
  };
}

/**
 * Contrato del body del 403 (CD-02). El `statusCode` se asserta INLINE en cada
 * test a propósito, para que el fallo apunte a la ruta y no a este helper.
 */
function expectSuspendedBody(res: LightMyRequestResponse): void {
  const body = JSON.parse(res.body) as ErrorBody;
  expect(body.code).toBe(TENANT_SUSPENDED);
  expect(body.error).toBe("Forbidden");
  expect(body.message).toBe(SUSPENDED_MESSAGE);
  expect(body.statusCode).toBe(403);
}

beforeAll(async () => {
  app = await createTestApp();
  await cleanAllTestData(app);

  staffId = await createStaffUser(app, {
    email: STAFF_EMAIL,
    password: STAFF_PASSWORD,
    firstName: "Tenant",
    lastName: "Suspension",
    role: "admin",
    branchId: TEST_BRANCH_ID,
    country: "AR",
  });
  staffToken = await getAuthToken(app, STAFF_EMAIL, STAFF_PASSWORD);

  const memberReg = await registerUser(app, {
    email: MEMBER_EMAIL,
    password: MEMBER_PASSWORD,
    firstName: "Socio",
    lastName: "Suspension",
    branchId: TEST_BRANCH_ID,
  });
  memberId = (memberReg.user as { id: number }).id;
  memberToken = memberReg.token;

  // Un plan AR para que el catálogo de la member app devuelva contenido real y
  // no una lista vacía (el 200 pasa a ser una afirmación sobre datos).
  await app.db.insert(schema.subscriptionPlans).values({
    name: "Plan AR — tenant suspension",
    planTier: "flex",
    bookingMode: "flexible",
    priceRegular: 15000,
    priceZero: 10000,
    durationDays: 30,
    classesPerWeek: 3,
    country: "AR",
    currency: "ARS",
  });

  // Foto de referencia ANTES de tocar el estado del gimnasio.
  controlSnapshot = await snapshot();
});

// Red incondicional: pase lo que pase en un test, el worker sigue con el
// gimnasio operativo para las suites vecinas.
afterEach(async () => {
  await restoreTenant();
});

afterAll(async () => {
  await restoreTenant();
  await cleanAllTestData(app);
  await app.close();
});

describe("Tenant activo — el staff y los socios no ven ningún cambio", () => {
  it("Test 1: las tres superficies responden 200 con el gimnasio activo", () => {
    expect(controlSnapshot.adminMembers).toBe(200);
    expect(controlSnapshot.adminPlans).toBe(200);
    expect(controlSnapshot.memberPlans).toBe(200);
    // El listado de admin devuelve datos reales (el socio de fixture está),
    // así que el 200 no es un verde vacío.
    expect(controlSnapshot.memberIds).toContain(memberId);
  });
});

describe("Tenant 'suspended' — 403 TENANT_SUSPENDED en toda la superficie autenticada (FUND-04, CD-01)", () => {
  it("Test 2: GET /api/admin/members/ corta con 403 y el código estable en el body", async () => {
    try {
      await setTenantStatus("suspended");

      const res = await app.inject({
        method: "GET",
        url: ADMIN_MEMBERS_URL,
        headers: staffAuth(),
      });

      expect(res.statusCode).toBe(403);
      expectSuspendedBody(res);
      // Defensa en profundidad: el corte ocurre antes de tocar datos, así que
      // ni un email de socio puede haberse filtrado en la respuesta.
      expect(res.body).not.toContain(MEMBER_EMAIL);
    } finally {
      await restoreTenant();
    }
  });

  it("Test 3: GET /api/admin/subscriptions/plans corta con 403 (segundo módulo, mismo contrato)", async () => {
    try {
      await setTenantStatus("suspended");

      const res = await app.inject({
        method: "GET",
        url: ADMIN_PLANS_URL,
        headers: staffAuth(),
      });

      expect(res.statusCode).toBe(403);
      expectSuspendedBody(res);
    } finally {
      await restoreTenant();
    }
  });

  it("Test 4: GET /api/members/subscription/plans (member app) corta con 403 — la suspensión no es sólo del staff", async () => {
    try {
      await setTenantStatus("suspended");

      const res = await app.inject({
        method: "GET",
        url: MEMBER_PLANS_URL,
        headers: memberAuth(),
      });

      expect(res.statusCode).toBe(403);
      expectSuspendedBody(res);
    } finally {
      await restoreTenant();
    }
  });
});

describe("Tenant 'archived' — mismo corte y mismo código (CD-02)", () => {
  it("Test 5: la superficie de staff corta con 403 TENANT_SUSPENDED", async () => {
    try {
      await setTenantStatus("archived");

      const res = await app.inject({
        method: "GET",
        url: ADMIN_MEMBERS_URL,
        headers: staffAuth(),
      });

      expect(res.statusCode).toBe(403);
      expectSuspendedBody(res);
    } finally {
      await restoreTenant();
    }
  });

  it("Test 6: la superficie de socios corta con 403 TENANT_SUSPENDED", async () => {
    try {
      await setTenantStatus("archived");

      const res = await app.inject({
        method: "GET",
        url: MEMBER_PLANS_URL,
        headers: memberAuth(),
      });

      expect(res.statusCode).toBe(403);
      expectSuspendedBody(res);
    } finally {
      await restoreTenant();
    }
  });
});

describe("Login (pre-scope) sigue vivo con el gimnasio suspendido (CD-01)", () => {
  it("Test 7: staff y socio pueden autenticarse aunque todo lo scoped devuelva 403", async () => {
    try {
      await setTenantStatus("suspended");

      // La frontera es deliberada: `/api/auth/login` NO registra el hook de
      // scope, así que autenticar se puede; operar no. Suspender un gimnasio
      // no puede dejar a nadie sin poder siquiera entrar a ver el mensaje.
      const staffLogin = await app.inject({
        method: "POST",
        url: LOGIN_URL,
        payload: { email: STAFF_EMAIL, password: STAFF_PASSWORD },
      });
      expect(staffLogin.statusCode).toBe(200);
      expect(JSON.parse(staffLogin.body)).toHaveProperty("token");

      const memberLogin = await app.inject({
        method: "POST",
        url: LOGIN_URL,
        payload: { email: MEMBER_EMAIL, password: MEMBER_PASSWORD },
      });
      expect(memberLogin.statusCode).toBe(200);
      expect(JSON.parse(memberLogin.body)).toHaveProperty("token");

      // Y el token recién emitido tampoco sirve para operar: el corte es del
      // scope, no de la sesión.
      const scoped = await app.inject({
        method: "GET",
        url: ADMIN_MEMBERS_URL,
        headers: {
          authorization: `Bearer ${(JSON.parse(staffLogin.body) as { token: string }).token}`,
        },
      });
      expect(scoped.statusCode).toBe(403);
    } finally {
      await restoreTenant();
    }
  });
});

describe("Restauración — volver a 'active' devuelve exactamente el estado previo", () => {
  it("Test 8: tras suspender y reactivar, las tres rutas responden igual que en el control (sin re-login)", async () => {
    try {
      await setTenantStatus("suspended");
      const whileSuspended = await app.inject({
        method: "GET",
        url: ADMIN_MEMBERS_URL,
        headers: staffAuth(),
      });
      expect(whileSuspended.statusCode).toBe(403);

      await restoreTenant();

      // Mismos tokens de siempre: el gimnasio no viaja en el JWT.
      const after = await snapshot();
      expect(after).toEqual(controlSnapshot);
    } finally {
      await restoreTenant();
    }
  });
});

describe("Entradas hostiles en rutas reales — el gimnasio nunca viene del cliente (FUND-03)", () => {
  it("Test 9: ?tenant_id=999 y ?tenantId=999 no cambian la respuesta del listado de admin", async () => {
    const baseline = await app.inject({
      method: "GET",
      url: ADMIN_MEMBERS_URL,
      headers: staffAuth(),
    });
    const hostile = await app.inject({
      method: "GET",
      url: `${ADMIN_MEMBERS_URL}?tenant_id=999&tenantId=999`,
      headers: staffAuth(),
    });

    expect(hostile.statusCode).toBe(baseline.statusCode);
    expect(hostile.statusCode).toBe(200);
    expect(memberIdsOf(hostile)).toEqual(memberIdsOf(baseline));
    expect(memberIdsOf(hostile)).toContain(memberId);
  });

  it("Test 10: el header x-tenant-id: 999 no cambia la respuesta ni en el admin ni en la member app", async () => {
    const hostileHeader = { "x-tenant-id": "999" };

    const adminBaseline = await app.inject({
      method: "GET",
      url: ADMIN_MEMBERS_URL,
      headers: staffAuth(),
    });
    const adminHostile = await app.inject({
      method: "GET",
      url: ADMIN_MEMBERS_URL,
      headers: staffAuth(hostileHeader),
    });
    expect(adminHostile.statusCode).toBe(adminBaseline.statusCode);
    expect(memberIdsOf(adminHostile)).toEqual(memberIdsOf(adminBaseline));

    const memberBaseline = await app.inject({
      method: "GET",
      url: MEMBER_PLANS_URL,
      headers: memberAuth(),
    });
    const memberHostile = await app.inject({
      method: "GET",
      url: `${MEMBER_PLANS_URL}?tenant_id=999`,
      headers: memberAuth(hostileHeader),
    });
    expect(memberHostile.statusCode).toBe(memberBaseline.statusCode);
    expect(memberHostile.statusCode).toBe(200);

    const hostilePlans = (JSON.parse(memberHostile.body) as PlansListBody)
      .plans;
    const baselinePlans = (JSON.parse(memberBaseline.body) as PlansListBody)
      .plans;
    expect(hostilePlans.map((p) => p.id)).toEqual(
      baselinePlans.map((p) => p.id),
    );
    expect(hostilePlans.length).toBeGreaterThan(0);
  });
});

describe("Estado de la DB del worker tras la corrida", () => {
  it("Test 11: el gimnasio queda 'active' (no contamina a las suites vecinas)", async () => {
    const rows = (await app.db.execute(
      sql`SELECT status FROM tenants WHERE id = ${EL_TEMPLO_TENANT_ID}`,
    )) as unknown as [Array<{ status: string }>];
    expect(rows[0][0].status).toBe("active");
    // Sanity de que el fixture de staff sigue existiendo (los tests de corte no
    // borraron nada por el camino).
    expect(staffId).toBeGreaterThan(0);
  });
});
