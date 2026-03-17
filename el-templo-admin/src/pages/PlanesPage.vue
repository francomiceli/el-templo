<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="text-h5 col">Planes de Suscripcion</div>
      <q-btn icon="add" label="Nuevo Plan" color="primary" @click="openCreateDialog" />
    </div>

    <!-- Grace Period Settings Card -->
    <q-card flat bordered class="q-mb-lg" style="max-width: 400px">
      <q-card-section>
        <div class="text-subtitle1 text-weight-bold q-mb-xs">Periodo de Gracia</div>
        <div class="text-caption text-grey-7 q-mb-md">
          Dias de gracia despues del vencimiento de la suscripcion
        </div>
        <div class="row items-center q-gutter-sm">
          <q-input
            v-model.number="gracePeriodDays"
            type="number"
            dense
            outlined
            :min="0"
            :max="30"
            suffix="dias"
            class="col"
            style="max-width: 160px"
          />
          <q-btn
            label="Guardar"
            color="primary"
            dense
            no-caps
            :loading="savingGracePeriod"
            @click="saveGracePeriod"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- QTable -->
    <q-table
      :rows="plans"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 50 }"
      :rows-per-page-options="[20, 50, 100]"
      flat
      bordered
    >
      <!-- Tier column -->
      <template #body-cell-tier="props">
        <q-td :props="props">
          <q-badge :color="tierColor(props.row.planTier)" :label="tierLabel(props.row.planTier)" />
        </q-td>
      </template>

      <!-- Price column -->
      <template #body-cell-precio="props">
        <q-td :props="props"> ${{ props.row.priceRegular.toLocaleString() }} </q-td>
      </template>

      <!-- Duration column -->
      <template #body-cell-duracion="props">
        <q-td :props="props"> {{ props.row.durationDays }} dias </q-td>
      </template>

      <!-- Classes column -->
      <template #body-cell-clases="props">
        <q-td :props="props">
          {{ props.row.classesPerWeek ?? 'Ilimitado' }}
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
          <q-btn flat dense round icon="edit" color="primary" @click="openEditDialog(props.row)">
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
    <PlanFormDialog v-model="showFormDialog" :plan="editingPlan" @saved="onPlanSaved" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import { useSettingsApi } from 'src/composables/useSettingsApi';
import { PLAN_TIER_LABELS, type PlanListItem, type PlanTier } from 'src/types/subscription';
import PlanFormDialog from 'src/components/PlanFormDialog.vue';

const log = createLogger('PlanesPage');
const $q = useQuasar();
const subscriptionsApi = useSubscriptionsApi();
const settingsApi = useSettingsApi();

// =========================================================================
// State
// =========================================================================

const plans = ref<PlanListItem[]>([]);
const loading = ref(false);
const showFormDialog = ref(false);
const editingPlan = ref<PlanListItem | null>(null);
const gracePeriodDays = ref<number>(5);
const savingGracePeriod = ref(false);

// =========================================================================
// Table columns
// =========================================================================

const columns: QTableProps['columns'] = [
  {
    name: 'name',
    label: 'Nombre',
    field: 'name',
    align: 'left',
    sortable: true,
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
// Data loading
// =========================================================================

async function loadPlans() {
  loading.value = true;
  try {
    plans.value = await subscriptionsApi.getPlans();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading plans', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando planes' });
  } finally {
    loading.value = false;
  }
}

async function loadGracePeriod() {
  try {
    const result = await settingsApi.getGracePeriod();
    gracePeriodDays.value = result.gracePeriodDays;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading grace period', { error: message });
  }
}

async function saveGracePeriod() {
  savingGracePeriod.value = true;
  try {
    const result = await settingsApi.setGracePeriod(gracePeriodDays.value);
    gracePeriodDays.value = result.gracePeriodDays;
    $q.notify({ type: 'positive', message: 'Periodo de gracia guardado' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error saving grace period', { error: message });
    $q.notify({ type: 'negative', message: 'Error guardando periodo de gracia' });
  } finally {
    savingGracePeriod.value = false;
  }
}

// =========================================================================
// Dialog actions
// =========================================================================

function openCreateDialog() {
  editingPlan.value = null;
  showFormDialog.value = true;
}

function openEditDialog(plan: PlanListItem) {
  editingPlan.value = plan;
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
// Lifecycle
// =========================================================================

onMounted(() => {
  loadPlans();
  loadGracePeriod();
});
</script>
