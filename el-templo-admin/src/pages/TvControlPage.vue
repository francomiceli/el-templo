<template>
  <!-- Fase 164 — Control del TV de sucursal desde el celular del profe.      -->
  <!-- D-13: control CIEGO (no espeja la pantalla del televisor) y de botones -->
  <!-- GRANDES, en secciones BLOQUES / NIVELES / TIMER. Cada tap             -->
  <!-- manda un estado ABSOLUTO y el API devuelve el estado nuevo completo,   -->
  <!-- que es lo que redibuja la botonera.                                     -->
  <q-page padding class="tv-control">
    <div class="row items-center q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm">
        <!-- D-11: arranca en la sede del profe, con selector para cambiar. -->
        <q-select
          v-model="selectedBranchId"
          :options="branchOptions"
          label="Sede"
          outlined
          emit-value
          map-options
          :loading="branchesLoading"
          @update:model-value="onBranchChange"
        />
      </div>
      <div class="col-12 col-sm-auto">
        <q-btn
          icon="refresh"
          label="Actualizar"
          color="primary"
          outline
          :loading="refreshing"
          @click="onManualRefresh"
        />
      </div>
      <!-- Mismo camino que "Mostrar plani en el TV" del modal, pero disponible -->
      <!-- una vez adentro del control: abre la pantalla de la sede vigente.     -->
      <div class="col-12 col-sm-auto">
        <q-btn
          icon="cast"
          label="Mostrar plani en el TV"
          color="secondary"
          outline
          :disable="selectedBranchId === null"
          @click="onShowScreen"
        />
      </div>
    </div>

    <!-- Carga inicial -->
    <div v-if="initialLoading" class="row justify-center q-pa-xl">
      <q-spinner size="40px" color="primary" />
    </div>

    <!-- Error sin nada que mostrar -->
    <q-banner v-else-if="contextError && context === null" class="bg-negative text-white">
      <template #avatar>
        <q-icon name="error" />
      </template>
      {{ contextError }}
    </q-banner>

    <template v-else-if="context">
      <!-- D-10: el control SÍ avisa (el televisor no muestra nada, D-09). -->
      <q-banner v-if="!context.sessionApproved" class="bg-warning text-dark q-mb-md">
        <template #avatar>
          <q-icon name="warning" />
        </template>
        <div class="text-weight-medium">
          La sesi&oacute;n de hoy todav&iacute;a no est&aacute; aprobada.
        </div>
        <div class="text-caption">
          El televisor queda en reposo y los controles est&aacute;n deshabilitados hasta que se
          apruebe la plani del d&iacute;a.
        </div>
      </q-banner>

      <!-- Un fallo del refresco no vacía la botonera: se avisa y se conserva. -->
      <q-banner v-else-if="contextError" dense class="bg-warning text-dark q-mb-sm">
        <template #avatar>
          <q-icon name="warning" />
        </template>
        {{ contextError }}
      </q-banner>

      <!-- Clase no iniciada hoy: un solo botón grande. -->
      <div v-if="context.state === null" class="q-mt-lg">
        <q-btn
          class="tv-btn full-width"
          color="primary"
          unelevated
          size="lg"
          label="INICIAR CLASE"
          :disable="!canControl"
          :loading="busy"
          @click="onStartClass"
        />
      </div>

      <div v-else>
        <!-- ============================ BLOQUES ============================ -->
        <!-- Primera fila: navegación anterior/siguiente. Debajo, los bloques en dos     -->
        <!-- columnas (como el TIMER), con SOLO el nombre del bloque (sin el formato).    -->
        <div class="tv-section-title">BLOQUES</div>
        <div class="row q-col-gutter-sm">
          <div class="col-6">
            <q-btn
              class="tv-btn full-width"
              icon="chevron_left"
              label="ANTERIOR"
              color="primary"
              outline
              :disable="!canControl || blockIndex <= 0"
              @click="onBlockStep(-1)"
            />
          </div>
          <div class="col-6">
            <q-btn
              class="tv-btn full-width"
              icon="chevron_right"
              label="SIGUIENTE"
              color="primary"
              outline
              :disable="!canControl || blockIndex < 0 || blockIndex >= context.blocks.length - 1"
              @click="onBlockStep(1)"
            />
          </div>
          <div v-for="block in context.blocks" :key="block.role" class="col-6">
            <q-btn
              class="tv-btn full-width"
              :color="block.role === currentBlockRole ? 'primary' : 'grey-7'"
              :outline="block.role !== currentBlockRole"
              :unelevated="block.role === currentBlockRole"
              :label="blockName(block)"
              :disable="!canControl"
              @click="onSelectBlock(block.role)"
            />
          </div>
        </div>

        <!-- ============================ NIVELES ============================ -->
        <!-- Rediseño fase 164: el control elige el nivel por PARES (la pantalla   -->
        <!-- muestra los dos niveles del par lado a lado), no nivel por nivel.     -->
        <div class="tv-section-title">NIVELES</div>
        <div class="row q-col-gutter-sm">
          <div v-for="pair in levelPairs" :key="pair.levels[0]" class="col-12">
            <q-btn
              class="tv-btn full-width"
              :color="isActivePair(pair) ? 'primary' : 'grey-7'"
              :outline="!isActivePair(pair)"
              :unelevated="isActivePair(pair)"
              :label="pair.label"
              :disable="!canControl || levelsDisabled || !pair.present"
              @click="onSelectLevel(pair.targetLevel)"
            />
          </div>
        </div>
        <div v-if="levelsDisabled" class="text-caption text-grey-7 q-mt-xs">
          {{ currentBlockTitle }} es lista compartida: la ven todos los niveles.
        </div>

        <!-- ============================= TIMER ============================= -->
        <!-- D-18: exactamente iniciar / pausar-reanudar / reset. Nada de      -->
        <!-- mover rondas a mano en v1.                                        -->
        <div class="tv-section-title">TIMER</div>
        <div class="row q-col-gutter-sm">
          <div class="col-6">
            <q-btn
              class="tv-btn full-width"
              icon="play_arrow"
              label="INICIAR"
              color="positive"
              unelevated
              :disable="!canControl || timerStatus === 'running'"
              @click="onTimer('start')"
            />
          </div>
          <div class="col-6">
            <q-btn
              class="tv-btn full-width"
              :icon="timerStatus === 'paused' ? 'play_arrow' : 'pause'"
              :label="timerStatus === 'paused' ? 'REANUDAR' : 'PAUSAR'"
              color="warning"
              text-color="dark"
              unelevated
              :disable="!canControl || timerStatus === 'idle'"
              @click="onTimer(timerStatus === 'paused' ? 'resume' : 'pause')"
            />
          </div>
          <div class="col-6">
            <q-btn
              class="tv-btn full-width"
              icon="restart_alt"
              label="RESET"
              color="grey-7"
              outline
              :disable="!canControl"
              @click="onTimer('reset')"
            />
          </div>
          <div class="col-6">
            <q-btn
              class="tv-btn full-width"
              :icon="soundEnabled ? 'volume_up' : 'volume_off'"
              :label="soundEnabled ? 'SONIDO ON' : 'SONIDO OFF'"
              :color="soundEnabled ? 'primary' : 'grey-7'"
              :outline="!soundEnabled"
              :unelevated="soundEnabled"
              :disable="!canControl"
              @click="onToggleSound"
            />
          </div>
        </div>

        <!-- =========================== FIN DE CLASE ========================= -->
        <q-separator class="q-mb-md" />
        <div class="row q-col-gutter-sm">
          <div class="col-12 col-sm-6">
            <q-btn
              class="tv-btn full-width"
              :icon="isClosingScreen ? 'undo' : 'flag'"
              :label="isClosingScreen ? 'VOLVER A LA CLASE' : 'PANTALLA DE CIERRE'"
              color="secondary"
              :outline="!isClosingScreen"
              :unelevated="isClosingScreen"
              :disable="!canControl"
              @click="onToggleClosing"
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-btn
              class="tv-btn full-width"
              icon="power_settings_new"
              label="TERMINAR CLASE"
              color="negative"
              outline
              :disable="!canControl"
              @click="confirmEndOpen = true"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- Selección de sedes del día (1ª entrada del profe al control hoy): -->
    <!-- una sede por turno, porque un profe puede manejar dos sedes distintas -->
    <!-- en el día. Confirmar persiste la elección y setea la sede del turno   -->
    <!-- vigente; ver openSedeSelection/confirmSedeSelection.                 -->
    <q-dialog v-model="sedeSelectionOpen" persistent>
      <q-card style="min-width: 340px">
        <q-card-section>
          <div class="text-h6">¿Qué sede vas a manejar hoy?</div>
          <div class="text-body2 text-grey-7 q-mt-xs">
            Elegí la sede de cada turno. Vas a manejar la pantalla de esa sede, así que revisá que
            esté bien.
          </div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-select
            v-model="morningBranchId"
            :options="branchOptions"
            label="Turno mañana"
            outlined
            emit-value
            map-options
          >
            <template v-if="turnoActual === 'morning'" #append>
              <q-badge color="primary" label="turno actual" />
            </template>
          </q-select>
          <q-select
            v-model="afternoonBranchId"
            :options="branchOptions"
            label="Turno tarde"
            outlined
            emit-value
            map-options
          >
            <template v-if="turnoActual === 'afternoon'" #append>
              <q-badge color="primary" label="turno actual" />
            </template>
          </q-select>
        </q-card-section>
        <q-card-actions>
          <q-btn
            class="full-width"
            unelevated
            size="lg"
            color="primary"
            label="Confirmar sedes del día"
            @click="confirmSedeSelection"
          />
        </q-card-actions>

        <q-separator class="q-my-sm" />

        <!-- Camino directo del televisor de pared: abrir la pantalla con la plani  -->
        <!-- de una sede puntual (su PROPIO selector, no la del turno), sin entrar  -->
        <!-- al control. Ver showScreenFromSelection.                               -->
        <q-card-section>
          <div class="text-subtitle1 text-weight-medium">Mostrar plani en el TV</div>
          <div class="text-body2 text-grey-7 q-mt-xs q-mb-md">
            Para el televisor de la sede: abre la pantalla con la plani del día, sin pasar por el
            control.
          </div>
          <q-select
            v-model="screenBranchId"
            :options="branchOptions"
            label="Sede de la pantalla"
            outlined
            emit-value
            map-options
          />
        </q-card-section>
        <q-card-actions>
          <q-btn
            class="full-width"
            outline
            size="lg"
            color="secondary"
            icon="cast"
            label="Mostrar plani en el TV"
            :disable="screenBranchId === null"
            @click="showScreenFromSelection"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="sedeWarningOpen" persistent>
      <q-card style="min-width: 320px">
        <q-card-section>
          <div class="text-h6">Verificá la sede</div>
        </q-card-section>
        <q-card-section class="text-body2">
          Chequeá que seleccionaste la sede correcta. Si está mal elegida vas a manejar la
          pantalla de otra sede.
          <div class="text-weight-bold q-mt-sm">{{ selectedBranchLabel }}</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            class="full-width"
            unelevated
            size="lg"
            color="primary"
            label="Entendido, la sede es correcta"
            @click="sedeWarningOpen = false"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="blockConfirmOpen">
      <q-card style="min-width: 320px">
        <q-card-section>
          <div class="text-h6">¿Pasar al bloque {{ pendingBlockLabel }}?</div>
        </q-card-section>
        <q-card-section class="text-body2">
          Cambiar de bloque reinicia el cronómetro del bloque actual. Confirmá para no
          interrumpirlo por error.
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey-7" v-close-popup />
          <q-btn
            unelevated
            color="primary"
            label="Sí, pasar al bloque"
            @click="confirmBlockChange"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="confirmEndOpen" persistent>
      <q-card style="min-width: 320px">
        <q-card-section>
          <div class="text-h6">Terminar la clase</div>
        </q-card-section>
        <q-card-section class="text-body2">
          El televisor vuelve a la pantalla de reposo (reloj y logo). Para retomar hay que iniciar
          la clase de nuevo desde el primer bloque.
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup flat label="Cancelar" color="grey-8" />
          <q-btn flat label="Terminar" color="negative" :loading="busy" @click="onEndClass" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useMembersApi } from 'src/composables/useMembersApi';
