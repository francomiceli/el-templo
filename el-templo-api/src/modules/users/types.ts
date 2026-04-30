/**
 * Phase 110 REQ-9 / REQ-11: country (admin/gestion) and branchIds (coach/recepción)
 * are the new staff-scope dimensions. country=null is valid for owner (global)
 * and is the only acceptable value for member rows (members are not editable
 * via this module).
 *
 * REQ-9 4 rejection rules enforced server-side (validateStaffCardinality):
 *   - admin/gestion without country
 *   - coach/recepción with empty branchIds
 *   - member with non-empty branchIds (defense-in-depth)
 *   - owner with country
 */

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
  // Phase 110 REQ-1: country of management. NULL for owner / coach / recepción.
  country: "AR" | "ES" | null;
  // Phase 110 REQ-2: operational branch ids (coach/recepción only).
  // Empty array for admin / gestion / owner / member.
  branchIds: number[];
  createdAt: Date;
}

export interface CreateStaffInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: "coach" | "admin" | "owner" | "gestion" | "recepcion";
  branchId: number;
  // Phase 110: required for admin / gestion (validated in service).
  country?: "AR" | "ES" | null;
  // Phase 110: required (≥ 1) for coach / recepción (validated in service).
  // MUST be empty/absent for admin / gestion / owner / member (REQ-9 rule 4 for member).
  branchIds?: number[];
}

export interface UpdateStaffInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: "coach" | "admin" | "owner" | "gestion" | "recepcion";
  branchId?: number;
  country?: "AR" | "ES" | null;
  branchIds?: number[];
}
