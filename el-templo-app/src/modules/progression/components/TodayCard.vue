<template>
  <!-- Estado `cargando` (L38): mismo padding/radio y alto mínimo que la card final
       para que el slot de hoy no salte cuando se resuelve el gate. Sin textos ni acciones. -->
  <section
    v-if="model.kind === 'cargando'"
    class="today-card today-card--loading"
    aria-busy="true"
    aria-label="Cargando tu día"
  >
    <q-skeleton dark animation="none" class="today-card__sk today-card__sk--kicker" />
    <q-skeleton dark animation="none" class="today-card__sk today-card__sk--title" />
    <q-skeleton dark animation="none" class="today-card__sk today-card__sk--meta" />
    <q-skeleton dark animation="none" class="today-card__sk today-card__sk--btn" />
  </section>

  <!-- La card solo PINTA el modelo de resolveTodayCard (L36): ninguna lógica de gates acá.
       Los textos van por interpolación; los tramos `strong` salen como <b> (T-199-41). -->
  <section v-else class="today-card" :aria-label="model.kicker">
    <p class="today-card__kicker">{{ model.kicker }}</p>
    <h2 class="today-card__title">{{ model.title }}</h2>

    <p v-if="model.meta" class="today-card__meta">
      <span class="today-card__meta-text">
        <template v-for="(part, i) in model.meta" :key="i">
          <b v-if="part.strong">{{ part.text }}</b>
          <template v-else>{{ part.text }}</template>
        </template>
      </span>
    </p>

    <div
      v-if="model.progress !== null"
      class="today-card__bar"
      role="progressbar"
      aria-label="Sesiones de esta semana"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="progressPercent"
    >
      <i :style="{ width: `${progressPercent}%` }" />
    </div>

    <div
      v-for="(chip, i) in model.chips"
      :key="i"
      class="today-card__chip"
      :class="{ 'today-card__chip--ok': chip.tone === 'ok' }"
    >
      <q-icon :name="chip.icon" size="16px" />
      <span>{{ chip.text }}</span>
    </div>

    <div v-if="model.primary || model.secondary || model.tertiary" class="today-card__actions">
      <button
        v-if="model.primary"
        type="button"
        class="today-card__btn"
        @click="onAction(model.primary)"
      >
        {{ model.primary.label }}
      </button>
      <button
        v-if="model.secondary"
        type="button"
        class="today-card__link"
        @click="onAction(model.secondary)"
      >
        {{ model.secondary.label }}
      </button>
      <button
        v-if="model.tertiary"
        type="button"
        class="today-card__link"
        @click="onAction(model.tertiary)"
      >
        {{ model.tertiary.label }}
      </button>
    </div>

    <p v-if="model.hook" class="today-card__hook">
      <template v-for="(part, i) in model.hook" :key="i">
        <b v-if="part.strong">{{ part.text }}</b>
        <template v-else>{{ part.text }}</template>
      </template>
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * Card de hoy de Mi Templo (fase 199, variante A', D-03).
 *
 * Solo pinta un `TodayCardModel` (ver `resolveTodayCard`). Navegación: las acciones con
 * `to` hacen `router.push`; la acción `open-program` se delega al padre (abre la hoja).
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { TodayCardAction, TodayCardModel } from '../utils/today-card'

const props = defineProps<{
  model: TodayCardModel
}>()

const emit = defineEmits<{
  'open-program': []
}>()

const router = useRouter()

const progressPercent = computed(() =>
  props.model.progress === null
    ? 0
    : Math.round(Math.min(Math.max(props.model.progress, 0), 1) * 100),
)

function onAction(action: TodayCardAction): void {
  if (action.action === 'open-program') {
    emit('open-program')
    return
  }
  if (action.to) {
    void router.push(action.to)
  }
}
</script>

<style scoped lang="scss">
// Variante A' del sketch 005: oscura, sin borde ni pastilla de promo, botón crema.
// Texto SIEMPRE en color sólido (UI-SPEC): el único rgba permitido es el fondo del chip.
.today-card {
  background: #2c2318;
  color: #f0e6d6;
  border-radius: 20px;
  padding: 20px 16px 16px;
  box-shadow: 0 10px 24px rgba(44, 35, 24, 0.22);
  position: relative;

  &__kicker {
    margin: 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #e3c9a8;
  }

  &__title {
    margin: 6px 0 4px;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 28px;
    line-height: 1.15;
    letter-spacing: -0.01em;
    color: #f0e6d6;
  }

  &__meta {
    margin: 0;
    font-size: 15px;
    color: #f0e6d6;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    align-items: center;
  }

  &__bar {
    height: 6px;
    border-radius: 3px;
    margin-top: 12px;
    overflow: hidden;
    background: #4a3f33;

    i {
      display: block;
      height: 100%;
      border-radius: 3px;
      background: #e3c9a8;
    }
  }

  &__chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
    background: rgba(240, 230, 214, 0.12);
    color: #f0e6d6;

    &--ok {
      background: #2f4a35;
      color: #d9efdc;
    }
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 18px;
    flex-wrap: wrap;
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 48px;
    min-width: 44px;
    padding: 0 20px;
    border: 0;
    border-radius: 12px;
    background: #f0e6d6;
    color: #2c2318;
    font-family: 'Geologica', sans-serif;
    font-weight: 600;
    font-size: 15px;
    cursor: pointer;
    transition:
      transform 0.1s,
      filter 0.15s;

    &:hover {
      filter: brightness(1.06);
    }

    &:active {
      transform: scale(0.97);
    }
  }

  &__link {
    min-height: 44px;
    padding: 12px 0;
    border: 0;
    background: none;
    color: #f0e6d6;
    font-family: 'Geologica', sans-serif;
    font-weight: 500;
    font-size: 14px;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  &__btn:focus-visible,
  &__link:focus-visible {
    outline: 2px solid #e3c9a8;
    outline-offset: 2px;
  }

  &__hook {
    margin: 16px 0 0;
    padding-top: 12px;
    border-top: 1px solid #4a3f33;
    font-size: 14px;
    color: #f0e6d6;
  }

  // ── Skeleton `cargando`: mismas medidas que el contenido real ──
  &--loading {
    min-height: 180px;
    box-sizing: border-box;
  }

  &__sk {
    background: #4a3f33;
    border-radius: 6px;

    &--kicker {
      width: 40%;
      height: 11px;
    }

    &--title {
      width: 70%;
      height: 28px;
      margin: 8px 0 8px;
    }

    &--meta {
      width: 55%;
      height: 15px;
    }

    &--btn {
      width: 140px;
      height: 48px;
      margin-top: 18px;
      border-radius: 12px;
    }
  }
}

// Pulso suave solo si el usuario no pidió menos movimiento (L38).
@media (prefers-reduced-motion: no-preference) {
  .today-card--loading .today-card__sk {
    animation: today-card-pulse 1.4s ease-in-out infinite;
  }
}

@keyframes today-card-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>
