import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import type { WeekDay, Session } from '../types/session'

const log = createLogger('WeekStore')

/**
 * Pinia store for Weekly View state management
 *
 * Manages the current week's data, selected date, and session information.
 * Uses Composition API pattern for consistency with existing stores.
 */
export const useWeekStore = defineStore('week', () => {
  // State
  /** Array of 7 days representing the current week (Monday-Sunday) */
  const weekDays = ref<WeekDay[]>([])

  /** Currently selected/centered date in YYYY-MM-DD format */
  const selectedDate = ref<string | null>(null)

  /** Loading state for async operations */
  const loading = ref(false)

  /** Last error message from operations */
  const error = ref<string | null>(null)

  // Getters
  /**
   * Get the WeekDay object for the currently selected date
   * Returns undefined if no date is selected
   */
  const selectedDay = computed(() => {
    if (!selectedDate.value) return undefined
    return weekDays.value.find((day) => day.date === selectedDate.value)
  })

  /**
   * Find the index of today in the weekDays array
   * Returns -1 if today is not in the current week
   */
  const todayIndex = computed(() => {
    // Use local timezone to match week date generation
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const today = `${year}-${month}-${day}`
    return weekDays.value.findIndex((d) => d.date === today)
  })

  /**
   * Check if any day in the current week has been marked as completed
   */
  const hasCompletedDays = computed(() => {
    return weekDays.value.some((day) => day.state === 'completed')
  })

  // Actions
  /**
   * Fetch sessions for multiple dates from the API
   *
   * This action receives session data from composables that handle API calls.
   * It updates the weekDays array with the fetched sessions.
   *
   * @param dates - Array of date strings in YYYY-MM-DD format
   */
  async function fetchWeekSessions(_dates: string[]) {
    loading.value = true
    error.value = null

    try {
      // This is a placeholder - actual API calls are handled by composables
      // The composable will call this store's methods to update state
      // For now, this prepares the weekDays structure
      log.warn('fetchWeekSessions called - implement API integration in composable')
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando sesiones')
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Set the currently selected date
   *
   * @param date - Date string in YYYY-MM-DD format
   */
  function selectDate(date: string) {
    selectedDate.value = date
  }

  /**
   * Mark a specific day as completed
   *
   * Updates the state of the day to 'completed' in the weekDays array.
   *
   * @param date - Date string in YYYY-MM-DD format
   */
  function markDayCompleted(date: string) {
    const dayIndex = weekDays.value.findIndex((day) => day.date === date)
    if (dayIndex !== -1) {
      weekDays.value[dayIndex].state = 'completed'
    }
  }

  /**
   * Update the weekDays array with new data
   *
   * This is called by composables after fetching data from the API.
   *
   * @param days - Array of WeekDay objects
   */
  function setWeekDays(days: WeekDay[]) {
    weekDays.value = days
  }

  /**
   * Update a specific day's session data
   *
   * @param date - Date string in YYYY-MM-DD format
   * @param session - Session data from API
   */
  function setDaySession(date: string, session: Session) {
    const dayIndex = weekDays.value.findIndex((day) => day.date === date)
    if (dayIndex !== -1) {
      weekDays.value[dayIndex].session = session
    }
  }

  /**
   * Reset all state to initial values
   */
  function reset() {
    weekDays.value = []
    selectedDate.value = null
    loading.value = false
    error.value = null
  }

  return {
    // State
    weekDays,
    selectedDate,
    loading,
    error,
    // Getters
    selectedDay,
    todayIndex,
    hasCompletedDays,
    // Actions
    fetchWeekSessions,
    selectDate,
    markDayCompleted,
    setWeekDays,
    setDaySession,
    reset,
  }
})
