<template>
  <section v-if="day" class="semana-hero" :class="{ 'semana-hero--rest': restToday }">
    <!-- Hoy es domingo: todo el contenido se ve desenfocado, inerte y oculto a lectores de pantalla -->
    <div
      class="semana-hero__body"
      :aria-hidden="restToday ? 'true' : undefined"
      :inert="restToday ? true : undefined"
    >
      <div class="semana-hero__head" :class="{ 'semana-hero__head--solo': !cta.showButton }">
        <div class="semana-hero__text">
          <MarqueeText tag="p" class="semana-hero__kicker">{{
            dayKicker(day.date, today)
          }}</MarqueeText>
          <MarqueeText tag="h1" class="semana-hero__title">{{ title }}</MarqueeText>
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
    </div>

    <p v-if="restToday" class="semana-hero__rest" role="status">
      Hoy es día de descanso. Nos vemos el lunes.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MarqueeText from 'src/components/MarqueeText.vue'
import { FREE_BLOCKS_ENABLED } from 'src/config/featureFlags'
import type { WeekDay } from '../../types/session'
import { sessionTitle } from '../../utils/blockMeta'
import { resolveSemanaCta } from '../../utils/semanaCta'
import { dayKicker } from '../../utils/weekLabels'

// Fase 197 D-03: fila título + CTA mitad y mitad, con los 6 estados del CTA (resolveSemanaCta).
// Título y kicker en una línea con desplazamiento si no entran (item 6, 2026-10-21).
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

// Hoy es domingo: día de descanso (el chip del domingo tampoco se puede elegir)
const restToday = computed(() => props.day?.dayOfWeek === 0 && props.day.date === props.today)

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
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;

  &__body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  // Domingo de hoy: contenido desenfocado y mensaje encima (sin botón)
  &--rest &__body {
    min-height: 180px;
    filter: blur(6px);
    opacity: 0.7;
    pointer-events: none;
    user-select: none;
  }

  &__rest {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 0 24px;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 20px;
    line-height: 1.3;
    text-align: center;
    color: $pd-ink;
  }

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

  // Una sola línea: si el título no entra se desplaza (MarqueeText)
  &__title {
    margin: 2px 0 0;
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
