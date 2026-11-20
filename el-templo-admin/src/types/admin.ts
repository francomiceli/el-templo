// `admin_sede` (2026-09-08, API mig 0225): admin_sede de UNA sucursal. Ve la misma
// superficie que `gestion` (Alumnos, Caja, Cobros, Reportes/SP/Leads) pero
// SOLO de las sedes que tiene asignadas — el recorte real lo hace el API
// (`enforcedBranchIds`); acá sólo se evita ofrecerle lo que le va a dar 403.
// `coach_actividad` (2026-10-06, API mig 0258): profe de actividad (yoga) con la
// superficie de un coach pero SIN plata — ver `isFinanceBlindRole`.
export type AdminRole =
  | 'gestion'
  | 'coach'
  | 'admin'
  | 'owner'
  | 'recepcion'
  | 'tv'
  | 'admin_sede'
  | 'coach_actividad';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    allowedRoles?: AdminRole[];
    // Entrenamiento surface: beyond allowedRoles, only owner or the exclusive
    // training coach may enter (see canAccessTraining / router guard).
    trainingOnly?: boolean;
  }
}

export interface AdminUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: AdminRole;
  branchId: number;
  /**
   * Aura ganada que devuelve `GET /auth/me` (el login no la trae). `null` = el módulo de Aura del
   * gimnasio está apagado (o la lectura falló): es la misma señal "Aura prendida" que usa la app.
   */
  auraEarned?: number | null;
}

export type SessionStatus = 'pending_review' | 'approved';
