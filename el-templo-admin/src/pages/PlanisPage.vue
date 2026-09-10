<template>
  <!-- Planis (2026-09): la plani de la semana (esta o la que viene), aprobada o
       no, vista EXACTAMENTE como en el televisor. Reemplaza el PDF que un profe
       subía al Drive para que el resto revisara la semana siguiente.
       La pantalla real ('/pantalla-tv?preview=1') va embebida en un iframe de
       la misma sesión; esta página solo elige semana/día/bloque/nivel y se lo
       manda por postMessage (ver el bloque "Modo vista previa" en
       TvScreenPage.vue). Sin selector de sede: la plani es una sola. -->
  <q-page padding class="planis">
    <!-- Semana -->
    <div class="row items-center q-col-gutter-sm q-mb-md">
      <div class="col-auto">
        <q-btn
          flat
          round
          dense
          icon="chevron_left"
          aria-label="Semana anterior"
          :disable="week <= 1"
          @click="shiftWeek(-1)"
        />
      </div>
      <div class="col text-center">
        <div class="text-subtitle1 text-weight-bold">Semana {{ week }}</div>
        <div class="text-caption text-grey-7">{{ weekLabel }}</div>
      </div>
      <div class="col-auto">
        <q-btn
          flat
          round
          dense
          icon="chevron_right"
          aria-label="Semana siguiente"
          :disable="week >= 52"
          @click="shiftWeek(1)"
        />
      </div>
      <div class="col-12 col-sm-auto row q-gutter-xs justify-center">
        <q-btn
          dense
          no-caps
          color="primary"
          label="Esta semana"
          :unelevated="week === currentWeek"
          :outline="week !== currentWeek"
          @click="goToWeek(currentWeek)"
        />
        <q-btn
          dense
          no-caps
          color="primary"
          label="Próxima"
          :unelevated="week === nextWeek"
          :outline="week !== nextWeek"
          @click="goToWeek(nextWeek)"
        />
        <q-btn
          flat
          round
          dense
          icon="refresh"
          aria-label="Actualizar"
          :loading="loadingWeek"
          @click="reload"
        />
      </div>
    </div>

    <q-banner v-if="weekError" dense class="bg-negative text-white q-mb-md">
      <template #avatar><q-icon name="error" /></template>
      {{ weekError }}
    </q-banner>

    <!-- Días: lunes a sábado, con el estado de aprobación en el color -->
    <div class="row q-col-gutter-xs q-mb-sm">
      <div v-for="d in days" :key="d.date" class="col-2">
        <q-btn
          class="full-width planis__day"
          dense
          no-caps
          :color="statusColor(d.status)"
          :unelevated="d.date === selectedDate"
          :outline="d.date !== selectedDate"
          :aria-label="`${dayLong(d.dayName)} ${dayNumber(d.date)}, ${statusLabel(d.status)}`"
          @click="selectDay(d.date)"
        >
          <div class="column items-center">
            <span class="text-caption text-weight-bold">{{ dayShort(d.dayName) }}</span>
            <span class="text-caption">{{ dayNumber(d.date) }}</span>
          </div>
        </q-btn>
      </div>
    </div>
    <div class="row items-center q-gutter-sm q-mb-md text-caption text-grey-7">
      <span><q-badge color="positive" rounded class="q-mr-xs" />Aprobada</span>
      <span><q-badge color="warning" rounded class="q-mr-xs" />Pendiente de aprobación</span>
      <span><q-badge color="grey-6" rounded class="q-mr-xs" />Sin planificar</span>
    </div>

    <!-- Día elegido -->
    <div v-if="selectedDay" class="row items-center q-gutter-sm q-mb-md">
      <q-badge :color="statusColor(selectedDay.status)" :label="statusLabel(selectedDay.status)" />
      <span class="text-body2">{{ selectedDayTitle }}</span>
    </div>

    <q-banner v-if="previewError" dense class="bg-negative text-white q-mb-md">
      <template #avatar><q-icon name="error" /></template>
      {{ previewError }}
    </q-banner>

    <!-- Bloques y niveles: los mismos botones que el control del TV -->
    <template v-if="screenState && screenState.status !== 'none'">
      <div class="text-overline text-grey-7">Bloque</div>
      <div class="row q-col-gutter-xs q-mb-sm">
        <div v-for="b in blockButtons" :key="b.role" class="col-4 col-sm-auto">
          <q-btn
            class="full-width"
            dense
            no-caps
            color="primary"
            :label="b.label"
            :unelevated="isActiveBlock(b.role)"
            :outline="!isActiveBlock(b.role)"
            @click="selectBlock(b.role)"
          />
        </div>
      </div>
      <div class="text-overline text-grey-7">Niveles</div>
      <div class="row q-col-gutter-xs q-mb-md">
        <div v-for="p in levelPairs" :key="p.levels[0]" class="col-4">
          <q-btn
            class="full-width"
            dense
            no-caps
            color="secondary"
            :label="p.label"
            :disable="!p.present || levelsDisabled"
            :unelevated="isActivePair(p)"
            :outline="!isActivePair(p)"
            @click="selectLevel(p.targetLevel)"
          />
        </div>
      </div>
    </template>
    <div
      v-else-if="screenState && screenState.status === 'none'"
      class="text-body2 text-grey-7 q-mb-md"
    >
      Este día todavía no tiene planificación.
    </div>

    <!-- La pantalla, tal cual -->
    <div class="planis__frame">
      <iframe
        ref="frameEl"
        :src="frameSrc"
        class="planis__iframe"
        title="Vista previa del televisor"
      ></iframe>
      <div v-if="loadingDay" class="planis__loading">
        <q-spinner color="primary" size="36px" />
      </div>
    </div>
    <div class="row items-center justify-between q-col-gutter-sm q-mt-sm">
      <div class="col text-caption text-grey-7">
        Se ve igual que en el televisor de la sede. La plani es la misma para todas las sedes.
      </div>
      <div class="col-auto">
        <q-btn
          flat
          dense
          no-caps
          color="primary"
          icon="open_in_full"
          label="Pantalla completa"
          @click="openFullscreen"
        />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  useTvApi,
  type TvControlBlockSummary,
  type TvPreviewStatus,
  type TvPreviewWeekDay,
} from 'src/composables/useTvApi';
import {
  buildBlockButtons,
  buildLevelPairs,
  buttonMatchesRole,
  type BlockButton,
  type LevelPairOption,
} from 'src/tv/control-options';
import {
  formatWeekLabel,
  getCurrentWeekNumber,
  toIsoDate,
  weekToIsoDate,
} from 'src/utils/weekDates';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';

