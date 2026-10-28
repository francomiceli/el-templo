<template>
  <!-- Sketch 028 D: card OSCURA hermana de los pop-ups (marco degradé quieto + línea luminosa) con la
       línea de tiempo adentro: actual -> hueco -> próxima. Sin "Cubierto hasta…" y sin montos. -->
  <section class="tp-frame" aria-label="Tu plan">
    <div class="tp-card">
      <span class="tp-line" aria-hidden="true" />

      <template v-if="model.kind === 'timeline'">
        <p class="tp-kicker tp-kicker--head">{{ model.kicker }}</p>
        <ol class="tp-tl">
          <li v-for="(node, i) in model.nodes" :key="i" class="tp-node">
            <!-- Actual -->
            <template v-if="node.kind === 'current'">
              <span class="tp-mk tp-mk--now" aria-hidden="true">
                <q-icon
                  :name="node.pill?.icon === 'pause' ? 'pause' : 'fiber_manual_record'"
                  size="10px"
                />
              </span>
              <div class="tp-body">
                <div class="tp-now-name">{{ node.name }}</div>
                <div v-if="node.meta" class="tp-meta">{{ node.meta }}</div>
                <div class="tp-meta">{{ node.period }}</div>
                <div v-if="node.progress !== null" class="tp-bar" aria-hidden="true">
                  <i :style="{ width: `${node.progress}%` }" />
                </div>
                <span v-if="node.pill" class="tp-pill" :class="`tp-pill--${node.pill.tone}`">
                  <q-icon v-if="node.pill.icon" :name="node.pill.icon" size="14px" />
                  {{ node.pill.text }}
                </span>
              </div>
            </template>

            <!-- Hueco -->
            <template v-else-if="node.kind === 'gap'">
              <span class="tp-mk tp-mk--gap" aria-hidden="true" />
              <div class="tp-body">
                <div class="tp-now-name tp-now-name--sm">{{ node.title }}</div>
                <div v-if="node.detail" class="tp-meta">{{ node.detail }}</div>
              </div>
            </template>

            <!-- Próxima -->
            <template v-else-if="node.kind === 'next'">
              <span
                class="tp-mk tp-mk--next"
                :class="{ 'tp-mk--ok': node.confirmed }"
                aria-hidden="true"
              >
                <q-icon v-if="node.confirmed" name="check" size="14px" />
              </span>
              <div class="tp-body">
                <div class="tp-row">
                  <span class="tp-k2">{{ node.label }}</span>
                  <span class="tp-pill" :class="`tp-pill--${node.pill.tone}`">
                    <q-icon v-if="node.pill.icon" :name="node.pill.icon" size="14px" />
                    {{ node.pill.text }}
                  </span>
                </div>
                <div class="tp-next-name">{{ node.name }}</div>
                <div class="tp-d2">{{ node.period }}</div>
              </div>
            </template>

            <!-- Sin renovación cargada -->
            <template v-else>
              <span class="tp-mk tp-mk--none" aria-hidden="true" />
              <div class="tp-body">
                <div class="tp-k2">{{ node.label }}</div>
                <div class="tp-d2">{{ node.text }}</div>
              </div>
            </template>
          </li>
        </ol>
      </template>

      <!-- Sin plan activo / nunca tuvo plan -->
      <div v-else class="tp-top">
        <p class="tp-kicker">{{ model.kicker }}</p>
        <div class="tp-now-name">{{ model.title }}</div>
        <div class="tp-meta">{{ model.text }}</div>
        <button type="button" class="tp-cta" @click="emit('cta', model.cta.message)">
          <q-icon
            name="img:/icons/whatsapp.svg"
            size="20px"
            class="tp-cta__icon"
            aria-hidden="true"
          />
          {{ model.cta.label }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PlanTimelineModel } from '../utils/plan-timeline'

defineProps<{ model: PlanTimelineModel }>()

