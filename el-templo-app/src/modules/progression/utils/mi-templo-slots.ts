/**
 * Slots de carga de Mi Templo (fase 203, D-01/D-02/D-03/D-07).
 *
 * Función PURA: recibe banderas y conteos (nunca stores, nunca contenido) y devuelve, por cada
 * card de debajo de la card de hoy, si se dibuja un esqueleto, el contenido o nada, más los
 * flags "tuvo contenido" que la página tiene que registrar.
 *
 * - D-02: una card que puede terminar vacía (Novedades, Registro del día, Patrocinadores, Tus
 *   sesiones, Evaluación) reserva su lugar con esqueleto SOLO si la última vez tuvo contenido;
 *   si no, no aparece hasta tener datos.
 * - D-03: solo se manejan booleanos y conteos. Nada del contenido (textos, ids) pasa por acá.
 * - D-07: con el tope vencido sale lo que se sabe; sin dato el lugar queda oculto (no se
 *   inventa nada) y se completa cuando el dato llega.
 * - Pitfall 6: el flag NUNCA se registra tras un error ni tras un fail-open. `records` solo
 *   incluye una card cuando su fuente respondió bien (`ok === true`) en la ÚLTIMA respuesta
 *   (`*Ok` refleja la última respuesta: un refresco fallido deja `ok === false` aun con datos
 *   previos, y ese caso tampoco registra). Un error no significa "no hay contenido".
 */
import { resolveSlot, type SlotState } from 'src/utils/load-slot'
import type { CardKey } from 'src/composables/useCardHadContentStorage'
import type { TodayCardKind } from './today-card'

/** Las cinco cards con flag, en el orden de la pila. */
export const MI_TEMPLO_CARD_KEYS: readonly CardKey[] = [
  'novedades',
  'checkIn',
  'sponsors',
  'weekStrip',
  'evaluation',
]

export interface MiTemploSlotsInput {
  /** El tope de D-07 (`useLoadDeadline().passed`) ya venció. */
  deadlinePassed: boolean
  /** `todayCard.kind`: la semana y el registro del día dependen de si el socio tiene plan. */
  todayKind: TodayCardKind
  /** `loaded`: respondió al menos una vez. `ok`: la ÚLTIMA respuesta fue 2xx (null = nunca respondió). */
  novedades: { loaded: boolean; ok: boolean | null; count: number }
  sponsors: { loaded: boolean; ok: boolean | null; count: number }
  /** `settled`/`ok` de los check-ins de hoy; `questions` = preguntas ya ordenadas (0 sin estado). */
  checkIn: { settled: boolean; ok: boolean | null; questions: number }
  /**
   * La semana (`/sessions/weekly`): `loaded` respondió (bien o mal), `ok` la última respuesta fue
   * 2xx, `hasData` hubo alguna respuesta 2xx (los días hechos son un dato, no el [] inicial).
   */
  week: { loaded: boolean; ok: boolean; hasData: boolean }
  /** Stats: `loaded` respondió (bien o mal), `ok` la última respuesta fue 2xx. */
  stats: { loaded: boolean; ok: boolean | null; evaluationVisible: boolean }
  /** "Para vos": tarjetas del admin, estado del socio y perfil. */
  paraVos: { tarjetasSettled: boolean; memberStateLoaded: boolean; hasProfile: boolean }
  /** Flags guardados en el teléfono (`useCardHadContentStore.map`). */
  hadContent: Partial<Record<CardKey, boolean>>
}

export interface MiTemploSlots {
  novedades: SlotState
  checkIn: SlotState
  sponsors: SlotState
  weekStrip: SlotState
  evaluation: SlotState
  /** Nunca 'hidden': el riel siempre tiene al menos la card de invitaciones. */
  paraVos: SlotState
  /** Flags a escribir con `useCardHadContentStore.record`. Solo las cards cuya fuente respondió bien. */
  records: Partial<Record<CardKey, boolean>>
}

export function resolveMiTemploSlots(i: MiTemploSlotsInput): MiTemploSlots {
  const deadlinePassed = i.deadlinePassed
  const neverHadPlan = i.todayKind === 'sin-plan-nunca'
  // 'cargando' = la card de hoy todavía no sabe; 'neutral' = no se sabe lo suficiente (falla o tope).
  // En ninguno de los dos se puede afirmar que el socio "nunca tuvo plan" ni registrar el flag.
  const todayResolved = i.todayKind !== 'cargando'
  const todayDefinitive = todayResolved && i.todayKind !== 'neutral'

  const novedadesHas = i.novedades.count > 0
  const sponsorsHas = i.sponsors.count > 0
  const checkInHas = i.checkIn.questions > 0 && !neverHadPlan
  // Sin ninguna respuesta buena, "0 sesiones esta semana" sería inventar: se oculta (D-16).
  const weekHas = !neverHadPlan && i.week.hasData

  const novedades = resolveSlot({
    reserve: 'if-had-content',
    settled: i.novedades.loaded,
    hasContent: novedadesHas,
    hadContentLastTime: i.hadContent.novedades === true,
    deadlinePassed,
  })
  const sponsors = resolveSlot({
    reserve: 'if-had-content',
    settled: i.sponsors.loaded,
    hasContent: sponsorsHas,
    hadContentLastTime: i.hadContent.sponsors === true,
    deadlinePassed,
  })
  const checkIn = resolveSlot({
    reserve: 'if-had-content',
    settled: i.checkIn.settled && todayResolved,
    hasContent: checkInHas,
    hadContentLastTime: i.hadContent.checkIn === true,
    deadlinePassed,
  })
  const weekStrip = resolveSlot({
    reserve: 'if-had-content',
    settled: i.week.loaded && todayResolved,
    hasContent: weekHas,
    hadContentLastTime: i.hadContent.weekStrip === true,
    deadlinePassed,
  })
  const evaluation = resolveSlot({
    reserve: 'if-had-content',
    settled: i.stats.loaded,
    hasContent: i.stats.evaluationVisible,
    hadContentLastTime: i.hadContent.evaluation === true,
    deadlinePassed,
  })

  // "Para vos": excepción deliberada a D-07. El riel SIEMPRE tiene contenido (la card de
  // invitaciones tiene copy de respaldo), así que con el tope vencido se muestra lo que haya en
  // vez de ocultarlo. La tabla de `resolveSlot` no se toca: con `always` + tope + no settled
  // devolvería 'hidden', y este caso nunca llega hasta ahí.
  const paraVosSettled =
    i.paraVos.tarjetasSettled && i.paraVos.memberStateLoaded && i.paraVos.hasProfile
  const paraVosWaiting = resolveSlot({
    reserve: 'always',
    settled: paraVosSettled,
    hasContent: true,
  })
  const paraVos: SlotState = i.deadlinePassed ? 'content' : paraVosWaiting

  const records: Partial<Record<CardKey, boolean>> = {}
  if (i.novedades.loaded && i.novedades.ok === true) records.novedades = novedadesHas
  if (i.sponsors.loaded && i.sponsors.ok === true) records.sponsors = sponsorsHas
  if (i.checkIn.settled && i.checkIn.ok === true && todayDefinitive) records.checkIn = checkInHas
  if (i.stats.loaded && i.stats.ok === true) records.evaluation = i.stats.evaluationVisible
  if (i.week.loaded && i.week.ok && todayDefinitive) records.weekStrip = weekHas

  return { novedades, checkIn, sponsors, weekStrip, evaluation, paraVos, records }
}
