<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="text-h5">Franquicias</div>
      <q-space />
      <q-badge v-if="total > 0" color="primary" :label="`${total} solicitudes`" />
    </div>

    <!-- Filter bar -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-12 col-sm-4">
        <q-input
          v-model="search"
          label="Buscar por nombre, email o ciudad"
          dense
          outlined
          clearable
          debounce="300"
          @update:model-value="onSearchChange"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>
      <div class="col-12 col-sm-5">
        <q-btn-toggle
          v-model="statusFilter"
          toggle-color="primary"
          :options="statusFilterOptions"
          dense
          unelevated
          spread
          @update:model-value="onStatusChange"
        />
      </div>
      <div class="col-12 col-sm-3">
        <q-select
          v-model="sortOption"
          :options="sortOptions"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onSortChange"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="franchiseApi.loading.value" class="flex flex-center q-pa-xl">
      <q-spinner-dots size="50px" color="primary" />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="applications.length === 0"
      class="full-width row flex-center q-py-xl text-grey-6"
    >
      <q-icon name="store" size="md" class="q-mr-sm" />
      <span>No hay solicitudes{{ statusFilter !== 'all' ? ' con este filtro' : '' }}</span>
    </div>

    <!-- Card grid -->
    <template v-else>
      <div class="row q-col-gutter-md">
        <div v-for="app in applications" :key="app.id" class="col-12 col-sm-6 col-md-4">
          <q-card flat bordered class="cursor-pointer" @click="goToDetail(app.id)">
            <q-card-section>
              <!-- Name + status chip -->
              <div class="row items-center no-wrap">
                <div class="text-subtitle1 text-weight-bold ellipsis col">
                  {{ app.nombre }}
                </div>
                <q-chip
                  :color="STATUS_COLORS[app.status] ?? 'grey'"
                  text-color="white"
                  dense
                  size="sm"
                  class="q-ml-sm"
                >
                  {{ STATUS_LABELS[app.status] ?? app.status }}
                </q-chip>
              </div>

              <!-- City -->
              <div class="text-caption text-grey-7">{{ app.ciudadPais }}</div>

              <q-separator class="q-my-sm" />

              <!-- Model + capital pills -->
              <div class="row q-gutter-xs">
                <q-chip outline dense size="sm" color="grey-7">
                  {{ MODELO_LABELS[app.modelo] ?? app.modelo }}
                </q-chip>
                <q-chip outline dense size="sm" color="grey-7">
                  {{ CAPITAL_LABELS[app.capital] ?? app.capital }}
                </q-chip>
              </div>

              <!-- Email + date row -->
              <div class="row items-center q-mt-sm">
                <div class="text-caption text-grey-7 ellipsis col">
                  {{ app.email }}
                </div>
                <div class="text-caption text-grey-6">
                  {{ formatDate(app.createdAt) }}
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="row justify-center q-mt-md">
        <q-pagination
          v-model="page"
          :max="totalPages"
          direction-links
          boundary-links
          @update:model-value="onPageChange"
        />
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { formatDate } from 'src/utils/format-date';
import {
  useFranchiseAdminApi,
  type FranchiseApplication,
} from 'src/composables/useFranchiseAdminApi';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  MODELO_LABELS,
  CAPITAL_LABELS,
} from 'src/utils/franchise-labels';

const router = useRouter();
const franchiseApi = useFranchiseAdminApi();

// =========================================================================
// State
// =========================================================================

const applications = ref<FranchiseApplication[]>([]);
const search = ref('');
const statusFilter = ref('all');
const sortOption = ref('createdAt_desc');
const page = ref(1);
const totalPages = ref(1);
const total = ref(0);

// =========================================================================
// Options
// =========================================================================

const statusFilterOptions = [
  { label: 'Todas', value: 'all' },
  { label: 'Nuevas', value: 'new' },
  { label: 'Contactadas', value: 'contacted' },
  { label: 'Negociando', value: 'negotiating' },
  { label: 'Cerradas', value: 'closed' },
];

const sortOptions = [
  { label: 'Mas recientes', value: 'createdAt_desc' },
  { label: 'Mas antiguas', value: 'createdAt_asc' },
  { label: 'Nombre A-Z', value: 'nombre_asc' },
  { label: 'Ciudad A-Z', value: 'ciudadPais_asc' },
];

// =========================================================================
// Data loading
// =========================================================================

async function loadApplications() {
  try {
    const [sortBy, sortDir] = sortOption.value.split('_') as [string, 'asc' | 'desc'];
    const result = await franchiseApi.listApplications({
      page: page.value,
      limit: 12,
      status: statusFilter.value,
      search: search.value || undefined,
      sortBy,
      sortDir,
    });

    applications.value = result.applications;
    total.value = result.total;
    totalPages.value = result.totalPages;
  } catch {
    // Error handled by composable
  }
}

// =========================================================================
// Helpers
// =========================================================================

// =========================================================================
// Event handlers
// =========================================================================

function onSearchChange() {
  page.value = 1;
  loadApplications();
}

function onStatusChange() {
  page.value = 1;
  loadApplications();
}

function onSortChange() {
  page.value = 1;
  loadApplications();
}

function onPageChange() {
  loadApplications();
}

function goToDetail(id: number) {
  router.push(`/franquicias/${id}`);
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadApplications();
});
</script>
