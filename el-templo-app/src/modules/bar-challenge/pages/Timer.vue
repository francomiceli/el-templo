<template>
  <q-page class="bar-challenge-timer">
    <div class="bar-challenge-timer__content">
      <div
        class="bar-challenge-timer__status"
        :class="{ 'bar-challenge-timer__status--success': isSuccess }"
      >
        {{ statusLabel }}
      </div>

      <div
        class="bar-challenge-timer__digits"
        :class="{ 'bar-challenge-timer__digits--success': isSuccess }"
      >
        {{ formatted }}
      </div>

      <div class="bar-challenge-timer__actions">
        <button
          class="bar-challenge-timer__btn bar-challenge-timer__btn--outline"
          type="button"
          @click="onTakePhoto"
        >
          <q-icon name="photo_camera" size="18px" />
          <span>Tomar foto</span>
        </button>

        <button
          class="bar-challenge-timer__btn bar-challenge-timer__btn--filled"
          type="button"
          @click="onFinalize"
        >
          <q-icon name="stop" size="18px" />
          <span>Finalizar</span>
        </button>
      </div>

      <p v-if="cameraError" class="bar-challenge-timer__camera-error" role="alert">
        {{ cameraError }}
      </p>
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * Phase 115 — Timer.vue
 *
 * Cronómetro fullscreen-dark del desafío. Operado por el staff.
 *
 * Decisiones clave:
 * - D-09: `setInterval(100ms)` solo dispara el recálculo; la fuente de verdad
 *   es `Date.now() - startTimestamp` dentro del store. Robusto contra
 *   throttling del SO mientras la cámara nativa está abierta.
 * - R11 single-attempt guard: si el usuario ya intentó, redirige a
 *   /resultado en `onMounted` ANTES de cualquier `store.start()`,
 *   `setInterval` o `KeepAwake.keepAwake()`. Defensa en profundidad sobre el
 *   409 atómico del backend.
 * - KeepAwake activado en mount, liberado en unmount (plugin ya instalado).
 * - Capture de foto via dynamic `import('@capacitor/camera')` con
 *   try/catch — el plugin se instaló en Plan 08; el dynamic import deja la
 *   resolución para runtime y degrada graceful si permiso denegado.
 */
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useBarChallengeStore } from 'src/modules/bar-challenge/stores/useBarChallengeStore'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { createLogger } from 'src/utils/logger'

defineOptions({ name: 'BarChallengeTimer' })

const router = useRouter()
const store = useBarChallengeStore()
const logger = createLogger('bar-challenge-timer')

const cameraError = ref<string | null>(null)
let intervalId: number | undefined

const formatted = computed(() => {
  const s = store.secondsHeld
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, '0')
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
})

const isSuccess = computed(() => store.secondsHeld >= 90)
const statusLabel = computed(() => (isSuccess.value ? '¡LO LOGRASTE! SEGUÍ AGUANTANDO' : 'AGUANTÁ'))

onMounted(async () => {
  // Post-launch 2026-05-22: en iOS, abrir la cámara nativa puede matar el
  // WKWebView por presión de memoria. Al volver, el WebView relanza y el
  // store en memoria se pierde. Si el router guard nos trajo de vuelta acá
  // (o si el usuario navegó manualmente a /timer tras el kill), restauramos
  // `startTimestamp` desde localStorage en vez de arrancar de cero.
  const restored = store.restoreActiveAttempt()
  if (!restored) {
    store.start()
  }
  intervalId = window.setInterval(() => store.tick(), 100)
  try {
    await KeepAwake.keepAwake()
  } catch (err: unknown) {
    logger.warn('keepAwake failed', {
      err: err instanceof Error ? err.message : String(err),
    })
  }
})

onUnmounted(() => {
  if (intervalId !== undefined) window.clearInterval(intervalId)
  // Best-effort release; ignore errors (already-released is a benign no-op).
  void KeepAwake.allowSleep().catch(() => {
    /* noop */
  })
})

async function onTakePhoto(): Promise<void> {
  cameraError.value = null
  try {
    const cam: typeof import('@capacitor/camera') = await import('@capacitor/camera')
    const { Camera, CameraResultType, CameraSource } = cam
    const photo = await Camera.getPhoto({
      quality: 80,
      source: CameraSource.Camera,
      resultType: CameraResultType.Base64,
      saveToGallery: false,
    })
    if (photo.base64String) {
      store.setPhoto(photo.base64String)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('camera failed', { err: msg })
    cameraError.value = 'Sin permiso de cámara. Podés seguir el desafío sin foto.'
  }
}

function onFinalize(): void {
  store.finalize()
  void router.push('/desafio-barra/resultado')
}
</script>

<style lang="scss" scoped>
.bar-challenge-timer {
  // Fullscreen dark, no chrome. Position fixed + inset 0 garantiza que el
  // MainLayout no imponga header / bottom-nav (UI-SPEC line 207-208 workaround).
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #1a1612;
  color: #f0e6d6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bar-challenge-timer__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 48px;
  padding: 64px 24px 32px;
  max-width: 480px;
  width: 100%;
}

.bar-challenge-timer__status {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 1px;
  text-transform: uppercase;
  text-align: center;
  font-family: 'Montserrat', sans-serif;
  color: #f0e6d6;
  transition: color 200ms ease;
}

.bar-challenge-timer__status--success {
  background: linear-gradient(135deg, #c4956a 0%, #dcbe82 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.bar-challenge-timer__digits {
  font-size: 120px;
  font-weight: 800;
  line-height: 1;
  font-family: 'Montserrat', sans-serif;
  font-feature-settings: 'tnum';
  font-variant-numeric: tabular-nums;
  color: #f0e6d6;
  text-align: center;
  transition: color 200ms ease;
}

.bar-challenge-timer__digits--success {
  background: linear-gradient(135deg, #c4956a 0%, #dcbe82 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.bar-challenge-timer__actions {
  display: flex;
  flex-direction: row;
  gap: 16px;
  width: 100%;
  justify-content: center;
}

.bar-challenge-timer__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 10px;
  padding: 12px 20px;
  min-height: 44px;
  font-size: 14px;
  font-weight: 600;
  font-family: 'Montserrat', sans-serif;
  letter-spacing: 0.3px;
  cursor: pointer;
  transition: all 0.25s ease;
  -webkit-tap-highlight-color: transparent;
  flex: 1;
  max-width: 200px;
  &:active {
    transform: scale(0.98);
  }
}

.bar-challenge-timer__btn--outline {
  background: transparent;
  border: 1.5px solid #c4956a;
  color: #f0e6d6;
  &:hover {
    background: rgba(196, 149, 106, 0.08);
  }
}

.bar-challenge-timer__btn--filled {
  background: linear-gradient(135deg, #c4956a, #a07850);
  border: none;
  color: #f0e6d6;
  &:hover {
    filter: brightness(1.08);
  }
}

.bar-challenge-timer__camera-error {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  font-family: 'Geologica', sans-serif;
  color: #f0e6d6;
  text-align: center;
  margin: 0;
  max-width: 320px;
}
</style>
