<template>
  <q-page class="bar-challenge-resultado">
    <!-- Empty state: ruta accedida sin attempt previo y sin ventana activa -->
    <div v-if="isEmpty" class="bar-challenge-resultado__content">
      <h1 class="bar-challenge-resultado__heading">El desafío terminó</h1>
      <p class="bar-challenge-resultado__body">Vení al próximo evento.</p>
      <button
        class="bar-challenge-resultado__cta bar-challenge-resultado__cta--text"
        type="button"
        @click="onBack"
      >
        Volver
      </button>
    </div>

    <!-- Estado normal: post-intento -->
    <div v-else class="bar-challenge-resultado__content">
      <!-- Retry banner D-10 (no bloqueante, gold-tinted) -->
      <div v-if="retryPending" class="bar-challenge-resultado__retry-banner" role="status">
        No se pudo guardar el intento, se está reintentando.
      </div>

      <!-- Aviso cuando el WebView murió mid-captura (Android/iOS low-memory) -->
      <div v-if="photoLostByCrash" class="bar-challenge-resultado__retry-banner" role="status">
        Tu foto se perdió por presión de memoria del sistema. Sacala ahora.
      </div>

      <!-- Photo preview si tenemos foto cacheada -->
      <div v-if="displayPhoto" class="bar-challenge-resultado__photo-wrap">
        <img :src="photoSrc" alt="Tu foto del desafío" class="bar-challenge-resultado__photo" />
      </div>

      <!-- Headline: "Tu resultado: {N} segundos!" -->
      <h1 class="bar-challenge-resultado__heading">
        Tu resultado:
        <span
          class="bar-challenge-resultado__num"
          :class="{ 'bar-challenge-resultado__num--success': displayCompleted }"
        >
          {{ displaySeconds }}
        </span>
        segundos!
      </h1>

      <p class="bar-challenge-resultado__body">
        Etiquetá a @eltemplomdp y @auraclub.ar y participá!
      </p>

      <!-- CTA cluster -->
      <div class="bar-challenge-resultado__actions">
        <button
          v-if="displayPhoto"
          class="bar-challenge-resultado__cta bar-challenge-resultado__cta--filled"
          type="button"
          :disabled="sharing"
          @click="handleShare"
        >
          <q-icon name="share" size="18px" />
          <span>Compartir</span>
        </button>
        <button
          v-else
          class="bar-challenge-resultado__cta bar-challenge-resultado__cta--outline"
          type="button"
          @click="handleTakePhotoAndShare"
        >
          <q-icon name="photo_camera" size="18px" />
          <span>Sacar foto ahora</span>
        </button>

        <button
          class="bar-challenge-resultado__cta bar-challenge-resultado__cta--text"
          type="button"
          @click="onBack"
        >
          Volver
        </button>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * Phase 115 — Resultado.vue
 *
 * Pantalla final del desafío. Optimistic UI (D-10): muestra inmediatamente
 * segundos + foto + share sin esperar al backend. Si los 3 reintentos del POST
 * fallaron, banner discreto gold-tinted al top.
 *
 * Tres ramas + empty state:
 *  - completed=true  → headline gold-gradient + body "Mostrá la foto..."
 *  - completed=false → headline cream + body "La barra te está esperando..."
 *  - sin foto cacheada → CTA "Sacar foto ahora" (fallback, abre cámara)
 *  - sin attempt previo Y sin store.attemptResult → empty state
 *
 * Plugins Capacitor (instalados en Plan 08):
 *  - `@capacitor/camera` y `@capacitor/share` se importan vía dynamic
 *    `await import(...)`. Si el plugin no resuelve en runtime (build web
 *    sin nativo, o permiso denegado), los catch's nos dejan caer al
 *    fallback `<a download>` con notify según UI-SPEC.
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  useBarChallengeStore,
  wasPhotoCaptureInterrupted,
  clearPhotoCaptureFlag,
  markPhotoCaptureStart,
} from 'src/modules/bar-challenge/stores/useBarChallengeStore'
import { useUserStore } from 'src/stores/useUserStore'
import { useImageComposer } from 'src/modules/bar-challenge/composables/useImageComposer'
import { useQuasar } from 'quasar'
import { createLogger } from 'src/utils/logger'

