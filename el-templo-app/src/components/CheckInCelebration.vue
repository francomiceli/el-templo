<template>
  <!-- Fase 214 (plan 28): celebración de asistencia (UI-SPEC, Pantalla 6, D-40, D-56, D-58, D-64).
       Pantalla completa sobre todo, incluida la barra de pestañas. Todo número sale de la respuesta
       del servidor: el "+N" puede ser menor que 5 (tope del día) y nunca va escrito a mano. Sin
       sonido ni vibración. -->
  <div
    class="cc-overlay"
    :class="{ 'cc-overlay--aura': hasAura }"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="kickerId"
  >
    <div class="cc-halo" aria-hidden="true" />

    <div class="cc-ring" aria-hidden="true">
      <q-icon name="check" size="44px" class="cc-ring__icon" />
    </div>

    <p :id="kickerId" class="cc-kicker">ASISTENCIA REGISTRADA</p>

    <template v-if="hasAura">
      <p class="cc-amount">+{{ auraAwarded }}</p>
      <p class="cc-label">AURA</p>
      <p v-if="auraTotal !== null" class="cc-total">
        Tu Aura: <span class="cc-total__spark" aria-hidden="true">✦</span>
        <span class="cc-total__num" aria-hidden="true">{{ formatAura(shownTotal) }}</span>
      </p>
    </template>
    <h2 v-else class="cc-title">¡Adentro!</h2>

    <p class="cc-place">{{ placeLine }}</p>

    <button ref="doneBtn" type="button" class="cc-cta" @click="emit('done')">Listo</button>

    <!-- Anuncio único para lector de pantalla: el número que cuenta va aria-hidden. -->
    <div class="cc-sr" aria-live="polite">{{ announcement }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { countUpSteps } from 'src/utils/count-up'
import { formatAura } from 'src/utils/aura-format'
import { prefersReducedMotion } from 'src/utils/reduced-motion'
import { DEFAULT_BRANCH_TZ } from 'src/utils/tz'

interface Props {
  /** Sede ya con el reemplazo "El Templo X" -> "Sede X". */
  branchName: string
  /** Instante del check-in (ISO). */
  checkedInAt: string
  /** Zona IANA de la sede para la hora. */
  timezone: string
  /** Aura que sumó este check-in; null o 0 = no acreditó. */
  auraAwarded: number | null
  /** Total ganado tras sumarla; null = no mostrar el total. */
  auraTotal: number | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ done: [] }>()

const kickerId = `cc-kicker-${useId()}`
const doneBtn = ref<HTMLButtonElement | null>(null)
const announcement = ref('')

const hasAura = computed(() => props.auraAwarded !== null && props.auraAwarded > 0)

// "HH:mm" del check-in en la zona de la sede; una zona o fecha inválida no rompe la pantalla.
function timeInZone(iso: string, tz: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date)
  try {
    return format(tz)
  } catch {
    return format(DEFAULT_BRANCH_TZ)
  }
}

const placeLine = computed(() => {
  const time = timeInZone(props.checkedInAt, props.timezone)
  return time ? `${props.branchName} · ${time}` : props.branchName
})

// Total que se ve: con movimiento arranca en `auraTotal - auraAwarded` y cuenta hasta el final a los
// 700 ms; con movimiento reducido (o sin Aura) aparece de una con el valor final.
const reduced = prefersReducedMotion()
const finalTotal = props.auraTotal ?? 0
const shownTotal = ref(
  !reduced && hasAura.value && props.auraTotal !== null
    ? props.auraTotal - (props.auraAwarded ?? 0)
    : finalTotal,
)

const COUNT_START_MS = 700
const COUNT_STEP_MS = 90
const COUNT_MAX_MS = 450

let startTimer: ReturnType<typeof setTimeout> | null = null
let stepTimer: ReturnType<typeof setInterval> | null = null

function stopTimers() {
  if (startTimer) {
    clearTimeout(startTimer)
    startTimer = null
  }
  if (stepTimer) {
    clearInterval(stepTimer)
    stepTimer = null
  }
}

