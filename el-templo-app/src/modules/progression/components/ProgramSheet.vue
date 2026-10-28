<template>
  <!-- Hoja inferior "Mi programa" (fase 199, D-03). Molde: ActivityInfoSheet (q-dialog position="bottom"),
       pero con hoja blanca clara. El contenido es ProgramProgressCard (selector de programa,
       bloques de contenido y aviso de renovación). -->
  <q-dialog :model-value="modelValue" position="bottom" @update:model-value="onUpdateModelValue">
    <q-card class="program-sheet">
      <div class="program-sheet__handle" />
      <h3 class="program-sheet__title">Tu programa</h3>
      <ProgramProgressCard
        v-if="progress"
        :progress="progress"
        @program-changed="emit('program-changed')"
      />
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
/**
 * L40: se cierra con el botón "atrás" de Android y no deja el scroll del body bloqueado.
 * - Atrás nativo: mientras la hoja está abierta se registra un listener `backButton` de
 *   Capacitor que la cierra (se quita al cerrar o al desmontar). Solo en plataforma nativa.
 * - Scroll: el bloqueo del body lo maneja QDialog y se libera al ocultarse o desmontarse;
 *   además cerramos la hoja si cambia la ruta, para que nunca quede abierta (ni el body
 *   bloqueado) tras navegar.
 */
import { onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { Capacitor } from '@capacitor/core'
import ProgramProgressCard from 'src/modules/programs/components/ProgramProgressCard.vue'
import type { MemberEnrollmentProgress } from 'src/modules/programs/types'
import { createLogger } from 'src/utils/logger'

const log = createLogger('ProgramSheet')

const props = defineProps<{
  modelValue: boolean
  progress: MemberEnrollmentProgress | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'program-changed': []
}>()

const route = useRoute()

let backHandle: PluginListenerHandle | null = null
// Evita registrar dos veces si el padre abre/cierra rápido mientras addListener resuelve.
let listenerToken = 0

function onUpdateModelValue(value: boolean): void {
  emit('update:modelValue', value)
}

function close(): void {
  emit('update:modelValue', false)
}

async function attachBackListener(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const token = ++listenerToken
  try {
    const handle = await App.addListener('backButton', () => {
      close()
    })
    if (token !== listenerToken) {
      // Se cerró (o desmontó) mientras se registraba: soltarlo enseguida.
      await handle.remove()
      return
    }
    backHandle = handle
  } catch (err: unknown) {
    log.warn('No se pudo registrar el botón atrás', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function detachBackListener(): void {
  listenerToken++
  if (backHandle) {
    void backHandle.remove()
    backHandle = null
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void attachBackListener()
    else detachBackListener()
  },
  { immediate: true },
)

watch(
  () => route.fullPath,
  () => {
    if (props.modelValue) close()
  },
)

onBeforeUnmount(() => {
  detachBackListener()
})
</script>

<style scoped lang="scss">
.program-sheet {
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  margin: 0 auto;
  overflow-y: auto;
  background: #ffffff;
  border-radius: 20px 20px 0 0;
  padding: 8px 16px 24px;
  box-shadow: none;

  &__handle {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: #d9cfc1;
    margin: 4px auto 0;
  }

  &__title {
    margin: 16px 0 12px;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 18px;
    color: #2c2318;
  }
}
</style>
