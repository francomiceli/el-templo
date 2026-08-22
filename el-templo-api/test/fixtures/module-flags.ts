/**
 * Fase 176 Plan 01 (MOD-01) — fixtures para mutar `module.*.enabled` en tests.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ----------------------------
 * `module-flags.ts` (src) cachea con TTL. En test el TTL es 0
 * (`process.env.NODE_ENV === "test"`), pero eso solo evita que el cache
 * SOBREVIVA entre lecturas separadas por tiempo — no invalida una entrada que
 * ya está en el `Map` con `expiresAt` en el pasado inmediato dentro del mismo
 * tick, y sobre todo: `vitest.config.ts` corre con `isolate: false`, así que
 * el `Map` del módulo se comparte entre TODOS los archivos de test del mismo
 * worker. Todo fixture de acá llama `invalidateModuleFlags` después de
 * escribir, y todo test que toque flags DEBE restaurar en `afterEach` con
 * `restoreTemploFlags` — dejar un flag apagado filtra al test siguiente del
 * mismo worker.
 *
 * COMO SE USA
 * -----------
 * ```ts
 * afterEach(async () => {
 *   await restoreTemploFlags(app);
 * });
 * ```
 */
import type { FastifyInstance } from "fastify";
import { and, eq, like } from "drizzle-orm";
import { tenantSettings } from "../../src/db/schema";
import {
  MODULE_NAMES,
  MODULE_FLAG_ON,
  MODULE_FLAG_OFF,
  moduleFlagKey,
  type ModuleName,
} from "../../src/modules/shared/modules";
import { invalidateModuleFlags } from "../../src/modules/shared/module-flags";
import { TENANT_TEMPLO } from "./second-tenant";

/**
 * Prende o apaga un módulo para `tenantId` (upsert sobre `tenant_settings`) e
 * invalida el cache de ese tenant. La próxima lectura ve el cambio de
 * inmediato, sin esperar el TTL.
 */
export async function setModuleFlag(
  app: FastifyInstance,
  tenantId: number,
  moduleName: ModuleName,
  enabled: boolean,
): Promise<void> {
  const key = moduleFlagKey(moduleName);
  const value = enabled ? MODULE_FLAG_ON : MODULE_FLAG_OFF;

  await app.db
    .insert(tenantSettings)
    .values({ tenantId, settingKey: key, settingValue: value })
    .onDuplicateKeyUpdate({ set: { settingValue: value } });

  invalidateModuleFlags(tenantId);
}

/** Borra todas las filas `module.*.enabled` de `tenantId` e invalida el cache. */
export async function clearModuleFlags(
  app: FastifyInstance,
  tenantId: number,
): Promise<void> {
  await app.db
    .delete(tenantSettings)
    .where(
      and(
        eq(tenantSettings.tenantId, tenantId),
        like(tenantSettings.settingKey, "module.%"),
      ),
    );

  invalidateModuleFlags(tenantId);
}

/**
 * Deja los 4 flags del tenant 1 (El Templo) en ON — el estado que produce la
 * migración 0207. Llamar en `afterEach` de todo test que mute flags, para no
 * filtrar un módulo apagado al siguiente archivo del mismo worker
 * (`isolate: false`).
 */
export async function restoreTemploFlags(app: FastifyInstance): Promise<void> {
  for (const moduleName of MODULE_NAMES) {
    await setModuleFlag(app, TENANT_TEMPLO, moduleName, true);
  }
}
