<template>
  <q-card flat bordered class="check-in-card">
    <q-card-section>
      <!-- Completed State (tappable to re-edit) -->
      <div v-if="answer && !editing" class="check-in-card__completed" @click="editing = true">
        <div class="check-in-card__completed-header">
          <q-icon :name="config.icon" size="20px" color="primary" />
          <span class="check-in-card__completed-label">{{ answerLabel }}</span>
          <span v-if="answer.bodyArea" class="check-in-card__completed-area">
            ({{ bodyAreaLabel }})
          </span>
          <q-icon name="edit" size="14px" class="check-in-card__edit-icon" />
        </div>
        <p v-if="feedbackTip" class="check-in-card__feedback">{{ feedbackTip }}</p>
      </div>

      <!-- Interactive State -->
      <div v-else>
        <div class="check-in-card__header">
          <q-icon :name="config.icon" class="check-in-card__icon" />
          <span class="check-in-card__question">{{ config.question }}</span>
        </div>

        <!-- Option Buttons -->
        <div class="check-in-card__options">
          <q-btn
            v-for="option in config.options"
            :key="option.value"
            :label="option.label"
            :outline="selectedValue !== option.value"
            :unelevated="selectedValue === option.value"
            :color="selectedValue === option.value ? 'primary' : undefined"
            :text-color="selectedValue === option.value ? 'white' : 'primary'"
            no-caps
            dense
            rounded
            class="check-in-card__option-btn"
            :disable="submitting"
            @click="handleOptionSelect(option.value)"
          />
        </div>

        <!-- Body Area Selector (soreness only) -->
        <div v-if="showBodyArea" class="check-in-card__body-area">
          <p class="check-in-card__body-area-label">¿Dónde?</p>
          <div class="check-in-card__body-area-options">
            <q-btn
              v-for="area in BODY_AREA_OPTIONS"
              :key="area.value"
              :label="area.label"
              :outline="selectedBodyArea !== area.value"
              :unelevated="selectedBodyArea === area.value"
              :color="selectedBodyArea === area.value ? 'secondary' : undefined"
              :text-color="selectedBodyArea === area.value ? 'white' : 'secondary'"
              no-caps
              dense
              rounded
              size="sm"
              class="check-in-card__body-area-btn"
              :disable="submitting"
              @click="handleBodyAreaSelect(area.value)"
            />
          </div>
        </div>

        <!-- Submitting indicator -->
        <div v-if="submitting" class="check-in-card__submitting">
          <TemploLoader size="sm" />
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { CheckInQuestionConfig, CheckInAnswerValue } from '../types'
import TemploLoader from 'src/components/TemploLoader.vue'
import { BODY_AREA_OPTIONS } from '../types'

const props = defineProps<{
  config: CheckInQuestionConfig
  answer: CheckInAnswerValue | null
}>()

const emit = defineEmits<{
  submit: [value: string, bodyArea?: string]
}>()

const selectedValue = ref<string | null>(null)
const selectedBodyArea = ref<string | null>(null)
const submitting = ref(false)
const editing = ref(false)

const showBodyArea = computed(() => {
  return selectedValue.value !== null && props.config.needsBodyArea(selectedValue.value)
})

const answerLabel = computed(() => {
  if (!props.answer) return ''
  const option = props.config.options.find((o) => o.value === props.answer?.value)
  return option?.label ?? props.answer.value
})

const bodyAreaLabel = computed(() => {
  if (!props.answer?.bodyArea) return ''
  const area = BODY_AREA_OPTIONS.find((a) => a.value === props.answer?.bodyArea)
  return area?.label ?? props.answer.bodyArea
})

// Feedback tips based on answer values
const FEEDBACK_TIPS: Record<string, Record<string, string>> = {
  energy: {
    bajo: 'Tomátelo con calma hoy',
    normal: '¡Buen nivel para entrenar!',
    alto: '¡Aprovechá esa energía!',
  },
  soreness: {
    ninguna: '¡Todo bien!',
    leve: 'Pedile a tu entrenador movilidad para esa zona',
    moderada: 'Hablá con tu entrenador al respecto en la sesión de hoy',
  },
  sleep: {
    mal: 'Escuchá tu cuerpo hoy',
    ok: '¡Suficiente para entrenar!',
    bien: '¡Bien descansado!',
  },
}

const feedbackTip = computed(() => {
  if (!props.answer) return null
  return FEEDBACK_TIPS[props.config.type]?.[props.answer.value] ?? null
})

function handleOptionSelect(value: string) {
  if (submitting.value) return
  selectedValue.value = value
  if (props.config.needsBodyArea(value)) {
    selectedBodyArea.value = null
    return
  }
  doSubmit(value)
}

function handleBodyAreaSelect(area: string) {
  if (submitting.value || !selectedValue.value) return
  selectedBodyArea.value = area
  doSubmit(selectedValue.value, area)
}

function doSubmit(value: string, bodyArea?: string) {
  submitting.value = true
  editing.value = false
  emit('submit', value, bodyArea)
}

watch(
  () => props.answer,
  () => {
    selectedValue.value = null
    selectedBodyArea.value = null
    submitting.value = false
    editing.value = false
  },
)
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.check-in-card {
  background-color: white;
  border-color: rgba($primary, 0.2);
  border-radius: 12px;

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  &__icon {
    font-size: 28px;
    color: $primary;
  }

  &__question {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: $primary;
  }

  &__options {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__option-btn {
    border-color: rgba($primary, 0.3);
    min-width: 70px;
  }

  &__body-area {
    margin-top: 12px;
  }

  &__body-area-label {
    font-size: 12px;
    font-weight: 600;
    color: rgba($primary, 0.7);
    margin: 0 0 8px;
  }

  &__body-area-options {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  &__body-area-btn {
    border-color: rgba($secondary, 0.3);
  }

  &__submitting {
    display: flex;
    justify-content: center;
    margin-top: 8px;
  }

  &__completed {
    cursor: pointer;
  }

  &__completed-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__completed-label {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: $primary;
  }

  &__completed-area {
    font-size: 12px;
    color: rgba($primary, 0.6);
  }

  &__edit-icon {
    margin-left: auto;
    color: rgba($primary, 0.3);
  }

  &__feedback {
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    color: rgba($primary, 0.6);
    margin: 6px 0 0;
    font-style: italic;
  }
}
</style>
