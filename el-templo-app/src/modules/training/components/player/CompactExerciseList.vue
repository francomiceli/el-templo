<template>
  <div class="compact-list">
    <div
      v-for="(item, index) in exercises"
      :key="item.id"
      class="compact-list__row"
      :class="{
        'compact-list__row--active': index === activeIndex,
        'compact-list__row--completed': completedIds.has(item.id),
      }"
      @click="emit('navigate', index)"
    >
      <!-- Top row: name/dose + pill/check -->
      <div class="compact-list__top">
        <div class="compact-list__content">
          <div v-if="item.isMobility" class="compact-list__mobility-label">DESCANSO ACTIVO</div>
          <div class="compact-list__name">
            <q-badge
              v-if="item.contraction"
              :label="item.contraction"
              :color="getContractionColor(item.contraction)"
              class="compact-list__badge"
            />
            {{ item.name }}
          </div>
          <div v-if="item.quickDose" class="compact-list__dose">{{ item.quickDose }}</div>
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
        <!-- Completed check -->
        <q-icon
          v-else-if="completedIds.has(item.id)"
          name="check_circle"
          color="positive"
          size="20px"
          class="compact-list__check"
        />
      </div>
      <!-- Expanded notes row -->
      <div v-if="expandedNoteIndex === index && item.notes?.trim()" class="compact-list__notes">
        {{ item.notes }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface ExerciseItem {
  id: number
  name: string
  quickDose: string
  contraction?: string
  notes?: string
  isMobility?: boolean
}

function getContractionColor(contraction: string): string {
  const colorMap: Record<string, string> = {
    CON: 'primary',
    EXC: 'secondary',
    ISO: 'primary',
  }
  return colorMap[contraction] || 'primary'
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

.compact-list {
  background: $cream;
}

.compact-list__row {
  display: flex;
  flex-direction: column;
  padding: 8px 16px;
  cursor: pointer;
  border-bottom: 1px solid rgba($secondary, 0.12);
  transition: background-color 0.2s ease;
  -webkit-tap-highlight-color: transparent;

  &:last-child {
    border-bottom: none;
  }
}

.compact-list__row--active {
  background: rgba($secondary, 0.1);
}

.compact-list__top {
  display: flex;
  align-items: center;
  min-height: 28px;
}

.compact-list__content {
  flex: 1;
  min-width: 0;
}

.compact-list__mobility-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: rgba(0, 0, 0, 0.4);
  margin-bottom: 1px;
}

.compact-list__name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #3d3732;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.compact-list__badge {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.5px;
  padding: 1px 5px;
  flex-shrink: 0;
}

.compact-list__dose {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
  margin-top: 1px;
}

.compact-list__notes {
  font-size: 12px;
  font-style: italic;
  color: #5a5550;
  margin-top: 4px;
  line-height: 1.4;
  white-space: normal;
}

.compact-list__pautas {
  flex-shrink: 0;
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.4);
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

.compact-list__check {
  flex-shrink: 0;
  margin-left: 12px;
}
</style>
