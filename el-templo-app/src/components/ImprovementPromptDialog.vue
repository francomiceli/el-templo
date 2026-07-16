<template>
  <!-- Salteable → SIN persistent (mismo criterio que RatingPromptDialog) -->
  <q-dialog v-model="show">
    <q-card class="proposal-dialog">
      <q-card-section class="proposal-dialog__body">
        <h3 class="proposal-dialog__title">Queremos escucharte</h3>
        <p class="proposal-dialog__question">
          ¿Qué mejora querés proponer en la sucursal a la que asistís?
        </p>

        <q-input
          v-model="proposal"
          class="proposal-dialog__input"
          type="textarea"
          autogrow
          dark
          outlined
          counter
          maxlength="1000"
          label="Tu propuesta"
        />

        <p class="proposal-dialog__helper">
          El equipo lee todas las propuestas. Las que más se repiten se priorizan.
        </p>
      </q-card-section>

      <q-card-actions class="proposal-dialog__actions">
        <q-btn
          unelevated
          no-caps
          class="proposal-dialog__primary full-width"
          :disable="proposal.trim().length === 0"
          :loading="submitting"
          label="Enviar propuesta"
          @click="onSubmit"
        />
        <q-btn
          flat
          no-caps
          dense
          class="proposal-dialog__secondary"
          :disable="submitting"
          label="Ahora no"
          @click="onSkip"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/useAuthStore'
import {
  evaluateProposalPrompt,
  markProposalPromptShown,
  resetProposalPromptEvaluation,
  useImprovementProposalsApi,
} from 'src/composables/useImprovementProposalsApi'
import { extractError, isExpectedClientError } from 'src/utils/extract-error'
import { createLogger } from 'src/utils/logger'

const log = createLogger('ImprovementPromptDialog')
const $q = useQuasar()
const authStore = useAuthStore()
const { submitProposal } = useImprovementProposalsApi()

const show = ref(false)
const submitting = ref(false)
const proposal = ref('')

async function evaluate(): Promise<void> {
  try {
    const status = await evaluateProposalPrompt()
    if (!status) return

    // "Mostrado ahora" se marca al abrir: enviar o saltear, el re-prompt
    // recién vuelve a los 7 días — y deja de aparecer al primer envío
    // (el server corta shouldPrompt).
    await markProposalPromptShown(status.campaign)
    proposal.value = ''
    show.value = true
  } catch (err: unknown) {
    log.error('Failed to evaluate proposal prompt', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function onSkip(): void {
  log.info('Proposal prompt skipped')
  show.value = false
}

async function onSubmit(): Promise<void> {
  const trimmed = proposal.value.trim()
  if (!trimmed) return
  submitting.value = true
  try {
    await submitProposal(trimmed)
    show.value = false
    $q.notify({ type: 'positive', message: '¡Gracias! Tu propuesta fue enviada al equipo.' })
  } catch (err: unknown) {
    const message = extractError(err, 'No pudimos enviar tu propuesta. Probá de nuevo en un rato.')
    if (isExpectedClientError(err)) {
      log.warn('Proposal submit rejected', { message })
    } else {
      log.error('Failed to submit proposal', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    $q.notify({ type: 'negative', message })
  } finally {
    submitting.value = false
  }
}

// Dispara al login / al volver a la app ya autenticado (mismo trigger que
// RatingPromptDialog, que cede esta apertura si este popup va a mostrarse).
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) {
      void evaluate()
    } else {
      resetProposalPromptEvaluation()
    }
  },
  { immediate: true },
)
</script>

<style lang="scss" scoped>
@import 'src/css/brand';

$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal: #2e2a26;

.proposal-dialog {
  width: 100%;
  max-width: 340px;
  background: $charcoal;
  color: $cream;
  border-radius: 16px;
  border-top: 2px solid rgba($terracotta, 0.6);
  padding: 8px 4px 16px;
}

.proposal-dialog__body {
  text-align: center;
  padding-top: 16px;
}

.proposal-dialog__title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: 0.04em;
  margin: 0 0 8px 0;
  color: $cream;
}

.proposal-dialog__question {
  font-family: 'Geologica', sans-serif;
  font-weight: 500;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: rgba($cream, 0.85);
  margin: 0 4px 16px;
}

.proposal-dialog__input {
  margin-bottom: 12px;
  text-align: left;
}

.proposal-dialog__helper {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: rgba($cream, 0.65);
  margin: 0;
}

.proposal-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 20px 4px;
}

.proposal-dialog__primary {
  background: linear-gradient(135deg, $terracotta 0%, #ad6540 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  letter-spacing: 0.12em;
  padding: 12px 0;
  border-radius: 8px;
}

.proposal-dialog__secondary {
  color: rgba($cream, 0.55) !important;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  margin-top: 4px;
}
</style>
