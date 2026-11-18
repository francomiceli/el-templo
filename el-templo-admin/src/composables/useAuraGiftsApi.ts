/**
 * Cliente de los regalos de Aura del staff (fase 215, planes 08 a 10 de la API).
 *
 * Mirrors el-templo-api/src/modules/aura/gift-schemas.ts. Los errores se propagan: quien llama
 * decide qué mostrar según el estado y el `code` (ver `giftErrorCode`). Códigos 409 posibles:
 * `REGALO_YA_DADO`, `REGALO_VENCIDO`, `REGALO_NO_DISPONIBLE` (dar) y `REGALO_YA_ANULADO` (anular).
 * Un 404 sin `code` significa módulo apagado, regalo inexistente o fuera de las sedes del usuario.
 */

import axios from 'axios';
import { api } from 'src/boot/axios';
import type { GiftReasonCode } from 'src/config/gift-reasons';

export type GiftGiverKind = 'alumno' | 'profe';

export type GiftStatus = 'vigente' | 'anulado';

export interface AdminGiftItem {
  id: number;
  /** YYYY-MM-DD de la clase. */
  sessionDate: string;
  startTime: string | null;
  giverName: string;
  giverKind: GiftGiverKind;
  receiverName: string;
  reason: GiftReasonCode;
  amount: number;
  status: GiftStatus;
  voidCause: string | null;
  voidedByName: string | null;
}

export interface GiftWeek {
  /** Lunes de la semana, YYYY-MM-DD. La semana actual viene primero. */
  weekStart: string;
  studentGifts: number;
  coachGifts: number;
  attendees: number;
  /** Porcentaje de asistentes que regalaron (0 a 100). */
  giversPct: number;
}

export interface AdminGiftsResponse {
  items: AdminGiftItem[];
  /** true si la lista se cortó en el tope y faltan los regalos más viejos. */
  truncated: boolean;
  weeks: GiftWeek[];
}

export interface GiftSettings {
  coachGiftAmount: number;
}

export interface ListGiftsParams {
  branchId?: number;
  days: 7 | 30 | 90;
  includeVoided: boolean;
}

/** Lee el `code` de un error de la API de regalos, o null si no es un error HTTP con código. */
export function giftErrorCode(err: unknown): string | null {
  if (!axios.isAxiosError(err)) return null;
  const data: unknown = err.response?.data;
  if (typeof data !== 'object' || data === null || !('code' in data)) return null;
  const code = (data as { code: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function useAuraGiftsApi() {
  async function giveAsCoach(
    attendanceId: number,
    reason: GiftReasonCode
  ): Promise<{ amount: number }> {
    const { data } = await api.post<{ amount: number }>('/admin/aura/gifts', {
      attendanceId,
      reason,
    });
    return data;
  }

  async function listGifts(params: ListGiftsParams): Promise<AdminGiftsResponse> {
    const query: Record<string, unknown> = {
      days: params.days,
      includeVoided: params.includeVoided,
    };
    if (params.branchId !== undefined) query.branchId = params.branchId;
    const { data } = await api.get<AdminGiftsResponse>('/admin/aura/gifts', { params: query });
    return data;
  }

  async function voidGift(id: number): Promise<void> {
    await api.post(`/admin/aura/gifts/${id}/void`);
  }

  async function getSettings(): Promise<GiftSettings> {
    const { data } = await api.get<GiftSettings>('/admin/aura/gift-settings');
    return data;
  }

  async function saveSettings(coachGiftAmount: number): Promise<GiftSettings> {
    const { data } = await api.put<GiftSettings>('/admin/aura/gift-settings', {
      coachGiftAmount,
    });
    return data;
  }

  return { giveAsCoach, listGifts, voidGift, getSettings, saveSettings };
}
