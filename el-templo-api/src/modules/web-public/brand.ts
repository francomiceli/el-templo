// Módulo: web-public — nombre canónico de la marca (Fase 195, D-02).
//
// La marca canónica (D-02) lleva el nombre de {@link DEFAULT_WEB_BRAND_NAME}; cada
// sede se publica como "<marca> — <Sede>". Es configurable por gimnasio en `tenant_settings`
// (key `web.brand_name`) y este default es el ÚNICO literal de la marca en el
// código de la API: no re-declararlo en ningún otro archivo.
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import { tenantSettings } from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";

type DbInstance = MySql2Database<typeof schema>;

export const DEFAULT_WEB_BRAND_NAME = "El Templo Calistenia";

/** Key en `tenant_settings`. Namespace `web.*` (ver test de la migración 0190). */
export const WEB_BRAND_NAME_KEY = "web.brand_name";

/** Nombre de marca del gimnasio de `ctx`; cae al default si no hay fila o está vacía. */
export async function getWebBrandName(
  db: DbInstance,
  ctx: TenantContext,
): Promise<string> {
  const [row] = await db
    .select({ settingValue: tenantSettings.settingValue })
    .from(tenantSettings)
    .where(
      and(
        tenantWhere(tenantSettings, ctx),
        eq(tenantSettings.settingKey, WEB_BRAND_NAME_KEY),
      ),
    )
    .limit(1);

  const value = row?.settingValue.trim();
  return value ? value : DEFAULT_WEB_BRAND_NAME;
}
