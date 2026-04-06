<template>
  <q-page class="q-pa-md">
    <!-- ================================================================== -->
    <!-- Page Header -->
    <!-- ================================================================== -->
    <div class="row items-center q-mb-lg">
      <div class="text-h5 col">Programas</div>
      <q-btn icon="add" label="Nuevo Programa" color="primary" @click="openCreateDialog" />
    </div>

    <!-- ================================================================== -->
    <!-- Programs QTable -->
    <!-- ================================================================== -->
    <q-table
      :rows="programs"
      :columns="programColumns"
      row-key="id"
      :loading="loading"
      :pagination="{ rowsPerPage: 50 }"
      :rows-per-page-options="[20, 50, 100]"
      flat
      bordered
    >
      <!-- Tipo column -->
      <template #body-cell-tipo="props">
        <q-td :props="props">
          <q-badge
            v-if="props.row.goalPlanType"
            :color="GOAL_PLAN_TYPE_COLORS[props.row.goalPlanType] ?? 'grey'"
            :label="
              GOAL_PLAN_TYPE_LABELS[props.row.goalPlanType as GoalPlanType] ??
              props.row.goalPlanType
            "
          />
          <q-badge v-else color="grey" label="Contenido" />
        </q-td>
      </template>

      <!-- Duration column -->
      <template #body-cell-duracion="props">
        <q-td :props="props"> {{ props.row.durationWeeks }} semanas </q-td>
      </template>

      <!-- Sessions per week column -->
      <template #body-cell-sesiones="props">
        <q-td :props="props">
          {{ props.row.sessionsPerWeekToAdvance }}
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

      <!-- Empty state -->
      <template #no-data>
        <div class="text-center q-pa-lg text-grey-5">No hay programas creados</div>
      </template>
    </q-table>

    <!-- ================================================================== -->
    <!-- Program Wizard Dialog -->
    <!-- ================================================================== -->
    <ProgramWizardDialog
      v-model="showDialog"
      :editing-program="editingProgram"
      @saved="onProgramSaved"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useProgramsApi } from 'src/composables/useProgramsApi';
import {
  GOAL_PLAN_TYPE_LABELS,
  GOAL_PLAN_TYPE_COLORS,
  type GoalPlanType,
} from 'src/types/goal-plan';
import type { Program, ProgramDetail } from 'src/types/program';
import ProgramWizardDialog from 'src/components/ProgramWizardDialog.vue';

const log = createLogger('ProgramasPage');
const $q = useQuasar();
const programsApi = useProgramsApi();

// =========================================================================
// State
// =========================================================================

const programs = ref<Program[]>([]);
const loading = ref(false);
const showDialog = ref(false);
const editingProgram = ref<ProgramDetail | null>(null);

// =========================================================================
// Table columns
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
    name: 'tipo',
    label: 'Tipo',
    field: 'goalPlanType',
    align: 'left',
    sortable: true,
    style: 'width: 140px',
  },
  {
    name: 'duracion',
    label: 'Duracion',
    field: 'durationWeeks',
    align: 'right',
    sortable: true,
    style: 'width: 120px',
  },
  {
    name: 'sesiones',
    label: 'Sesiones/Sem',
    field: 'sessionsPerWeekToAdvance',
    align: 'center',
    sortable: true,
    style: 'width: 120px',
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
// Data loading
// =========================================================================

async function loadPrograms() {
  loading.value = true;
  try {
    programs.value = await programsApi.getPrograms();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading programs', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando programas. Intenta de nuevo.' });
  } finally {
    loading.value = false;
  }
}

// =========================================================================
// Dialog actions
// =========================================================================

function openCreateDialog() {
  editingProgram.value = null;
  showDialog.value = true;
}

async function openEditDialog(program: Program) {
  try {
    const detail = await programsApi.getProgramDetail(program.id);
    editingProgram.value = detail;
    showDialog.value = true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading program detail', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando detalle del programa' });
  }
}

function confirmDeactivate(program: Program) {
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
  loadPrograms();
});
</script>