function startCount() {
  if (props.auraTotal === null || props.auraAwarded === null) return
  const steps = countUpSteps(
    props.auraTotal - props.auraAwarded,
    props.auraTotal,
    COUNT_STEP_MS,
    COUNT_MAX_MS,
  )
  let i = 0
  stepTimer = setInterval(() => {
    const next = steps[i]
    if (next === undefined) {
      stopTimers()
      return
    }
    shownTotal.value = next
    i += 1
    if (i >= steps.length) stopTimers()
  }, COUNT_STEP_MS)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('done')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  // El diálogo es modal: el foco va a "Listo" desde el primer frame.
  void nextTick(() => {
    doneBtn.value?.focus()
    // Se rellena después de montar para que la región en vivo lo anuncie una sola vez.
    announcement.value =
      hasAura.value && props.auraTotal !== null
        ? `Asistencia registrada. Sumaste ${props.auraAwarded} de Aura. Tu Aura: ${formatAura(props.auraTotal)}.`
        : hasAura.value
          ? `Asistencia registrada. Sumaste ${props.auraAwarded} de Aura.`
          : `Asistencia registrada en ${props.branchName}.`
  })
  if (!reduced && hasAura.value && props.auraTotal !== null) {
    startTimer = setTimeout(() => {
      startTimer = null
      startCount()
    }, COUNT_START_MS)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  stopTimers()
})
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.cc-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: calc(24px + env(safe-area-inset-top, 0px)) calc(24px + env(safe-area-inset-right, 0px))
    calc(24px + env(safe-area-inset-bottom, 0px)) calc(24px + env(safe-area-inset-left, 0px));
  overflow: hidden;
  background: $pd-surface;
  text-align: center;
}

// Halo decorativo: dorado solo con Aura; sin Aura es neutro (el dorado es solo de Aura).
.cc-halo {
  position: absolute;
  top: 18%;
  left: 50%;
  width: 320px;
  height: 320px;
  margin-left: -160px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(240, 230, 214, 0.12), transparent 65%);
  opacity: 0.8;
  pointer-events: none;
}

.cc-overlay--aura .cc-halo {
  background: radial-gradient(circle, rgba(212, 180, 106, 0.32), transparent 65%);
}

.cc-ring {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background: $pd-sage;

  &__icon {
    color: #fff;
  }
}

.cc-overlay--aura .cc-ring {
  background: linear-gradient(135deg, #f5dd7e, $pd-gold 55%, #a8843a);

  .cc-ring__icon {
    color: $pd-surface;
  }
}

.cc-kicker {
  position: relative;
  margin: 16px 0 0;
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.2em;
  color: $pd-cream-2;
}

.cc-title {
  position: relative;
  margin: 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 22px;
  line-height: 1.2;
  color: $pd-cream;
}

.cc-amount {
  position: relative;
  margin: 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 800;
  font-size: 68px;
  line-height: 1;
  color: $pd-gold-bright;
}

.cc-label {
  position: relative;
  margin: 0;
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.24em;
  color: $pd-gold;
}

.cc-total {
  position: relative;
  margin: 16px 0 0;
  padding: 8px 16px;
  border-radius: 999px;
  background: rgba(240, 230, 214, 0.1);
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 15px;
  color: $pd-cream;

  &__spark {
    color: $pd-gold;
  }

  &__num {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: $pd-gold-bright;
  }
}

.cc-place {
  position: relative;
  margin: 8px 0 24px;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 15px;
  color: $pd-cream-3;
}

.cc-cta {
  @include pd-cta(48px);

  position: relative;
  width: auto;
  min-width: 200px;

  &:focus-visible {
    outline: 2px solid $pd-cream;
    outline-offset: 3px;
  }
}

// Región en vivo: fuera de la vista, pero presente para el lector de pantalla.
.cc-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@include pd-sheen-keyframes;

@keyframes cc-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes cc-pop {
  0% {
    transform: scale(0.4);
  }
  60% {
    transform: scale(1.12);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes cc-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// Dos ciclos de 3 s (.55 <-> 1) y queda en .8; no se repite al infinito.
@keyframes cc-breathe {
  0% {
    opacity: 0.55;
  }
  25% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
  75% {
    opacity: 1;
  }
  100% {
    opacity: 0.8;
  }
}

// Todo el movimiento va acá: con `prefers-reduced-motion: reduce` aparece todo de una y el halo
// queda fijo en .8. "Listo" funciona desde el primer frame (la animación nunca bloquea).
@media (prefers-reduced-motion: no-preference) {
  .cc-overlay {
    animation: cc-fade 200ms ease-out both;
  }

  .cc-halo {
    animation: cc-breathe 6s ease-in-out both;
  }

  .cc-ring {
    animation: cc-pop 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }

  .cc-kicker,
  .cc-title,
  .cc-amount,
  .cc-label,
  .cc-total,
  .cc-place,
  .cc-cta {
    animation: cc-rise 420ms ease-out both;
  }

  .cc-kicker {
    animation-delay: 150ms;
  }

  .cc-title {
    animation-delay: 300ms;
  }

  .cc-amount {
    animation-delay: 300ms;
  }

  .cc-label {
    animation-delay: 350ms;
  }

  .cc-total {
    animation-delay: 500ms;
  }

  .cc-place {
    animation-delay: 550ms;
  }

  .cc-cta {
    animation-delay: 650ms;
  }
}
</style>
