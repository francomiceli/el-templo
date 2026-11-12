import { ref, shallowRef, computed } from 'vue'
import { useSessionPlayer } from './useSessionPlayer'
import type { useWakeLock } from './useWakeLock'
import type { Session } from '../types/session'

/**
 * Fase 213 D-07: abstracción compartida del player de UN bloque.
 *
 * Sale de `FreeBlockPlayer.vue` (fase 197 D-15) para que el player de estiramiento
 * (fase 213) y Libre compartan la misma mecánica sin duplicarla. Orquesta:
 * etapas, puente player -> vista, 3-2-1 + arranque, marcado de ejercicios, reinicio,
 * cierre con guardado (y rollback si el guardado falla) y salida sin guardar.
 *
 * VA ACÁ: `stage`, la Session de 1 bloque con su `useSessionPlayer`, el puente a la vista,
 * `beginBlock`/`onCountdownDone`/`toggleExercise`/`restart`/`completeBlock`/`keepTraining`/
 * `leaveWithoutSaving`, y el guard `needsExitConfirm`.
 *
 * QUEDA EN CADA PÁGINA: de dónde sale el bloque y su Session sintética, el endpoint de guardado
 * y su estado (`completionId`, resultado, ids guardados), los diálogos de confirmación,
 * `onBeforeRouteLeave`, `$q.notify`, los textos, a dónde se vuelve, y el ciclo de vida del
 * wake lock (`initialize`/`cleanup`) y del composable de guardado.
 *
 * Regla de ciclo de vida: este composable NO usa `onUnmounted` ni nada de router/Quasar.
 * La página llama `cleanup()` en su propio `onUnmounted`.
 */

export type SingleBlockStage =
  | 'loading'
  | 'missing'
  | 'countdown'
  | 'playing'
  | 'saving'
  | 'celebration'
  | 'summary'

type SessionPlayer = ReturnType<typeof useSessionPlayer>

export interface SingleBlockSaveInput {
  /** exerciseId de los ejercicios hechos en el bloque */
  exercisesCompleted: number[]
  /** ISO 8601: sale del reloj que ve el socio (ahora menos los segundos transcurridos) */
  startedAt: string
  /** Segundos que marca el reloj al cerrar */
  elapsedSeconds: number
}

export interface SingleBlockPlayerDeps<R> {
  wakeLock: Pick<ReturnType<typeof useWakeLock>, 'requestWakeLock' | 'releaseWakeLock'>
  /**
   * Guarda el cierre. Devuelve el resultado o null si falló (la página decide qué mostrar:
   * el composable solo vuelve a `playing` y relanza el reloj).
   */
  save: (input: SingleBlockSaveInput) => Promise<R | null>
  /** true si ya hay un guardado de esta visita (salir ya no pierde nada; "reiniciar" es otra vuelta) */
  hasSavedRun?: () => boolean
  /** Fábrica del player de la Session; por defecto el modo bloque libre de `useSessionPlayer` */
  createPlayer?: (s: Session) => SessionPlayer
}

