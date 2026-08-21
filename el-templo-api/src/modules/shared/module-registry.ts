// Module: shared — el guard `requireModule` y el envoltorio `moduleScope`
//
// POR QUÉ EXISTE ESTE ARCHIVO
// ----------------------------
// Fase 176 Plan 03 (MOD-01): aplica los flags `module.*.enabled`
// (`module-flags.ts`, 176-01) a las RUTAS de los 4 módulos Templo. Este es el
// segundo cimiento del mecanismo — el primero (flags) sabe leer, este sabe
// CORTAR con 404.
//
// LA TÉCNICA (y por qué NO es la del doc 04 §3)
// -----------------------------------------------
// El doc de diseño propone colgar el guard como hook de la fase `onRequest`
// a nivel de INSTANCIA (`fastify.addHook`, sin scope de por medio).
// Verificado empíricamente contra Fastify 5.7.4 (176-RESEARCH.md §"Pattern
// 1"): esa técnica falla por DOS motivos a la vez.
//   1. Los hooks de la fase `onRequest` DE INSTANCIA corren ANTES que los
//      de esa misma fase colgados POR-RUTA — así que el guard correría antes
//      de `fastify.authenticate` (que es per-route en la mayoría de los
//      módulos Templo) y no tendría `request.user` disponible.
//   2. `onRoute` — el hook que usa el gate de cobertura del plan 176-05 para
//      afirmar "las 141 rutas templo-module llevan guard" — NO VE los hooks
//      de instancia de la fase `onRequest`. Serían invisibles.
// La técnica elegida: un hook `onRoute` de SCOPE que APPENDEA el guard al
// array `route.onRequest` de cada ruta que se registre después. Corre en el
// orden correcto (después de `authenticate`, por construcción: el guard se
// agrega al FINAL del array) y queda visible al gate (`moduleGuardOf` lee la
// MISMA función que Fastify ejecuta).
//
// PITFALL 3 — jamás un `addHook` dentro de un `fp(...)`
// -------------------------------------------------------
// `fastify-plugin` (los 7 wrappers de training en `src/plugins/*.ts`)
// DESACTIVA la encapsulación a propósito — es cómo esos plugins comparten
// `fastify.db`/`fastify.authenticate` sin declarar dependencias circulares.
// Si `moduleScope` colgara el hook de scope DENTRO de un `fp(...)`, ese
// hook treparía a la raíz de la app y el 404 se derramaría a TODA la API — el
// modo de falla más caro de la fase (T-176-03). `moduleScope` evita esto por
// construcción: crea su PROPIO scope encapsulado con `app.register(async
// (scoped) => {...})` (un scope normal, sin `fp`), cuelga el hook ahí, y
// DESPUÉS hace `scoped.register(plugin, opts)` — el `plugin` recibido puede
// ser un `fp(...)` sin que eso rompa nada, porque el hook ya está fijado en
// el padre encapsulado antes de que el hijo (con o sin `fp`) registre una
// sola ruta.
//
// LA RESPUESTA: 404, nunca un código de "prohibido"
// ----------------------------------------------------
// `reply.code(404).send({ error: "No encontrado" })`, a propósito. Un módulo
// apagado no debe ser distinguible de "esta ruta no existe" — un código de
// "prohibido" revelaría que el feature EXISTE pero está vedado (Information
// Disclosure, T-176-04). Corre en `onRequest`, ANTES de la validación del
// body: el 404 del guard nunca compite con un 400 de schema.
//
// RESOLUCIÓN DEL TENANT DENTRO DEL GUARD (`resolveTenantForGuard`)
// --------------------------------------------------------------------
// El guard NO puede asumir `request.scope`: el patrón de auth es heterogéneo
// en este repo (176-RESEARCH.md §"Pattern 2" — 5 combinaciones distintas
// según el módulo). Tres ramas, en orden:
//   (1) `request.scope?.tenantId` si un hook de INSTANCIA ya lo resolvió
//       (la minoría de los registros de training, p.ej. `adminRoutes`).
//   (2) `request.user?.userId` presente pero sin scope todavía (la mayoría de
//       training: rutas con `{ onRequest: [fastify.authenticate] }` por-ruta
//       que resuelven el scope de país/tenant DENTRO del handler, después de
//       que el guard ya corrió): un SELECT mínimo de UNA columna
//       (`users.tenant_id`, `.limit(1)`). Deliberadamente NO se llama al
//       helper de scope de `country-scope.ts` acá — esa función, si el
//       tenant está suspendido, LANZA el código de error `TENANT_SUSPENDED`.
//       Adelantar esa llamada al guard cambiaría el código de error
//       observable de rutas que hoy responden otra cosa cuando el tenant está
//       suspendido — no es lo que este plan pide tocar.
//   (3) `DEFAULT_PUBLIC_TENANT_ID` (= 1, `modules.ts`) — deuda consciente
//       D-06. Cae acá TODO marketing: no solo las rutas públicas de
//       blog/academy/franchise/app-landing sin `request.user`, sino también
//       las 16 rutas ADMIN de blog, que autentican con `{ preHandler:
//       [fastify.authenticate] }` — `preHandler` corre DESPUÉS de
//       `onRequest`, así que en el momento en que el guard se ejecuta
//       `request.user` todavía no existe para esas 16 rutas tampoco. Alcance
//       real: 35 rutas de marketing resuelven siempre tenant 1, autenticadas
//       o no. Con un solo tenant real (El Templo) es indistinguible; el caso
//       multi-tenant queda diferido (YAGNI, ver RESEARCH). NO se mueve el
//       `authenticate` de esas 16 rutas de `preHandler` a `onRequest`: nadie
//       pidió tocar esa superficie y el pipeline de marketing no cambia.
// Prohibido resolver un tenant nulo con un default numérico fuera de esta
// rama (3), documentada y acotada — es la ÚNICA excepción a la regla dura de
// `tenant.ts` (`assertTenant`: "un gimnasio no resoluble es DENY, jamás el
// tenant 1"). Acá no hay "no resoluble": es la ausencia estructural de
// `request.user` en superficie pública, un caso distinto.
//
// FAIL-CLOSED (T-176-06)
// -----------------------
// Si `isModuleEnabled` tira (DB caída, query mal formada), el guard NO
// atrapa el error — propaga tal cual. Fastify lo convierte en un 500. Un
// `catch` que devolviera "el módulo está habilitado" sería fail-open
// disfrazado: prohibido.
//
// QUÉ NO ES ESTE ARCHIVO
// -----------------------
// No decide QUÉ registros de `app.ts` envolver (eso lo hace `app.ts` mismo,
// llamando a `moduleScope` doce veces) ni sabe nada de `ModuleDef`/registry de
// hooks (eso es el plan 176-04). Este archivo solo sabe: leer el flag, cortar
// con 404, y exponer la marca (`moduleGuardOf`) para que el gate de
// cobertura del plan 176-05 la lea.
//
// QUÉ HACER CUANDO SE CAIGA
// ---------------------------
// Si el gate de `iso-01-manifiesto.test.ts` (plan 176-05) marca una ruta
// `templo-module` sin guard: el registro de esa ruta en `app.ts` no está
// envuelto con `moduleScope`. Si marca una ruta NO-templo CON guard: un
// `addHook` se derramó desde dentro de un `fp(...)` — revisar que ningún
// plugin nuevo cuelgue hooks a mano en vez de pasar por `moduleScope`.
//
// QUIÉN LO CONSUME
// -----------------
// `src/app.ts` (los 12 registros de `templo-training`, este plan) y — en los
// planes siguientes de la fase — el resto de los registros `templo-module` y
// el gate de cobertura (`moduleGuardOf`).
//
// Este archivo NO se agrega a `src/modules/shared/index.ts` (barrel) — se
// importa por ruta directa, igual que `country-scope.ts`, `tenant.ts`,
// `module-flags.ts` y `permissions.ts`.

