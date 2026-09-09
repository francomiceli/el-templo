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
  // 2026-09-08 (migración 0225): el inversor de sucursal entra al admin como
  // cualquier otro empleado. Su alcance NO lo da este set sino `user_branches`
  // + `enforcedBranchIds` (shared/branch-access.ts). Ver INVERSOR_ROLE abajo.
  "inversor",
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
 * - `reportes`: extra roles (beyond Dueño) that see Reportes/Caja → gestion +
 *   inversor (2026-09-08: el inversor de sucursal ve la caja de SU sede — el
 *   recorte por sede lo hace `enforcedBranchIds`, no este set).
 * - `deudas`: extra roles (beyond Dueño) that see the simplified Deudas tab →
 *   coach + gestion + inversor (coach so profes can look up what to collect at
 *   the door).
 */
export const TEMPLO_RBAC_OVERRIDES = {
  reportes: ["gestion", "inversor"],
  deudas: ["coach", "gestion", "inversor"],
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
 *  The financial/KPI/member analytics endpoints stay admin-only
 *  (ANALYTICS_ADMIN_ROLES, below). */
export const ANALYTICS_OPERATIONAL_ROLES = [
  "gestion",
  "admin",
  "owner",
  "inversor",
] as const;

/**
 * Roles that can read the admin-only analytics endpoints (KPIs, member
 * analytics, financial analytics, retention/churn/ltv/etc.) — Dueño (ADMIN_ROLES)
 * + `inversor` (2026-09-08, feedback UAT). El inversor las ve, pero SIEMPRE
 * acotadas a SU sede: todas esas rutas ya encadenan `enforceBranchScope` (D-14),
 * así que ensanchar este set no le abre datos de otra sucursal, solo la
 * pantalla de Analíticas de la suya. `gestion` sigue afuera — literal en vez de
 * `[...ADMIN_ROLES, "inversor"]` sería equivalente en valor, pero se declara
 * explícito para que quede fijado byte a byte por `rbac-sets.test.ts` igual
 * que el resto de los sets nuevos del rol.
 */
export const ANALYTICS_ADMIN_ROLES = ["admin", "owner", "inversor"] as const;

/**
 * Roles que ven los resultados agregados del A/B test de copy de referidos
 * (`GET /admin/referrals/ab-results`) — 2026-09-09. Superficie SIN dimensión de
 * sede (números de TODO el gimnasio, no filtrables por branch): el inversor
 * queda afuera a propósito, a diferencia de `ANALYTICS_OPERATIONAL_ROLES` (del
 * que este set se separa) — no hay `enforceBranchScope` que lo acote y mostrarle
 * el agregado global violaría el alcance por sede del rol.
 */
export const REFERRAL_AB_RESULTS_ROLES = ["gestion", "admin", "owner"] as const;

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

/** Roles that can access attendance features (coach, admin, owner, gestion, recepcion, inversor). */
export const ATTENDANCE_ROLES = [
  "coach",
  "admin",
  "owner",
  "gestion",
  "recepcion",
  "inversor",
] as const;

/** Roles that can access member management (coach, admin, owner, gestion, recepcion, inversor). */
export const MEMBER_ROLES = [
  "coach",
  "admin",
  "owner",
  "gestion",
  "recepcion",
  "inversor",
] as const;

/** Roles that can access payment management. */
export const PAYMENT_ROLES = [
  "coach",
  "admin",
  "owner",
  "gestion",
  "recepcion",
  "inversor",
] as const;

/** Roles that can access subscription management. */
export const SUBSCRIPTION_ROLES = [
  "coach",
  "admin",
  "owner",
  "gestion",
  "recepcion",
  "inversor",
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
 * este archivo — usarla acá caería en la temporal dead zone; el valor queda
 * fijado por rbac-sets.test.ts. (2026-09-08: la equivalencia de valor con
 * FINANCE_WRITE_ROLES se ROMPIÓ a propósito — `inversor` entra en finanzas pero
 * NO en Programas, que es superficie de dueño.)
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
  "inversor",
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
export const FINANCE_ADJUSTMENT_ROLES = [
  "owner",
  "admin",
  "gestion",
  "inversor",
] as const;

/** Roles that can void a finance transaction (Phase 106 D-03 — recepcion excluded for abuse risk). */
export const FINANCE_VOID_ROLES = [
  "owner",
  "admin",
  "gestion",
  "inversor",
] as const;

/** Roles that can read finance transactions / financial history (Phase 106 D-04 — coach excluded for privacy). */
export const FINANCE_READ_ROLES = [
  "owner",
  "admin",
  "gestion",
  "recepcion",
  "inversor",
] as const;

/** Roles that can soft-delete a member and reset member passwords. */
export const MEMBER_LIFECYCLE_ROLES = [
  "owner",
  "admin",
  "gestion",
  "inversor",
] as const;

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
export const TV_CONTROL_ROLES = [...ADMIN_ROLES, "coach", "tv"] as const;

/**
 * Rol de la cuenta dedicada de los televisores (2026-09-07, migración 0222).
 *
 * Nació de un incidente: las pantallas de dos sedes estaban logueadas con la
 * cuenta de un coach y, al editarle las sedes desde Usuarios, `user_branches`
 * se reescribió y el poll pasó a 403 (`BRANCH_OUT_OF_SCOPE`) sin que la
 * pantalla avisara. Con este rol:
 *   - entra SOLO a `/api/admin/tv` (`TV_CONTROL_ROLES`), a nada más — NO está
 *     en ALL_STAFF_ROLES ni en MEMBER_ROLES a propósito;
 *   - `canAccessBranch` (Regla 2b) le da todas las sedes reales del gimnasio
 *     sin mirar `user_branches`, así que cambiar sedes/horarios de profes no
 *     lo toca;
 *   - la lista de sedes la saca de `GET /api/admin/tv/branches`, no del módulo
 *     de socios.
 */
export const TV_ACCOUNT_ROLE = "tv" as const;

/**
 * Rol del inversor de sucursal (2026-09-08, migración 0225).
 *
 * Un inversor activo de UNA sede que hace gestión administrativa + financiera
 * de SUS sedes: caja (saldos, movimientos, retiros, bandeja pendiente), cobros,
 * alumnos, sesiones de prueba y leads. Hereda la superficie de `gestion` (está
 * en todos los sets donde está `gestion`, salvo los que excluyen a gestión a
 * propósito: CHECKIN_ROSTER_ROLES, STAFF_ATTENDANCE_ROLES, TV_CONTROL_ROLES, y
 * los de Programas/Entrenamiento, que son superficie de dueño).
 *
 * Lo que lo hace distinto de `gestion` NO es este set sino el ALCANCE:
 *   - `attachScope` le carga `branchIds` desde `user_branches` (igual que
 *     coach/recepción), no `users.country`;
 *   - `canAccessBranch` lo resuelve por la Regla 4 (sede ∈ branchIds);
 *   - `enforcedBranchIds` (shared/branch-access.ts) FUERZA el filtro por sede
 *     en los listados y agregados: pedir otra sede es 403 y omitir la sede
 *     filtra a las suyas, en vez de degenerar a "todo el país" como pasa hoy
 *     con coach/recepción (gap preexistente que este rol NO cambia).
 */
export const INVERSOR_ROLE = "inversor" as const;

/**
 * Roles que ven el "Registro del día" del alumno (energía/sueño/molestias) en la
 * lista de asistencia y en la card de Horarios (2026-08-13): el core Dueño
 * (ADMIN_ROLES) + coach, porque el profe es quien tiene la clase enfrente y
 * ajusta el entrenamiento según cómo llegó cada uno.
 *
 * Valor efectivo `["admin", "owner", "coach"]`, fijado byte a byte por
 * `rbac-sets.test.ts`. Deliberadamente EXCLUYE gestion/recepcion: el check-in es
 * dato de salud autorreportado con nombre y apellido, y la vista de Feedback lo
 * mantiene dueño-only. Coincide en VALOR con TV_CONTROL_ROLES, pero se declara
 * aparte a propósito (misma regla que ahí: "si otro módulo necesita dueño +
 * coach, que declare el suyo") para que ensanchar uno no ensanche el otro.
 */
export const CHECKIN_ROSTER_ROLES = [...ADMIN_ROLES, "coach"] as const;

/**
 * Roles que pueden abrir/cerrar su propia jornada laboral (check-in/check-out
 * de staff, 2026-09-07): el core Dueño (ADMIN_ROLES) + coach + recepcion —
 * el personal que efectivamente trabaja en piso y tiene que fichar
 * entrada/salida.
 *
 * EXCLUYE a propósito `gestion` (decisión de Franco 2026-09-07: no ve
 * Check-in "en absoluto"), `tv` (la cuenta dedicada de los televisores, D-01
 * de TV_CONTROL_ROLES — una pantalla de pared no ficha jornada) y `member`
 * (un socio no es staff). Se declara como literal (no compone sobre otro set)
 * porque es el único módulo que necesita exactamente esta combinación de
 * roles — ensanchar ATTENDANCE_ROLES o MEMBER_ROLES para este caso los
 * acoplaría a un módulo que no tienen por qué conocer.
 */
export const STAFF_ATTENDANCE_ROLES = [
  "coach",
  "recepcion",
  "admin",
  "owner",
] as const;

/**
 * Roles que pueden ver el registro de jornadas de TODO el staff
 * (`GET /api/admin/staff-attendance/shifts`) — solo el core Dueño
 * (ADMIN_ROLES): es información de gestión del negocio. Subconjunto de
 * STAFF_ATTENDANCE_ROLES: coach y recepcion pueden fichar su propia jornada
 * pero NO ven el registro ajeno (mismo criterio de privacidad que
 * FINANCE_READ_ROLES vs FINANCE_LOAD_ROLES). Se declara aparte de ADMIN_ROLES
 * para que ensanchar uno no ensanche el otro.
 */
export const STAFF_ATTENDANCE_REPORT_ROLES = ["admin", "owner"] as const;
