import { ref, computed } from 'vue'

/** Cada cuánto se recalcula lo que falta (más fino que 1 s: el número cambia a tiempo aunque el timer se atrase). */
const TICK_MS = 250

/**
 * Fase 197: cuenta regresiva del descanso activo (aro de la pantalla entre bloques).
 *
 * Se calcula contra un deadline (`Date.now()`), no sumando ticks: si la app queda en segundo plano
 * o el timer se atrasa, al volver muestra el tiempo real que falta. Muestra segundos enteros hacia
 * arriba (`ceil`): con 60 s arranca en 60 y llega a 0 recién cuando pasó el minuto completo.
 *
 * `start()` lo llama el componente al montarse; no hay hook de desmontaje acá adentro (el composable se
 * puede crear fuera de `setup`): el componente llama `cleanup()` al desmontarse.
 *
 * @param totalSeconds - Duración del descanso. 0 o menos = ya terminado.
 */
export function useRestCountdown(totalSeconds: number) {
  const total = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  const remaining = ref(total)
  const isDone = computed(() => remaining.value <= 0)
  /** Lo que falta como fracción: 1 al arrancar, 0 al terminar */
  const fractionLeft = computed(() => (total > 0 ? remaining.value / total : 0))

  let deadline = 0
  let timer: ReturnType<typeof setInterval> | null = null

  function stop(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function tick(): void {
    remaining.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    if (remaining.value <= 0) stop()
  }

  /** Arranca (o rearranca) desde el total. No hace nada si el descanso dura 0. */
  function start(): void {
    stop()
    remaining.value = total
    if (total <= 0) return
    deadline = Date.now() + total * 1000
    timer = setInterval(tick, TICK_MS)
  }

  function cleanup(): void {
    stop()
  }

  return { total, remaining, isDone, fractionLeft, start, cleanup }
}