export function useSingleBlockPlayer<R>(deps: SingleBlockPlayerDeps<R>) {
  const { wakeLock, save } = deps
  const hasSavedRun = deps.hasSavedRun ?? (() => false)
  const makePlayer = deps.createPlayer ?? ((s: Session) => useSessionPlayer(s, { freeBlock: true }))

  const stage = ref<SingleBlockStage>('loading')
  const session = shallowRef<Session | null>(null)
  const player = shallowRef<SessionPlayer | null>(null)
  /** true una vez confirmada la salida: el guard de la ruta no vuelve a preguntar */
  const exitConfirmed = ref(false)
  let disposed = false
  /** Guard del arranque automático: corre UNA sola vez por instancia ("Reiniciar" arranca a mano) */
  let autoStarted = false

  // Puente player -> vista
  const playableBlocks = computed(() => player.value?.playableBlocks.value ?? [])
  const activeBlockIndex = computed(() => player.value?.currentBlockIndex.value ?? 0)
  const completedBlocks = computed(() => player.value?.completedBlocks.value ?? [])
  const elapsedSeconds = computed(() => player.value?.elapsedSeconds.value ?? 0)
  const allCompletedExercises = computed<Record<string, number[]>>(
    () => player.value?.completedExercises.value ?? {},
  )

  /** Salir pierde el bloque solo si todavía no se guardó nada */
  const needsExitConfirm = computed(
    () =>
      !exitConfirmed.value &&
      !hasSavedRun() &&
      (stage.value === 'countdown' || stage.value === 'playing'),
  )

  function isDisposed(): boolean {
    return disposed
  }

  function setStage(next: SingleBlockStage): void {
    stage.value = next
  }

  function markMissing(): void {
    stage.value = 'missing'
  }

  function confirmExit(): void {
    exitConfirmed.value = true
  }

  function replacePlayer(s: Session): void {
    if (player.value) player.value.cleanup()
    player.value = makePlayer(s)
  }

  /** Arranca el bloque: reloj, pantalla encendida y 3-2-1 */
  function beginBlock(): void {
    if (!player.value) return
    player.value.startTimer()
    void wakeLock.requestWakeLock()
    stage.value = 'countdown'
  }

  /**
   * Carga la Session de 1 bloque: player nuevo, progreso local en cero (cada entrada empieza
   * de cero, si abandonó antes no hay nada que retomar) y arranque automático UNA sola vez.
   */
  async function load(s: Session): Promise<void> {
    session.value = s
    replacePlayer(s)
    await player.value?.clearProgress()
    await player.value?.initialize()
    if (disposed) return
    if (autoStarted) return
    autoStarted = true
    beginBlock()
  }

  function onCountdownDone(): void {
    stage.value = 'playing'
  }

  async function toggleExercise(prescriptionId: number): Promise<void> {
    if (player.value) {
      await player.value.toggleExerciseComplete(prescriptionId)
    }
  }

  /**
   * "Reiniciar" (la página ya pidió confirmación): ya guardado es otra vuelta; sin guardar
   * re-arranca al 3-2-1 con un player nuevo.
   */
  async function restart(): Promise<void> {
    const p = player.value
    const s = session.value
    if (!p || !s) return
    if (hasSavedRun()) {
      await p.startAnotherRound()
      return
    }
    await p.clearProgress()
    // clearProgress no reinicia el acumulado interno del reloj: un player nuevo arranca en cero.
    replacePlayer(s)
    await player.value?.initialize()
    // beginBlock vuelve a pedir el wake lock: se suelta antes para no dejar un sentinel huérfano
    await wakeLock.releaseWakeLock()
    beginBlock()
  }

  /**
   * Cierre del bloque: pausa el reloj, guarda y recién ahí celebra. Si el guardado falla
   * (null) vuelve a `playing` con el reloj corriendo; el aviso al socio lo muestra la página
   * (dentro de su `save`). Devuelve el resultado del guardado o null.
   */
  async function completeBlock(): Promise<R | null> {
    const p = player.value
    const role = session.value?.blocks[0]?.role
    if (!p || !role || stage.value === 'saving') return null

    await p.completeBlock() // pausa el reloj
    stage.value = 'saving'

    const exercisesCompleted = [...(p.completedExercises.value[role] ?? [])]
    const elapsed = p.elapsedSeconds.value
    // El inicio sale del reloj que ve el socio: la duración del servidor coincide con la barrita
    const startedAt = new Date(Date.now() - elapsed * 1000).toISOString()

    const result = await save({ exercisesCompleted, startedAt, elapsedSeconds: elapsed })
    if (disposed) return null

    if (result === null) {
      p.startTimer() // el reloj sigue mientras reintenta
      stage.value = 'playing'
      return null
    }

    await wakeLock.releaseWakeLock()
    stage.value = 'celebration'
    return result
  }

  /** "Seguir entrenando": otra vuelta con el reloj corriendo */
  async function keepTraining(): Promise<void> {
    if (!player.value) return
    await player.value.startAnotherRound()
    void wakeLock.requestWakeLock()
    stage.value = 'playing'
  }

  /** Salir sin guardar: frena el reloj, borra el progreso local y libera la pantalla */
  async function leaveWithoutSaving(): Promise<void> {
    if (player.value) {
      player.value.pauseTimer()
      await player.value.clearProgress()
    }
    await wakeLock.releaseWakeLock()
  }

  /** La página lo llama en su `onUnmounted` */
  function cleanup(): void {
    disposed = true
    if (player.value) player.value.cleanup()
  }

  return {
    stage,
    session,
    player,
    exitConfirmed,
    needsExitConfirm,
    playableBlocks,
    activeBlockIndex,
    completedBlocks,
    elapsedSeconds,
    allCompletedExercises,
    isDisposed,
    setStage,
    markMissing,
    confirmExit,
    load,
    beginBlock,
    onCountdownDone,
    toggleExercise,
    restart,
    completeBlock,
    keepTraining,
    leaveWithoutSaving,
    cleanup,
  }
}