defineOptions({ name: 'BarChallengeResultado' })

const router = useRouter()
const store = useBarChallengeStore()
const userStore = useUserStore()
const { composeWithFrame } = useImageComposer()
const $q = useQuasar()
const logger = createLogger('bar-challenge-resultado')

const SESSION_KEY = 'bar-challenge-pending-submit'

const retryPending = ref(false)
const sharing = ref(false)
const photoLostByCrash = ref(false)

// Resolve display data: prefer store (this session), fallback to user profile (cached).
const displayPhoto = computed<string | null>(() => store.photoBase64 ?? null)

const displaySeconds = computed<number>(
  () => store.attemptResult?.seconds ?? userStore.profile?.barChallengeSeconds ?? 0,
)

const displayCompleted = computed<boolean>(
  () => store.attemptResult?.completed ?? userStore.profile?.barChallengeCompleted ?? false,
)

// Empty state: ruta accedida sin attempt previo en store NI en profile.
const isEmpty = computed<boolean>(
  () => store.attemptResult == null && userStore.profile?.barChallengeAttemptedAt == null,
)

const photoSrc = computed<string>(() => {
  const p = displayPhoto.value
  if (!p) return ''
  return p.startsWith('data:') ? p : `data:image/jpeg;base64,${p}`
})

function readRetryQueueLength(): number {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return 0
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch (err: unknown) {
    logger.warn('readRetryQueueLength failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return 0
  }
}

onMounted(() => {
  // Optimistic — mostrar UI inmediatamente; el banner sube si quedan entries
  // en la queue (es decir, si los 3 reintentos del store ya fallaron y
  // todavía no se drenó).
  retryPending.value = readRetryQueueLength() > 0
  // Drain en background; al volver, recheck.
  void store.drainPendingSubmits().then(() => {
    retryPending.value = readRetryQueueLength() > 0
  })

  // Si quedó un flag de captura en curso → el WebView murió mid-foto
  // (Android/iOS por presión de memoria). Avisamos al usuario y limpiamos
  // el flag para no re-disparar el aviso en sesiones futuras.
  if (wasPhotoCaptureInterrupted() && !store.photoBase64) {
    photoLostByCrash.value = true
    logger.warn('photo lost — webview killed during capture')
  }
  clearPhotoCaptureFlag()
})

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function handleShare(): Promise<void> {
  if (!displayPhoto.value) return
  sharing.value = true
  try {
    const blob = await composeWithFrame(displayPhoto.value, {
      secondsHeld: displaySeconds.value,
      completed: displayCompleted.value,
    })
    const dataUrl = await blobToDataUrl(blob)
    try {
      const shareMod: typeof import('@capacitor/share') = await import('@capacitor/share')
      const { Share } = shareMod
      await Share.share({
        title: 'Desafío de la Barra — El Templo',
        dialogTitle: 'Compartir tu desafío',
        url: dataUrl,
      })
    } catch (shareErr: unknown) {
      logger.warn('share failed → fallback to download', {
        err: shareErr instanceof Error ? shareErr.message : String(shareErr),
      })
      downloadBlob(blob, 'desafio-barra.jpg')
      $q.notify({
        message: 'Tu dispositivo no permite compartir directamente. Descargamos la foto.',
        color: 'warning',
        timeout: 4000,
      })
    }
  } catch (err: unknown) {
    logger.error('share flow failed', {
      err: err instanceof Error ? err.message : String(err),
    })
  } finally {
    sharing.value = false
  }
}

async function handleTakePhotoAndShare(): Promise<void> {
  try {
    const cam: typeof import('@capacitor/camera') = await import('@capacitor/camera')
    const { Camera, CameraResultType, CameraSource } = cam
    // Mismo flag que en Timer.vue — si el WebView muere mid-captura, al volver
    // sabemos avisar en vez de mostrar el botón fallback otra vez sin contexto.
    photoLostByCrash.value = false
    markPhotoCaptureStart()
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        source: CameraSource.Camera,
        resultType: CameraResultType.Base64,
        saveToGallery: false,
      })
      if (photo.base64String) {
        store.setPhoto(photo.base64String)
        await handleShare()
      }
    } finally {
      clearPhotoCaptureFlag()
    }
  } catch (err: unknown) {
    logger.warn('fallback camera failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    $q.notify({
      message: 'Sin permiso de cámara. Podés seguir el desafío sin foto.',
      color: 'warning',
      timeout: 4000,
    })
  }
}

