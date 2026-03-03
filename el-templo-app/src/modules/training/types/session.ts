/**
 * Session types for frontend Weekly View
 *
 * These types match the API response structure from GET /sessions/daily
 * and provide the foundation for all Weekly View components.
 */

/**
 * Block role in session structure
 * Defines the purpose and positioning of each block in a training session
 */
export type BlockRole =
  | 'INITIUM' // Warm-up/activation block
  | 'NUCLEUS' // Main work block
  | 'DEUTEROS_1' // First secondary block
  | 'DEUTEROS_2' // Second secondary block
  | 'ATHLOS' // Challenge block (odd weeks)
  | 'EPIKOS' // Epic challenge block (even weeks)

/**
 * Individual exercise prescription within a block
 * Contains all details needed to perform the exercise
 */
export interface Prescription {
  /** Database ID of the exercise */
  exerciseId: number

  /** Display name of the exercise */
  exerciseName: string

  /** Contraction type (e.g., 'CON', 'EXC', 'ISO') */
  contraction: string

  /** Number of repetitions (null for time-based exercises) */
  reps: number | null

  /** Upper bound of rep range for AMRAP (null if not a range) */
  repsMax: number | null

  /** Duration in seconds (null for rep-based exercises) */
  seconds: number | null

  /** Upper bound of seconds range for AMRAP (null if not a range) */
  secondsMax: number | null

  /** Per-round increment for Death By format (null if not Death By) */
  increment: number | null

  /** Rest period in seconds after this exercise */
  rest: number

  /** Optional coaching notes or cues */
  notes: string | null

  /** Position within the block (0-indexed) */
  sortOrder: number

  /** URL to exercise demonstration video (null if no video available) */
  videoUrl: string | null
}

/**
 * Training block containing related exercises
 * Represents a cohesive unit of work in a session
 */
export interface Block {
  /** Unique identifier for this block instance */
  blockId: string

  /** Role/purpose of this block in the session */
  role: BlockRole

  /** Training route (e.g., 'push', 'pull', 'legs') */
  route: string

  /** Movement pattern focus (e.g., 'vertical', 'horizontal') */
  pattern: string

  /** Intensity level (1-10 scale) */
  intensity: number

  /** Total repetition budget for the block */
  repsBudget: number

  /** Format identifier (e.g., 'straight-3x8', 'emom-10min') */
  format: string

  /** Human-readable description of the format (from DB) */
  formatDescription: string | null

  /** Position within the session (0-indexed) */
  sortOrder: number

  /** Ordered list of exercises in this block */
  exercises: Prescription[]

  /** Mobility exercise for this block (null for INITIUM) */
  mobilityExercise: {
    exerciseId: number
    exerciseName: string
    contraction: string
    reps: number | null
    seconds: number | null
    rest: number
    notes: string | null
    videoUrl: string | null
  } | null
}

/**
 * Complete training session for a specific day
 * Contains all blocks and metadata for the workout
 */
export interface Session {
  /** Unique identifier (format: W{week}-{day}-{levelGroup}) */
  dayId: string

  /** SPOM week number (1-12 in the cycle) */
  week: number

  /** Spanish day name (lunes, martes, miercoles, jueves, viernes, sabado) */
  day: string

  /** Level grouping (alfa_delta, sigma, omega) */
  levelGroup: string

  /** Number of blocks in this session */
  blockCount: number

  /** Ordered list of training blocks */
  blocks: Block[]
}

/**
 * State of a calendar day in the weekly view
 * Determines visual styling and interaction behavior
 */
export type DayState =
  | 'today' // Current day (highlighted)
  | 'past' // Before today (dimmed)
  | 'future' // After today (normal)
  | 'completed' // User has completed this session
  | 'rest' // Sunday (no training)

/**
 * Combined day data for weekly view calendar
 * Merges calendar info with session data
 */
export interface WeekDay {
  /** Date in YYYY-MM-DD format (ISO 8601) */
  date: string

  /** Spanish day name (Lunes, Martes, etc.) */
  dayName: string

  /** Day of week (0=Sunday, 1=Monday, ..., 6=Saturday) */
  dayOfWeek: number

  /** Current state of this day */
  state: DayState

  /** Training session for this day (null for Sundays) */
  session: Session | null
}