import {
  useTvApi,
  type TvControlBlock,
  type TvControlContext,
  type TvStateWrite,
} from 'src/composables/useTvApi';
import { createLogger } from 'src/utils/logger';
import { isExpectedClientError } from 'src/utils/extract-error';
import type { BranchOption } from 'src/types/member';

const log = createLogger('TvControlPage');
const $q = useQuasar();
const router = useRouter();
const authStore = useAuthStore();
const membersApi = useMembersApi();
const tvApi = useTvApi();

/**
 * Refresco de cortesía: el control es ciego (D-13) y no necesita espejo, pero
 * dos profes de la misma sede pueden escribir a la vez (D-12: última escritura
 * gana, sin avisos). Un refresco lento evita quedarse con una botonera que
 * describe un estado que ya no existe.
 */
const REFRESH_MS = 30000;

/**
 * En sesión ROM (sábado) no existe la escalera alfa/delta/sigma: son dos
 * tiers rotulados BÁSICO / AVANZADO (D-23).
 */
const ROM_LEVEL_LABELS: Record<string, string> = {
  alfa: 'BÁSICO',
  delta: 'AVANZADO',
};

/**
 * Pares de nivel del TV (rediseño fase 164 — el control elige el nivel por
 * PARES, no por nivel individual). Espejo a propósito de `LEVEL_PAIRS` en
 * `el-templo-api/src/modules/tv/roster.ts`: cambiar uno REQUIERE el cambio
 * espejo en el otro.
 */
