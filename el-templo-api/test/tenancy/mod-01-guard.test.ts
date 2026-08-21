/**
 * Fase 176 Plan 03 (MOD-01) — comportamiento del guard `requireModule` sobre
 * una ruta REAL de `templo-training`, contra MySQL real.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ----------------------------
 * `module-registry.ts` (este mismo plan) construye `requireModule` y
 * `moduleScope`, y `app.ts` envuelve los 12 registros de rutas de
 * `templo-training` con `moduleScope`. Ninguno de los dos se puede probar de
 * verdad con un unit test puro: el guard consulta `tenant_settings` (contra
 * `isModuleEnabled`, 176-01) y depende del orden real del pipeline de hooks
 * de Fastify (`onRequest` por-ruta) — hay que levantar la app entera e
 * inyectar requests HTTP reales.
 *
 * LO QUE SE AFIRMA
 * -----------------
 *   1. Módulo apagado ⇒ 404 con el body EXACTO `{ error: "No encontrado" }`
 *      (no solo el status: un 404 del propio handler haría pasar este caso
 *      por la razón equivocada).
 *   2. Contraste: el MISMO request, con el flag prendido, deja de devolver
 *      ESE body exacto — sin este caso, el caso 1 no prueba nada.
 *   3. Con el módulo prendido, El Templo (tenant 1) sigue funcionando exacto
 *      como antes de esta fase: la ruta no recibe el 404 del guard.
 *   4. El guard corre DESPUÉS de `fastify.authenticate`: sin header
 *      `authorization`, el request muere en 401 (el 401 del auth plugin,
 *      `src/plugins/auth.ts`), nunca en el 404 del guard.
 *   5. Apagar el módulo de El Templo (tenant 1) lo apaga de verdad — no es
 *      un efecto que solo se vea en el gimnasio 2.
 *
 * RUTA BAJO PRUEBA: `GET /api/tree-progress/me`
 * -----------------------------------------------
 * Registrada por `treeProgressPlugin` (`src/plugins/tree-progress.ts`), un
 * `fp(...)` — cubre también la trampa de encapsulación del Pitfall 3 (si el
 * `addHook("onRoute")` de `moduleScope` se hubiera derramado a la raíz por
 * culpa de la exención de `fastify-plugin`, este archivo lo vería fallar
 * distinto: TODAS las rutas de la app devolverían el 404 del guard, incluidas
 * las que no son de `templo-training`). La ruta autentica con
 * `{ onRequest: [fastify.authenticate] }` POR-RUTA y resuelve
 * `attachCountryScope` DENTRO del handler (`request.scope` no existe todavía
 * cuando el guard corre) — ejercita la rama (2) de `resolveTenantForGuard`
 * (SELECT mínimo de `users.tenant_id`), la rama más poblada de training.
 *
 * QUÉ HACER CUANDO SE CAIGA
 * ---------------------------
 * Caso 1 rojo (pero status ya es 404) → revisar el body: puede ser el 404 del
 * propio handler de `tree-progress`, no el del guard — mirar el caso 2 antes
 * de tocar nada.
 * Caso 2 rojo → el guard no está leyendo el flag actualizado: revisar
 * `invalidateModuleFlags` en `setModuleFlag` (`test/fixtures/module-flags.ts`)
 * o el TTL de cache en `NODE_ENV=test` (`module-flags.ts`).
 * Caso 3 rojo → regresión de comportamiento para El Templo: el guard está
 * cortando una ruta que debería pasar. Revisar `resolveTenantForGuard`.
 * Caso 4 rojo (404 en vez de 401) → el guard se coló ANTES de
 * `fastify.authenticate` en el array `onRequest` — revisar el ORDEN del
 * append en `moduleScope` (Pitfall 1, el guard debe ir AL FINAL del array).
 * Caso 5 rojo → `requireModule` no está resolviendo el tenant 1 del socio
 * autenticado (rama (2) de `resolveTenantForGuard`) o el `afterEach` de este
 * archivo no restauró los flags correctamente.
 *
 * COMO CORRERLO
 * -------------
 *   pnpm exec vitest run --no-file-parallelism test/tenancy/mod-01-guard.test.ts --hookTimeout=250000
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createTestMember,
} from "../helpers";
import {
  seedSecondTenant,
  limpiarSegundoGimnasio,
  TENANT_DOS,
  TENANT_TEMPLO,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { setModuleFlag, restoreTemploFlags } from "../fixtures/module-flags";

const RUTA = "/api/tree-progress/me";

/** El 404 exacto que emite `requireModule` — nunca un 404 del propio handler. */
const BODY_404_DEL_GUARD = { error: "No encontrado" };

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

