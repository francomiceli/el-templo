<template>
  <q-page class="q-pa-md" style="max-width: 900px; margin: 0 auto">
    <div class="row items-center q-mb-md">
      <div class="text-h5 text-weight-bold">Sesiones de Prueba</div>
      <q-space />
      <q-btn
        v-if="groups.length > 0"
        flat
        dense
        icon="content_copy"
        label="Copiar para WhatsApp"
        color="primary"
        @click="copyForWhatsapp"
      />
    </div>

    <div class="text-body2 text-grey-7 q-mb-md">
      Lista de sesiones de prueba para un día y turno. Usar este listado para el aviso a los profes
      antes de cada turno.
    </div>

    <!-- Filters -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row q-col-gutter-md items-center">
        <div class="col-12 col-sm-4">
          <q-input
            v-model="dateInput"
            type="date"
            label="Fecha"
            outlined
            dense
            :disable="loading"
          />
        </div>
        <div class="col-12 col-sm-4">
          <q-select
            v-model="shift"
            :options="shiftOptions"
            option-value="value"
            option-label="label"
            emit-value
            map-options
            label="Turno"
            outlined
            dense
            :disable="loading"
          />
        </div>
        <div class="col-12 col-sm-4">
          <q-btn color="primary" :loading="loading" label="Buscar" @click="load" />
        </div>
      </q-card-section>
    </q-card>

    <!-- Results -->
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
      <div class="text-body2 text-grey-7 q-mb-sm">
        Total: {{ totalTrials }} {{ totalTrials === 1 ? 'alumno' : 'alumnos' }} en
        {{ groups.length }} {{ groups.length === 1 ? 'sede' : 'sedes' }}
      </div>
      <q-card v-for="group in groups" :key="group.branchId" flat bordered class="q-mb-md">
        <q-card-section class="bg-grey-2 q-py-sm">
          <div class="text-weight-bold">
            {{ group.branchName }}
            <span class="text-caption text-grey-7 q-ml-sm"> ({{ group.trials.length }}) </span>
          </div>
        </q-card-section>
        <q-list separator>
          <q-item v-for="trial in group.trials" :key="trial.bookingId">
            <q-item-section side>
              <div class="text-weight-bold text-primary">{{ trial.startTime }}</div>
            </q-item-section>
            <q-item-section>
              <q-item-label> {{ trial.firstName }} {{ trial.lastName }} </q-item-label>
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
                icon="chat"
                color="green-7"
                size="sm"
                @click="openWhatsapp(trial.phone!)"
              >
                <q-tooltip>Abrir WhatsApp</q-tooltip>
              </q-btn>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import type { TrialListBranchGroup } from 'src/types/scheduling';

const log = createLogger('SesionesDePruebaPage');
const $q = useQuasar();
const schedulingApi = useSchedulingApi();

type Shift = 'TM' | 'TT' | 'all';

const shiftOptions: Array<{ label: string; value: Shift }> = [
  { label: 'Día completo', value: 'all' },
  { label: 'Turno mañana (TM)', value: 'TM' },
  { label: 'Turno tarde (TT)', value: 'TT' },
];

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

onMounted(() => {
  void load();
});
</script>
