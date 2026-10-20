<template>
  <section v-if="day" class="semana-hero">
    <div class="semana-hero__head">
      <div class="semana-hero__text">
        <p class="semana-hero__kicker">{{ dayKicker(day.date, today) }}</p>
        <h1 class="semana-hero__title">{{ title }}</h1>
        <span v-if="cta.showDoneChip" class="semana-hero__done">
          <q-icon name="check" size="16px" />
          Hecha
        </span>
      </div>
      <button
        type="button"
        class="semana-hero__cta"
        :class="{
          'semana-hero__cta--secondary': cta.variant === 'secondary',
          'semana-hero__cta--unavailable': cta.variant === 'unavailable',
        }"
        :disabled="cta.variant === 'unavailable'"
        @click="onCta"
      >
        {{ cta.label }}
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
import { useQuasar } from 'quasar'
import type { WeekDay } from '../../types/session'
import { sessionTitle } from '../../utils/blockMeta'
import { resolveSemanaCta } from '../../utils/semanaCta'
import { dayKicker } from '../../utils/weekLabels'

// Fase 197 D-03: fila título + CTA mitad y mitad, con los 6 estados del CTA (resolveSemanaCta).
const props = defineProps<{
  /** Día elegido en la tira */
  day: WeekDay | undefined
  /** Hoy en la zona de la sede */
  today: string
  hasProgress: boolean
}>()

const emit = defineEmits<{
  start: [date: string]
  redo: [date: string]
  summary: []
  'go-libre': []
}>()

const $q = useQuasar()

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
    case 'redo':
      // Pisa el registro previo de ese día: se pide confirmación (T-197-32)
      $q.dialog({
        title: 'Hacerla igual',
        message:
          'Vas a reiniciar la sesión de este día. El progreso registrado anteriormente se perderá.',
        cancel: { label: 'Cancelar', flat: true },
        ok: { label: 'Hacerla igual', color: 'primary' },
        persistent: true,
      }).onOk(() => {
        emit('redo', date)
      })
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
    color: $pd-terra-ink;
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
