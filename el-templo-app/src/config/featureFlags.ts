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
 * Fase 197: tabs de Entrenar. Fase 201 D-10: vuelven prendidas, pero solo Semana y Conquer
 * (Libre sigue con FREE_BLOCKS_ENABLED y Desafíos con ENTRENAR_DESAFIOS_ENABLED, ambos apagados).
 * Con false Entrenar muestra solo Semana, sin barra de tabs, y cualquier `?tab=` abre Semana.
 *
 * 2026-10-27: apagado para OCULTAR Conquer (pedido de Franco) aunque esté todo en producción: sin la
 * tab no hay entrada a Conquer en el app, y el `?tab=conquer` del pop-up de lanzamiento abre Semana.
 * El código, las rutas y el API de Conquer quedan.
 *
 * 2026-10-29: prendido SOLO en el build web de staging (pedido de Franco, para probar Conquer).
 * Reusa la misma señal que la marca azul de staging (`VITE_APP_ENVIRONMENT=staging`, la pone
 * deploy-staging.yml): producción y los builds de tienda no la tienen y siguen sin la tab.
 */
export const ENTRENAR_TABS_ENABLED = import.meta.env.VITE_APP_ENVIRONMENT === 'staging'

/**
 * Fase 201 D-10: tab Desafíos de Entrenar. Apagada (mismo patrón que Libre): sin tab, ni como
 * "pronto", y sin `?tab=desafios`. El pane "Próximamente" queda en el código.
 */
export const ENTRENAR_DESAFIOS_ENABLED = false

/**
 * Fase 200: lo de anatomía para socios (Guía en dos cards, Tu cuerpo, cuerpo tocable de
 * Entrenar). Prendido en todos los entornos por decisión de Franco (2026-10-22), con el
 * contenido en borrador. Con false, la Guía abre las historias como antes y el cuerpo de
 * Entrenar no es tocable.
 */
export const ANATOMIA_ALUMNOS_ENABLED = true
