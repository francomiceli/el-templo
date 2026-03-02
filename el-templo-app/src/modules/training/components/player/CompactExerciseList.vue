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
      <div class="compact-list__content">
        <div v-if="item.isMobility" class="compact-list__mobility-label">DESCANSO ACTIVO</div>
        <div class="compact-list__name">{{ item.name }}</div>
        <div class="compact-list__dose">{{ item.quickDose }}</div>
      </div>
      <q-icon
        v-if="completedIds.has(item.id)"
        name="check_circle"
        color="positive"
        size="20px"
        class="compact-list__check"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface ExerciseItem {
  id: number
  name: string
  quickDose: string
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

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.compact-list {
  background: $cream;
}

.compact-list__row {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  min-height: 44px;
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
  font-size: 14px;
  font-weight: 500;
  color: #3d3732;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.compact-list__dose {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
  margin-top: 1px;
}

.compact-list__check {
  flex-shrink: 0;
  margin-left: 12px;
}
</style>
