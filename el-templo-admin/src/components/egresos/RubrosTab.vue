<template>
  <div class="q-pa-md">
    <!-- Rubros de egreso (fase 209, DI-17). Se mudó desde Caja > Cuentas. Solo lo
         monta EgresosHub para owner y admin (la API también exige ADMIN_ROLES en
         /cost-centers*). País-scoped (nombre único por país): reactivo al selector. -->
    <div class="row items-center q-mb-xs">
      <div class="text-subtitle1 text-weight-medium col">Rubros</div>
      <q-btn
        icon="add"
        label="Nuevo rubro"
        color="primary"
        unelevated
        dense
        @click="openCreateRubro"
      />
    </div>
    <div class="text-caption text-grey-7 q-mb-md">
      Los rubros clasifican los gastos. Desactivar un rubro lo saca del formulario pero conserva los
      gastos ya cargados.
    </div>

    <q-table
      :rows="rubros"
      :columns="rubroColumns"
      row-key="id"
      flat
      bordered
      :loading="loadingRubros"
      :pagination="{ rowsPerPage: 0 }"
      hide-bottom
    >
      <!-- Desactivados atenuados -->
      <template #body="tableProps">
        <q-tr :props="tableProps" :class="{ 'text-grey-5': !tableProps.row.isActive }">
          <q-td key="name" :props="tableProps">
            <div class="row items-center q-gutter-xs no-wrap">
              <span>{{ tableProps.row.name }}</span>
              <q-badge
                v-if="!tableProps.row.isActive"
                color="grey-4"
                text-color="grey-8"
                label="Desactivado"
              />
            </div>
          </q-td>
          <q-td key="actions" :props="tableProps">
            <div class="row items-center q-gutter-xs no-wrap justify-end">
              <q-btn
                flat
                dense
                round
                icon="edit"
                color="primary"
                @click="openEditRubro(tableProps.row)"
              >
                <q-tooltip>Renombrar</q-tooltip>
              </q-btn>
              <q-btn
                v-if="tableProps.row.isActive"
                flat
                dense
                round
                icon="lock"
                color="negative"
                @click="onDeactivateRubro(tableProps.row)"
              >
                <q-tooltip>Desactivar rubro</q-tooltip>
              </q-btn>
              <q-btn
                v-else
                flat
                dense
                round
                icon="lock_open"
                color="positive"
                @click="onReactivateRubro(tableProps.row)"
              >
                <q-tooltip>Reactivar rubro</q-tooltip>
              </q-btn>
            </div>
          </q-td>
        </q-tr>
      </template>

      <template #no-data>
        <div class="full-width text-center text-grey-6 q-pa-md">
          Todavía no hay rubros. Creá el primero con "Nuevo rubro".
        </div>
      </template>
    </q-table>

    <!-- Alta / renombre de rubro -->
    <CategoriaEgresoFormDialog
      v-model="showRubroForm"
      :selected-country="selectedCountry"
      :categoria="editingRubro"
      @saved="onSavedRubro"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue';
import { useQuasar, type QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import type { CostCenter } from 'src/types/transaction';
import CategoriaEgresoFormDialog from 'src/components/caja/CategoriaEgresoFormDialog.vue';

const props = defineProps<{
  selectedCountry: 'AR' | 'ES';
}>();

const log = createLogger('RubrosTab');
const $q = useQuasar();
const transactionsApi = useTransactionsApi();

// =========================================================================
// ABM país-scoped: alta, renombre y baja/alta lógica (sin borrado físico).
// Usa los endpoints /cost-centers* de siempre (un rubro es un cost center).
// =========================================================================

const rubros = ref<CostCenter[]>([]);
const loadingRubros = ref(false);

const rubroColumns: QTableColumn<CostCenter>[] = [
  { name: 'name', label: 'Rubro', field: 'name', align: 'left' },
  { name: 'actions', label: 'Acciones', field: 'id', align: 'right' },
];

async function loadRubros() {
  loadingRubros.value = true;
  try {
    rubros.value = await transactionsApi.listAllCostCenters(props.selectedCountry);
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando los rubros');
    log.error('Error loading cost centers', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loadingRubros.value = false;
  }
}

const showRubroForm = ref(false);
const editingRubro = ref<CostCenter | null>(null);

function openCreateRubro() {
  editingRubro.value = null;
  showRubroForm.value = true;
}

function openEditRubro(rubro: CostCenter) {
  editingRubro.value = rubro;
  showRubroForm.value = true;
}

function onSavedRubro() {
  void loadRubros();
}

function onDeactivateRubro(rubro: CostCenter) {
  $q.dialog({
    title: 'Desactivar rubro',
    message:
      `¿Desactivar el rubro "${rubro.name}"? ` +
      'Dejará de aparecer al cargar gastos, pero los gastos ya cargados se conservan. ' +
      'Podrás reactivarlo más adelante.',
    cancel: true,
    persistent: true,
    ok: { label: 'Desactivar', color: 'negative' },
  }).onOk(() => {
    void deactivateRubro(rubro.id);
  });
}

async function deactivateRubro(id: number) {
  try {
    await transactionsApi.deactivateCostCenter(id);
    $q.notify({ type: 'positive', message: 'Rubro desactivado' });
    await loadRubros();
  } catch (err: unknown) {
    const message = extractError(err, 'Error desactivando el rubro');
    log.error('Error deactivating cost center', { error: message });
    $q.notify({ type: 'negative', message });
  }
}

function onReactivateRubro(rubro: CostCenter) {
  void reactivateRubro(rubro.id);
}

async function reactivateRubro(id: number) {
  try {
    await transactionsApi.reactivateCostCenter(id);
    $q.notify({ type: 'positive', message: 'Rubro reactivado' });
    await loadRubros();
  } catch (err: unknown) {
    const message = extractError(err, 'Error reactivando el rubro');
    log.error('Error reactivating cost center', { error: message });
    $q.notify({ type: 'negative', message });
  }
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  void loadRubros();
});

watch(
  () => props.selectedCountry,
  () => {
    void loadRubros();
  }
);

onUnmounted(() => {
  transactionsApi.cleanup();
});
</script>
