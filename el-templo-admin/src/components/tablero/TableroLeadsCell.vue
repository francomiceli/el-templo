<template>
  <div
    class="tablero-leads"
    :class="{ 'tablero-leads--editable': editable }"
    :role="editable ? 'button' : undefined"
    :tabindex="editable ? 0 : undefined"
    :aria-label="editable ? 'Editar leads' : undefined"
    @keyup.enter="openEditor"
    @keyup.space.prevent="openEditor"
  >
    <TableroCell metric-key="leads" unit="count" currency="ARS" :cell="cell" />
    <q-icon
      v-if="editable"
      name="edit"
      size="12px"
      class="tablero-leads__edit"
      aria-hidden="true"
    />

    <q-tooltip v-if="!editable" anchor="top middle" self="bottom middle" max-width="260px">
      Los leads se cargan solo en la semana en curso y en la anterior
    </q-tooltip>

    <q-popup-edit
      v-if="editable"
      ref="popup"
      :model-value="cell?.value ?? ''"
      :validate="isValid"
      :disable="saving"
      buttons
      label-set="Guardar"
      label-cancel="Cancelar"
      @save="onSave"
    >
      <template #default="scope">
        <q-input
          v-model.number="scope.value"
          type="number"
          min="0"
          step="1"
          label="Leads de la semana"
          dense
          autofocus
          :error="!isValid(scope.value)"
          error-message="Ingresá un número entero o dejalo vacío"
          hint="Vacío borra la carga"
          @keyup.enter="scope.set"
        />
      </template>
    </q-popup-edit>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { QPopupEdit } from 'quasar';
import type { BoardCell } from 'src/types/weekly-board';
import TableroCell from './TableroCell.vue';

const LEADS_MAX = 100000;

const props = defineProps<{
  branchId: number;
  weekStart: string;
  cell: BoardCell | undefined;
  editable: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  save: [payload: { branchId: number; leads: number | null }];
}>();

const popup = ref<QPopupEdit | null>(null);

function openEditor() {
  if (props.editable && !props.saving) popup.value?.show();
}

/** Vacío o entero 0..100000 (la validación autoritativa es la del API). */
function isValid(value: unknown): boolean {
  if (value === '' || value === null || value === undefined) return true;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= LEADS_MAX;
}

function onSave(value: unknown) {
  if (!isValid(value)) return;
  const leads = value === '' || value === null || value === undefined ? null : Number(value);
  emit('save', { branchId: props.branchId, leads });
}
</script>

<style scoped>
.tablero-leads {
  position: relative;
  display: block;
}
.tablero-leads--editable {
  cursor: pointer;
  border-radius: 4px;
}
.tablero-leads--editable:hover,
.tablero-leads--editable:focus-visible {
  background: #f2ede5;
  outline: 1px solid #96593a;
}
.tablero-leads__edit {
  position: absolute;
  top: 1px;
  left: 1px;
  color: #6b6459;
  opacity: 0;
}
.tablero-leads--editable:hover .tablero-leads__edit,
.tablero-leads--editable:focus-visible .tablero-leads__edit {
  opacity: 1;
}
</style>
