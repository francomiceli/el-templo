<template>
  <q-page class="q-pa-md">
    <!-- ================================================================== -->
    <!-- Page Header -->
    <!-- ================================================================== -->
    <div class="text-h5 q-mb-md">Partners</div>

    <!-- ================================================================== -->
    <!-- Global Filters: Country (owner only) + Branch (calcado ReportesPage) -->
    <!-- ================================================================== -->
    <div class="row items-center q-gutter-sm q-mb-md">
      <div v-if="isOwner" class="col-auto" style="min-width: 180px">
        <q-select
          v-model="selectedCountry"
          :options="countryOptions"
          label="Pais"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onCountryChange"
        />
      </div>
      <div class="col-12 col-sm-3">
        <q-select
          v-model="selectedBranchId"
          :options="branchOptions"
          :display-value="selectedBranchLabel"
          label="Sucursal"
          dense
          outlined
          emit-value
          map-options
          :loading="loadingBranches"
          @update:model-value="onBranchChange"
        />
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- Tabs: Partners, Conversiones, Liquidación -->
    <!-- ================================================================== -->
    <q-tabs
      v-model="activeTab"
      dense
      align="left"
      class="q-mb-md"
      active-color="primary"
      indicator-color="primary"
    >
      <q-tab name="partners" label="Partners" />
      <q-tab name="conversiones" label="Conversiones" />
      <q-tab name="liquidacion" label="Liquidación" />
    </q-tabs>

    <q-tab-panels v-model="activeTab" animated>
      <q-tab-panel name="partners">
        <div class="row items-center q-mb-md">
          <div class="col" />
          <q-btn icon="add" label="Nuevo partner" color="primary" @click="openCreateDialog" />
        </div>

        <q-table
          :rows="filteredPartners"
          :columns="partnerColumns"
          row-key="id"
          :loading="partnersApi.loading.value"
          :pagination="{ rowsPerPage: 50 }"
          :rows-per-page-options="[20, 50, 100]"
          flat
          bordered
        >
          <!-- Beneficio column -->
          <template #body-cell-beneficio="props">
            <q-td :props="props">
              {{ benefitLabel(props.row) }}
            </q-td>
          </template>

          <!-- Comisión column -->
          <template #body-cell-comision="props">
            <q-td :props="props">
              {{ commissionLabel(props.row) }}
            </q-td>
          </template>

          <!-- Vínculos column -->
          <template #body-cell-vinculos="props">
            <q-td :props="props"> {{ props.row.vinculosQualified }}/{{ props.row.vinculosTotal }} </q-td>
          </template>

          <!-- Comisiones pendientes column -->
          <template #body-cell-comisionesPendientes="props">
            <q-td :props="props">
              <template v-if="props.row.comisionesPendientes > 0">
                {{ props.row.comisionesPendientes }} ({{
                  formatPrice(props.row.montoPendiente, props.row.currency)
                }})
              </template>
              <span v-else class="text-grey-5">—</span>
            </q-td>
          </template>

          <!-- Estado column -->
          <template #body-cell-estado="props">
            <q-td :props="props">
              <q-badge
                :color="props.row.isActive ? 'positive' : 'grey'"
                :label="props.row.isActive ? 'Activo' : 'Inactivo'"
              />
            </q-td>
          </template>

          <!-- Actions column -->
          <template #body-cell-acciones="props">
            <q-td :props="props">
              <q-btn
                flat
                dense
                round
                icon="edit"
                color="primary"
                @click="openEditDialog(props.row)"
              >
                <q-tooltip>Editar</q-tooltip>
              </q-btn>
              <q-btn
                flat
                dense
                round
                icon="qr_code"
                color="primary"
                @click="openQrDialog(props.row)"
              >
                <q-tooltip>QR</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>

        <PartnerFormDialog v-model="showFormDialog" :partner="editingPartner" @saved="onPartnerSaved" />
        <PartnerQrDialog v-model="showQrDialog" :partner="qrPartner" />
      </q-tab-panel>

      <!-- ================================================================ -->
      <!-- Tab: Conversiones (D-20) + Beneficios sin conversión (D-08) -->
      <!-- ================================================================ -->
      <q-tab-panel name="conversiones">
        <PartnerConversionsTable />

        <div class="text-h6 q-mt-lg q-mb-xs">Beneficios sin conversión</div>
        <div class="text-caption text-grey-7 q-mb-md">
          Socios que canjearon un beneficio de partner y no convirtieron — para seguimiento manual
          de la sede (llamada, WhatsApp). No forma parte del embudo de leads.
        </div>

        <q-table
          :rows="benefitsWithoutConversion"
          :columns="benefitsWithoutConversionColumns"
          row-key="linkId"
          :loading="loadingBenefitsWithoutConversion"
          :pagination="{ rowsPerPage: 50 }"
          :rows-per-page-options="[20, 50, 100]"
          flat
          bordered
        >
          <template #no-data>
            <div class="full-width text-center text-grey-7 q-pa-md">
              No hay beneficios sin conversión.
            </div>
          </template>

          <template #body-cell-phone="props">
            <q-td :props="props">
              <a
                v-if="props.row.referredPhone"
                :href="whatsappUrl(props.row.referredPhone)"
                target="_blank"
                rel="noopener"
                class="text-primary no-underline"
              >
                {{ props.row.referredPhone }}
              </a>
              <span v-else class="text-grey-5">—</span>
            </q-td>
          </template>

          <template #body-cell-motivo="props">
            <q-td :props="props"> {{ motivoLabel(props.row.motivo) }} </q-td>
          </template>

          <template #body-cell-fecha="props">
            <q-td :props="props"> {{ formatDateEs(props.row.fechaRelevante) }} </q-td>
          </template>
        </q-table>
      </q-tab-panel>

      <!-- ================================================================ -->
      <!-- Tab: Liquidación (D-16) -->
      <!-- ================================================================ -->
      <q-tab-panel name="liquidacion">
        <div class="text-caption text-grey-7 q-mb-md">
          Un clic marca todas las comisiones pendientes de un partner como liquidadas, en un acto.
          No mueve plata: registra que el pago al comercio ya se hizo fuera del sistema.
        </div>

        <q-table
          :rows="partnersWithPendingCommissions"
          :columns="liquidacionColumns"
          row-key="id"
          :loading="partnersApi.loading.value"
          :pagination="{ rowsPerPage: 50 }"
          :rows-per-page-options="[20, 50, 100]"
          flat
          bordered
        >
          <template #no-data>
            <div class="full-width text-center text-grey-7 q-pa-md">
              No hay comisiones pendientes de liquidar.
            </div>
          </template>

          <template #body-cell-total="props">
            <q-td :props="props">
              {{ formatPrice(props.row.montoPendiente, props.row.currency) }}
            </q-td>
          </template>

          <template #body-cell-acciones="props">
            <q-td :props="props">
              <q-btn
                color="primary"
                label="Liquidar"
                icon="task_alt"
                unelevated
                dense
                @click="openSettleDialog(props.row)"
              />
            </q-td>
          </template>
        </q-table>

        <PartnerSettleDialog v-model="showSettleDialog" :partner="settlingPartner" @settled="onSettled" />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar, type QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import {
  usePartnersApi,
  type PartnerListItem,
  type BenefitWithoutConversionRow,
} from 'src/composables/usePartnersApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { formatPrice } from 'src/utils/format-price';
import type { BranchOption } from 'src/types/member';
import PartnerFormDialog from 'src/components/partners/PartnerFormDialog.vue';
import PartnerQrDialog from 'src/components/partners/PartnerQrDialog.vue';
import PartnerConversionsTable from 'src/components/partners/PartnerConversionsTable.vue';
import PartnerSettleDialog from 'src/components/partners/PartnerSettleDialog.vue';

