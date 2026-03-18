<template>
  <q-page class="personalizada-overview-page">
    <div class="page-content">
      <!-- Loading -->
      <div v-if="loading" class="text-center q-pa-xl">
        <q-spinner-dots size="40px" color="grey-6" />
      </div>

      <!-- Not Found -->
      <div v-else-if="!personalizada" class="text-center q-pa-xl">
        <q-icon name="search_off" size="48px" color="grey-6" />
        <p class="q-mt-md text-grey-7">Personalizada no encontrada</p>
        <q-btn flat color="primary" label="Volver" to="/personalizada" />
      </div>

      <!-- Personalizada Details -->
      <template v-else>
        <!-- Back Button -->
        <q-btn
          flat
          dense
          no-caps
          icon="arrow_back"
          label="Volver"
          class="back-btn"
          @click="goBack"
        />

        <!-- Personalizada Name -->
        <h1 class="personalizada-name">{{ personalizada.name }}</h1>

        <!-- Tier Badge -->
        <div class="tier-badge-wrapper">
          <span class="tier-badge">{{ tierLabel }}</span>
        </div>

        <!-- Description -->
        <p class="personalizada-description">{{ personalizada.description }}</p>

        <!-- Zones Section -->
        <div class="detail-section">
          <h3 class="section-title">Zonas Objetivo</h3>
          <div class="zones-list">
            <div v-for="zone in personalizada.zones" :key="zone" class="zone-item">
              <q-icon name="fiber_manual_record" size="8px" class="zone-dot" />
              <span class="zone-text">{{ zone }}</span>
            </div>
          </div>
        </div>

        <!-- Ideal For Section -->
        <div class="detail-section">
          <h3 class="section-title">Ideal Para</h3>
          <p class="ideal-text">{{ personalizada.idealFor }}</p>
        </div>

        <!-- Difficulty Indicator -->
        <div class="detail-section">
          <h3 class="section-title">Dificultad</h3>
          <div class="difficulty-indicator">
            <div
              v-for="level in 3"
              :key="level"
              class="difficulty-dot"
              :class="{ active: level <= difficultyLevel }"
            />
            <span class="difficulty-label">{{ difficultyLabel }}</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="actions-section">
          <q-btn
            unelevated
            no-caps
            class="cta-btn"
            :label="isCurrentlyActive ? 'Continuar' : 'Elegir esta Personalizada'"
            :loading="personalizadaStore.loading"
            @click="onConfirm"
          />
          <q-btn flat no-caps color="grey-7" label="Volver" @click="goBack" />
        </div>
      </template>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { createLogger } from 'src/utils/logger'
import { usePersonalizadaStore } from '../stores/personalizadaStore'
import type { PersonalizadaMetadata, PersonalizadaType, PersonalizadaTier } from '../types'

const log = createLogger('PersonalizadaOverview')
const route = useRoute()
const router = useRouter()
const $q = useQuasar()
const personalizadaStore = usePersonalizadaStore()

const loading = ref(true)

const personalizadaType = computed(() => route.params.type as PersonalizadaType)

const personalizada = computed<PersonalizadaMetadata | undefined>(() =>
  personalizadaStore.personalizadaMetadata.find((j) => j.type === personalizadaType.value),
)

const isCurrentlyActive = computed(
  () => personalizadaStore.activePersonalizada?.personalizadaType === personalizadaType.value,
)

const tierLabel = computed(() => {
  const labels: Record<PersonalizadaTier, string> = {
    principiante: 'Principiante',
    intermedio: 'Intermedio',
    avanzado: 'Avanzado',
  }
  return personalizada.value ? labels[personalizada.value.tier] : ''
})

const difficultyLevel = computed(() => {
  if (!personalizada.value) return 0
  const map: Record<PersonalizadaTier, number> = {
    principiante: 1,
    intermedio: 2,
    avanzado: 3,
  }
  return map[personalizada.value.tier]
})

const difficultyLabel = computed(() => {
  const labels = ['', 'Accesible', 'Intermedio', 'Exigente']
  return labels[difficultyLevel.value] ?? ''
})

function goBack(): void {
  void router.push('/personalizada')
}

async function onConfirm(): Promise<void> {
  if (isCurrentlyActive.value) {
    // Already active, go straight to duration
    void router.push('/personalizada/duration')
    return
  }

  try {
    await personalizadaStore.selectPersonalizada(personalizadaType.value)
    $q.notify({
      type: 'positive',
      message: `Personalizada "${personalizada.value?.name}" seleccionada`,
    })
    void router.push('/personalizada/duration')
  } catch (err: unknown) {
    log.error('Failed to select personalizada', {
      error: err instanceof Error ? err.message : String(err),
    })
    $q.notify({
      type: 'negative',
      message: 'Error al seleccionar la personalizada',
    })
  }
}

onMounted(async () => {
  // Ensure metadata is loaded
  if (personalizadaStore.personalizadaMetadata.length === 0) {
    await personalizadaStore.fetchMetadata()
  }
  if (!personalizadaStore.activePersonalizada) {
    await personalizadaStore.fetchActivePersonalizada()
  }
  loading.value = false
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.personalizada-overview-page {
  background-color: #f5f2eb;
  min-height: 100vh;
}

.page-content {
  max-width: 600px;
  margin: 0 auto;
  padding: 16px 16px 48px;
}

.back-btn {
  color: #6b6b6b;
  margin-bottom: 16px;
}

.personalizada-name {
  font-family: 'Montserrat', sans-serif;
  font-size: 2rem;
  font-weight: 400;
  color: #2a2a2a;
  letter-spacing: -0.02em;
  margin: 0 0 12px;
  line-height: 1.2;
}

.tier-badge-wrapper {
  margin-bottom: 20px;
}

.tier-badge {
  display: inline-block;
  background-color: #c27a5d;
  color: white;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 12px;
}

.personalizada-description {
  font-size: 0.95rem;
  color: #3a3a3a;
  line-height: 1.7;
  margin: 0 0 28px;
}

/* Detail Sections */
.detail-section {
  margin-bottom: 24px;
}

.section-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 0.9rem;
  font-weight: 500;
  color: #2a2a2a;
  letter-spacing: 0.02em;
  margin: 0 0 10px;
}

.zones-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.zone-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zone-dot {
  color: #8a9a8a;
}

.zone-text {
  font-size: 0.9rem;
  color: #4a4a4a;
}

.ideal-text {
  font-size: 0.9rem;
  color: #4a4a4a;
  line-height: 1.6;
  margin: 0;
}

/* Difficulty Indicator */
.difficulty-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.difficulty-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #d4d0c6;
  transition: background-color 0.2s;

  &.active {
    background-color: #c27a5d;
  }
}

.difficulty-label {
  font-size: 0.85rem;
  color: #6b6b6b;
  margin-left: 6px;
}

/* Actions */
.actions-section {
  margin-top: 36px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.cta-btn {
  width: 100%;
  max-width: 400px;
  background-color: #c27a5d !important;
  color: white;
  font-weight: 600;
  font-size: 0.95rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 14px 24px;
}
</style>
