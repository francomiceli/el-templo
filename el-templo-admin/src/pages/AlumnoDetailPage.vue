<template>
  <q-page class="q-pa-md">
    <!-- Back button -->
    <q-btn flat icon="arrow_back" label="Volver a Alumnos" class="q-mb-md" @click="goBack" />

    <!-- Loading -->
    <div v-if="loading" class="flex flex-center q-pa-xl">
      <q-spinner-dots size="50px" color="primary" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center q-pa-xl text-negative">
      <q-icon name="error" size="xl" class="q-mb-md" />
      <div class="text-h6">{{ error }}</div>
    </div>

    <!-- Detail content -->
    <template v-else-if="detail">
      <!-- ========================================== -->
      <!-- 1. Header: Member info -->
      <!-- ========================================== -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row items-center q-gutter-md">
            <div>
              <span
                class="text-h4 text-weight-bold"
                :class="`text-${levelColor(detail.user.level)}`"
              >
                {{ greekLevel(detail.user.level) }}
              </span>
            </div>
            <div>
              <div class="text-h5">{{ memberName }}</div>
              <div class="text-caption text-grey-7">
                {{ levelName(detail.user.level) }} · {{ detail.user.branchName }}
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- ========================================== -->
      <!-- 2. Active Journey -->
      <!-- ========================================== -->
      <q-card v-if="detail.active" flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Journey Activo</div>
          <div class="row items-center q-gutter-sm q-mb-sm">
            <q-badge
              :color="journeyBadgeColor(detail.active.journeyType)"
              :label="journeyLabel(detail.active.journeyType)"
              class="text-body2"
            />
            <q-badge
              outline
              :color="journeyBadgeColor(detail.active.journeyType)"
              :label="tierLabel(detail.active.journeyType)"
            />
          </div>
          <div class="text-caption text-grey-7 q-mb-md">
            Iniciado: {{ formatDate(detail.active.startedAt) }}
          </div>

          <!-- Per-duration semana counters -->
          <div class="row q-gutter-md">
            <div class="col">
              <div class="text-center">
                <div class="text-h6 text-primary">{{ detail.active.semana20 }}</div>
                <div class="text-caption text-grey-7">Semana 20 min</div>
              </div>
            </div>
            <div class="col">
              <div class="text-center">
                <div class="text-h6 text-primary">{{ detail.active.semana40 }}</div>
                <div class="text-caption text-grey-7">Semana 40 min</div>
              </div>
            </div>
            <div class="col">
              <div class="text-center">
                <div class="text-h6 text-primary">{{ detail.active.semana60 }}</div>
                <div class="text-caption text-grey-7">Semana 60 min</div>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- No active journey -->
      <q-card v-else flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-xs">Journey Activo</div>
          <div class="text-grey-5 text-italic">Sin journey activo</div>
        </q-card-section>
      </q-card>

      <!-- ========================================== -->
      <!-- 3. Entrenamiento Progress -->
      <!-- ========================================== -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Progreso Entrenamiento</div>
          <div class="row q-gutter-md">
            <div class="col">
              <div class="text-center">
                <div class="text-h6">{{ detail.entrenamientoStats.totalSessions }}</div>
                <div class="text-caption text-grey-7">Sesiones completadas</div>
              </div>
            </div>
            <div class="col">
              <div class="text-center">
                <div class="text-h6">{{ detail.entrenamientoStats.totalDays }}</div>
                <div class="text-caption text-grey-7">Dias entrenados</div>
              </div>
            </div>
            <div class="col">
              <div class="text-center">
                <div class="text-h6">
                  {{ detail.entrenamientoStats.currentStreak }}
                  <q-icon
                    v-if="detail.entrenamientoStats.currentStreak > 0"
                    name="local_fire_department"
                    color="orange"
                    size="xs"
                  />
                </div>
                <div class="text-caption text-grey-7">Racha actual</div>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- ========================================== -->
      <!-- 4. Journey Progress -->
      <!-- ========================================== -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Progreso Journey</div>
          <div class="row q-gutter-md">
            <div class="col">
              <div class="text-center">
                <div class="text-h6">{{ detail.journeyStats.totalSessions }}</div>
                <div class="text-caption text-grey-7">Sesiones journey</div>
              </div>
            </div>
            <div class="col">
              <div class="text-center">
                <div class="text-h6">{{ detail.journeyStats.byDuration.d20 }}</div>
                <div class="text-caption text-grey-7">20 min</div>
              </div>
            </div>
            <div class="col">
              <div class="text-center">
                <div class="text-h6">{{ detail.journeyStats.byDuration.d40 }}</div>
                <div class="text-caption text-grey-7">40 min</div>
              </div>
            </div>
            <div class="col">
              <div class="text-center">
                <div class="text-h6">{{ detail.journeyStats.byDuration.d60 }}</div>
                <div class="text-caption text-grey-7">60 min</div>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- ========================================== -->
      <!-- 5. Session History (last 20) -->
      <!-- ========================================== -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Historial de Sesiones</div>

          <div v-if="recentCompletions.length === 0" class="text-grey-5 text-italic">
            Sin sesiones completadas
          </div>

          <q-list v-else separator>
            <q-item v-for="(completion, idx) in recentCompletions" :key="idx">
              <q-item-section avatar>
                <q-icon
                  :name="completion.journeyType ? 'explore' : 'fitness_center'"
                  :color="completion.journeyType ? 'deep-orange-9' : 'primary'"
                />
              </q-item-section>
              <q-item-section>
                <q-item-label>
                  {{
                    completion.journeyType ? journeyLabel(completion.journeyType) : 'Entrenamiento'
                  }}
                  <q-badge
                    v-if="completion.duration"
                    outline
                    color="grey-7"
                    :label="`${completion.duration} min`"
                    class="q-ml-sm"
                  />
                </q-item-label>
                <q-item-label caption>
                  {{ formatDate(completion.completedAt) }}
                  <span v-if="completion.rpe !== null"> · RPE {{ completion.rpe }}</span>
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-badge
                  v-if="completion.blocksCompleted"
                  outline
                  color="grey-7"
                  :label="`${completion.blocksCompleted.length} bloques`"
                />
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>

      <!-- ========================================== -->
      <!-- 6. Archived Journeys -->
      <!-- ========================================== -->
      <q-card v-if="detail.archived.length > 0" flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Journeys Anteriores</div>

          <q-list separator>
            <q-item v-for="(arch, idx) in detail.archived" :key="idx">
              <q-item-section avatar>
                <q-icon name="history" color="grey-6" />
              </q-item-section>
              <q-item-section>
                <q-item-label>
                  <q-badge
                    :color="journeyBadgeColor(arch.journeyType)"
                    :label="journeyLabel(arch.journeyType)"
                  />
                </q-item-label>
                <q-item-label caption>
                  {{ formatDate(arch.startedAt) }} — {{ formatDate(arch.archivedAt) }}
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <div class="text-caption text-grey-7">
                  S{{ arch.semana20 }}/{{ arch.semana40 }}/{{ arch.semana60 }}
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createLogger } from 'src/utils/logger';
import { useJourneyAdminApi } from 'src/composables/useJourneyAdminApi';
import {
  JOURNEY_TYPE_LABELS,
  JOURNEY_TIER_MAP,
  JOURNEY_TIER_COLORS,
  JOURNEY_TIER_LABELS,
  type JourneyType,
  type JourneyTier,
  type MemberJourneyDetail,
} from 'src/types/journey';

