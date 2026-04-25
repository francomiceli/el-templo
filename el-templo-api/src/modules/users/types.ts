export interface StaffUser {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  branchId: number;
  branchName: string | null;
  // Phase 103-06 (R11): replaces legacy `isActive`. `staffDisabled=true`
  // means the staff member is deactivated (login gate added in Plan 07).
  staffDisabled: boolean;
  createdAt: Date;
}

export interface CreateStaffInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: "coach" | "admin" | "owner" | "gestion" | "recepcion";
  branchId: number;
}

export interface UpdateStaffInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: "coach" | "admin" | "owner" | "gestion" | "recepcion";
  branchId?: number;
}