const log = createLogger('PartnersPage');
const $q = useQuasar();
const partnersApi = usePartnersApi();
const membersApi = useMembersApi();
const authStore = useAuthStore();

// =========================================================================
// Country selector (owner-only, calcado de ReportesPage). El endpoint de
// listado no filtra por país server-side (D-13: un tenant puede tener sedes
// AR+ES): el filtro se aplica cliente sobre `row.country`, mismo criterio
// que la columna Pais ya resuelve en cada fila.
// =========================================================================

const isOwner = computed(() => authStore.user?.role === 'owner');

const countryOptions = [
  { label: 'Argentina', value: 'AR' as const },
  { label: 'España', value: 'ES' as const },
];

const selectedCountry = ref<'AR' | 'ES'>('AR');

function onCountryChange() {
  // Filtro puramente cliente sobre `filteredPartners` (computed): no
  // dispara fetch. El branch filter queda como está — independiente del
  // país, mismo criterio que ReportesPage (no re-scopea la sede al cambiar
  // país).
}

// =========================================================================
// Tab state
// =========================================================================

const activeTab = ref('partners');

// =========================================================================
// Partners state
// =========================================================================

const partners = ref<PartnerListItem[]>([]);
const showFormDialog = ref(false);
const editingPartner = ref<PartnerListItem | null>(null);
const showQrDialog = ref(false);
const qrPartner = ref<PartnerListItem | null>(null);

