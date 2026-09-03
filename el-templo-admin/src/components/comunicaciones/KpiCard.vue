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
    :aria-pressed="active"
    @click="emit('click')"
    @keydown.enter="emit('click')"
    @keydown.space.prevent="emit('click')"
  >
    <div class="kpi-card__accent" />
    <q-card-section class="kpi-card__section">
      <div class="row items-center justify-between no-wrap">
        <div class="kpi-card__icon-wrap">
          <q-icon :name="icon" size="20px" class="kpi-card__icon" />
        </div>
        <q-spinner v-if="loading" size="16px" color="grey-6" />
        <q-icon v-else-if="active" name="check_circle" size="18px" class="kpi-card__check" />
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
$surface: #ffffff;

// Superficie BLANCA sobre el Marble Cream de la página (pedido de Franco
// 2026-09-03): la card tiene que leerse como objeto, no fundirse con el fondo.
// La regla global `.q-card { background-color: #f2ede5 }` de app.scss se
// pisa acá a propósito.
.kpi-card {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  background-color: $surface !important;
  border: 1px solid $warm-stone;
  border-radius: 12px;
  height: 100%;
  box-shadow: 0 1px 2px rgba($charcoal, 0.06);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;

  &:hover {
    border-color: rgba($terracotta, 0.55);
    box-shadow: 0 6px 16px rgba($charcoal, 0.1);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid $terracotta;
    outline-offset: 2px;
  }

  // Tab activa: barra superior terracota + ícono relleno + label en color.
  &--active {
    border-color: $terracotta;
    box-shadow: 0 8px 20px rgba($terracotta, 0.18);

    .kpi-card__accent {
      transform: scaleX(1);
    }
    .kpi-card__icon-wrap {
      background-color: $terracotta;
    }
    .kpi-card__icon {
      color: $surface;
    }
    .kpi-card__label {
      color: $terracotta;
    }
  }
}

.kpi-card__accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, $terracotta, lighten($terracotta, 12%));
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.2s ease;
}

.kpi-card__section {
  padding: 18px 18px 14px;
}

.kpi-card__icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background-color: $sandy-beige;
  transition: background-color 0.15s ease;
}

.kpi-card__icon {
  color: $terracotta;
  transition: color 0.15s ease;
}

.kpi-card__check {
  color: $terracotta;
}

.kpi-card__value {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: clamp(2.4rem, 3.6vw, 3.4rem);
  letter-spacing: -0.02em;
  line-height: 1;
  color: $charcoal;
  margin-top: 14px;
}

.kpi-card__label {
  font-size: 0.875rem;
  font-weight: 700;
  color: $charcoal;
  margin-top: 6px;
  transition: color 0.15s ease;
}

.kpi-card__hint {
  font-size: 0.75rem;
  color: $olive-stone;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
