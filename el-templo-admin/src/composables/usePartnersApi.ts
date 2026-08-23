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

// =========================================================================
// Reportes + liquidación (fase 179-10, D-08/D-16/D-20). Tipos espejo de
// ConversionRow / BenefitWithoutConversionRow (el-templo-api/src/modules/
// referral-partners/types.ts) — las fechas viajan como ISO string en el JSON
// (fastify serializa `Date` así), a diferencia del `Date` que declara el
// backend en TS.
// =========================================================================

/** Estado del vínculo `partner_referrals` (D-06/D-14). */
export type PartnerLinkStatus = 'pending' | 'qualified' | 'revoked';

/** Estado del beneficio canjeado por el socio (D-06/D-07). */
export type PartnerBenefitStatus = 'pending' | 'consumed' | 'expired';

/** Estado de la comisión asociada al vínculo (D-11/D-14/D-16). */
export type PartnerCommissionStatus = 'pending' | 'settled' | 'void';

/** Fila del reporte "conversiones por partner" — espejo de ConversionRow. */
export interface ConversionRow {
  linkId: number;
  referredId: number;
  referredName: string;
  partnerId: number;
  partnerName: string;
  partnerCode: string;
  status: PartnerLinkStatus;
  benefitType: PartnerBenefitType;
  benefitStatus: PartnerBenefitStatus;
  qualifiedAt: string | null;
  createdAt: string;
  commissionId: number | null;
  commissionStatus: PartnerCommissionStatus | null;
  commissionAmount: number | null;
  commissionCurrency: PartnerCurrency | null;
}

export interface ConversionFilters {
  partnerId?: number;
  status?: PartnerLinkStatus;
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
}

/**
 * Fila del reporte "beneficios de partner sin conversión" (D-08 reescrita)
 * — espejo de BenefitWithoutConversionRow. Seguimiento manual de la sede,
 * NO toca el funnel de leads v5.8.
 */
export interface BenefitWithoutConversionRow {
  linkId: number;
  referredId: number;
  referredName: string;
  referredPhone: string | null;
  partnerId: number;
  partnerName: string;
  benefitType: PartnerBenefitType;
  benefitStatus: PartnerBenefitStatus;
  motivo: 'semana_sin_conversion' | 'beneficio_vencido_sin_uso';
  fechaRelevante: string;
}

export interface BenefitsWithoutConversionFilters {
  partnerId?: number;
  branchId?: number;
}

/** Respuesta de POST /admin/referral-partners/:id/settle (D-16). */
export interface SettleCommissionsResult {
  count: number;
  totalAmount: number;
  currency: PartnerCurrency;
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
  // Reportes + liquidación (fase 179-13, D-08/D-16/D-20). Consumidos por
  // PartnerConversionsTable.vue, la sección "Beneficios sin conversión" de
  // PartnersPage.vue, y PartnerSettleDialog.vue.
  // =========================================================================

  async function listConversions(filters: ConversionFilters = {}): Promise<ConversionRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<ConversionRow[]>('/admin/referral-partners/conversions', {
        params: filters,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando las conversiones');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function listBenefitsWithoutConversion(
    filters: BenefitsWithoutConversionFilters = {}
  ): Promise<BenefitWithoutConversionRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<BenefitWithoutConversionRow[]>(
        '/admin/referral-partners/benefits-without-conversion',
        { params: filters }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando los beneficios sin conversión');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Liquidación batch por partner (D-16): marca TODAS las comisiones
   * `pending` de `partnerId` como `settled` en un acto. Idempotente — una
   * segunda llamada devuelve `{ count: 0 }`. Puede devolver 403
   * (`FINANCE_VOID_ROLES`, defensivo hoy — ver docblock de admin-routes.ts):
   * el caller (PartnerSettleDialog) lo maneja con un mensaje propio.
   */
  async function settleCommissions(partnerId: number): Promise<SettleCommissionsResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<SettleCommissionsResult>(
        `/admin/referral-partners/${partnerId}/settle`
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error liquidando las comisiones');
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
    listConversions,
    listBenefitsWithoutConversion,
    settleCommissions,
    getStoreUrls,
    updateStoreUrls,
    cleanup,
  };
}
