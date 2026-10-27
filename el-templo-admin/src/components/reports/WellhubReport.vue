<!-- Fase 204 (D-16/D-22): reporte único de Wellhub por mes y sede. Visitas validadas
     (las que paga Wellhub) separadas de las marcadas a mano, quiénes vinieron,
     reservas y conversiones a socio con la tasa Wellhub → socio. Sin toggles
     (D-13): es una pestaña de Reportes, nada más. -->
<template>
  <div>
    <!-- ================================================================== -->
    <!-- Filtros: mes y sede -->
    <!-- ================================================================== -->
    <div class="row items-center q-col-gutter-sm q-mb-md">
      <div class="col text-caption text-grey-7">
        Visitas, personas, reservas y conversiones a socio de Wellhub
      </div>
      <div class="col-auto" style="min-width: 170px">
        <q-select
          v-model="month"
          :options="monthOptions"
          label="Mes"
          dense
          outlined
          emit-value
          map-options
          :disable="loading"
        />
      </div>
      <div class="col-auto" style="min-width: 190px">
        <q-select
          v-model="branchId"
          :options="props.branchOptions"
          label="Sede"
          dense
          outlined
          emit-value
          map-options
          :disable="loading"
        />
      </div>
    </div>

    <div v-if="loadError" class="text-negative text-caption q-mb-md">{{ loadError }}</div>

    <div v-if="isEmpty" class="text-center q-pa-lg text-grey-6">
      Sin actividad Wellhub en este mes
    </div>

    <template v-else>
      <!-- ================================================================ -->
      <!-- 1. Visitas y personas -->
      <!-- ================================================================ -->
      <div class="row q-col-gutter-sm q-mb-md">
        <div v-for="card in visitCards" :key="card.key" class="col-6 col-md-3">
          <KpiCard
            :label="card.label"
            :value="card.value"
            :hint="card.hint"
            :title="card.hint"
            :icon="card.icon"
            :active="false"
            :loading="loading"
          />
        </div>
      </div>

      <!-- ================================================================ -->
      <!-- 2. Quiénes vinieron -->
      <!-- ================================================================ -->
      <div class="text-subtitle1 q-mb-sm">Quiénes vinieron</div>
      <div class="q-mb-sm">
        <q-chip dense outline :color="WELLHUB_COLOR" :label="`Nuevos ${people.nuevos}`" />
        <q-chip dense outline :color="WELLHUB_COLOR" :label="`Ex-alumnos ${people.exAlumnos}`" />
        <q-chip dense outline :color="WELLHUB_COLOR" :label="`Socios ${people.socios}`" />
      </div>
      <q-table
        :rows="sortedPeople"
        :columns="peopleColumns"
        row-key="userId"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
        flat
        bordered
        dense
        class="q-mb-lg"
      >
        <template #body-cell-name="cell">
          <q-td :props="cell">
            <router-link :to="`/alumnos/${cell.row.userId}`" class="text-primary">
              {{ cell.row.name }}
            </router-link>
          </q-td>
        </template>
        <template #body-cell-kind="cell">
          <q-td :props="cell">{{ personKindLabel(cell.row.kind) }}</q-td>
        </template>
        <template #no-data>
          <div class="full-width text-center q-pa-md text-grey-6">
            Nadie vino por Wellhub en este mes
          </div>
        </template>
      </q-table>

      <!-- ================================================================ -->
      <!-- 3. Reservas -->
      <!-- ================================================================ -->
      <div class="text-subtitle1 q-mb-sm">Reservas</div>
      <div class="row q-col-gutter-sm q-mb-lg">
        <div v-for="card in bookingCards" :key="card.key" class="col-6 col-md">
          <KpiCard
            :label="card.label"
            :value="card.value"
            :icon="card.icon"
            :active="false"
            :loading="loading"
          />
        </div>
      </div>

      <!-- ================================================================ -->
      <!-- 4. Conversiones a socio -->
      <!-- ================================================================ -->
      <div class="text-subtitle1 q-mb-sm">Conversiones a socio</div>
      <div class="row q-col-gutter-sm q-mb-md">
        <div class="col-6 col-md-3">
          <KpiCard
            label="Conversiones a socio"
            :value="conversions.count"
            icon="how_to_reg"
            :active="false"
            :loading="loading"
          />
        </div>
        <div class="col-6 col-md-3">
          <KpiCard
            label="Tasa Wellhub → socio"
            :value="`${conversions.ratePct}%`"
            hint="Conversiones del mes sobre personas Wellhub del mes"
            title="Conversiones del mes sobre personas Wellhub del mes"
            icon="trending_up"
            :active="false"
            :loading="loading"
          />
        </div>
      </div>
      <q-table
        :rows="conversions.items"
        :columns="conversionColumns"
        :row-key="conversionRowKey"
        :loading="loading"
        :pagination="{ rowsPerPage: 0 }"
        hide-pagination
        flat
        bordered
        dense
      >
        <template #body-cell-name="cell">
          <q-td :props="cell">
            <router-link :to="`/alumnos/${cell.row.userId}`" class="text-primary">
              {{ cell.row.name }}
            </router-link>
          </q-td>
        </template>
        <template #body-cell-localDate="cell">
          <q-td :props="cell">{{ formatDate(cell.row.localDate) }}</q-td>
        </template>
        <template #body-cell-kind="cell">
          <q-td :props="cell">{{ conversionKindLabel(cell.row.kind) }}</q-td>
        </template>
        <template #no-data>
          <div class="full-width text-center q-pa-md text-grey-6">
            Sin conversiones a socio en este mes
          </div>
        </template>
      </q-table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useQuasar, type QTableColumn } from 'quasar';
