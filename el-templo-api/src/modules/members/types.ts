/**
 * Members Module Types
 *
 * Interfaces for member CRUD operations, profile management,
 * and internal notes system.
 */

export type DocumentType = "DNI" | "Pasaporte" | "NIE" | "NIF" | "Otro";

export interface MemberListParams {
  search?: string;
  branchId?: number;
  multiBranch?: boolean;
  level?: string;
  isActive?: boolean;
  overdue?: boolean;
  planId?: number;
  page: number;
  limit: number;
}

export interface MemberListItem {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  dni: string | null;
  documentType: string | null;
  level: string;
  branchId: number;
  branchName: string;
  isActive: boolean;
  isOverdue: boolean;
  planName: string | null;
  createdAt: string;
}

export interface MemberProfile {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  dni: string | null;
  documentType: string | null;
  address: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  role: string;
  level: string;
  branchId: number;
  branchName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemberInput {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dni: string;
  branchId: number;
  planId: number;
  level?: string;
  documentType?: string;
  address?: string;
  dateOfBirth?: string;
  gender?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
}

export interface UpdateMemberInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  dni?: string;
  documentType?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  branchId?: number;
  level?: string;
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
  userId: number;
  content: string;
}

export interface UpdateNoteInput {
  content: string;
}

export interface DniCheckResult {
  available: boolean;
  existingMemberName?: string;
}
