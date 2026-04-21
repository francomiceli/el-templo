<template>
  <q-page class="q-pa-md">
    <!-- ================================================================== -->
    <!-- Page Header -->
    <!-- ================================================================== -->
    <div class="text-h5 q-mb-md">Planes</div>

    <!-- ================================================================== -->
    <!-- Tabs: Planes / Promos -->
    <!-- ================================================================== -->
    <q-tabs
      v-model="activeTab"
      dense
      align="left"
      class="q-mb-md"
      active-color="primary"
      indicator-color="primary"
    >
      <q-tab name="planes" label="Planes" />
      <q-tab name="promos" label="Promos" />
    </q-tabs>

    <q-tab-panels v-model="activeTab" animated>
      <!-- ============================================================== -->
      <!-- Planes Tab — Unified Table -->
      <!-- ============================================================== -->
      <q-tab-panel name="planes">
        <!-- Owner-only country selector (D-06) -->
        <div v-if="isOwner" class="row q-gutter-md q-mb-md">
          <div class="col-auto" style="min-width: 180px">
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
        </div>

        <!-- Header with single create button -->
        <div class="row items-center q-mb-md">
          <div class="col" />
          <q-btn icon="add" label="Nuevo Plan" color="primary" @click="openCreateDialog" />
        </div>

        <!-- Presenciales Table -->
        <div class="text-h6 q-mb-sm">Presenciales</div>
        <q-table
          :rows="presencialPlans"
          :columns="planColumns"
          row-key="id"
          :loading="loadingPlans"
          :pagination="{ rowsPerPage: 50 }"
          :rows-per-page-options="[20, 50, 100]"
          flat
          bordered
          class="q-mb-xl"
        >
          <!-- Category column -->
          <template #body-cell-categoria="props">
            <q-td :props="props">
              <q-badge
                :color="PLAN_CATEGORY_COLORS[props.row.planCategory as PlanCategory]"
                :label="PLAN_CATEGORY_LABELS[props.row.planCategory as PlanCategory]"
              />
            </q-td>
          </template>

          <!-- Tier column -->
          <template #body-cell-tier="props">
            <q-td :props="props">
              <q-badge
                v-if="props.row.planCategory === 'presencial'"
                :color="tierColor(props.row.planTier)"
                :label="tierLabel(props.row.planTier)"
              />
              <span v-else class="text-grey-5">—</span>
            </q-td>
          </template>

          <!-- Price column -->
          <template #body-cell-precio="props">
            <q-td :props="props">
              {{ formatPrice(props.row.priceRegular, props.row.currency) }}
            </q-td>
          </template>

          <!-- Duration column -->
          <template #body-cell-duracion="props">
            <q-td :props="props"> {{ props.row.durationDays }} dias </q-td>
          </template>

          <!-- Classes column -->
          <template #body-cell-clases="props">
            <q-td :props="props">
              <template v-if="props.row.planCategory === 'presencial'">
                {{ props.row.classesPerWeek ?? 'Ilimitado' }}
              </template>
              <span v-else class="text-grey-5">—</span>
            </q-td>
          </template>

          <!-- Linked program column -->
          <template #body-cell-programa="props">
            <q-td :props="props">
              {{ programName(props.row.linkedProgramId) }}
            </q-td>
          </template>

          <!-- Status column -->
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
                v-if="props.row.isActive"
                flat
                dense
                round
                icon="block"
                color="negative"
                @click="confirmDeactivate(props.row)"
              >
                <q-tooltip>Desactivar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>

        <!-- Online Table -->
        <div class="text-h6 q-mb-sm">Online</div>
        <q-table
          :rows="onlinePlans"
          :columns="planColumns"
          row-key="id"
          :loading="loadingPlans"
          :pagination="{ rowsPerPage: 50 }"
          :rows-per-page-options="[20, 50, 100]"
          flat
          bordered
        >
          <!-- Category column -->
          <template #body-cell-categoria="props">
            <q-td :props="props">
              <q-badge
                :color="PLAN_CATEGORY_COLORS[props.row.planCategory as PlanCategory]"
                :label="PLAN_CATEGORY_LABELS[props.row.planCategory as PlanCategory]"
              />
            </q-td>
          </template>

          <!-- Tier column -->
          <template #body-cell-tier="props">
            <q-td :props="props">
              <span class="text-grey-5">—</span>
            </q-td>
          </template>

          <!-- Price column -->
          <template #body-cell-precio="props">
            <q-td :props="props">
              {{ formatPrice(props.row.priceRegular, props.row.currency) }}
            </q-td>
          </template>

          <!-- Duration column -->
          <template #body-cell-duracion="props">
            <q-td :props="props"> {{ props.row.durationDays }} dias </q-td>
          </template>

          <!-- Classes column -->
          <template #body-cell-clases="props">
            <q-td :props="props">
              <span class="text-grey-5">—</span>
            </q-td>
          </template>

          <!-- Linked program column -->
          <template #body-cell-programa="props">
            <q-td :props="props">
              {{ programName(props.row.linkedProgramId) }}
            </q-td>
          </template>

          <!-- Status column -->
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
                v-if="props.row.isActive"
                flat
                dense
                round
                icon="block"
                color="negative"
                @click="confirmDeactivate(props.row)"
              >
                <q-tooltip>Desactivar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>

        <!-- Plan Form Dialog -->
        <PlanFormDialog
          v-model="showFormDialog"
          :plan="editingPlan"
          :preset-category="presetCategory"
          :preset-country="selectedCountry"
          @saved="onPlanSaved"
        />
      </q-tab-panel>

      <!-- ============================================================== -->
      <!-- Promos Tab -->
      <!-- ============================================================== -->
      <q-tab-panel name="promos">
        <!-- Header -->
        <div class="row items-center q-mb-md">
          <div class="text-h6 col">Promos</div>
          <q-btn icon="add" label="Nueva Promo" color="primary" @click="openCreatePromoDialog" />
        </div>

        <!-- Promos QTable -->
        <q-table
          :rows="promos"
          :columns="promoColumns"
          row-key="id"
          :loading="loadingPromos"
          :pagination="{ rowsPerPage: 50 }"
          flat
          bordered
        >
          <!-- Promo Type column -->
          <template #body-cell-promoTipo="props">
            <q-td :props="props">
              <q-badge
                :color="props.row.promoType === 'auto' ? 'primary' : 'secondary'"
                :label="props.row.promoType === 'auto' ? 'Auto' : 'Admin'"
              />
            </q-td>
          </template>

          <!-- Dates column -->
          <template #body-cell-promoPeriodo="props">
            <q-td :props="props">
              {{ formatDate(props.row.startDate) }} - {{ formatDate(props.row.expiryDate) }}
            </q-td>
          </template>

          <!-- Redemptions column -->
          <template #body-cell-promoRedenciones="props">
            <q-td :props="props">
              <q-badge color="info" :label="String(props.row.redemptionCount)" />
            </q-td>
          </template>

          <!-- Status column -->
          <template #body-cell-promoEstado="props">
            <q-td :props="props">
              <q-badge
                :color="props.row.isActive ? 'positive' : 'grey'"
                :label="props.row.isActive ? 'Activa' : 'Inactiva'"
              />
            </q-td>
          </template>

          <!-- Actions column -->
          <template #body-cell-promoAcciones="props">
            <q-td :props="props">
              <q-btn
                flat
                dense
                round
                icon="link"
                color="primary"
                @click="showPromoLink(props.row.promoCode)"
              >
                <q-tooltip>Ver link</q-tooltip>
              </q-btn>
              <q-btn
                v-if="props.row.isActive"
                flat
                dense
                round
                icon="block"
                color="negative"
                @click="confirmDeactivatePromo(props.row)"
              >
                <q-tooltip>Desactivar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>

        <PromoFormDialog v-model="showPromoDialog" :promo="editingPromo" @saved="onPromoSaved" />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import { useProgramsApi } from 'src/composables/useProgramsApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { formatPrice } from 'src/utils/format-price';
