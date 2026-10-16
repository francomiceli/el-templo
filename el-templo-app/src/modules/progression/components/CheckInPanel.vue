<template>
  <section class="check-in-panel" aria-live="polite">
    <!-- Colapsado: las tres respondidas y no se está editando (L42: sale de los datos del día) -->
    <div v-if="collapsed" class="check-in-panel__done">
      <span class="check-in-panel__tick" aria-hidden="true">
        <q-icon name="check" size="14px" />
      </span>
      <span class="check-in-panel__done-text">
        <b class="check-in-panel__done-title">Registro del día</b> · {{ summaryText }}
      </span>
      <button type="button" class="check-in-panel__edit" @click="startEditing">editar</button>
    </div>

    <!-- Una pregunta por vez -->
    <div v-else-if="current" class="check-in-panel__card">
      <div class="check-in-panel__title">
        Registro del día
        <span class="check-in-panel__aux">{{ progressLabel }}</span>
      </div>

      <!-- Paso de zona del cuerpo (molestia leve/moderada) -->
      <template v-if="pendingValue !== null">
        <div class="check-in-panel__question">¿Dónde?</div>
        <div class="check-in-panel__areas">
          <button
            v-for="area in BODY_AREA_OPTIONS"
            :key="area.value"
            type="button"
            class="check-in-panel__btn"
            :disabled="submitting"
            @click="choose(current, pendingValue, area.value)"
          >
            {{ area.label }}
          </button>
        </div>
        <button
          type="button"
          class="check-in-panel__back"
          :disabled="submitting"
          @click="pendingValue = null"
        >
          Volver
        </button>
      </template>

      <template v-else>
        <div class="check-in-panel__question">{{ current.question }}</div>
        <div class="check-in-panel__options">
          <button
            v-for="option in current.options"
            :key="option.value"
            type="button"
            class="check-in-panel__btn"
            :class="{ 'check-in-panel__btn--selected': isSelected(current, option.value) }"
            :aria-pressed="isSelected(current, option.value)"
            :disabled="submitting"
            @click="onOption(current, option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </template>

      <p v-if="saveError" class="check-in-panel__error" role="alert">
        No pudimos guardar tu respuesta. Probá de nuevo.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { createLogger } from 'src/utils/logger'
import { BODY_AREA_OPTIONS } from '../types'
import type { CheckInQuestionConfig } from '../types'
import {
  answeredCount,
  nextUnanswered,
  summaryParts,
  type CheckInAnswers,
} from '../utils/check-in-summary'

const log = createLogger('CheckInPanel')

const props = defineProps<{
  /** Preguntas ya ordenadas (soreness primero, el resto rota por día). */
  questions: CheckInQuestionConfig[]
  answers: CheckInAnswers
  /**
   * Guarda una respuesta (mismo endpoint y payload que siempre) y devuelve si se guardó.
   * Es una función y no un emit para que el panel NO avance si el guardado falla (L41).
   */
  save: (type: CheckInQuestionConfig['type'], value: string, bodyArea?: string) => Promise<boolean>
}>()

const editing = ref(false)
const editIndex = ref(0)
// Valor elegido que necesita zona del cuerpo: no se guarda hasta elegir la zona.
const pendingValue = ref<string | null>(null)
const submitting = ref(false)
const saveError = ref(false)

const collapsed = computed(
  () =>
    !editing.value &&
    props.questions.length > 0 &&
    nextUnanswered(props.questions, props.answers) === null,
)

const current = computed((): CheckInQuestionConfig | null => {
  if (editing.value) return props.questions[editIndex.value] ?? null
  return nextUnanswered(props.questions, props.answers)
})

const progressLabel = computed(() => {
  const n = editing.value ? editIndex.value + 1 : answeredCount(props.questions, props.answers) + 1
  return `${Math.min(n, props.questions.length)} de ${props.questions.length}`
})

const summaryText = computed(() => summaryParts(props.questions, props.answers).join(' · '))

function isSelected(q: CheckInQuestionConfig, value: string): boolean {
  return editing.value && props.answers[q.type]?.value === value
}

function startEditing() {
  editing.value = true
  editIndex.value = 0
  pendingValue.value = null
  saveError.value = false
}

function onOption(q: CheckInQuestionConfig, value: string) {
  if (submitting.value) return
  saveError.value = false
  if (q.needsBodyArea(value)) {
    pendingValue.value = value
    return
  }
  void choose(q, value)
}

async function choose(q: CheckInQuestionConfig, value: string, bodyArea?: string) {
  if (submitting.value) return
  submitting.value = true
  saveError.value = false
  let ok = false
  try {
    ok = await props.save(q.type, value, bodyArea)
  } catch (err: unknown) {
    log.warn('Check-in save threw', { error: err instanceof Error ? err.message : String(err) })
    ok = false
  } finally {
    submitting.value = false
  }
  if (!ok) {
    // No avanzamos: la respuesta no quedó guardada, se puede reintentar.
    saveError.value = true
    return
  }
  pendingValue.value = null
  if (editing.value) {
    editIndex.value += 1
    if (editIndex.value >= props.questions.length) editing.value = false
  }
}
</script>

<style scoped lang="scss">
@import 'src/css/brand';

.check-in-panel {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(44, 35, 24, 0.06);

  &__title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    font-family: 'Montserrat', sans-serif;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: $mt-block-title-color;
  }

  &__aux {
    margin-left: auto;
    font-family: 'Geologica', sans-serif;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
    color: #6b6459;
  }

  &__question {
    margin: 2px 0 12px;
    font-family: 'Geologica', sans-serif;
    font-size: 16px;
    font-weight: 600;
    color: #2c2318;
  }

  &__options,
  &__areas {
    display: flex;
    gap: 8px;
  }

  &__areas {
    flex-wrap: wrap;

    .check-in-panel__btn {
      flex: 1 1 calc(33.333% - 8px);
    }
  }

  &__btn {
    flex: 1;
    height: 44px;
    border-radius: 12px;
    border: 1.5px solid #96593a;
    background: #fff;
    color: #96593a;
    font-family: 'Geologica', sans-serif;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: #f8f1ea;
    }

    &--selected {
      background: #96593a;
      color: #fff;
    }

    &:disabled {
      cursor: default;
      opacity: 0.6;
    }

    @media (prefers-reduced-motion: no-preference) {
      transition:
        background-color 0.15s ease,
        color 0.15s ease;
    }
  }

  &__back {
    min-height: 44px;
    margin-top: 4px;
    padding: 0;
    border: 0;
    background: none;
    color: #96593a;
    font-family: 'Geologica', sans-serif;
    font-size: 14px;
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  &__error {
    margin: 10px 0 0;
    font-size: 13px;
    color: #96593a;
  }

  &__done {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    color: #2c2318;
  }

  &__tick {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #3b7249;
    color: #fff;
  }

  &__done-text {
    min-width: 0;
  }

  &__done-title {
    color: $mt-block-title-color;
  }

  &__edit {
    flex: none;
    min-width: 44px;
    min-height: 44px;
    margin-left: auto;
    padding: 0;
    border: 0;
    background: none;
    color: #96593a;
    font-family: 'Geologica', sans-serif;
    font-size: 14px;
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
}
</style>