import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  RouteOptions,
} from "fastify";
import * as schema from "../../db/schema";
import { isModuleEnabled } from "./module-flags";
import { DEFAULT_PUBLIC_TENANT_ID, type ModuleName } from "./modules";

type DbInstance = MySql2Database<typeof schema>;

/**
 * Símbolos GLOBALES (`Symbol.for`, mismo símbolo que usa `fastify` y
 * `fastify-plugin` internamente — no un import de sus módulos internos) que
 * `moduleScope` necesita para el fix de Pitfall 6, documentado ahí mismo.
 */
const PLUGIN_META_SYMBOL = Symbol.for("plugin-meta");
const REGISTERED_PLUGINS_SYMBOL = Symbol.for("registered-plugin");

/** Forma mínima de lo que `fastify-plugin` cuelga en `Symbol.for("plugin-meta")`. */
interface FastifyPluginMetaLike {
  name?: string;
}

/**
 * Marca que el gate de cobertura (`moduleGuardOf`) lee. Va en la MISMA
 * función que Fastify ejecuta como hook `onRequest` — así no puede
 * desincronizarse de la realidad (por eso NO se usa `config` por-ruta como
 * mecanismo de marca: sería una etiqueta paralela, no la función real).
 */
export interface ModuleGuard {
  (request: FastifyRequest, reply: FastifyReply): Promise<void>;
  temploModule: ModuleName;
}

