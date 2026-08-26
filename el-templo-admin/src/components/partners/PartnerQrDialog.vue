<template>
  <q-dialog :model-value="modelValue" @update:model-value="onDialogUpdate" persistent>
    <q-card style="min-width: 480px; max-width: 640px">
      <q-card-section>
        <div class="text-h6">Código QR — {{ partner?.name }} ({{ partner?.code }})</div>
      </q-card-section>

      <q-card-section v-if="loadingUrls" class="text-center">
        <q-spinner color="primary" size="2em" />
      </q-card-section>

      <!-- Falta configurar alguna URL de tienda: aviso + formulario inline en vez
           de generar un QR roto (D-20; superficie que usa Franco en el checkpoint
           del plan 179-17). -->
      <q-card-section v-else-if="missingUrls.length > 0">
        <q-banner class="bg-warning text-white q-mb-md" rounded>
          Falta configurar la URL de {{ missingUrls.join(' y de ') }}. El QR no se genera
          hasta cargarla.
        </q-banner>
        <q-form @submit="onSaveUrls" class="q-gutter-y-md">
          <q-input
            v-model="urlForm.android"
            label="URL Play Store"
            outlined
            dense
            hint="https://play.google.com/store/apps/details?id=..."
          />
          <q-input
            v-model="urlForm.ios"
            label="URL App Store"
            outlined
            dense
            hint="https://apps.apple.com/app/id..."
          />
          <q-card-actions align="right">
            <q-btn flat label="Cerrar" @click="close" />
            <q-btn color="primary" label="Guardar URLs" type="submit" :loading="savingUrls" />
          </q-card-actions>
        </q-form>
      </q-card-section>

      <q-card-section v-else>
        <div v-if="generating" class="text-center q-pa-md">
          <q-spinner color="primary" size="2em" />
        </div>

        <div v-else class="row q-col-gutter-md">
          <div v-if="images.play" class="col-6 text-center">
            <div class="text-caption q-mb-xs">Play Store</div>
            <img :src="images.play.dataUrl" style="width: 100%; max-width: 220px" alt="QR Play Store" />
            <div class="q-mt-sm">
              <q-btn
                dense
                outline
                color="primary"
                label="Descargar Play Store"
                @click="downloadImage(images.play.dataUrl, playFilename)"
              />
            </div>
          </div>
          <div v-if="images.appstore" class="col-6 text-center">
            <div class="text-caption q-mb-xs">App Store</div>
            <img :src="images.appstore.dataUrl" style="width: 100%; max-width: 220px" alt="QR App Store" />
            <div class="q-mt-sm">
              <q-btn
                dense
                outline
                color="primary"
                label="Descargar App Store"
                @click="downloadImage(images.appstore.dataUrl, appstoreFilename)"
              />
            </div>
          </div>
        </div>

        <q-separator class="q-my-md" />

        <div class="text-caption text-grey-7 q-mb-xs">
          Link de registro (campañas digitales)
        </div>
        <q-input :model-value="registerLink" readonly dense outlined>
          <template #append>
            <q-btn flat dense round icon="content_copy" @click="copyLink">
              <q-tooltip>Copiar</q-tooltip>
            </q-btn>
          </template>
        </q-input>

        <q-card-actions align="right" class="q-mt-md">
          <q-btn flat label="Cerrar" @click="close" />
          <q-btn
            color="primary"
            label="Descargar ambos (.zip)"
            :loading="zipping"
            :disable="!images.play || !images.appstore"
            @click="downloadZip"
          />
        </q-card-actions>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import * as QRCode from 'qrcode';
import JSZip from 'jszip';
import { createLogger } from 'src/utils/logger';
import { usePartnersApi, type PartnerListItem } from 'src/composables/usePartnersApi';

/**
 * Diálogo de generación de los 2 QR de la tarjeta física de un partner
 * (fase 179-12, D-01/D-04). Contenido del QR = la URL de tienda EXACTA,
 * leída de system_settings: sin firma criptográfica de ningún tipo, a
 * diferencia del QR de check-in de sede (que sí firma porque es una
 * credencial). Todo se genera en el navegador con `qrcode`/`jszip`, ya
 * instalados — cero dependencias nuevas.
 */

const log = createLogger('PartnerQrDialog');
const $q = useQuasar();
const partnersApi = usePartnersApi();