const log = createLogger('PlanisPage');
const router = useRouter();
const tvApi = useTvApi();

// Mensajes del iframe (contrato en TvScreenPage.vue, sección "Modo vista previa").
const PREVIEW_MSG = 'tv-preview';
const PREVIEW_READY_MSG = 'tv-preview-ready';
const PREVIEW_STATE_MSG = 'tv-preview-state';
const PREVIEW_ERROR_MSG = 'tv-preview-error';

/** Lo que la pantalla embebida informa después de cada pintado. */
interface PreviewScreenState {
  date: string;
  dateLabel: string;
  status: TvPreviewStatus;
  mode: string;
  levels: string[];
  blocks: TvControlBlockSummary[];
  blockRole: string | null;
  level: string | null;
}

const DAY_SHORT: Record<string, string> = {
  lunes: 'Lun',
  martes: 'Mar',
  miercoles: 'Mié',
  jueves: 'Jue',
  viernes: 'Vie',
  sabado: 'Sáb',
};
const DAY_LONG: Record<string, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
};
const MONTH_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

// =========================================================================
// Semana y día
// =========================================================================

const currentWeek = getCurrentWeekNumber();
const nextWeek = Math.min(52, currentWeek + 1);
/** Arranca en la semana que viene: el caso de uso es revisarla antes de que empiece. */
const week = ref(nextWeek);
const weekLabel = computed(() => formatWeekLabel(week.value));
const days = ref<TvPreviewWeekDay[]>([]);
const loadingWeek = ref(false);
const weekError = ref<string | null>(null);

