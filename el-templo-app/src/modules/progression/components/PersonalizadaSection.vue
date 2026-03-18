<template>
  <div class="personalizada-section">
    <!-- Loading State -->
    <div v-if="loading" class="personalizada-section__loading">
      <q-spinner-dots size="32px" color="secondary" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="personalizada-section__error">
      <q-icon name="error_outline" size="24px" color="grey-6" />
      <p class="personalizada-section__error-text">{{ error }}</p>
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Active Personalizada Card -->
      <q-card v-if="activePersonalizada" class="personalizada-section__active-card" flat bordered>
        <q-card-section>
          <div class="personalizada-section__active-header">
            <div>
              <h3 class="personalizada-section__personalizada-name">
                {{ activePersonalizadaName }}
              </h3>
              <q-badge
                class="personalizada-section__tier-badge"
                :label="activePersonalizadaTierLabel"
              />
            </div>
            <q-icon name="explore" size="28px" class="personalizada-section__icon" />
          </div>

          <p class="personalizada-section__since">
            Activo desde {{ formatDate(activePersonalizada.startedAt) }}
          </p>

          <!-- Per-duration semana counters -->
          <div class="personalizada-section__semanas">
            <div class="personalizada-section__semana-row">
              <span class="personalizada-section__duration-label">20 min</span>
              <span class="personalizada-section__semana-value"
                >Semana {{ activePersonalizada.semana20 }}</span
              >
            </div>
            <div class="personalizada-section__semana-row">
              <span class="personalizada-section__duration-label">40 min</span>
              <span class="personalizada-section__semana-value"
                >Semana {{ activePersonalizada.semana40 }}</span
              >
            </div>
            <div class="personalizada-section__semana-row">
              <span class="personalizada-section__duration-label">60 min</span>
              <span class="personalizada-section__semana-value"
                >Semana {{ activePersonalizada.semana60 }}</span
              >
            </div>
          </div>

          <!-- Change Personalizada Button -->
          <q-btn
            outline
            no-caps
            class="personalizada-section__change-btn"
            label="Cambiar Personalizada"
            icon="swap_horiz"
            @click="showChangeDialog = true"
          />
        </q-card-section>
      </q-card>

      <!-- No Active Personalizada - Prompt -->
      <q-card v-else class="personalizada-section__prompt-card" flat bordered>
        <q-card-section class="personalizada-section__prompt-content">
          <q-icon name="explore" size="40px" class="personalizada-section__prompt-icon" />
          <h3 class="personalizada-section__prompt-title">Comienza tu Clase Personalizada</h3>
          <p class="personalizada-section__prompt-text">
            Elige una ruta de entrenamiento enfocada en tus objetivos: tren superior, inferior,
            empuje, traccion y mas.
          </p>
          <q-btn
            unelevated
            no-caps
            color="secondary"
            text-color="primary"
            label="Elegir Personalizada"
            icon-right="arrow_forward"
            to="/personalizada"
          />
        </q-card-section>
      </q-card>

      <!-- Archived Personalizadas Section -->
      <div v-if="archivedPersonalizadas.length > 0" class="personalizada-section__archived">
        <h3 class="personalizada-section__archived-title">Historial de Personalizadas</h3>

        <q-card
          v-for="(archived, index) in archivedPersonalizadas"
          :key="index"
          class="personalizada-section__archived-card"
          flat
          bordered
        >
          <q-card-section>
            <div class="personalizada-section__archived-header">
              <span class="personalizada-section__archived-name">{{
                getPersonalizadaName(archived.personalizadaType)
              }}</span>
              <q-badge
                class="personalizada-section__archived-tier-badge"
                :label="getPersonalizadaTierLabel(archived.personalizadaType)"
              />
            </div>

            <p class="personalizada-section__archived-dates">
              Activo: {{ formatDate(archived.startedAt) }} -
              {{ formatDate(archived.archivedAt) }}
            </p>

            <p class="personalizada-section__archived-semanas">
              20 min: S{{ archived.semana20 }} &middot; 40 min: S{{ archived.semana40 }} &middot; 60
              min: S{{ archived.semana60 }}
            </p>
          </q-card-section>
        </q-card>
      </div>
    </template>

    <!-- Change Personalizada Confirmation Dialog -->
    <q-dialog v-model="showChangeDialog">
      <q-card class="personalizada-section__dialog">
        <q-card-section>
          <div class="text-h6 personalizada-section__dialog-title">Cambiar Personalizada</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <p class="personalizada-section__dialog-text">
            Cambiar de Personalizada reiniciara tu progreso actual. Tu historial sera guardado.
          </p>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat no-caps label="Cancelar" color="grey-7" v-close-popup />
          <q-btn
            flat
            no-caps
            label="Cambiar"
            class="personalizada-section__dialog-confirm"
            @click="onConfirmChange"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * PersonalizadaSection component for Mi Camino page.
 *
 * Displays:
 * - Active personalizada with per-duration semana counters
 * - No-personalizada prompt with CTA to start
 * - Archived personalizada history as summary cards
 * - Personalizada switching with warning dialog
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { createLogger } from 'src/utils/logger'
import { formatDate } from 'src/utils/format-date'
import type {
  PersonalizadaProgress,
  ArchivedPersonalizada,
  PersonalizadaMetadata,
  PersonalizadaTier,
} from 'src/modules/personalizada/types'

