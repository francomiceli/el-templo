<script setup lang="ts">
import { computed } from 'vue';
import { colors } from 'quasar';
import { Handle, Position } from '@vue-flow/core';
import type { Effort, OrderSource, MilestoneVariant } from 'src/types/tree-editor';
// R2-BANDS: la banda se resuelve contra DL_BANDS (mapeo locked) vía dlBand().
import { dlBand, bandTextClass } from 'src/constants/levels';

/** Data payload of an exercise (chain step) node in the tree map canvas. */
export interface ExerciseNodeData {
  exerciseId: number;
  name: string;
  dl: number | null;
  orderSource: OrderSource;
  /** routes.code of the owning chain. */
  route: string;
  /** Effort partition of the owning chain. */
  effort: Effort;
  /** 0-based position within the chain (display: escalón N). */
  stepIndex: number;
  /**
   * Variantes hanging off this hito (Plan 03 contract, dl asc; `[]` = none).
   * 1:1 mirror of the backend; drives the chevron + "+N variantes" counter.
   */
  variants: MilestoneVariant[];
  /**
   * Whether the page currently renders this hito's variantes below it.
   * State LIVES IN THE PAGE (expandedMilestones, D-10) — the node only reads it.
   */
  variantsExpanded: boolean;
}

const props = defineProps<{ data: ExerciseNodeData; selected?: boolean }>();

/** The page owns the expansion state; the node only emits the toggle intent. */
const emit = defineEmits<{ toggleVariants: [exerciseId: number] }>();

/** Chevron + counter only when the hito actually has variantes. */
const hasVariants = computed(() => props.data.variants.length > 0);

function onToggle(): void {
  emit('toggleVariants', props.data.exerciseId);
}

// ── Banda de dificultad (R2-BANDS) ───────────────────────────────────────────

const band = computed(() => dlBand(props.data.dl));

/** Stripe de 4px del color de la banda; convive con --manual/--selected (solo lado izquierdo). */
const stripeStyle = computed(() =>
  band.value ? { borderLeft: `4px solid ${colors.getPaletteColor(band.value.color)}` } : {}
);

const badgeColor = computed(() => band.value?.color ?? 'grey-6');
const badgeTextClass = computed(() => (band.value ? bandTextClass(band.value) : 'text-white'));

/** Tooltip `{banda} (dl {min}–{max})` — rango colapsado cuando min === max (ej. `alfa (dl 3)`). */
const bandTooltip = computed(() => {
  if (!band.value) return null;
  const { level, min, max } = band.value;
  return min === max ? `${level} (dl ${min})` : `${level} (dl ${min}–${max})`;
});
</script>

<template>
  <div
    class="exercise-flow-node"
    :class="{
      'exercise-flow-node--selected': selected,
      'exercise-flow-node--manual': data.orderSource === 'manual',
    }"
    :style="stripeStyle"
  >
    <!-- Top/bottom handles: chain edges land here (vertical layout); dragging from
         one node to another creates a manual precedence (page's onConnect). -->
    <Handle type="target" :position="Position.Top" class="exercise-flow-node__handle" />
    <div class="exercise-flow-node__step">{{ data.stepIndex + 1 }}</div>
    <div class="exercise-flow-node__body">
      <div class="exercise-flow-node__name">{{ data.name }}</div>
      <div class="exercise-flow-node__meta">
        <q-badge :color="badgeColor" :class="badgeTextClass" :label="`dl ${data.dl ?? '—'}`">
          <q-tooltip v-if="bandTooltip">{{ bandTooltip }}</q-tooltip>
        </q-badge>
        <q-badge
          v-if="data.orderSource === 'manual'"
          color="primary"
          label="Manual"
          class="q-ml-xs"
        />
        <!-- "+N variantes" counter: solo cuando hay variantes Y el hito está colapsado.
             Al expandir, las variantes cuelgan en el canvas y el chip desaparece (D-09/D-10). -->
        <q-badge
          v-if="hasVariants && !data.variantsExpanded"
          color="grey-7"
          class="q-ml-xs exercise-flow-node__variants-count"
          :label="`+${data.variants.length} variantes`"
          @click.stop="onToggle"
        >
          <q-tooltip>{{ data.variants.length }} variantes — click para expandir</q-tooltip>
        </q-badge>
      </div>
    </div>
    <!-- Chevron toggle (patrón RouteFlowNode): solo si hay variantes. @click.stop para
         no disparar la selección del nodo (el panel lateral sigue funcionando, D-10). -->
    <q-icon
      v-if="hasVariants"
      :name="data.variantsExpanded ? 'unfold_less' : 'unfold_more'"
      size="18px"
      class="exercise-flow-node__chevron"
      @click.stop="onToggle"
    >
      <q-tooltip>{{
        data.variantsExpanded ? 'Colapsar variantes' : 'Expandir variantes'
      }}</q-tooltip>
    </q-icon>
    <Handle type="source" :position="Position.Bottom" class="exercise-flow-node__handle" />
  </div>
</template>

<style lang="scss" scoped>
.exercise-flow-node {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 200px;
  padding: 8px 10px;
  border: 1px solid $grey-5;
  border-radius: 8px;
  background: #fff;
  cursor: grab;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);

  &--manual {
    border-color: $primary;
  }

  &--selected {
    outline: 2px solid $primary;
    outline-offset: 1px;
  }

  &__step {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: $grey-3;
    color: $grey-8;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &--manual &__step {
    background: $primary;
    color: #fff;
  }

  &__body {
    min-width: 0;
  }

  &__name {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  &__meta {
    display: flex;
    align-items: center;
    font-size: 10px;
    color: $grey-7;
  }

  &__handle {
    width: 8px;
    height: 8px;
    background: $grey-6;
  }

  &__chevron {
    flex-shrink: 0;
    margin-left: auto;
    color: $grey-7;
    cursor: pointer;

    &:hover {
      color: $primary;
    }
  }

  &__variants-count {
    cursor: pointer;
  }
}
</style>
