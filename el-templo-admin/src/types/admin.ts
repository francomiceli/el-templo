// `inversor` (2026-09-08, API mig 0225): inversor de UNA sucursal. Ve la misma
// superficie que `gestion` (Alumnos, Caja, Cobros, Reportes/SP/Leads) pero
// SOLO de las sedes que tiene asignadas — el recorte real lo hace el API
// (`enforcedBranchIds`); acá sólo se evita ofrecerle lo que le va a dar 403.
export type AdminRole = 'gestion' | 'coach' | 'admin' | 'owner' | 'recepcion' | 'tv' | 'inversor';

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
}

export type SessionStatus = 'pending_review' | 'approved';
