<!-- Tab "Registro del día" de Feedback: los check-ins diarios del socio
     (energía / molestias / sueño). Arriba la distribución agregada del período
     + las zonas del cuerpo más reportadas; abajo el detalle paginado, una fila
     por socio y día. Los filtros fecha/sucursal son compartidos y llegan por
     prop desde FeedbackPage; acá se agrega el selector de pregunta. -->
<template>
  <div>
    <div class="row items-center q-mb-sm">
      <q-btn-toggle
        v-model="questionType"
        :options="typeOptions"
        dense
        unelevated
        no-caps
        toggle-color="primary"
        color="grey-3"
        text-color="grey-8"
        class="col-auto"
      />
      <q-space />
      <q-btn flat round dense icon="refresh" :loading="loading" @click="reload" />
    </div>

    <q-banner v-if="error" class="bg-red-1 text-red-9 q-mb-md" dense>
      {{ error }}
    </q-banner>

    <!-- Empty state -->
    <div
      v-if="!loading && data !== null && data.total === 0"
      class="text-center q-pa-xl text-grey-7"
    >
      <q-icon name="event_available" size="48px" color="grey-5" class="q-mb-md" />
      <div class="text-h6 text-weight-medium">Todavía no hay registros</div>
      <div class="text-body2 q-mt-sm" style="max-width: 480px; margin: 0 auto">
        Cuando los socios completen su registro del día en la app, vas a ver acá cómo viene la
        energía, las molestias y el descanso.
      </div>
    </div>

    <template v-else-if="data !== null">
      <!-- Distribución por pregunta -->
      <div class="text-subtitle1 text-weight-medium q-mb-sm">Cómo viene la gente</div>
      <div class="row q-col-gutter-md q-mb-lg">
        <div v-for="type in visibleTypes" :key="type" class="col-12 col-md-4">
          <q-card flat bordered>
            <q-card-section>
              <div class="row items-center q-mb-sm">
                <div class="text-weight-medium col">{{ typeLabels[type] }}</div>
                <div class="text-caption text-grey-6 col-auto">{{ totalFor(type) }}</div>
              </div>

              <div v-if="totalFor(type) === 0" class="text-caption text-grey-6 text-italic">
                Sin respuestas en el período.
              </div>
              <template v-else>
                <div v-for="value in valueOrder[type]" :key="value" class="q-mb-xs">
                  <div class="row items-center no-wrap">
                    <div class="text-caption col" style="min-width: 72px">{{ value }}</div>
                    <div class="text-caption text-weight-medium col-auto">
                      {{ percentOf(type, value) }}%
                    </div>
                    <div class="text-caption text-grey-6 col-auto q-ml-xs">
                      ({{ data.summary[type][value] ?? 0 }})
                    </div>
                  </div>
                  <q-linear-progress
                    :value="percentOf(type, value) / 100"
                    size="8px"
                    rounded
                    :color="barColor(type, value)"
                    track-color="grey-3"
                  />
                </div>
              </template>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Zonas del cuerpo (solo tiene sentido con molestias en juego) -->
      <template v-if="data.bodyAreas.length > 0">
        <div class="text-subtitle1 text-weight-medium q-mb-sm">Zonas más reportadas</div>
        <div class="row q-gutter-sm q-mb-lg">
          <q-chip
            v-for="area in data.bodyAreas"
            :key="area.area"
            dense
            color="grey-3"
            text-color="grey-9"
          >
            {{ area.area }}
            <span class="text-weight-medium q-ml-xs">{{ area.count }}</span>
          </q-chip>
        </div>
      </template>

      <!-- Detalle por socio y día -->
      <div class="row items-center q-mb-sm">
        <div class="text-subtitle1 text-weight-medium col-auto">Detalle</div>
        <q-space />
        <div class="text-caption text-grey-7 col-auto">{{ rows.length }} de {{ data.total }}</div>
      </div>
      <q-list bordered separator class="rounded-borders">
        <q-item v-for="row in rows" :key="`${row.userId}-${row.date}`">
          <q-item-section>
            <q-item-label class="text-weight-medium">{{ row.memberName }}</q-item-label>
            <q-item-label caption class="text-grey-6">
              {{ formatDate(row.date)
              }}<template v-if="row.branchName"> · {{ row.branchName }}</template>
            </q-item-label>
          </q-item-section>
          <q-item-section side style="max-width: 60%">
            <div class="row q-gutter-xs justify-end">
              <q-chip
                v-for="entry in row.entries"
                :key="entry.questionType"
                dense
                :color="chipColor(entry)"
                text-color="white"
              >
                {{ typeLabels[entry.questionType] }}: {{ entry.value
                }}<template v-if="entry.bodyArea"> ({{ entry.bodyArea }})</template>
              </q-chip>
            </div>
          </q-item-section>
        </q-item>
      </q-list>

      <div v-if="hasMore" class="row justify-center q-mt-md">
        <q-btn label="Cargar más" color="primary" flat :loading="loading" @click="loadMore" />
      </div>
    </template>

    <q-inner-loading :showing="loading && data === null">
      <q-spinner-dots size="40px" color="primary" />
    </q-inner-loading>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  useCheckInsApi,
  CHECK_IN_TYPE_LABELS,
  CHECK_IN_VALUE_ORDER,
  type AdminCheckIns,
  type AdminCheckInEntry,
  type AdminCheckInDayRow,
  type AdminCheckInsFilters,
  type CheckInQuestionType,
} from 'src/composables/useCheckInsApi';
import { createLogger } from 'src/utils/logger';
import type { FeedbackFilters } from 'src/components/feedback/feedback-filters';

