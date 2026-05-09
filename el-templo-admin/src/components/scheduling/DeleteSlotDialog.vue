<template>
  <q-dialog :model-value="show" persistent @update:model-value="onShowUpdate">
    <q-card style="min-width: 460px; max-width: 560px">
      <q-card-section>
        <div class="text-h6 text-negative row items-center q-gutter-sm">
          <q-icon name="delete" />
          Eliminar horario
        </div>
        <div v-if="slotInfo" class="text-subtitle2 q-mt-xs">
          {{ DAY_LABELS[slotInfo.dayOfWeek] }} · {{ slotInfo.startTime }}-{{ slotInfo.endTime }} ·
          {{ slotInfo.activityName }} · {{ slotInfo.branchName }}
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <div class="text-body2 q-mb-sm">
          Eliminá esta clase de la grilla a partir de la fecha que elijas. Las reservas activas con
          fecha &ge; a la elegida se cancelan; el histórico anterior y los check-ins ya hechos
          quedan intactos.
        </div>

        <q-input
          v-model="fromDate"
          label="Eliminar desde (incluida)"
          outlined
          dense
          readonly
          mask="####-##-##"
          :rules="[(v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || 'Fecha inválida']"
        >
          <template #append>
            <q-icon name="event" class="cursor-pointer">
              <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                <q-date
                  :model-value="fromDate.replaceAll('-', '/')"
                  @update:model-value="onPickDate"
                  minimal
                  first-day-of-week="1"
                />
              </q-popup-proxy>
            </q-icon>
          </template>
        </q-input>

        <div v-if="loadingPreview" class="flex flex-center q-mt-md">
          <q-spinner-dots size="32px" color="primary" />
        </div>

        <div v-else-if="preview" class="q-mt-md">
          <q-banner v-if="preview.cancelledBookings === 0" class="bg-grey-3 text-grey-8" dense>
            <template #avatar>
              <q-icon name="info" color="grey-8" />
            </template>
            No hay reservas activas a partir de esa fecha. Se va a desactivar el horario sin afectar
            a nadie.
          </q-banner>

          <q-banner v-else class="bg-orange-1 text-orange-10" dense>
            <template #avatar>
              <q-icon name="warning" color="orange-10" />
            </template>
            <div class="text-weight-medium">
              {{ preview.cancelledBookings }} reserva{{
                preview.cancelledBookings === 1 ? '' : 's'
              }}
              se va{{ preview.cancelledBookings === 1 ? '' : 'n' }} a cancelar
            </div>
            <div class="text-caption">
              Miembros fijos afectados:
              {{ preview.affectedFixedMembers }}
              <span v-if="preview.creditsToGrant > 0">
                · {{ preview.creditsToGrant }} crédito{{ preview.creditsToGrant === 1 ? '' : 's' }}
                de reposición a otorgar
              </span>
              <template v-if="preview.affectedFlexibleMembers > 0">
                · Flexibles: {{ preview.affectedFlexibleMembers }}
              </template>
            </div>
          </q-banner>

          <div v-if="preview.sampleMembers.length > 0" class="q-mt-sm">
            <div class="text-caption text-grey-8 q-mb-xs">
              {{
                preview.sampleMembers.length === preview.cancelledBookings
                  ? 'Miembros afectados:'
                  : `Primeros ${preview.sampleMembers.length} miembros:`
              }}
            </div>
            <q-chip
              v-for="(m, idx) in preview.sampleMembers"
              :key="idx"
              dense
              :color="m.planType === 'fixed' ? 'orange-2' : 'grey-3'"
              :text-color="m.planType === 'fixed' ? 'orange-10' : 'grey-9'"
            >
              {{ m.memberName }}
              <span class="text-caption q-ml-xs">
                ({{ m.planType === 'fixed' ? 'fijo' : 'flexible' }})
              </span>
            </q-chip>
          </div>
        </div>

        <div v-if="errorMessage" class="text-negative text-caption q-mt-sm">
          {{ errorMessage }}
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Cancelar" @click="onCancel" :disable="submitting" />
        <q-btn
          color="negative"
          icon="delete"
          label="Eliminar"
          :loading="submitting"
          :disable="!preview || loadingPreview"
          @click="onConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import { todayInTz } from 'src/utils/tz';
import { DAY_LABELS } from 'src/types/scheduling';
import type { DayOfWeek } from 'src/types/scheduling';

interface SlotInfo {
  scheduleId: number;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  activityName: string;
  branchName: string;
}

interface Preview {
  cancelledBookings: number;
  affectedFixedMembers: number;
  affectedFlexibleMembers: number;
  creditsToGrant: number;
  sampleMembers: Array<{ memberName: string; planType: 'fixed' | 'flexible' }>;
}

const props = defineProps<{
  show: boolean;
  slotInfo: SlotInfo | null;
  branchTimezone: string;
}>();

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
  (e: 'deleted'): void;
}>();

const $q = useQuasar();
const log = createLogger('DeleteSlotDialog');
const schedulingApi = useSchedulingApi();

const fromDate = ref('');
const preview = ref<Preview | null>(null);
const loadingPreview = ref(false);
const submitting = ref(false);
const errorMessage = ref<string | null>(null);

watch(
  () => props.show,
  (open) => {
    if (open) {
      fromDate.value = todayInTz(props.branchTimezone);
      preview.value = null;
      errorMessage.value = null;
      void loadPreview();
    }
  }
);

watch(fromDate, () => {
  if (props.show) void loadPreview();
});

async function loadPreview() {
  if (!props.slotInfo) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate.value)) return;
  loadingPreview.value = true;
  errorMessage.value = null;
  try {
    preview.value = await schedulingApi.previewScheduleDeletion(
      props.slotInfo.scheduleId,
      fromDate.value
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading deletion preview', { error: message });
    errorMessage.value = 'No se pudo calcular el impacto. Intentá de nuevo.';
  } finally {
    loadingPreview.value = false;
  }
}

function onPickDate(val: string | null) {
  if (!val) return;
  fromDate.value = val.replaceAll('/', '-');
}

async function onConfirm() {
  if (!props.slotInfo) return;
  submitting.value = true;
  errorMessage.value = null;
  try {
    const result = await schedulingApi.deleteScheduleFromDate(
      props.slotInfo.scheduleId,
      fromDate.value
    );
    const creditsMsg =
      result.creditsGranted > 0
        ? ` · ${result.creditsGranted} crédito${
            result.creditsGranted === 1 ? '' : 's'
          } otorgado${result.creditsGranted === 1 ? '' : 's'}`
        : '';
    const cancelMsg =
      result.cancelledBookings > 0
        ? `${result.cancelledBookings} reserva${
            result.cancelledBookings === 1 ? '' : 's'
          } cancelada${result.cancelledBookings === 1 ? '' : 's'}${creditsMsg}`
        : 'Horario eliminado sin reservas afectadas';
    $q.notify({
      type: 'positive',
      message: `Horario eliminado. ${cancelMsg}`,
      timeout: 6000,
    });
    emit('deleted');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error deleting schedule', { error: message });
    errorMessage.value = 'Error eliminando el horario. Intentá de nuevo.';
  } finally {
    submitting.value = false;
  }
}

function onCancel() {
  if (submitting.value) return;
  emit('update:show', false);
}

function onShowUpdate(v: boolean) {
  if (!v && submitting.value) return;
  emit('update:show', v);
}
</script>