function onBack(): void {
  void router.push('/mi-templo')
}
</script>

<style lang="scss" scoped>
.bar-challenge-resultado {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #1a1612;
  color: #f0e6d6;
  overflow-y: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.bar-challenge-resultado__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 64px 24px 32px;
  max-width: 480px;
  width: 100%;
}

.bar-challenge-resultado__retry-banner {
  width: 100%;
  background: rgba(220, 190, 130, 0.15);
  color: #dcbe82;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  font-family: 'Geologica', sans-serif;
  text-align: center;
}

.bar-challenge-resultado__photo-wrap {
  // 1.5px shimmer-gold border equivalent — solid simplified for the result preview
  padding: 1.5px;
  background: linear-gradient(
    135deg,
    rgba(196, 149, 106, 0.4),
    rgba(220, 190, 130, 0.6),
    rgba(196, 149, 106, 0.4)
  );
  border-radius: 16px;
  max-width: 240px;
  width: 100%;
}

.bar-challenge-resultado__photo {
  display: block;
  width: 100%;
  aspect-ratio: 9 / 16;
  object-fit: cover;
  border-radius: 14.5px;
  background: #2c2318;
}

.bar-challenge-resultado__heading {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.2;
  font-family: 'Montserrat', sans-serif;
  color: #f0e6d6;
  margin: 16px 0 0;
  text-align: center;
}

.bar-challenge-resultado__num {
  font-size: 64px;
  font-weight: 800;
  line-height: 1;
  font-family: 'Montserrat', sans-serif;
  font-feature-settings: 'tnum';
  font-variant-numeric: tabular-nums;
  color: #f0e6d6;
  display: inline-block;
  vertical-align: baseline;
  padding: 0 8px;
}

.bar-challenge-resultado__num--success {
  background: linear-gradient(135deg, #c4956a 0%, #dcbe82 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.bar-challenge-resultado__body {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  font-family: 'Geologica', sans-serif;
  color: #f0e6d6;
  margin: 0;
  text-align: center;
  max-width: 320px;
}

.bar-challenge-resultado__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin-top: 16px;
}

.bar-challenge-resultado__cta {
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
  width: 100%;
  max-width: 280px;
  &:active {
    transform: scale(0.98);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.bar-challenge-resultado__cta--filled {
  background: linear-gradient(135deg, #c4956a, #a07850);
  border: none;
  color: #f0e6d6;
  &:hover {
    filter: brightness(1.08);
  }
}

.bar-challenge-resultado__cta--outline {
  background: transparent;
  border: 1.5px solid #c4956a;
  color: #f0e6d6;
  &:hover {
    background: rgba(196, 149, 106, 0.08);
  }
}

.bar-challenge-resultado__cta--text {
  background: transparent;
  border: none;
  color: #f0e6d6;
  font-weight: 400;
  min-height: 36px;
  padding: 8px 20px;
  &:hover {
    opacity: 0.8;
  }
}
</style>
