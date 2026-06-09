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
