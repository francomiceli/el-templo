/**
 * Centralized Role Permission Registry
 *
 * Single source of truth for role-based access control across all API modules.
 * Maps to the permission matrix defined in Phase 66 CONTEXT.md.
 *
 * Hierarchy: owner > admin > coach = gestion (parallel)
 */

/** All staff roles (non-member). Used for login gating in admin app. */
export const ALL_STAFF_ROLES = [
  "coach",
  "admin",
  "owner",
  "gestion",
  "recepcion",
] as const;

/** Roles that can access owner-only features (franchise, users, blog, gladius, academy, app-waitlist, labs). */
export const OWNER_ROLES = ["owner"] as const;

/** Roles that can access admin-level features (planes, analiticas, configuracion, blog, gladius, academy, etc). */
export const ADMIN_ROLES = ["admin", "owner"] as const;

/** Roles that can access coach-level features (programs enrollment, alumnos). */
export const COACH_ROLES = [
  "coach",
  "admin",
  "owner",
  "gestion",
  "recepcion",
] as const;

/** Roles that can access training features (sesiones, generar, ejercicios, horarios). */
export const TRAINING_ROLES = ["coach", "owner"] as const;

/**
 * Email of the single coach allowed into the Entrenamiento admin surface
 * (sesiones, programador, ejercicios, árbol). Identified by email rather than
 * user.id because the email is stable across environments — it is seeded
 * literally by migration 0017, whereas the numeric id depends on row insert
 * order and differs between local / staging / prod.
 */
export const TRAINING_EXCLUSIVE_COACH_EMAIL = "Scaine7@hotmail.com";

/**
 * Whether a user may access the Entrenamiento admin surface. Owners always
 * retain full access; among coaches, only the exclusive training coach
 * (TRAINING_EXCLUSIVE_COACH_EMAIL) is allowed. Stricter than TRAINING_ROLES:
 * a plain coach who is not the exclusive coach is rejected.
 */
export function canAccessTraining(user: {
  role: string;
  email: string | null;
}): boolean {
  if (user.role === "owner") return true;
  return (
    user.email != null &&
    user.email.toLowerCase() === TRAINING_EXCLUSIVE_COACH_EMAIL.toLowerCase()
  );
}

/**
 * Templo-specific RBAC overrides layered ON TOP OF the white-label core.
 *
 * Direction-of-composition rule (D-06 + `.docs/saas-multitenancy/04-mecanismo-modulos.md`):
 * the SaaS core defines the generic 2-level surface (owner/admin = "Dueño" via
 * ADMIN_ROLES; employees via the module role sets). Tenant customizations are
 * expressed as an override object that WIDENS a core set for El Templo, and the
 * composition always flows override → core (`[...override, ...ADMIN_ROLES]`),
 * NEVER core → Templo. This keeps the core free of Templo-isms: a fresh tenant
 * gets the core sets unchanged; El Templo layers `reportes`/`deudas` on top.
 *
 * - `reportes`: extra roles (beyond Dueño) that see Reportes/Caja → gestion.
 * - `deudas`: extra roles (beyond Dueño) that see the simplified Deudas tab →
 *   coach + gestion (coach so profes can look up what to collect at the door).
 */
export const TEMPLO_RBAC_OVERRIDES = {
  reportes: ["gestion"],
  deudas: ["coach", "gestion"],
} as const;

/**
 * Roles that can access caja and reportes (gestion, admin, owner).
 *
 * Composed core + Templo override (D-01/D-02/D-03/D-06): the Dueño core
 * (ADMIN_ROLES) plus the Templo `reportes` override. Order preserved so the
 * effective value stays byte-identical to the historical
 * `["gestion", "admin", "owner"]` — consumers (reports, leads) are untouched.
 */
export const CAJA_ROLES = [
  ...TEMPLO_RBAC_OVERRIDES.reportes,
  ...ADMIN_ROLES,
] as const;

/** Roles that can read the operational analytics endpoints surfaced inside
 *  Reportes — attendance, unique members, check-in adoption, and engagement
 *  (Phase 117). Mirrors the Reportes route access (gestion + admin + owner).
 *  The financial/KPI/member analytics endpoints stay admin-only (ADMIN_ROLES). */
