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
        <div class="tv-section-title">BLOQUES</div>
        <div class="row items-stretch q-col-gutter-sm">
          <div class="col-2">
            <q-btn
              class="tv-btn full-width"
              icon="chevron_left"
              color="primary"
              outline
              :disable="!canControl || blockIndex <= 0"
              @click="onBlockStep(-1)"
            />
          </div>
          <div class="col-8">
            <div class="row q-col-gutter-xs">
              <div v-for="block in context.blocks" :key="block.role" class="col">
                <q-btn
                  class="tv-btn full-width tv-btn--chip"
                  :color="block.role === currentBlockRole ? 'primary' : 'grey-7'"
                  :outline="block.role !== currentBlockRole"
                  :unelevated="block.role === currentBlockRole"
                  :label="block.title"
                  :disable="!canControl"
                  @click="onSelectBlock(block.role)"
                />
              </div>
            </div>
          </div>
          <div class="col-2">
            <q-btn
              class="tv-btn full-width"
              icon="chevron_right"
              color="primary"
              outline
              :disable="!canControl || blockIndex < 0 || blockIndex >= context.blocks.length - 1"
              @click="onBlockStep(1)"
            />
          </div>
        </div>

        <!-- ============================ NIVELES ============================ -->
        <div class="tv-section-title">NIVELES</div>
        <div class="row q-col-gutter-sm">
          <div v-for="level in context.levels" :key="level" class="col">
            <q-btn
              class="tv-btn full-width"
              :color="level === currentLevel ? 'primary' : 'grey-7'"
              :outline="level !== currentLevel"
              :unelevated="level === currentLevel"
              :label="levelLabel(level)"
              :disable="!canControl || levelsDisabled"
              @click="onSelectLevel(level)"
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

        <!-- El play no es instantaneo: el API programa el arranque 3 s adelante para  -->
        <!-- que todos los televisores entren en cero juntos. El profe tiene que       -->
        <!-- saberlo (canta el "vamos" con eso en la cabeza), asi que el aviso esta    -->
        <!-- siempre visible y se vuelve cuenta regresiva al apretar.                  -->
        <div class="tv-lead-hint" :class="{ 'tv-lead-hint--activa': startsIn > 0 }">
          <q-icon :name="startsIn > 0 ? 'hourglass_top' : 'schedule'" size="16px" />
          <span v-if="startsIn > 0">Arranca en {{ startsIn }}…</span>
          <span v-else>El play arranca 3 s después, para que la pantalla entre en cero</span>
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
import { useAuthStore } from 'src/stores/useAuthStore';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useTvApi, type TvControlContext, type TvStateWrite } from 'src/composables/useTvApi';
import { createLogger } from 'src/utils/logger';
import { isExpectedClientError } from 'src/utils/extract-error';
import type { BranchOption } from 'src/types/member';

const log = createLogger('TvControlPage');
const $q = useQuasar();
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
 * Símbolos de nivel del UI-SPEC. En sesión ROM (sábado) no existe la escalera
 * alfa/delta/sigma: son dos tiers rotulados BÁSICO / AVANZADO (D-23).
 */
const LEVEL_SYMBOLS: Record<string, string> = {
  alfa: 'α',
  delta: 'Δ',
  sigma: 'Σ',
  kairos: '☉',
};
const ROM_LEVEL_LABELS: Record<string, string> = {
  alfa: 'BÁSICO',
  delta: 'AVANZADO',
};

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

const branches = ref<BranchOption[]>([]);
const branchesLoading = ref(false);
const selectedBranchId = ref<number | null>(null);

let refreshId: ReturnType<typeof setInterval> | null = null;

// =========================================================================
// Sedes — un televisor cuelga de una pared, así que las sedes virtuales
// (online) se filtran. El default es la sede del profe (D-11); el gate real
// de acceso es requireBranchAccess en el API.
// =========================================================================

const branchOptions = computed(() =>
  branches.value.filter((b) => !b.isVirtual).map((b) => ({ label: b.name, value: b.id }))
);

async function fetchBranches(): Promise<void> {
  branchesLoading.value = true;
  try {
    branches.value = await membersApi.getBranches();
    const own = branchOptions.value.find((o) => o.value === authStore.user?.branchId);
    selectedBranchId.value = own?.value ?? branchOptions.value[0]?.value ?? null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error cargando sedes', { error: message });
    $q.notify({ type: 'negative', message: 'No se pudieron cargar las sedes' });
  } finally {
    branchesLoading.value = false;
  }
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

function levelLabel(level: string): string {
  if (context.value?.mode === 'rom') return ROM_LEVEL_LABELS[level] ?? level.toUpperCase();
  return LEVEL_SYMBOLS[level] ?? level.toUpperCase();
}

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
  context.value = null;
  initialLoading.value = true;
  await fetchContext();
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
  void send({ blockRole: target.role });
}

function onSelectBlock(role: string): void {
  if (role === currentBlockRole.value) return;
  void send({ blockRole: role });
}

function onSelectLevel(level: string): void {
  if (level === currentLevel.value) return;
  void send({ level });
}

/**
 * Cuenta local del arranque diferido (TIMER_START_LEAD_MS del API).
 *
 * Se cuenta desde el tap y NO contra el reloj del server: el profe acaba de apretar, y
 * un celular con la hora corrida mostraria cualquier cosa. Son 3 segundos de aviso, no
 * una fuente de verdad — la del cronometro sigue siendo `timerStartedAt`.
 */
const START_LEAD_SECONDS = 3;
const startsIn = ref(0);
let startsInId: ReturnType<typeof setInterval> | null = null;

function clearStartCountdown(): void {
  if (startsInId !== null) {
    clearInterval(startsInId);
    startsInId = null;
  }
  startsIn.value = 0;
}

function beginStartCountdown(): void {
  clearStartCountdown();
  startsIn.value = START_LEAD_SECONDS;
  startsInId = setInterval(() => {
    startsIn.value -= 1;
    if (startsIn.value <= 0) clearStartCountdown();
  }, 1000);
}

function onTimer(command: NonNullable<TvStateWrite['timer']>): void {
  if (command === 'start' && timerStatus.value !== 'running') {
    beginStartCountdown();
  }
  if (command === 'reset') clearStartCountdown();
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
  await fetchContext();
  refreshId = setInterval(() => {
    void fetchContext();
  }, REFRESH_MS);
});

onUnmounted(() => {
  if (refreshId !== null) {
    clearInterval(refreshId);
    refreshId = null;
  }
  clearStartCountdown();
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

.tv-control .tv-btn--chip {
  font-size: 0.8rem;
  padding-left: 4px;
  padding-right: 4px;
}

.tv-section-title {
  margin-top: 24px;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--q-primary);
  margin-bottom: 8px;
}

/* Aviso del arranque diferido: discreto mientras informa, evidente mientras cuenta. */
.tv-lead-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 0.78rem;
  line-height: 1.3;
  color: rgba(0, 0, 0, 0.55);
}

.tv-lead-hint--activa {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--q-positive);
}
</style>
