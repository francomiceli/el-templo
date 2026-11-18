import { giftReasonLabel } from 'src/constants/gift-reasons'
import type { GivenGift, PendingGift } from 'src/types/aura-gifts'

/**
 * Textos y decisiones de vista del regalo de Aura (fase 215, plan 16, UI-SPEC Pantallas 1 y 2).
 * Son puros: reciben el "hoy" de la sede (`todayLocal`, YYYY-MM-DD) como parámetro y nunca leen
 * el reloj ni la zona del teléfono. La app no decide ninguna regla del regalo: acá solo se
 * arman textos de lo que manda el servidor. Ningún texto promete privacidad (D-22).
 */

/** "18:00" a partir de "18:00" o "18:00:00"; sin cero a la izquierda ("8:30"), como Reservas. */
function displayTime(time: string): string {
  const parts = time.split(':')
  return `${parseInt(parts[0] ?? '0', 10)}:${parts[1] ?? '00'}`
}

/** La clase es de hoy; cualquier otra fecha de `pending` se trata como "ayer" (D-12). */
function isToday(sessionDate: string, todayLocal: string): boolean {
  return sessionDate === todayLocal
}

// ---------------------------------------------------------------------------
// Card de hoy (Pantalla 1)
// ---------------------------------------------------------------------------

export type GiftCardState =
  | { kind: 'offer'; first: PendingGift; count: number }
  | { kind: 'given'; gift: GivenGift }

/**
 * Qué muestra la fila de regalo de la card: lo pendiente manda sobre lo ya dado; sin nada,
 * `null` (no hay fila). Lo decide el servidor: la app no filtra ni reordena.
 */
export function giftCardState(
  pending: PendingGift[],
  givenToday: GivenGift[],
): GiftCardState | null {
  const first = pending[0]
  if (first) return { kind: 'offer', first, count: pending.length }
  const gift = givenToday[0]
  if (gift) return { kind: 'given', gift }
  return null
}

/** Ayuda bajo el botón dorado: uno de hoy, uno de ayer o varios. Vacío si no hay pendientes. */
export function giftCardHelp(pending: PendingGift[], todayLocal: string): string {
  const first = pending[0]
  if (!first) return ''
  const today = isToday(first.sessionDate, todayLocal)
  if (pending.length > 1) {
    return `Tenés ${pending.length} regalos de Aura para dar. El primero vence ${
      today ? 'mañana' : 'hoy'
    } a la noche.`
  }
  return today
    ? 'Tenés un regalo de Aura por la clase de hoy. Podés darlo hasta mañana a la noche.'
    : 'Tenés un regalo de Aura por la clase de ayer. Podés darlo hasta hoy a la noche.'
}

/** `aria-label` del botón dorado de la card. */
export function giftCardAriaLabel(first: PendingGift, todayLocal: string): string {
  const day = isToday(first.sessionDate, todayLocal) ? 'hoy' : 'ayer'
  return `Dale Aura a un compañero de tu clase de ${day} de las ${displayTime(first.startTime)}`
}

/** Fila "Le diste Aura a Sofía · Buena energía" (nombre de pila). */
export function givenTodayText(g: {
  receiver: { firstName: string }
  reason: GivenGift['reason']
}): string {
  return `Le diste Aura a ${g.receiver.firstName} · ${giftReasonLabel(g.reason)}`
}

// ---------------------------------------------------------------------------
// Hoja "Dar Aura" (Pantalla 2)
// ---------------------------------------------------------------------------

/** "Hoy 18:00 · elegí a una sola persona" / "Ayer 18:00 · …". */
export function sheetSubtitle(
  cls: Pick<PendingGift, 'sessionDate' | 'startTime'>,
  todayLocal: string,
): string {
  const day = isToday(cls.sessionDate, todayLocal) ? 'Hoy' : 'Ayer'
  return `${day} ${displayTime(cls.startTime)} · elegí a una sola persona`
}

/** "Sofía M." / "Sofía" (sin inicial). Nunca el apellido completo. */
export function candidateName(c: { firstName: string; lastInitial: string | null }): string {
  const initial = c.lastInitial?.trim() ?? ''
  return initial ? `${c.firstName} ${initial}.` : c.firstName
}

export interface SheetFooterInput {
  /** Nombre de pila de la persona elegida, o null si no hay. */
  person: string | null
  /** Hay un motivo elegido. */
  reason: boolean
  sending: boolean
}