// =========================================================================
// Beneficios sin conversión (D-08 reescrita) — reporte de seguimiento
// manual de la sede, propio del tab Conversiones.
// =========================================================================

const benefitsWithoutConversion = ref<BenefitWithoutConversionRow[]>([]);
const loadingBenefitsWithoutConversion = ref(false);

const benefitsWithoutConversionColumns: QTableProps['columns'] = [
  { name: 'referredName', label: 'Socio', field: 'referredName', align: 'left', sortable: true },
  { name: 'phone', label: 'Teléfono', field: 'referredPhone', align: 'left' },
  { name: 'partnerName', label: 'Partner', field: 'partnerName', align: 'left', sortable: true },
  { name: 'motivo', label: 'Motivo', field: 'motivo', align: 'left' },
  { name: 'fecha', label: 'Fecha', field: 'fechaRelevante', align: 'left', sortable: true },
];

function motivoLabel(motivo: BenefitWithoutConversionRow['motivo']): string {
  return motivo === 'semana_sin_conversion'
    ? 'Usó la semana y no compró'
    : 'Beneficio vencido sin usar';
}

function formatDateEs(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR');
}

// Phase 165-03 (D-06) + WR-01: link wa.me a partir del teléfono del socio.
// Espeja TrialSessionsReport.vue (digits-only + prefijo AR para móviles de
// 10 dígitos sin país).
function whatsappUrl(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  const intl = digits.length === 10 ? `549${digits}` : digits;
  return `https://wa.me/${intl}`;
}

// =========================================================================
// Liquidación (D-16) — reusa `partners`/`loadPartners` de la tabla CRUD:
// no hay un endpoint aparte, `comisionesPendientes`/`montoPendiente` ya
// vienen en PartnerListItem (agregados server-side). Tras liquidar se
// recarga desde el server (no se muta el estado local).
// =========================================================================

const showSettleDialog = ref(false);
const settlingPartner = ref<PartnerListItem | null>(null);

const partnersWithPendingCommissions = computed(() =>
  filteredPartners.value.filter((p) => p.comisionesPendientes > 0)
);

const liquidacionColumns: QTableProps['columns'] = [
  { name: 'name', label: 'Partner', field: 'name', align: 'left', sortable: true },
  {
    name: 'comisionesPendientes',
    label: 'Comisiones pendientes',
    field: 'comisionesPendientes',
    align: 'center',
    sortable: true,
  },
  { name: 'total', label: 'Total', field: 'montoPendiente', align: 'right', sortable: true },
  { name: 'acciones', label: 'Acciones', field: 'id', align: 'center' },
];

function openSettleDialog(partner: PartnerListItem) {
  settlingPartner.value = partner;
  showSettleDialog.value = true;
}