const selectedDate = ref<string>(defaultDateFor(nextWeek));
const selectedDay = computed(() => days.value.find((d) => d.date === selectedDate.value) ?? null);
const selectedDayTitle = computed(() => {
  const d = selectedDay.value;
  if (!d) return '';
  const date = new Date(d.date + 'T00:00:00');
  return `${dayLong(d.dayName)} ${date.getDate()} de ${MONTH_LONG[date.getMonth()]}`;
});

/** Hoy si la semana es la actual y hoy es día hábil; si no, el lunes. */
function defaultDateFor(targetWeek: number): string {
  const monday = weekToIsoDate(targetWeek);
  if (targetWeek !== currentWeek) return monday;
  const today = new Date();
  return today.getDay() === 0 ? monday : toIsoDate(today);
}

function dayShort(dayName: string): string {
  return DAY_SHORT[dayName] ?? dayName;
}
function dayLong(dayName: string): string {
  return DAY_LONG[dayName] ?? dayName;
}
function dayNumber(date: string): number {
  return new Date(date + 'T00:00:00').getDate();
}

function statusColor(status: TvPreviewStatus): string {
  if (status === 'approved') return 'positive';
  if (status === 'pending') return 'warning';
  return 'grey-6';
}
function statusLabel(status: TvPreviewStatus): string {
  if (status === 'approved') return 'Aprobada';
  if (status === 'pending') return 'Pendiente de aprobación';
  return 'Sin planificar';
}

async function loadWeek(): Promise<void> {
  loadingWeek.value = true;
  weekError.value = null;
  try {
    const data = await tvApi.getPreviewWeek(weekToIsoDate(week.value));
    days.value = data.days;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error cargando la semana de Planis', { error: message, week: week.value });
    weekError.value = extractError(err, 'No se pudo cargar la semana.');
  } finally {
    loadingWeek.value = false;
  }
}

function goToWeek(target: number): void {
  if (target === week.value) return;
  week.value = target;
  selectedDate.value = defaultDateFor(target);
  void loadWeek();
  sendSelection({ date: selectedDate.value, blockRole: null, level: null });
}

function shiftWeek(delta: number): void {
  const target = Math.max(1, Math.min(52, week.value + delta));
  goToWeek(target);
}

function reload(): void {
  void loadWeek();
  // Refrescar también la pantalla: la plani pudo cambiar (o aprobarse) recién.
  sendSelection({ date: selectedDate.value, blockRole: blockRole.value, level: level.value }, true);
}

function selectDay(date: string): void {
  if (date === selectedDate.value) return;
  selectedDate.value = date;
  // Bloque y nivel se eligen de nuevo por día: el roster puede cambiar
  // (sábado ROM no tiene NUCLEUS; un día puede no tener sigma).
  sendSelection({ date, blockRole: null, level: null });
}

// =========================================================================
// Bloque y nivel (misma botonera que el control del TV)
// =========================================================================

const screenState = ref<PreviewScreenState | null>(null);
const loadingDay = ref(false);
const previewError = ref<string | null>(null);
const blockRole = ref<string | null>(null);
const level = ref<string | null>(null);

const blockButtons = computed<BlockButton[]>(() =>
  buildBlockButtons(screenState.value?.blocks ?? [])
);
const levelPairs = computed<LevelPairOption[]>(() =>
  buildLevelPairs(screenState.value?.levels ?? [], screenState.value?.mode ?? 'regular')
);
/** INITIUM/STRETCHING es lista compartida: no hay nivel que elegir. */
const levelsDisabled = computed(() => {
  const role = blockRole.value;
  if (role === null) return false;
  return screenState.value?.blocks.find((b) => b.role === role)?.shared === true;
});

function isActiveBlock(role: string): boolean {
  return blockRole.value !== null && buttonMatchesRole(role, blockRole.value);
}
function isActivePair(pair: LevelPairOption): boolean {
  return level.value !== null && pair.levels.includes(level.value);
}
function selectBlock(role: string): void {
  if (isActiveBlock(role)) return;
  sendSelection({ date: selectedDate.value, blockRole: role, level: level.value });
}
function selectLevel(target: string): void {
  if (target === level.value) return;
  sendSelection({ date: selectedDate.value, blockRole: blockRole.value, level: target });
}

