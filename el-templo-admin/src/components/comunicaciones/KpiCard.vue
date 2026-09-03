<!-- KPI card de categoría del dashboard de Comunicaciones (Fase 193, Plan B,
     pedido de Franco 2026-09-03). Número grande "fancy" (Montserrat 700,
     tabular-nums — Cormorant Garamond NO está cargada globalmente en el
     admin hoy, ver decisión en el reporte del plan) con una animación corta
     de conteo al montar/cambiar de valor. Clic = selecciona la categoría
     (`active` la resalta con acento Terracotta). -->
<template>
  <q-card
    flat
    bordered
    class="kpi-card"
    :class="{ 'kpi-card--active': active }"
    role="button"
    tabindex="0"
    @click="emit('click')"
    @keydown.enter="emit('click')"
    @keydown.space.prevent="emit('click')"
  >
    <q-card-section class="kpi-card__section">
      <div class="row items-center justify-between no-wrap">
        <q-icon :name="icon" size="20px" class="kpi-card__icon" />
        <q-spinner v-if="loading" size="16px" color="grey-6" />
      </div>
      <div class="kpi-card__value">{{ displayValue }}</div>
      <div class="kpi-card__label">{{ label }}</div>
      <div v-if="hint" class="kpi-card__hint">{{ hint }}</div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

const props = defineProps<{
  label: string;
  value: number | string;
  hint?: string;
  icon: string;
  active: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{ click: [] }>();

// ── Animación de conteo (≤600ms, respeta prefers-reduced-motion) ──────────
const displayValue = ref<number | string>(typeof props.value === 'number' ? 0 : props.value);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

function animateTo(target: number): void {
  if (prefersReducedMotion()) {
    displayValue.value = target;
    return;
  }
  const duration = 500;
  const start = performance.now();
  const from = typeof displayValue.value === 'number' ? displayValue.value : 0;

  function step(now: number): void {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    displayValue.value = Math.round(from + (target - from) * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

watch(
  () => props.value,
  (newValue) => {
    if (typeof newValue === 'number') {
      animateTo(newValue);
    } else {
      displayValue.value = newValue;
    }
  },
);

onMounted(() => {
  if (typeof props.value === 'number') animateTo(props.value);
});
</script>

<style lang="scss" scoped>
// Fuentes cargadas por Vite (paquete ya instalado en package.json,
// @fontsource/montserrat — solo faltaba importarse; NO es una dependencia
// nueva ni un CDN). Import local a este componente: alcanza con el peso 700
// que usa el número grande.
@import '@fontsource/montserrat/700.css';

$warm-stone: #d9cfc1;
$sandy-beige: #e5d9c8;
$terracotta: #96593a;
$olive-stone: #6b6459;
$charcoal: #3d3732;

.kpi-card {
  cursor: pointer;
  border-color: $warm-stone;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    border-color: $terracotta;
  }

  &:focus-visible {
    outline: 2px solid $terracotta;
    outline-offset: 2px;
  }

  &--active {
    border-color: $terracotta;
    border-width: 2px;
    background-color: $sandy-beige;
  }
}

.kpi-card__section {
  padding: 14px 16px 12px;
}

.kpi-card__icon {
  color: $terracotta;
}

.kpi-card__value {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: clamp(2.2rem, 4vw, 3.2rem);
  line-height: 1.05;
  color: $charcoal;
  margin-top: 4px;
}

.kpi-card__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: $olive-stone;
  margin-top: 2px;
}

.kpi-card__hint {
  font-size: 0.75rem;
  color: $olive-stone;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
