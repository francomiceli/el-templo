// Module: shared — módulos Templo (fuente única de nombres)
//
// POR QUÉ EXISTE ESTE ARCHIVO
// ----------------------------
// Fase 176 (MOD-01): El Templo empaqueta 4 features exclusivas como "módulos"
// que un tenant white-label puede tener apagados. Este archivo es la ÚNICA
// declaración de los 4 nombres de módulo en todo el repo. Antes de esta fase
// la lista vivía duplicada (y NO exportada) en `test/tenant-manifest.ts:149`;
// esa constante ahora IMPORTA de acá — no al revés. Ver
// `.docs/saas-multitenancy/04-mecanismo-modulos.md` §1 para el diseño completo
// del mecanismo (flags, guard, registry de hooks) del que este archivo es el
// cimiento.
//
// QUÉ NO ES ESTE ARCHIVO
// -----------------------
// No resuelve nada contra la DB (eso es `module-flags.ts`) ni aplica ningún
// guard de ruta (eso es `module-registry.ts`, planes siguientes de la fase).
// Es config estática pura, sin imports, para que cualquier archivo — incluido
// `test/tenant-manifest.ts`, que se typechequea suelto con `tsc` — pueda
// importarlo sin arrastrar el resto de `src/`.
//
// QUIÉN LO CONSUME
// -----------------
// `module-flags.ts` (esta misma carpeta), `test/tenant-manifest.ts` (la lista
// `MODULOS_TEMPLO`/`ModuloTemplo` pasa a importar `MODULE_NAMES`/`ModuleName`
// de acá), y — en los planes siguientes de la fase — el guard `requireModule`
// y el registry de hooks.
//
// Do NOT re-declare esta lista en ningún otro lugar del repo — importar de acá.

/**
 * Los 4 módulos exclusivos de El Templo. Orden fijo (no alfabético): el orden
 * en el que aparecen en el doc 04 y en el manifiesto de rutas.
 */
export const MODULE_NAMES = [
  "templo-training",
  "templo-gamification",
  "templo-marketing",
  "templo-onboarding",
] as const;

export type ModuleName = (typeof MODULE_NAMES)[number];

/**
 * Valor serializado cuando el módulo está habilitado. Divergencia deliberada
 * respecto de `system_settings` (`settings/service.ts` usa `'on'`/`'off'`):
 * el doc 04 §2 especifica `"true"`/`"false"` para `tenant_settings`, y esta
 * fase fija esa convención para todo flag `module.*.enabled` (Assumption A2
 * del RESEARCH de la fase 176). No mezclar los dos vocabularios.
 */
export const MODULE_FLAG_ON = "true";
export const MODULE_FLAG_OFF = "false";

/**
 * Construye la `tenant_settings.setting_key` de un módulo:
 * `module.<nombre>.enabled`.
 */
export function moduleFlagKey(name: ModuleName): string {
  return `module.${name}.enabled`;
}

/**
 * Inversa de `moduleFlagKey`: dada una `setting_key` cualquiera, devuelve el
 * `ModuleName` si matchea el patrón `module.<nombre-conocido>.enabled`, o
 * `null` si no matchea o el nombre no es uno de los 4 conocidos. Una key con
 * un nombre desconocido (typo, módulo de otra instalación) se ignora — no
 * ensucia el set de módulos habilitados.
 */
export function parseModuleFlagKey(key: string): ModuleName | null {
  const match = /^module\.(.+)\.enabled$/.exec(key);
  if (!match) return null;
  const candidate = match[1];
  return (MODULE_NAMES as readonly string[]).includes(candidate)
    ? (candidate as ModuleName)
    : null;
}

/**
 * D-06 (deuda consciente): tenant público usado por la superficie de
 * marketing sin `request.user` (formularios públicos de franquicia/academy/
 * app-landing). La resolución de tenant por Host queda diferida por YAGNI —
 * hoy la instalación es mono-tenant en producción (El Templo = tenant 1).
 * Cuando exista más de un tenant con superficie pública propia, este default
 * deja de ser válido y hay que resolver por dominio/Host en su lugar.
 */
export const DEFAULT_PUBLIC_TENANT_ID = 1;