// =========================================================================
// El iframe: la pantalla real en modo preview
// =========================================================================

const frameEl = ref<HTMLIFrameElement | null>(null);
/**
 * `src` fijo (la selección viaja por postMessage, no por la URL): cambiarlo
 * recargaría la pantalla entera en cada tap. La fecha inicial va en la URL
 * para que el primer pintado no espere el handshake.
 */
const frameSrc = router.resolve({
  path: '/pantalla-tv',
  query: { preview: '1', date: selectedDate.value },
}).href;

/** Última selección enviada, para reenviarla cuando el iframe avise que está listo. */
let lastSent: { date: string; blockRole: string | null; level: string | null } | null = null;

function sendSelection(
  sel: { date: string; blockRole: string | null; level: string | null },
  force = false
): void {
  lastSent = sel;
  previewError.value = null;
  if (sel.date !== screenState.value?.date || force) {
    loadingDay.value = true;
  }
  const target = frameEl.value?.contentWindow;
  if (!target) return;
  target.postMessage(
    { type: PREVIEW_MSG, date: sel.date, blockRole: sel.blockRole, level: sel.level },
    window.location.origin
  );
}

function onFrameMessage(event: MessageEvent): void {
  if (event.origin !== window.location.origin) return;
  if (event.source !== frameEl.value?.contentWindow) return;
  const data: unknown = event.data;
  if (typeof data !== 'object' || data === null) return;
  const msg = data as { type?: unknown; message?: unknown } & Partial<PreviewScreenState>;
  if (msg.type === PREVIEW_READY_MSG) {
    // La pantalla ya escucha: reenviar lo que el profe eligió mientras cargaba.
    if (lastSent) sendSelection(lastSent);
    return;
  }
  if (msg.type === PREVIEW_ERROR_MSG) {
    loadingDay.value = false;
    previewError.value =
      typeof msg.message === 'string' && msg.message !== ''
        ? `No se pudo cargar la vista previa: ${msg.message}`
        : 'No se pudo cargar la vista previa.';
    return;
  }
  if (msg.type !== PREVIEW_STATE_MSG || typeof msg.date !== 'string') return;
  // Un estado de un día que ya no es el elegido (respuesta tardía): se ignora.
  if (msg.date !== selectedDate.value) return;
  screenState.value = {
    date: msg.date,
    dateLabel: typeof msg.dateLabel === 'string' ? msg.dateLabel : '',
    status: msg.status === 'approved' || msg.status === 'pending' ? msg.status : 'none',
    mode: typeof msg.mode === 'string' ? msg.mode : 'regular',
    levels: Array.isArray(msg.levels) ? msg.levels : [],
    blocks: Array.isArray(msg.blocks) ? msg.blocks : [],
    blockRole: typeof msg.blockRole === 'string' ? msg.blockRole : null,
    level: typeof msg.level === 'string' ? msg.level : null,
  };
  // La pantalla es la fuente de verdad de lo que quedó pintado (con sus
  // fallbacks): la botonera refleja eso, no lo que se pidió.
  blockRole.value = screenState.value.blockRole;
  level.value = screenState.value.level;
  loadingDay.value = false;
}

function openFullscreen(): void {
  const query: Record<string, string> = { preview: '1', date: selectedDate.value };
  if (blockRole.value) query.block = blockRole.value;
  if (level.value) query.level = level.value;
  const href = router.resolve({ path: '/pantalla-tv', query }).href;
  window.open(href, '_blank', 'noopener');
}

// =========================================================================
// Ciclo de vida
// =========================================================================

onMounted(() => {
  window.addEventListener('message', onFrameMessage);
  lastSent = { date: selectedDate.value, blockRole: null, level: null };
  loadingDay.value = true;
  void loadWeek();
});

onUnmounted(() => {
  window.removeEventListener('message', onFrameMessage);
  tvApi.cleanup();
});
</script>

<style scoped>
.planis {
  max-width: 1100px;
  margin: 0 auto;
}
.planis__day {
  min-height: 48px;
}
.planis__frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #17140f;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
}
.planis__iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #17140f;
}
.planis__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(23, 20, 15, 0.45);
  pointer-events: none;
}
</style>
