/**
 * Diccionario rol de bloque -> etiqueta visible, fuente única para el admin
 * (fase 160, SEM-11, D160-03).
 *
 * NOTE (deploy): este archivo se re-toca junto al fix-forward de CI del tren
 * 159/160 para que dorny/paths-filter marque `admin` como cambiado y el deploy
 * de prod arrastre los cambios de admin (PDF) — que ya están en el base
 * `event.before` y de otro modo no se re-desplegarían. Ver deploy.yml.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUPLICACIÓN ACEPTADA A PROPÓSITO — "un diccionario por app" (D160-03). Hay
 * un espejo equivalente en `el-templo-api` (`src/modules/shared/role-labels.ts`,
 * usado por la TV) y otro en `el-templo-app` (member app): cada runtime tiene
 * su propio bundle y no hay infraestructura de paquete compartido cross-app en
 * el repo hoy. Un cambio de etiqueta acá NO propaga solo — hay que espejarlo a
 * mano en las otras dos apps.
 *
 * ⚠ INITIUM difiere a propósito del espejo del API: la TV rotula el bloque
 * INITIUM como "PYROS" (decisión v8 del UI-SPEC, ver `shared/role-labels.ts`)
 * porque ahí el rol ES el título de la página. El PDF del admin, en cambio,
 * mantiene `role` y `blockName` como campos separados (`pdf-types.ts`,
 * `PdfBlockPage`): `buildInitiumPage` imprime `blockName` ("PYROS") como
 * título grande y usa `role` ("INITIUM") en el subtítulo
 * "INITIUM · {formatName}". Por eso acá `INITIUM` mapea a "INITIUM", no a
 * "PYROS" — mapear a "PYROS" duplicaría el literal en el subtítulo.
 *
 * Consumido por el generador de PDF (`utils/pdf/`) y por el editor de
 * sesiones (`EditableBlockCard.vue`, plan 160-03).
 */
export const ROLE_LABELS: Record<string, string> = {
  INITIUM: 'INITIUM',
  NUCLEUS: 'NUCLEUS',
  DEUTEROS_1: 'DEUTEROS I',
  DEUTEROS_2: 'DEUTEROS II',
  EPIKOS: 'EPIKOS',
  ATHLOS: 'ATHLOS',
  ROM_LOWER: 'TREN INFERIOR',
  ROM_CORE: 'ZONA MEDIA',
  ROM_UPPER: 'TREN SUPERIOR',
  COMBOS_I: 'COMBOS I',
  COMBOS_II: 'COMBOS II',
  COMBOS_II_ALT: 'COMBOS II ALT',
  TECNICA_I: 'TÉCNICA I',
  TECNICA_II: 'TÉCNICA II',
  TECNICA_II_ALT: 'TÉCNICA II ALT',
  STRETCHING: 'STRETCHING',
};

/**
 * Get the display label for a block role. Falls back to the raw role string
 * if not mapped (safety net for any future role added to the DB before the
 * dictionary catches up).
 */
export function getRoleLabel(role: string | null | undefined): string {
  if (!role) return '';
  return ROLE_LABELS[role] ?? role;
}
