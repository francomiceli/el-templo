import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { useLevelSelectionStorage } from 'src/composables/useLevelSelectionStorage'
import { isTrainingLevel, type Level } from 'src/modules/training/level-display'

// Re-export Level for backward compatibility with existing imports.
export type { Level }

export type MemberSegment =
  | 'nuevo'
  | 'espartano'
  | 'intermitente'
  | 'en_riesgo'
  | 'digital_warrior'
  | 'ghost'

export type SubscriptionStatus =
  | 'active'
  | 'paused'
  | 'cancelled'
  | 'expired'
  | 'completed'
  | 'changed'
  | 'scheduled'

export interface UserProfile {
  id: number
  email: string
  firstName: string | null
  lastName: string | null
  role: 'member' | 'coach' | 'admin' | 'superadmin'
  level: Level
  branchId: number
  branchName: string
  branchIsVirtual: boolean
  branchCountry: 'AR' | 'ES'
  segment: MemberSegment | null
  onboardingCompleted: boolean
  gender: 'male' | 'female' | 'other' | 'unspecified' | null
  dateOfBirth: string | null
}

export interface MemberSubscription {
  id: number
  planName: string
  planTier: string
  status: SubscriptionStatus
  startDate: string
  endDate: string | null
  daysRemaining: number
  pricePaid: number
  planCategory: string
  multiBranch: boolean
}

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Activo',
  paused: 'Pausado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
  completed: 'Completado',
  changed: 'Cambiado',
  scheduled: 'Programado',
}

const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  active: 'positive',
  paused: 'warning',
  cancelled: 'negative',
  expired: 'grey',
  completed: 'info',
  changed: 'purple',
  scheduled: 'blue-grey',
}

