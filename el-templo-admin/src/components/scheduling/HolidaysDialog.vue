<template>
  <q-dialog :model-value="show" @update:model-value="$emit('update:show', $event)">
    <q-card style="min-width: 500px; max-width: 600px">
      <q-card-section>
        <div class="text-h6">Gestionar Feriados</div>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <q-select
          v-model="holidayCountry"
          :options="countryOptions"
          label="Pais"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="loadHolidays"
        />
      </q-card-section>

      <q-banner class="bg-amber-1 text-amber-9 q-mx-md q-mb-sm" dense rounded>
        <template #avatar>
          <q-icon name="warning" color="amber-9" />
        </template>
        Al agregar un feriado, las reservas existentes para ese dia se cancelan automaticamente
      </q-banner>

      <q-card-section class="q-px-none q-py-sm" style="max-height: 300px; overflow-y: auto">
        <q-list separator>
          <q-item v-if="loadingHolidays" class="flex flex-center q-pa-lg">
            <q-spinner-dots size="30px" color="primary" />
          </q-item>

          <q-item v-else-if="holidays.length === 0">
            <q-item-section class="text-grey-5 text-italic text-center">
              Sin feriados registrados
            </q-item-section>
          </q-item>

          <q-item v-for="h in holidays" :key="h.id">
            <q-item-section>
              <q-item-label>{{ h.name }}</q-item-label>
              <q-item-label caption>{{ formatHolidayDate(h.date) }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn
                flat
                dense
                round
                icon="delete"
                color="negative"
                size="sm"
                @click="onRemoveHoliday(h)"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Nuevo feriado</div>
        <div class="row q-gutter-sm">
          <q-input
            v-model="holidayForm.date"
            label="Fecha"
            dense
            outlined
            type="date"
            class="col"
          />
          <q-input v-model="holidayForm.name" label="Nombre" dense outlined class="col" />
          <q-btn
            icon="add"
            color="primary"
            dense
            :disable="!holidayForm.date || !holidayForm.name.trim()"
            @click="onAddHoliday"
          />
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cerrar" color="grey-7" @click="$emit('update:show', false)" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import type { HolidayRecord } from 'src/types/scheduling';

const log = createLogger('HolidaysDialog');
const $q = useQuasar();
const schedulingApi = useSchedulingApi();

// ─── Props & Emits ──────────────────────────────────────────────────────────

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  'update:show': [value: boolean];
  'holidays-changed': [];
}>();

// ─── State ──────────────────────────────────────────────────────────────────

const holidays = ref<HolidayRecord[]>([]);
const loadingHolidays = ref(false);
const holidayCountry = ref('AR');
const holidayForm = ref({ date: '', name: '' });

const countryOptions = [
  { label: 'Argentina', value: 'AR' },
  { label: 'España', value: 'ES' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatHolidayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ─── Data Loading ───────────────────────────────────────────────────────────

async function loadHolidays() {
  loadingHolidays.value = true;
  try {
    const year = new Date().getFullYear();
    holidays.value = await schedulingApi.listHolidays({
      country: holidayCountry.value,
      year,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading holidays', { error: message });
  } finally {
    loadingHolidays.value = false;
  }
}

// ─── Holiday Management ─────────────────────────────────────────────────────

async function onAddHoliday() {
  if (!holidayForm.value.date || !holidayForm.value.name.trim()) return;
  try {
    await schedulingApi.addHoliday({
      country: holidayCountry.value,
      date: holidayForm.value.date,
      name: holidayForm.value.name,
    });
    $q.notify({ type: 'positive', message: 'Feriado agregado' });
    holidayForm.value = { date: '', name: '' };
    await loadHolidays();
    emit('holidays-changed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error adding holiday', { error: message });
    $q.notify({ type: 'negative', message: 'Error agregando feriado' });
  }
}

async function onRemoveHoliday(h: HolidayRecord) {
  $q.dialog({
    title: 'Eliminar feriado',
    message: `Eliminar "${h.name}" del ${formatHolidayDate(h.date)}?`,
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Eliminar', color: 'negative' },
  }).onOk(async () => {
    try {
      await schedulingApi.removeHoliday(h.id);
      $q.notify({ type: 'positive', message: 'Feriado eliminado' });
      await loadHolidays();
      emit('holidays-changed');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error removing holiday', { error: message });
      $q.notify({ type: 'negative', message: 'Error eliminando feriado' });
    }
  });
}

// ─── Watchers ───────────────────────────────────────────────────────────────

// Load holidays when dialog opens
watch(
  () => props.show,
  (val) => {
    if (val) {
      loadHolidays();
    }
  }
);
</script>
