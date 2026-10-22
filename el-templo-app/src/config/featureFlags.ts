/**
 * Member-app feature flags — temporary gating for v5.1 ("nuevo sistema de
 * entrenamiento") surfaces that are NOT yet ready for members in production.
 *
 * The v5.1 training-data rollout (dimensions accepted, milestones populated,
 * progression graph built) is deferred, so the tree and in-session adjustment
 * would render empty/no-op for members. We gate them off until that data
 * exists. The ONLY new member-facing surface enabled for now is the kairos
 * level display (no flag — it works without any data rollout).
 *
 * Flip these to `true` once the training-data rollout has run in production.
 */

/** "Mi Árbol" skill-tree view — card in Mi Templo + the /mi-arbol route. */
export const MEMBER_TREE_ENABLED = false

/** In-session difficulty adjustment — "más fácil / más difícil" + objective label. */
export const IN_SESSION_ADJUST_ENABLED = false

/**
 * Fase 197: modo "Libre" (canasta de bloques + player de bloque libre). Apagado mientras se
 * decide a quiénes se les presenta: sin la tab (ni como "pronto"), sin `?tab=libre`, sin los
 * links de Semana y de la card de hoy, y sin la ruta del player. El código y la API quedan.
 */
export const FREE_BLOCKS_ENABLED = false

/**
 * Fase 197: tabs de Entrenar (Semana / Libre / Desafíos / Conquer). Apagadas por ahora
 * (2026-10-21): Entrenar muestra solo el contenido de Semana, sin la barra de tabs (tampoco en
 * la vidriera sin plan) y cualquier `?tab=` abre Semana. El código de las tabs queda.
 */
export const ENTRENAR_TABS_ENABLED = false

/**
 * Fase 200 P1: lo de anatomía para socios (Guía en dos cards, Tu cuerpo, cuerpo tocable de
 * Entrenar). Apagado hasta la validación humana del contenido (D5). Con false, la Guía abre las
 * historias como hoy y el cuerpo de Entrenar no es tocable.
 */
export const ANATOMIA_ALUMNOS_ENABLED = false
