<template>
  <q-layout>
    <q-page-container>
      <q-page :class="['onboarding-page', { 'onboarding--exiting': isExiting }]">
        <OnboardingBackground :logo-size="logoSize" />

        <div class="onboarding-page__content">
          <!-- Progress dots (visible only during questions) -->
          <OnboardingProgressDots v-if="step >= 1 && step <= 4" :current-step="step - 1" />

          <!-- Screen transitions -->
          <div class="onboarding-page__screen-container">
            <Transition :name="transitionName" mode="out-in">
              <OnboardingWelcome v-if="step === 0" :key="0" @start="onStart" />
              <OnboardingQuestion
                v-else-if="step >= 1 && step <= 4"
                :key="step"
                :question="QUIZ_QUESTIONS[step - 1]"
                :question-index="step - 1"
                :selected-value="currentAnswer"
                :show-back="step > 1"
                @select="onSelect"
                @back="onBack"
              />
              <OnboardingResult
                v-else-if="step === 5"
                :key="5"
                :answers="answers"
                :aura-awarded="auraAwarded"
                :submitting="submitting"
                @enter="onEnter"
              />
            </Transition>
          </div>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from 'src/stores/useUserStore'
import { useOnboardingApi } from '../composables/useOnboardingApi'
import { QUIZ_QUESTIONS } from '../types'
import type {
  OnboardingAnswers,
  GoalType,
  ExperienceLevel,
  TrainingFocus,
  MotivationStyle,
} from '../types'
import OnboardingBackground from '../components/OnboardingBackground.vue'
import OnboardingProgressDots from '../components/OnboardingProgressDots.vue'
import OnboardingWelcome from '../components/OnboardingWelcome.vue'
import OnboardingQuestion from '../components/OnboardingQuestion.vue'
import OnboardingResult from '../components/OnboardingResult.vue'

const router = useRouter()
const userStore = useUserStore()
const { submitting, submitOnboarding, recordAnalytics } = useOnboardingApi()

// =========================================================================
// State machine: 0=welcome, 1-4=questions, 5=result
// =========================================================================
const step = ref(0)
const direction = ref<'forward' | 'backward'>('forward')
const answers = ref<OnboardingAnswers>({
  goalType: null,
  experienceLevel: null,
  trainingFocus: null,
  motivationStyle: null,
})
const auraAwarded = ref(0)
const isExiting = ref(false)

// Analytics timing
const quizStartTime = ref<number | null>(null)
const stepStartTime = ref<number>(Date.now())

// =========================================================================
// Computed
// =========================================================================
const logoSize = computed(() => {
  if (step.value === 0) return 150
  if (step.value === 5) return 120
  return 80
})

const transitionName = computed(() => {
  return direction.value === 'forward' ? 'slide-left' : 'slide-right'
})

const currentAnswer = computed(() => {
  if (step.value < 1 || step.value > 4) return null
  const key = QUIZ_QUESTIONS[step.value - 1].key
  return answers.value[key]
})

// =========================================================================
// Event handlers
// =========================================================================
function onStart() {
  quizStartTime.value = Date.now()
  stepStartTime.value = Date.now()
  direction.value = 'forward'
  step.value = 1
  recordAnalytics({ eventType: 'quiz_started' })
}

function onSelect(value: string) {
  const questionIndex = step.value - 1
  const questionKey = QUIZ_QUESTIONS[questionIndex].key
  const durationMs = Date.now() - stepStartTime.value

  // Update the answer
  switch (questionKey) {
    case 'goalType':
      answers.value.goalType = value as GoalType
      break
    case 'experienceLevel':
      answers.value.experienceLevel = value as ExperienceLevel
      break
    case 'trainingFocus':
      answers.value.trainingFocus = value as TrainingFocus
      break
    case 'motivationStyle':
      answers.value.motivationStyle = value as MotivationStyle
      break
  }

  // Record analytics
  recordAnalytics({
    eventType: 'question_answered',
    questionIndex,
    answerValue: value,
    durationMs,
  })

  // Auto-advance after 400ms delay (D-03)
  direction.value = 'forward'
  setTimeout(() => {
    step.value = step.value + 1
    stepStartTime.value = Date.now()
  }, 400)
}

function onBack() {
  if (step.value <= 1) return
  direction.value = 'backward'
  step.value = step.value - 1
  stepStartTime.value = Date.now()
}

async function onEnter() {
  const result = await submitOnboarding(answers.value)
  if (!result) return // Error handled by composable (Notify shown)

  auraAwarded.value = result.auraAwarded

  // Record completion analytics
  const totalDurationMs = quizStartTime.value ? Date.now() - quizStartTime.value : 0
  recordAnalytics({
    eventType: 'quiz_completed',
    durationMs: totalDurationMs,
  })

  // Mark onboarding complete in local state
  userStore.markOnboardingComplete()

  // Exit animation (800ms fade, matching LoginPage)
  isExiting.value = true
  await new Promise((resolve) => setTimeout(resolve, 800))
  router.replace({ name: 'home' })
}
</script>

<style lang="scss" scoped>
$charcoal: #2e2a26;

// =========================================================================
// Page layout
// =========================================================================
.onboarding-page {
  background-color: $charcoal !important;
  min-height: var(--app-vh);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  transition: opacity 0.8s ease;
}

.onboarding--exiting {
  opacity: 0;
}

.onboarding-page__content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding-top: 16px;
}

.onboarding-page__screen-container {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
}

// =========================================================================
// Slide transitions
// =========================================================================
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 300ms ease;
}

.slide-left-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-right-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
