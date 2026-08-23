/**
 * Referral Partners API composable (admin, fase 179 D-20).
 *
 * Powers /partners: CRUD de comercios partner (código/QR en tarjeta física,
 * beneficio configurable, comisión fija por membresía confirmada). Mirrors
 * the shape of useImprovementProposalsApi (loading/error refs, extractError,
 * `throw err` in catch, `finally`). El enforcement de roles
 * (MEMBER_LIFECYCLE_ROLES) y la resolución del tenant viven server-side —
 * ver el-templo-api/src/modules/referral-partners/admin-routes.ts.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';

/** Espeja PartnerBenefitType del API (D-05/D-09). */
export type PartnerBenefitType = 'discount_percent' | 'free_pass';

/** Espeja PartnerCommissionType del API (D-11). */
export type PartnerCommissionType = 'none' | 'fixed';

/** Moneda derivada de la sede del partner (D-13), nunca elegida a mano. */
export type PartnerCurrency = 'ARS' | 'EUR';

/**
 * Fila que consume la tabla de /partners: el partner + los agregados de
 * vínculos/comisiones resueltos server-side (sin N+1).
 */
export interface PartnerListItem {
  id: number;
  name: string;
  code: string;
  branchId: number;
  branchName: string;
  country: string;
  benefitType: PartnerBenefitType;
  benefitValue: number;
  commissionType: PartnerCommissionType;
  commissionValue: number;
  currency: PartnerCurrency;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  vinculosTotal: number;
  vinculosQualified: number;
  comisionesPendientes: number;
  montoPendiente: number;
}

export interface PartnerListFilters {
  branchId?: number;
  isActive?: boolean;
}

/** Espeja la respuesta de GET/PUT /admin/settings/store-urls (fase 179-12, D-20). */
export interface StoreUrls {
  android: string | null;
  ios: string | null;
}

/**
 * Payload de creación. `currency` NO forma parte del input: el server la
 * deriva de `branches.country` (D-13). `code` se normaliza server-side.
 */
export interface CreatePartnerInput {
  name: string;
  code: string;
  branchId: number;
  benefitType: PartnerBenefitType;
  benefitValue: number;
  commissionType: PartnerCommissionType;
  commissionValue: number;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
}

/**
 * Payload de edición. `code` deliberadamente ausente: no es editable (hay
 * tarjetas impresas circulando) — el server ni siquiera lo lista en su
 * schema de PATCH.
 */
export interface UpdatePartnerInput {
  name?: string;
  benefitType?: PartnerBenefitType;
  benefitValue?: number;
  commissionType?: PartnerCommissionType;
  commissionValue?: number;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export function usePartnersApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function listPartners(filters: PartnerListFilters = {}): Promise<PartnerListItem[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PartnerListItem[]>('/admin/referral-partners', {
        params: filters,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando los partners');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getPartner(id: number): Promise<PartnerListItem> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PartnerListItem>(`/admin/referral-partners/${id}`);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando el partner');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createPartner(input: CreatePartnerInput): Promise<{ id: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ id: number }>('/admin/referral-partners', input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando el partner');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updatePartner(id: number, input: UpdatePartnerInput): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.patch(`/admin/referral-partners/${id}`, input);
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando el partner');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // =========================================================================
  // URLs de tienda (fase 179-12, D-01/D-04/D-20). Fuente que consume
  // PartnerQrDialog.vue antes de generar los PNG — el endpoint vive en el
  // módulo settings del API, no en referral-partners.
  // =========================================================================

  async function getStoreUrls(): Promise<StoreUrls> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<StoreUrls>('/admin/settings/store-urls');
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando las URLs de tienda');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateStoreUrls(input: { android?: string; ios?: string }): Promise<StoreUrls> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<StoreUrls>('/admin/settings/store-urls', input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando las URLs de tienda');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    // No subscriptions or timers to clean up
  }

  return {
    loading,
    error,
    listPartners,
    getPartner,
    createPartner,
    updatePartner,
    getStoreUrls,
    updateStoreUrls,
    cleanup,
  };
}
