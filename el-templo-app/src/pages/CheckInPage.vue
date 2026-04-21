<template>
  <q-page class="check-in-page">
    <!-- Scanner state -->
    <div v-if="state === 'scanning'" class="scanner-container">
      <div class="scanner-header">
        <q-btn flat round icon="arrow_back" color="white" @click="goBack" />
        <span class="scanner-title">Escanear QR</span>
        <div style="width: 48px" />
      </div>

      <div class="scanner-viewport">
        <div id="qr-reader" class="qr-reader" />
        <div class="scanner-overlay">
          <div class="scanner-frame">
            <div class="corner corner-tl" />
            <div class="corner corner-tr" />
            <div class="corner corner-bl" />
            <div class="corner corner-br" />
          </div>
        </div>
      </div>

      <p class="scanner-hint">Apunta la camara al codigo QR de tu sede</p>
    </div>

    <!-- Camera permission denied -->
    <div v-else-if="state === 'permission-denied'" class="result-container">
      <q-icon name="videocam_off" size="80px" color="warning" />
      <h2 class="result-title">Cámara no disponible</h2>
      <p class="result-message">Se necesita acceso a la camara para escanear el QR</p>
      <q-btn color="primary" label="Volver" class="result-btn" @click="goBack" />
    </div>

    <!-- Success state -->
    <div v-else-if="state === 'success'" class="result-container">
      <q-icon name="check_circle" size="100px" color="positive" />
      <h2 class="result-title">Asistencia registrada</h2>
      <p v-if="resultBranchName" class="result-message">
        {{ resultBranchName }}
      </p>
      <q-btn color="primary" label="Volver" class="result-btn" @click="goBack" />
    </div>

    <!-- Error state -->
    <div v-else-if="state === 'error'" class="result-container">
      <q-icon name="error" size="100px" color="negative" />
      <h2 class="result-title">No se pudo registrar</h2>
      <p class="result-message">{{ errorMessage }}</p>
      <q-btn color="primary" label="Volver" class="result-btn" @click="goBack" />
    </div>

    <!-- Loading state -->
    <div v-else-if="state === 'loading'" class="result-container">
      <TemploLoader size="lg" />
      <p class="result-message q-mt-lg">Registrando asistencia...</p>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { Html5Qrcode } from 'html5-qrcode'
import { useAttendanceApi } from 'src/composables/useAttendanceApi'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import TemploLoader from 'src/components/TemploLoader.vue'

type PageState = 'scanning' | 'permission-denied' | 'success' | 'error' | 'loading'

const router = useRouter()
const { checkIn, cleanup } = useAttendanceApi()
const log = createLogger('CheckIn')

const state = ref<PageState>('scanning')
const errorMessage = ref('')
const resultBranchName = ref('')

let scanner: Html5Qrcode | null = null
let scanProcessed = false

async function startScanner() {
  try {
    scanner = new Html5Qrcode('qr-reader')
    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const size = Math.max(50, Math.min(viewfinderWidth, viewfinderHeight) * 0.7)
          return { width: size, height: size }
        },
      },
      onScanSuccess,
      // ignore scan failures (no QR detected in frame)
      () => {},
    )
  } catch (err: unknown) {
    log.warn('Camera access failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    state.value = 'permission-denied'
  }
}

async function stopScanner() {
  if (scanner) {
    try {
      const scannerState = scanner.getState()
      // Html5QrcodeScannerState: SCANNING = 2, PAUSED = 3
      if (scannerState === 2 || scannerState === 3) {
        await scanner.stop()
      }
    } catch {
      // Scanner may already be stopped
    }
    scanner = null
  }
}

async function onScanSuccess(decodedText: string) {
  // Prevent duplicate processing
  if (scanProcessed) return
  scanProcessed = true

  state.value = 'loading'
  await stopScanner()

  try {
    const record = await checkIn(decodedText)
    resultBranchName.value = record.branchName.replace(/^El Templo\s+/i, 'Sede ')
    state.value = 'success'
    log.info('Check-in successful', { branchName: record.branchName })
  } catch (err: unknown) {
    errorMessage.value = extractError(err, 'Error al registrar asistencia')
    state.value = 'error'
    log.warn('Check-in failed', { error: errorMessage.value })
  }
}

function goBack() {
  router.back()
}

onMounted(() => {
  // Small delay to ensure DOM element is ready
  setTimeout(() => {
    if (state.value === 'scanning') {
      startScanner()
    }
  }, 100)
})

onBeforeRouteLeave(async () => {
  await stopScanner()
})

onBeforeUnmount(() => {
  stopScanner()
  cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.check-in-page {
  background: #1a1a1a;
  min-height: var(--app-vh);
  color: white;
}

.scanner-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.scanner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 8px;
}

.scanner-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.scanner-viewport {
  position: relative;
  width: 100%;
  max-width: 400px;
  aspect-ratio: 1;
  margin-top: 24px;
  overflow: hidden;
  border-radius: 16px;
}

.qr-reader {
  width: 100%;
  height: 100%;
}

// Deep selectors to style html5-qrcode internal elements on all devices
:deep(#qr-reader) {
  width: 100% !important;
  height: 100% !important;
  border: none !important;
}

:deep(#qr-reader video) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  border-radius: 16px;
}

:deep(#qr-reader__scan_region) {
  position: relative;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden;
}

:deep(#qr-reader__scan_region img) {
  display: none; // hide library's built-in scan region outline
}

// Hide camera-selection dashboard the library injects
:deep(#qr-reader__dashboard_section) {
  display: none !important;
}

.scanner-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.scanner-frame {
  position: relative;
  width: 70%;
  aspect-ratio: 1;
}

.corner {
  position: absolute;
  width: 30px;
  height: 30px;
  border-color: $primary;
  border-style: solid;
  border-width: 0;

  &-tl {
    top: 0;
    left: 0;
    border-top-width: 3px;
    border-left-width: 3px;
    border-top-left-radius: 8px;
  }

  &-tr {
    top: 0;
    right: 0;
    border-top-width: 3px;
    border-right-width: 3px;
    border-top-right-radius: 8px;
  }

  &-bl {
    bottom: 0;
    left: 0;
    border-bottom-width: 3px;
    border-left-width: 3px;
    border-bottom-left-radius: 8px;
  }

  &-br {
    bottom: 0;
    right: 0;
    border-bottom-width: 3px;
    border-right-width: 3px;
    border-bottom-right-radius: 8px;
  }
}

.scanner-hint {
  margin-top: 24px;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
  padding: 0 24px;
}

.result-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
  padding: 24px;
  text-align: center;
}

.result-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.5rem;
  font-weight: 600;
  margin-top: 24px;
  margin-bottom: 8px;
}

.result-message {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 32px;
  max-width: 300px;
}

.result-btn {
  min-width: 200px;
}
</style>
