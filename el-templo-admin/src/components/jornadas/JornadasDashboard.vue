<!--
  Tablero de jornadas del staff (owner/admin): quién está en turno ahora por
  sede, jornadas abiertas sin check-out de días anteriores, KPIs del rango y
  horas por persona. Presentacional: los datos y la recarga los maneja
  CheckInPage (mismos filtros que la tabla "Registro"); el botón "Actualizar"
  solo emite `refresh`.
-->
<template>
  <div>
    <!-- Aviso: jornadas abiertas de días anteriores -->
    <q-banner
      v-if="dashboard && dashboard.staleOpen.length > 0"
      rounded
      class="bg-warning text-white q-mb-md"
    >
      <template #avatar>
        <q-icon name="warning" />
      </template>
      <div class="text-subtitle1 text-weight-bold">
        {{ dashboard.staleOpen.length }}
        {{ dashboard.staleOpen.length === 1 ? 'jornada sin check-out' : 'jornadas sin check-out' }}
      </div>
      <div class="text-body2">Quedaron abiertas en días anteriores y nadie las cerró.</div>
      <ul class="q-my-sm q-pl-md">
        <li v-for="s in dashboard.staleOpen" :key="s.shiftId">
          {{ s.userName }} — {{ s.branchName }} — {{ formatShiftDate(s.shiftDate) }} (entró
          {{ formatTime(s.checkedInAt) }})
        </li>
      </ul>
    </q-banner>

    <!-- En turno ahora -->
    <div class="row items-center q-mb-sm">
      <div class="text-h6">En turno ahora</div>
      <q-space />
      <q-btn
        flat
        no-caps
        dense
        color="primary"
        icon="refresh"
        label="Actualizar"
        :loading="loading"
        @click="emit('refresh')"
      />
    </div>

    <div v-if="loading && !dashboard" class="row q-col-gutter-md q-mb-md">
      <div v-for="n in 3" :key="n" class="col-12 col-sm-6 col-md-4">
        <q-card flat bordered>
          <q-card-section>
            <q-skeleton type="text" width="50%" />
            <q-skeleton type="text" width="70%" class="q-mt-sm" />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <div v-else-if="dashboard" class="row q-col-gutter-md q-mb-md">
      <div v-for="group in openByBranch" :key="group.id" class="col-12 col-sm-6 col-md-4">
        <q-card flat bordered class="full-height">
          <q-card-section class="q-pb-xs">
            <div class="row items-center no-wrap">
              <q-icon name="storefront" size="20px" class="q-mr-sm" color="primary" />
              <span class="text-subtitle2">{{ group.name }}</span>
            </div>
          </q-card-section>
          <q-card-section class="q-pt-xs">
            <div v-if="group.shifts.length === 0" class="text-grey-6">—</div>
            <div
              v-for="s in group.shifts"
              :key="s.shiftId"
              class="row items-center no-wrap q-py-xs"
            >
              <q-icon name="schedule" color="positive" size="18px" class="q-mr-sm" />
              <span class="col ellipsis">{{ s.userName }}</span>
              <span class="text-caption text-grey-7">desde {{ formatTime(s.checkedInAt) }}</span>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div v-if="openByBranch.length === 0" class="col-12 text-grey-7">
        No hay sedes en el alcance seleccionado.
      </div>
    </div>

    <!-- KPIs del rango -->
    <div class="text-h6 q-mb-sm">Resumen del período</div>
    <div class="row q-col-gutter-md q-mb-md">
      <div v-for="kpi in kpiCards" :key="kpi.key" class="col-12 col-sm-4">
        <q-card flat bordered>
          <q-card-section>
            <div class="row items-center no-wrap q-mb-xs">
              <q-icon :name="kpi.icon" size="24px" class="q-mr-sm" color="primary" />
              <span class="text-caption text-grey-7">{{ kpi.label }}</span>
            </div>
            <q-skeleton v-if="!dashboard" type="text" width="40%" height="32px" />
            <div v-else class="text-h5 text-weight-bold">{{ kpi.value }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Horas por persona -->
    <div class="text-h6 q-mb-sm">Horas por persona</div>
    <q-table
      :rows="dashboard?.byPerson ?? []"
      :columns="personColumns"
      row-key="userId"
      :loading="loading"
      :pagination="{ rowsPerPage: 20, sortBy: 'totalMinutes', descending: true }"
      :rows-per-page-options="[10, 20, 50]"
      flat
      bordered
      class="q-mb-lg"
    >
      <template #no-data>
        <div class="full-width text-center text-grey-7 q-pa-md">Sin jornadas en el período.</div>
      </template>
      <template #body-cell-branchNames="props">
        <q-td :props="props">{{ props.row.branchNames.join(', ') }}</q-td>
      </template>
      <template #body-cell-totalMinutes="props">
        <q-td :props="props">{{ formatDuration(props.row.totalMinutes) }}</q-td>
      </template>
    </q-table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { QTableProps } from 'quasar';
import type {
  StaffAttendanceDashboard,
  StaffDashboardOpenShift,
} from 'src/composables/useStaffAttendanceApi';
import {
  formatTime,
  formatDuration,
  formatHoursDecimal,
  formatShiftDate,
} from 'src/utils/jornada-format';

const props = defineProps<{
  dashboard: StaffAttendanceDashboard | null;
  loading: boolean;
}>();

const emit = defineEmits<{ (e: 'refresh'): void }>();

/** Todas las sedes del alcance, las vacías incluidas (se pintan con "—"). */
const openByBranch = computed(() => {
  const dashboard = props.dashboard;
  if (!dashboard) return [];
  const byBranch = new Map<number, StaffDashboardOpenShift[]>();
  for (const s of dashboard.openNow) {
    const list = byBranch.get(s.branchId) ?? [];
    list.push(s);
    byBranch.set(s.branchId, list);
  }
  return dashboard.branches.map((b) => ({
    id: b.id,
    name: b.name,
    shifts: byBranch.get(b.id) ?? [],
  }));
});

const kpiCards = computed(() => {
  const totals = props.dashboard?.totals;
  return [
    { key: 'shifts', label: 'Jornadas', icon: 'event_available', value: totals?.shifts ?? 0 },
    {
      key: 'hours',
      label: 'Horas totales',
      icon: 'timer',
      value: formatHoursDecimal(totals?.totalMinutes ?? 0),
    },
    {
      key: 'open',
      label: 'Abiertas en el período',
      icon: 'pending_actions',
      value: totals?.openShifts ?? 0,
    },
  ];
});

const personColumns: QTableProps['columns'] = [
  { name: 'userName', label: 'Persona', field: 'userName', align: 'left', sortable: true },
  { name: 'branchNames', label: 'Sedes', field: 'branchNames', align: 'left' },
  { name: 'shifts', label: 'Jornadas', field: 'shifts', align: 'center', sortable: true },
  {
    name: 'totalMinutes',
    label: 'Horas',
    field: 'totalMinutes',
    align: 'center',
    sortable: true,
  },
];
</script>
