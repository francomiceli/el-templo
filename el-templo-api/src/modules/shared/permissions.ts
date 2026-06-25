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

/** Roles that can access caja and reportes (gestion, admin, owner). */
export const CAJA_ROLES = ["gestion", "admin", "owner"] as const;

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
 *  on top of CAJA_ROLES so professors can look up how much to collect from a
 *  member at the door without exposing the full financial detail surface
 *  (see FINANCE_READ_ROLES, which excludes coach for privacy). */
export const COACH_DEBTS_ROLES = [
  "coach",
  "gestion",
  "admin",
  "owner",
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

export type AdminRole = (typeof ALL_STAFF_ROLES)[number];

/** Roles that can create finance transactions of operational kinds
 *  (plan_charge, debt_settlement, refund, advance_payment) — Phase 106 D-02. */
export const FINANCE_WRITE_ROLES = [
  "owner",
  "admin",
  "gestion",
  "recepcion",
] as const;

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
