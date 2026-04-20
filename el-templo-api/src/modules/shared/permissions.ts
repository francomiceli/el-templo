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

/** Roles that can access caja and reportes (gestion, admin, owner). */
export const CAJA_ROLES = ["gestion", "admin", "owner"] as const;

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
