// SPEC "Empezá acá" C — textos de los tips de primeras semanas. Archivo de
// datos ÚNICO: reemplazar el contenido acá no toca ningún componente.
//
// CONTENIDO FINAL aprobado por Franco 2026-09-24 (CONTENIDO-empeza-aca.md,
// sección "Tips de primer uso") — usado LITERAL.
//
// Usado por: MainLayout.vue (tip del FAB de check-in, SPEC A2), TrainingIndex
// (primer tip de bloques) y ReservasPage (primer tip de anticipación).

export type TipId = 'qr-checkin' | 'entrenar-bloques' | 'reservas-anticipacion'

export interface TipContent {
  id: TipId
  message: string
}

export const TIPS_CONTENT: Record<TipId, TipContent> = {
  'qr-checkin': {
    id: 'qr-checkin',
    message: 'Al llegar a la sede, escaneá el QR de la entrada para dar presente.',
  },
  'entrenar-bloques': {
    id: 'entrenar-bloques',
    message: 'Cada clase tiene 4 bloques. Tocá ⓘ en cada uno para saber para qué sirve.',
  },
  'reservas-anticipacion': {
    id: 'reservas-anticipacion',
    message: 'Reservá con anticipación y te avisamos antes de que empiece tu clase.',
  },
}
