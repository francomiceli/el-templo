export type AdminRole = 'gestion' | 'coach' | 'admin' | 'owner' | 'recepcion';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    allowedRoles?: AdminRole[];
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
