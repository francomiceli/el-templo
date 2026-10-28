<template>
  <!-- D-P1: salteable → SIN persistent -->
  <q-dialog v-model="show">
    <PremiumDialogCard kicker="Tu opinión">
      <h3 class="pd-title">{{ title }}</h3>

      <span class="pd-label">La clase</span>
      <q-rating
        v-model="classStars"
        class="pd-rating"
        size="34px"
        icon="star_border"
        icon-selected="star"
        :max="5"
        no-reset
      />

      <span class="pd-label">El profe</span>
      <q-rating
        v-model="stars"
        class="pd-rating"
        size="34px"
        icon="star_border"
        icon-selected="star"
        :max="5"
        no-reset
      />

      <q-input
        v-model="comment"
        class="pd-area"
        type="textarea"
        autogrow
        dark
        outlined
        counter
        maxlength="280"
        label="Comentario (opcional)"
      />

      <p class="pd-help">Tu opinión es anónima y nos ayuda a mejorar las clases.</p>

      <div class="pd-acts">
        <q-btn
          unelevated
          no-caps
          class="pd-cta"
          :disable="stars < 1 || classStars < 1"
          :loading="submitting"
          label="Enviar puntuación"
          @click="onSubmit"
        />
        <q-btn
          flat
          no-caps
          dense
          class="pd-skip"
          :disable="submitting"
          label="Ahora no"
          @click="onSkip"
        />
      </div>
    </PremiumDialogCard>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { Preferences } from '@capacitor/preferences'
import { useAvisosStore, type PendingRatingPrompt } from 'src/stores/useAvisosStore'
import { useRatingsApi } from 'src/composables/useRatingsApi'
import { createLogger } from 'src/utils/logger'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'

const log = createLogger('RatingPromptDialog')
const $q = useQuasar()
const avisosStore = useAvisosStore()
const { submitRating } = useRatingsApi()

const show = ref(false)
const submitting = ref(false)
const stars = ref(0)
const classStars = ref(0)
const comment = ref('')
const pending = ref<PendingRatingPrompt | null>(null)

// Título class-framed (alrededor de la actividad), NUNCA datos del profe (D-A3).
const title = computed(() => {
  const activity = pending.value?.activityName?.trim()
  return activity ? `¿Cómo estuvo tu clase de ${activity}?` : '¿Cómo estuvo tu clase?'
})

// One-shot (D-P2): key versionado por clase (sessionDate + scheduleId). El
// servidor decide QUE hoy toca calificación (D-06/D-07), pero NO trackea
// "resuelta esta clase" — esa guarda sigue siendo local (fase 143 D-P2).
function resolvedKey(p: PendingRatingPrompt): string {
  return `rating_resolved_v1_${p.sessionDate}_${p.scheduleId}`
}

async function markResolved(p: PendingRatingPrompt): Promise<void> {
  await Preferences.set({ key: resolvedKey(p), value: '1' })
}

function currentAvisoId(): number | null {
  const p = avisosStore.prompt
  return p ? p.aviso.id : null
}

async function evaluate(): Promise<void> {
  const current = avisosStore.prompt
  if (!current || current.kind !== 'rating') return

  try {
    const { value: resolved } = await Preferences.get({ key: resolvedKey(current.pending) })
    if (resolved === '1') return

    pending.value = current.pending
    stars.value = 0
    classStars.value = 0
    comment.value = ''
    show.value = true
  } catch (err: unknown) {
    log.error('Failed to evaluate pending rating', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function onSkip(): Promise<void> {
  log.info('Rating prompt skipped')
  if (pending.value) await markResolved(pending.value)
  const avisoId = currentAvisoId()
  if (avisoId) void avisosStore.reportDismissed(avisoId)
  show.value = false
}

async function onSubmit(): Promise<void> {
  if (!pending.value || stars.value < 1 || classStars.value < 1) return
  submitting.value = true
  try {
    const trimmed = comment.value.trim()
    await submitRating({
      sessionDate: pending.value.sessionDate,
      scheduleId: pending.value.scheduleId,
      stars: stars.value,
      classStars: classStars.value,
      ...(trimmed ? { comment: trimmed } : {}),
    })
    await markResolved(pending.value)
    const avisoId = currentAvisoId()
    if (avisoId) void avisosStore.reportClicked(avisoId)
    show.value = false
    $q.notify({ type: 'positive', message: '¡Gracias por tu puntuación!' })
  } catch (err: unknown) {
    log.error('Failed to submit rating', {
      error: err instanceof Error ? err.message : String(err),
    })
    $q.notify({
      type: 'negative',
      message: 'No pudimos guardar tu puntuación. Probá de nuevo en un momento.',
    })
  } finally {
    submitting.value = false
  }
}

// El servidor ya decidió que hoy toca calificación (D-06/D-07): esta vista
// solo reacciona al getter del store, sin evaluar nada por su cuenta.
watch(
  () => avisosStore.isRating,
  (isRating) => {
    if (isRating) void evaluate()
  },
  { immediate: true },
)
</script>
