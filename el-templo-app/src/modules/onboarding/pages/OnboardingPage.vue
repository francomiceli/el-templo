<template>
  <q-layout>
    <q-page-container>
      <q-page :class="['onboarding-page', { 'onboarding--exiting': isExiting }]">
        <OnboardingBackground :logo-size="logoSize" />

        <!-- Soft dark wash + blur across the entire flow so copy reads
             cleanly over the bar-train photo + embers. -->
        <div class="onboarding-page__backdrop" aria-hidden="true" />

        <div class="onboarding-page__content">
          <!-- Header row: back arrow (left) + progress dots (centered).
               Visible only during questions + level step; hidden on
               opener, reflect, and recommendation. -->
          <div v-if="showHeader" class="onboarding-page__header">
            <button
              v-if="canGoBack"
              class="onboarding-page__back"
              aria-label="Volver a la pregunta anterior"
              @click="onBackButtonClick"
            >
              <q-icon name="arrow_back" size="22px" />
            </button>
            <OnboardingProgressDots
              :current-step="progressDotIndex"
              :total-steps="progressDotTotal"
            />
          </div>

          <!-- Screen transitions -->
          <div class="onboarding-page__screen-container">
            <Transition :name="transitionName" mode="out-in">
              <OnboardingOpen v-if="step === 0" :key="0" @start="onStart" />
              <OnboardingReflect
                v-else-if="showReflect && reflectContext"
                :key="`reflect-${step}-${reflectContext.value}`"
                :line="reflectContext.line"
                :answer-echo="reflectContext.echo"
                @continue="onReflectContinue"
              />
              <OnboardingQuestion
                v-else-if="showLevelStep"
                key="level-step"
                :question="LEVEL_SELECTOR_QUESTION"
                :question-index="1"
                :selected-value="answers.level"
                @select="onLevelSelect"
              />
              <OnboardingAge
                v-else-if="step === 1"
                key="age-step"
                @select="onAgeSelect"
                @skip="onAgeSkip"
              />
              <OnboardingQuestion
                v-else-if="step >= 2 && step <= 5"
                :key="step"
                :question="filteredQuestions[step - 1]"
                :question-index="step - 1"
                :selected-value="currentAnswer"
                @select="onSelect"
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
  LEVEL_SELECTOR_QUESTION,
  AGE_RANGE_SKIP_DEFAULT,
  deriveAgeRangeFromDob,
  lookupReflect,
} from '../types'
import type {
  OnboardingAnswersV2,
  AgeRange,
  TrainingBackground,
  TemploLevel,
  GoalChoice,
  PainPoint,
  TrainingFrequency,
  QuizKeyV2,
} from '../types'
import OnboardingBackground from '../components/OnboardingBackground.vue'
import OnboardingProgressDots from '../components/OnboardingProgressDots.vue'
import OnboardingOpen from '../components/OnboardingOpen.vue'
import OnboardingQuestion from '../components/OnboardingQuestion.vue'
import OnboardingAge from '../components/OnboardingAge.vue'
import OnboardingReflect from '../components/OnboardingReflect.vue'
import OnboardingRecommendation from '../components/OnboardingRecommendation.vue'

const router = useRouter()
const userStore = useUserStore()
const { submitting, submitOnboardingV2, recordAnalytics } = useOnboardingApi()

// =========================================================================
// State machine: 0=welcome, 1-5=questions, 6=recommendation
// =========================================================================
const step = ref(0)
const direction = ref<'forward' | 'backward'>('forward')
const showLevelStep = ref(false)
const showReflect = ref(false)
const reflectContext = ref<{
  key: QuizKeyV2
  value: string
  line: string
  echo: string
} | null>(null)
const answers = ref<OnboardingAnswersV2>({
  ageRange: null,
  trainingBackground: null,
  level: null,
  goal: null,
  painPoint: null,
  trainingFrequency: null,
})
// When we already know the user's birth date (imported/active members), we
// derive the age bucket and skip Q1 entirely. Computed up-front so the state
// machine can decide whether to start at step 1 or step 2 on first load.
const prefilledAgeRange = computed(() =>
  deriveAgeRangeFromDob(userStore.profile?.dateOfBirth ?? null),
)
const hasKnownDob = computed(() => prefilledAgeRange.value !== null)

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

// When el_templo is selected, the quiz has 6 steps instead of 5.
// When Q1 (age) is skipped because we already know the user's DOB, the quiz
// drops to 4 (or 5 with the level path).
const hasLevelPath = computed(() => answers.value.trainingBackground === 'el_templo')
const progressDotTotal = computed(() => {
  const base = hasLevelPath.value ? 6 : 5
  return hasKnownDob.value ? base - 1 : base
})
const progressDotIndex = computed(() => {
  const ageOffset = hasKnownDob.value ? 1 : 0
  if (showLevelStep.value) return 2 - ageOffset
  if (hasLevelPath.value && step.value >= 3) return step.value - ageOffset
  return step.value - 1 - ageOffset
})

// Header row visibility: shown during questions + level step, hidden on
// opener, reflect, and recommendation screens.
const showHeader = computed(() => {
  if (showReflect.value) return false
  return showLevelStep.value || (step.value >= 1 && step.value <= 5)
})

// Back button visibility within the header row.
const canGoBack = computed(() => {
  if (showReflect.value) return false
  if (showLevelStep.value) return true
  // When Q1 is pre-skipped (known DOB), Q2 is effectively the first step —
  // there's nowhere to go back to.
  const minBackStep = hasKnownDob.value ? 3 : 2
  return step.value >= minBackStep && step.value <= 5
})

