<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 700px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">Cambiar turnos fijos</div>
        <div class="text-caption text-grey-7">Sede: {{ branchName }}</div>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <q-banner class="q-mb-md bg-orange-1 text-orange-10" rounded>
          <template #avatar>
            <q-icon name="warning" />
          </template>
          Se cancelarán las reservas futuras de los turnos actuales y se generarán nuevas en los
          seleccionados. Las clases de hoy no se tocan.
        </q-banner>

        <FixedSchedulePicker
          ref="pickerRef"
          v-model="selectedIds"
          :branch-id="branchId"
          :required-count="requiredCount"
          title="Nuevos turnos fijos"
          :branch-name="branchName"
          class="q-mb-md"
        />

        <q-input
          v-model="reason"
          label="Motivo del cambio (opcional)"
          type="textarea"
          autogrow
          outlined
          dense
          :maxlength="500"
          hint="Se guarda en el historial de cambios"
        />
      </q-card-section>

      <q-separator />

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" :disable="saving" @click="onCancel" />
        <q-btn
          color="primary"
          label="Guardar cambios"
          :loading="saving"
          :disable="!canSubmit"
          @click="onSubmit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import FixedSchedulePicker from 'src/components/scheduling/FixedSchedulePicker.vue';
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import { extractError } from 'src/utils/extract-error';
import { createLogger } from 'src/utils/logger';

const props = defineProps<{
  modelValue: boolean;
  subscriptionId: number;
  branchId: number;
  branchName: string;
  requiredCount: number;
  currentScheduleIds: number[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

const $q = useQuasar();
const log = createLogger('ChangeFixedSchedulesDialog');
const subsApi = useSubscriptionsApi();

const pickerRef = ref<InstanceType<typeof FixedSchedulePicker> | null>(null);
const selectedIds = ref<number[]>([]);
const reason = ref('');
const saving = ref(false);

const canSubmit = computed(() => {
  if (selectedIds.value.length !== props.requiredCount) return false;
  const current = new Set(props.currentScheduleIds);
  const same =
    selectedIds.value.length === props.currentScheduleIds.length &&
    selectedIds.value.every((id) => current.has(id));
  return !same;
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selectedIds.value = [...props.currentScheduleIds];
      reason.value = '';
    }
  }
);

function onCancel(): void {
  emit('update:modelValue', false);
}

async function onSubmit(): Promise<void> {
  saving.value = true;
  try {
    await subsApi.changeFixedSchedules(props.subscriptionId, {
      scheduleIds: selectedIds.value,
      reason: reason.value.trim() || undefined,
    });
    $q.notify({ type: 'positive', message: 'Turnos fijos actualizados' });
    emit('saved');
    emit('update:modelValue', false);
  } catch (err: unknown) {
    const message = extractError(err, 'Error cambiando turnos');
    log.error('Change fixed schedules failed', { subscriptionId: props.subscriptionId, message });
    $q.notify({ type: 'negative', message });
  } finally {
    saving.value = false;
  }
}
</script>