const LEVEL_PAIRS: readonly (readonly [string, string])[] = [
  ['alfa', 'delta'],
  ['sigma', 'kairos'],
  ['omega', 'spartan'],
];

/** Nombre completo de cada nivel (sesión regular), para el label del par. */
const LEVEL_NAME_LABELS: Record<string, string> = {
  alfa: 'ALFA',
  delta: 'DELTA',
  sigma: 'SIGMA',
  kairos: 'KAIROS',
  omega: 'OMEGA',
  spartan: 'SPARTAN',
};

/** Un botón de par de nivel: a qué nivel apunta el tap y cómo se rotula. */
interface LevelPairOption {
  levels: readonly string[];
  label: string;
  /** Primer nivel del par presente hoy — el que manda `onSelectLevel`. */
  targetLevel: string;
  /** Si el par tiene al menos un nivel planificado hoy (si no, el botón se ve pero va deshabilitado). */
  present: boolean;
}

// =========================================================================
// Estado
// =========================================================================

const context = ref<TvControlContext | null>(null);
const initialLoading = ref(true);
const refreshing = ref(false);
const contextError = ref<string | null>(null);
/** Una request de control en vuelo: bloquea la botonera contra el doble tap. */
const busy = ref(false);
const confirmEndOpen = ref(false);
/** Confirmación antes de cambiar de bloque: un mis-tap no debe interrumpir el bloque en curso. */
const blockConfirmOpen = ref(false);
const pendingBlockRole = ref<string | null>(null);
/** Advertencia de sede: se abre explícitamente (re-entrada del día o cambio manual), no al montar. */
const sedeWarningOpen = ref(false);
/** Modal de selección de sedes por turno: solo la 1ª vez que el profe entra en el día. */
const sedeSelectionOpen = ref(false);
const morningBranchId = ref<number | null>(null);
const afternoonBranchId = ref<number | null>(null);
/** Sede de la pantalla del TV — selector propio, independiente de las de turno. */
const screenBranchId = ref<number | null>(null);

