export type AdminRole = 'gestion' | 'coach' | 'admin' | 'owner' | 'recepcion';

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
