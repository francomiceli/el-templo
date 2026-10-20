/**
 * CTA de la tab Semana: los 6 estados de D-03 (sketch 015 ronda 3, `paneSem`). Pura: recibe
 * `today` como string de la sede, nunca lee el reloj del teléfono.
 */
import { availableLabel } from './weekLabels'

export interface SemanaCtaInput {
  /** Día elegido en la tira ("YYYY-MM-DD") */
  date: string
  /** Hoy en la zona de la sede ("YYYY-MM-DD") */
  today: string
  hasSession: boolean
  isSunday: boolean
  completed: boolean
  /** Hay progreso guardado de la sesión de ese día (para "Continuar") */
  hasProgress: boolean
}

export interface SemanaCta {
  label: string
  variant: 'primary' | 'secondary' | 'unavailable'
  action: 'start' | 'summary' | 'redo' | 'libre' | null
  /** Chip salvia "Hecha" debajo del título */
  showDoneChip: boolean
  /** Link "¿Te quedaste con ganas? Sumá un bloque libre" (solo si la completó hoy) */
  showLibreLink: boolean
  /** Texto de apoyo cuando no hay plani */
  hint: string | null
}

const HINT_SUNDAY = 'Domingo sin plani. Si querés moverte, elegí un bloque libre.'
const HINT_NO_SESSION =
  'Todavía no está la plani de este día. Si querés moverte, elegí un bloque libre.'

export function resolveSemanaCta(i: SemanaCtaInput): SemanaCta {
  // Sin plani: el CTA lleva a Libre (el domingo y los días sin sesión cargada)
  if (!i.hasSession) {
    return {
      label: 'Elegir un bloque libre',
      variant: 'primary',
      action: 'libre',
      showDoneChip: false,
      showLibreLink: false,
      hint: i.isSunday ? HINT_SUNDAY : HINT_NO_SESSION,
    }
  }

  // Completada: hoy se ve el resumen (y se ofrece sumar un bloque libre); otro día se puede repetir
  if (i.completed) {
    const isPast = i.date < i.today
    if (isPast) {
      return {
        label: 'Hacerla igual',
        variant: 'primary',
        action: 'redo',
        showDoneChip: true,
        showLibreLink: false,
        hint: null,
      }
    }
    return {
      label: 'Ver resumen',
      variant: 'secondary',
      action: 'summary',
      showDoneChip: true,
      showLibreLink: i.date === i.today,
      hint: null,
    }
  }

  // Futuro: "Disponible el {día}" (copy en weekLabels.availableLabel), deshabilitado y sin acción
  if (i.date > i.today) {
    return {
      label: availableLabel(i.date),
      variant: 'unavailable',
      action: null,
      showDoneChip: false,
      showLibreLink: false,
      hint: null,
    }
  }

  // Pasado sin completar
  if (i.date < i.today) {
    return {
      label: 'Hacerla igual',
      variant: 'primary',
      action: 'start',
      showDoneChip: false,
      showLibreLink: false,
      hint: null,
    }
  }

  // Hoy
  return {
    label: i.hasProgress ? 'Continuar' : 'Empezar',
    variant: 'primary',
    action: 'start',
    showDoneChip: false,
    showLibreLink: false,
    hint: null,
  }
}
