<template>
  <div class="row q-col-gutter-sm items-end no-wrap">
    <!-- Mode toggle: mes (default) ↔ por día (D-03) -->
    <div class="col-auto">
      <q-btn-toggle
        v-model="mode"
        :options="MODE_OPTIONS"
        dense
        unelevated
        no-caps
        toggle-color="primary"
        color="grey-3"
        text-color="grey-8"
        @update:model-value="onModeChange"
      />
    </div>

    <!-- Modo mes -->
    <div v-if="mode === 'month'" class="col">
      <!-- @vue-ignore: "month" is valid HTML5 but not in Quasar's type union -->
      <q-input
        v-model="selectedMonth"
        :label="monthLabel"
        type="month"
        dense
        outlined
        @update:model-value="emitMonthRange"
      />
    </div>

    <!-- Modo por día (rango desde–hasta) -->
    <template v-else>
      <div class="col">
        <q-input
          v-model="rangeFrom"
          label="Desde"
          type="date"
          dense
          outlined
          @update:model-value="emitDayRange"
        />
      </div>
      <div class="col">
        <q-input
          v-model="rangeTo"
          label="Hasta"
          type="date"
          dense
          outlined
          @update:model-value="emitDayRange"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { monthToRange, type DateRangeValue } from 'src/utils/date-range';

// =========================================================================
// Shared date control (Phase 152, D-03). Defaults to month mode (replicating
// the old `selectedMonth`/`dateRange` block) with a toggle to a free day range.
// BOTH modes emit the SAME `{ dateFrom, dateTo }` contract via v-model so the
// consuming loaders (loadTransactions / loadHistory) never change. Being a
// component (not a composable) it carries no onUnmounted (project rule).
// =========================================================================

const props = withDefaults(
  defineProps<{
    modelValue?: DateRangeValue;
    monthLabel?: string;
  }>(),
  { modelValue: undefined, monthLabel: 'Período' }
);

const emit = defineEmits<{
  'update:modelValue': [value: DateRangeValue];
}>();

type Mode = 'month' | 'days';

const MODE_OPTIONS = [
  { label: 'Por mes', value: 'month' as Mode },
  { label: 'Por día', value: 'days' as Mode },
];

// Derive the initial month from the incoming modelValue when it looks like a
// full calendar month (day-01 start); otherwise fall back to the current month.
function deriveInitialMonth(): string {
  const from = props.modelValue?.dateFrom;
  if (from && /^\d{4}-\d{2}-01$/.test(from)) return from.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

const mode = ref<Mode>('month');
const selectedMonth = ref<string>(deriveInitialMonth());
const rangeFrom = ref<string>(props.modelValue?.dateFrom ?? '');
const rangeTo = ref<string>(props.modelValue?.dateTo ?? '');

function emitMonthRange(): void {
  emit('update:modelValue', monthToRange(selectedMonth.value));
}

function emitDayRange(): void {
  emit('update:modelValue', {
    dateFrom: rangeFrom.value || undefined,
    dateTo: rangeTo.value || undefined,
  });
}

function onModeChange(next: Mode): void {
  if (next === 'month') {
    emitMonthRange();
    return;
  }
  // Seed the day range from the current month so switching modes never blanks
  // the list before the user picks explicit days.
  if (!rangeFrom.value || !rangeTo.value) {
    const seeded = monthToRange(selectedMonth.value);
    rangeFrom.value = seeded.dateFrom ?? '';
    rangeTo.value = seeded.dateTo ?? '';
  }
  emitDayRange();
}
</script>