export const ANALYTICS_OPERATIONAL_ROLES = [
  "gestion",
  "admin",
  "owner",
] as const;

/** Roles that can view the simplified Deudas tab for coaches. Coach included
 *  on top of the Dueño core so professors can look up how much to collect from
 *  a member at the door without exposing the full financial detail surface
 *  (see FINANCE_READ_ROLES, which excludes coach for privacy).
 *
 *  Composed core + Templo override (D-06): the Dueño core (ADMIN_ROLES) plus
 *  the Templo `deudas` override. Order preserved so the effective value stays
 *  byte-identical to the historical `["coach", "gestion", "admin", "owner"]` —
 *  consumers (coach routes) are untouched. */
export const COACH_DEBTS_ROLES = [
  ...TEMPLO_RBAC_OVERRIDES.deudas,
  ...ADMIN_ROLES,
] as const;

/** Roles that can access attendance features (coach, admin, owner, gestion, recepcion). */
export const ATTENDANCE_ROLES = [
  "coach",
  "admin",
  "owner",
  "gestion",
  "recepcion",
] as const;

/** Roles that can access member management (coach, admin, owner, gestion, recepcion). */
export const MEMBER_ROLES = [
  "coach",
  "admin",
  "owner",
  "gestion",
  "recepcion",
] as const;

/** Roles that can access payment management. */
export const PAYMENT_ROLES = [
  "coach",
  "admin",
  "owner",
  "gestion",
  "recepcion",
] as const;

/** Roles that can access subscription management. */
export const SUBSCRIPTION_ROLES = [
  "coach",
  "admin",
  "owner",
  "gestion",
  "recepcion",
] as const;

/**
 * Roles that can WRITE subscription plans / promo plans (create, update,
 * deactivate, bulk-migrate) — the Dueño core only (owner + admin).
 *
 * Closes the D-11 privilege-escalation bug: the subscriptions plugin gates the
 * whole module with SUBSCRIPTION_ROLES (which includes coach, needed for the
 * PoS assign/renew/pause flows), so without a per-handler guard a coach could
 * create/edit/archive plans and promos by API. This set is applied per-handler
 * on the 7 write endpoints. NOT owner-only: admin is also "Dueño" (D-01).
 */
export const PLANES_WRITE_ROLES = ADMIN_ROLES;

/**
 * Roles that can READ subscription plans (GET /plans) — all staff. Planes is
 * read-only for the employee surface: a coach sees the plan catalog (to quote
 * prices) but cannot mutate it (D-11). = SUBSCRIPTION_ROLES.
 */
export const PLANES_READ_ROLES = SUBSCRIPTION_ROLES;

/**
 * Roles that can operate the admin CRUD of micro-programs (Programas) — the
 * Dueño core only (owner + admin).
 *
 * Closes the D-15/D-04 backdoor: the programs admin CRUD historically gated on
 * CAJA_ROLES (which includes gestion), but Programas is a Dueño-only training
 * surface — gestion must not create/edit/list/deactivate programs by API. This
 * set REPLACES the CAJA_ROLES check on the 7 admin CRUD handlers of the
 * programs module. Programas is a training surface that phase 156 will move to
 * the Templo layer; today it is owner + admin.
 */
export const PROGRAMAS_ROLES = ADMIN_ROLES;

/**
 * Roles that can READ the program catalog — GET /admin/programs (list) only —
 * = the administrative staff (owner + admin + gestion + recepcion), WITHOUT coach.
 *
 * Espeja en FORMA el par PLANES_WRITE_ROLES / PLANES_READ_ROLES (separar lectura
 * de escritura en el módulo) y en VALOR a FINANCE_WRITE_ROLES
 * (["owner","admin","gestion","recepcion"]). Se declara con literal (no la
 * referencia FINANCE_WRITE_ROLES) porque esa constante se declara MÁS ABAJO en
 * este archivo — usarla acá caería en la temporal dead zone; la equivalencia de
 * valor queda fijada por rbac-sets.test.ts.
 *
 * Por qué existe: angostar GET /admin/programs a dueño-only (Plan 01) rompió dos
 * consumidores frontend vivos que corren para staff no-dueño — la columna
 * "Programa" de `PlanesPage.vue` (Planes en modo lectura, abierto a todo el
 * staff en esta fase) y el diálogo `AssignProgramAddonDialog.vue`, cuyo POST de
 * asignación ya está permitido a gestion/recepcion vía FINANCE_WRITE_ROLES
 * (D-22). Reabrir el listado a ese mismo set deja el flujo consistente.
 *
 * Coach queda EXCLUIDO per D-10: Programas es una superficie de entrenamiento
 * que NO se le muestra al empleado-profe (la opción "todo incluido programas"
 * fue rechazada en la discusión de fase); coach tampoco puede asignar add-ons,
 * así que no tiene uso funcional del catálogo.
 *
 * La escritura/detalle/analytics/deactivate sigue dueño-only vía PROGRAMAS_ROLES
 * (D-15) — este set gatea ÚNICAMENTE el GET de listado.
 */
