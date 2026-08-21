// Module: shared — resolver de flags de módulo (`module.*.enabled`)
//
// POR QUÉ EXISTE ESTE ARCHIVO
// ----------------------------
// Fase 176 (MOD-01): lee `tenant_settings` y resuelve qué módulos Templo
// (`modules.ts`) están habilitados para un tenant dado. Es el cimiento del
// guard `requireModule` y del registry de hooks de los planes siguientes de
// la fase — ninguno de los dos tiene una instancia de service inyectada por
// constructor (uno corre en un hook `onRequest`, el otro en el composition
// root), así que la firma es funcional con `db` por parámetro, divergencia
// deliberada del análogo `SettingsService` (clase con `db` inyectada).
//
// FAIL-CLOSED (T-176-06)
// -----------------------
// Ausencia de fila para una key ⇒ módulo OFF (default seguro para una
// instalación white-label sin seed). Un error de la DB (conexión caída, query
// mal formada) PROPAGA tal cual — nunca se traduce a un set vacío silencioso
// ni, mucho menos, a "todo habilitado". Cachear un error como si fuera un
// resultado válido sería fail-open disfrazado: no se hace.
//
// CACHE TTL Y PITFALL 4
// -----------------------
// `vitest.config.ts` corre con `isolate: false`: los módulos de Node —y por
// lo tanto este `Map` en memoria— se COMPARTEN entre todos los archivos de
// test del mismo worker. Un TTL de producción (60s) haría que un test que
// apaga un flag viera el valor viejo durante los tests siguientes del mismo
// worker. Dos redes independientes contra eso: (1) TTL = 0 en
// `NODE_ENV === "test"` (cada lectura pega a la DB), y (2)
// `invalidateModuleFlags()` exportada explícitamente para que cualquier
// fixture de test que mute `tenant_settings` la llame antes de la siguiente
// lectura. Ver `test/fixtures/module-flags.ts`.
//
// QUÉ NO ES ESTE ARCHIVO
// -----------------------
// No aplica ningún guard de ruta ni resuelve `tenantId` desde el request —
// eso es `module-registry.ts` (plan siguiente). Este archivo solo sabe leer
// `tenant_settings` y cachear.
//
// QUIÉN LO CONSUME
// -----------------
// El guard `requireModule` y el registry de hooks (planes siguientes de la
// fase), y `test/fixtures/module-flags.ts`.
//
// Este archivo NO se agrega a `src/modules/shared/index.ts` (barrel) — se
// importa por ruta directa, igual que `country-scope.ts`, `tenant.ts` y
// `permissions.ts`.

import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import { tenantSettings } from "../../db/schema";
import { MODULE_FLAG_ON, parseModuleFlagKey, type ModuleName } from "./modules";

type DbInstance = MySql2Database<typeof schema>;

/**
 * TTL del cache en runtime: 60s. En test, 0 (sin cache — ver Pitfall 4 en el
 * docblock de arriba).
 */
export const MODULE_FLAGS_TTL_MS =
  process.env.NODE_ENV === "test" ? 0 : 60_000;

interface CacheEntry {
  flags: Set<ModuleName>;
  expiresAt: number;
}

const cache = new Map<number, CacheEntry>();

/**
 * Invalida el cache de flags de módulo. Sin argumento, limpia todos los
 * tenants cacheados. Con `tenantId`, limpia solo ese tenant. Debe llamarse
 * después de cualquier escritura en `tenant_settings` sobre una key
 * `module.*.enabled` (ver `test/fixtures/module-flags.ts`).
 */
export function invalidateModuleFlags(tenantId?: number): void {
  if (tenantId === undefined) {
    cache.clear();
    return;
  }
  cache.delete(tenantId);
}

/**
 * Resuelve el set de módulos habilitados para un tenant. Fail-closed: una
 * key ausente en `tenant_settings` no aporta al set (default OFF); un valor
 * distinto de `MODULE_FLAG_ON` tampoco habilita el módulo; una key que no
 * matchea `module.<nombre-conocido>.enabled` se ignora. Un error de la DB
 * propaga sin cachear.
 */
export async function enabledModulesFor(
  tenantId: number,
  db: DbInstance,
): Promise<Set<ModuleName>> {
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.flags;
  }

  const rows = await db
    .select({
      settingKey: tenantSettings.settingKey,
      settingValue: tenantSettings.settingValue,
    })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId));

  const flags = new Set<ModuleName>();
  for (const row of rows) {
    const moduleName = parseModuleFlagKey(row.settingKey);
    if (moduleName && row.settingValue === MODULE_FLAG_ON) {
      flags.add(moduleName);
    }
  }

  cache.set(tenantId, { flags, expiresAt: Date.now() + MODULE_FLAGS_TTL_MS });
  return flags;
}

/** Si el módulo `name` está habilitado para `tenantId`. */
export async function isModuleEnabled(
  tenantId: number,
  name: ModuleName,
  db: DbInstance,
): Promise<boolean> {
  const flags = await enabledModulesFor(tenantId, db);
  return flags.has(name);
}
