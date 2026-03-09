/**
 * Member types for the admin app.
 * Matches the API response shapes from the members module (Plan 47-01).
 */

export interface MemberListItem {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  dni: string | null;
  level: string;
  branchId: number;
  branchName: string;
  isActive: boolean;
  isOverdue: boolean;
  createdAt: string;
}

export interface MemberProfile extends MemberListItem {
  dateOfBirth: string | null;
  gender: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  role: string;
  updatedAt: string;
}

export interface CreateMemberInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  dni: string;
  branchId: number;
  level?: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
}

export interface UpdateMemberInput {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  dni?: string | null;
  branchId?: number;
  level?: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
}

export interface MemberListParams {
  search?: string;
  branchId?: number;
  level?: string;
  isActive?: boolean;
  overdue?: boolean;
  page?: number;
  limit?: number;
}

export interface DniCheckResult {
  available: boolean;
  existingMemberName?: string;
}

export interface MemberNote {
  id: number;
  userId: number;
  authorId: number;
  authorName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteInput {
  content: string;
}

export interface UpdateNoteInput {
  content: string;
}

export interface BranchOption {
  id: number;
  name: string;
}
