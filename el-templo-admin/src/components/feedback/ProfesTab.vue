<!-- Tab "Profes" de Feedback: puntuaciones de profes (ex PuntuacionesPage).
     Los filtros fecha/sucursal son compartidos y llegan por prop desde
     FeedbackPage; acá queda solo el toggle "Solo con comentarios". -->
<template>
  <div>
    <div class="row items-center q-mb-md">
      <!-- "Solo con comentarios" filtra unicamente el listado de abajo: los
           promedios por profe siguen siendo sobre todas las puntuaciones. -->
      <q-toggle v-model="withComments" label="Solo con comentarios" class="col-auto">
        <q-tooltip>Filtra el listado. Los promedios por profe no cambian.</q-tooltip>
      </q-toggle>
      <q-space />
      <q-btn flat round dense icon="refresh" :loading="loading" @click="reload" />
    </div>

    <q-banner v-if="error" class="bg-red-1 text-red-9 q-mb-md" dense>
      {{ error }}
    </q-banner>

    <!-- Empty state: no ratings yet -->
    <div
      v-if="!loading && perCoach.length === 0 && ratings.length === 0"
      class="text-center q-pa-xl text-grey-7"
    >
      <q-icon name="star_border" size="48px" color="grey-5" class="q-mb-md" />
      <div class="text-h6 text-weight-medium">Todavía no hay puntuaciones</div>
      <div class="text-body2 q-mt-sm" style="max-width: 480px; margin: 0 auto">
        Cuando los miembros puntúen sus clases presenciales, vas a ver acá el promedio por profe y
        los comentarios recientes.
      </div>
    </div>

    <template v-else>
      <!-- Per-coach average summary -->
      <div class="text-subtitle1 text-weight-medium q-mb-sm">Promedio por profe</div>
      <q-table
        :rows="perCoach"
        :columns="perCoachColumns"
        row-key="coachId"
        :loading="loading"
        flat
        bordered
        :rows-per-page-options="[0]"
        hide-pagination
        no-data-label="Todavía no hay puntuaciones"
        class="q-mb-lg"
      >
        <template #body-cell-average="props">
          <q-td :props="props">
            <div class="row items-center no-wrap q-gutter-sm">
              <q-rating
                :model-value="props.row.averageStars"
                readonly
                size="1.4em"
                color="primary"
                icon="star"
                icon-half="star_half"
              />
              <span class="text-weight-medium">{{ props.row.averageStars.toFixed(1) }}</span>
            </div>
          </q-td>
        </template>
        <!-- Nota de clase (class_stars): promedio de la dimensión CLASE. -->
        <template #body-cell-classAverage="props">
          <q-td :props="props">
            <div
              v-if="props.row.classAverageStars !== null"
              class="row items-center no-wrap q-gutter-sm"
            >
              <q-rating
                :model-value="props.row.classAverageStars"
                readonly
                size="1.4em"
                color="secondary"
                icon="star"
                icon-half="star_half"
              />
              <span class="text-weight-medium">{{ props.row.classAverageStars.toFixed(1) }}</span>
            </div>
            <span v-else class="text-grey-5">—</span>
          </q-td>
        </template>
      </q-table>

      <!-- Individual ratings (full paginated list) -->
      <div class="row items-center q-mb-sm">
        <div class="text-subtitle1 text-weight-medium col">Puntuaciones</div>
        <div class="text-caption text-grey-7 col-auto">
          {{ ratings.length }} de {{ ratingsTotal }}
        </div>
      </div>
      <q-list v-if="ratings.length > 0" bordered separator class="rounded-borders">
        <q-item v-for="r in ratings" :key="r.id">
          <q-item-section side top style="min-width: 140px">
            <div class="row items-center no-wrap q-gutter-xs">
              <span class="text-caption text-grey-7" style="width: 42px">Profe</span>
              <q-rating :model-value="r.stars" readonly size="1.2em" color="primary" icon="star" />
            </div>
            <div v-if="r.classStars !== null" class="row items-center no-wrap q-gutter-xs">
              <span class="text-caption text-grey-7" style="width: 42px">Clase</span>
              <q-rating
                :model-value="r.classStars"
                readonly
                size="1.2em"
                color="secondary"
                icon="star"
              />
            </div>
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-medium">{{ r.coachName }}</q-item-label>
            <q-item-label v-if="r.comment" caption lines="3">{{ r.comment }}</q-item-label>
            <q-item-label caption class="text-grey-6">
              {{ formatClassLabel(r) }}
            </q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
      <div v-else class="text-grey-6 text-italic q-pa-md">Sin puntuaciones.</div>

      <div v-if="hasMore" class="row justify-center q-mt-md">
        <q-btn label="Cargar más" color="primary" flat :loading="loading" @click="loadMore" />
      </div>
    </template>

    <q-inner-loading :showing="loading && perCoach.length === 0 && ratings.length === 0">
      <q-spinner-dots size="40px" color="primary" />
    </q-inner-loading>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  useRatingsApi,
  type OwnerCoachRatingSummary,
  type OwnerRatingsFilters,
  type OwnerRecentRating,
} from 'src/composables/useRatingsApi';
import { createLogger } from 'src/utils/logger';
import type { FeedbackFilters } from 'src/components/feedback/feedback-filters';

