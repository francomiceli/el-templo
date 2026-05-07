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
          :allow-partial="allowPartial"
          :title="pickerTitle"
          :branch-name="branchName"
          :multi-branch="multiBranch"
          :available-branches="availableBranches"
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

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    subscriptionId: number;
    branchId: number;
    branchName: string;
    /**
     * Upper bound for selectable anchors. `null` means no upper bound
     * (legacy flexible plans like PROGRAMA 3/6 MESES with classesPerWeek=null).
     */
    requiredCount: number | null;
    currentScheduleIds: number[];
    /** When true (flexible plans), 0..requiredCount anchors allowed. */
    allowPartial?: boolean;
    /**
     * When true, the picker shows a sede selector so the admin can mix
     * anchors across branches (same country only). Mirrors plan.multiBranch.
     */
    multiBranch?: boolean;
    /**
     * Branches the admin may pick anchors from when multiBranch=true.
     * Typically scoped to the same country as the subscription's branch.
     */
    availableBranches?: Array<{ id: number; name: string }>;
  }>(),
  { allowPartial: false, multiBranch: false }
);

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

const pickerTitle = computed(() =>
  props.allowPartial ? 'Turnos fijos (opcional)' : 'Nuevos turnos fijos'
);

const canSubmit = computed(() => {
  const count = selectedIds.value.length;
  if (props.allowPartial) {
    if (props.requiredCount !== null && count > props.requiredCount) return false;
  } else if (count !== props.requiredCount) {
    return false;
  }
  const current = new Set(props.currentScheduleIds);
  const same =
    count === props.currentScheduleIds.length && selectedIds.value.every((id) => current.has(id));
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
    // Pull deferred-start dates from the picker (admin clicked the
    // "event_upcoming" icon on a full cell and confirmed a future date).
    // Empty when no deferral; backend treats undefined the same as {}.
    const startDates = pickerRef.value?.getStartDates() ?? {};
    const hasDeferred = Object.keys(startDates).length > 0;
    await subsApi.changeFixedSchedules(props.subscriptionId, {
      scheduleIds: selectedIds.value,
      reason: reason.value.trim() || undefined,
      scheduleStartDates: hasDeferred ? startDates : undefined,
    });
    if (hasDeferred) {
      const list = Object.entries(startDates)
        .map(([, date]) => formatShort(date))
        .join(', ');
      $q.notify({
        type: 'positive',
        message: `Turnos actualizados. Inicio diferido en: ${list}`,
        timeout: 6000,
      });
    } else {
      $q.notify({ type: 'positive', message: 'Turnos fijos actualizados' });
    }
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

function formatShort(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + 'T12:00:00Z');
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}
</script>
