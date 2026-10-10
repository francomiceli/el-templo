<!--
  (2026-10-08)
  Forzar el check-out de una jornada abierta de OTRA persona (owner/admin).
  Una jornada colgada bloquea el check-in de esa persona en todas las sedes.
  Pide fecha + hora de salida y un motivo obligatorio; el server deja el
  checklist en NULL (cierre no normal) y registra la auditoría.
-->
<template>
  <q-dialog :model-value="modelValue" persistent @update:model-value="onToggle">
    <q-card style="min-width: 340px; max-width: 95vw; width: 460px">
      <q-card-section>
        <div class="text-h6">Forzar salida</div>
      </q-card-section>

      <q-card-section v-if="target" class="q-pt-none">
        <div class="text-body1 text-weight-medium">{{ target.userName }}</div>
        <div class="text-body2 text-grey-7">
          {{ target.branchName }} · entró
          <template v-if="target.shiftDate">{{ formatShiftDate(target.shiftDate) }} </template>
          {{ formatTime(target.checkedInAt) }}
        </div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <div class="row q-col-gutter-sm">
          <div class="col-12 col-sm-6">
            <q-input v-model="outDate" type="date" label="Fecha de salida" dense outlined />
          </div>
          <div class="col-12 col-sm-6">
            <q-input
              v-model="outTime"
              type="time"
              label="Hora de salida"
              dense
              outlined
              :hint="isPastDay ? 'p. ej. el fin de su última clase' : undefined"
            />
          </div>
        </div>
        <div v-if="dateError" class="text-negative text-caption q-mt-xs">{{ dateError }}</div>

        <q-input
          v-model="reason"
          type="textarea"
          label="Motivo"
          dense
          outlined
          autogrow
          class="q-mt-md"
          maxlength="255"
          counter
          :error="reasonTouched && !reasonValid"
          error-message="El motivo es obligatorio (mínimo 3 caracteres)"
          @blur="reasonTouched = true"
        />
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat no-caps label="Cancelar" :disable="saving" @click="close" />
        <q-btn
          color="negative"
          no-caps
          icon="logout"
          label="Forzar salida"
          :loading="saving"
          :disable="!canSubmit"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import {
  useStaffAttendanceApi,
  type ForceCheckoutTarget,
} from 'src/composables/useStaffAttendanceApi';
import { formatShiftDate, formatTime, toLocalIsoDate } from 'src/utils/jornada-format';

const props = defineProps<{
  modelValue: boolean;
  target: ForceCheckoutTarget | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'forced'): void;
}>();

const log = createLogger('ForceCheckoutDialog');
const $q = useQuasar();
const attendanceApi = useStaffAttendanceApi();

const REASON_MIN = 3;
const REASON_MAX = 255;
/** Mismo margen de reloj que el server. */
const FUTURE_TOLERANCE_MS = 2 * 60 * 1000;

const outDate = ref('');
const outTime = ref('');
const reason = ref('');
const reasonTouched = ref(false);
const saving = ref(false);

const isPastDay = computed(
  () => !!props.target?.shiftDate && props.target.shiftDate !== toLocalIsoDate(new Date())
);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Al abrir: jornada de hoy → ahora. Jornada de un día anterior → su fecha y la
// hora VACÍA (la tiene que elegir el admin, no se adivina).
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    const now = new Date();
    reason.value = '';
    reasonTouched.value = false;
    if (isPastDay.value && props.target?.shiftDate) {
      outDate.value = props.target.shiftDate;
      outTime.value = '';
    } else {
      outDate.value = toLocalIsoDate(now);
      outTime.value = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    }
  }
);

/** Fecha/hora elegidas interpretadas en la hora LOCAL del navegador. */
const checkedOutAt = computed<Date | null>(() => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(outDate.value);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(outTime.value);
  if (!dateMatch || !timeMatch) return null;
  const d = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2])
  );
  return Number.isNaN(d.getTime()) ? null : d;
});

const dateError = computed<string | null>(() => {
  const out = checkedOutAt.value;
  if (!out || !props.target) return null;
  if (out.getTime() < new Date(props.target.checkedInAt).getTime()) {
    return 'La salida no puede ser anterior a la entrada';
  }
  if (out.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    return 'La salida no puede estar en el futuro';
  }
  return null;
});

const trimmedReason = computed(() => reason.value.trim());
const reasonValid = computed(
  () => trimmedReason.value.length >= REASON_MIN && trimmedReason.value.length <= REASON_MAX
);

const canSubmit = computed(
  () =>
    !!props.target && checkedOutAt.value !== null && dateError.value === null && reasonValid.value
);

function onToggle(value: boolean) {
  if (!saving.value) emit('update:modelValue', value);
}

function close() {
  emit('update:modelValue', false);
}

async function submit() {
  const out = checkedOutAt.value;
  if (!props.target || !out || !canSubmit.value) return;
  saving.value = true;
  try {
    await attendanceApi.forceCheckOut(props.target.shiftId, {
      checkedOutAt: out.toISOString(),
      reason: trimmedReason.value,
    });
    $q.notify({ type: 'positive', message: `Salida forzada de ${props.target.userName}` });
    log.info('Check-out forzado', { shiftId: props.target.shiftId });
    emit('update:modelValue', false);
    emit('forced');
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo forzar la salida');
    if (isExpectedClientError(err)) {
      log.warn('Forzar salida rechazado', { error: message, shiftId: props.target.shiftId });
    } else {
      log.error('Error forzando la salida', { error: message, shiftId: props.target.shiftId });
    }
    $q.notify({ type: 'negative', message });
  } finally {
    saving.value = false;
  }
}
</script>
