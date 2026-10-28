import type { CalibrationProposal, Estado, Level, SessionTecho, StepKey, Unit } from '../types'

/**
 * Textos del modo (anexo de Nacho `conquer-catalogo.md` §9), copiados byte a byte. "Las claves no
 * cambian": si Nacho ajusta un texto se cambia acá y en nada más. Las claves que ya vivían en otro
 * lado igual al anexo (`control_fisico`, `permiso_publicacion`, `permiso_sin_cara`) no se mueven.
 * `portada`, `sello` y `bajada` están en la imagen de portada; `sabado_calor` lo manda el API.
 * `estado_subir` queda en "Subir de progresión" (sin la flecha: el chip ya lo marca).
 */
export const CQ_TEXTOS = {
  boton_bloqueado: 'Quiero desbloquearlo',
  confirmacion_pedido: 'Listo. Te contactamos para activarlo.',
  leyenda_milon:
    'Milón de Crotona cargó un ternero todos los días. El ternero creció, y Milón con él, hasta cargar un toro.',
  nivel_ternero: 'Aprendés el método. Cortás una rep antes del fallo en cada escalón.',
  nivel_novillo: 'Llegás al fallo en el último escalón de cada serie.',
  nivel_toro: 'Los tres escalones al fallo. El método completo, con combos.',
  fallo_rectos: 'Fallo técnico: cuando se rompe la línea del cuerpo.',
  fallo_flexionados: 'Fallo muscular: cuando no podés más.',
  ayuda_carga: 'Anotá la peor de tus 3 series.',
  ayuda_hold: 'Hold final: al fallo. Anotá los segundos.',
  ayuda_unilateral: 'Por lado: anotá el lado más flojo.',
  finisher: '3 series, lejos del fallo (te tienen que quedar 4 o 5 reps).',
  combo:
    'Press (sube y baja) → Push → Hold, al fallo. Anotá con qué progresión arrancaste y cuántas series completaste.',
  sabado_combo:
    '3 series a máxima progresión al fallo y 10 drops: si no sale, bajás la progresión y seguís.',
  calibracion_subir: 'Te quedó fácil: probá la progresión siguiente.',
  calibracion_quedar: 'Estás bien ubicado.',
  calibracion_bajar: 'Te quedó pesado: bajá una progresión.',
  estado_techo1: 'Techo 1 de 2',
  estado_bajo: 'Bajo el piso',
  estado_rango: 'En rango',
  estado_sin: 'Sin datos',
  fin_sesion_techo:
    'Llegaste al techo en {ejercicio}, escalón {n}. Si lo repetís la próxima, subís de progresión.',
} as const

/** Letra griega de cada escalón de la sesión (§10): Α, Β, Γ y el hold final Ω. */
export const GREEK_STEP: Record<StepKey, string> = {
  e1: 'Α',
  e2: 'Β',
  e3: 'Γ',
  hold: 'Ω',
}

export interface LevelInfo {
  name: string
  kicker: string
  text: string
}

/** Textos de los tres niveles (prototipo `NIV`, §2). */
export const LEVEL_INFO: Record<Level, LevelInfo> = {
  ternero: {
    name: 'Legionario',
    kicker: 'Inicial',
    text: CQ_TEXTOS.nivel_ternero,
  },
  novillo: {
    name: 'Centurión',
    kicker: 'Intermedio',
    text: CQ_TEXTOS.nivel_novillo,
  },
  toro: {
    name: 'Espartano',
    kicker: 'Avanzado',
    text: CQ_TEXTOS.nivel_toro,
  },
}

/**
 * Valor de un escalón con su unidad: "4 reps", "1 rep", "6 s". Los ejercicios unilaterales se
 * cargan por lado: "4 por lado" (reps) o "6 s por lado" (segundos).
 */
export function unitText(value: number, unit: Unit, unilateral: boolean): string {
  if (unit === 's') return unilateral ? `${value} s por lado` : `${value} s`
  if (unilateral) return `${value} por lado`
  return value === 1 ? '1 rep' : `${value} reps`
}

export type EstadoTone = 'subir' | 'techo' | 'bajo' | 'rango' | 'neutro'

export interface EstadoChip {
  label: string
  tone: EstadoTone
}