import {
  PLAN_TIER_LABELS,
  PLAN_CATEGORY_LABELS,
  PLAN_CATEGORY_COLORS,
  type PlanListItem,
  type PlanTier,
  type PlanCategory,
} from 'src/types/subscription';
import type { PromoListItem } from 'src/types/subscription';
import type { Program } from 'src/types/program';
import PlanFormDialog from 'src/components/PlanFormDialog.vue';
import PromoFormDialog from 'src/components/PromoFormDialog.vue';

const log = createLogger('PlanesPage');
const $q = useQuasar();
const subscriptionsApi = useSubscriptionsApi();
const programsApi = useProgramsApi();
const authStore = useAuthStore();

// =========================================================================
// Country selector (owner-only per D-06)
// =========================================================================

const isOwner = computed(() => authStore.user?.role === 'owner');

const countryOptions = [
  { label: 'Argentina', value: 'AR' as const },
  { label: 'España', value: 'ES' as const },
];

// Default Argentina per D-06 (no Todos mode)
const selectedCountry = ref<'AR' | 'ES'>('AR');

async function onCountryChange() {
  await loadPlans();
}

// =========================================================================
// Tab state
// =========================================================================

const activeTab = ref('planes');

// =========================================================================
// Plans State
// =========================================================================

const plans = ref<PlanListItem[]>([]);
const loadingPlans = ref(false);
const showFormDialog = ref(false);
const editingPlan = ref<PlanListItem | null>(null);
const presetCategory = ref<PlanCategory>('presencial');

