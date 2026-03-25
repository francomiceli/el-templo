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
  price: number
  durationWeeks: number
  hasContent: boolean
}

export interface MemberEnrollmentProgress {
  enrollmentId: number
  programId: number
  programName: string
  currentWeek: number
  durationWeeks: number
  sessionsCompletedThisWeek: number
  sessionsPerWeekToAdvance: number
  isWeekComplete: boolean
  daysUntilExpiry: number | null
  contentBlocks: ContentBlockDetail[]
}
