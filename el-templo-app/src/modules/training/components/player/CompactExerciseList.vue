<template>
  <div class="compact-list" :style="listStyle">
    <div
      v-for="(item, index) in exercises"
      :key="item.id"
      class="compact-list__card"
      :class="[
        `compact-list__card--${cardState(item.id, index)}`,
        { 'compact-list__card--mobility': item.isMobility },
      ]"
      @click="emit('navigate', index)"
    >
      <div class="compact-list__row">
        <!-- Nombre: la insignia de contracción va ANTES, con ancho fijo (como la TV) -->
        <div class="compact-list__main">
          <span
            v-if="badgeOf(item)"
            class="compact-list__badge"
            :class="`compact-list__badge--${badgeOf(item)?.kind}`"
          >
            {{ badgeOf(item)?.label }}
          </span>
          <span v-else-if="item.isMobility" class="compact-list__badge compact-list__badge--mov">
            MOV
          </span>
          <div class="compact-list__content">
            <span v-if="cardState(item.id, index) === 'now'" class="compact-list__now">AHORA</span>
            <div v-if="item.isMobility" class="compact-list__mobility-label">DESCANSO ACTIVO</div>
            <div class="compact-list__name">{{ item.name }}</div>
          </div>
          <!-- Indicaciones toggle (exercises with notes, not completed) -->
          <button
            v-if="item.notes?.trim() && !completedIds.has(item.id)"
            class="compact-list__pautas"
            :class="{ 'compact-list__pautas--active': expandedNoteIndex === index }"
            @click.stop="toggleNotes(index)"
          >
            Indicaciones
          </button>
        </div>
        <!-- Placa de dosis: oscura (terracota en el de ahora, verde con el tilde al completarlo) -->
        <div v-if="completedIds.has(item.id)" class="compact-list__plate" aria-label="Completado">
          <q-icon name="check" size="22px" />
        </div>
        <div v-else-if="item.quickDose" class="compact-list__plate">
          <span class="compact-list__plate-value">{{ plateValue(item.quickDose) }}</span>
        </div>
      </div>
      <!-- Expanded notes row -->
      <div v-if="expandedNoteIndex === index && item.notes?.trim()" class="compact-list__notes">
        {{ item.notes }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  CONTRACTION_BADGE_WIDTH_PX,
  contractionBadge,
  type ContractionBadge,
} from '../../utils/contraction'
import { exerciseCardState, plateValue } from '../../utils/exerciseCard'

interface ExerciseItem {
  id: number
  name: string
  quickDose: string
  contraction?: string
  notes?: string
  isMobility?: boolean
}

interface Props {
  /** All exercises in the block (including mobility as last item if present) */
  exercises: ExerciseItem[]
  /** Index of the currently active story slide */
  activeIndex: number
  /** Set of completed exercise IDs */
  completedIds: Set<number>
}

