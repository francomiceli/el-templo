// SPEC "Empezá acá" C — textos de los tips de primeras semanas. Archivo de
// datos ÚNICO: reemplazar el contenido final acá (marcado con
// `// TODO-CONTENIDO`) no toca ningún componente.
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
    // TODO-CONTENIDO
    message: 'Escaneá el QR de tu sede para dar presente',
  },
  'entrenar-bloques': {
    id: 'entrenar-bloques',
    // TODO-CONTENIDO
    message: 'Cada clase tiene bloques: tocá el ⓘ en cada uno para saber para qué sirve',
  },
  'reservas-anticipacion': {
    id: 'reservas-anticipacion',
    // TODO-CONTENIDO
    message: 'Reservá con anticipación: los cupos se llenan rápido y te avisamos antes de tu clase',
  },
}
