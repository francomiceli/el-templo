import { ref } from 'vue'
import { api } from 'src/boot/axios'
import { Notify } from 'quasar'
import { extractError } from 'src/utils/extract-error'
import type { CompleteOnboardingResponse, OnboardingAnswers } from '../types'

export function useOnboardingApi() {
  const submitting = ref(false)
  const submitError = ref<string | null>(null)

  async function submitOnboarding(
    answers: OnboardingAnswers,
  ): Promise<CompleteOnboardingResponse | null> {
    submitting.value = true
    submitError.value = null
    try {
      const response = await api.post<CompleteOnboardingResponse>(
        '/onboarding/complete',
        {
          goalType: answers.goalType,
          experienceLevel: answers.experienceLevel,
          trainingFocus: answers.trainingFocus,
          motivationStyle: answers.motivationStyle,
        },
      )
      return response.data
    } catch (err: unknown) {
      const message = extractError(
        err,
        'Error al guardar tu perfil. Intenta de nuevo.',
      )
      submitError.value = message
      Notify.create({ type: 'negative', message })
      return null
    } finally {
      submitting.value = false
    }
  }

  async function recordAnalytics(event: {
    eventType: string
    questionIndex?: number
    answerValue?: string
    durationMs?: number
  }): Promise<void> {
    try {
      await api.post('/onboarding/analytics', event)
    } catch {
      // Analytics failures are silent - never block UX
    }
  }

  function cleanup() {
    submitting.value = false
    submitError.value = null
  }

  return {
    submitting,
    submitError,
    submitOnboarding,
    recordAnalytics,
    cleanup,
  }
}
