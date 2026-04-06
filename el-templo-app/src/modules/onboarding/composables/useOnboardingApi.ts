import { ref } from 'vue'
import { api } from 'src/boot/axios'
import { Notify } from 'quasar'
import { extractError } from 'src/utils/extract-error'
import type {
  CompleteOnboardingResponse,
  CompleteOnboardingResponseV2,
  OnboardingAnswers,
  OnboardingAnswersV2,
} from '../types'

export function useOnboardingApi() {
  const submitting = ref(false)
  const submitError = ref<string | null>(null)

  async function submitOnboarding(
    answers: OnboardingAnswers,
  ): Promise<CompleteOnboardingResponse | null> {
    submitting.value = true
    submitError.value = null
    try {
      const response = await api.post<CompleteOnboardingResponse>('/onboarding/complete', {
        goalType: answers.goalType,
        experienceLevel: answers.experienceLevel,
        trainingFocus: answers.trainingFocus,
        motivationStyle: answers.motivationStyle,
      })
      return response.data
    } catch (err: unknown) {
      const message = extractError(err, 'Error al guardar tu perfil. Intenta de nuevo.')
      submitError.value = message
      Notify.create({ type: 'negative', message })
      return null
    } finally {
      submitting.value = false
    }
  }

  async function submitOnboardingV2(
    answers: OnboardingAnswersV2,
  ): Promise<CompleteOnboardingResponseV2 | null> {
    submitting.value = true
    submitError.value = null
    try {
      const response = await api.post<CompleteOnboardingResponseV2>('/onboarding/complete', {
        ageRange: answers.ageRange,
        trainingBackground: answers.trainingBackground,
        goal: answers.goal,
        painPoint: answers.painPoint,
        trainingFrequency: answers.trainingFrequency,
      })
      return response.data
    } catch (err: unknown) {
      const message = extractError(err, 'Error al guardar tu perfil. Intenta de nuevo.')
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
    submitOnboardingV2,
    recordAnalytics,
    cleanup,
  }
}
