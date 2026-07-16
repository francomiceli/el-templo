<template>
  <!-- D-P1: salteable → SIN persistent -->
  <q-dialog v-model="show">
    <q-card class="rating-dialog">
      <q-card-section class="rating-dialog__body">
        <h3 class="rating-dialog__title">{{ title }}</h3>

        <div class="rating-dialog__row">
          <span class="rating-dialog__label">La clase</span>
          <q-rating
            v-model="classStars"
            size="2.2em"
            color="primary"
            icon="star_border"
            icon-selected="star"
            :max="5"
            no-reset
          />
        </div>

        <div class="rating-dialog__row">
          <span class="rating-dialog__label">El profe</span>
          <q-rating
            v-model="stars"
            size="2.2em"
            color="primary"
            icon="star_border"
            icon-selected="star"
            :max="5"
            no-reset
          />
        </div>

        <q-input
          v-model="comment"
          class="rating-dialog__comment"
          type="textarea"
          autogrow
          dark
          outlined
          counter
          maxlength="280"
          label="Comentario (opcional)"
        />

        <p class="rating-dialog__helper">Tu opinión es anónima y nos ayuda a mejorar las clases.</p>
      </q-card-section>

      <q-card-actions class="rating-dialog__actions">
        <q-btn
          unelevated
          no-caps
          class="rating-dialog__primary full-width"
          :disable="stars < 1 || classStars < 1"
          :loading="submitting"
          label="Enviar puntuación"
          @click="onSubmit"
        />
        <q-btn
          flat
          no-caps
          dense
          class="rating-dialog__secondary"
          :disable="submitting"
          label="Ahora no"
          @click="onSkip"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { Preferences } from '@capacitor/preferences'
import { useAuthStore } from 'stores/useAuthStore'
import { useRatingsApi, type PendingRating } from 'src/composables/useRatingsApi'
import { proposalPromptWillShow } from 'src/composables/useImprovementProposalsApi'
import { createLogger } from 'src/utils/logger'

const log = createLogger('RatingPromptDialog')
const $q = useQuasar()
const authStore = useAuthStore()
const { getPendingRating, submitRating } = useRatingsApi()

const show = ref(false)
const submitting = ref(false)
const stars = ref(0)
const classStars = ref(0)
const comment = ref('')
const pending = ref<PendingRating | null>(null)

// Título class-framed (alrededor de la actividad), NUNCA datos del profe (D-A3).
const title = computed(() => {
  const activity = pending.value?.activityName?.trim()
  return activity ? `¿Cómo estuvo tu clase de ${activity}?` : '¿Cómo estuvo tu clase?'
})

// One-shot (D-P2): key versionado por clase (sessionDate + scheduleId).
function resolvedKey(p: PendingRating): string {
  return `rating_resolved_v1_${p.sessionDate}_${p.scheduleId}`
}

async function markResolved(p: PendingRating): Promise<void> {
  await Preferences.set({ key: resolvedKey(p), value: '1' })
}

async function shouldShow(): Promise<boolean> {
  if (!authStore.isAuthenticated) return false

  // Un solo popup automático por apertura: si el de propuestas de mejora va a
  // mostrarse, la puntuación le cede el turno (la clase pendiente sigue
  // vigente dentro de su ventana de 48h para la próxima apertura).
  if (await proposalPromptWillShow()) return false

  const result = await getPendingRating()
  if (!result) return false

  // Si ya fue resuelta en este dispositivo (saltear/enviar previo) → no re-pedir.
  const { value: resolved } = await Preferences.get({ key: resolvedKey(result) })
  if (resolved === '1') return false

  pending.value = result
  return true
}

async function evaluate(): Promise<void> {
  try {
    if (await shouldShow()) {
      stars.value = 0
      classStars.value = 0
      comment.value = ''
      show.value = true
    }
  } catch (err: unknown) {
    log.error('Failed to evaluate pending rating', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function onSkip(): Promise<void> {
  log.info('Rating prompt skipped')
  if (pending.value) await markResolved(pending.value)
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

// Dispara al login / al volver a la app ya autenticado.
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) void evaluate()
  },
  { immediate: true },
)
</script>

<style lang="scss" scoped>
@import 'src/css/brand';

$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal: #2e2a26;

.rating-dialog {
  width: 100%;
  max-width: 340px;
  background: $charcoal;
  color: $cream;
  border-radius: 16px;
  border-top: 2px solid rgba($terracotta, 0.6);
  padding: 8px 4px 16px;
}

.rating-dialog__body {
  text-align: center;
  padding-top: 16px;
}

.rating-dialog__title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: 0.04em;
  margin: 0 0 16px 0;
  color: $cream;
}

.rating-dialog__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 4px 12px;
}

.rating-dialog__label {
  font-family: 'Geologica', sans-serif;
  font-weight: 500;
  font-size: 0.9375rem;
  color: rgba($cream, 0.85);
}

.rating-dialog__comment {
  margin-bottom: 12px;
  text-align: left;
}

.rating-dialog__helper {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: rgba($cream, 0.65);
  margin: 0;
}

.rating-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 20px 4px;
}

.rating-dialog__primary {
  background: linear-gradient(135deg, $terracotta 0%, #ad6540 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  letter-spacing: 0.12em;
  padding: 12px 0;
  border-radius: 8px;
}

.rating-dialog__secondary {
  color: rgba($cream, 0.55) !important;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  margin-top: 4px;
}
</style>