const branches = ref<BranchOption[]>([]);
const branchesLoading = ref(false);
const selectedBranchId = ref<number | null>(null);

let refreshId: ReturnType<typeof setInterval> | null = null;

// =========================================================================
// Sedes — un televisor cuelga de una pared, así que las sedes virtuales
// (online) se filtran. La 1ª vez que el profe entra al control en el día
// elige, por un modal, la sede de cada turno (mañana/tarde) — un profe puede
// manejar dos sedes distintas en el día. Esa elección se persiste por fecha
// en localStorage (DAILY_SEDES_KEY); en re-entradas del mismo día se usa la
// sede del turno vigente sin volver a preguntar, y se muestra el aviso
// "verificá la sede". El gate real de acceso es requireBranchAccess en el API.
// =========================================================================

type Turno = 'morning' | 'afternoon';
const DAILY_SEDES_KEY = 'tv-control-sedes';

/** YYYY-MM-DD en hora local del dispositivo (el control está físicamente en la sede). */
function todayStr(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** Turno actual por hora local: mañana <12:00, tarde >=12:00. */
function currentTurno(): Turno {
  return new Date().getHours() < 12 ? 'morning' : 'afternoon';
}

interface DailySedes {
  morning: number | null;
  afternoon: number | null;
}

/** Devuelve la selección guardada SOLO si es de hoy; null si no hay o es de otro día. */
function loadDailySedes(): DailySedes | null {
  try {
    const raw = localStorage.getItem(DAILY_SEDES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      date?: string;
      morning?: number | null;
      afternoon?: number | null;
    };
    if (parsed.date !== todayStr()) return null;
    return { morning: parsed.morning ?? null, afternoon: parsed.afternoon ?? null };
  } catch {
    return null;
  }
}

function saveDailySedes(s: DailySedes): void {
  try {
    localStorage.setItem(
      DAILY_SEDES_KEY,
      JSON.stringify({ date: todayStr(), morning: s.morning, afternoon: s.afternoon })
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.warn('no se pudo guardar la selección de sedes del día', { error: message });
  }
}

const branchOptions = computed(() =>
  branches.value.filter((b) => !b.isVirtual).map((b) => ({ label: b.name, value: b.id }))
);

/** Label de la sede seleccionada para el modal de advertencia (reactivo: se actualiza solo cuando cargan las sedes). */
const selectedBranchLabel = computed(
  () => branchOptions.value.find((o) => o.value === selectedBranchId.value)?.label ?? 'cargando…'
);

/** Turno vigente, para resaltarlo en el modal de selección. */
const turnoActual = computed<Turno>(() => currentTurno());

/** Un id sirve como opción si existe en branchOptions (sede real, no virtual). */
function isValidOption(id: number | null | undefined): id is number {
  return id != null && branchOptions.value.some((o) => o.value === id);
}

/** Sede de casa del profe (fallback) o la primera opción. */
function homeSedeFallback(): number | null {
  const own = branchOptions.value.find((o) => o.value === authStore.user?.branchId);
  return own?.value ?? branchOptions.value[0]?.value ?? null;
}

/** Sede a manejar para un turno: la guardada si es válida, si no fallback a casa. */
function sedeForTurno(turno: Turno, saved: DailySedes | null): number | null {
  const id = turno === 'morning' ? saved?.morning : saved?.afternoon;
  return isValidOption(id) ? id : homeSedeFallback();
}

async function fetchBranches(): Promise<void> {
  branchesLoading.value = true;
  try {
    branches.value = await membersApi.getBranches();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error cargando sedes', { error: message });
    $q.notify({ type: 'negative', message: 'No se pudieron cargar las sedes' });
  } finally {
    branchesLoading.value = false;
  }
}

/** Abre el modal de selección por turno, pre-cargando con la agenda del día. */
async function openSedeSelection(): Promise<void> {
  let morning: number | null = null;
  let afternoon: number | null = null;
  try {
    const sched = await tvApi.getCoachTodaySchedule();
    morning = isValidOption(sched.morning) ? sched.morning : null;
    afternoon = isValidOption(sched.afternoon) ? sched.afternoon : null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.warn('coach-today falló, el profe elige la sede a mano', { error: message });
  }
  // Que el turno actual arranque con algo usable aunque no haya agenda.
  if (currentTurno() === 'morning' && morning === null) morning = homeSedeFallback();
  if (currentTurno() === 'afternoon' && afternoon === null) afternoon = homeSedeFallback();
  morningBranchId.value = morning;
  afternoonBranchId.value = afternoon;
  // Pre-carga usable para la pantalla: sede del turno vigente o, si no hay, la de casa.
  screenBranchId.value = (currentTurno() === 'morning' ? morning : afternoon) ?? homeSedeFallback();
  initialLoading.value = false; // el spinner de fondo no tiene sentido detrás del modal
  sedeSelectionOpen.value = true;
}

/** Confirma la selección del día: persiste, setea la sede del turno actual y carga contexto. */
async function confirmSedeSelection(): Promise<void> {
  saveDailySedes({ morning: morningBranchId.value, afternoon: afternoonBranchId.value });
  sedeSelectionOpen.value = false;
  selectedBranchId.value = sedeForTurno(currentTurno(), loadDailySedes());
  initialLoading.value = true;
  await fetchContext();
}

// =========================================================================
// Derivados de la botonera. Todo sale del contexto que devolvió el API: el
// control no infiere nada por su cuenta.
// =========================================================================

const canControl = computed(
  () => context.value !== null && context.value.sessionApproved && !busy.value
);

const currentBlockRole = computed(() => context.value?.state?.blockRole ?? '');
const blockIndex = computed(() =>
  context.value ? context.value.blocks.findIndex((b) => b.role === currentBlockRole.value) : -1
);
const currentBlock = computed(() =>
  blockIndex.value >= 0 ? (context.value?.blocks[blockIndex.value] ?? null) : null
);
const currentBlockTitle = computed(() => currentBlock.value?.title ?? 'Este bloque');
/** INITIUM/PYROS es lista compartida: no hay nivel que elegir. */
const levelsDisabled = computed(() => currentBlock.value?.shared === true);

const currentLevel = computed(() => context.value?.state?.level ?? '');

const timerStatus = computed(() => context.value?.state?.timerStatus ?? 'idle');
const soundEnabled = computed(() => context.value?.state?.soundEnabled === true);
const isClosingScreen = computed(() => context.value?.state?.screen === 'closing');

/**
 * Pares DISPONIBLES hoy: solo los que tienen al menos un nivel presente en
 * `context.levels` (un sábado ROM, por ejemplo, solo tiene alfa/delta — los
 * otros dos pares quedan afuera). El label junta los DOS nombres del par
 * completo, presente o no, unidos por " Y "; el tap manda el primer nivel del
 * par que sí está presente hoy.
 */
const levelPairs = computed<LevelPairOption[]>(() => {
  const levels = context.value?.levels ?? [];
  const mode = context.value?.mode ?? 'regular';
  // Los tres pares se muestran SIEMPRE (fila completa); un par sin ningún nivel
  // planificado hoy va deshabilitado en vez de esconderse.
  return LEVEL_PAIRS.map((pair) => {
    const present = pair.filter((lvl) => levels.includes(lvl));
    const names = pair.map((lvl) =>
      mode === 'rom' ? (ROM_LEVEL_LABELS[lvl] ?? lvl.toUpperCase()) : LEVEL_NAME_LABELS[lvl] ?? lvl.toUpperCase()
    );
    return {
      levels: pair,
      label: names.join(' Y '),
      targetLevel: present[0] ?? pair[0],
      present: present.length > 0,
    };
  });
});

function isActivePair(pair: LevelPairOption): boolean {
  return pair.levels.includes(currentLevel.value);
}

/**
 * Solo el NOMBRE del bloque, sin el formato: el `title` del API viene como
 * "NOMBRE · FORMATO" (ej. "NUCLEUS · AMRAP 10'"), y el botón del control muestra
 * únicamente la parte anterior al separador. Un bloque con customTitle (INITIUM)
 * no trae separador, así que se muestra entero.
 */
function blockName(block: TvControlBlock): string {
  const sep = ' · ';
  const i = block.title.indexOf(sep);
  return i >= 0 ? block.title.slice(0, i) : block.title;
}

/** Nombre del bloque destino pendiente de confirmar, para el modal. */
const pendingBlockLabel = computed(() => {
  const role = pendingBlockRole.value;
  if (role === null) return '';
  const block = (context.value?.blocks ?? []).find((b) => b.role === role);
  return block ? blockName(block) : '';
});

// =========================================================================
// Lectura del contexto
// =========================================================================

async function fetchContext(): Promise<void> {
  const branchId = selectedBranchId.value;
  if (branchId === null) return;
  // Nunca pisar lo que el profe está por cambiar: una respuesta vieja del
  // refresco no puede sobreescribir el resultado de un tap en vuelo.
  if (busy.value) return;

  try {
    context.value = await tvApi.getControlContext(branchId);
    contextError.value = null;
  } catch (err: unknown) {
    contextError.value = tvApi.error.value ?? 'No se pudo cargar el control del TV';
    if (!isExpectedClientError(err)) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error cargando el contexto del control', { error: message, branchId });
    }
  } finally {
    initialLoading.value = false;
  }
}

async function onManualRefresh(): Promise<void> {
  refreshing.value = true;
  try {
    await fetchContext();
  } finally {
    refreshing.value = false;
  }
}

async function onBranchChange(): Promise<void> {
  const saved = loadDailySedes() ?? { morning: null, afternoon: null };
  if (currentTurno() === 'morning') saved.morning = selectedBranchId.value;
  else saved.afternoon = selectedBranchId.value;
  saveDailySedes(saved);
  sedeWarningOpen.value = true;
  context.value = null;
  initialLoading.value = true;
  await fetchContext();
}

/**
 * Desde el modal: abre directo la pantalla (`/pantalla-tv`) de la sede elegida en
 * el selector PROPIO de la plani (no la del turno), sin pasar por el control. Es
 * el camino del televisor de pared. Misma pestaña: en el TV no hay otra a la que
 * volver, y en el celular del profe da igual.
 */
function showScreenFromSelection(): void {
  sedeSelectionOpen.value = false;
  openScreen(screenBranchId.value);
}

/**
 * Camino del televisor de pared, ya adentro del control: abre la pantalla
 * (`/pantalla-tv`) de la sede vigente. Mismo destino que el botón del modal.
 */
function onShowScreen(): void {
  openScreen(selectedBranchId.value);
}

/** Abre la pantalla del TV de una sede en la misma pestaña (fuente única del push). */
function openScreen(branchId: number | null): void {
  if (!isValidOption(branchId)) return;
  void router.push({ path: '/pantalla-tv', query: { branchId: String(branchId) } });
}

// =========================================================================
// Escrituras. Cada tap manda un estado ABSOLUTO (nunca "el que sigue") y se
// queda con el contexto que devuelve el API, que ya viene clampeado: si el
// servidor descartó un valor, la botonera se auto-corrige sola.
// =========================================================================

async function send(write: Omit<TvStateWrite, 'branchId'>): Promise<void> {
  const branchId = selectedBranchId.value;
  if (branchId === null || busy.value) return;

  busy.value = true;
  try {
    context.value = await tvApi.writeState({ branchId, ...write });
    contextError.value = null;
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: tvApi.error.value ?? 'No se pudo aplicar el cambio',
    });
    if (!isExpectedClientError(err)) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error escribiendo el estado del TV', { error: message, branchId });
    }
    // El estado real puede haber cambiado (otra sesión, sesión desaprobada):
    // se relee para que los botones dejen de mentir.
    busy.value = false;
    await fetchContext();
    return;
  } finally {
    busy.value = false;
  }
}

