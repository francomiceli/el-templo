/**
 * Fase 169 (CON-04) — el ciclo del televisor estampa el gimnasio correcto.
 *
 * QUE PRUEBA ESTE ARCHIVO
 * -----------------------
 * `tv_pairings` es la unica excepcion legitima del milestone v6.0: la fila nace
 * ANTES de que se sepa de quien es el televisor, asi que el INSERT pre-claim
 * queda exento y anotado (`tenant-safe: pairing pre-claim`). Este archivo
 * recorre el ciclo COMPLETO por las rutas reales —start (TV, publico) → claim
 * (staff, JWT) → status/consume (TV, publico)— y afirma que:
 *
 *   1. despues del `start`, la fila existe sin reclamar y sin dueño declarado;
 *   2. despues del claim, la fila lleva el gimnasio del scope del STAFF;
 *   3. despues del consume, `tv_devices` lleva ESE MISMO gimnasio;
 *   4. un `tenantId` en el body del claim no cambia nada.
 *
 * QUE **NO** ES ESTE ARCHIVO
 * --------------------------
 * NO es un test de aislamiento. Que un gimnasio no vea los televisores de otro
 * es ISO-03, fase 172, con las fixtures 2-tenant formales de la 171. Aca no hay
 * ni una asercion de "el otro no lo ve": lo unico que se verifica es DE DONDE
 * SALE el valor que se escribe.
 *
 * LAS ASERCIONES VAN CONTRA LA BASE, no contra el body de la respuesta HTTP: lo
 * que esta en discusion es que quedo ESCRITO. El claim devuelve `{ ok: true }` y
 * no expone el tenant (ni debe hacerlo — la columna no sale por ningun schema).
 *
 * LA TRAMPA DEL DEFAULT 1 (T-168-15) Y POR QUE HAY UN SEGUNDO GIMNASIO
 * --------------------------------------------------------------------
 * `tenant_id` tiene DEFAULT 1 desde la fase 167 y hoy TODO el staff es del
 * tenant 1. Con un solo gimnasio, los puntos 2 y 3 de arriba pasarian en verde
 * aunque el service no estampara nada: la columna caeria en el DEFAULT y daria
 * exactamente el mismo 1. Por eso el ultimo `describe` reclama con un staff de
 * un gimnasio ACTIVO distinto de 1 (id **90569**) — es el unico caso que se cae
 * si `claim()` dejara de pasar por `tenantValues` o si `consume()` volviera a
 * insertar `tv_devices` sin el tenant de la fila reclamada. Mismo criterio que
 * el test 5 de `webhook-tenant-derivation.test.ts` (169-05).
 *
 * El id 90569 es propio de este archivo y no colisiona con los de los otros
 * archivos de la fase (90168 / 90169 / 90269 / 90369 / 90469): vitest corre con
 * `isolate: false` y dos archivos con el mismo id se pisan dentro del worker.
 * La fila la crea el `beforeEach` de aca y la borra su `afterAll`.
 *
 * Corre contra el MySQL de test por worker (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
} from "../helpers";
import * as schema from "../../src/db/schema";

const START_URL = "/api/tv/pair/start";
const STATUS_URL = "/api/tv/pair/status";
const CLAIM_URL = "/api/admin/tv/pair/claim";

// ─── Constantes de gimnasio ─────────────────────────────────────────────────
/** El Templo, sembrado por la migracion 0190. Este archivo NUNCA lo modifica. */
const TENANT_TEMPLO = 1;
/** Segundo gimnasio, id fijo y ALTO: ver la cabecera. Lo crea y lo borra este archivo. */
const TENANT_SEGUNDO = 90569;

/** Valor imposible que se cuela en el body del claim para probar que no manda. */
const TENANT_SPOOFEADO = 424242;

interface Ctx {
  /** Sede de El Templo (tenant 1). */
  branchTemploId: number;
  /** Sede del segundo gimnasio (tenant 90569). */
  branchSegundoId: number;
  /** Coach de El Templo. */
  coachTemploToken: string;
  /** Dueño del segundo gimnasio. */
  ownerSegundoToken: string;
}

