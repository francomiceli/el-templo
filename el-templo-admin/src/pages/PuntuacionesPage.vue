<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5">Puntuaciones de profes</div>
      <q-btn flat round dense icon="refresh" :loading="loading" @click="reload" />
    </div>

    <q-banner v-if="error" class="bg-red-1 text-red-9 q-mb-md" dense>
      {{ error }}
    </q-banner>

    <!-- Empty state: no ratings yet -->
    <div
      v-if="!loading && perCoach.length === 0 && recent.length === 0"
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
      </q-table>

      <!-- Recent individual ratings -->
      <div class="text-subtitle1 text-weight-medium q-mb-sm">Puntuaciones recientes</div>
      <q-list v-if="recent.length > 0" bordered separator class="rounded-borders">
        <q-item v-for="r in recent" :key="r.id">
          <q-item-section side top>
            <q-rating :model-value="r.stars" readonly size="1.2em" color="primary" icon="star" />
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
      <div v-else class="text-grey-6 text-italic q-pa-md">Sin puntuaciones recientes.</div>
    </template>

    <q-inner-loading :showing="loading && perCoach.length === 0 && recent.length === 0">
      <q-spinner-dots size="40px" color="primary" />
    </q-inner-loading>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  useRatingsApi,
  type OwnerCoachRatingSummary,
  type OwnerRecentRating,
} from 'src/composables/useRatingsApi';
import { createLogger } from 'src/utils/logger';

const log = createLogger('PuntuacionesPage');
const { loading, error, getOwnerRatings } = useRatingsApi();

const perCoach = ref<OwnerCoachRatingSummary[]>([]);
const recent = ref<OwnerRecentRating[]>([]);

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
    label: 'Promedio',
    field: 'averageStars',
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
  if (r.sessionDate) parts.push(r.sessionDate);
  return parts.join(' · ');
}

async function reload() {
  try {
    const result = await getOwnerRatings();
    perCoach.value = result.perCoach;
    recent.value = result.recent;
  } catch (err) {
    log.error('Failed to load owner ratings', err);
  }
}

onMounted(() => {
  void reload();
});
</script>