const log = createLogger('PersonalizadaSection')
const router = useRouter()

// --- Props ---

const props = defineProps<{
  activePersonalizada: PersonalizadaProgress | null
  archivedPersonalizadas: ArchivedPersonalizada[]
  allMetadata: PersonalizadaMetadata[]
  loading: boolean
  error: string | null
}>()

// --- State ---

const showChangeDialog = ref(false)

// --- Computed ---

const TIER_LABELS: Record<PersonalizadaTier, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
}

const activeMetadata = computed(() => {
  if (!props.activePersonalizada) return null
  return (
    props.allMetadata.find((m) => m.type === props.activePersonalizada?.personalizadaType) ?? null
  )
})

const activePersonalizadaName = computed(() => {
  return activeMetadata.value?.name ?? props.activePersonalizada?.personalizadaType ?? ''
})

const activePersonalizadaTierLabel = computed(() => {
  if (!activeMetadata.value) return ''
  return TIER_LABELS[activeMetadata.value.tier] ?? ''
})

// --- Methods ---

function getPersonalizadaName(personalizadaType: string): string {
  const meta = props.allMetadata.find((m) => m.type === personalizadaType)
  return meta?.name ?? personalizadaType
}

function getPersonalizadaTierLabel(personalizadaType: string): string {
  const meta = props.allMetadata.find((m) => m.type === personalizadaType)
  if (!meta) return ''
  return TIER_LABELS[meta.tier] ?? ''
}

function onConfirmChange(): void {
  showChangeDialog.value = false
  log.info('User confirmed personalizada change')
  void router.push('/personalizada')
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.personalizada-section {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__loading {
    display: flex;
    justify-content: center;
    padding: 24px;
  }

  &__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
  }

  &__error-text {
    font-size: 13px;
    color: rgba($primary, 0.6);
    margin: 0;
  }

  // Active Personalizada Card
  &__active-card {
    background-color: white;
    border-color: rgba($secondary, 0.3);
    border-radius: 12px;
  }

  &__active-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }

  &__personalizada-name {
    font-family: 'Montserrat', sans-serif;
    font-size: 18px;
    font-weight: 600;
    color: $primary;
    margin: 0 0 6px;
  }

  &__tier-badge {
    background-color: rgba($secondary, 0.15) !important;
    color: $secondary !important;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 2px 10px;
  }

  &__icon {
    color: $secondary;
  }

  &__since {
    font-size: 13px;
    color: rgba($primary, 0.6);
    margin: 0 0 16px;
  }

  // Per-duration semana counters
  &__semanas {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  &__semana-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background-color: rgba($cream, 0.7);
    border-radius: 8px;
  }

  &__duration-label {
    font-size: 13px;
    color: rgba($primary, 0.6);
    font-weight: 500;
  }

  &__semana-value {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: $primary;
  }

  &__change-btn {
    width: 100%;
    color: $secondary !important;
    border-color: $secondary !important;
  }

  // No Personalizada Prompt
  &__prompt-card {
    background-color: white;
    border-color: rgba($secondary, 0.2);
    border-radius: 12px;
  }

  &__prompt-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 24px 16px;
  }

  &__prompt-icon {
    color: $secondary;
    margin-bottom: 12px;
  }

  &__prompt-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 600;
    color: $primary;
    margin: 0 0 8px;
  }

  &__prompt-text {
    font-size: 13px;
    color: rgba($primary, 0.6);
    margin: 0 0 16px;
    max-width: 280px;
    line-height: 1.5;
  }

  // Archived Personalizadas
  &__archived {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  &__archived-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 600;
    color: $primary;
    margin: 4px 0 8px;
  }

  &__archived-card {
    background-color: white;
    border-color: rgba($primary, 0.1);
    border-radius: 10px;
  }

  &__archived-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  &__archived-name {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: $primary;
  }

  &__archived-tier-badge {
    background-color: rgba($primary, 0.08) !important;
    color: rgba($primary, 0.6) !important;
    font-size: 0.65rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 1px 8px;
  }

  &__archived-dates {
    font-size: 12px;
    color: rgba($primary, 0.5);
    margin: 0 0 4px;
  }

  &__archived-semanas {
    font-size: 12px;
    color: rgba($primary, 0.6);
    margin: 0;
    font-weight: 500;
  }

  // Dialog
  &__dialog {
    min-width: 300px;
  }

  &__dialog-title {
    font-family: 'Montserrat', sans-serif;
    color: $primary;
  }

  &__dialog-text {
    font-size: 14px;
    color: rgba($primary, 0.7);
    line-height: 1.5;
    margin: 0;
  }

  &__dialog-confirm {
    color: $secondary !important;
    font-weight: 600;
  }
}
</style>
