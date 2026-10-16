/**
 * Patrocinadores (Fase 199, D-18..D-26): cliente tipado de /admin/sponsors.
 *
 * Los tipos espejan EXACTAMENTE los schemas de respuesta de
 * el-templo-api/src/modules/sponsors/schemas.ts (SponsorAdminItem y bodies de
 * alta/edición/settings). El gate real ("solo El Templo") vive en el server:
 * quien no es admin de El Templo recibe 403 (`isForbidden`).
 */

import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import { createLogger } from 'src/utils/logger';
import { useImageUpload } from 'src/composables/useImageUpload';

const log = createLogger('useSponsorsApi');

const SPONSORS_BASE = '/admin/sponsors';
const LOGO_UPLOAD_ENDPOINT = '/admin/sponsors/logo-upload-url';

export type SponsorCountry = 'AR' | 'ES';
export type SponsorRedeemType = 'code' | 'carnet';

/** Espeja SponsorAdminItem del API: marca + métricas (D-25). Fechas `YYYY-MM-DD` | null. */
export interface AdminSponsor {
  id: number;
  name: string;
  category: string;
  logoUrl: string | null;
  icon: string | null;
  bgColor: string;
  textColor: string;
  benefit: string;
  detail: string;
  conditions: string | null;
  redeemType: SponsorRedeemType;
  redeemCode: string | null;
  countries: SponsorCountry[];
  startsOn: string | null;
  endsOn: string | null;
  isActive: boolean;
  sortOrder: number;
  partnerId: number | null;
  views: number;
  taps: number;
  redeems: number;
  createdAt: string;
  updatedAt: string;
}

/** Campos editables de una marca (cuerpo de alta; espeja CreateSponsorBody con todo explícito). */
export interface SponsorFormInput {
  name: string;
  category: string;
  logoUrl: string | null;
  icon: string | null;
  bgColor: string;
  textColor: string;
  benefit: string;
  detail: string;
  conditions: string | null;
  redeemType: SponsorRedeemType;
  redeemCode: string | null;
  countries: SponsorCountry[];
  startsOn: string | null;
  endsOn: string | null;
  isActive: boolean;
  sortOrder: number;
  partnerId: number | null;
}

/** Cuerpo de alta: `sortOrder` es opcional (sin él el API deja la marca al final, max + 1). */
export type CreateSponsorInput = Omit<SponsorFormInput, 'sortOrder'> & { sortOrder?: number };

/** PUT parcial (el API exige al menos una propiedad). */
export type UpdateSponsorInput = Partial<SponsorFormInput>;

export interface SponsorsListResult {
  sponsors: AdminSponsor[];
  maxActivePerCountry: number;
}

/** true si el error es un 403 de axios (el usuario no es admin de El Templo). */
export function isForbidden(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 403;
}

export function useSponsorsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const { uploading: uploadingLogo, uploadImage } = useImageUpload();

  async function list(): Promise<SponsorsListResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<SponsorsListResult>(SPONSORS_BASE);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando los patrocinadores');
      log.error('list failed', { error: error.value });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function create(input: CreateSponsorInput): Promise<AdminSponsor> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ sponsor: AdminSponsor }>(SPONSORS_BASE, input);
      return data.sponsor;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando el patrocinador');
      log.error('create failed', { error: error.value });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function update(id: number, input: UpdateSponsorInput): Promise<AdminSponsor> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<{ sponsor: AdminSponsor }>(`${SPONSORS_BASE}/${id}`, input);
      return data.sponsor;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando el patrocinador');
      log.error('update failed', { id, error: error.value });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function remove(id: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.delete<{ success: boolean }>(`${SPONSORS_BASE}/${id}`);
    } catch (err: unknown) {
      error.value = extractError(err, 'Error eliminando el patrocinador');
      log.error('remove failed', { id, error: error.value });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getSettings(): Promise<{ maxActivePerCountry: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ maxActivePerCountry: number }>(`${SPONSORS_BASE}/settings`);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando la configuración de patrocinadores');
      log.error('getSettings failed', { error: error.value });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateSettings(
    maxActivePerCountry: number
  ): Promise<{ maxActivePerCountry: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<{ maxActivePerCountry: number }>(`${SPONSORS_BASE}/settings`, {
        maxActivePerCountry,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error guardando el límite de patrocinadores');
      log.error('updateSettings failed', { error: error.value });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Sube el logo a R2 (URL prefirmada) y devuelve la URL pública. 503 si el R2 no está configurado. */
  async function uploadLogo(file: File): Promise<string> {
    error.value = null;
    try {
      return await uploadImage(file, LOGO_UPLOAD_ENDPOINT);
    } catch (err: unknown) {
      error.value = extractError(err, 'Error subiendo el logo');
      throw err;
    }
  }

  return {
    loading,
    error,
    uploadingLogo,
    list,
    create,
    update,
    remove,
    getSettings,
    updateSettings,
    uploadLogo,
    isForbidden,
  };
}