export const PROGRAMAS_LIST_ROLES = [
  "owner",
  "admin",
  "gestion",
  "recepcion",
] as const;

export type AdminRole = (typeof ALL_STAFF_ROLES)[number];

/** Roles that can create finance transactions of operational kinds
 *  (plan_charge, debt_settlement, refund, advance_payment) — Phase 106 D-02. */
export const FINANCE_WRITE_ROLES = [
  "owner",
  "admin",
  "gestion",
  "recepcion",
] as const;

/**
 * Roles that can use the coach LOAD endpoints (Phase 140 D-06): the dead-simple
 * PoS "Cargar pago" surface where coach renewals/standalone charges are born
 * PENDIENTE (validation_status derived server-side from the role, never the
 * body). = FINANCE_WRITE_ROLES + coach. This gates ONLY the load endpoints;
 * coach stays ABSENT from FINANCE_VOID_ROLES / FINANCE_ADJUSTMENT_ROLES /
 * FINANCE_READ_ROLES (no validating/observing/voiding, no caja balances —
 * D-06/D-08). Do NOT widen those three sets.
 */
export const FINANCE_LOAD_ROLES = [...FINANCE_WRITE_ROLES, "coach"] as const;

/** Roles that can create kind=adjustment (sensitive — Phase 106 D-01). */
export const FINANCE_ADJUSTMENT_ROLES = ["owner", "admin", "gestion"] as const;

/** Roles that can void a finance transaction (Phase 106 D-03 — recepcion excluded for abuse risk). */
export const FINANCE_VOID_ROLES = ["owner", "admin", "gestion"] as const;

/** Roles that can read finance transactions / financial history (Phase 106 D-04 — coach excluded for privacy). */
export const FINANCE_READ_ROLES = [
  "owner",
  "admin",
  "gestion",
  "recepcion",
] as const;

/** Roles that can soft-delete a member and reset member passwords. */
export const MEMBER_LIFECYCLE_ROLES = ["owner", "admin", "gestion"] as const;

/**
 * Roles that can operate the branch TV screen (Fase 164 D-01): vincular un
 * televisor a una sede, listarlos, revocarlos y manejar la botonera de clase.
 * = el core Dueño (ADMIN_ROLES) + coach, porque el profe es quien tiene el TV
 * enfrente durante la clase y quien lo vincula el día que lo cuelgan.
 *
 * Composición override → core igual que FINANCE_LOAD_ROLES: `[...ADMIN_ROLES,
 * "coach"]`. El valor efectivo es `["admin", "owner", "coach"]` y está fijado
 * byte a byte por `rbac-sets.test.ts`.
 *
 * ALCANCE: gatea ÚNICAMENTE el plugin `/api/admin/tv`. NO habilita ninguna otra
 * superficie — coach sigue AUSENTE de FINANCE_READ_ROLES, FINANCE_VOID_ROLES,
 * PROGRAMAS_LIST_ROLES, etc. No ensanchar este set para reusarlo en otro módulo:
 * si otro módulo necesita "dueño + coach", que declare el suyo.
 *
 * El acceso por SEDE no lo resuelve este set: lo impone `requireBranchAccess`
 * sobre `request.scope` (Rule 4 acota al coach a sus sedes operativas), así que
 * un coach de Moreno no puede vincular un TV de Jujuy aunque pase este guard.
 */
export const TV_CONTROL_ROLES = [...ADMIN_ROLES, "coach"] as const;