/**
 * Construye el guard `onRequest` de un módulo. Fail-closed (T-176-06): si
 * `isModuleEnabled` tira, el error propaga (500) — nunca se traduce a "pasa
 * igual".
 */
export function requireModule(name: ModuleName, db: DbInstance): ModuleGuard {
  const guard = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const tenantId = await resolveTenantForGuard(request, db);
    if (!(await isModuleEnabled(tenantId, name, db))) {
      request.log.debug(
        { tenantId, module: name, url: request.url },
        "requireModule: módulo apagado para el tenant, corto con 404",
      );
      reply.code(404).send({ error: "No encontrado" });
      return;
    }
  };
  (guard as ModuleGuard).temploModule = name;
  return guard as ModuleGuard;
}

/**
 * Resuelve el `tenantId` que el guard va a consultar. Ver el docblock del
 * archivo (§"RESOLUCIÓN DEL TENANT") para las tres ramas y por qué la (3) es
 * más amplia de lo que D-06 enuncia. Privada: ningún test de este plan la
 * necesita importada — el comportamiento se prueba por HTTP.
 */
async function resolveTenantForGuard(
  request: FastifyRequest,
  db: DbInstance,
): Promise<number> {
  // (1) Un hook de instancia ya resolvió el scope (la minoría de training).
  if (request.scope?.tenantId != null) return request.scope.tenantId;

  // (2) Autenticado pero sin scope todavía: SELECT mínimo del ancla. NO se
  // llama al helper de scope de país/tenant — ver docblock del archivo.
  //
  // Pitfall 7 (descubierto ejecutando este plan): `users` es tabla STRICT
  // (`TENANT_STRICT_MODULES` en `src/db/tenant-tables.ts`, módulo `members`)
  // — el sentinel de tenancy (CON-05, `src/db/sentinel/install.ts`) hace
  // THROW en test/dev sobre cualquier query a una tabla strict cuyo texto SQL
  // no mencione `tenant_id` en la zona de predicado. Esta query es,
  // estructuralmente, la que DESCUBRE el tenant — no puede filtrar por algo
  // que todavía no conoce (mismo motivo por el que el helper de scope de
  // país/tenant, `country-scope.ts`, resuelve su fila ancla sin filtro de
  // tenant). Por eso
  // usa `db.execute(sql\`...\`)` con la anotación `tenant-safe:` embebida EN
  // EL SQL (no alcanza un comentario TS: el canal del sentinel es el texto
  // que llega al pool, no la fuente — ver el docblock de
  // `src/db/sentinel/analyze.ts` §"LOS DOS CANALES DE EXENCIÓN"), en vez del
  // query builder fluido que usa el resto del archivo.
  if (typeof request.user?.userId === "number") {
    // `db.execute()` del driver mysql2 (drizzle-orm 0.45.1) está tipado para
    // devolver `[ResultSetHeader, FieldPacket[]]` SIEMPRE — el genérico `T`
    // no afecta ese tipo (pensado para DML, no para un SELECT crudo). Y en
    // RUNTIME, para un `sql\`...\`` SIN `fields`/`customResultMapper`
    // (exactamente este caso: un raw query, no el query builder), `execute`
    // de `MySql2PreparedQuery` (`drizzle-orm/mysql2/session.js`) devuelve el
    // TUPLE crudo de mysql2 tal cual — `[filas, metadataDeColumnas]` — sin
    // desenvolver el primer elemento (ese desenvuelto es solo el camino con
    // `fields`, el que usa el query builder). El cast de abajo documenta esa
    // forma real — no es un `any` — y el doble destructuring (`[[row]]`) la
    // respeta: el primer nivel es el tuple, el segundo es la fila.
    const [rows] = (await db.execute(
      sql`/* tenant-safe: resuelve el tenant de un usuario recién autenticado ANTES de que exista scope — es la query que DESCUBRE el tenant, no puede filtrar por él (mismo motivo estructural que el lookup inicial del helper de scope de país/tenant, country-scope.ts) */ SELECT tenant_id AS tenantId FROM users WHERE id = ${request.user.userId} LIMIT 1`,
    )) as unknown as [Array<{ tenantId: number | null }>, unknown];
    const [row] = rows;
    if (row?.tenantId != null) return row.tenantId;
  }

  // (3) D-06: superficie de marketing (35 rutas, autenticadas o no) — deuda
  // consciente, documentada en el docblock del archivo.
  return DEFAULT_PUBLIC_TENANT_ID;
}

