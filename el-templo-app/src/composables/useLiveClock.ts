import { ref } from 'vue'

/**
 * Reloj en vivo (por segundo) en la zona horaria de la sede (fase 199, D-22/L52).
 *
 * - `start()` pinta ya y arma UN solo `setInterval(1000)` (si ya estaba armado lo
 *   reinicia, nunca quedan dos relojes).
 * - `cleanup()` lo limpia. El componente que lo usa lo llama al cerrar y al desmontar
 *   (el composable no engancha el ciclo de vida del componente).
 * - La hora sale de `Intl.DateTimeFormat` con `timeZone`, nunca de la hora del teléfono.
 */
export function useLiveClock(tz: () => string) {
  const time = ref('')
  const dateLabel = ref('')
  let timer: ReturnType<typeof setInterval> | null = null

  function paint(): void {
    const timeZone = tz()
    const now = new Date()
    time.value = new Intl.DateTimeFormat('es-AR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now)
    // formatToParts evita la coma que algunas versiones de ICU agregan tras el día de la semana.
    const parts = new Intl.DateTimeFormat('es-AR', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).formatToParts(now)
    const pick = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
    const weekday = pick('weekday')
    const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1)
    dateLabel.value = `${capitalized} ${pick('day')} de ${pick('month')}`
  }

  function cleanup(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  function start(): void {
    cleanup()
    paint()
    timer = setInterval(paint, 1000)
  }

  return { time, dateLabel, start, cleanup }
}
