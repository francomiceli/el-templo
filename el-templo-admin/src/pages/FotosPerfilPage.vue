<!-- Revisión de fotos de perfil (fase 214, plan 30, Pantalla 7 del UI-SPEC, D-31, D-32, D-46).
     Cola única con las fotos pendientes y las reportadas (las reportadas van primero). El filtro de
     sede lo hace el servidor (admin_sede ve solo las suyas). El estado de la cola vive en el servidor:
     cada acción saca la card, refresca la pelotita del menú y, si la foto ya no está (404), vuelve a
     pedir la lista. -->
<template>
  <q-page padding>
    <div class="text-h5">Fotos de perfil</div>
    <div class="text-body2 text-grey-8 q-mb-md">
      Las fotos que suben los alumnos y las que reportaron. Las reportadas van primero.
    </div>

    <q-banner
      v-if="loadState === 'unavailable'"
      rounded
      class="bg-warning text-white q-mb-md"
      data-test="fotos-unavailable"
    >
      Las fotos no están disponibles por ahora.
    </q-banner>

    <q-banner
      v-else-if="loadState === 'error'"
      rounded
      class="bg-warning text-white q-mb-md"
      data-test="fotos-error"
    >
      No pudimos cargar las fotos.
      <template #action>
        <q-btn flat no-caps color="white" label="Reintentar" @click="loadQueue" />
      </template>
    </q-banner>

    <div v-if="loadState === 'loading'" class="row q-col-gutter-md" data-test="fotos-loading">
      <div v-for="n in 4" :key="n" class="col-12 col-sm-6 col-md-4 col-lg-3">
        <q-card flat bordered>
          <q-skeleton square height="200px" />
          <q-card-section>
            <q-skeleton type="text" width="70%" />
            <q-skeleton type="text" width="40%" />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <div
      v-else-if="loadState === 'ready' && sortedItems.length === 0"
      class="column items-center text-center q-pa-xl"
      data-test="fotos-empty"
    >
      <q-icon name="face" size="48px" color="grey-6" />
      <div class="text-h6 q-mt-sm">No hay fotos para revisar</div>
      <div class="text-body2 text-grey-8">
        Cuando un alumno suba su foto o alguien reporte una, aparece acá.
      </div>
    </div>

    <div v-else-if="loadState === 'ready'" class="row q-col-gutter-md" data-test="fotos-grid">
      <div
        v-for="item in sortedItems"
        :key="item.photoId"
        class="col-12 col-sm-6 col-md-4 col-lg-3"
      >
        <q-card flat bordered :data-test="`foto-card-${item.photoId}`">
          <q-img
            :src="item.url"
            :ratio="1"
            class="cursor-pointer"
            :alt="`Foto de ${memberName(item)}`"
            @click="openPhoto(item)"
          />
          <q-card-section>
            <div class="text-subtitle1">{{ memberName(item) }}</div>
            <router-link :to="`/alumnos/${item.userId}`" class="text-caption">
              Ver ficha
            </router-link>
            <div class="text-caption text-grey-8 q-mt-xs">{{ branchLabel(item) }}</div>
            <div class="text-caption">
              Subida el {{ formatStamp(item.uploadedAt, item, ' a las ') }}
            </div>
            <div class="q-mt-sm">
              <q-chip
                v-if="isReported(item)"
                dense
                color="negative"
                text-color="white"
                :label="`Reportada · ${item.reportCount}`"
              />
              <q-chip v-else dense color="warning" text-color="white" label="Pendiente" />
            </div>
            <div v-if="isReported(item) && item.lastReportedAt" class="text-caption">
              Último reporte: {{ formatStamp(item.lastReportedAt, item, ' ') }}
            </div>
          </q-card-section>
          <q-card-actions align="between">
            <template v-if="isReported(item)">
              <q-btn
                outline
                no-caps
                color="primary"
                label="Mantener"
                :disable="isBusy(item)"
                @click="approve(item)"
              />
              <q-btn
                unelevated
                no-caps
                color="negative"
                label="Quitar"
                :disable="isBusy(item)"
                @click="openRemove(item)"
              />
            </template>
            <template v-else>
              <q-btn
                unelevated
                no-caps
                color="primary"
                label="Aprobar"
                :disable="isBusy(item)"
                @click="approve(item)"
              />
              <q-btn
                flat
                no-caps
                color="negative"
                label="Rechazar"
                :disable="isBusy(item)"
                @click="openReject(item)"
              />
            </template>
          </q-card-actions>
        </q-card>
      </div>
    </div>

    <!-- Foto ampliada -->
    <q-dialog v-model="photoOpen">
      <q-card style="width: 480px; max-width: 95vw">
        <q-img v-if="photoTarget" :src="photoTarget.url" :ratio="1" />
      </q-card>
    </q-dialog>

    <!-- Rechazar con motivo (D-69) -->
    <q-dialog v-model="rejectOpen" :persistent="rejectBusy">
      <q-card style="min-width: 320px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">
            Rechazar la foto de {{ rejectTarget ? memberName(rejectTarget) : '' }}
          </div>
          <div class="text-body2 text-grey-8 q-mt-xs">
            Le avisamos que no fue aprobada para que suba otra.
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-option-group v-model="rejectReason" type="radio" :options="REJECT_REASON_OPTIONS" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Cancelar" :disable="rejectBusy" @click="rejectOpen = false" />
          <q-btn
            unelevated
            no-caps
            color="negative"
            label="Rechazar"
            :loading="rejectBusy"
            @click="confirmReject"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Quitar -->
    <q-dialog v-model="removeOpen" :persistent="removeBusy">
      <q-card style="min-width: 320px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">
            ¿Quitar la foto de {{ removeTarget ? memberName(removeTarget) : '' }}?
          </div>
          <div class="text-body2 text-grey-8 q-mt-xs">
            Se quita también la foto de su ficha. El Aura que sumó no se toca.
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Cancelar" :disable="removeBusy" @click="removeOpen = false" />
          <q-btn
            unelevated
            no-caps
            color="negative"
            label="Quitar"
            :loading="removeBusy"
            @click="confirmRemove"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import axios from 'axios';