function suffix(): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${t}${r}`;
}

/**
 * Siembra una sede con `tenantId` EXPLICITO.
 *
 * Explicito incluso para el tenant 1 (T-168-15): una sede del "segundo
 * gimnasio" sembrada sin `tenantId` seria en realidad una sede de El Templo y
 * el test de abajo probaria exactamente nada.
 */
async function seedBranch(
  app: FastifyInstance,
  tenantId: number,
  name: string,
  code: string,
): Promise<number> {
  const [row] = await app.db
    .insert(schema.branches)
    .values({
      tenantId,
      name,
      code: `${code}${suffix()}`.toUpperCase().slice(0, 20),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  return row.id;
}

/** POST /api/tv/pair/start — el televisor, sin credenciales. */
async function startPairing(
  app: FastifyInstance,
): Promise<{ userCode: string; deviceCode: string }> {
  const res = await app.inject({ method: "POST", url: START_URL });
  if (res.statusCode !== 201) {
    throw new Error(`pair/start fallo: ${res.statusCode} ${res.body}`);
  }
  return JSON.parse(res.body) as { userCode: string; deviceCode: string };
}

/** POST /api/admin/tv/pair/claim — el staff, con JWT. */
function claim(
  app: FastifyInstance,
  token: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: CLAIM_URL,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

/** GET /api/tv/pair/status — el poll del televisor, que dispara `consume()`. */
function status(app: FastifyInstance, deviceCode: string) {
  return app.inject({
    method: "GET",
    url: `${STATUS_URL}?deviceCode=${encodeURIComponent(deviceCode)}`,
  });
}

/** El `tenant_id` REAL de la fila de pairing, leido de la base. */
async function tenantDelPairing(
  app: FastifyInstance,
  userCode: string,
): Promise<{ tenantId: number; branchId: number | null; claimedAt: Date | null }> {
  const [row] = await app.db
    .select({
      tenantId: schema.tvPairings.tenantId,
      branchId: schema.tvPairings.branchId,
      claimedAt: schema.tvPairings.claimedAt,
    })
    .from(schema.tvPairings)
    .where(eq(schema.tvPairings.userCode, userCode));
  return row;
}

/** Nombres de las sedes que siembra este archivo (se borran por nombre). */
const SEDE_TEMPLO = "TV-Tenant-Templo";
const SEDE_SEGUNDA = "TV-Tenant-Segundo";

/**
 * Borra el rastro de este archivo, en orden seguro de FKs.
 *
 * `cleanAllTestData` NO limpia `branches` (no esta en `TABLES_TO_CLEAN`): las
 * sedes sobreviven entre tests del mismo worker. Hay que borrarlas a mano
 * porque la fila de `tenants` no puede irse mientras una sede la referencie
 * (`fk_branches_tenant`) — y sin borrar el gimnasio, el `beforeEach` siguiente
 * chocaria con su propia PK.
 */
async function limpiarRastro(app: FastifyInstance): Promise<void> {
  await app.db.execute(
    sql`DELETE FROM branches WHERE tenant_id = ${TENANT_SEGUNDO} OR name IN (${SEDE_TEMPLO}, ${SEDE_SEGUNDA})`,
  );
  await app.db.execute(sql`DELETE FROM tenants WHERE id = ${TENANT_SEGUNDO}`);
}

/** Cuenta filas de `tenants` por id (mismo idioma que el archivo del 169-05). */
async function contarTenant(
  app: FastifyInstance,
  tenantId: number,
): Promise<number> {
  const resultado = (await app.db.execute(
    sql`SELECT COUNT(*) AS n FROM tenants WHERE id = ${tenantId}`,
  )) as unknown as [Array<{ n: number }>];
  const filas = Array.isArray(resultado)
    ? resultado[0]
    : (resultado as unknown as Array<{ n: number }>);
  return Number(filas?.[0]?.n ?? -1);
}

/** El `tenant_id` REAL del dispositivo creado por el consume. */
async function tenantDelDevice(
  app: FastifyInstance,
  deviceId: number,
): Promise<number> {
  const [row] = await app.db
    .select({ tenantId: schema.tvDevices.tenantId })
    .from(schema.tvDevices)
    .where(eq(schema.tvDevices.id, deviceId));
  return row.tenantId;
}

describe("Fase 169 (CON-04) — el ciclo del TV estampa el gimnasio correcto", () => {
  let app: FastifyInstance;
  let ctx: Ctx;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    // Orden seguro de FKs: primero lo que cuelga de las sedes (users,
    // tv_pairings, tv_devices los borra `cleanAllTestData`), despues las sedes
    // y recien al final la fila de `tenants`.
    await cleanAllTestData(app);
    await limpiarRastro(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // Red incondicional: el gimnasio y las sedes se recrean en cada test para
    // que ninguno herede el estado del anterior.
    await limpiarRastro(app);
    await app.db.insert(schema.tenants).values({
      id: TENANT_SEGUNDO,
      name: "Gimnasio de prueba 169-06",
      slug: `test-169-tv-${TENANT_SEGUNDO}`,
      status: "active",
    });

    const branchTemploId = await seedBranch(
      app,
      TENANT_TEMPLO,
      SEDE_TEMPLO,
      "TVT",
    );
    const branchSegundoId = await seedBranch(
      app,
      TENANT_SEGUNDO,
      SEDE_SEGUNDA,
      "TVS",
    );

    await createStaffUser(app, {
      email: "tv-tenant-coach@test.com",
      password: "coach-pass-123",
      firstName: "Coach",
      lastName: "Templo",
      role: "coach",
      branchId: branchTemploId,
    });

    const ownerSegundoId = await createStaffUser(app, {
      email: "tv-tenant-owner-2@test.com",
      password: "owner-pass-123",
      firstName: "Dueño",
      lastName: "Segundo",
      role: "owner",
      branchId: branchSegundoId,
    });
    // `createStaffUser` no expone `tenantId` (todo el staff de hoy es del
    // tenant 1 y cae en el DEFAULT), asi que el dueño del segundo gimnasio se
    // reasigna aca. Es lo que hace que `attachScope` le resuelva
    // `scope.tenantId = 90569` y que el claim tenga algo distinto de 1 que
    // estampar.
    await app.db.execute(
      sql`UPDATE users SET tenant_id = ${TENANT_SEGUNDO} WHERE id = ${ownerSegundoId}`,
    );

    ctx = {
      branchTemploId,
      branchSegundoId,
      coachTemploToken: await getAuthToken(
        app,
        "tv-tenant-coach@test.com",
        "coach-pass-123",
      ),
      ownerSegundoToken: await getAuthToken(
        app,
        "tv-tenant-owner-2@test.com",
        "owner-pass-123",
      ),
    };
  });

  describe("start → claim → consume con el staff de El Templo", () => {
    it("el pairing pre-claim nace sin reclamar y sin dueño elegido (exencion anotada)", async () => {
      const { userCode } = await startPairing(app);

      const fila = await tenantDelPairing(app, userCode);
      // La fila existe y todavia no tiene sede: nadie sabe de que gimnasio es
      // el televisor. Ese es exactamente el motivo de la exencion
      // `tenant-safe: pairing pre-claim` — estampar aca seria inventar un dueño.
      expect(fila.claimedAt).toBeNull();
      expect(fila.branchId).toBeNull();
      // Queda en el DEFAULT de la columna (fase 167), no en un valor elegido.
      expect(fila.tenantId).toBe(TENANT_TEMPLO);
    });

    it("el claim del staff deja la fila con el gimnasio del scope y la sede elegida", async () => {
      const { userCode } = await startPairing(app);

      const res = await claim(app, ctx.coachTemploToken, {
        userCode,
        branchId: ctx.branchTemploId,
        name: "TV sala grande",
      });
      expect(res.statusCode).toBe(200);

      const fila = await tenantDelPairing(app, userCode);
      expect(fila.claimedAt).not.toBeNull();
      expect(fila.branchId).toBe(ctx.branchTemploId);
      expect(fila.tenantId).toBe(TENANT_TEMPLO);
    });

    it("el consume del TV crea el dispositivo con el gimnasio de la fila reclamada", async () => {
      const { userCode, deviceCode } = await startPairing(app);
      const claimed = await claim(app, ctx.coachTemploToken, {
        userCode,
        branchId: ctx.branchTemploId,
      });
      expect(claimed.statusCode).toBe(200);

      const res = await status(app, deviceCode);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).status).toBe("paired");

      // El televisor pollea SIN sesion: el gimnasio del dispositivo no puede
      // salir de un scope de request, sale de la fila de pairing ya reclamada.
      const [device] = await app.db
        .select({ id: schema.tvDevices.id })
        .from(schema.tvDevices);
      const filaPairing = await tenantDelPairing(app, userCode);
      expect(await tenantDelDevice(app, device.id)).toBe(filaPairing.tenantId);
    });
  });

  describe("el gimnasio sale del scope del staff, no del DEFAULT ni del body", () => {
    /**
     * ESTE es el test que prueba de verdad el estampado.
     *
     * Los tres de arriba pasarian en verde aunque `claim()` no estampara nada y
     * `consume()` insertara `tv_devices` sin tenant: la columna tiene DEFAULT 1
     * desde la fase 167 y el staff de El Templo tambien es 1, asi que el valor
     * correcto y el accidental son indistinguibles. Con un dueño del gimnasio
     * 90569 reclamando, las dos aserciones de abajo se caen si el service
     * dejara el DEFAULT, o si alguien hardcodeara un 1, o si el `tenantValues`
     * del `consume()` volviera a tomar el tenant de cualquier otro lado.
     *
     * No es un test de aislamiento (eso es ISO-03, fase 172): no se afirma que
     * un gimnasio no vea al otro, se afirma DE DONDE sale el valor escrito.
     */
    it("un dueño del gimnasio 90569 deja el pairing y el dispositivo con SU gimnasio", async () => {
      const { userCode, deviceCode } = await startPairing(app);

      // Antes del claim la fila esta en el DEFAULT (1), o sea que el 90569 de
      // despues solo puede haberlo escrito el claim.
      expect((await tenantDelPairing(app, userCode)).tenantId).toBe(
        TENANT_TEMPLO,
      );

      const res = await claim(app, ctx.ownerSegundoToken, {
        userCode,
        branchId: ctx.branchSegundoId,
        name: "TV del segundo gimnasio",
      });
      expect(res.statusCode).toBe(200);

      const fila = await tenantDelPairing(app, userCode);
      expect(fila.tenantId).toBe(TENANT_SEGUNDO);
      expect(fila.branchId).toBe(ctx.branchSegundoId);

      const consumed = await status(app, deviceCode);
      expect(consumed.statusCode).toBe(200);
      expect(JSON.parse(consumed.body).status).toBe("paired");

      const [device] = await app.db
        .select({ id: schema.tvDevices.id })
        .from(schema.tvDevices);
      expect(await tenantDelDevice(app, device.id)).toBe(TENANT_SEGUNDO);
    });

    /**
     * Existe para detectar el dia en que alguien afloje el
     * `additionalProperties: false` del body del claim o spreadee el body dentro
     * del service. Hoy el schema descarta la propiedad antes del handler y, aun
     * si llegara, `tenantValues` pone el tenant del scope DESPUES del spread.
     *
     * El spoofeo se hace con el staff del gimnasio 90569 y el valor 424242 a
     * proposito: si se hiciera con el staff del tenant 1, un body que se colara
     * seria indistinguible del DEFAULT de la columna.
     */
    it("mandar tenantId en el body del claim no cambia el gimnasio de la fila", async () => {
      const { userCode } = await startPairing(app);

      const res = await claim(app, ctx.ownerSegundoToken, {
        userCode,
        branchId: ctx.branchSegundoId,
        tenantId: TENANT_SPOOFEADO,
      });

      const fila = await tenantDelPairing(app, userCode);

      // Dos finales aceptables, y ninguno de los dos escribe el valor del body:
      // Fastify puede descartar la propiedad extra (claim OK) o rechazar el
      // request entero (400). Lo inaceptable es que 424242 llegue a la columna.
      expect(fila.tenantId).not.toBe(TENANT_SPOOFEADO);
      if (res.statusCode === 200) {
        expect(fila.tenantId).toBe(TENANT_SEGUNDO);
        expect(fila.claimedAt).not.toBeNull();
      } else {
        expect(res.statusCode).toBe(400);
        expect(fila.claimedAt).toBeNull();
      }
    });

    it("higiene: el gimnasio de prueba fue una fila real y El Templo sigue activo", async () => {
      expect(await contarTenant(app, TENANT_SEGUNDO)).toBe(1);

      const [templo] = await app.db
        .select({ status: schema.tenants.status })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, TENANT_TEMPLO));
      expect(templo.status).toBe("active");
    });
  });
});