const emit = defineEmits<{
  /** El socio tocó el botón de WhatsApp; lleva el texto prellenado. */
  cta: [message: string]
}>()
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

$tp-connector: #5a4a3a; // conector vertical decorativo
$tp-low-tint: #f7e6e2;

.tp-frame {
  @include pd-frame;
  // Sombra del sketch (sobre la página, no sobre un overlay).
  box-shadow: 0 10px 24px rgba(44, 35, 24, 0.2);
}

.tp-card {
  @include pd-card;
  // Espacio para que la línea luminosa no pise el último nodo.
  padding-bottom: 8px;
}

.tp-line {
  @include pd-line;
}

.tp-kicker {
  margin: 0;
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: $pd-cream-2;

  &--head {
    padding: 18px 18px 0;
  }
}

// ── Línea de tiempo ──
.tp-tl {
  position: relative;
  z-index: 2;
  margin: 0;
  padding: 8px 18px 4px;
  list-style: none;
}

.tp-node {
  position: relative;
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 12px;
  padding: 10px 0 14px;

  // Conector vertical: decorativo (pseudo-elemento, no existe para lectores de pantalla).
  &::before {
    content: '';
    position: absolute;
    left: 11px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: $tp-connector;
  }

  &:first-child::before {
    top: 22px;
  }

  &:last-child::before {
    bottom: calc(100% - 22px);
  }

  &:only-child::before {
    display: none;
  }
}

.tp-mk {
  position: relative;
  z-index: 1;
  width: 24px;
  height: 24px;
  margin-top: 2px;
  box-sizing: border-box;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: $pd-surface;

  &--now {
    background: linear-gradient(135deg, $pd-btn-a, $pd-btn-b);
    color: #fff;
    box-shadow: 0 0 0 4px rgba(163, 95, 60, 0.28);
  }

  &--next {
    border: 2px dashed $pd-cream-2;
    color: $pd-cream;
  }

  &--ok {
    border-style: solid;
    background: $pd-cream;
    color: $pd-surface;
  }

  &--gap {
    border: 2px dashed #c9a24a;
  }

  &--none {
    border: 2px dashed #8c7b68;
  }
}

.tp-body {
  min-width: 0;
}

.tp-now-name {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 22px;
  line-height: 1.25;
  color: $pd-cream;
  overflow-wrap: anywhere;

  &--sm {
    font-size: 20px;
  }
}

.tp-meta {
  margin-top: 4px;
  font-size: 14px;
  line-height: 1.4;
  color: $pd-cream;
}

.tp-bar {
  height: 6px;
  margin-top: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(240, 230, 214, 0.18);

  > i {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #a35f3c, #e9bf9b);
  }
}

.tp-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.tp-k2 {
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $pd-cream-2;
}

.tp-next-name {
  margin-top: 2px;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 16px;
  color: $pd-cream;
  overflow-wrap: anywhere;
}

.tp-d2 {
  margin-top: 2px;
  font-size: 13.5px;
  line-height: 1.4;
  color: $pd-cream;
}

// ── Pills (texto sólido sobre su tinte) ──
.tp-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;

  &--ok {
    background: $pd-sage-tint;
    color: $pd-sage;
  }

  &--new {
    background: $pd-cream;
    color: $pd-surface;
  }

  &--mid {
    background: $pd-gold-tint;
    color: $pd-gold-ink;
  }

  &--low {
    background: $tp-low-tint;
    color: $pd-neg-title;
  }
}

.tp-bar + .tp-pill {
  margin-top: 10px;
}

.tp-meta + .tp-pill {
  margin-top: 10px;
}

// ── Sin plan activo / bienvenido ──
.tp-top {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 18px 20px;

  .tp-meta {
    margin-top: 0;
  }
}

.tp-cta {
  @include pd-cta;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;

  &__icon {
    // El SVG de WhatsApp es verde: sobre el botón terracota se ve en blanco.
    filter: brightness(0) invert(1);
  }
}

@include pd-sheen-keyframes;
</style>
