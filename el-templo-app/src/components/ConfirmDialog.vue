<template>
  <q-dialog ref="dialogRef" :persistent="persistent" @hide="onDialogHide">
    <PremiumDialogCard tone="light">
      <h3 class="pd-title">{{ title }}</h3>
      <p class="pd-text">{{ message }}</p>
      <div class="pd-acts">
        <q-btn
          unelevated
          no-caps
          class="pd-cta"
          :class="{ 'pd-cta--neg': destructive }"
          :label="okLabel"
          @click="onDialogOK()"
        />
        <q-btn flat no-caps dense class="pd-skip" :label="cancelLabel" @click="onDialogCancel" />
      </div>
    </PremiumDialogCard>
  </q-dialog>
</template>

<script setup lang="ts">
/**
 * Confirmación con el estilo de los diálogos de trámite (`PremiumDialogCard tone="light"`, sketch
 * 012 A): primario terracota con destello, o rojo sin destello si la acción es destructiva, y el
 * secundario como link. Se abre con `confirmDialog()` (`src/utils/confirm-dialog.ts`) y responde
 * igual que `$q.dialog`: `.onOk()`, `.onCancel()`, `.onDismiss()`.
 */
import { useDialogPluginComponent } from 'quasar'
import PremiumDialogCard from './PremiumDialogCard.vue'

withDefaults(
  defineProps<{
    title: string
    message: string
    okLabel: string
    cancelLabel?: string
    /** Acción que pierde algo (salir sin guardar, reiniciar): botón rojo sin destello */
    destructive?: boolean
    persistent?: boolean
  }>(),
  { cancelLabel: 'Cancelar', destructive: false, persistent: true },
)

defineEmits([...useDialogPluginComponent.emits])

const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent()
</script>
