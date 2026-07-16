<template>
  <q-dialog :model-value="show" @update:model-value="$emit('update:show', $event)" persistent>
    <q-card style="width: 720px; max-width: 95vw; position: relative">
      <q-btn
        flat
        dense
        round
        icon="close"
        class="absolute-top-right q-ma-sm"
        style="z-index: 1"
        @click="$emit('update:show', false)"
      />
      <q-card-section class="q-pb-sm q-pr-xl">
        <div class="text-h6">Sesiones de Prueba</div>
        <div class="text-caption text-grey-7 q-mt-xs">
          Lista de sesiones de prueba para un día y turno. Usar este listado para el aviso a los
          profes antes de cada turno.
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section class="q-py-sm">
        <div class="row items-center q-mb-lg q-gutter-sm">
          <q-btn icon="chevron_left" flat round @click="shiftDay(-1)" />
          <div class="text-subtitle1">{{ formattedDateLabel }}</div>
          <q-btn icon="chevron_right" flat round @click="shiftDay(1)" />
          <q-btn icon="event" flat round dense>
            <q-popup-proxy
              v-model="showDatePicker"
              cover
              transition-show="scale"
              transition-hide="scale"
            >
              <q-date
                :model-value="dateInput"
                @update:model-value="onDatePicked"
                minimal
                first-day-of-week="1"
              />
            </q-popup-proxy>
          </q-btn>
          <q-space />
          <q-btn-toggle
            v-model="shift"
            :options="shiftToggleOptions"
            color="grey-3"
            text-color="grey-9"
            toggle-color="primary"
            toggle-text-color="white"
            padding="xs sm"
            no-caps
            dense
            unelevated
            :disable="loading"
          />
        </div>
      </q-card-section>

      <q-card-section class="q-pt-none" style="max-height: 60vh; overflow-y: auto">
        <div v-if="loading" class="flex flex-center q-pa-lg">
          <q-spinner-dots size="40px" color="primary" />
        </div>

        <div v-else-if="!hasLoadedOnce" class="text-center q-pa-lg text-grey-5 text-italic">
          Seleccioná fecha y turno para ver la lista
        </div>

        <div v-else-if="groups.length === 0" class="text-center q-pa-lg text-grey-5 text-italic">
          No hay sesiones de prueba para este día y turno
        </div>

        <div v-else>
          <div class="row items-center q-mb-sm">
            <div class="text-body2 text-grey-7">
              Total: {{ totalTrials }} {{ totalTrials === 1 ? 'alumno' : 'alumnos' }} en
              {{ groups.length }} {{ groups.length === 1 ? 'sede' : 'sedes' }}
            </div>
            <q-space />
            <q-btn
              flat
              dense
              icon="content_copy"
              label="Copiar para WhatsApp"
              color="primary"
              @click="copyForWhatsapp"
            />
          </div>
          <q-card v-for="group in groups" :key="group.branchId" flat bordered class="q-mb-md">
            <q-card-section class="bg-grey-2 q-py-sm">
              <div class="text-weight-bold">
                {{ group.branchName }}
                <span class="text-caption text-grey-7 q-ml-sm">({{ group.trials.length }})</span>
              </div>
            </q-card-section>
            <q-list separator>
              <q-item v-for="trial in group.trials" :key="trial.bookingId">
                <q-item-section side>
                  <div class="text-weight-bold text-primary">{{ trial.startTime }}</div>
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ trial.firstName }} {{ trial.lastName }}</q-item-label>
                  <q-item-label caption>
                    {{ trial.activityName }}
                    <span v-if="trial.phone" class="q-ml-sm">· {{ trial.phone }}</span>
                  </q-item-label>
                </q-item-section>
                <q-item-section v-if="trial.phone" side>
                  <q-btn
                    flat
                    dense
                    round
                    color="green-7"
                    size="sm"
                    @click="openWhatsapp(trial.phone!)"
                  >
                    <WhatsappIcon />
                    <q-tooltip>Abrir WhatsApp</q-tooltip>
                  </q-btn>
                </q-item-section>
                <!-- Reprogramar: mueve la prueba a otra fecha+turno en un
                     paso (endpoint transaccional). Coexiste con "quitar". -->
                <q-item-section side>
                  <q-btn
                    flat
                    dense
                    round
                    icon="event_repeat"
                    color="primary"
                    size="sm"
                    :disable="reschedulingBookingId === trial.bookingId"
                    @click="openReschedule(trial, group.branchId)"
                  >
                    <q-tooltip>Reprogramar sesión de prueba</q-tooltip>
                  </q-btn>
                </q-item-section>
                <!-- Quitar la sesión de prueba. Cancelar el booking
                     deja al alumno disponible para una nueva (el guard
                     de one-trial-per-lifetime excluye cancelled). -->
                <q-item-section side>
                  <q-btn
                    flat
                    dense
                    round
                    icon="event_busy"
                    color="negative"
                    size="sm"
                    :disable="removingBookingId === trial.bookingId"
                    :loading="removingBookingId === trial.bookingId"
                    @click="confirmRemoveTrial(trial)"
                  >
                    <q-tooltip>Quitar sesión de prueba</q-tooltip>
                  </q-btn>
                </q-item-section>
              </q-item>
            </q-list>
          </q-card>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>

  <RescheduleTrialDialog
    v-model:show="showRescheduleDialog"
    :trial="rescheduleTarget"
    :branch-id="rescheduleBranchId"
    @rescheduled="onRescheduled"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import type { TrialListBranchGroup, TrialListItem } from 'src/types/scheduling';
