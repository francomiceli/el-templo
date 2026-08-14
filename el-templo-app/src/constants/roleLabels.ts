import type { BlockRole } from '../modules/training/types/session'

/**
 * Diccionario rol de bloque -> etiqueta visible, fuente única para el member app
 * (fase 160, SEM-11, D160-03).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUPLICACIÓN ACEPTADA A PROPÓSITO — "un diccionario por app" (D160-03). Hay
 * un espejo equivalente en `el-templo-api` (`src/modules/shared/role-labels.ts`,
 * usado por la TV) y otro en `el-templo-admin` (`src/constants/roleLabels.ts`,
 * usado por el PDF y el editor de sesiones): cada runtime tiene su propio
 * bundle y no hay infraestructura de paquete compartido cross-app en el repo
 * hoy. Un cambio de etiqueta acá NO propaga solo — hay que espejarlo a mano
 * en las otras dos apps.
 *
 * Tipado con `BlockRole` (no `Record<string, string>` como el admin) para que
 * el typecheck del app garantice cobertura exhaustiva: si `BlockRole` gana un
 * rol nuevo, este diccionario deja de compilar hasta que se agregue el label.
 *
 * Usa el canónico 'Initium' (no 'Pyros'). EXCEPCIÓN decidida por Franco:
 * `BlockProgressionView.vue` mantiene 'Pyros' vía un override LOCAL (plan
 * 160-05) — este diccionario no cambia por esa excepción.
 *
 * Consumido por `BlockCard.vue` (formatRole) y por el plan 160-05 (resto de
 * las superficies del app: DayPlayer, BlockProgressionView, GoalPlanSession).
 */
export const ROLE_LABELS: Record<BlockRole, string> = {
  INITIUM: 'Initium',
  NUCLEUS: 'Nucleus',
  DEUTEROS_1: 'Deuteros 1',
  DEUTEROS_2: 'Deuteros 2',
  ATHLOS: 'Athlos',
  EPIKOS: 'Epikos',
  ROM_LOWER: 'Tren Inferior',
  ROM_CORE: 'Zona Media',
  ROM_UPPER: 'Tren Superior',
  COMBOS_I: 'Combos I',
  COMBOS_II: 'Combos II',
  TECNICA_I: 'Técnica I',
  TECNICA_II: 'Técnica II',
  STRETCHING: 'Stretching',
}

/**
 * Get the display label for a block role. Falls back to the raw role string
 * if not mapped (safety net for any future role added to the DB before the
 * dictionary catches up).
 */
export function getRoleLabel(role: BlockRole | string | null | undefined): string {
  if (!role) return ''
  return (ROLE_LABELS as Record<string, string>)[role] ?? role
}