import { useQuasar } from 'quasar';
import { AURA_AMOUNTS } from 'src/config/aura-amounts';
import {
  useProfilePhotosApi,
  type PhotoRejectionReason,
  type ProfilePhotoQueueItem,
} from 'src/composables/useProfilePhotosApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useAdminStore } from 'src/stores/useAdminStore';
import type { BranchOption } from 'src/types/member';
import { createLogger } from 'src/utils/logger';

const log = createLogger('FotosPerfilPage');
const $q = useQuasar();
const adminStore = useAdminStore();
const photosApi = useProfilePhotosApi();
const membersApi = useMembersApi();

type LoadState = 'loading' | 'ready' | 'error' | 'unavailable';

/** Motivos de rechazo que ve el staff (UI-SPEC, Borrador 5). El código viaja a la API. */
const REJECT_REASON_OPTIONS: { label: string; value: PhotoRejectionReason }[] = [
  { label: 'No se te ve la cara', value: 'sin_cara' },
  { label: 'No es una foto tuya', value: 'no_es_propia' },
  { label: 'Contenido que no va', value: 'contenido' },
  { label: 'Otro motivo', value: 'otro' },
];
const DEFAULT_REJECT_REASON: PhotoRejectionReason = 'otro';
const FALLBACK_TIMEZONE = 'America/Argentina/Buenos_Aires';

const loadState = ref<LoadState>('loading');
const items = ref<ProfilePhotoQueueItem[]>([]);
const branches = ref<BranchOption[]>([]);
const busyIds = ref<Set<number>>(new Set());

const photoOpen = ref(false);
const photoTarget = ref<ProfilePhotoQueueItem | null>(null);

const rejectOpen = ref(false);
const rejectTarget = ref<ProfilePhotoQueueItem | null>(null);
const rejectReason = ref<PhotoRejectionReason>(DEFAULT_REJECT_REASON);
const rejectBusy = ref(false);

const removeOpen = ref(false);
const removeTarget = ref<ProfilePhotoQueueItem | null>(null);
const removeBusy = ref(false);

/** Reportada = foto ya aprobada con reportes. Pendiente = sin aprobar todavía. */
function isReported(item: ProfilePhotoQueueItem): boolean {
  return item.status === 'aprobada';
}

/** Reportadas primero; dentro de cada grupo se respeta el orden del servidor. */
const sortedItems = computed<ProfilePhotoQueueItem[]>(() => {
  const reported = items.value.filter((item) => isReported(item));
  const pending = items.value.filter((item) => !isReported(item));
  return [...reported, ...pending];
});

function memberName(item: ProfilePhotoQueueItem): string {
  const full = [item.firstName, item.lastName].filter(Boolean).join(' ').trim();
  return full.length > 0 ? full : `Alumno #${item.userId}`;
}

function branchOf(item: ProfilePhotoQueueItem): BranchOption | undefined {
  if (item.branchId === null) return undefined;
  return branches.value.find((branch) => branch.id === item.branchId);
}

function branchLabel(item: ProfilePhotoQueueItem): string {
  return branchOf(item)?.name ?? 'Sin sede';
}

