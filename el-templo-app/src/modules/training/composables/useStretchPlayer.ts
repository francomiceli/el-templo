import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { StretchExercise } from '../types/stretch'

export interface UseStretchPlayerReturn {
  exercises: Ref<StretchExercise[]>
  /** Ejercicio que se está mostrando (null sin lista) */
  current: ComputedRef<StretchExercise | null>
  index: Ref<number>
  isFirst: ComputedRef<boolean>
  isLast: ComputedRef<boolean>
  /** Segundos desde `start()`. Solo sube: no hay cuenta regresiva */
  elapsedSeconds: Ref<number>
  isRunning: Ref<boolean>
  /** Carga la lista y vuelve al primer ejercicio */
  setExercises: (list: StretchExercise[]) => void
  next: () => void
  prev: () => void
  /** Salta a un ejercicio; índices fuera de rango o no enteros se ignoran */
  goTo: (i: number) => void
  /** Arranca el minutero. Un segundo `start()` no lo reinicia ni duplica el intervalo */
  start: () => void
  /** Congela el minutero */
  stop: () => void
  /** Corta el intervalo y resetea todo (la página lo llama al desmontarse) */
  cleanup: () => void
}

const TICK_MS = 1000

/**
 * Estado del player del estiramiento post-clase (fase 213, plan 15).
 *
 * Sin cuenta regresiva, sin lados y sin avance automático: el alumno pasa de ejercicio a mano y
 * el minutero es solo visual (T-213-43: el servidor mide la duración real). `elapsedSeconds` se
 * calcula contra `Date.now()` en cada tick en vez de sumar ticks, así sobrevive a que el sistema
 * frene los timers con la app en segundo plano. No mide layout.
 */
export function useStretchPlayer(): UseStretchPlayerReturn {
  const exercises = ref<StretchExercise[]>([])
  const index = ref(0)
  const elapsedSeconds = ref(0)
  const isRunning = ref(false)

  let startedAt: number | null = null
  let interval: ReturnType<typeof setInterval> | null = null

  const current = computed<StretchExercise | null>(() => exercises.value[index.value] ?? null)
  const isFirst = computed(() => index.value <= 0)
  const isLast = computed(() => index.value >= exercises.value.length - 1)

  function setExercises(list: StretchExercise[]): void {
    exercises.value = list
    index.value = 0
  }

  function goTo(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= exercises.value.length) return
    index.value = i
  }

  function next(): void {
    goTo(index.value + 1)
  }

  function prev(): void {
    goTo(index.value - 1)
  }

  function tick(): void {
    if (startedAt === null) return
    elapsedSeconds.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  }

  function clearTimer(): void {
    if (interval !== null) {
      clearInterval(interval)
      interval = null
    }
  }

  function start(): void {
    if (interval !== null) return
    startedAt = Date.now() - elapsedSeconds.value * 1000
    isRunning.value = true
    interval = setInterval(tick, TICK_MS)
  }

  function stop(): void {
    if (interval !== null) tick()
    clearTimer()
    isRunning.value = false
  }

  function cleanup(): void {
    clearTimer()
    startedAt = null
    isRunning.value = false
    elapsedSeconds.value = 0
    exercises.value = []
    index.value = 0
  }

  return {
    exercises,
    current,
    index,
    isFirst,
    isLast,
    elapsedSeconds,
    isRunning,
    setExercises,
    next,
    prev,
    goTo,
    start,
    stop,
    cleanup,
  }
}
