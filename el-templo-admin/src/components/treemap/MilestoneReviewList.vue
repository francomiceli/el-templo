<script setup lang="ts">
/**
 * MilestoneReviewList — drawer list of the /tree-map review (Phase 133 Plan 06).
 *
 * Presentational extraction of the `tree-map-review` list (UI-SPEC C4): rows are
 * the MERGE of the pending dimension proposals (phase 125 flow) with the pending
 * hito/variante proposals (plan 05), keyed by exerciseId, grouped visually by
 * detected movement token. ONE accept per row writes BOTH axes (locked decision
 * 2) — the page owns state, fetching and mutations; this component only emits.
 *
 * TTB-SIG (locked decision 4): on the TTB route a persistent, non-dismissable
 * q-banner reminds the profes that the grouping may be a route split.
 */
import { computed } from 'vue';
import type { Proposal } from 'src/types/proposal';
import type { MilestoneReviewRow } from 'src/types/tree-editor';

/** A MilestoneReviewRow extended with the row's editable review state. */
export interface EditableMilestoneRow extends MilestoneReviewRow {
  /** Toggle state, pre-populated by the heuristic (null proposed target → hito). */
  role: 'hito' | 'variante';
  /** Selected target hito when role='variante' (pre-populated with the proposed one). */
  targetId: number | null;
}

/** One drawer row: dimension proposal and/or hito proposal of the same exercise. */
export interface MergedReviewRow {
  exerciseId: number;
  name: string;
  /** Pending dimension proposal (existing flow) — null when only the hito axis exists. */
  proposal: Proposal | null;
  /** Pending hito/variante proposal (plan 05) — null when only the dimension axis exists. */
  milestone: EditableMilestoneRow | null;
}

/** Option of the dependent "Hito" select (candidates of the same movement × step group). */
export interface HitoCandidate {
  label: string;
  value: number;
}

const props = defineProps<{
  rows: MergedReviewRow[];
  /** routes.code open in the drawer (drives the TTB split banner). */
  route: string;
  /** exerciseId of the row with a mutation in flight (loading state). */
  busyExerciseId: number | null;
  stepOptions: (p: Proposal) => { label: string; value: number }[];
  habilidadOptions: (p: Proposal) => string[];
  unmatched: (p: Proposal) => boolean;
  hitoCandidates: (row: MergedReviewRow) => HitoCandidate[];
}>();

const emit = defineEmits<{
  (e: 'accept', row: MergedReviewRow): void;
  (e: 'reject', row: MergedReviewRow): void;
  (e: 'update-role', row: MergedReviewRow, role: 'hito' | 'variante'): void;
  (e: 'update-target', row: MergedReviewRow, targetId: number | null): void;
  (e: 'update-step', row: MergedReviewRow, step: number | null): void;
  (e: 'update-habilidad', row: MergedReviewRow, habilidad: string | null): void;
}>();

const ROLE_OPTIONS = [
  { label: 'Hito', value: 'hito' },
  { label: 'Variante', value: 'variante' },
] as const;

/** TTB split signal (TTB-SIG) — persistent, not dismissable, not actionable. */
const isTtbRoute = computed(() => props.route.trim().toUpperCase() === 'TTB');

interface ReviewGroup {
  key: string;
  label: string;
  rows: MergedReviewRow[];
}

/**
 * Rows grouped by detected movement token; rows without a token (including
 * dimension-only rows) go LAST under the "Sin movimiento detectado" header.
 */
const groups = computed<ReviewGroup[]>(() => {
  const byToken = new Map<string, MergedReviewRow[]>();
  const noToken: MergedReviewRow[] = [];
  for (const row of props.rows) {
    const token = row.milestone?.movementToken ?? null;
    if (token === null) {
      noToken.push(row);
      continue;
    }
    const bucket = byToken.get(token);
    if (bucket) bucket.push(row);
    else byToken.set(token, [row]);
  }
  const result: ReviewGroup[] = [...byToken.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([token, rows]) => ({ key: token, label: token, rows }));
  if (noToken.length > 0) {
    result.push({ key: '__sin-movimiento__', label: 'Sin movimiento detectado', rows: noToken });
  }
  return result;
});

/** Accept needs a target when the row is toggled to variante (backend 400 otherwise). */
function acceptDisabled(row: MergedReviewRow): boolean {
  return (
    row.milestone !== null && row.milestone.role === 'variante' && row.milestone.targetId === null
  );
}
</script>