/**
 * Envuelve UN registro de rutas en un scope encapsulado que appendea el
 * guard de `name` a `onRequest` de toda ruta registrada adentro. Una línea
 * por registro (`moduleScope(app, "templo-training", spomPlugin)`), en vez
 * de 141 ediciones manuales.
 *
 * El `scoped.register(plugin, opts)` interno es lo que garantiza la
 * encapsulación incluso cuando `plugin` es un `fp(...)` — ver §"PITFALL 3"
 * del docblock del archivo.
 *
 * PITFALL 6 (descubierto ejecutando este plan, no anticipado por el
 * RESEARCH): dos de los 7 `fp` de training declaran una dependencia
 * NOMBRADA entre sí (`sessions-plugin` requiere `spom-plugin`,
 * `src/plugins/sessions.ts`). Antes de este plan, ambos se registraban
 * directo sobre `app` y avvio resolvía la dependencia sin problema porque
 * los dos empujaban su nombre al MISMO array de "plugins registrados" de
 * `app`. `moduleScope` envuelve cada uno en su PROPIO scope encapsulado
 * (necesario para no derramar el guard, Pitfall 3) — y ESE scope clona el
 * array de `app` al crearse (`Object.create`, mecanismo interno de avvio),
 * así que el nombre que un `fp` registra queda solo en la copia de SU
 * propio scope, invisible para el próximo `moduleScope(...)` (que clona
 * `app` de nuevo, sin el nombre del anterior). Sin el propagate de abajo,
 * envolver `sessions-plugin` revienta el boot con "the dependency
 * 'spom-plugin' is not registered", verificado empíricamente contra este
 * mismo build. El fix reenvía el nombre del plugin recién registrado (si lo
 * tiene — no todos los `plugin` de este archivo son `fp` con nombre, p.ej.
 * `adminRoutes`) al array REAL de `app`, para que el próximo `moduleScope`
 * lo herede exactamente como heredaría cualquier plugin registrado directo.
 * Usa `Symbol.for` (registro global de símbolos de JS), no un import del
 * código interno de `fastify`/`fastify-plugin` — es la misma referencia que
 * esas librerías usan para leer/escribir este estado.
 */
export async function moduleScope(
  app: FastifyInstance,
  name: ModuleName,
  plugin: FastifyPluginAsync,
  opts: { prefix?: string } = {},
): Promise<void> {
  await app.register(async (scoped) => {
    const guard = requireModule(name, scoped.db);
    scoped.addHook("onRoute", (route: RouteOptions) => {
      const existing = route.onRequest;
      const existingHandlers = existing === undefined
        ? []
        : Array.isArray(existing)
          ? existing
          : [existing];
      route.onRequest = [
        ...existingHandlers,
        guard,
      ] as RouteOptions["onRequest"];
    });
    await scoped.register(plugin, opts);

    // Pitfall 6 (ver docblock arriba): propaga el nombre del `fp(...)` recién
    // registrado al array real de `app`, para que el próximo `moduleScope`
    // pueda resolver una dependencia nombrada hacia este plugin.
    const meta = (plugin as unknown as Record<symbol, FastifyPluginMetaLike>)[
      PLUGIN_META_SYMBOL
    ];
    if (meta?.name) {
      (app as unknown as Record<symbol, string[]>)[
        REGISTERED_PLUGINS_SYMBOL
      ].push(meta.name);
    }
  });
}

/**
 * Lee la marca `temploModule` de la MISMA función que Fastify ejecuta como
 * hook `onRequest` de una ruta. Devuelve `null` si la ruta no lleva ningún
 * `ModuleGuard`. Lo consume el gate de cobertura (plan 176-05) — se exporta
 * desde acá para que el gate no re-implemente la lógica de lectura del
 * array/función de `route.onRequest`.
 */
export function moduleGuardOf(route: RouteOptions): ModuleName | null {
  const handlers = route.onRequest;
  if (!handlers) return null;
  const list = Array.isArray(handlers) ? handlers : [handlers];
  for (const handler of list) {
    if (typeof handler === "function" && "temploModule" in handler) {
      return (handler as ModuleGuard).temploModule;
    }
  }
  return null;
}
