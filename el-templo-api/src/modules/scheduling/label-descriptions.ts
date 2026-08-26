/**
 * Derived Label Descriptions
 *
 * Fase 180 Plan 10 (RES-05, D-23) — resuelve el hallazgo más caro del
 * research (§Pitfall 9): `activities.description` describe la actividad REAL
 * ("General"), pero cuando `deriveActivityLabel()` (derived-label.ts)
 * reetiqueta esa actividad genérica como "Combos"/"Técnica" según el
 * `sessionMode` aprobado del día, la descripción correcta YA NO es la de
 * "General" — es la del segmento derivado. Un bottom sheet ingenuo que lea
 * `activities.description` por `activityId` mostraría la descripción de
 * "General" bajo un título que dice "Combos" (D-23 lo prohíbe explícitamente:
 * la descripción tiene que seguir a la etiqueta MOSTRADA).
 *
 * Este archivo es el KV donde viven esas descripciones, una por modo
 * derivado, persistidas en `tenant_settings` (NO en una tabla nueva —
 * decisión de arquitectura tomada en la planificación del 180-10: evita una
 * segunda migración en una fase que ya tiene una y evita sumar una tabla al
 * inventario de tenancy y sus gates). Las claves de modo se derivan de
 * `DERIVED_CLASS_LABEL` (derived-label.ts, fuente única de la etiqueta) para
 * que agregar un modo nuevo ahí no deje descripciones huérfanas acá.
 *
 * `setting_key`: `class_label_description.<modo>` (p. ej.
 * `class_label_description.combos`). Un `value` vacío o solo espacios borra
 * la fila — equivale a "sin descripción cargada" (la app no muestra el
 * affordance de tap).
 */
import { and, eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import { tenantSettings } from "../../db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import { DERIVED_CLASS_LABEL } from "./derived-label";

type DbInstance = MySql2Database<typeof schema>;

/** Modo derivado (hoy "combos" | "tecnica" — el mismo dominio de `DERIVED_CLASS_LABEL`). */
export type DerivedLabelMode = keyof typeof DERIVED_CLASS_LABEL;

/**
 * `setting_key` de `tenant_settings` por modo derivado. Construido a partir
 * de `DERIVED_CLASS_LABEL` (derived-label.ts) — no se repite la lista de
 * modos en un segundo lugar.
 */
export const DERIVED_LABEL_DESCRIPTION_KEYS = Object.fromEntries(
  Object.keys(DERIVED_CLASS_LABEL).map((mode) => [
    mode,
    `class_label_description.${mode}`,
  ]),
) as Record<DerivedLabelMode, string>;

const MODE_BY_SETTING_KEY = new Map<string, DerivedLabelMode>(
  (
    Object.entries(DERIVED_LABEL_DESCRIPTION_KEYS) as [
      DerivedLabelMode,
      string,
    ][]
  ).map(([mode, key]) => [key, mode]),
);

/**
 * Lee las descripciones de todos los modos derivados para un tenant, en UNA
 * sola query (pensada para cargarse una vez por llamada a `getWeeklyGrid`,
 * nunca por slot — mismo patrón que `modeByDay`). Un modo sin fila cargada
 * devuelve `null`.
 */
export async function getDerivedLabelDescriptions(
  db: DbInstance,
  ctx: TenantContext,
): Promise<Record<DerivedLabelMode, string | null>> {
  const keys = Object.values(DERIVED_LABEL_DESCRIPTION_KEYS);
  const rows = await db
    .select({
      settingKey: tenantSettings.settingKey,
      settingValue: tenantSettings.settingValue,
    })
    .from(tenantSettings)
    .where(
      and(
        tenantWhere(tenantSettings, ctx),
        inArray(tenantSettings.settingKey, keys),
      ),
    );

  const result = {} as Record<DerivedLabelMode, string | null>;
  for (const mode of Object.keys(
    DERIVED_LABEL_DESCRIPTION_KEYS,
  ) as DerivedLabelMode[]) {
    result[mode] = null;
  }
  for (const row of rows) {
    const mode = MODE_BY_SETTING_KEY.get(row.settingKey);
    if (mode) result[mode] = row.settingValue;
  }
  return result;
}

/**
 * Upsert de la descripción de un modo derivado. Un `value` vacío o solo
 * espacios BORRA la fila (equivale a "sin descripción" — el KV no guarda
 * strings vacíos, la ausencia de fila ya significa eso).
 */
export async function setDerivedLabelDescription(
  db: DbInstance,
  ctx: TenantContext,
  mode: DerivedLabelMode,
  value: string,
): Promise<void> {
  const settingKey = DERIVED_LABEL_DESCRIPTION_KEYS[mode];
  const trimmed = value.trim();

  if (trimmed === "") {
    await db
      .delete(tenantSettings)
      .where(
        and(
          tenantWhere(tenantSettings, ctx),
          eq(tenantSettings.settingKey, settingKey),
        ),
      );
    return;
  }

  await db
    .insert(tenantSettings)
    .values(tenantValues(ctx, { settingKey, settingValue: trimmed }))
    .onDuplicateKeyUpdate({ set: { settingValue: trimmed } });
}