function onBackButtonClick() {
  if (showLevelStep.value) {
    onLevelBack()
  } else {
    onBack()
  }
}

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

    // 35+ sees longevidad regardless of gender
    if (userAgeRange === '35_50' || userAgeRange === '50_plus') {
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
  recordAnalytics({ eventType: 'quiz_started' })
  // If we already know the user's birth date, derive the age bucket and jump
  // straight to Q2 — Q1 is redundant for existing members.
  if (prefilledAgeRange.value) {
    answers.value.ageRange = prefilledAgeRange.value
    step.value = 2
    return
  }
  step.value = 1
}

function onAgeSelect(value: AgeRange) {
  answers.value.ageRange = value
  const durationMs = Date.now() - stepStartTime.value
  recordAnalytics({
    eventType: 'question_answered',
    questionIndex: 0,
    answerValue: value,
    durationMs,
  })
  direction.value = 'forward'
  setTimeout(() => {
    step.value = 2
    stepStartTime.value = Date.now()
  }, 200)
}

function onAgeSkip() {
  answers.value.ageRange = AGE_RANGE_SKIP_DEFAULT
  const durationMs = Date.now() - stepStartTime.value
  recordAnalytics({
    eventType: 'question_answered',
    questionIndex: 0,
    answerValue: 'skipped',
    durationMs,
  })
  direction.value = 'forward'
  step.value = 2
  stepStartTime.value = Date.now()
}

function onSelect(value: string) {
  const questionIndex = step.value - 1
  const question = QUIZ_QUESTIONS_V2[questionIndex]
  const questionKey = question.key
  const durationMs = Date.now() - stepStartTime.value

  // Update the answer
  switch (questionKey) {
    case 'ageRange':
      answers.value.ageRange = value as AgeRange
      break
    case 'trainingBackground':
      answers.value.trainingBackground = value as TrainingBackground
      // Clear level if switching away from el_templo
      if (value !== 'el_templo') answers.value.level = null
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

  direction.value = 'forward'

  // el_templo skips reflect and routes to level picker (it IS the reflect).
  const goesToLevelPicker = questionKey === 'trainingBackground' && value === 'el_templo'
  const reflectLine = goesToLevelPicker ? null : lookupReflect(questionKey, value)

  // Brief "selected" hold so the user sees the checkmark, then transition.
  setTimeout(() => {
    if (goesToLevelPicker) {
      showLevelStep.value = true
      stepStartTime.value = Date.now()
      return
    }

    if (reflectLine) {
      const echoLabel = question.options.find((opt) => opt.value === value)?.label ?? ''
      reflectContext.value = {
        key: questionKey,
        value,
        line: reflectLine,
        echo: echoLabel,
      }
      showReflect.value = true
      recordAnalytics({
        eventType: 'question_answered',
        answerValue: `reflect_shown:${questionKey}:${value}`,
      })
      return
    }

    // No reflect copy registered — advance immediately (defensive fallback).
    advancePastCurrentStep()
  }, 400)
}

function onReflectContinue() {
  showReflect.value = false
  reflectContext.value = null
  advancePastCurrentStep()
}

function advancePastCurrentStep() {
  if (step.value === 5) {
    onSubmit()
  } else {
    step.value = step.value + 1
    stepStartTime.value = Date.now()
  }
}

function onLevelSelect(value: string) {
  answers.value.level = value as TemploLevel
  const durationMs = Date.now() - stepStartTime.value

  recordAnalytics({
    eventType: 'question_answered',
    answerValue: `level:${value}`,
    durationMs,
  })

  direction.value = 'forward'
  setTimeout(() => {
    showLevelStep.value = false
    step.value = 3
    stepStartTime.value = Date.now()
  }, 400)
}

function onLevelBack() {
  direction.value = 'backward'
  showLevelStep.value = false
  // Back to Q2 (trainingBackground)
  stepStartTime.value = Date.now()
}

function onBack() {
  if (step.value <= 1) return
  // With Q1 pre-skipped, Q2 is the floor — no going back to the age step.
  if (hasKnownDob.value && step.value <= 2) return
  direction.value = 'backward'
  // If coming back to Q2 and they had picked el_templo, show level step first
  if (step.value === 3 && answers.value.trainingBackground === 'el_templo') {
    showLevelStep.value = true
    stepStartTime.value = Date.now()
    return
  }
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
  overflow: hidden;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  transition: opacity 0.8s ease;
}

.onboarding--exiting {
  opacity: 0;
}

// Page-level dark wash + blur that sits above OnboardingBackground
// and below .onboarding-page__content. Softer than the opener-only
// version so the photo still reads through.
.onboarding-page__backdrop {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: radial-gradient(
    ellipse at 50% 45%,
    rgba($charcoal, 0.38) 0%,
    rgba(0, 0, 0, 0.52) 60%,
    rgba(0, 0, 0, 0.68) 100%
  );
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
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

// Header row — back arrow on the left, progress dots centered.
// Back arrow is absolutely positioned so the dots stay visually centered
// on the page regardless of whether back is present.
.onboarding-page__header {
  position: relative;
  width: 100%;
  max-width: 380px;
  min-height: 44px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.onboarding-page__back {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(242, 237, 229, 0.55);
  cursor: pointer;
  padding: 0;
  border-radius: 50%;
  transition:
    color 0.2s ease,
    background 0.2s ease,
    transform 0.1s ease;

  &:hover {
    color: #f2ede5;
    background: rgba(242, 237, 229, 0.06);
  }

  &:active {
    transform: translateY(-50%) scale(0.9);
  }
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
