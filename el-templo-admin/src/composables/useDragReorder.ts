import { ref } from 'vue';

export interface DragReorderCallbacks {
  getExercises: () => { id: number }[];
  reorder: (prescriptionId: number, direction: 'up' | 'down') => Promise<void>;
  onComplete: () => void;
}

export function useDragReorder(callbacks: DragReorderCallbacks) {
  const dragFromIdx = ref<number | null>(null);
  const dragOverId = ref<number | null>(null);

  function onDragStart(event: DragEvent, idx: number) {
    dragFromIdx.value = idx;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  function onDragOver(_event: DragEvent, exerciseId: number) {
    dragOverId.value = exerciseId;
  }

  function onDragLeave(exerciseId: number) {
    if (dragOverId.value === exerciseId) {
      dragOverId.value = null;
    }
  }

  async function onDrop(_event: DragEvent, toIdx: number) {
    dragOverId.value = null;
    if (dragFromIdx.value === null || dragFromIdx.value === toIdx) return;

    const exercises = callbacks.getExercises();
    const fromIdx = dragFromIdx.value;
    dragFromIdx.value = null;

    const direction = fromIdx < toIdx ? 'down' : 'up';
    const steps = Math.abs(toIdx - fromIdx);
    const prescriptionId = exercises[fromIdx].id;

    for (let i = 0; i < steps; i++) {
      try {
        await callbacks.reorder(prescriptionId, direction);
      } catch {
        break;
      }
    }
    callbacks.onComplete();
  }

  function onDragEnd() {
    dragFromIdx.value = null;
    dragOverId.value = null;
  }

  return {
    dragOverId,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
  };
}
