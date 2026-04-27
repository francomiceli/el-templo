<template>
  <q-btn
    v-if="showSelector"
    flat
    no-caps
    dense
    class="program-selector"
    :loading="isUpdating"
    :disable="isUpdating"
    @click="open = true"
  >
    <span class="program-selector__label">{{ activeLabel }}</span>
    <q-icon name="expand_more" size="18px" class="q-ml-xs" />
  </q-btn>

  <q-bottom-sheet v-model="open">
    <q-list>
      <q-item-label header>Elegi tu vista</q-item-label>

      <q-item
        v-for="enr in enrollments"
        :key="enr.id"
        clickable
        :active="currentEnrollmentId === enr.id"
        :disable="isUpdating"
        @click="onSelect(enr.id)"
      >
        <q-item-section>
          <q-item-label>{{ enr.programName }}</q-item-label>
          <q-item-label caption>
            Semana {{ enr.currentWeek
            }}<span v-if="enr.durationWeeks"> de {{ enr.durationWeeks }}</span>
          </q-item-label>
        </q-item-section>
        <q-item-section v-if="currentEnrollmentId === enr.id" side>
          <q-icon name="check" color="positive" />
        </q-item-section>
      </q-item>

      <q-item
        v-if="hasPresencial"
        clickable
        :active="currentEnrollmentId === null"
        :disable="isUpdating"
        @click="onSelect(null)"
      >
        <q-item-section>
          <q-item-label>Templo</q-item-label>
          <q-item-label caption>Sesiones del Templo</q-item-label>
        </q-item-section>
        <q-item-section v-if="currentEnrollmentId === null" side>
          <q-icon name="check" color="positive" />
        </q-item-section>
      </q-item>
    </q-list>
  </q-bottom-sheet>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCurrentProgram } from '../composables/useCurrentProgram'

const emit = defineEmits<{ (e: 'changed'): void }>()

const open = ref(false)

const {
  currentEnrollmentId,
  currentProgram,
  enrollments,
  hasPresencial,
  showSelector,
  isUpdating,
  select,
} = useCurrentProgram()

const activeLabel = computed(() => {
  if (currentEnrollmentId.value === null) return 'Templo'
  return currentProgram.value?.name ?? 'Mi programa'
})

async function onSelect(enrollmentId: number | null): Promise<void> {
  // Concurrent-tap guard. Even though the store also drops re-entrant
  // setCurrentProgramId calls, this short-circuit avoids closing the sheet
  // mid-tap and keeps the visual loading state stable.
  if (isUpdating.value) return

  // No-op if the user re-selects the active option.
  if (enrollmentId === currentEnrollmentId.value) {
    open.value = false
    return
  }

  try {
    await select(enrollmentId)
    emit('changed')
  } catch {
    // Composable already logged the error; UI stays on the current view.
  } finally {
    open.value = false
  }
}
</script>

<style scoped lang="scss">
.program-selector {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.program-selector__label {
  font-weight: 600;
}
</style>