const ESTADO_CHIPS: Record<Estado, EstadoChip> = {
  subir: { label: 'Subir de progresión', tone: 'subir' },
  techo1: { label: CQ_TEXTOS.estado_techo1, tone: 'techo' },
  bajo: { label: CQ_TEXTOS.estado_bajo, tone: 'bajo' },
  rango: { label: CQ_TEXTOS.estado_rango, tone: 'rango' },
  sin_datos: { label: CQ_TEXTOS.estado_sin, tone: 'neutro' },
}

/** Chip del estado que calcula el motor. Un escalón sin estado (el hold) va neutro. */
export function estadoChip(estado: Estado | null): EstadoChip {
  return ESTADO_CHIPS[estado ?? 'sin_datos']
}

/**
 * Cuánto esfuerzo pide cada escalón según el nivel (§2). Ternero corta antes del fallo en todo;
 * Novillo llega al fallo recién en el último escalón; Toro, en los tres. El hold final es al fallo
 * salvo en Ternero.
 */
export function effortHint(level: Level, step: StepKey): string {
  if (step === 'hold') return level === 'ternero' ? 'Cortá antes del fallo' : 'Al fallo'
  if (level === 'ternero') return 'Dejá 1 rep'
  if (level === 'novillo') return step === 'e3' ? 'Al fallo' : 'Dejá 1 rep'
  return 'Al fallo'
}

/** Qué es "fallo" en el ejercicio: con brazos rectos es técnico, con flexionados es muscular (§1.4). */
export function failureHint(brazosRectos: boolean): string {
  return brazosRectos ? CQ_TEXTOS.fallo_rectos : CQ_TEXTOS.fallo_flexionados
}

/**
 * Ayuda del hold final (anexo §9 `ayuda_hold`). Fase 201 DA-14: Ternero corta antes del fallo (la
 * tabla de niveles de la síntesis §2 manda sobre el texto genérico); Novillo y Toro, el del anexo.
 */
export function holdHelp(level: Level): string {
  if (level === 'ternero') return 'Hold final: cortá antes del fallo. Anotá los segundos.'
  return CQ_TEXTOS.ayuda_hold
}

/** Línea del finisher de Hoy: el finisher del día y la ayuda del anexo (`finisher`). */
export function finisherLine(finisher: string): string {
  return `${finisher} · ${CQ_TEXTOS.finisher}`
}

/** Aviso de techo al guardar (anexo §9 `fin_sesion_techo`): `{ejercicio}` y `{n}` (1, 2 o 3). */
export function techoText(item: SessionTecho): string {
  const n = item.step === 'e1' ? 1 : item.step === 'e2' ? 2 : 3
  return CQ_TEXTOS.fin_sesion_techo
    .replace('{ejercicio}', item.exerciseName)
    .replace('{n}', String(n))
}

/** "2026-10-21" -> "21/10" (sin pasar por Date: no hay zona horaria que mezclar). */
export function shortDate(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${Number(day)}/${Number(month)}`
}

/** Solo se puede aceptar o rechazar si el API propone mover el ejercicio y hay a dónde (S12-4). */
export function canResolveCalibration(item: CalibrationProposal): boolean {
  return item.proposal !== 'quedarse' && item.toRungName !== null
}

/**
 * Texto de una propuesta de calibración de la semana 1 (S12-4), en la hoja de Hoy y en Progreso:
 * el ejercicio y el texto del anexo (`calibracion_*`), con el peldaño destino cuando sube o baja.
 * Sin destino (ya está en el extremo de la escalera) lo dice, sin prometer un cambio.
 */
export function calibrationText(item: CalibrationProposal): string {
  const lead = `${item.exerciseName} · `
  if (item.proposal === 'quedarse') return `${lead}${CQ_TEXTOS.calibracion_quedar}`
  if (item.toRungName === null) {
    return item.proposal === 'subir'
      ? `${lead}Te quedó fácil, pero ya estás en la progresión más difícil.`
      : `${lead}Te quedó pesado, pero ya estás en la progresión más fácil.`
  }
  const text = item.proposal === 'subir' ? CQ_TEXTOS.calibracion_subir : CQ_TEXTOS.calibracion_bajar
  return `${lead}${text} (${item.toRungName})`
}