const props = defineProps<{ filters: FeedbackFilters }>();

const log = createLogger('FeedbackProfesTab');
const { loading, error, getOwnerRatings } = useRatingsApi();

const PAGE_SIZE = 50;

const withComments = ref(false);

const perCoach = ref<OwnerCoachRatingSummary[]>([]);
const ratings = ref<OwnerRecentRating[]>([]);
const ratingsTotal = ref(0);
const currentPage = ref(1);

const hasMore = computed(() => ratings.value.length < ratingsTotal.value);

const perCoachColumns = [
  {
    name: 'coachName',
    label: 'Profe',
    field: 'coachName',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'average',
    label: 'Promedio profe',
    field: 'averageStars',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'classAverage',
    label: 'Promedio clase',
    field: (r: OwnerCoachRatingSummary) => r.classAverageStars ?? -1,
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'ratingCount',
    label: 'Puntuaciones',
    field: 'ratingCount',
    align: 'right' as const,
    sortable: true,
  },
];

function formatClassLabel(r: OwnerRecentRating): string {
  const parts: string[] = [];
  if (r.activityName) parts.push(r.activityName);
  if (r.branchName) parts.push(r.branchName);
  if (r.sessionDate) parts.push(r.sessionDate);
  return parts.join(' · ');
}

function currentFilters(): OwnerRatingsFilters {
  return {
    dateFrom: props.filters.dateFrom ?? undefined,
    dateTo: props.filters.dateTo ?? undefined,
    branchId: props.filters.branchId ?? undefined,
    withComments: withComments.value || undefined,
  };
}

// Request token: un cambio de filtros dispara load(true) mientras un
// "Cargar más" puede estar en vuelo — solo la última respuesta muta estado.
let requestSeq = 0;

async function load(reset = true): Promise<void> {
  const seq = ++requestSeq;
  try {
    const page = reset ? 1 : currentPage.value + 1;
    const result = await getOwnerRatings({
      ...currentFilters(),
      page,
      limit: PAGE_SIZE,
    });
    if (seq !== requestSeq) return;
    perCoach.value = result.perCoach;
    if (reset) {
      ratings.value = result.ratings.rows;
    } else {
      ratings.value.push(...result.ratings.rows);
    }
    currentPage.value = result.ratings.page;
    ratingsTotal.value = result.ratings.total;
  } catch (err: unknown) {
    if (seq !== requestSeq) return;
    log.error('Failed to load owner ratings', {
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
  () => [props.filters.dateFrom, props.filters.dateTo, props.filters.branchId, withComments.value],
  () => {
    void load(true);
  }
);

onMounted(() => {
  void load(true);
});
</script>