<template>
  <div class="milestone-review-list">
    <!-- Señal de split TTB (TTB-SIG) — persistente, no descartable, no accionable -->
    <q-banner v-if="isTtbRoute" dense class="bg-warning text-white">
      <template #avatar>
        <q-icon name="call_split" />
      </template>
      <div class="text-subtitle2">Posible split de ruta</div>
      <div class="text-caption">
        Los movimientos TTB, Windshield y ATW podrían ser rutas separadas. La decisión se toma con
        los profes — esta agrupación es la referencia.
      </div>
    </q-banner>

    <div v-if="rows.length === 0" class="q-pa-md text-grey-6 text-caption">
      No quedan propuestas pendientes en esta ruta 🎉
    </div>

    <template v-else>
      <template v-for="group in groups" :key="group.key">
        <div class="milestone-review-list__group-header q-px-md q-pt-sm">
          {{ group.label }} ({{ group.rows.length }})
        </div>
        <q-list separator>
          <q-item v-for="row in group.rows" :key="row.exerciseId" class="column q-py-sm">
            <div class="row items-center no-wrap full-width">
              <div class="col text-body2 text-weight-medium">
                {{ row.name }}
                <q-badge
                  v-if="row.milestone"
                  :color="row.milestone.role === 'hito' ? 'primary' : 'grey-7'"
                  outline
                  :label="row.milestone.role === 'hito' ? 'Hito' : 'Variante'"
                  class="q-ml-xs"
                />
                <q-badge
                  v-if="row.proposal && unmatched(row.proposal)"
                  color="orange-8"
                  label="sin escalón"
                  class="q-ml-xs"
                />
              </div>
              <q-btn
                flat
                dense
                round
                size="sm"
                icon="check"
                color="positive"
                :loading="busyExerciseId === row.exerciseId"
                :disable="acceptDisabled(row)"
                aria-label="Aceptar"
                @click="emit('accept', row)"
              >
                <q-tooltip>Aceptar</q-tooltip>
              </q-btn>
              <q-btn
                flat
                dense
                round
                size="sm"
                icon="close"
                color="negative"
                :loading="busyExerciseId === row.exerciseId"
                aria-label="Rechazar"
                @click="emit('reject', row)"
              >
                <q-tooltip>Rechazar</q-tooltip>
              </q-btn>
            </div>

            <!-- Eje hito/variante (R1-REV): toggle + select dependiente de hito -->
            <div v-if="row.milestone" class="row items-center q-col-gutter-sm q-mt-xs full-width">
              <div class="col-auto">
                <q-btn-toggle
                  :model-value="row.milestone.role"
                  :options="[...ROLE_OPTIONS]"
                  dense
                  unelevated
                  no-caps
                  size="sm"
                  toggle-color="primary"
                  color="grey-3"
                  text-color="grey-8"
                  @update:model-value="(v: 'hito' | 'variante') => emit('update-role', row, v)"
                />
              </div>
              <div v-if="row.milestone.role === 'variante'" class="col">
                <q-select
                  :model-value="row.milestone.targetId"
                  :options="hitoCandidates(row)"
                  label="Hito"
                  dense
                  outlined
                  emit-value
                  map-options
                  @update:model-value="(v: number | null) => emit('update-target', row, v)"
                />
              </div>
            </div>

            <!-- Eje de dimensiones (flujo existente, in-place) -->
            <div v-if="row.proposal" class="row q-col-gutter-sm q-mt-xs full-width">
              <div class="col-6">
                <q-select
                  v-if="stepOptions(row.proposal).length > 0"
                  :model-value="row.proposal.proposedStep"
                  :options="stepOptions(row.proposal)"
                  label="Escalón"
                  dense
                  outlined
                  clearable
                  emit-value
                  map-options
                  @update:model-value="(v: number | null) => emit('update-step', row, v)"
                />
                <div v-else class="text-caption text-grey-6 q-pt-sm">ruta lineal (sin tokens)</div>
              </div>
              <div class="col-6">
                <q-select
                  :model-value="row.proposal.proposedHabilidad"
                  :options="habilidadOptions(row.proposal)"
                  label="Habilidad"
                  dense
                  outlined
                  clearable
                  use-input
                  new-value-mode="add-unique"
                  @update:model-value="(v: string | null) => emit('update-habilidad', row, v)"
                />
              </div>
            </div>
          </q-item>
        </q-list>
      </template>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.milestone-review-list {
  &__group-header {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: $grey-7;
  }
}
</style>
