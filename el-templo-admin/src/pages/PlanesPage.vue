<template>
  <q-page class="q-pa-md">
    <!-- ================================================================== -->
    <!-- Page Header -->
    <!-- ================================================================== -->
    <div class="text-h5 q-mb-md">Planes</div>

    <!-- ================================================================== -->
    <!-- Tabs: Planes / Experiencias -->
    <!-- ================================================================== -->
    <q-tabs
      v-model="activeTab"
      dense
      align="left"
      class="q-mb-md"
      active-color="primary"
      indicator-color="primary"
    >
      <q-tab name="planes" label="Planes de Suscripcion" />
      <q-tab name="experiencias" label="Experiencias a Medida" />
    </q-tabs>

    <q-tab-panels v-model="activeTab" animated>
      <!-- ============================================================== -->
      <!-- Planes Tab (existing) -->
      <!-- ============================================================== -->
      <q-tab-panel name="planes">
        <!-- Header -->
        <div class="row items-center q-mb-md">
          <div class="text-h6 col">Planes de Suscripcion</div>
          <q-btn icon="add" label="Nuevo Plan" color="primary" @click="openCreateDialog" />
        </div>

        <!-- QTable -->
        <q-table
          :rows="plans"
          :columns="planColumns"
          row-key="id"
          :loading="loadingPlans"
          :pagination="{ rowsPerPage: 50 }"
          :rows-per-page-options="[20, 50, 100]"
          flat
          bordered
        >
          <!-- Tier column -->
          <template #body-cell-tier="props">
            <q-td :props="props">
              <q-badge
                :color="tierColor(props.row.planTier)"
                :label="tierLabel(props.row.planTier)"
              />
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
        <PlanFormDialog v-model="showFormDialog" :plan="editingPlan" @saved="onPlanSaved" />
      </q-tab-panel>

      <!-- ============================================================== -->
      <!-- Experiencias Tab (new) -->
      <!-- ============================================================== -->
      <q-tab-panel name="experiencias">
        <!-- Header -->
        <div class="row items-center q-mb-md">
          <div class="text-h6 col">Experiencias a Medida</div>
          <q-btn
            icon="add"
            label="Nuevo Programa"
            color="primary"
            @click="openCreateProgramDialog"
          />
        </div>

        <!-- Programs QTable -->
        <q-table
          :rows="programs"
          :columns="programColumns"
          row-key="id"
          :loading="loadingPrograms"
          :pagination="{ rowsPerPage: 50 }"
          :rows-per-page-options="[20, 50, 100]"
          flat
          bordered
        >
          <!-- Price column -->
          <template #body-cell-programPrecio="props">
            <q-td :props="props"> ${{ props.row.price.toLocaleString() }} </q-td>
          </template>

          <!-- Duration column -->
          <template #body-cell-programDuracion="props">
            <q-td :props="props"> {{ props.row.durationWeeks }} semanas </q-td>
          </template>

          <!-- Status column -->
          <template #body-cell-programEstado="props">
            <q-td :props="props">
              <q-badge
                :color="props.row.isActive ? 'positive' : 'grey'"
                :label="props.row.isActive ? 'Activo' : 'Inactivo'"
              />
            </q-td>
          </template>

          <!-- Actions column -->
          <template #body-cell-programAcciones="props">
            <q-td :props="props">
              <q-btn
                flat
                dense
                round
                icon="edit"
                color="primary"
                @click="openEditProgramDialog(props.row)"
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
                @click="confirmDeactivateProgram(props.row)"
              >
                <q-tooltip>Desactivar</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>

        <!-- Program Wizard Dialog -->
        <ProgramWizardDialog
          v-model="showProgramDialog"
          :editing-program="editingProgram"
          @saved="onProgramSaved"
        />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import { useProgramsApi } from 'src/composables/useProgramsApi';
import { PLAN_TIER_LABELS, type PlanListItem, type PlanTier } from 'src/types/subscription';
import type { MicroProgram, MicroProgramDetail } from 'src/types/program';
import PlanFormDialog from 'src/components/PlanFormDialog.vue';
import ProgramWizardDialog from 'src/components/ProgramWizardDialog.vue';

const log = createLogger('PlanesPage');
const $q = useQuasar();
const subscriptionsApi = useSubscriptionsApi();
const programsApi = useProgramsApi();

// =========================================================================
// Tab state
// =========================================================================

const activeTab = ref('planes');

// =========================================================================
// Plans State (existing)
// =========================================================================

const plans = ref<PlanListItem[]>([]);
const loadingPlans = ref(false);
const showFormDialog = ref(false);
const editingPlan = ref<PlanListItem | null>(null);

// =========================================================================
// Programs State (new)
// =========================================================================

const programs = ref<MicroProgram[]>([]);
const loadingPrograms = ref(false);
const showProgramDialog = ref(false);
const editingProgram = ref<MicroProgramDetail | null>(null);

// =========================================================================
// Plan Table columns
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
// Program Table columns
// =========================================================================

const programColumns: QTableProps['columns'] = [
  {
    name: 'name',
    label: 'Nombre',
    field: 'name',
    align: 'left',
    sortable: true,
  },
  {
    name: 'programPrecio',
    label: 'Precio',
    field: 'price',
    align: 'right',
    sortable: true,
    style: 'width: 120px',
  },
  {
    name: 'programDuracion',
    label: 'Duracion',
    field: 'durationWeeks',
    align: 'right',
    sortable: true,
    style: 'width: 120px',
  },
  {
    name: 'sessionsPerWeek',
    label: 'Sesiones/Sem',
    field: 'sessionsPerWeekToAdvance',
    align: 'center',
    sortable: true,
    style: 'width: 110px',
  },
  {
    name: 'programEstado',
    label: 'Estado',
    field: 'isActive',
    align: 'center',
    sortable: true,
    style: 'width: 100px',
  },
  {
    name: 'programAcciones',
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
// Plans Data loading
// =========================================================================

async function loadPlans() {
  loadingPlans.value = true;
  try {
    plans.value = await subscriptionsApi.getPlans();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading plans', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando planes' });
  } finally {
    loadingPlans.value = false;
  }
}

// =========================================================================
// Programs Data loading
// =========================================================================

async function loadPrograms() {
  loadingPrograms.value = true;
  try {
    programs.value = await programsApi.getPrograms();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading programs', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando programas' });
  } finally {
    loadingPrograms.value = false;
  }
}

// =========================================================================
// Plan Dialog actions
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
// Program Dialog actions
// =========================================================================

function openCreateProgramDialog() {
  editingProgram.value = null;
  showProgramDialog.value = true;
}

async function openEditProgramDialog(program: MicroProgram) {
  try {
    const detail = await programsApi.getProgramDetail(program.id);
    editingProgram.value = detail;
    showProgramDialog.value = true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading program detail', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando detalle del programa' });
  }
}

function confirmDeactivateProgram(program: MicroProgram) {
  $q.dialog({
    title: 'Desactivar programa',
    message: `Desactivar "${program.name}"? Las inscripciones activas continuaran pero no se podran crear nuevas.`,
    cancel: { flat: true, label: 'Cancelar' },
    ok: { color: 'negative', label: 'Desactivar' },
  }).onOk(async () => {
    try {
      await programsApi.deactivateProgram(program.id);
      $q.notify({ type: 'positive', message: 'Programa desactivado' });
      await loadPrograms();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error deactivating program', { error: message });
      $q.notify({ type: 'negative', message: 'Error desactivando programa' });
    }
  });
}

function onProgramSaved() {
  loadPrograms();
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadPlans();
  loadPrograms();
});
</script>