const props = defineProps<{
  modelValue: boolean;
  partner: PartnerListItem | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const loadingUrls = ref(false);
const savingUrls = ref(false);
const generating = ref(false);
const zipping = ref(false);

const storeUrls = ref<{ android: string | null; ios: string | null }>({
  android: null,
  ios: null,
});
const urlForm = ref<{ android: string; ios: string }>({ android: '', ios: '' });

interface GeneratedCard {
  dataUrl: string;
  blob: Blob;
}
const images = ref<{ play: GeneratedCard | null; appstore: GeneratedCard | null }>({
  play: null,
  appstore: null,
});

const missingUrls = computed(() => {
  const missing: string[] = [];
  if (!storeUrls.value.android) missing.push('Play Store');
  if (!storeUrls.value.ios) missing.push('App Store');
  return missing;
});

// Link web de registro (D-15/plan 179-15: la app pre-llena el campo manual
// desde este query param). Útil para campañas digitales del comercio, calcado
// de `showPromoLink` de PlanesPage.vue.
const registerLink = computed(() =>
  props.partner ? `https://app.eltemplo.org/register?code=${props.partner.code}` : ''
);

const playFilename = computed(() =>
  props.partner ? `qr-${props.partner.code}-play.png` : 'qr-play.png'
);
const appstoreFilename = computed(() =>
  props.partner ? `qr-${props.partner.code}-appstore.png` : 'qr-appstore.png'
);

watch(
  () => props.modelValue,
  async (show) => {
    if (!show || !props.partner) return;
    images.value = { play: null, appstore: null };
    await loadAndGenerate();
  }
);

async function loadAndGenerate() {
  loadingUrls.value = true;
  try {
    storeUrls.value = await partnersApi.getStoreUrls();
    urlForm.value = {
      android: storeUrls.value.android ?? '',
      ios: storeUrls.value.ios ?? '',
    };
    if (missingUrls.value.length === 0) {
      await generateImages();
    }
  } catch (err: unknown) {
    log.error('Failed to load store urls', {
      err: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'Error cargando las URLs de tienda' });
  } finally {
    loadingUrls.value = false;
  }
}

async function onSaveUrls() {
  savingUrls.value = true;
  try {
    const input: { android?: string; ios?: string } = {};
    if (urlForm.value.android) input.android = urlForm.value.android;
    if (urlForm.value.ios) input.ios = urlForm.value.ios;
    storeUrls.value = await partnersApi.updateStoreUrls(input);
    $q.notify({ type: 'positive', message: 'URLs de tienda guardadas' });
    if (missingUrls.value.length === 0) {
      await generateImages();
    }
  } catch (err: unknown) {
    log.error('Failed to save store urls', {
      err: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'Error guardando las URLs de tienda' });
  } finally {
    savingUrls.value = false;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar el QR generado'));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo generar el PNG'));
    }, 'image/png');
  });
}

/**
 * Genera el PNG final de una tarjeta: QR de 1024px (mismas opciones que
 * `tools/generate-branch-qrs.ts`: width 1024, margin 2, errorCorrectionLevel
 * "H", negro sobre blanco) + el código del partner en texto grande + el
 * nombre del comercio en texto chico, sobre fondo blanco — el PNG que va a
 * imprenta (D-04).
 */
async function generateCardPng(
  qrContent: string,
  code: string,
  partnerName: string
): Promise<GeneratedCard> {
  const qrDataUrl = await QRCode.toDataURL(qrContent, {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#ffffff' },
  });
  const qrImg = await loadImage(qrDataUrl);

  const textAreaHeight = 220;
  const canvas = document.createElement('canvas');
  canvas.width = qrImg.width;
  canvas.height = qrImg.height + textAreaHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el contexto de canvas');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(qrImg, 0, 0);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 96px sans-serif';
  ctx.fillText(code, canvas.width / 2, qrImg.height + 110);

  ctx.fillStyle = '#444444';
  ctx.font = '48px sans-serif';
  ctx.fillText(partnerName, canvas.width / 2, qrImg.height + 180);

  const [dataUrl, blob] = await Promise.all([
    Promise.resolve(canvas.toDataURL('image/png')),
    canvasToBlob(canvas),
  ]);
  return { dataUrl, blob };
}

async function generateImages() {
  if (!props.partner || !storeUrls.value.android || !storeUrls.value.ios) return;
  generating.value = true;
  try {
    const [play, appstore] = await Promise.all([
      generateCardPng(storeUrls.value.android, props.partner.code, props.partner.name),
      generateCardPng(storeUrls.value.ios, props.partner.code, props.partner.name),
    ]);
    images.value = { play, appstore };
  } catch (err: unknown) {
    log.error('Failed to generate QR images', {
      err: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'Error generando los códigos QR' });
  } finally {
    generating.value = false;
  }
}

function downloadImage(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function downloadZip() {
  if (!images.value.play || !images.value.appstore || !props.partner) return;
  zipping.value = true;
  try {
    const zip = new JSZip();
    zip.file(playFilename.value, images.value.play.blob);
    zip.file(appstoreFilename.value, images.value.appstore.blob);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${props.partner.code}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err: unknown) {
    log.error('Failed to build QR zip', {
      err: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'Error generando el .zip' });
  } finally {
    zipping.value = false;
  }
}

function copyLink() {
  navigator.clipboard
    .writeText(registerLink.value)
    .then(() => {
      $q.notify({ type: 'positive', message: 'Link copiado' });
    })
    .catch((err: unknown) => {
      log.error('Failed to copy register link', {
        err: err instanceof Error ? err.message : String(err),
      });
    });
}

function close() {
  emit('update:modelValue', false);
}

function onDialogUpdate(value: boolean) {
  emit('update:modelValue', value);
}
</script>
