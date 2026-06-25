import type { AdminUser } from 'src/types/admin';

/**
 * Email of the single coach allowed into the Entrenamiento admin surface
 * (Sesiones, Programador, Ejercicios, Árbol). Identified by email rather than
 * user.id because the email is stable across environments — it is seeded
 * literally by migration 0017, whereas the numeric id depends on row insert
 * order and differs between local / staging / prod. Mirrors the backend
 * TRAINING_EXCLUSIVE_COACH_EMAIL in el-templo-api/src/modules/shared/permissions.ts.
 */
export const TRAINING_EXCLUSIVE_COACH_EMAIL = 'Scaine7@hotmail.com';

/**
 * Whether a user may see/enter the Entrenamiento surface. Owners always retain
 * full access; among coaches, only the exclusive training coach is allowed.
 */
export function canAccessTraining(
  user: Pick<AdminUser, 'role' | 'email'> | null | undefined
): boolean {
  if (!user) return false;
  if (user.role === 'owner') return true;
  return !!user.email && user.email.toLowerCase() === TRAINING_EXCLUSIVE_COACH_EMAIL.toLowerCase();
}
