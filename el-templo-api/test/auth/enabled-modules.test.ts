/**
 * Fase 176 Plan 11 (MOD-01/MOD-02, D-08) — `enabledModules` en `GET /api/auth/me`.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ----------------------------
 * D-08 es API-only: esta fase EXPONE `enabledModules` en la sesión y nada
 * más — ningún frontend lo consume todavía. Este archivo prueba el contrato
 * HTTP de esa exposición contra MySQL real, con los fixtures de flags de la
 * fase (`test/fixtures/module-flags.ts`) y el segundo gimnasio
 * (`test/fixtures/second-tenant.ts`).
 *
 * LO QUE SE AFIRMA
 * -----------------
 *   1. Un usuario del tenant 1 (El Templo) recibe `enabledModules` con los
 *      4 nombres de módulo, ORDENADOS ALFABÉTICAMENTE (la respuesta es
 *      determinística: no depende del orden de las filas de
 *      `tenant_settings`).
 *   2. Un usuario del gimnasio 2 (sin filas de flags sembradas) recibe
 *      `enabledModules` igual a `[]` — fail-closed, ver `module-flags.ts`.
 *   3. Apagar un módulo del tenant 1 lo saca del array en la respuesta
 *      SIGUIENTE (sin reiniciar la app: el cache de `module-flags.ts` tiene
 *      TTL 0 en test).
 *   4. El resto de los campos de `/me` no cambia: `enabledModules` es
 *      aditivo.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/auth/enabled-modules.test.ts --hookTimeout=250000
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, createTestMember } from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { setModuleFlag, restoreTemploFlags } from "../fixtures/module-flags";
import { MODULE_NAMES } from "../../src/modules/shared/modules";

/** Los 4 nombres de módulo, ordenados alfabéticamente — el orden que debe
 * devolver `GET /me`, distinto del orden fijo (no alfabético) de
 * `MODULE_NAMES` en `modules.ts`. */
const NOMBRES_ORDENADOS_ALFABETICAMENTE = [...MODULE_NAMES].sort();

let app: FastifyInstance;
let gym2: SegundoGimnasio;
let socioTemplo: { id: number; token: string; email: string };

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  gym2 = await seedSecondTenant(app);
  socioTemplo = await createTestMember(app);
});

afterEach(async () => {
  await restoreTemploFlags(app);
});

afterAll(async () => {
  await cleanAllTestData(app);
  await limpiarSegundoGimnasio(app);
  await app.close();
});

function getMeComo(token: string) {
  return app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("GET /api/auth/me — enabledModules (fase 176, D-08)", () => {
  it("El Templo (tenant 1): recibe los 4 módulos, ordenados alfabéticamente", async () => {
    const res = await getMeComo(socioTemplo.token);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabledModules).toEqual(NOMBRES_ORDENADOS_ALFABETICAMENTE);
  });

  it("gimnasio 2 (sin filas de flags): enabledModules es un array vacío", async () => {
    const res = await getMeComo(gym2.socios[0].token);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabledModules).toEqual([]);
  });

  it("apagar un módulo del tenant 1 lo saca del array en la respuesta siguiente", async () => {
    await setModuleFlag(app, TENANT_TEMPLO, "templo-gamification", false);

    const res = await getMeComo(socioTemplo.token);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabledModules).toEqual(
      NOMBRES_ORDENADOS_ALFABETICAMENTE.filter(
        (nombre) => nombre !== "templo-gamification",
      ),
    );
    // El afterEach de este archivo restaura los 4 flags de El Templo a ON
    // (`restoreTemploFlags`) — imprescindible: sin restaurar, el próximo
    // archivo del mismo worker (`isolate: false`) heredaría gamification
    // apagado para El Templo (Pitfall 4, ver módule-flags.ts).
  });

  it("el resto de los campos de /me no cambia: enabledModules es aditivo", async () => {
    const res = await getMeComo(socioTemplo.token);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      id: socioTemplo.id,
      email: socioTemplo.email,
      branchId: expect.any(Number),
      role: "member",
    });
    expect(body).toHaveProperty("onboardingCompleted");
    expect(body).toHaveProperty("memberSince");
    expect(body).toHaveProperty("segment");
  });
});
