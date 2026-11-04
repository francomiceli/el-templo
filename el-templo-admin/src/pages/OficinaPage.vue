<!--
  Oficina (fase 205): central de temas de gestión. Pantalla única con la lista a la
  izquierda y el detalle a la derecha (escritorio) o alternados (móvil, D-16).
  `/oficina/:topicId` abre el tema directo. Se refresca sola cada 60 s (D-19).
-->
<template>
  <q-page class="q-pa-md">
    <!-- Cabecera y filtros: en móvil, con un tema abierto, el detalle ocupa todo -->
    <template v-if="showList">
      <div class="row items-center q-mb-md">
        <div class="col">
          <div class="text-h5">Oficina</div>
          <div class="text-caption text-grey-7">Los temas que la gerencia tiene entre manos</div>
        </div>
        <q-btn
          color="primary"
          icon="add"
          label="Nuevo tema"
          no-caps
          unelevated
          @click="openCreate"
        />
      </div>

      <div class="row items-center q-gutter-sm q-mb-md">
        <q-btn-toggle
          v-model="view"
          class="oficina-toggle"
          toggle-color="primary"
          :options="VIEW_OPTIONS"
          dense
          unelevated
          no-caps
        />
        <q-btn-toggle
          v-model="origin"
          class="oficina-toggle"
          toggle-color="primary"
          :options="ORIGIN_OPTIONS"
          dense
          unelevated
          no-caps
        />
        <q-input
          v-model="search"
          class="oficina-search"
          dense
          outlined
          clearable
          debounce="300"
          maxlength="200"
          aria-label="Buscar temas"
          placeholder="Buscar por título o contenido"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>
    </template>

    <div :class="isMobile ? '' : 'row no-wrap q-col-gutter-none oficina-body'">
      <!-- LISTA -->
      <div v-if="showList" :class="isMobile ? '' : 'oficina-list-col'">
        <OficinaTopicList
          :topics="topics"
          :selected-id="selectedId"
          :loading="loadingList"
          :empty-message="emptyMessage"
          @select="selectTopic"
        />
      </div>

      <!-- DETALLE -->
      <div v-if="showDetail" :class="isMobile ? '' : 'col oficina-detail-col'">
        <q-card v-if="selectedId !== null && detail === null && loadingDetail" flat bordered>
          <div class="flex flex-center q-pa-xl">
            <q-spinner-dots size="40px" color="primary" />
          </div>
        </q-card>
        <OficinaTopicDetail
          v-else
          ref="detailRef"
          :topic="detail"
          :staff="staff"
          :current-user-id="currentUserId"
          :busy="busy"
          :show-back="isMobile"
          @patch="onPatch"
          @comment="onComment"
          @edit="openEdit"
          @back="clearSelection"
        />
      </div>
    </div>

    <OficinaTopicDialog
      v-model="dialogOpen"
      :mode="dialogMode"
      :topic="dialogMode === 'edit' ? detail : null"
      :staff="staff"
      @saved="onDialogSaved"
    />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useAdminStore } from 'src/stores/useAdminStore';
import {
  useOfficeApi,
  type OfficeListView,
  type OfficeStaff,
  type OfficeTopicDetail,
  type OfficeTopicListItem,
  type OfficeTopicOrigin,
  type PatchTopicInput,
} from 'src/composables/useOfficeApi';
import OficinaTopicList from 'src/components/oficina/OficinaTopicList.vue';
import OficinaTopicDetail from 'src/components/oficina/OficinaTopicDetail.vue';
import OficinaTopicDialog from 'src/components/oficina/OficinaTopicDialog.vue';

const log = createLogger('OficinaPage');
const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const adminStore = useAdminStore();
const officeApi = useOfficeApi();

const VIEW_OPTIONS: Array<{ label: string; value: OfficeListView }> = [
  { label: 'Abiertos', value: 'abiertos' },
  { label: 'Míos', value: 'mios' },
  { label: 'Dormidos', value: 'dormidos' },
  { label: 'Cerrados', value: 'cerrados' },
];

const ORIGIN_OPTIONS: Array<{ label: string; value: '' | OfficeTopicOrigin }> = [
  { label: 'Todos', value: '' },
  { label: 'Manuales', value: 'manual' },
  { label: 'Del sistema', value: 'sistema' },
];

// ── Estado ────────────────────────────────────────────────────────

const view = ref<OfficeListView>('abiertos');
const origin = ref<'' | OfficeTopicOrigin>('');
const search = ref<string | null>('');

const topics = ref<OfficeTopicListItem[]>([]);
const staff = ref<OfficeStaff[]>([]);
const selectedId = ref<number | null>(null);
const detail = ref<OfficeTopicDetail | null>(null);

const loadingList = ref(false);
const loadingDetail = ref(false);
const busy = ref(false);

