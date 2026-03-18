/**
 * Personalizada types for the member app.
 *
 * Mirrors API types from el-templo-api/src/modules/personalizadas/types.ts
 * for frontend consumption.
 */

import type { Block } from '../training/types/session'

export type PersonalizadaType =
  | 'tren_superior'
  | 'tren_inferior'
  | 'empuje'
  | 'traccion'
  | 'planche'
  | 'front_lever'

export type PersonalizadaTier = 'principiante' | 'intermedio' | 'avanzado'

export type PersonalizadaDuration = 20 | 40 | 60

export interface PersonalizadaProgress {
  personalizadaType: PersonalizadaType
  semana20: number
  semana40: number
  semana60: number
  isActive: boolean
  startedAt: string
}

export interface ArchivedPersonalizada {
  personalizadaType: PersonalizadaType
  semana20: number
  semana40: number
  semana60: number
  startedAt: string
  archivedAt: string
}

export interface PersonalizadaMetadata {
  type: PersonalizadaType
  name: string
  tier: PersonalizadaTier
  description: string
  zones: string[]
  idealFor: string
}

/**
 * Personalizada session response from API.
 * Structured like existing Session type but with personalizada context.
 */
export interface PersonalizadaSessionResponse {
  dayId: string
  week: number
  day: string
  levelGroup: string
  personalizadaType: PersonalizadaType
  blockCount: number
  blocks: Block[]
}
