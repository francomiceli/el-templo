/**
 * Journey types for the member app.
 *
 * Mirrors API types from el-templo-api/src/modules/journeys/types.ts
 * for frontend consumption.
 */

import type { Block } from '../training/types/session'

export type JourneyType =
  | 'tren_superior'
  | 'tren_inferior'
  | 'empuje'
  | 'traccion'
  | 'planche'
  | 'front_lever'

export type JourneyTier = 'principiante' | 'intermedio' | 'avanzado'

export type JourneyDuration = 20 | 40 | 60

export interface JourneyProgress {
  journeyType: JourneyType
  semana20: number
  semana40: number
  semana60: number
  isActive: boolean
  startedAt: string
}

export interface ArchivedJourney {
  journeyType: JourneyType
  semana20: number
  semana40: number
  semana60: number
  startedAt: string
  archivedAt: string
}

export interface JourneyMetadata {
  type: JourneyType
  name: string
  tier: JourneyTier
  description: string
  zones: string[]
  idealFor: string
}

/**
 * Journey session response from API.
 * Structured like existing Session type but with journey context.
 */
export interface JourneySessionResponse {
  dayId: string
  week: number
  day: string
  levelGroup: string
  journeyType: JourneyType
  blockCount: number
  blocks: Block[]
}
