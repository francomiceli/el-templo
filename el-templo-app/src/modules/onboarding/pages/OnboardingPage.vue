<template>
  <q-layout>
    <q-page-container>
      <q-page :class="['onboarding-page', { 'onboarding--exiting': isExiting }]">
        <OnboardingBackground :logo-size="logoSize" />

        <div class="onboarding-page__content">
          <!-- Progress dots (visible only during questions, NOT on recommendation) -->
          <OnboardingProgressDots v-if="step >= 1 && step <= 5" :current-step="step - 1" />

          <!-- Screen transitions -->
          <div class="onboarding-page__screen-container">
            <Transition :name="transitionName" mode="out-in">
              <OnboardingWelcome v-if="step === 0" :key="0" @start="onStart" />
              <OnboardingQuestion
                v-else-if="step >= 1 && step <= 5"
                :key="step"
                :question="filteredQuestions[step - 1]"
                :question-index="step - 1"
                :selected-value="currentAnswer"
                :show-back="step > 1"
                @select="onSelect"
                @back="onBack"
              />
              <OnboardingRecommendation
                v-else-if="step === 6"
                :key="6"
                :program-name="recommendationResult?.programName ?? ''"
                :program-description="recommendationResult?.programDescription ?? ''"
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
import {
  QUIZ_QUESTIONS_V2,
  Q3_UNIVERSAL_OPTIONS,
  Q3_WOMEN_OPTIONS,
  Q3_MEN_OPTIONS,
  Q3_41PLUS_OPTION,
  PROGRAM_RECOMMENDATIONS,
} from '../types'
import type {
  OnboardingAnswersV2,
  AgeRange,
  TrainingBackground,
  GoalChoice,
  PainPoint,
  TrainingFrequency,
} from '../types'
import OnboardingBackground from '../components/OnboardingBackground.vue'
import OnboardingProgressDots from '../components/OnboardingProgressDots.vue'
import OnboardingWelcome from '../components/OnboardingWelcome.vue'
import OnboardingQuestion from '../components/OnboardingQuestion.vue'
import OnboardingRecommendation from '../components/OnboardingRecommendation.vue'

const router = useRouter()
const userStore = useUserStore()
const { submitting, submitOnboardingV2, recordAnalytics } = useOnboardingApi()

// =========================================================================
// State machine: 0=welcome, 1-5=questions, 6=recommendation
// =========================================================================
const step = ref(0)
const direction = ref<'forward' | 'backward'>('forward')
const answers = ref<OnboardingAnswersV2>({
  ageRange: null,
  trainingBackground: null,
  goal: null,
  painPoint: null,
  trainingFrequency: null,
})
const auraAwarded = ref(0)
const isExiting = ref(false)
const recommendationResult = ref<{
  programName: string
  programDescription: string
} | null>(null)

// Analytics timing
const quizStartTime = ref<number | null>(null)
const stepStartTime = ref<number>(Date.now())

// =========================================================================
// Computed
// =========================================================================
const logoSize = computed(() => {
  if (step.value === 0) return 150
  if (step.value === 6) return 120
  return 80
})

const transitionName = computed(() => {
  return direction.value === 'forward' ? 'slide-left' : 'slide-right'
})

const currentAnswer = computed(() => {
  if (step.value < 1 || step.value > 5) return null
  const key = QUIZ_QUESTIONS_V2[step.value - 1].key
  return answers.value[key]
})

// Q3 gender filtering (per D-06, D-09)
const filteredQuestions = computed(() => {
  const userGender = userStore.profile?.gender ?? 'unspecified'
  const userAgeRange = answers.value.ageRange

  return QUIZ_QUESTIONS_V2.map((q) => {
    if (!q.genderFiltered) return q

    // Q3: filter options by gender + age
    const allowedValues = [...Q3_UNIVERSAL_OPTIONS]

    if (userGender === 'female') {
      allowedValues.push(...Q3_WOMEN_OPTIONS)
    } else if (userGender === 'male') {
      allowedValues.push(...Q3_MEN_OPTIONS)
    } else {
      // 'other' or 'unspecified': show ALL options (per D-06)
      allowedValues.push(...Q3_WOMEN_OPTIONS, ...Q3_MEN_OPTIONS)
    }

    // 41+ sees longevidad regardless of gender
    if (userAgeRange === '41_plus') {
      allowedValues.push(Q3_41PLUS_OPTION)
    }

    return {
      ...q,
      options: q.options.filter((opt) => allowedValues.includes(opt.value)),
    }
  })
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
  const questionKey = QUIZ_QUESTIONS_V2[questionIndex].key
  const durationMs = Date.now() - stepStartTime.value

  // Update the answer
  switch (questionKey) {
    case 'ageRange':
      answers.value.ageRange = value as AgeRange
      break
    case 'trainingBackground':
      answers.value.trainingBackground = value as TrainingBackground
      break
    case 'goal':
      answers.value.goal = value as GoalChoice
      break
    case 'painPoint':
      answers.value.painPoint = value as PainPoint
      break
    case 'trainingFrequency':
      answers.value.trainingFrequency = value as TrainingFrequency
      break
  }

  // Record analytics
  recordAnalytics({
    eventType: 'question_answered',
    questionIndex,
    answerValue: value,
    durationMs,
  })

  // Auto-advance after 400ms delay
  direction.value = 'forward'
  setTimeout(() => {
    if (step.value === 5) {
      // Last question — submit and go to recommendation
      onSubmit()
    } else {
      step.value = step.value + 1
      stepStartTime.value = Date.now()
    }
  }, 400)
}

function onBack() {
  if (step.value <= 1) return
  direction.value = 'backward'
  step.value = step.value - 1
  stepStartTime.value = Date.now()
}

async function onSubmit() {
  const result = await submitOnboardingV2(answers.value)
  if (!result) return // Error shown by composable Notify

  auraAwarded.value = result.auraAwarded

  // Get program recommendation
  const program = PROGRAM_RECOMMENDATIONS[result.profile.suggestedProgram]
  recommendationResult.value = {
    programName: program?.name ?? result.profile.suggestedProgram,
    programDescription: program?.description ?? '',
  }

  // Record completion analytics with total duration (per D-22)
  const totalDurationMs = quizStartTime.value ? Date.now() - quizStartTime.value : 0
  recordAnalytics({ eventType: 'quiz_completed', durationMs: totalDurationMs })

  // Record avatar_assigned event (per D-23)
  recordAnalytics({
    eventType: 'avatar_assigned',
    answerValue: result.profile.avatarType,
  })

  // Advance to recommendation screen
  direction.value = 'forward'
  step.value = 6
}

async function onEnter() {
  // Mark onboarding complete in local state
  userStore.markOnboardingComplete()

  // Exit animation (800ms fade)
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

// =========================================================================
// Accessibility: reduced motion
// =========================================================================
@media (prefers-reduced-motion: reduce) {
  .slide-left-enter-active,
  .slide-left-leave-active,
  .slide-right-enter-active,
  .slide-right-leave-active {
    transition: none;
  }

  .onboarding-page {
    transition: none;
  }
}
</style>
