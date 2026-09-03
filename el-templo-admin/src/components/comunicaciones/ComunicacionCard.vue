<!-- Card genérica de un ítem de Comunicaciones (Fase 193, Plan B, pedido de
     Franco 2026-09-03) — reemplaza las `q-table` de Push/Avisos/Tarjetas/TV
     por una grilla de cards homogénea. El chip de origen (Sistema/Propia)
     es SOLO informativo: las 4 categorías editan y borran igual sin
     importar el origen (homogeneidad, ver plan).

     Pase de diseño 2026-09-03 (Franco: "a las cards les falta énfasis"):
     superficie blanca sobre el Marble Cream de la página, título con más
     peso, métricas en una franja crema con números grandes, y el estado
     (toggle) baja al pie junto a las acciones para despejar la cabecera.
     Una card pausada se atenúa entera.

     Plan C 2026-09-03 (Franco, tras ver el dashboard en staging):
      1. El chip "Sistema"/"Propia" no sirve — pasa a decir QUIÉN LO VE
         (prop `audience`, calculada en `src/utils/comunicaciones-audience.ts`
         + catálogo `src/config/system-audiences.ts`). El origen queda SOLO
         en el filete terracota izquierdo (`comm-card--custom`).
      2. La fila de estado (toggle) + acciones sube a ser la PRIMERA fila de
         la card (`comm-card__topbar`), no el pie — el título va debajo. -->
<template>
  <q-card
    flat
    bordered
    class="comm-card"
    :class="{ 'comm-card--paused': !enabled, 'comm-card--custom': origin === 'custom' }"
  >
    <div class="comm-card__topbar">
      <div class="row items-center no-wrap comm-card__state">
        <q-toggle
          :model-value="enabled"
          color="positive"
          dense
          size="sm"
          :disable="toggleDisabled"
          @update:model-value="(val: boolean) => emit('update:enabled', val)"
        />
        <span
          class="comm-card__state-label"
          :class="enabled ? 'comm-card__state-label--on' : 'comm-card__state-label--off'"
        >
          {{ enabled ? 'Activo' : 'Pausado' }}
        </span>
      </div>
      <div class="row items-center no-wrap comm-card__actions">
        <slot name="extra-actions" />
        <q-btn flat round dense icon="edit" color="primary" @click="emit('edit')">
          <q-tooltip>Editar</q-tooltip>
        </q-btn>
        <q-btn flat round dense icon="delete" color="negative" @click="emit('delete')">
          <q-tooltip>Borrar</q-tooltip>
        </q-btn>
      </div>
    </div>

    <q-card-section class="comm-card__header">
      <div class="comm-card__titles">
        <div class="comm-card__title">{{ title }}</div>
        <div v-if="subtitle" class="comm-card__subtitle">{{ subtitle }}</div>
      </div>
      <span
        class="comm-card__audience"
        :class="`comm-card__audience--${audience.breadth}`"
      >
        <q-icon :name="audience.icon" size="14px" />
        <span class="comm-card__audience-text">{{ audience.label }}</span>
      </span>
    </q-card-section>

    <q-card-section v-if="meta.length" class="comm-card__meta">
      <div v-for="(m, idx) in meta" :key="idx" class="comm-card__meta-line">
        <q-icon :name="m.icon" size="16px" />
        <span>{{ m.text }}</span>
      </div>
    </q-card-section>

    <div class="comm-card__body-spacer" />

    <q-card-section v-if="metrics.length" class="comm-card__metrics-wrap">
      <div class="comm-card__metrics">
        <div v-for="(m, idx) in metrics" :key="idx" class="comm-card__metric">
          <div class="comm-card__metric-value">{{ m.value }}</div>
          <div class="comm-card__metric-label">
            {{ m.label }}
            <q-tooltip v-if="m.hint">{{ m.hint }}</q-tooltip>
          </div>
        </div>
      </div>
    </q-card-section>

    <slot name="preview" />
  </q-card>
</template>

<script setup lang="ts">
import type { Audience } from 'src/config/system-audiences';

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    origin: 'system' | 'custom';
    audience: Audience;
    enabled: boolean;
    toggleDisabled?: boolean;
    meta?: Array<{ icon: string; text: string }>;
    metrics?: Array<{ label: string; value: string | number; hint?: string }>;
  }>(),
  {
    subtitle: undefined,
    toggleDisabled: false,
    meta: () => [],
    metrics: () => [],
  },
);

