import { ref } from 'vue'
import { api } from 'src/boot/axios'
import type { OnboardingProfile } from '../types'

export function useProfileApi() {
  const profile = ref<OnboardingProfile | null>(null)
  const loading = ref(false)

  async function fetchProfile(): Promise<void> {
    loading.value = true
    try {
      const response = await api.get<OnboardingProfile>('/onboarding/profile')
      // GET /profile returns 204 No Content if no profile exists
      // Axios will have response.status === 204 and response.data will be empty
      if (response.status === 204) {
        profile.value = null
      } else {
        profile.value = response.data
      }
    } catch {
      profile.value = null
    } finally {
      loading.value = false
    }
  }

  function cleanup() {
    profile.value = null
    loading.value = false
  }

  return { profile, loading, fetchProfile, cleanup }
}
