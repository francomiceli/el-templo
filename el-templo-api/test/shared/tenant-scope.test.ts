/**
 * Fase 166 (FUND-03 / FUND-04) — tests directos sobre `attachScope`.
 *
 * Este archivo ejercita el hook LLAMÁNDOLO DIRECTO con un request falso, no
 * por ruta: lo que se prueba acá es el contrato de la capa 1 (de dónde sale el
 * gimnasio y cuándo corta), independiente de qué módulo lo registre. La
 * cobertura extremo a extremo sobre rutas reales (que el 403 sale con `code`
 * en el body) es del plan 166-05.
 *
 * Lo que se afirma:
 *   1. `scope.tenantId` se resuelve server-side desde `users.tenant_id`.
 *   2. Mandar el gimnasio por query, body, header o como claim del token NO
 *      cambia lo resuelto (D-02).
 *   3. El JWT no transporta ningún claim de gimnasio (por eso los cambios de
 *      estado aplican sin re-login).
 *   4. 'suspended' y 'archived' cortan con 403 `TENANT_SUSPENDED` ANTES de que
 *      el resto del scope se resuelva.
 *   5. Volver a 'active' restablece el acceso.
 *   6. Un gimnasio no resoluble falla CERRADO (`tenantId = null`), nunca
 *      abierto, y sin tirar abajo el resto del scope.
 *
 * ⚠️ Higiene obligatoria: la DB de test es por worker y compartida entre
 * archivos del mismo fork (`isolate: false`). Dejar el tenant 1 suspendido
 * rompería TODOS los tests siguientes del worker — de ahí el `afterEach`
 * incondicional, el mismo update en el `afterAll` y el `try/finally` en cada
 * caso que lo suspende.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { sql } from "drizzle-orm";
import { createTestApp, createStaffUser, getAuthToken } from "../helpers";
import {
  attachScope,
  attachCountryScope,
  TENANT_SUSPENDED,
  type CountryScope,
} from "../../src/modules/shared/country-scope";

const EL_TEMPLO_TENANT_ID = 1;
const TEST_BRANCH_ID = 1;
const STAFF_EMAIL = "tenant-scope-admin@test.com";
const STAFF_PASSWORD = "tenant-scope-pass";

/**
 * Superficie mínima de `FastifyRequest` que `attachScope` toca. `scope` es
 * opcional a propósito: los tests de corte afirman que el hook NO llegó a
 * asignarlo (en el tipo real de Fastify es obligatorio).
 */
type FakeRequest = {
  user: {
    userId: number;
    email: string | null;
    role: string;
    // Claim inexistente en el token real — se inyecta sólo para probar que el
    // hook lo ignora aunque alguien lograra firmarlo.
    tenantId?: number;
  };
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  log: FastifyInstance["log"];
  scope?: CountryScope;
};

let app: FastifyInstance;
let staffId: number;

function makeRequest(overrides: Partial<FakeRequest> = {}): FakeRequest {
  return {
    user: { userId: staffId, email: STAFF_EMAIL, role: "admin" },
    query: {},
    body: {},
    headers: {},
    log: app.log,
    ...overrides,
  };
}

/** El cast que exige llamar al hook fuera del ciclo de vida de una ruta. */
function run(req: FakeRequest): Promise<void> {
  return attachScope(req as unknown as FastifyRequest, app.db);
}

async function setTenantStatus(status: string): Promise<void> {
  await app.db.execute(
    sql`UPDATE tenants SET status = ${status} WHERE id = ${EL_TEMPLO_TENANT_ID}`,
  );
}

beforeAll(async () => {
  app = await createTestApp();

  staffId = await createStaffUser(app, {
    email: STAFF_EMAIL,
    password: STAFF_PASSWORD,
    firstName: "Tenant",
    lastName: "Scope",
    role: "admin",
    branchId: TEST_BRANCH_ID,
    country: "AR",
  });
});

// Red incondicional: pase lo que pase en un test, el worker sigue con el
// gimnasio operativo.
afterEach(async () => {
  await app.db.execute(
    sql`UPDATE tenants SET status='active' WHERE id = ${EL_TEMPLO_TENANT_ID}`,
  );
});

afterAll(async () => {
  await app.db.execute(
    sql`UPDATE tenants SET status='active' WHERE id = ${EL_TEMPLO_TENANT_ID}`,
  );
  await app.db.execute(sql`DELETE FROM users WHERE id = ${staffId}`);
  await app.close();
});

