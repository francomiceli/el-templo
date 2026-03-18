import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from 'src/boot/axios'

export type Level = 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan'

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
  // State
  const profile = ref<UserProfile | null>(null)
  const loading = ref(false)
  const subscription = ref<MemberSubscription | null>(null)
  const subscriptionLoading = ref(false)

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

  // Actions
  function setProfile(newProfile: UserProfile) {
    profile.value = newProfile
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
  }

  return {
    // State
    profile,
    loading,
    subscription,
    subscriptionLoading,
    // Getters
    fullName,
    displayLevel,
    subscriptionStatusLabel,
    subscriptionStatusColor,
    // Actions
    setProfile,
    clearProfile,
    setLoading,
    loadSubscription,
  }
})