function onSettled() {
  // Fuente de verdad = server: recargar en vez de mutar `comisionesPendientes`
  // localmente (evita desincronía si otro admin liquidó en paralelo).
  loadPartners();
}

async function loadBenefitsWithoutConversion() {
  loadingBenefitsWithoutConversion.value = true;
  try {
    benefitsWithoutConversion.value = await partnersApi.listBenefitsWithoutConversion({
      branchId: selectedBranchId.value,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading benefits without conversion', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando los beneficios sin conversión' });
  } finally {
    loadingBenefitsWithoutConversion.value = false;
  }
}

const filteredPartners = computed(() =>
  isOwner.value ? partners.value.filter((p) => p.country === selectedCountry.value) : partners.value
);

// =========================================================================
// Branch filter (calcado de ReportesPage)
// =========================================================================

const selectedBranchId = ref<number | undefined>(undefined);
const branchOptions = ref<Array<{ label: string; value: number | undefined }>>([
  { label: 'Todas las sedes', value: undefined },
]);
const loadingBranches = ref(false);

const selectedBranchLabel = computed(() => {
  const match = branchOptions.value.find((o) => o.value === selectedBranchId.value);
  return match?.label ?? 'Todas las sedes';
});

async function fetchBranches() {
  loadingBranches.value = true;
  try {
    const branches = await membersApi.getBranches();
    branchOptions.value = [
      { label: 'Todas las sedes', value: undefined },
      ...branches.map((b: BranchOption) => ({ label: b.name, value: b.id })),
    ];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching branches', { error: message });
  } finally {
    loadingBranches.value = false;
  }
}

function onBranchChange() {
  loadPartners();
  loadBenefitsWithoutConversion();
}

// =========================================================================
// Table columns
// =========================================================================

const partnerColumns: QTableProps['columns'] = [
  { name: 'name', label: 'Nombre', field: 'name', align: 'left', sortable: true },
  { name: 'code', label: 'Codigo', field: 'code', align: 'left', sortable: true },
  { name: 'branchName', label: 'Sede', field: 'branchName', align: 'left', sortable: true },
  { name: 'beneficio', label: 'Beneficio', field: 'benefitType', align: 'left' },
  { name: 'comision', label: 'Comision', field: 'commissionValue', align: 'right' },
  { name: 'vinculos', label: 'Vinculos', field: 'vinculosTotal', align: 'center' },
  {
    name: 'comisionesPendientes',
    label: 'Comisiones pendientes',
    field: 'comisionesPendientes',
    align: 'center',
  },
  { name: 'estado', label: 'Estado', field: 'isActive', align: 'center' },
  { name: 'acciones', label: 'Acciones', field: 'id', align: 'center' },
];

// =========================================================================
// Display helpers
// =========================================================================

function benefitLabel(row: PartnerListItem): string {
  if (row.benefitType === 'free_pass') return 'Semana gratis';
  return `${row.benefitValue}% primera cuota`;
}

function commissionLabel(row: PartnerListItem): string {
  if (row.commissionType === 'none') return 'Sin comision';
  return formatPrice(row.commissionValue, row.currency);
}

// =========================================================================
// Data loading
// =========================================================================

async function loadPartners() {
  try {
    partners.value = await partnersApi.listPartners({ branchId: selectedBranchId.value });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading partners', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando los partners' });
  }
}

// =========================================================================
// Dialog actions
// =========================================================================

function openCreateDialog() {
  editingPartner.value = null;
  showFormDialog.value = true;
}

function openEditDialog(partner: PartnerListItem) {
  editingPartner.value = partner;
  showFormDialog.value = true;
}

function openQrDialog(partner: PartnerListItem) {
  qrPartner.value = partner;
  showQrDialog.value = true;
}

function onPartnerSaved() {
  $q.notify({ type: 'positive', message: 'Partner guardado correctamente' });
  loadPartners();
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  fetchBranches();
  loadPartners();
  loadBenefitsWithoutConversion();
});
</script>
