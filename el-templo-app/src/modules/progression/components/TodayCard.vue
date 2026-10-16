<template>
  <!-- Estado `cargando` (L38): mismo marco (borde, radio y padding) y alto mínimo que la card final
       para que el slot de hoy no salte cuando se resuelve el gate. Sin textos ni acciones. -->
  <div v-if="model.kind === 'cargando'" class="today-card today-card--loading">
    <section class="today-card__surface" aria-busy="true" aria-label="Cargando tu día">
      <q-skeleton dark animation="none" class="today-card__sk today-card__sk--kicker" />
      <q-skeleton dark animation="none" class="today-card__sk today-card__sk--title" />
      <q-skeleton dark animation="none" class="today-card__sk today-card__sk--meta" />
      <q-skeleton dark animation="none" class="today-card__sk today-card__sk--btn" />
    </section>
  </div>

  <!-- La card solo PINTA el modelo de resolveTodayCard (L36): ninguna lógica de gates acá.
       Los textos van por interpolación; los tramos `strong` salen como <b> (T-199-41).
       Halo, marca del logo y línea son decoración: aria-hidden, detrás del texto, sin toques. -->
  <div v-else class="today-card">
    <section class="today-card__surface" :aria-label="model.kicker">
      <span class="today-card__halo" aria-hidden="true" />
      <span class="today-card__mark" aria-hidden="true" />
      <span class="today-card__line" aria-hidden="true" />

      <div class="today-card__content">
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
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * Card de hoy de Mi Templo (fase 199, variante A', D-03).
 * Look: ganador del sketch 006 (C3 + borde A, UAT D12).
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
// Look: ganador del sketch 006 ("C3 + borde A"). La raíz es el marco con el borde degradé;
// la superficie oscura va adentro. Texto SIEMPRE en color sólido (UI-SPEC): las decoraciones
// (logo, halo, línea, borde, destello) son aria-hidden, no capturan toques y quedan detrás.
.today-card {
  position: relative;
  border-radius: 21px;
  padding: 1.5px;
  background: linear-gradient(
    115deg,
    #4a3a2b 0%,
    #a35f3c 30%,
    #f0d2b4 45%,
    #a35f3c 60%,
    #4a3a2b 100%
  );
  background-size: 250% 250%;
  background-position: 0% 50%;
  box-shadow: 0 10px 24px rgba(44, 35, 24, 0.22);

  &__surface {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    box-sizing: border-box;
    background: #2c2318;
    color: #f0e6d6;
    border-radius: 20px;
    padding: 20px 16px 16px;
    box-shadow: none;
  }

  // Decoración: detrás del texto, sin toques.
  &__mark {
    position: absolute;
    z-index: 1;
    right: -120px;
    top: -40px;
    width: 330px;
    height: 330px;
    background: url('/logo.webp') center/contain no-repeat;
    opacity: 0.12;
    filter: sepia(0.6) saturate(1.6) brightness(1.4);
    pointer-events: none;
  }

  &__halo {
    position: absolute;
    z-index: 0;
    right: -30px;
    top: 10px;
    width: 220px;
    height: 220px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(163, 95, 60, 0.38), transparent 65%);
    opacity: 0.75;
    pointer-events: none;
  }

  &__line {
    position: absolute;
    z-index: 1;
    left: 16px;
    right: 16px;
    bottom: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, #a35f3c, #e9bf9b, #a35f3c, transparent);
    opacity: 0.9;
    pointer-events: none;
  }

  &__content {
    position: relative;
    z-index: 2;
  }

  &__kicker {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #e3c9a8;
  }

  &__title {
    margin: 6px 0 4px;
    max-width: 78%;
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

  // Botón primario: CTA premium en terracota (blanco sobre #a35f3c 4.9:1, sobre #7e4529 7.4:1).
  &__btn {
    position: relative;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 48px;
    min-width: 44px;
    padding: 0 20px;
    border: 0;
    border-radius: 10px;
    background: linear-gradient(135deg, #a35f3c, #7e4529);
    color: #fff;
    font-family: 'Geologica', sans-serif;
    font-weight: 600;
    font-size: 15px;
    letter-spacing: 0.3px;
    cursor: pointer;
    box-shadow:
      0 4px 14px rgba(126, 69, 41, 0.45),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
    transition:
      transform 0.1s,
      filter 0.15s;

    &:hover {
      filter: brightness(1.07);
    }

    &:active {
      transform: scale(0.97);
    }

    // Destello que cruza el botón: decorativo, fuera de la vista hasta que corre la animación.
    &::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: -60%;
      width: 40%;
      background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.28), transparent);
      transform: skewX(-18deg);
      pointer-events: none;
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

  // ── Skeleton `cargando`: mismo marco y mismas medidas que el contenido real ──
  &--loading {
    display: flex;
    min-height: 180px;
    box-sizing: border-box;

    .today-card__surface {
      flex: 1;
    }
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

// Todo el movimiento va acá: con `prefers-reduced-motion: reduce` el borde, el halo y el
// destello quedan quietos (L38, T-199-67). Solo se animan background-position/opacity/transform.
@media (prefers-reduced-motion: no-preference) {
  .today-card:not(.today-card--loading) {
    animation: border-flow 7s linear infinite;
  }

  .today-card__halo {
    animation: breathe 7s ease-in-out infinite;
  }

  .today-card__btn::after {
    animation: sheen 5s ease-in-out 1.2s infinite;
  }

  .today-card--loading .today-card__sk {
    animation: today-card-pulse 1.4s ease-in-out infinite;
  }
}

@keyframes border-flow {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 250% 50%;
  }
}

@keyframes breathe {
  0%,
  100% {
    opacity: 0.75;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

@keyframes sheen {
  0%,
  70% {
    left: -60%;
  }
  100% {
    left: 130%;
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
