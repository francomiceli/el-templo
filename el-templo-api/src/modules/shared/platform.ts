import { ADMIN_ROLES } from "./permissions";
import type { TenantContext } from "./tenant";

/**
 * Id del gimnasio dueño de la plataforma (El Templo).
 *
 * Fuente única de la constante: la usan `app-branch-name.ts` y el módulo de
 * patrocinadores. No confundir con "tenant por defecto": es el tenant que
 * administra cosas de plataforma.
 */
export const TEMPLO_TENANT_ID = 1;

/**
 * Guard "solo El Templo" (Fase 199, D-18/D-26).
 *
 * En esta base no existe super owner ni `platform_users` (la fase 182 vive en
 * otra rama), así que "administrador de plataforma" = rol de admin del
 * gimnasio (`ADMIN_ROLES`) Y tenant El Templo. Una sola función para que el
 * reemplazo futuro sea un cambio de un solo lugar.
 *
 * TODO(tren 182): reemplazar por platform_users al integrar.
 */
export function isTemploPlatformAdmin(
  role: string,
  ctx: TenantContext,
): boolean {
  return (
    (ADMIN_ROLES as readonly string[]).includes(role) &&
    ctx.tenantId === TEMPLO_TENANT_ID
  );
}