const props = defineProps<{ filters: FeedbackFilters }>();

const log = createLogger('FeedbackRegistroDiaTab');
const { loading, error, getAdminCheckIns } = useCheckInsApi();

const PAGE_SIZE = 50;

const typeLabels = CHECK_IN_TYPE_LABELS;
const valueOrder = CHECK_IN_VALUE_ORDER;

/** '' = todas las preguntas (el API omite el filtro). */
const questionType = ref<CheckInQuestionType | ''>('');

const typeOptions = [
  { label: 'Todo', value: '' },
  { label: CHECK_IN_TYPE_LABELS.energy, value: 'energy' },
  { label: CHECK_IN_TYPE_LABELS.soreness, value: 'soreness' },
  { label: CHECK_IN_TYPE_LABELS.sleep, value: 'sleep' },
];

const data = ref<AdminCheckIns | null>(null);
const rows = ref<AdminCheckInDayRow[]>([]);
const currentPage = ref(1);

const hasMore = computed(() => data.value !== null && rows.value.length < data.value.total);

/** Con una pregunta elegida, el panel muestra solo esa tarjeta. */
const visibleTypes = computed<CheckInQuestionType[]>(() =>
  questionType.value === ''
    ? (['energy', 'soreness', 'sleep'] as CheckInQuestionType[])
    : [questionType.value]
);

function totalFor(type: CheckInQuestionType): number {
  const bucket = data.value?.summary[type];
  if (!bucket) return 0;
  return Object.values(bucket).reduce((acc, n) => acc + n, 0);
}

function percentOf(type: CheckInQuestionType, value: string): number {
  const total = totalFor(type);
  if (total === 0) return 0;
  return Math.round(((data.value?.summary[type]?.[value] ?? 0) / total) * 100);
}

/**
 * Semáforo por valor: el primero de cada orden es el peor (ver
 * CHECK_IN_VALUE_ORDER), así que rojo → naranja → verde de peor a mejor.
 */
const BAR_COLORS = ['negative', 'warning', 'positive'];

function barColor(type: CheckInQuestionType, value: string): string {
  const i = valueOrder[type].indexOf(value);
  return BAR_COLORS[i] ?? 'primary';
}

function chipColor(entry: AdminCheckInEntry): string {
  return barColor(entry.questionType, entry.value);
}

function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

function currentFilters(): AdminCheckInsFilters {
  return {
    dateFrom: props.filters.dateFrom ?? undefined,
    dateTo: props.filters.dateTo ?? undefined,
    branchId: props.filters.branchId ?? undefined,
    questionType: questionType.value === '' ? undefined : questionType.value,
  };
}

// Request token: un cambio de filtros dispara load(true) mientras un "Cargar
// más" puede estar en vuelo — solo la última respuesta muta estado.
let requestSeq = 0;

async function load(reset = true): Promise<void> {
  const seq = ++requestSeq;
  try {
    const page = reset ? 1 : currentPage.value + 1;
    const result = await getAdminCheckIns({ ...currentFilters(), page, limit: PAGE_SIZE });
    if (seq !== requestSeq) return;
    data.value = result;
    if (reset) {
      rows.value = result.rows;
    } else {
      rows.value.push(...result.rows);
    }
    currentPage.value = result.page;
  } catch (err: unknown) {
    if (seq !== requestSeq) return;
    log.error('Failed to load admin check-ins', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function reload(): Promise<void> {
  return load(true);
}

function loadMore(): Promise<void> {
  return load(false);
}

watch(
  () => [props.filters.dateFrom, props.filters.dateTo, props.filters.branchId, questionType.value],
  () => {
    void load(true);
  }
);

onMounted(() => {
  void load(true);
});
</script>