/** "17/11{sep}18:04" en la zona de la sede (o Buenos Aires si no se conoce). */
function formatStamp(iso: string, item: ProfilePhotoQueueItem, sep: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const zone = branchOf(item)?.timezone ?? FALLBACK_TIMEZONE;
  try {
    const day = new Intl.DateTimeFormat('es-AR', {
      timeZone: zone,
      day: '2-digit',
      month: '2-digit',
    }).format(date);
    const time = new Intl.DateTimeFormat('es-AR', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
    return `${day}${sep}${time}`;
  } catch {
    return iso;
  }
}

function isBusy(item: ProfilePhotoQueueItem): boolean {
  return busyIds.value.has(item.photoId);
}

function setBusy(item: ProfilePhotoQueueItem, busy: boolean): void {
  const next = new Set(busyIds.value);
  if (busy) next.add(item.photoId);
  else next.delete(item.photoId);
  busyIds.value = next;
}

function statusOf(err: unknown): number | null {
  return axios.isAxiosError(err) && err.response ? err.response.status : null;
}

function dropFromQueue(item: ProfilePhotoQueueItem): void {
  items.value = items.value.filter((candidate) => candidate.photoId !== item.photoId);
}

async function loadQueue(): Promise<void> {
  loadState.value = 'loading';
  try {
    const queue = await photosApi.listQueue();
    items.value = queue.items;
    loadState.value = 'ready';
  } catch (err: unknown) {
    if (statusOf(err) === 503) {
      loadState.value = 'unavailable';
      return;
    }
    log.error('No se pudo cargar la cola de fotos', {
      error: err instanceof Error ? err.message : String(err),
    });
    loadState.value = 'error';
  }
}

async function loadBranches(): Promise<void> {
  try {
    branches.value = await membersApi.getBranches();
  } catch (err: unknown) {
    // Sin nombres de sede la cola igual se puede revisar: cada card muestra "Sin sede".
    log.warn('No se pudieron cargar las sedes', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Traduce el error de una acción: 404 recarga la cola, 503 pasa al banner, el resto avisa. */
async function handleActionError(err: unknown, fallback: string): Promise<void> {
  const status = statusOf(err);
  if (status === 404) {
    $q.notify({ type: 'warning', message: 'Esa foto ya no está en la cola.' });
    await loadQueue();
    await adminStore.fetchPhotoReviewCount();
    return;
  }
  if (status === 503) {
    loadState.value = 'unavailable';
    return;
  }
  log.error(fallback, { error: err instanceof Error ? err.message : String(err) });
  $q.notify({ type: 'negative', message: fallback });
}

async function approve(item: ProfilePhotoQueueItem): Promise<void> {
  if (isBusy(item)) return;
  const wasReported = isReported(item);
  setBusy(item, true);
  try {
    const result = await photosApi.approve(item.userId);
    dropFromQueue(item);
    const message = wasReported
      ? 'Listo, la foto queda.'
      : result.auraAwarded
        ? `Foto aprobada. Sumó ${AURA_AMOUNTS.profilePhoto} de Aura.`
        : 'Foto aprobada.';
    $q.notify({ type: 'positive', message });
    await adminStore.fetchPhotoReviewCount();
  } catch (err: unknown) {
    await handleActionError(err, 'No pudimos aprobar la foto.');
  } finally {
    setBusy(item, false);
  }
}

function openPhoto(item: ProfilePhotoQueueItem): void {
  photoTarget.value = item;
  photoOpen.value = true;
}

function openReject(item: ProfilePhotoQueueItem): void {
  rejectTarget.value = item;
  rejectReason.value = DEFAULT_REJECT_REASON;
  rejectOpen.value = true;
}

async function confirmReject(): Promise<void> {
  const item = rejectTarget.value;
  if (!item || rejectBusy.value) return;
  rejectBusy.value = true;
  try {
    await photosApi.reject(item.userId, rejectReason.value);
    rejectOpen.value = false;
    dropFromQueue(item);
    $q.notify({ type: 'positive', message: 'Foto rechazada.' });
    await adminStore.fetchPhotoReviewCount();
  } catch (err: unknown) {
    rejectOpen.value = false;
    await handleActionError(err, 'No pudimos rechazar la foto.');
  } finally {
    rejectBusy.value = false;
  }
}

function openRemove(item: ProfilePhotoQueueItem): void {
  removeTarget.value = item;
  removeOpen.value = true;
}

async function confirmRemove(): Promise<void> {
  const item = removeTarget.value;
  if (!item || removeBusy.value) return;
  removeBusy.value = true;
  try {
    await photosApi.remove(item.userId);
    removeOpen.value = false;
    dropFromQueue(item);
    $q.notify({ type: 'positive', message: 'Foto quitada.' });
    await adminStore.fetchPhotoReviewCount();
  } catch (err: unknown) {
    removeOpen.value = false;
    await handleActionError(err, 'No pudimos quitar la foto.');
  } finally {
    removeBusy.value = false;
  }
}

onMounted(() => {
  void loadBranches();
  void loadQueue();
});
</script>
