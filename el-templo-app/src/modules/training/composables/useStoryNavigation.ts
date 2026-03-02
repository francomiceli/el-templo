import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { createLogger } from 'src/utils/logger'

const log = createLogger('StoryNavigation')

/**
 * Instagram Stories-style navigation composable.
 *
 * Manages tap-based exercise progression within a block.
 * Tracks current slide index, provides next/prev/goTo navigation,
 * and clamps at boundaries (no wrap-around).
 *
 * @param totalSlides - Reactive ref of total slide count (exercises + mobility if present)
 * @returns Navigation state and methods
 */
export function useStoryNavigation(totalSlides: Ref<number>) {
  /** Current story slide index (0-based) */
  const currentIndex = ref(0)

  /** Whether on the first slide */
  const isFirst: ComputedRef<boolean> = computed(() => currentIndex.value === 0)

  /** Whether on the last slide */
  const isLast: ComputedRef<boolean> = computed(() => currentIndex.value >= totalSlides.value - 1)

  /** Go to the next slide (clamped at max) */
  function next(): void {
    if (currentIndex.value < totalSlides.value - 1) {
      currentIndex.value++
      log.debug('Story next', { index: currentIndex.value })
    }
  }

  /** Go to the previous slide (clamped at 0) */
  function prev(): void {
    if (currentIndex.value > 0) {
      currentIndex.value--
      log.debug('Story prev', { index: currentIndex.value })
    }
  }

  /** Jump to a specific slide index (clamped to valid range) */
  function goTo(index: number): void {
    const clamped = Math.max(0, Math.min(index, totalSlides.value - 1))
    currentIndex.value = clamped
    log.debug('Story goTo', { index: clamped })
  }

  /** Reset to the first slide */
  function reset(): void {
    currentIndex.value = 0
    log.debug('Story reset')
  }

  // Watch totalSlides and clamp currentIndex if it exceeds the new count
  const stopWatch = watch(totalSlides, (newTotal) => {
    if (newTotal > 0 && currentIndex.value >= newTotal) {
      currentIndex.value = newTotal - 1
      log.debug('Story clamped after totalSlides change', {
        index: currentIndex.value,
        total: newTotal,
      })
    }
  })

  /** Cleanup watcher — call on component unmount */
  function cleanup(): void {
    stopWatch()
  }

  return {
    currentIndex,
    isFirst,
    isLast,
    next,
    prev,
    goTo,
    reset,
    cleanup,
  }
}