const log = createLogger('AlumnoDetailPage');
const route = useRoute();
const router = useRouter();

// =========================================================================
// State
// =========================================================================

const loading = ref(true);
const error = ref<string | null>(null);
const detail = ref<MemberJourneyDetail | null>(null);

const userId = computed(() => Number(route.params.userId));

const memberName = computed(() => {
  if (!detail.value) return '';
  const parts = [detail.value.user.firstName, detail.value.user.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : `Usuario #${userId.value}`;
});

const recentCompletions = computed(() => {
  if (!detail.value) return [];
  return detail.value.completions.slice(0, 20);
});

// =========================================================================
// Greek level display
// =========================================================================

const LEVEL_GREEK_MAP: Record<string, string> = {
  alfa: '\u03B1',
  delta: '\u0394',
  sigma: '\u03A3',
  omega: '\u03A9',
  spartan: '\u03A9',
};

const LEVEL_NAMES: Record<string, string> = {
  alfa: 'Alfa',
  delta: 'Delta',
  sigma: 'Sigma',
  omega: 'Omega',
  spartan: 'Spartan',
};

function greekLevel(level: string): string {
  return LEVEL_GREEK_MAP[level.toLowerCase()] ?? level;
}

function levelName(level: string): string {
  return LEVEL_NAMES[level.toLowerCase()] ?? level;
}

function levelColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'alfa':
      return 'brown-4';
    case 'delta':
      return 'deep-orange-6';
    case 'sigma':
      return 'deep-orange-9';
    case 'omega':
      return 'orange';
    case 'spartan':
      return 'red';
    default:
      return 'grey';
  }
}

// =========================================================================
// Journey display helpers
// =========================================================================

function journeyLabel(journeyType: string): string {
  return JOURNEY_TYPE_LABELS[journeyType as JourneyType] ?? journeyType;
}

function journeyBadgeColor(journeyType: string): string {
  const tier: JourneyTier | undefined = JOURNEY_TIER_MAP[journeyType as JourneyType];
  return tier ? JOURNEY_TIER_COLORS[tier] : 'grey';
}

function tierLabel(journeyType: string): string {
  const tier: JourneyTier | undefined = JOURNEY_TIER_MAP[journeyType as JourneyType];
  return tier ? JOURNEY_TIER_LABELS[tier] : '';
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// =========================================================================
// Data loading
// =========================================================================

async function loadDetail() {
  loading.value = true;
  error.value = null;

  try {
    const journeyApi = useJourneyAdminApi();
    detail.value = await journeyApi.getMemberDetail(userId.value);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading member detail', { error: message, userId: userId.value });
    error.value = 'Error cargando detalle del alumno';
  } finally {
    loading.value = false;
  }
}

// =========================================================================
// Navigation
// =========================================================================

function goBack() {
  router.push('/alumnos');
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadDetail();
});
</script>
