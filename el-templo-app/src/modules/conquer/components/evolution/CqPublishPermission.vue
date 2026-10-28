<template>
  <div class="cq-pub cq-card">
    <label class="cq-pub__check">
      <input
        type="checkbox"
        :checked="enabled"
        :disabled="busy"
        @change="onToggleEnabled(($event.target as HTMLInputElement).checked, $event)"
      />
      <span>Autorizo a El Templo a publicar mi antes y después</span>
    </label>
    <label class="cq-pub__check" :class="{ 'cq-pub__check--off': !enabled }">
      <input
        type="checkbox"
        :checked="noFace"
        :disabled="busy || !enabled"
        @change="onToggleNoFace(($event.target as HTMLInputElement).checked, $event)"
      />
      <span>Publicar sin mi cara</span>
    </label>
    <p class="cq-sub cq-pub__hint" :aria-busy="busy ? 'true' : undefined">
      {{ busy ? 'Guardando…' : 'Lo podés retirar cuando quieras.' }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useQuasar } from 'quasar'
import { createLogger } from 'src/utils/logger'
import { ConquerApiError, isConquerCanceled, useConquerApi } from '../../composables/useConquerApi'
import type { PublishPermission } from '../../types'

// Fase 201 §6, §7.1: permiso de publicación del antes y después, con "sin cara", retirable. Cada
// cambio se guarda al tocarlo (`PUT /publish-permission`); la casilla refleja SIEMPRE lo que guardó
// el API (si falla, vuelve atrás y avisa). Retirar el permiso también apaga "sin cara".
const props = defineProps<{ enabled: boolean; noFace: boolean }>()
const emit = defineEmits<{ saved: [permission: PublishPermission] }>()

const log = createLogger('CqPublishPermission')
const $q = useQuasar()
const api = useConquerApi()
const busy = ref(false)

async function save(enabled: boolean, noFace: boolean, event: Event): Promise<void> {
  if (busy.value) return
  const box = event.target
  busy.value = true
  try {
    const saved = await api.setPublishPermission({ enabled, noFace: enabled ? noFace : false })
    emit('saved', saved)
  } catch (err: unknown) {
    if (isConquerCanceled(err)) return
    if (err instanceof ConquerApiError) {
      if (!err.isExpected) log.error('Failed to save publish permission', { status: err.status })
      $q.notify({ type: 'negative', message: err.message })
    } else {
      $q.notify({
        type: 'negative',
        message: 'No pudimos guardar tu autorización. Probá de nuevo.',
      })
    }
    // La casilla vuelve a lo que tiene guardado el API (el toque la había dado vuelta)
    if (box instanceof HTMLInputElement) box.checked = !box.checked
  } finally {
    busy.value = false
  }
}

function onToggleEnabled(checked: boolean, event: Event): void {
  void save(checked, props.noFace, event)
}

function onToggleNoFace(checked: boolean, event: Event): void {
  void save(props.enabled, checked, event)
}

onBeforeUnmount(() => {
  api.cleanup()
})
</script>

<style scoped lang="scss">
.cq-pub.cq-card {
  gap: 0;
}

.cq-pub__check {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  font-size: 14px;
  color: var(--cq-text);
  cursor: pointer;

  input {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    accent-color: var(--cq-night);
  }

  // Sin permiso, "sin cara" queda apagada: texto sólido más suave, no transparencia
  &--off {
    color: var(--cq-text-2);
    cursor: default;
  }
}

.cq-pub .cq-pub__hint {
  margin: 4px 0 0;
}
</style>