function getComo(token?: string) {
  return app.inject({
    method: "GET",
    url: RUTA,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("requireModule — comportamiento del guard sobre templo-training (MOD-01)", () => {
  it("OFF: un socio de un gimnasio sin flags recibe el 404 exacto del guard", async () => {
    const res = await getComo(gym2.socios[0].token);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(BODY_404_DEL_GUARD);
  });

  it("contraste: prender el flag del gimnasio 2 hace desaparecer ESE 404 exacto", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-training", true);

    const res = await getComo(gym2.socios[0].token);

    // No importa si termina en 200 u otro status del handler de
    // tree-progress: lo único que este caso afirma es que YA NO es el 404
    // del guard. Sin este caso, el caso anterior podría estar pasando por un
    // 404 del propio handler (p.ej. usuario sin fila) y probaría cero cosas
    // sobre el guard.
    if (res.statusCode === 404) {
      expect(res.json()).not.toEqual(BODY_404_DEL_GUARD);
    } else {
      expect(res.statusCode).not.toBe(404);
    }
  });

  it("ON: El Templo (tenant 1) sigue funcionando exacto como antes de la fase", async () => {
    await setModuleFlag(app, TENANT_TEMPLO, "templo-training", true);

    const res = await getComo(socioTemplo.token);

    expect(res.statusCode).not.toBe(404);
  });

  it("el guard corre DESPUÉS de fastify.authenticate: sin token, 401 (no 404)", async () => {
    const res = await getComo();

    expect(res.statusCode).toBe(401);
    expect(res.json()).not.toEqual(BODY_404_DEL_GUARD);
  });

  it("apagar templo-training para El Templo lo apaga de verdad para su propio socio", async () => {
    await setModuleFlag(app, TENANT_TEMPLO, "templo-training", false);

    const res = await getComo(socioTemplo.token);

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(BODY_404_DEL_GUARD);
    // El afterEach de este archivo llama restoreTemploFlags: no hace falta
    // reponer acá, pero el próximo archivo del mismo worker (isolate: false)
    // depende de que ese afterEach corra siempre, incluso si esta afirmación
    // fallara — es responsabilidad de vitest, no de este test.
  });
});

describe("requireModule — templo-onboarding (176-04, ModuleDef vía modules-boot.ts)", () => {
  const RUTA_ONBOARDING = "/api/onboarding/profile";

  function getOnboardingComo(token?: string) {
    return app.inject({
      method: "GET",
      url: RUTA_ONBOARDING,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it("OFF: un socio del gimnasio 2 (sin flags) recibe el 404 exacto del guard", async () => {
    const res = await getOnboardingComo(gym2.socios[0].token);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(BODY_404_DEL_GUARD);
  });

  it("contraste: prender el flag del gimnasio 2 hace desaparecer ESE 404 exacto", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-onboarding", true);

    const res = await getOnboardingComo(gym2.socios[0].token);

    // GET /profile del handler solo devuelve 200/204 — nunca 404 propio
    // (ver `src/modules/onboarding/routes.ts`). Con el flag prendido, YA NO
    // puede ser 404: si lo fuera, sería el guard todavía cortando.
    expect(res.statusCode).not.toBe(404);
  });
});

describe("requireModule — templo-gamification (176-04, ModuleDef en modules/aura/module.ts)", () => {
  const RUTA_GAMIFICATION = "/api/bar-challenge/result";

  function postBarChallengeComo(token?: string) {
    return app.inject({
      method: "POST",
      url: RUTA_GAMIFICATION,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: { secondsHeld: 30 },
    });
  }

  it("OFF: un socio del gimnasio 2 (sin flags) recibe el 404 exacto del guard", async () => {
    const res = await postBarChallengeComo(gym2.socios[0].token);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(BODY_404_DEL_GUARD);
  });

  it("contraste: prender el flag del gimnasio 2 hace desaparecer ESE 404 exacto", async () => {
    await setModuleFlag(app, TENANT_DOS, "templo-gamification", true);

    const res = await postBarChallengeComo(gym2.socios[0].token);

    // El handler de bar-challenge nunca devuelve 404 propio (200 en éxito,
    // 400 por schema, 401 sin token) — un 404 acá solo puede ser el guard.
    expect(res.statusCode).not.toBe(404);
  });
});

describe("requireModule — templo-marketing (176-04, ruta pública, D-06)", () => {
  const RUTA_MARKETING = "/api/blog/posts";

  function getBlogPublico() {
    return app.inject({ method: "GET", url: RUTA_MARKETING });
  }

  // `GET /api/blog/posts` es pública (sin `request.user`): el guard cae
  // SIEMPRE en la rama (3) de `resolveTenantForGuard` y resuelve
  // `DEFAULT_PUBLIC_TENANT_ID` (= tenant 1, El Templo) — deuda consciente de
  // D-06, no un descuido. Por eso el caso se arma AL REVÉS que los otros dos
  // módulos: con los flags de El Templo sembrados en ON (estado por defecto
  // que deja `restoreTemploFlags`) la ruta responde normal, y recién con el
  // flag de El Templo apagado aparece el 404 del guard. No hay forma de
  // probar esta ruta "OFF para el gimnasio 2": una ruta pública no tiene
  // tenant propio, siempre mira el flag del tenant 1.
  it("ON (default de El Templo): la ruta pública responde normal, sin 404 del guard", async () => {
    const res = await getBlogPublico();

    // GET /posts (lista paginada) nunca devuelve 404 propio — ver
    // `src/modules/blog/routes.ts`.
    expect(res.statusCode).not.toBe(404);
  });

  it("OFF: apagar templo-marketing para El Templo (tenant 1) corta la ruta pública con el 404 exacto", async () => {
    await setModuleFlag(app, TENANT_TEMPLO, "templo-marketing", false);

    const res = await getBlogPublico();

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(BODY_404_DEL_GUARD);
    // El afterEach de este archivo restaura los 4 flags de El Templo a ON
    // (`restoreTemploFlags`) — imprescindible acá: sin restaurar, el próximo
    // archivo del mismo worker (`isolate: false`) heredaría marketing
    // apagado para El Templo (Pitfall 4).
  });
});