import { extractError } from 'src/utils/extract-error';
import WhatsappIcon from 'src/components/icons/WhatsappIcon.vue';
import RescheduleTrialDialog from 'src/components/scheduling/RescheduleTrialDialog.vue';

const log = createLogger('SesionesDePruebaDialog');
const $q = useQuasar();
const schedulingApi = useSchedulingApi();

const props = defineProps<{
  show: boolean;
  // Optional date (YYYY-MM-DD). When provided and the dialog transitions to
  // open, the modal seeds dateInput with this instead of today's date so
  // deep-links from AlumnoDetailPage land on the alumno's trial day. Also
  // forces shift='all' for that open so a TM trial isn't hidden when an
  // admin opens it after 13:00.
  initialDate?: string;
}>();

defineEmits<{
  'update:show': [value: boolean];
}>();

type Shift = 'TM' | 'TT' | 'all';

const shiftOptions: Array<{ label: string; value: Shift }> = [
  { label: 'Día completo', value: 'all' },
  { label: 'Turno mañana (TM)', value: 'TM' },
  { label: 'Turno tarde (TT)', value: 'TT' },
];

const shiftToggleOptions: Array<{ label: string; value: Shift }> = [
  { label: 'Turno mañana', value: 'TM' },
  { label: 'Turno tarde', value: 'TT' },
  { label: 'Todos', value: 'all' },
];

const showDatePicker = ref(false);

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Heuristic default: before 13:00 local → TM, else → TT. */
function defaultShift(): Shift {
  return new Date().getHours() < 13 ? 'TM' : 'TT';
}

const dateInput = ref<string>(todayISO());
const shift = ref<Shift>(defaultShift());
const groups = ref<TrialListBranchGroup[]>([]);
const loading = ref(false);
const hasLoadedOnce = ref(false);

const totalTrials = computed(() => groups.value.reduce((acc, g) => acc + g.trials.length, 0));

const formattedDateLabel = computed(() => {
  if (!dateInput.value) return '';
  const d = new Date(dateInput.value + 'T12:00:00');
  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
});

