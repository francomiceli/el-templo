export type AdminRole = 'coach' | 'admin' | 'superadmin';

export interface AdminUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: AdminRole;
  branchId: number;
}

export type SessionStatus = 'pending_review' | 'approved' | 'discarded';
