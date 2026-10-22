// Módulo: conquer — permisos (Fase 201 D-08)
//
// UN SOLO HELPER. Hoy Conquer lo manejan únicamente `owner` y `admin`
// (activan alumnos, ven el tablero y las fichas, aceptan recortes y pasos de
// nivel). Más adelante se abre a los `coach`: para que eso sea barato, el
// alumno ya guarda su `coach_user_id` (conquer_members) y TODA ruta pregunta
// acá. Abrir a coach = sumar "coach" a CONQUER_MANAGER_ROLES y comparar
// `member.coachUserId === user.userId` dentro de `canManageConquer`; ningún
// call-site cambia.
//
// Sin imports de DB: el módulo se puede importar desde tests unitarios.

/** Roles que manejan Conquer hoy (D-08). */
export const CONQUER_MANAGER_ROLES = ["owner", "admin"] as const;

/**
 * ¿Puede este usuario manejar Conquer? `member` (opcional) es el alumno sobre
 * el que opera: hoy se ignora, queda en la firma para la apertura a coach.
 */
export function canManageConquer(
  user: { role: string; userId: number },
  member?: { coachUserId: number | null },
): boolean {
  // `member` sin uso a propósito (D-08): ver el docblock del archivo.
  void member;
  return (CONQUER_MANAGER_ROLES as readonly string[]).includes(user.role);
}

/**
 * Fotos del control físico (§6, D-08): por ahora las ven owner y admin. El
 * alumno dueño de las fotos se resuelve aparte, por `userId`.
 */
export const canViewConquerPhotos = canManageConquer;