const dialogOpen = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');

const detailRef = ref<InstanceType<typeof OficinaTopicDetail> | null>(null);

const currentUserId = computed(() => authStore.user?.id ?? 0);
const isMobile = computed(() => $q.screen.lt.md);
const showList = computed(() => !isMobile.value || selectedId.value === null);
const showDetail = computed(() => !isMobile.value || selectedId.value !== null);

const emptyMessage = computed(() => {
  if ((search.value ?? '').trim() !== '') return 'No encontramos temas con esa búsqueda.';
  switch (view.value) {
    case 'mios':
      return 'No tenés temas asignados. Tomá uno desde su detalle.';
    case 'dormidos':
      return 'No hay temas dormidos.';
    case 'cerrados':
      return 'Todavía no se cerró ningún tema.';
    default:
      return 'No hay temas abiertos. Tocá Nuevo tema para arrancar.';
  }
});

// ── Carga ─────────────────────────────────────────────────────────

let listSeq = 0;
let detailSeq = 0;

/** Un 4xx esperado (validación, permisos) no es un error del sistema: va como warning. */
function logFailure(message: string, err: unknown): void {
  const context = { error: err instanceof Error ? err.message : 'desconocido' };
  if (isExpectedClientError(err)) log.warn(message, context);
  else log.error(message, context);
}

async function loadTopics(opts: { background?: boolean } = {}): Promise<void> {
  const seq = ++listSeq;
  if (!opts.background) loadingList.value = true;
  try {
    const list = await officeApi.listTopics({
      view: view.value,
      origin: origin.value === '' ? undefined : origin.value,
      q: (search.value ?? '').trim() || undefined,
    });
    if (seq !== listSeq) return; // llegó una respuesta más nueva
    topics.value = [...list].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  } catch (err: unknown) {
    if (seq !== listSeq) return;
    logFailure('No se pudo cargar la lista de temas', err);
    if (!opts.background) {
      $q.notify({ type: 'negative', message: extractError(err, 'No pudimos cargar los temas') });
    }
  } finally {
    if (seq === listSeq) loadingList.value = false;
  }
}

async function loadStaff(): Promise<void> {
  try {
    staff.value = await officeApi.listStaff();
  } catch (err: unknown) {
    log.error('No se pudo cargar el equipo', {
      error: err instanceof Error ? err.message : 'desconocido',
    });
  }
}

/** Marca el tema como visto y refresca la pelotita del menú. Falla en silencio. */
async function markSeen(id: number): Promise<void> {
  try {
    await officeApi.markSeen(id);
    const item = topics.value.find((t) => t.id === id);
    if (item) item.unseen = false;
    void adminStore.fetchOficinaBadge();
  } catch (err: unknown) {
    log.warn('No se pudo marcar el tema como visto', {
      error: err instanceof Error ? err.message : 'desconocido',
    });
  }
}

async function loadDetail(id: number, opts: { background?: boolean } = {}): Promise<void> {
  const seq = ++detailSeq;
  if (!opts.background) loadingDetail.value = true;
  try {
    const loaded = await officeApi.getTopic(id);
    if (selectedId.value !== id || seq !== detailSeq) return; // selección cambiada o respuesta vieja
    const changed =
      detail.value?.id !== id || detail.value.lastActivityAt !== loaded.lastActivityAt;
    detail.value = loaded;
    if (!opts.background || changed) await markSeen(id);
  } catch (err: unknown) {
    if (selectedId.value !== id || seq !== detailSeq) return;
    logFailure('No se pudo cargar el tema', err);
    if (!opts.background) {
      $q.notify({ type: 'negative', message: extractError(err, 'No pudimos cargar el tema') });
      clearSelection();
    }
  } finally {
    if (selectedId.value === id) loadingDetail.value = false;
  }
}

// ── Selección y ruta ──────────────────────────────────────────────

