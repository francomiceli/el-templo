<template>
  <!-- Sketch 007 A ("Tablero"): título con las sesiones de la semana en la misma
       fila, los 7 días a todo el ancho (letra dentro del círculo) y el total al pie
       en una franja crema. -->
  <section class="week-strip" aria-label="Tus sesiones">
    <div class="week-strip__head">
      <span class="week-strip__title">Tus sesiones</span>
      <span class="week-strip__week">
        <strong class="week-strip__week-num">{{ sessionsCount }}</strong>
        {{ weekNoun }} esta semana
      </span>
    </div>
    <ul class="week-strip__days">
      <li
        v-for="(dot, i) in dots"
        :key="dot.date"
        class="week-strip__day"
        :class="{
          'week-strip__day--trained': dot.trained,
          'week-strip__day--today': dot.isToday,
          'week-strip__day--future': dot.isFuture,
        }"
        :aria-label="dotAriaLabel(dot, i)"
      >
        <span class="week-strip__dot" aria-hidden="true">{{ dot.letter }}</span>
      </li>
    </ul>
    <!-- Fase 203 (D-07/D-16): sin total conocido (stats pendientes o fallidas) la fila sigue
         ocupando su alto pero invisible: no se afirma "0 sesiones" y la card no cambia de tamaño. -->
    <div
      class="week-strip__total"
      :style="totalUnknown ? { visibility: 'hidden' } : undefined"
      :aria-hidden="totalUnknown"
    >
      <span class="week-strip__total-num">{{ totalText }}</span>
      <span>{{ sessionsTotalCaption(totalSessions ?? 0) }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  dotAriaLabel,
  sessionsThisWeek,
  sessionsTotalCaption,
  weekDots,
} from '../utils/check-in-summary'

const props = defineProps<{
  weekStart: string
  todayStr: string
  completedDates: string[]
  /** null = todavía no se sabe (o stats fallidas): la fila del total queda reservada pero oculta. */
  totalSessions: number | null
}>()

const dots = computed(() => weekDots(props.weekStart, props.todayStr, props.completedDates))
const sessionsCount = computed(() => sessionsThisWeek(props.weekStart, props.completedDates))
const weekNoun = computed(() => (sessionsCount.value === 1 ? 'sesión' : 'sesiones'))
const totalUnknown = computed(() => props.totalSessions === null)
/**
 * "1.284": separador de miles como en el resto de la app. Sin total conocido sale un "0" de
 * relleno (la fila va oculta): un texto vacío achicaría la fila (el número fija su alto).
 */
const totalText = computed(() => (props.totalSessions ?? 0).toLocaleString('es-AR'))
</script>

<style scoped lang="scss">
@import 'src/css/brand';

// Valores del sketch 007 sin variable propia en la app.
$border: #e5dbcd;
$ink: #2c2318; // 15.6:1 sobre blanco
$ink-2: #6b6459; // 5.8:1 sobre blanco, 5.3:1 sobre $plaque
$terra: #96593a; // 5.6:1 sobre blanco, 5.1:1 sobre $plaque
$empty: #f3ede4;
$plaque: #f7f1e8;

// Misma card que Novedades (borde + sombra cálida).
.week-strip {
  overflow: hidden;
  background: #fff;
  border: 1px solid $border;
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba($terra, 0.08);
  padding: 14px 16px 0;

  // Título a la izquierda y la semana a la derecha; si no entran (fuente grande
  // del sistema), la semana baja y arranca desde la izquierda.
  &__head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
  }

  &__title {
    @include mt-block-title;
  }

  &__week {
    font-size: 13px;
    line-height: 1.3;
    color: $ink-2;
  }

  &__week-num {
    margin-right: 1px;
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: $ink;
    font-variant-numeric: tabular-nums;
  }

  // Los 7 días a todo el ancho: a 360 cada columna mide ~38px, entra siempre.
  &__days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    margin: 12px 0 14px;
    padding: 0;
    list-style: none;
  }

  &__day {
    display: flex;
    justify-content: center;
  }

  // Letra dentro del círculo: $ink-2 sobre $empty 5.1:1, blanco sobre $terra 5.6:1.
  &__dot {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: $empty;
    border: 1.5px solid $border;
    font-family: 'Montserrat', sans-serif;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    color: $ink-2;
  }

  &__day--trained &__dot {
    background: $terra;
    border-color: $terra;
    color: #fff;
  }

  // Día que todavía no llegó: vacío y punteado, para que no se lea como "faltaste".
  &__day--future &__dot {
    background: #fff;
    border-style: dashed;
  }

  &__day--today:not(&__day--trained) &__dot {
    color: $ink;
  }

  &__day--today &__dot {
    box-shadow:
      0 0 0 2px #fff,
      0 0 0 4px $ink;
  }

  // Franja crema al pie, de borde a borde.
  &__total {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 -16px;
    padding: 12px 16px;
    border-top: 1px solid $border;
    background: $plaque;
    font-size: 13px;
    line-height: 1.3;
    color: $ink-2;
  }

  &__total-num {
    font-family: 'Montserrat', sans-serif;
    font-size: 26px;
    font-weight: 700;
    line-height: 1;
    color: $terra;
    font-variant-numeric: tabular-nums;
  }
}
</style>
