/**
 * Cliente de la revisión de fotos de perfil (fase 214, plan 15 de la API).
 *
 * Mirrors el-templo-api/src/modules/members/profile-photo-schemas.ts. Los errores
 * (404 si la foto ya no está en la cola, 503 sin almacenamiento) los maneja quien llama.
 */

import { api } from 'src/boot/axios';

export type PhotoRejectionReason = 'sin_cara' | 'no_es_propia' | 'contenido' | 'otro';

export type ProfilePhotoOrigin = 'alumno' | 'ficha';

export type ProfilePhotoStatus = 'pendiente' | 'aprobada';

export interface ProfilePhotoQueueItem {
  photoId: number;
  userId: number;
  firstName: string | null;
  lastName: string | null;
  branchId: number | null;
  origin: ProfilePhotoOrigin;
  status: ProfilePhotoStatus;
  reportCount: number;
  lastReportedAt: string | null;
  uploadedAt: string;
  /** URL firmada (2 h). */
  url: string;
}

export interface ProfilePhotoQueueCounts {
  pending: number;
  reported: number;
}

export interface ProfilePhotoQueue {
  items: ProfilePhotoQueueItem[];
  counts: ProfilePhotoQueueCounts;
}

export interface ApproveProfilePhotoResult {
  status: 'aprobada';
  auraAwarded: boolean;
}

export interface RejectProfilePhotoResult {
  status: 'rechazada';
}

export function useProfilePhotosApi() {
  async function listQueue(): Promise<ProfilePhotoQueue> {
    const { data } = await api.get<ProfilePhotoQueue>('/admin/members/profile-photos');
    return data;
  }

  async function approve(userId: number): Promise<ApproveProfilePhotoResult> {
    const { data } = await api.post<ApproveProfilePhotoResult>(
      `/admin/members/${userId}/profile-photo/approve`
    );
    return data;
  }

  async function reject(
    userId: number,
    reason: PhotoRejectionReason
  ): Promise<RejectProfilePhotoResult> {
    const { data } = await api.post<RejectProfilePhotoResult>(
      `/admin/members/${userId}/profile-photo/reject`,
      { reason }
    );
    return data;
  }

  async function remove(userId: number): Promise<void> {
    await api.delete(`/admin/members/${userId}/profile-photo`);
  }

  return { listQueue, approve, reject, remove };
}
