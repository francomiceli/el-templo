export type ContentBlockType = 'video' | 'text' | 'pdf' | 'exercise'

export interface ContentBlockDetail {
  id: number
  weekNumber: number
  sortOrder: number
  blockType: ContentBlockType
  title: string
  content: string | null
  videoUrl: string | null
  exerciseId: number | null
  exerciseName: string | null
  exerciseVideoUrl: string | null
}

export interface MemberProgramCatalogItem {
  id: number
  name: string
  description: string | null
  durationWeeks: number
  hasContent: boolean
  // Phase 98 — additive/optional per D-18; present only when server enriches.
  // Server mapping currently omits both fields, so the `v-if="price != null"`
  // guard in PlanesPage hides the badge until they're wired up. Kept optional
  // so legacy deployed clients still type-check (D-19).
  price?: number
  currency?: 'ARS' | 'EUR'
}

export interface MemberEnrollmentProgress {
  enrollmentId: number
  programId: number
  programName: string
  goalPlanType: string | null
  currentWeek: number
  durationWeeks: number
  sessionsCompletedThisWeek: number
  sessionsPerWeekToAdvance: number
  isWeekComplete: boolean
  daysUntilExpiry: number | null
  isLinkedToSubscription: boolean
  contentBlocks: ContentBlockDetail[]
}
