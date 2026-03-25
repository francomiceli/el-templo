<template>
  <q-card
    class="session-cta-card"
    flat
    bordered
    clickable
    @click="router.push('/training')"
  >
    <q-card-section class="session-cta-card__content">
      <div class="session-cta-card__info">
        <q-icon
          :name="todayCompleted ? 'check_circle' : 'fitness_center'"
          size="32px"
          :color="todayCompleted ? 'positive' : 'primary'"
        />
        <div class="session-cta-card__text">
          <p class="session-cta-card__title" :class="{ 'session-cta-card__title--completed': todayCompleted }">
            {{ todayCompleted ? 'Sesión Completada' : 'Tu sesión de hoy' }}
          </p>
          <template v-if="!todayCompleted">
            <p v-if="checkInMessage" class="session-cta-card__check-in-message">
              {{ checkInMessage }}
            </p>
            <p class="session-cta-card__subtitle">
              {{ routeName || 'Podés entrenar desde donde quieras' }}
            </p>
            <q-chip
              v-if="isPersonalizada"
              outline
              dense
              color="secondary"
              class="session-cta-card__chip"
            >
              Personalizada
            </q-chip>
          </template>
          <div v-else class="session-cta-card__summary">
            <span v-if="todaySession?.durationMinutes" class="session-cta-card__summary-item">
              <q-icon name="timer" size="14px" />
              {{ todaySession.durationMinutes }} min
            </span>
            <span v-if="todaySession?.rpe" class="session-cta-card__summary-item">
              <q-icon name="speed" size="14px" />
              RPE {{ todaySession.rpe }}
            </span>
          </div>
        </div>
      </div>
      <div class="session-cta-card__arrow">
        <q-icon name="chevron_right" size="24px" />
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { TodaySession } from '../types'

const router = useRouter()

defineProps<{
  todayCompleted: boolean
  todaySession: TodaySession | null
  routeName: string | null
  isPersonalizada: boolean
  checkInMessage: string | null
}>()
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.session-cta-card {
  background-color: white;
  border-color: rgba($primary, 0.2);
  border-radius: 12px;
  cursor: pointer;
  transition: box-shadow 150ms ease;

  &:active {
    box-shadow: 0 0 0 2px rgba($primary, 0.2);
  }

  &__content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  &__info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__text {
    display: flex;
    flex-direction: column;
  }

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: $primary;
    margin: 0;

    &--completed {
      color: $positive;
    }
  }

  &__subtitle {
    font-family: 'Geologica', sans-serif;
    font-size: 12px;
    color: rgba($primary, 0.6);
    margin: 0;
  }

  &__check-in-message {
    font-family: 'Geologica', sans-serif;
    font-size: 11px;
    font-weight: 500;
    color: $warning;
    margin: 0 0 2px 0;
  }

  &__chip {
    margin-top: 4px;
    font-size: 10px;
  }

  &__summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  &__summary-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: rgba($primary, 0.7);
    background: rgba($secondary, 0.1);
    padding: 2px 8px;
    border-radius: 10px;
  }

  &__arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary, darken($primary, 12%));
    color: white;
    flex-shrink: 0;
  }
}
</style>