// =========================================================================
// Programs (for linked program names)
// =========================================================================

const programs = ref<Program[]>([]);

// =========================================================================
// Computed plan lists
// =========================================================================

const presencialPlans = computed(() => plans.value.filter((p) => p.planCategory === 'presencial'));
const onlinePlans = computed(() => plans.value.filter((p) => p.planCategory !== 'presencial'));

// =========================================================================
// Promos State
// =========================================================================

const promos = ref<PromoListItem[]>([]);
const loadingPromos = ref(false);
const showPromoDialog = ref(false);
const editingPromo = ref<PromoListItem | null>(null);

// =========================================================================
// Unified Plan Table columns
// =========================================================================

const planColumns: QTableProps['columns'] = [
  {
    name: 'name',
    label: 'Nombre',
    field: 'name',
    align: 'left',
    sortable: true,
  },
  {
    name: 'country',
    label: 'Pais',
    field: 'country',
    align: 'left',
    sortable: true,
    style: 'width: 100px',
  },
  {
    name: 'categoria',
    label: 'Categoria',
    field: 'planCategory',
    align: 'left',
    sortable: true,
    style: 'width: 140px',
  },
  {
    name: 'tier',
    label: 'Tier',
    field: 'planTier',
    align: 'left',
    sortable: true,
    style: 'width: 120px',
  },
  {
    name: 'precio',
    label: 'Precio',
    field: 'priceRegular',
    align: 'right',
    sortable: true,
    style: 'width: 100px',
  },
  {
    name: 'duracion',
    label: 'Duracion',
    field: 'durationDays',
    align: 'right',
    sortable: true,
    style: 'width: 100px',
  },
  {
    name: 'clases',
    label: 'Clases/Sem',
    field: 'classesPerWeek',
    align: 'center',
    sortable: true,
    style: 'width: 110px',
  },
  {
    name: 'programa',
    label: 'Programa',
    field: 'linkedProgramId',
    align: 'left',
    sortable: false,
    style: 'width: 180px',
  },
  {
    name: 'estado',
    label: 'Estado',
    field: 'isActive',
    align: 'center',
    sortable: true,
    style: 'width: 100px',
  },
  {
    name: 'acciones',
    label: 'Acciones',
    field: 'id',
    align: 'center',
    sortable: false,
    style: 'width: 100px',
  },
];

// =========================================================================
// Promo Table columns
// =========================================================================

const promoColumns: QTableProps['columns'] = [
  {
    name: 'nombre',
    label: 'Nombre',
    field: 'name',
    align: 'left',
    sortable: true,
  },
  { name: 'codigo', label: 'Codigo', field: 'promoCode', align: 'left' },
  {
    name: 'duracion',
    label: 'Duracion',
    field: 'planDurationDays',
    align: 'center',
    format: (v: number) => `${v} dias`,
  },
  { name: 'promoTipo', label: 'Tipo', field: 'promoType', align: 'center' },
  {
    name: 'promoPeriodo',
    label: 'Periodo',
    field: 'startDate',
    align: 'center',
  },
  {
    name: 'promoRedenciones',
    label: 'Usos',
    field: 'redemptionCount',
    align: 'center',
    sortable: true,
  },
  { name: 'promoEstado', label: 'Estado', field: 'isActive', align: 'center' },
  { name: 'promoAcciones', label: 'Acciones', field: 'id', align: 'center' },
];

