/**
 * Diccionario rol de bloque -> etiqueta visible, UNICA fuente para el API
 * (fase 160, SEM-11, D160-03).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUPLICACION ACEPTADA A PROPOSITO — "un diccionario por app" (D160-03). Hay
 * un espejo equivalente en `el-templo-admin` (PDF/editor) y otro en
 * `el-templo-app` (member app): cada runtime tiene su propio bundle y no hay
 * infraestructura de paquete compartido cross-app en el repo hoy. Un cambio
 * de etiqueta acá NO propaga solo — hay que espejarlo a mano en las otras dos
 * apps, igual que ya pasa con `formatNameWithParams` / `roster.ts`.
 *
 * NO es un paquete cross-app. Dentro del API sí es la ÚNICA fuente: antes de
 * este módulo `tv/roster.ts` y `admin/service.ts` tenían copias divergentes
 * (Initium vs Pyros, Deuteros vs "Deuteros 1/2") — ambas quedan unificadas
 * acá.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Etiqueta LARGA de cada rol, para la TV de sucursal (`tv/roster.ts`,
 * `blockTitle`).
 *
 * INITIUM se rotula PYROS (decision v8 del UI-SPEC): es "un bloque mas", no
 * una pagina especial. COMBOS_I/II y TECNICA_I/II usan numerales romanos,
 * espejando la convencion DEUTEROS I/II ya existente (D160-02). STRETCHING
 * no lleva numeral: es la lista de cierre compartida por los 6 niveles
 * (D160-04).
 */
export const ROLE_LABELS: Record<string, string> = {
  INITIUM: "PYROS",
  NUCLEUS: "NUCLEUS",
  DEUTEROS_1: "DEUTEROS I",
  DEUTEROS_2: "DEUTEROS II",
  EPIKOS: "EPIKOS",
  ATHLOS: "ATHLOS",
  ROM_LOWER: "TREN INFERIOR",
  ROM_CORE: "ZONA MEDIA",
  ROM_UPPER: "TREN SUPERIOR",
  COMBOS_I: "COMBOS I",
  COMBOS_II: "COMBOS II",
  COMBOS_II_ALT: "COMBOS II ALT",
  TECNICA_I: "TÉCNICA I",
  TECNICA_II: "TÉCNICA II",
  TECNICA_II_ALT: "TÉCNICA II ALT",
  STRETCHING: "KINESIS",
};

/**
 * Etiqueta CORTA de cada rol, para el badge `routesSummary` del listado de
 * sesiones admin (`admin/service.ts`).
 *
 * ROM se sigue rotulando con `ROM_DISPLAY` inline en `admin/service.ts`: son
 * nombres de ZONA del cuerpo (Tren Inferior/Zona Media/Tren Superior), no
 * badges de ROL — no entran acá.
 *
 * Fase 159 (SEM-12, D-P5) liberó "I"/"II" del rol INITIUM para las series
 * COMBOS/TECNICA renombrando DEUTEROS_1/2 a "DA"/"DB"; D160-02 cierra ese
 * espacio con COMBOS_I/II → "I"/"II", TECNICA_I/II → "I"/"II" y
 * STRETCHING → "Stretch".
 */
export const ROLE_BADGE_LABELS: Record<string, string> = {
  INITIUM: "I",
  NUCLEUS: "N",
  DEUTEROS_1: "DA",
  DEUTEROS_2: "DB",
  EPIKOS: "E",
  ATHLOS: "A",
  COMBOS_I: "I",
  COMBOS_II: "II",
  COMBOS_II_ALT: "II·A",
  TECNICA_I: "I",
  TECNICA_II: "II",
  TECNICA_II_ALT: "II·A",
  STRETCHING: "Stretch",
};
