<!--
  Dialog genérico de escaneo de QR (fase "Mi jornada"). Al abrirse monta un
  Html5Qrcode contra un <div> propio y, al leer un código, emite `scanned`
  UNA sola vez (el scanner se detiene ANTES de emitir para evitar lecturas
  dobles) y se cierra solo. Mismo patrón que `CheckInPage.vue` de la app de
  socios (misma librería, mismo QR físico de sede) pero encapsulado en un
  componente reutilizable: acá lo usan tanto el check-in como el check-out.
-->
<template>
  <q-dialog
    :model-value="modelValue"
    persistent
    @update:model-value="(v) => emit('update:modelValue', v)"
    @show="onShow"
    @hide="onHide"
  >
    <q-card style="min-width: 320px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">{{ title }}</div>
        <q-space />
        <q-btn flat round dense icon="close" @click="close" />
      </q-card-section>

      <q-card-section>
        <div v-if="cameraError" class="column items-center q-gutter-sm q-py-md">
          <q-icon name="videocam_off" size="64px" color="warning" />
          <div class="text-body2 text-center">{{ cameraError }}</div>
          <q-btn color="primary" label="Reintentar" icon="refresh" @click="retryScanner" />
        </div>
        <div v-show="!cameraError" class="scanner-wrap">
          <div :id="readerId" />
        </div>
        <div v-if="!cameraError" class="text-caption text-grey-7 text-center q-mt-sm">
          Apuntá la cámara al QR de la sede
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue';
import { Html5Qrcode } from 'html5-qrcode';
import { createLogger } from 'src/utils/logger';

const log = createLogger('QrScannerDialog');

defineProps<{
  modelValue: boolean;
  title: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  scanned: [text: string];
}>();

// Id único por instancia: evita colisión de DOM id si en algún momento hay
// más de un scanner montado en la misma página.
const readerId = `qr-reader-${Math.random().toString(36).slice(2)}`;

const cameraError = ref('');

let scanner: Html5Qrcode | null = null;
let scanProcessed = false;
let isTearingDown = false;

async function startScanner() {
  isTearingDown = false;
  scanProcessed = false;
  cameraError.value = '';
  try {
    scanner = new Html5Qrcode(readerId);
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      // ignorar frames sin QR detectado
      () => {}
    );
  } catch (err: unknown) {
    // Un teardown a mitad de arranque también cae acá (AbortError) — no es
    // un problema de permisos, no mostrar el estado de error.
    if (isTearingDown) return;
    log.warn('No se pudo acceder a la cámara', {
      error: err instanceof Error ? err.message : String(err),
    });
    cameraError.value = 'No se pudo acceder a la cámara. Revisá los permisos e intentá de nuevo.';
  }
}

async function stopScanner() {
  if (scanner) {
    try {
      const state = scanner.getState();
      // Html5QrcodeScannerState: SCANNING = 2, PAUSED = 3
      if (state === 2 || state === 3) {
        await scanner.stop();
      }
      scanner.clear();
    } catch {
      // el scanner puede ya estar detenido
    }
    scanner = null;
  }
}

function onScanSuccess(decodedText: string) {
  if (scanProcessed) return;
  scanProcessed = true;
  void stopScanner();
  emit('scanned', decodedText);
  emit('update:modelValue', false);
}

function onShow() {
  void startScanner();
}

function onHide() {
  isTearingDown = true;
  void stopScanner();
}

function close() {
  emit('update:modelValue', false);
}

function retryScanner() {
  void startScanner();
}

function cleanup() {
  isTearingDown = true;
  void stopScanner();
}

// Red de seguridad: si la página navega fuera con el diálogo abierto, el
// componente se desmonta sin pasar por `@hide` — hay que frenar la cámara
// igual para no dejarla prendida.
onBeforeUnmount(cleanup);
</script>

<style scoped>
.scanner-wrap {
  width: 100%;
  min-height: 250px;
}
</style>