const emit = defineEmits<{
  'update:enabled': [value: boolean];
  edit: [];
  delete: [];
}>();
</script>

<style lang="scss" scoped>
$warm-stone: #d9cfc1;
$marble-cream: #f2ede5;
$aged-gold: #b89b5e;
$terracotta: #96593a;
$positive: #3b7249;
$olive-stone: #6b6459;
$charcoal: #3d3732;
$surface: #ffffff;

// Superficie blanca: pisa a propósito la regla global `.q-card` de app.scss
// (Marble Cream), igual que KpiCard.vue.
.comm-card {
  position: relative;
  background-color: $surface !important;
  border: 1px solid $warm-stone;
  border-radius: 12px;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 2px rgba($charcoal, 0.05);
  transition:
    box-shadow 0.15s ease,
    border-color 0.15s ease,
    opacity 0.15s ease;

  &:hover {
    border-color: rgba($terracotta, 0.4);
    box-shadow: 0 6px 16px rgba($charcoal, 0.09);
  }

  // Propia: filete terracota a la izquierda — lo que creó el editor salta a
  // la vista entre las del sistema.
  &--custom {
    border-left: 3px solid $terracotta;
  }

  &--paused {
    opacity: 0.72;

    &:hover {
      opacity: 1;
    }

    .comm-card__title {
      color: $olive-stone;
    }
  }
}

.comm-card__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 6px 10px;
  border-bottom: 1px solid $warm-stone;
  background-color: #faf7f2;
  border-radius: 11px 11px 0 0;
}

.comm-card__state-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  margin-left: 8px;

  &--on {
    color: $positive;
  }

  &--off {
    color: $olive-stone;
  }
}

.comm-card__header {
  padding: 16px 16px 8px;
}

.comm-card__titles {
  min-width: 0;
}

.comm-card__title {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.3;
  color: $charcoal;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.comm-card__subtitle {
  font-size: 0.8125rem;
  color: $olive-stone;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin-top: 3px;
}

// Chip de audiencia: DEBAJO del título (no a la derecha, los labels pueden
// ser largos — "Con sesión de prueba reservada" no entra al lado sin
// truncarse feo).
.comm-card__audience {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  margin-top: 8px;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-radius: 6px;
  padding: 3px 8px;
  border: 1px solid transparent;

  .comm-card__audience-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &--todos {
    background-color: rgba($positive, 0.1);
    border-color: rgba($positive, 0.3);
    color: $positive;
  }

  &--grupo {
    background-color: rgba($terracotta, 0.1);
    border-color: rgba($terracotta, 0.3);
    color: $terracotta;
  }

  &--evento {
    background-color: rgba($aged-gold, 0.14);
    border-color: rgba($aged-gold, 0.35);
    color: darken($aged-gold, 24%);
  }
}

.comm-card__meta {
  padding: 4px 16px 8px;
}

.comm-card__meta-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.8125rem;
  color: darken($olive-stone, 8%);
  line-height: 1.45;
  margin-bottom: 4px;

  .q-icon {
    flex-shrink: 0;
    color: $terracotta;
    margin-top: 1px;
  }

  &:last-child {
    margin-bottom: 0;
  }
}

// Empuja métricas/preview al fondo para que las cards de una misma fila
// alineen su pie aunque tengan distinta cantidad de texto.
.comm-card__body-spacer {
  flex: 1 1 auto;
}

.comm-card__metrics-wrap {
  padding: 4px 12px 12px;
}

.comm-card__metrics {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  background-color: $marble-cream;
  border-radius: 8px;
  padding: 8px 6px;
}

.comm-card__metric {
  text-align: center;
  padding: 0 6px;
  min-width: 0;

  & + & {
    border-left: 1px solid $warm-stone;
  }
}

.comm-card__metric-value {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.375rem;
  font-weight: 700;
  line-height: 1.1;
  color: $charcoal;
  font-variant-numeric: tabular-nums;
}

.comm-card__metric-label {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: $olive-stone;
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