interface Emits {
  (e: 'navigate', index: number): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const expandedNoteIndex = ref<number | null>(null)

// Ancho fijo de la insignia: sale de la util para que los tres colores midan lo mismo
const listStyle = computed(() => ({ '--tempo-badge-w': `${CONTRACTION_BADGE_WIDTH_PX}px` }))

function badgeOf(item: ExerciseItem): ContractionBadge | null {
  return contractionBadge(item.contraction)
}

function cardState(id: number, index: number): 'now' | 'done' | 'idle' {
  return exerciseCardState(index === props.activeIndex, props.completedIds.has(id))
}

function toggleNotes(index: number): void {
  expandedNoteIndex.value = expandedNoteIndex.value === index ? null : index
}

// Reset when active slide changes or exercise gets completed
watch([() => props.activeIndex, () => props.completedIds.size], () => {
  expandedNoteIndex.value = null
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';
@import 'src/css/premium-card';

// Sketch 025 B: fondo blanco y cada ejercicio en una card blanca con el badge de la TV y la placa de
// dosis. Colores de contracción = los de la TV (#tvScreenRoot): CON carbón, EXC oro, ISO arena.
$tv-ink: #3d3732;
$tv-gold: #b08d6e;
$exc-bronze: #7a5c42;
$tv-sand: #dbcab4;
$tv-cream: #f2ebe1;
$plate-text: #f7e6cd;

.compact-list {
  background: #fff;
  padding: 4px 16px 0;
}

.compact-list__card {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
  border: 1px solid $pd-light-line;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 6px rgba($tv-ink, 0.05);
  overflow: hidden;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.compact-list__row {
  display: flex;
  align-items: stretch;
  min-height: 50px;
}

.compact-list__main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 10px 12px;
}

.compact-list__content {
  flex: 1;
  min-width: 0;
}

// Insignia de contracción antes del nombre: ancho fijo -> todos los nombres arrancan en la misma x
.compact-list__badge {
  flex: none;
  box-sizing: border-box;
  width: var(--tempo-badge-w, 42px);
  padding: 2px 4px;
  border-radius: 5px;
  text-align: center;
  font-family: 'Montserrat', sans-serif;
  font-size: 12.5px;
  font-weight: 800;
  line-height: 1.05;

  &--con {
    background: $tv-ink;
    color: $tv-cream; // 9.9:1
  }

  // Bronce más oscuro que el oro de la TV para que el crema se lea (Franco, 2026-10-23): 5.2:1
  &--exc {
    background: $exc-bronze;
    color: $tv-cream;
  }

  &--iso {
    background: $tv-sand;
    color: $tv-ink; // 7.3:1
  }

  &--mov {
    background: transparent;
    color: $pd-ink-2;
    border: 1.5px solid $tv-gold;
    font-size: 10px;
    padding: 2px 2px;
  }
}

.compact-list__now {
  display: block;
  margin-bottom: 2px;
  font-family: 'Montserrat', sans-serif;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: $pd-terra-ink; // 5.5:1 sobre blanco
}

.compact-list__mobility-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 2px;
  // Fase 197 D-16: texto sólido (antes rgba(0,0,0,.4), 2.79:1 medido)
  color: $pd-ink-2;
  margin-bottom: 1px;
}

.compact-list__name {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  color: $tv-ink;
  overflow-wrap: anywhere;
}

// Placa de dosis: oscura y sólida; valor grande + unidad chica abajo
.compact-list__plate {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  max-width: 40%;
  padding: 0 12px;
  background: $tv-ink;
  color: $plate-text; // 9.6:1
  font-family: 'Montserrat', sans-serif;
  text-align: center;
}

.compact-list__plate-value {
  font-size: 19px;
  font-weight: 800;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

// El de AHORA: borde terracota, placa terracota
.compact-list__card--now {
  border-color: $pd-terra-ink;
  box-shadow:
    0 0 0 1.5px $pd-terra-ink,
    0 6px 14px rgba($pd-terra-ink, 0.14);

  .compact-list__plate {
    background: $pd-terra-ink; // blanco/crema encima 5.5:1
    color: #fff;
  }
}

// Completado: verde. El nombre pasa a tinta-2 SÓLIDA y se apaga solo la insignia (opacidad en el
// texto del nombre daba < 3:1)
.compact-list__card--done {
  .compact-list__plate {
    background: $positive;
    color: #fff;
  }

  .compact-list__name {
    color: $pd-ink-2;
  }

  .compact-list__badge {
    opacity: 0.55;
  }
}

.compact-list__notes {
  padding: 0 12px 10px;
  font-size: 12px;
  font-style: italic;
  color: #5a5550;
  line-height: 1.4;
  white-space: normal;
}

.compact-list__pautas {
  flex-shrink: 0;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  // Fase 197 D-16: texto sólido (antes rgba(0,0,0,.4), 2.74:1 medido)
  color: $pd-ink-2;
  background: none;
  border: 1px solid rgba($secondary, 0.2);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;

  &--active {
    color: $primary;
    border-color: $primary;
  }
}
</style>
