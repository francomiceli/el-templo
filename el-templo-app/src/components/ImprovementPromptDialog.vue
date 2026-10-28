<template>
  <!-- Salteable → SIN persistent (mismo criterio que RatingPromptDialog) -->
  <q-dialog v-model="show">
    <PremiumDialogCard kicker="El Templo te escucha">
      <h3 class="pd-title">{{ title }}</h3>
      <p class="pd-text">{{ bodyText }}</p>

      <q-input
        v-model="proposal"
        class="pd-area"
        type="textarea"
        autogrow
        dark
        outlined
        counter
        maxlength="1000"
        label="Tu sugerencia"
      />

      <p class="pd-help">Tu sugerencia es anónima. Leemos cada una.</p>

      <div class="pd-acts">
        <q-btn
          unelevated
          no-caps
          class="pd-cta"
          :disable="proposal.trim().length === 0"
          :loading="submitting"
          :label="buttonText"
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
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { useImprovementProposalsApi } from 'src/composables/useImprovementProposalsApi'
import { extractError, isExpectedClientError } from 'src/utils/extract-error'
import { createLogger } from 'src/utils/logger'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'

const log = createLogger('ImprovementPromptDialog')
const $q = useQuasar()
const avisosStore = useAvisosStore()
const { submitProposal } = useImprovementProposalsApi()

const show = ref(false)
const submitting = ref(false)
const proposal = ref('')

// Copy del aviso de sistema `improvement_prompt` (D-09), con fallback al
// hardcode viejo por si el servidor no lo trae (defensivo, L4).
const title = computed(() => {
  const p = avisosStore.prompt
  return p && p.kind === 'improvement' ? p.aviso.title : '¿Qué mejorarías de El Templo?'
})

const bodyText = computed(() => {
  const p = avisosStore.prompt
  return p && p.kind === 'improvement'
    ? p.aviso.body
    : 'El equipo está escuchando: contanos qué te gustaría para darte la mejor experiencia.'
})

const buttonText = computed(() => {
  const p = avisosStore.prompt
  return p && p.kind === 'improvement' ? p.aviso.buttonText : 'Enviar sugerencia'
})

function currentAvisoId(): number | null {
  const p = avisosStore.prompt
  return p ? p.aviso.id : null
}

function onSkip(): void {
  log.info('Proposal prompt skipped')
  const avisoId = currentAvisoId()
  if (avisoId) void avisosStore.reportDismissed(avisoId)
  show.value = false
}

async function onSubmit(): Promise<void> {
  const trimmed = proposal.value.trim()
  if (!trimmed) return
  submitting.value = true
  try {
    await submitProposal(trimmed)
    const avisoId = currentAvisoId()
    if (avisoId) void avisosStore.reportClicked(avisoId)
    show.value = false
    $q.notify({ type: 'positive', message: '¡Gracias! Tu sugerencia fue enviada al equipo.' })
  } catch (err: unknown) {
    const message = extractError(err, 'No pudimos enviar tu sugerencia. Probá de nuevo en un rato.')
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

// El servidor ya decidió que hoy toca la propuesta de mejora (D-06/D-07/D-09):
// esta vista solo reacciona al getter del store, sin evaluar nada por su cuenta.
watch(
  () => avisosStore.isImprovement,
  (isImprovement) => {
    if (isImprovement) {
      proposal.value = ''
      show.value = true
    }
  },
  { immediate: true },
)
</script>
