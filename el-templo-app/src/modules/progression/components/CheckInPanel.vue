<template>
  <!-- Sketch 008 A ("Píldora"): pregunta con ícono salvia + control segmentado. Completo: el
       consejo del día según las respuestas (antes era un chip de la card de hoy). -->
  <section class="check-in-panel" aria-live="polite">
    <!-- Completo: las tres respondidas y no se está editando (L42: sale de los datos del día) -->
    <template v-if="collapsed">
      <div class="check-in-panel__head">
        <span class="check-in-panel__title">Registro del día</span>
        <button type="button" class="check-in-panel__link" @click="startEditing">
          Editar registro
        </button>
      </div>
      <p class="check-in-panel__advice" :class="`check-in-panel__advice--${advice.tone}`">
        <span class="check-in-panel__advice-ico" aria-hidden="true">
          <q-icon :name="advice.tone === 'ok' ? 'check' : 'self_improvement'" />
        </span>
        {{ advice.text }}
      </p>
    </template>

    <!-- Una pregunta por vez -->
    <template v-else-if="current">
      <div class="check-in-panel__head">
        <span class="check-in-panel__title">Registro del día</span>
        <span class="check-in-panel__steps" role="img" :aria-label="progressLabel">
          <i
            v-for="(on, i) in steps"
            :key="i"
            :class="{ 'check-in-panel__step--on': on }"
            class="check-in-panel__step"
          />
        </span>
      </div>

      <!-- Paso de zona del cuerpo (molestia leve/moderada) -->
      <template v-if="pendingValue !== null">
        <div class="check-in-panel__q">
          <span class="check-in-panel__ico" aria-hidden="true">
            <q-icon :name="current.icon" />
          </span>
          <span class="check-in-panel__question">¿Dónde?</span>
          <button
            type="button"
            class="check-in-panel__link check-in-panel__back"
            :disabled="submitting"
            @click="pendingValue = null"
          >
            volver
          </button>
        </div>
        <div class="check-in-panel__seg check-in-panel__seg--areas">
          <button
            v-for="area in BODY_AREA_OPTIONS"
            :key="area.value"
            type="button"
            class="check-in-panel__opt"
            :disabled="submitting"
            @click="choose(current, pendingValue, area.value)"
          >
            {{ area.label }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="check-in-panel__q">
          <span class="check-in-panel__ico" aria-hidden="true">
            <q-icon :name="current.icon" />
          </span>
          <span class="check-in-panel__question">{{ current.question }}</span>
        </div>
        <div class="check-in-panel__seg">
          <button
            v-for="option in current.options"
            :key="option.value"
            type="button"
            class="check-in-panel__opt"
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
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { createLogger } from 'src/utils/logger'
import { BODY_AREA_OPTIONS } from '../types'
import type { CheckInQuestionConfig } from '../types'
import {
  answeredCount,
  checkInAdvice,
  nextUnanswered,
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

/** Tres rayitas de progreso: respondida (o ya pasada si se está editando). */
const steps = computed(() =>
  props.questions.map((q, i) => (editing.value ? i < editIndex.value : !!props.answers[q.type])),
)

/** Consejo del día con el registro completo (energía baja > molestia > sueño > todo bien). */
const advice = computed(() => checkInAdvice(props.answers))

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

// Valores del sketch 008 A sin variable propia en la app. Salvia = bienestar, sin azul.
$border: #e5dbcd;
$ink: #2c2318;
$ink-2: #6b6459;
$terra: #96593a;
$sand: #f3ede4;
$sage: #3f6a47; // 6.0:1 sobre blanco; blanco sobre salvia 6.0:1
$sage-tint: #e9f0e6; // salvia sobre el tinte 5.4:1
// Consejo del día: todo bien (salvia) o cuidate (ocre).
$good-bg: $sage-tint;
$good-fg: $sage;
$mid-bg: #f6efdc;
$mid-fg: #7d6520;

// Misma card que Novedades y Tus sesiones (borde + sombra cálida).
.check-in-panel {
  background: #fff;
  border: 1px solid $border;
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba($terra, 0.08);
  padding: 12px 14px 14px;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 24px;
  }

  &__title {
    @include mt-block-title;
  }

  &__steps {
    display: flex;
    gap: 4px;
  }

  &__step {
    width: 14px;
    height: 4px;
    border-radius: 2px;
    background: $border;

    &--on {
      background: $sage;
    }
  }

  &__q {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  &__ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: $sage-tint;
    color: $sage;
    font-size: 16px;
  }

  &__question {
    font-family: 'Geologica', sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: $ink;
  }

  // Control segmentado: una píldora con las opciones adentro.
  &__seg {
    display: flex;
    gap: 3px;
    margin-top: 10px;
    padding: 3px;
    border-radius: 999px;
    background: $sand;

    &--areas {
      overflow-x: auto;
      scrollbar-width: none;

      &::-webkit-scrollbar {
        display: none;
      }

      .check-in-panel__opt {
        flex: 0 0 auto;
        padding: 0 14px;
      }
    }
  }

  &__opt {
    flex: 1;
    min-width: 0;
    height: 38px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: $ink;
    font-family: 'Geologica', sans-serif;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;

    // Ninguna opción arranca elegida, tampoco al editar (UAT 2026-10-16). El hover solo con
    // mouse: en touch queda "pegado" y la opción de la pregunta siguiente parecía elegida.
    @media (hover: hover) {
      &:hover:not(:disabled) {
        background: rgba(#fff, 0.7);
      }
    }

    // Respuesta al toque mientras se aprieta (al soltar ya pasa a la pregunta siguiente).
    &:active:not(:disabled) {
      background: $sage;
      color: #fff;
    }

    &:disabled {
      cursor: default;
      opacity: 0.6;
    }

    &:focus-visible {
      outline: 2px solid $sage;
      outline-offset: 1px;
    }

    @media (prefers-reduced-motion: no-preference) {
      transition:
        background-color 0.15s ease,
        color 0.15s ease;
    }
  }

  &__link {
    flex: none;
    min-width: 44px;
    min-height: 32px;
    padding: 0 2px;
    border: 0;
    background: none;
    color: $terra;
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  &__back {
    margin-left: auto;
  }

  &__error {
    margin: 10px 0 0;
    font-size: 13px;
    color: $terra;
  }

  // Consejo del día: ícono en círculo + frase. Salvia si está todo bien, ocre si conviene
  // cuidarse (texto sobre blanco: salvia 6.0:1, ocre 5.8:1).
  &__advice {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0 0;
    font-family: 'Geologica', sans-serif;
    font-size: 15px;
    font-weight: 600;

    &--ok {
      color: $good-fg;
    }

    &--care {
      color: $mid-fg;
    }
  }

  &__advice-ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    font-size: 16px;

    .check-in-panel__advice--ok & {
      background: $good-bg;
    }

    .check-in-panel__advice--care & {
      background: $mid-bg;
    }
  }
}
</style>