function onStartClass(): void {
  void send({ screen: 'class' });
}

/** Los dos triángulos mandan el ROL destino, calculado acá sobre el roster. */
function onBlockStep(delta: number): void {
  const blocks = context.value?.blocks ?? [];
  const target = blocks[blockIndex.value + delta];
  if (!target) return;
  requestBlockChange(target.role);
}

function onSelectBlock(role: string): void {
  requestBlockChange(role);
}

/**
 * Cambiar de bloque reinicia el cronómetro del bloque en curso, así que un tap
 * accidental no debe aplicarse solo: primero se confirma. Si el rol destino es
 * el actual no hay nada que cambiar.
 */
/** DEUTEROS_1 y DEUTEROS_2 son dos caminos del MISMO bloque visual (espejo de
 *  `visualGroupOf` en tv/roster.ts). */
function visualGroupOf(role: string): string {
  return role === 'DEUTEROS_1' || role === 'DEUTEROS_2' ? 'DEUTEROS' : role;
}

function requestBlockChange(role: string): void {
  const current = currentBlockRole.value;
  if (role === current) return;
  // Pasar de un DEUTEROS al otro es el MISMO bloque visual: no reinicia nada, así
  // que se aplica directo, sin alerta. Solo se confirma al cambiar de bloque real.
  if (visualGroupOf(role) === visualGroupOf(current)) {
    void send({ blockRole: role });
    return;
  }
  pendingBlockRole.value = role;
  blockConfirmOpen.value = true;
}

