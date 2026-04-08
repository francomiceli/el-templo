export interface StaffUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  branchId: number;
  branchName: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface CreateStaffInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: "coach" | "admin" | "owner" | "gestion";
  branchId: number;
}

export interface UpdateStaffInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: "coach" | "admin" | "owner" | "gestion";
  branchId?: number;
}