describe("attachScope — resolución server-side del gimnasio (FUND-03)", () => {
  it("Test 1: resuelve scope.tenantId desde users.tenant_id y deja el resto del scope intacto", async () => {
    const req = makeRequest();

    await run(req);

    expect(req.scope?.tenantId).toBe(EL_TEMPLO_TENANT_ID);
    // El resto del scope tiene que valer exactamente lo mismo que antes de la
    // fase: la tanda B no cambió el comportamiento para el staff.
    expect(req.scope?.country).toBe("AR");
    expect(req.scope?.userBranchId).toBe(TEST_BRANCH_ID);
    expect(req.scope?.role).toBe("admin");
    expect(req.scope?.isOwner).toBe(false);
    expect(req.scope?.branchIds).toEqual([]);
  });

  it("Test 2: ignora el gimnasio mandado por query, body, header y claim del token", async () => {
    const hostileId = 999;
    const req = makeRequest({
      user: {
        userId: staffId,
        email: STAFF_EMAIL,
        role: "admin",
        tenantId: hostileId,
      },
      query: { tenant_id: hostileId, tenantId: hostileId },
      body: { tenant_id: hostileId },
      headers: { "x-tenant-id": String(hostileId) },
    });

    await run(req);

    expect(req.scope?.tenantId).toBe(EL_TEMPLO_TENANT_ID);
    expect(req.scope?.tenantId).not.toBe(hostileId);
    // Y el resto del scope tampoco se movió por las entradas hostiles.
    expect(req.scope?.country).toBe("AR");
    expect(req.scope?.userBranchId).toBe(TEST_BRANCH_ID);
  });

  it("Test 3: el JWT no transporta ningún claim de gimnasio (los cambios aplican sin re-login)", async () => {
    const token = await getAuthToken(app, STAFF_EMAIL, STAFF_PASSWORD);
    const decoded = app.jwt.decode<Record<string, unknown>>(token);

    expect(decoded).not.toBeNull();
    const keys = Object.keys(decoded ?? {});
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => /tenant/i.test(k))).toEqual([]);
    // Sanity de que estamos mirando el payload real y no un objeto vacío.
    expect(decoded?.userId).toBe(staffId);
  });

  it("Test 4: el alias deprecado attachCountryScope es la misma función (hereda el enforcement)", () => {
    expect(attachCountryScope).toBe(attachScope);
  });
});

describe("attachScope — enforcement de tenants.status (FUND-04)", () => {
  it("Test 5: un gimnasio 'suspended' corta con 403 TENANT_SUSPENDED antes de resolver el scope", async () => {
    const req = makeRequest();
    try {
      await setTenantStatus("suspended");

      await expect(run(req)).rejects.toMatchObject({
        statusCode: 403,
        code: TENANT_SUSPENDED,
        message: "Acceso suspendido para este gimnasio",
      });
      // El corte ocurre ANTES de resolver country/branchIds: el hook no llegó
      // a escribir el scope, o sea que no tocó ningún dato del gimnasio.
      expect(req.scope).toBeUndefined();
    } finally {
      await setTenantStatus("active");
    }
  });

  it("Test 6: un gimnasio 'archived' corta con el mismo código estable", async () => {
    const req = makeRequest();
    try {
      await setTenantStatus("archived");

      await expect(run(req)).rejects.toMatchObject({
        statusCode: 403,
        code: TENANT_SUSPENDED,
      });
      expect(req.scope).toBeUndefined();
    } finally {
      await setTenantStatus("active");
    }
  });

  it("Test 7: volver a 'active' restablece el acceso sin re-login", async () => {
    try {
      await setTenantStatus("suspended");
      await expect(run(makeRequest())).rejects.toMatchObject({
        code: TENANT_SUSPENDED,
      });

      await setTenantStatus("active");

      const req = makeRequest();
      await run(req);
      expect(req.scope?.tenantId).toBe(EL_TEMPLO_TENANT_ID);
      expect(req.scope?.country).toBe("AR");
    } finally {
      await setTenantStatus("active");
    }
  });
});

describe("attachScope — fail-closed cuando el gimnasio no se resuelve", () => {
  it("Test 8: un tenant_id colgado deja scope.tenantId en null sin lanzar y sin romper el resto del scope", async () => {
    const orphanTenantId = 999999;
    try {
      // Corrupción simulada: la FK fk_users_tenant hace imposible este estado,
      // así que hay que desactivar los checks para producirlo. Todo en una
      // transacción para que las tres sentencias caigan en la MISMA conexión
      // del pool (`SET` es de sesión, no de servidor).
      await app.db.transaction(async (tx) => {
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS=0`);
        await tx.execute(
          sql`UPDATE users SET tenant_id = ${orphanTenantId} WHERE id = ${staffId}`,
        );
        await tx.execute(sql`SET FOREIGN_KEY_CHECKS=1`);
      });

      const req = makeRequest();
      await run(req);

      // Fail-closed: null (default-deny aguas abajo), NO el id colgado y NO
      // una excepción que tumbe el servicio por un problema de datos.
      expect(req.scope?.tenantId).toBeNull();
      // El LEFT JOIN preserva el resto del scope: el staff no pierde su país
      // ni su sede por una inconsistencia que no es suya.
      expect(req.scope?.country).toBe("AR");
      expect(req.scope?.userBranchId).toBe(TEST_BRANCH_ID);
      expect(req.scope?.role).toBe("admin");
    } finally {
      await app.db.execute(
        sql`UPDATE users SET tenant_id = ${EL_TEMPLO_TENANT_ID} WHERE id = ${staffId}`,
      );
    }
  });
});