function parseTopicId(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function selectTopic(id: number): void {
  if (selectedId.value === id) return;
  selectedId.value = id;
  detail.value = null;
  void router.replace(`/oficina/${id}`);
  void loadDetail(id);
}

function clearSelection(): void {
  selectedId.value = null;
  detail.value = null;
  loadingDetail.value = false;
  // Solo si seguimos en Oficina: si ya se navegó a otra pantalla no hay que arrastrarlo de vuelta.
  if (route.path.startsWith('/oficina/')) void router.replace('/oficina');
}

// Atrás/adelante del navegador o un link directo cambian el tema abierto.
watch(
  () => route.params.topicId,
  (param) => {
    const id = parseTopicId(param);
    if (id === selectedId.value) return;
    if (id === null) {
      selectedId.value = null;
      detail.value = null;
      return;
    }
    selectedId.value = id;
    detail.value = null;
    void loadDetail(id);
  }
);

watch([view, origin], () => {
  void loadTopics();
});
watch(search, () => {
  void loadTopics();
});

// ── Acciones ──────────────────────────────────────────────────────

async function onPatch(input: PatchTopicInput): Promise<void> {
  const current = detail.value;
  if (!current || busy.value) return;
  busy.value = true;
  detailSeq++; // invalida refrescos en vuelo: traerían el tema sin este cambio
  try {
    detail.value = await officeApi.patchTopic(current.id, input);
    void loadTopics({ background: true });
    void adminStore.fetchOficinaBadge();
  } catch (err: unknown) {
    logFailure('No se pudo actualizar el tema', err);
    $q.notify({ type: 'negative', message: extractError(err, 'No pudimos actualizar el tema') });
    // Puede haber cambiado desde otra pantalla: se vuelve a leer para mostrar lo real.
    void loadDetail(current.id, { background: true });
  } finally {
    busy.value = false;
  }
}

async function onComment(payload: { body: string; mentionUserIds: number[] }): Promise<void> {
  const current = detail.value;
  if (!current || busy.value) return;
  busy.value = true;
  detailSeq++; // invalida refrescos en vuelo: traerían el tema sin este comentario
  try {
    detail.value = await officeApi.addComment(current.id, payload.body, payload.mentionUserIds);
    detailRef.value?.clearComposer(payload.body);
    void loadTopics({ background: true });
    void adminStore.fetchOficinaBadge();
  } catch (err: unknown) {
    logFailure('No se pudo publicar el comentario', err);
    // El borrador queda en el compositor para reintentar.
    $q.notify({
      type: 'negative',
      message: extractError(err, 'No pudimos publicar el comentario'),
    });
    void loadDetail(current.id, { background: true });
  } finally {
    busy.value = false;
  }
}

function openCreate(): void {
  dialogMode.value = 'create';
  dialogOpen.value = true;
}

function openEdit(): void {
  if (!detail.value) return;
  dialogMode.value = 'edit';
  dialogOpen.value = true;
}

async function onDialogSaved(saved: OfficeTopicDetail): Promise<void> {
  if (dialogMode.value === 'edit') {
    detail.value = saved;
    void loadTopics({ background: true });
    return;
  }
  // Un tema recién creado tiene que verse: si los filtros actuales lo esconden, se limpian.
  const ownsIt = saved.assignees.some((a) => a.id === currentUserId.value);
  const viewHides =
    view.value === 'cerrados' || view.value === 'dormidos' || (view.value === 'mios' && !ownsIt);
  const originHides = origin.value === 'sistema';
  const searchHides = (search.value ?? '').trim() !== '';
  if (viewHides || originHides || searchHides) {
    // Los watchers de los filtros recargan la lista.
    if (viewHides) view.value = 'abiertos';
    if (originHides) origin.value = '';
    if (searchHides) search.value = '';
  } else {
    await loadTopics();
  }
  selectedId.value = saved.id;
  detail.value = saved;
  void router.replace(`/oficina/${saved.id}`);
  void markSeen(saved.id);
}

// ── Refresco automático (D-19) ────────────────────────────────────

/**
 * Cada minuto con la pestaña visible, y al volver a la pestaña: la lista y el tema abierto
 * se recargan sin spinner. El borrador del compositor vive en su componente, así que
 * recargar el detalle no pisa lo que se está escribiendo.
 */
const BACKGROUND_REFRESH_MS = 60_000;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

let refreshing = false;

async function backgroundRefresh(): Promise<void> {
  if (refreshing || document.hidden || busy.value || dialogOpen.value) return;
  refreshing = true;
  try {
    if (selectedId.value !== null) await loadDetail(selectedId.value, { background: true });
    await loadTopics({ background: true });
    void adminStore.fetchOficinaBadge();
  } finally {
    refreshing = false;
  }
}

function onVisibilityChange(): void {
  if (!document.hidden) void backgroundRefresh();
}

// ── Ciclo de vida ─────────────────────────────────────────────────

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibilityChange);
  refreshTimer = setInterval(() => void backgroundRefresh(), BACKGROUND_REFRESH_MS);

  const routeId = parseTopicId(route.params.topicId);
  if (routeId !== null) {
    selectedId.value = routeId;
    void loadDetail(routeId);
  }
  await Promise.all([loadTopics(), loadStaff()]);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (refreshTimer !== null) clearInterval(refreshTimer);
  officeApi.cleanup();
});
</script>

<style scoped lang="scss">
.oficina-toggle {
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 4px;
}

.oficina-search {
  min-width: 240px;
  flex: 1 1 240px;
  max-width: 360px;
}

.oficina-list-col {
  flex: 0 0 440px;
  width: 440px;
  max-width: 40%;
  margin-right: 16px;
}

.oficina-detail-col {
  min-width: 0;
}
</style>
