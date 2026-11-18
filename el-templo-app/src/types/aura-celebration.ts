/**
 * Fase 215 (#33): contratos de la celebración de Aura. Espejo de las respuestas de
 * `el-templo-api/src/modules/aura/celebration-schemas.ts`. La app no decide ninguna regla de qué se
 * celebra ni de anonimato: pinta lo que manda el servidor.
 */

/** Quién dio un regalo. Con `anonymous` el nombre es null y no se nombra a nadie. */
export interface CelebrationGift {
  kind: 'alumno' | 'profe'
  anonymous: boolean
  /** "Juan P." (alumno), nombre de pila (profe) o null (anónimo, o profe sin nombre). */
  name: string | null
  /** Motivo ya con su texto ("Buena energía"). */
  reason: string
}

export interface CelebrationMovement {
  id: number
  amount: number
  /** Fuente del ledger (`social`, `streak_bonus`, ...): sirve para elegir el ícono. */
  source: string
  /** El mismo texto del detalle de Aura. */
  label: string
  gift: CelebrationGift | null
}

/** GET /members/aura/celebration */
export interface CelebrationResponse {
  /** Los más nuevos primero, hasta 20. */
  movements: CelebrationMovement[]
  /** Cuántos movimientos hay para celebrar en total (puede pasar los 20 de la lista). */
  count: number
  /** Suma de sus montos. */
  sum: number
  /** Aura ganada actual: el número del encabezado. */
  total: number
  /** Último id del ledger propio: es el `upToId` del ack. */
  maxId: number
}
