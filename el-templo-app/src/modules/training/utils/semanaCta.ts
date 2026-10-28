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
  /**
   * Hay progreso guardado de la sesión de ese día (para "Continuar").
   * null = todavía no se leyó el progreso local: el botón de hoy reserva su lugar sin texto
   * (fase 203 C-10).
   */
  hasProgress: boolean | null
  /** FREE_BLOCKS_ENABLED: apagado, ningún estado lleva a Libre ni la menciona */
  libreEnabled: boolean
}

export interface SemanaCta {
  /** false: no se dibuja el botón (días pasados; solo se entrena el día de hoy) */
  showButton: boolean
  label: string
  variant: 'primary' | 'secondary' | 'unavailable'
  action: 'start' | 'summary' | 'libre' | null
  /**
   * true = el botón reserva su lugar sin texto visible ni acción hasta saber si es "Empezar" o
   * "Continuar" (fase 203 C-10). El `label` viene solo para reservar el espacio: no se ve.
   */
  pending: boolean
  /** true si el botón arranca a entrenar (lleva al 3-2-1): el botón lleva el ícono de play */
  startsTraining: boolean
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
  // Solo se entrena el día de hoy: en un día pasado no hay botón (ni "Hacerla igual" ni Libre).
  // Si la completó, el chip "Hecha" se mantiene.
  if (i.date < i.today) {
    return {
      showButton: false,
      label: '',
      variant: 'unavailable',
      action: null,
      pending: false,
      startsTraining: false,
      showDoneChip: i.hasSession && i.completed,
      showLibreLink: false,
      hint: null,
    }
  }

  // Hoy es domingo: día de descanso, sin botón (la pantalla muestra el aviso sobre el contenido)
  if (i.isSunday && i.date === i.today) {
    return {
      showButton: false,
      label: '',
      variant: 'unavailable',
      action: null,
      pending: false,
      startsTraining: false,
      showDoneChip: false,
      showLibreLink: false,
      hint: null,
    }
  }

  // Sin plani y Libre apagado: no hay a dónde ir, el CTA queda deshabilitado y sin hint
  if (!i.hasSession && !i.libreEnabled) {
    return {
      showButton: true,
      label: i.isSunday ? 'Día de descanso' : 'Todavía sin plani',
      variant: 'unavailable',
      action: null,
      pending: false,
      startsTraining: false,
      showDoneChip: false,
      showLibreLink: false,
      hint: null,
    }
  }

  // Sin plani: el CTA lleva a Libre (el domingo y los días sin sesión cargada)
  if (!i.hasSession) {
    return {
      showButton: true,
      label: 'Elegir un bloque libre',
      variant: 'primary',
      action: 'libre',
      pending: false,
      startsTraining: false,
      showDoneChip: false,
      showLibreLink: false,
      hint: i.isSunday ? HINT_SUNDAY : HINT_NO_SESSION,
    }
  }

  // Completada: hoy se ve el resumen (y se ofrece sumar un bloque libre)
  if (i.completed) {
    return {
      showButton: true,
      label: 'Ver resumen',
      variant: 'secondary',
      action: 'summary',
      pending: false,
      startsTraining: false,
      showDoneChip: true,
      showLibreLink: i.libreEnabled && i.date === i.today,
      hint: null,
    }
  }

  // Futuro: "Disponible el {día}" (copy en weekLabels.availableLabel), deshabilitado y sin acción
  if (i.date > i.today) {
    return {
      showButton: true,
      label: availableLabel(i.date),
      variant: 'unavailable',
      action: null,
      pending: false,
      startsTraining: false,
      showDoneChip: false,
      showLibreLink: false,
      hint: null,
    }
  }

  // Hoy sin haber leído el progreso local: el botón reserva su lugar sin texto ni acción, así no
  // pinta "Empezar" para después cambiar a "Continuar" (C-10). El label queda en 'Empezar' solo para reservar el alto y el ancho.
  if (i.hasProgress === null) {
    return {
      showButton: true,
      label: 'Empezar',
      variant: 'primary',
      action: null,
      pending: true,
      startsTraining: false,
      showDoneChip: false,
      showLibreLink: false,
      hint: null,
    }
  }

  // Hoy
  return {
    showButton: true,
    label: i.hasProgress ? 'Continuar' : 'Empezar',
    variant: 'primary',
    action: 'start',
    pending: false,
    startsTraining: true,
    showDoneChip: false,
    showLibreLink: false,
    hint: null,
  }
}