/** Texto del botón del pie: dice lo que falta. */
export function sheetFooterLabel(s: SheetFooterInput): string {
  if (s.sending) return 'Dando Aura…'
  if (s.person && s.reason) return `Darle Aura a ${s.person}`
  if (s.person) return 'Elegí un motivo'
  if (s.reason) return 'Elegí a quién'
  return 'Elegí a quién y por qué'
}

/** Ayuda de la hoja, con o sin persona elegida (nombre de pila). */
export function sheetHelp(person: string | null): string {
  const who = person ? `A ${person}` : 'A esa persona'
  return `${who} le llega un aviso con tu nombre y el motivo. A vos no te descuenta nada.`
}

/**
 * Nota única bajo la grilla con las personas apagadas por el tope semanal (D-05).
 * `names` son los nombres ya armados con `candidateName`. Sin nadie apagado: `null`.
 */
export function weeklyCapNote(names: string[]): string | null {
  if (names.length === 0) return null
  if (names.length === 1) {
    return `${names[0]} ya recibió 2 regalos tuyos esta semana. Vas a poder darle de nuevo el lunes.`
  }
  const who = names.length === 2 ? `${names[0]} y ${names[1]}` : `${names.length} compañeros`
  return `${who} ya recibieron 2 regalos tuyos esta semana. Vas a poder darles de nuevo el lunes.`
}

/** `aria-label` de la celda apagada por el tope semanal. */
export function blockedAriaLabel(name: string): string {
  return `${name} Ya le diste 2 esta semana`
}

/** Aviso corto de confirmación tras el 201. */
export function giveSuccessMessage(firstName: string): string {
  return `Le diste Aura a ${firstName}`
}

// ---------------------------------------------------------------------------
// Errores al dar
// ---------------------------------------------------------------------------

/** Lo que la pantalla lee de un error HTTP (status y `code` del cuerpo, si los hay). */
export interface GiveErrorInput {
  status?: number | null
  code?: string | null
}

/** Qué hace la hoja ante un error: el aviso y los efectos sobre la hoja y el store. */
export interface GiveErrorOutcome {
  message: string
  type: 'warning' | 'info' | 'negative'
  /** Cierra la hoja. */
  close: boolean
  /** Vuelve a pedir los candidatos (la hoja sigue abierta). */
  reloadCandidates: boolean
  /** Borra la elección de persona. */
  clearSelection: boolean
  /** Vuelve a pedir `pending` al store. */
  reloadPending: boolean
}

function outcome(
  message: string,
  type: GiveErrorOutcome['type'],
  effects: Partial<Omit<GiveErrorOutcome, 'message' | 'type'>> = {},
): GiveErrorOutcome {
  return {
    message,
    type,
    close: false,
    reloadCandidates: false,
    clearSelection: false,
    reloadPending: false,
    ...effects,
  }
}

/**
 * Mapea el error de `POST /members/aura/gifts` a su texto y efectos (UI-SPEC, tabla Respuestas).
 * `name` es el nombre de pila de la persona elegida (null si se perdió).
 */
export function giveErrorOutcome(err: GiveErrorInput, name: string | null): GiveErrorOutcome {
  if (err.status === 429) {
    return outcome('Esperá un momento y probá de nuevo.', 'warning')
  }
  switch (err.code) {
    case 'REGALO_TOPE_SEMANAL':
      return outcome(
        `Ya le diste 2 a ${name ?? 'esa persona'} esta semana. Elegí a otra persona.`,
        'warning',
        { reloadCandidates: true },
      )
    case 'REGALO_YA_DADO':
      return outcome('Ya diste el regalo de esta clase.', 'info', {
        close: true,
        reloadPending: true,
      })
    case 'REGALO_VENCIDO':
      return outcome('Se terminó el plazo para dar este regalo.', 'info', {
        close: true,
        reloadPending: true,
      })
    case 'REGALO_NO_DISPONIBLE':
    case 'REGALO_NO_ENCONTRADO':
      return notInList(name)
    default:
      break
  }
  if (err.status === 404) return notInList(name)
  return outcome('No pudimos dar el Aura. Probá de nuevo.', 'negative')
}

function notInList(name: string | null): GiveErrorOutcome {
  return outcome(
    `${name ?? 'Esa persona'} ya no está en la lista. Elegí a otra persona.`,
    'warning',
    {
      reloadCandidates: true,
      clearSelection: true,
    },
  )
}
