<template>
  <section v-if="day" class="semana-hero">
    <div class="semana-hero__head" :class="{ 'semana-hero__head--solo': !cta.showButton }">
      <div class="semana-hero__text">
        <p class="semana-hero__kicker">{{ dayKicker(day.date, today) }}</p>
        <h1 class="semana-hero__title">{{ title }}</h1>
        <span v-if="cta.showDoneChip" class="semana-hero__done">
          <q-icon name="check" size="16px" />
          Hecha
        </span>
      </div>
      <button
        v-if="cta.showButton"
        type="button"
        class="semana-hero__cta"
        :class="{
          'semana-hero__cta--secondary': cta.variant === 'secondary',
          'semana-hero__cta--unavailable': cta.variant === 'unavailable',
        }"
        :disabled="cta.variant === 'unavailable'"
        @click="onCta"
      >
        <q-icon v-if="cta.startsTraining" name="play_arrow" size="20px" aria-hidden="true" />
        <span>{{ cta.label }}</span>
      </button>
    </div>

    <!-- Área de bloques (197-13): figura, chips y lista de ejercicios del bloque elegido -->
    <slot />

    <button
      v-if="cta.showLibreLink"
      type="button"
      class="semana-hero__link"
      @click="emit('go-libre')"
    >
      ¿Te quedaste con ganas? Sumá un bloque libre
    </button>
    <p v-if="cta.hint" class="semana-hero__hint">{{ cta.hint }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { FREE_BLOCKS_ENABLED } from 'src/config/featureFlags'
import type { WeekDay } from '../../types/session'
import { sessionTitle } from '../../utils/blockMeta'
import { resolveSemanaCta } from '../../utils/semanaCta'
import { dayKicker } from '../../utils/weekLabels'

// Fase 197 D-03: fila título + CTA mitad y mitad, con los 6 estados del CTA (resolveSemanaCta).
// Los CTA que arrancan a entrenar (`startsTraining`) llevan el ícono de play.
const props = defineProps<{
  /** Día elegido en la tira */
  day: WeekDay | undefined
  /** Hoy en la zona de la sede */
  today: string
  hasProgress: boolean
}>()

const emit = defineEmits<{
  start: [date: string]
  summary: []
  'go-libre': []
}>()

const title = computed(() => {
  const session = props.day?.session
  return (session ? sessionTitle(session) : '') || 'Sin plani'
})

const cta = computed(() =>
  resolveSemanaCta({
    date: props.day?.date ?? props.today,
    today: props.today,
    hasSession: !!props.day?.session,
    isSunday: props.day?.dayOfWeek === 0,
    completed: props.day?.state === 'completed',
    hasProgress: props.hasProgress,
    libreEnabled: FREE_BLOCKS_ENABLED,
  }),
)

function onCta(): void {
  const date = props.day?.date
  if (!date) return
  switch (cta.value.action) {
    case 'start':
      emit('start', date)
      break
    case 'summary':
      emit('summary')
      break
    case 'libre':
      emit('go-libre')
      break
    default:
      break
  }
}
</script>

<style scoped lang="scss">
@import 'src/css/brand';
@import 'src/css/premium-card';

.semana-hero {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 12px;
    align-items: center;

    // Sin botón (días pasados): el texto usa todo el ancho
    &--solo {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  &__text {
    min-width: 0;
  }

  &__kicker {
    @include pd-kicker-light;
  }

  &__title {
    display: -webkit-box;
    margin: 2px 0 0;
    overflow: hidden;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 28px;
    line-height: 1.1;
    color: $pd-ink;
  }

  &__done {
    @include pd-chip-done;
    margin-top: 6px;
  }

  // CTA de 56 px, mitad derecha. El texto puede ir en dos líneas ("Elegir un bloque libre").
  &__cta {
    @include pd-cta(56px);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 14px;
    font-size: 16px;
    line-height: 1.2;
    text-align: center;

    &--secondary {
      @include pd-cta-secondary-light;
    }

    &--unavailable,
    &:disabled {
      @include pd-cta-unavailable;
    }

    &:focus-visible {
      outline: 2px solid $pd-ink;
      outline-offset: 2px;
    }
  }

  &__link {
    align-self: center;
    min-height: 44px;
    padding: 0 8px;
    border: 0;
    background: none;
    color: $pd-kicker-ink;
    font-family: 'Geologica', sans-serif;
    font-weight: 600;
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  &__hint {
    margin: -4px 0 0;
    font-size: 13px;
    color: $pd-ink-2;
  }
}

@include pd-sheen-keyframes;
</style>
