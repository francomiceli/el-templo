import { ref, type Ref } from 'vue'
import { LOAD_DEADLINE_MS } from 'src/utils/load-deadline'

/**
 * Tope de carga de la UI (fase 203, D-07): `passed` pasa a true cuando vencen `ms`
 * desde `start()`.
 *
 * - `start()` arma UN solo timer (si ya estaba armado lo reinicia y vuelve `passed` a false;
 *   nunca quedan dos).
 * - `cleanup()` lo limpia; `passed` no cambia más.
 * - La página llama `start()` al montarse y `cleanup()` al desmontarse:
 *   el composable no engancha el ciclo de vida del componente.
 * - Es un timer de UI porque CapacitorHttp ignora el timeout de axios (ver `LOAD_DEADLINE_MS`).
 */
export function useLoadDeadline(ms: number = LOAD_DEADLINE_MS): {
  passed: Ref<boolean>
  start: () => void
  cleanup: () => void
} {
  const passed = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function cleanup(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function start(): void {
    cleanup()
    passed.value = false
    timer = setTimeout(() => {
      passed.value = true
      timer = null
    }, ms)
  }

  return { passed, start, cleanup }
}