export const useUserStore = defineStore('user', () => {
  const log = createLogger('useUserStore')

  // State
  const profile = ref<UserProfile | null>(null)
  const loading = ref(false)
  const subscription = ref<MemberSubscription | null>(null)
  const subscriptionLoading = ref(false)
  const hasActiveProgramEnrollment = ref(false)
  const enrolledGoalPlanType = ref<string | null>(null)

  // Phase 99: member-selectable training level.
  // selectedLevel is the in-memory override; null = use profile.level.
  const selectedLevel = ref<Level | null>(null)
  const levelStorage = useLevelSelectionStorage()
  // Closure-scoped mid-session guard. null = no guard.
  // Registered by DayPlayer (Plan 99-03) when at least one exercise has started.
  let midSessionGuard: (() => Promise<boolean>) | null = null

  // Getters
  const fullName = computed(() => {
    if (!profile.value) return ''
    const { firstName, lastName } = profile.value
    if (firstName && lastName) return `${firstName} ${lastName}`
    if (firstName) return firstName
    if (lastName) return lastName
    return profile.value.email
  })

  const displayLevel = computed(() => {
    if (!profile.value) return ''
    // Capitalize first letter
    return profile.value.level.charAt(0).toUpperCase() + profile.value.level.slice(1)
  })

  const subscriptionStatusLabel = computed(() => {
    if (!subscription.value) return ''
    return STATUS_LABELS[subscription.value.status] ?? subscription.value.status
  })

  const subscriptionStatusColor = computed(() => {
    if (!subscription.value) return 'grey'
    return STATUS_COLORS[subscription.value.status] ?? 'grey'
  })

  const segment = computed(() => profile.value?.segment ?? null)

  const onboardingCompleted = computed(() => profile.value?.onboardingCompleted ?? false)

  const hasActiveGoalPlan = computed(() => {
    // Only true when the enrolled program has a goalPlanType (e.g. front_lever, gluteos).
    // Foundation has goalPlanType=null — it uses regular sessions, not goal plan sessions.
    return hasActiveProgramEnrollment.value && enrolledGoalPlanType.value !== null
  })

  const branchDisplayName = computed(() => {
    const name = profile.value?.branchName ?? ''
    return name.replace(/^El Templo\s+/i, 'Sede ')
  })

  const hasActiveSubscription = computed(() => {
    return subscription.value?.status === 'active' || subscription.value?.status === 'paused'
  })

  /**
   * activeLevel — what the client should treat as the user's currently-active
   * training level (for content fetches, display, etc). Falls back to
   * profile.level when no override is set, and uses isTrainingLevel narrowing
   * rather than an unchecked cast so a drifted profile value cannot leak
   * through as a typed Level.
   */
  const activeLevel = computed<Level | null>(() => {
    if (selectedLevel.value) return selectedLevel.value
    const p = profile.value?.level
    return isTrainingLevel(p) ? p : null
  })

  // Actions
  function setProfile(newProfile: UserProfile) {
    profile.value = newProfile
  }

  function markOnboardingComplete() {
    if (profile.value) {
      profile.value = { ...profile.value, onboardingCompleted: true }
    }
  }

  function clearProfile() {
    profile.value = null
    subscription.value = null
  }

  function setLoading(state: boolean) {
    loading.value = state
  }

  async function loadSubscription() {
    subscriptionLoading.value = true
    try {
      const response = await api.get<MemberSubscription>('/members/subscription/me/subscription')
      // 204 No Content means no subscription
      if (response.status === 204 || !response.data) {
        subscription.value = null
      } else {
        subscription.value = response.data
      }
    } catch {
      // 204/404 or network error — no subscription
      subscription.value = null
    } finally {
      subscriptionLoading.value = false
    }

    // Fetch program enrollment status (per D-08: gates Personalizadas access)
    await fetchProgramEnrollmentStatus()
  }

  async function fetchProgramEnrollmentStatus(): Promise<void> {
    try {
      const response = await api.get('/members/programs/my-progress')
      hasActiveProgramEnrollment.value = response.status === 200 && !!response.data
      enrolledGoalPlanType.value = response.data?.goalPlanType ?? null
    } catch {
      hasActiveProgramEnrollment.value = false
      enrolledGoalPlanType.value = null
    }
  }

  // ─── Phase 99: selection API ────────────────────────────────────────────

  /**
   * Boot path — loads a previously-stored selection into the store.
   * Bypasses the mid-session guard (prevents Pitfall 6 in research: a
   * background hydration must never prompt the user). Invalid values are
   * rejected against isTrainingLevel and cleared from storage.
   */
  async function hydrateSelection(): Promise<void> {
    const userId = profile.value?.id
    if (!userId) return
    const raw = await levelStorage.get(userId)
    if (raw === null) return
    if (isTrainingLevel(raw)) {
      selectedLevel.value = raw
    } else {
      await levelStorage.remove(userId)
      selectedLevel.value = null
    }
  }

  /**
   * User-facing selection action. If the user picks their own `profile.level`,
   * route through `clearLevel` (D-08: single path to no-override). Otherwise
   * consult the mid-session guard before committing.
   */
  async function setLevel(lvl: Level): Promise<void> {
    if (profile.value?.level === lvl) {
      await clearLevel()
      return
    }
    if (midSessionGuard) {
      const proceed = await midSessionGuard()
      if (!proceed) return
    }
    selectedLevel.value = lvl
    const userId = profile.value?.id
    if (userId) await levelStorage.set(userId, lvl)
  }

  /**
   * Clears the override. Gated by the mid-session guard (reached via self-pick
   * through setLevel, or directly from any caller wanting to reset to the
   * assigned level).
   */
  async function clearLevel(): Promise<void> {
    if (midSessionGuard) {
      const proceed = await midSessionGuard()
      if (!proceed) return
    }
    selectedLevel.value = null
    const userId = profile.value?.id
    if (userId) await levelStorage.remove(userId)
  }

  /**
   * Logout path — wipes the stored selection BYPASSING the guard (session is
   * ending, no point prompting). Resolves userId defensively from profile or
   * authStore.user so it works regardless of which ref was nulled first.
   *
   * IMPORTANT: useAuthStore is imported lazily here to avoid a top-level
   * circular import (useAuthStore imports useUserStore for clearProfile).
   */
  async function clearSelection(): Promise<void> {
    const { useAuthStore } = await import('src/stores/useAuthStore')
    const authStore = useAuthStore()
    const userId = profile.value?.id ?? authStore.user?.id
    selectedLevel.value = null
    if (userId) await levelStorage.remove(userId)
  }

  /**
   * Register (or clear with `null`) the mid-session guard. Plan 99-03 wires
   * DayPlayer to register this when `anyExerciseStarted === true`.
   */
  function registerMidSessionGuard(fn: (() => Promise<boolean>) | null): void {
    midSessionGuard = fn
  }

  return {
    // State
    profile,
    loading,
    subscription,
    subscriptionLoading,
    selectedLevel,
    // Getters
    fullName,
    displayLevel,
    subscriptionStatusLabel,
    subscriptionStatusColor,
    segment,
    onboardingCompleted,
    hasActiveGoalPlan,
    hasActiveSubscription,
    branchDisplayName,
    activeLevel,
    // Actions
    setProfile,
    markOnboardingComplete,
    clearProfile,
    setLoading,
    loadSubscription,
    fetchProgramEnrollmentStatus,
    // Phase 99: selection API
    setLevel,
    clearLevel,
    clearSelection,
    hydrateSelection,
    registerMidSessionGuard,
  }
})