import { extractError } from 'src/utils/extract-error';
import { formatDate } from 'src/utils/format-date';
import { WELLHUB_COLOR } from 'src/utils/wellhub-label';
import { useWellhubApi } from 'src/composables/useWellhubApi';
import KpiCard from 'src/components/comunicaciones/KpiCard.vue';
import type {
  WellhubPersonKind,
  WellhubReport,
  WellhubReportConversion,
} from 'src/types/wellhub';

const props = defineProps<{
  /** Sedes del selector de la página ("Todas" = undefined; admin_sede no la tiene). */
  branchOptions: Array<{ label: string; value: number | undefined }>;
  /** Sede elegida en el selector de la página: es el valor inicial y lo sigue si cambia. */
  branchId?: number;
}>();

const $q = useQuasar();
const api = useWellhubApi();

const report = ref<WellhubReport | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
// Descarta respuestas viejas si el usuario cambia el filtro mientras carga.
let requestSeq = 0;

// -- Filtros ---------------------------------------------------------------

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM' desplazado `delta` meses. */
function shiftMonth(value: string, delta: number): string {
  const [y, m] = value.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

function monthLabel(value: string): string {
  const [y, m] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Últimos 12 meses, el actual primero.
const monthOptions = Array.from({ length: 12 }, (_, i) => shiftMonth(currentMonth(), -i)).map(
  (m) => ({ label: monthLabel(m), value: m })
);

const month = ref(currentMonth());
const branchId = ref<number | undefined>(props.branchId);

// -- Carga -----------------------------------------------------------------

async function loadReport(): Promise<void> {
  const seq = ++requestSeq;
  loading.value = true;
  loadError.value = null;
  try {
    const data = await api.getReport({ month: month.value, branchId: branchId.value });
    if (seq !== requestSeq) return;
    report.value = data;
  } catch (err: unknown) {
    if (seq !== requestSeq) return;
    // El composable ya dejó el log; acá solo se avisa a la persona.
    const message = extractError(err, 'No se pudo cargar el reporte Wellhub');
    loadError.value = message;
    $q.notify({ type: 'negative', message });
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

// -- Datos derivados ---------------------------------------------------------

const people = computed(
  () => report.value?.people ?? { unique: 0, nuevos: 0, exAlumnos: 0, socios: 0, visitsPerPerson: 0 }
);
const bookings = computed(
  () =>
    report.value?.bookings ?? { confirmed: 0, canceled: 0, lateCanceled: 0, rejected: 0, noShows: 0 }
);
const conversions = computed(
  () => report.value?.conversions ?? { count: 0, ratePct: 0, items: [] }
);

const sortedPeople = computed(() =>
  [...(report.value?.peopleList ?? [])].sort(
    (a, b) =>
      b.validatedVisits + b.manualVisits - (a.validatedVisits + a.manualVisits) ||
      a.name.localeCompare(b.name, 'es')
  )
);

const isEmpty = computed(() => {
  const r = report.value;
  if (!r) return false;
  const b = r.bookings;
  return (
    r.validatedVisits === 0 &&
    r.manualVisits === 0 &&
    r.people.unique === 0 &&
    r.conversions.count === 0 &&
    b.confirmed + b.canceled + b.lateCanceled + b.rejected + b.noShows === 0
  );
});

const visitCards = computed(() => [
  {
    key: 'validated',
    label: 'Visitas validadas por Wellhub',
    value: report.value?.validatedVisits ?? 0,
    hint: 'Las que paga Wellhub: controlá contra su liquidación',
    icon: 'verified',
  },
  {
    key: 'manual',
    label: 'Presentes a mano',
    value: report.value?.manualVisits ?? 0,
    hint: 'Marcadas por el staff, Wellhub no las ve ni las paga',
    icon: 'edit_note',
  },
  {
    key: 'people',
    label: 'Personas',
    value: people.value.unique,
    hint: 'Personas únicas que vinieron por Wellhub',
    icon: 'groups',
  },
  {
    key: 'perPerson',
    label: 'Visitas por persona',
    value: people.value.visitsPerPerson.toLocaleString('es-AR', { maximumFractionDigits: 1 }),
    hint: 'Promedio del mes',
    icon: 'repeat',
  },
]);

const bookingCards = computed(() => [
  { key: 'confirmed', label: 'Confirmadas', value: bookings.value.confirmed, icon: 'event_available' },
  { key: 'canceled', label: 'Canceladas', value: bookings.value.canceled, icon: 'event_busy' },
  { key: 'late', label: 'Canceladas tarde', value: bookings.value.lateCanceled, icon: 'schedule' },
  { key: 'rejected', label: 'Rechazadas', value: bookings.value.rejected, icon: 'block' },
  { key: 'noShows', label: 'No-shows', value: bookings.value.noShows, icon: 'person_off' },
]);

// -- Tablas ------------------------------------------------------------------

const PERSON_KIND_LABELS: Record<WellhubPersonKind, string> = {
  nuevo: 'Nuevo',
  ex_alumno: 'Ex-alumno',
  socio: 'Socio',
};

function personKindLabel(kind: WellhubPersonKind): string {
  return PERSON_KIND_LABELS[kind] ?? kind;
}

// `kind` de la conversión llega como string del API: nuevo / ex_alumno / otro.
const CONVERSION_KIND_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  ex_alumno: 'Ex-alumno',
  otro: 'Otro',
};

function conversionKindLabel(kind: string): string {
  return CONVERSION_KIND_LABELS[kind] ?? kind;
}

const peopleColumns: QTableColumn[] = [
  { name: 'name', label: 'Nombre', field: 'name', align: 'left' },
  { name: 'kind', label: 'Tipo', field: 'kind', align: 'left' },
  { name: 'validatedVisits', label: 'Validadas', field: 'validatedVisits', align: 'right' },
  { name: 'manualVisits', label: 'A mano', field: 'manualVisits', align: 'right' },
];

function conversionRowKey(row: WellhubReportConversion): string {
  return `${row.userId}-${row.localDate}-${row.planName}`;
}

const conversionColumns: QTableColumn[] = [
  { name: 'localDate', label: 'Fecha', field: 'localDate', align: 'left' },
  { name: 'name', label: 'Nombre', field: 'name', align: 'left' },
  { name: 'kind', label: 'Tipo', field: 'kind', align: 'left' },
  { name: 'planName', label: 'Plan', field: 'planName', align: 'left' },
  { name: 'branchName', label: 'Sede', field: 'branchName', align: 'left' },
];

// -- Wiring ------------------------------------------------------------------

// La sede de la página (admin_sede la recibe recién cuando cargan las sedes) manda.
watch(
  () => props.branchId,
  (next) => {
    branchId.value = next;
  }
);

watch([month, branchId], () => {
  void loadReport();
});

onMounted(() => {
  void loadReport();
});

// Los composables no se limpian solos: el componente es dueño del ciclo de vida.
onBeforeUnmount(() => {
  requestSeq++;
  api.cleanup();
});
</script>