function confirmBlockChange(): void {
  const role = pendingBlockRole.value;
  blockConfirmOpen.value = false;
  pendingBlockRole.value = null;
  if (role === null) return;
  void send({ blockRole: role });
}

function onSelectLevel(level: string): void {
  if (level === currentLevel.value) return;
  void send({ level });
}

/** D-16: `start` arranca al instante — el comando se manda tal cual, sin aviso local. */
function onTimer(command: NonNullable<TvStateWrite['timer']>): void {
  void send({ timer: command });
}

function onToggleSound(): void {
  void send({ soundEnabled: !soundEnabled.value });
}

function onToggleClosing(): void {
  void send({ screen: isClosingScreen.value ? 'class' : 'closing' });
}

async function onEndClass(): Promise<void> {
  const branchId = selectedBranchId.value;
  if (branchId === null) return;

  busy.value = true;
  try {
    await tvApi.endClass(branchId);
    confirmEndOpen.value = false;
    $q.notify({ type: 'positive', message: 'Clase terminada. El televisor vuelve a reposo.' });
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: tvApi.error.value ?? 'No se pudo terminar la clase',
    });
    if (!isExpectedClientError(err)) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error terminando la clase', { error: message, branchId });
    }
  } finally {
    busy.value = false;
    await fetchContext();
  }
}

// =========================================================================
// Ciclo de vida — el intervalo lo registra y lo corta LA PÁGINA (CLAUDE.md).
// =========================================================================

onMounted(async () => {
  await fetchBranches();
  const saved = loadDailySedes();
  if (saved) {
    // Re-entrada del mismo día: usar la sede del turno vigente y recordar cuál es.
    selectedBranchId.value = sedeForTurno(currentTurno(), saved);
    sedeWarningOpen.value = true;
    await fetchContext();
  } else {
    // 1ª vez del día: elegir sede por turno (el modal dispara fetchContext al confirmar).
    await openSedeSelection();
  }
  refreshId = setInterval(() => {
    void fetchContext();
  }, REFRESH_MS);
});

onUnmounted(() => {
  if (refreshId !== null) {
    clearInterval(refreshId);
    refreshId = null;
  }
  tvApi.cleanup();
});
</script>

<style scoped>
/* D-13: el profe maneja esto con una mano, sin mirar, en el medio de un
   bloque. Área táctil generosa y tipografía que se lee de reojo. */
.tv-control .tv-btn {
  min-height: 64px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.tv-section-title {
  margin-top: 24px;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--q-primary);
  margin-bottom: 8px;
}

</style>