function shiftDay(delta: number): void {
  const d = new Date(dateInput.value + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  dateInput.value = d.toISOString().slice(0, 10);
}

function onDatePicked(val: string | null): void {
  showDatePicker.value = false;
  if (val) {
    // q-date emits "YYYY/MM/DD" — normalize to "YYYY-MM-DD".
    dateInput.value = val.replaceAll('/', '-');
  }
}

async function load(): Promise<void> {
  if (!dateInput.value) {
    $q.notify({ type: 'warning', message: 'Seleccioná una fecha' });
    return;
  }
  loading.value = true;
  try {
    const res = await schedulingApi.listTrials({
      date: dateInput.value,
      shift: shift.value,
    });
    groups.value = res.groups;
    hasLoadedOnce.value = true;
  } catch (err) {
    log.error('Error loading trials', err);
    $q.notify({ type: 'negative', message: 'Error cargando sesiones de prueba' });
  } finally {
    loading.value = false;
  }
}

function openWhatsapp(phone: string): void {
  const cleaned = phone.replace(/[^0-9]/g, '');
  window.open(`https://wa.me/${cleaned}`, '_blank');
}

// Quitar sesión de prueba: confirm + cancel booking + reload listing.
// Cancelled trials don't count toward the one-trial-per-lifetime guard
// (trials-service.ts excludes status='cancelado'), so this frees the
// alumno to be reassigned to a fresh slot.
const removingBookingId = ref<number | null>(null);

function confirmRemoveTrial(trial: TrialListItem): void {
  const fullName = `${trial.firstName} ${trial.lastName}`.trim();
  $q.dialog({
    title: 'Quitar sesión de prueba',
    message: `¿Quitar la sesión de prueba de ${fullName} (${trial.startTime})? El alumno queda disponible para una nueva sesión.`,
    cancel: { flat: true, label: 'Cancelar' },
    ok: { color: 'negative', label: 'Quitar', noCaps: true },
    persistent: true,
  }).onOk(() => {
    void removeTrial(trial);
  });
}

// Reprogramar sesión de prueba (D-03): abre RescheduleTrialDialog sembrado
// con la fila + su sede. El flujo "quitar" de arriba queda intacto; ambos
// coexisten. Al éxito del diálogo, refrescamos la lista (igual que removeTrial).
const showRescheduleDialog = ref(false);
const rescheduleTarget = ref<TrialListItem | null>(null);
const rescheduleBranchId = ref<number | null>(null);
const reschedulingBookingId = ref<number | null>(null);

function openReschedule(trial: TrialListItem, branchId: number): void {
  rescheduleTarget.value = trial;
  rescheduleBranchId.value = branchId;
  reschedulingBookingId.value = trial.bookingId;
  showRescheduleDialog.value = true;
}

function onRescheduled(): void {
  reschedulingBookingId.value = null;
  void load();
}

// Al cerrar el diálogo sin reprogramar, liberar el estado "en curso" de la fila.
watch(showRescheduleDialog, (open) => {
  if (!open) reschedulingBookingId.value = null;
});

async function removeTrial(trial: TrialListItem): Promise<void> {
  removingBookingId.value = trial.bookingId;
  try {
    await schedulingApi.adminRemoveBooking(trial.bookingId);
    $q.notify({ type: 'positive', message: 'Sesión de prueba quitada', timeout: 1500 });
    await load();
  } catch (err: unknown) {
    const message = extractError(err, 'Error al quitar la sesión');
    log.error('Failed to remove trial booking', { error: message, bookingId: trial.bookingId });
    $q.notify({ type: 'negative', message });
  } finally {
    removingBookingId.value = null;
  }
}

function shiftLabel(value: Shift): string {
  return shiftOptions.find((o) => o.value === value)?.label ?? value;
}

function copyForWhatsapp(): void {
  if (groups.value.length === 0) return;
  const lines: string[] = [];
  lines.push(`*Sesiones de Prueba — ${dateInput.value} (${shiftLabel(shift.value)})*`);
  for (const group of groups.value) {
    lines.push('');
    lines.push(`*${group.branchName}* (${group.trials.length})`);
    for (const t of group.trials) {
      const phone = t.phone ? ` · ${t.phone}` : '';
      lines.push(`• ${t.startTime} — ${t.firstName} ${t.lastName}${phone}`);
    }
  }
  const text = lines.join('\n');
  navigator.clipboard
    .writeText(text)
    .then(() => $q.notify({ type: 'positive', message: 'Copiado' }))
    .catch(() => $q.notify({ type: 'negative', message: 'No se pudo copiar al portapapeles' }));
}

// Auto-load when dialog opens. If a parent passed `initialDate` (deep-link
// from AlumnoDetailPage's Sesión de Prueba card), honor it and widen the
// shift filter to 'all' so the trial is visible regardless of its time
// vs the admin's current hour. Otherwise fall back to today's defaults.
watch(
  () => props.show,
  (open) => {
    if (open) {
      if (props.initialDate && /^\d{4}-\d{2}-\d{2}$/.test(props.initialDate)) {
        dateInput.value = props.initialDate;
        shift.value = 'all';
      } else {
        dateInput.value = todayISO();
        shift.value = defaultShift();
      }
      void load();
    }
  }
);

// Re-fetch whenever the user navigates dates or flips the shift toggle so
// the listing always matches the visible filters — no Buscar button needed.
watch([dateInput, shift], () => {
  if (props.show) void load();
});
</script>