// =========================================================================
// Tier display
// =========================================================================

const TIER_COLORS: Record<PlanTier, string> = {
  flex: 'blue',
  foundation: 'teal',
  performance: 'deep-purple',
  other: 'grey',
};

function tierLabel(tier: PlanTier): string {
  return PLAN_TIER_LABELS[tier] ?? tier;
}

function tierColor(tier: PlanTier): string {
  return TIER_COLORS[tier] ?? 'grey';
}

// =========================================================================
// Program name helper
// =========================================================================

function programName(programId: number | null): string {
  if (!programId) return '—';
  const program = programs.value.find((p) => p.id === programId);
  return program?.name ?? '—';
}

// =========================================================================
// Plans Data loading
// =========================================================================

async function loadPlans() {
  loadingPlans.value = true;
  try {
    // Owner: pass selectedCountry; non-owner: server auto-scopes via preHandler.
    const opts = isOwner.value ? { country: selectedCountry.value } : undefined;
    plans.value = await subscriptionsApi.getPlans(undefined, opts);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading plans', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando planes' });
  } finally {
    loadingPlans.value = false;
  }
}

async function loadPrograms() {
  try {
    programs.value = await programsApi.getPrograms();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading programs', { error: message });
  }
}

// =========================================================================
// Plan Dialog actions
// =========================================================================

function openCreateDialog() {
  editingPlan.value = null;
  presetCategory.value = 'presencial';
  showFormDialog.value = true;
}

function openEditDialog(plan: PlanListItem) {
  editingPlan.value = plan;
  presetCategory.value = plan.planCategory;
  showFormDialog.value = true;
}

function confirmDeactivate(plan: PlanListItem) {
  $q.dialog({
    title: 'Desactivar plan',
    message: `Desactivar "${plan.name}"? No podra ser asignado a nuevos miembros.`,
    cancel: { flat: true, label: 'Cancelar' },
    ok: { color: 'negative', label: 'Desactivar' },
  }).onOk(async () => {
    try {
      await subscriptionsApi.deactivatePlan(plan.id);
      $q.notify({ type: 'positive', message: 'Plan desactivado' });
      await loadPlans();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error deactivating plan', { error: message });
      $q.notify({ type: 'negative', message: 'Error desactivando plan' });
    }
  });
}

function onPlanSaved() {
  $q.notify({ type: 'positive', message: 'Plan guardado correctamente' });
  loadPlans();
}

// =========================================================================
// Promos Data loading
// =========================================================================

async function loadPromos() {
  loadingPromos.value = true;
  try {
    promos.value = await subscriptionsApi.listPromos();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading promos', { error: message });
  } finally {
    loadingPromos.value = false;
  }
}

// =========================================================================
// Promo Dialog actions
// =========================================================================

function openCreatePromoDialog() {
  editingPromo.value = null;
  showPromoDialog.value = true;
}

function showPromoLink(promoCode: string) {
  const link = `https://app.eltemplo.org/register?promo=${promoCode}`;
  $q.dialog({
    title: 'Link de Registro',
    message: link,
    ok: 'Copiar',
    cancel: 'Cerrar',
  }).onOk(() => {
    navigator.clipboard.writeText(link).then(() => {
      $q.notify({ type: 'positive', message: 'Link copiado' });
    });
  });
}

async function confirmDeactivatePromo(promo: PromoListItem) {
  $q.dialog({
    title: 'Desactivar Promo',
    message: `Desactivar "${promo.name}" (${promo.promoCode})?`,
    cancel: true,
  }).onOk(async () => {
    try {
      await subscriptionsApi.deactivatePromo(promo.id);
      $q.notify({ type: 'positive', message: 'Promo desactivada' });
      await loadPromos();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error deactivating promo', { error: message });
      $q.notify({ type: 'negative', message: 'Error al desactivar' });
    }
  });
}

function onPromoSaved() {
  loadPromos();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// =========================================================================
// Tab lazy loading
// =========================================================================

watch(activeTab, (tab) => {
  if (tab === 'promos' && promos.value.length === 0 && !loadingPromos.value) {
    loadPromos();
  }
});

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadPlans();
  loadPrograms();
});
</script>
