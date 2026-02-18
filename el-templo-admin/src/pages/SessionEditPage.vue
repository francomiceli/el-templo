<template>
  <q-page class="q-pa-md">
    <!-- Loading state -->
    <div v-if="loading" class="flex flex-center q-pa-xl">
      <q-spinner-dots size="50px" color="primary" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="text-center q-pa-xl">
      <q-icon name="error" size="xl" color="negative" />
      <div class="text-h6 q-mt-md">{{ error }}</div>
      <q-btn flat color="primary" @click="loadDay">Reintentar</q-btn>
    </div>

    <!-- Day content -->
    <template v-else-if="sessions.length > 0">
      <!-- Header -->
      <div class="row items-center justify-between q-mb-md">
        <div class="row items-center">
          <q-btn flat icon="arrow_back" @click="goBack" class="q-mr-sm" />
          <span class="text-h5"> Editar Sesion - Semana {{ week }} - {{ dayLabel(day) }} </span>
        </div>
        <q-badge
          :color="allApproved ? 'green' : 'amber'"
          :label="allApproved ? 'Aprobado' : 'Pendiente'"
        />
      </div>

      <!-- Action bar -->
      <div class="q-mb-md q-gutter-sm">
        <q-btn
          v-if="hasPending"
          color="positive"
          icon="check"
          label="Aprobar Dia"
          @click="handleApproveDay"
        />
        <q-btn
          v-if="hasApproved"
          color="warning"
          icon="undo"
          label="Revertir Dia"
          @click="handleRevertDay"
        />
        <q-btn color="secondary" icon="restore" label="Resetear Dia" @click="handleResetDay" />
        <q-btn color="info" icon="preview" label="Vista Previa" @click="previewOpen = true" />
      </div>

      <!-- Block groups -->
      <div class="text-subtitle1 q-mb-sm">Bloques</div>
      <editable-block-card
        v-for="bg in blockGroups"
        :key="bg.role + '-' + bg.sortOrder"
        :block-group="bg"
        :level-group="sessions[0].levelGroup"
        :sibling-level-blocks="deuterosSibling(bg)"
        @swap-exercise="onSwapExercise"
        @swap-block="onSwapBlock"
        @add-exercise="onAddExercise"
        @swap-mobility="onSwapMobility"
        @update-mobility-prescription="onUpdateMobilityPrescription"
        @refresh="refreshDay"
      />

      <!-- Member preview dialog -->
      <member-preview-dialog
        v-model="previewOpen"
        :session-id="sessions[0]?.id ?? 0"
        :current-member-level="sessions[0]?.memberLevel || 'alfa'"
      />
    </template>

    <!-- Exercise Swap / Add / Mobility Dialog -->
    <exercise-swap-dialog
      v-if="swapDialogExercise"
      v-model="swapDialogOpen"
      :session-id="swapDialogSessionId"
      :block-id="swapDialogBlockId"
      :current-exercise="swapDialogExercise"
      :block-route="swapDialogBlockRoute"
      :block-pattern="swapDialogBlockPattern"
      :mode="swapDialogMode"
      :mobility-mode="swapDialogMobilityMode"
      @swapped="onDialogComplete"
      @added="onDialogComplete"
      @swapped-mobility="onDialogComplete"
    />

    <!-- Block Swap Dialog -->
    <q-dialog v-model="blockSwapDialogOpen" persistent>
      <q-card style="min-width: 500px; max-width: 700px">
        <q-card-section class="row items-center">
          <div class="text-h6">Intercambiar Bloque</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section v-if="blockSwapTarget" class="q-pt-none">
          <div class="text-caption text-grey q-mb-md">
            Reemplazar bloque {{ blockSwapTarget.role }} ({{ blockSwapTarget.route }}) con uno del
            pool de sesiones aprobadas
          </div>

          <div v-if="blockPoolLoading" class="flex flex-center q-pa-lg">
            <q-spinner-dots size="40px" color="primary" />
          </div>

          <div v-else-if="blockPool.length === 0" class="text-center q-pa-lg text-grey">
            <q-icon name="info" size="md" class="q-mb-sm" /><br />
            No hay bloques disponibles para esta ruta y nivel
          </div>

          <q-list
            v-else
            separator
            bordered
            class="rounded-borders"
            style="max-height: 400px; overflow-y: auto"
          >
            <q-item
              v-for="poolBlock in blockPool"
              :key="poolBlock.id"
              clickable
              @click="handleBlockSwap(poolBlock.id)"
            >
              <q-item-section>
                <q-item-label>
                  <q-badge :color="poolBlock.formatName ? 'primary' : 'grey'" class="q-mr-sm">
                    {{ poolBlock.formatName }}
                  </q-badge>
                  {{ poolBlock.exerciseCount }} ejercicios
                </q-item-label>
                <q-item-label caption>
                  <span class="q-mr-md">
                    <q-icon name="speed" size="xs" /> {{ poolBlock.intensity }}%
                  </span>
                  <span class="q-mr-md">
                    <q-icon name="replay" size="xs" /> {{ poolBlock.repsBudget }} reps
                  </span>
                  <span class="text-italic">
                    Semana {{ poolBlock.sourceWeek }} - {{ dayLabel(poolBlock.sourceDay) }}
                  </span>
                </q-item-label>
                <q-item-label caption class="q-mt-xs">
                  <span v-for="(ex, i) in poolBlock.exercises.slice(0, 4)" :key="ex.id">
                    {{ ex.exerciseName
                    }}<span v-if="i < Math.min(poolBlock.exercises.length, 4) - 1">, </span>
                  </span>
                  <span v-if="poolBlock.exercises.length > 4">
                    ... +{{ poolBlock.exercises.length - 4 }}
                  </span>
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn flat dense icon="swap_horiz" color="primary">
                  <q-tooltip>Usar este bloque</q-tooltip>
                </q-btn>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionsApi } from 'src/composables/useSessionsApi';
import { useEditApi } from 'src/composables/useEditApi';
import { useAdminStore } from 'src/stores/useAdminStore';
import EditableBlockCard from 'src/components/sessions/EditableBlockCard.vue';
import MemberPreviewDialog from 'src/components/sessions/MemberPreviewDialog.vue';
import ExerciseSwapDialog from 'src/components/sessions/ExerciseSwapDialog.vue';
import type {
  SessionDetail,
  SessionExercise,
  SessionBlock,
  PoolBlock,
  PrescriptionUpdate,
} from 'src/types/session';
import type { BlockGroup } from 'src/types/block-group';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const sessionsApi = useSessionsApi();
const editApi = useEditApi();
const adminStore = useAdminStore();

const sessions = ref<SessionDetail[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

// Route query params
const week = computed(() => Number(route.query.week) || 1);
const day = computed(() => (route.query.day as string) || 'lunes');

// Preview dialog state
const previewOpen = ref(false);

// Swap/Add/Mobility dialog state
const swapDialogOpen = ref(false);
const swapDialogMode = ref<'swap' | 'add'>('swap');
const swapDialogMobilityMode = ref(false);
const swapDialogSessionId = ref(0);
const swapDialogBlockId = ref(0);
const swapDialogBlockRoute = ref('');
const swapDialogBlockPattern = ref('');
const swapDialogExercise = ref<SessionExercise | null>(null);

// Block swap dialog state
const blockSwapDialogOpen = ref(false);
const blockSwapTarget = ref<SessionBlock | null>(null);
const blockSwapSessionId = ref(0);
const blockPool = ref<PoolBlock[]>([]);
const blockPoolLoading = ref(false);

// Scroll position saved before dialogs open
const preDialogScrollY = ref(0);

// Status computeds
const allApproved = computed(
  () => sessions.value.length > 0 && sessions.value.every((s) => s.status === 'approved')
);
const hasPending = computed(() => sessions.value.some((s) => s.status === 'pending_review'));
const hasApproved = computed(() => sessions.value.some((s) => s.status === 'approved'));

// Block grouping: merge blocks across sessions by role + sortOrder
const blockGroups = computed<BlockGroup[]>(() => {
  if (sessions.value.length === 0) return [];

  // Use first session as the canonical block structure
  const firstSession = sessions.value[0];
  return firstSession.blocks.map((refBlock) => {
    const levelBlocks = sessions.value
      .map((s) => {
        const matchingBlock = s.blocks.find(
          (b) => b.role === refBlock.role && b.sortOrder === refBlock.sortOrder
        );
        return {
          sessionId: s.id,
          memberLevel: s.memberLevel,
          block: matchingBlock ?? null,
        };
      })
      .filter(
        (lb): lb is { sessionId: number; memberLevel: string; block: SessionBlock } =>
          lb.block !== null
      );

    return {
      role: refBlock.role,
      sortOrder: refBlock.sortOrder,
      formatId: refBlock.formatId,
      formatName: refBlock.formatName,
      formatParams: refBlock.formatParams,
      levelBlocks,
    };
  });
});

function deuterosSibling(bg: BlockGroup) {
  if (bg.role === 'DEUTEROS_1') {
    return blockGroups.value.find((b) => b.role === 'DEUTEROS_2')?.levelBlocks;
  }
  if (bg.role === 'DEUTEROS_2') {
    return blockGroups.value.find((b) => b.role === 'DEUTEROS_1')?.levelBlocks;
  }
  return undefined;
}

async function loadDay() {
  loading.value = true;
  error.value = null;

  try {
    // Fetch all sessions for this week
    const response = await sessionsApi.fetchSessions({
      week: week.value,
      day: day.value,
      limit: 100,
    });

    // Fetch full details for each session
    const details = await Promise.all(
      response.sessions.map((s) => sessionsApi.fetchSessionDetail(s.id))
    );

    // Sort by level order: alfa, delta, sigma, omega, spartan
    const levelOrder = ['alfa', 'delta', 'sigma', 'omega', 'spartan'];
    details.sort((a, b) => levelOrder.indexOf(a.memberLevel) - levelOrder.indexOf(b.memberLevel));

    sessions.value = details;
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { error?: string } } };
    error.value = axiosError.response?.data?.error || 'Error cargando sesiones del dia';
  } finally {
    loading.value = false;
  }
}

async function refreshDay(savedScrollY?: number) {
  const scrollY = savedScrollY ?? window.scrollY;
  try {
    const response = await sessionsApi.fetchSessions({
      week: week.value,
      day: day.value,
      limit: 100,
    });
    const details = await Promise.all(
      response.sessions.map((s) => sessionsApi.fetchSessionDetail(s.id))
    );
    const levelOrder = ['alfa', 'delta', 'sigma', 'omega', 'spartan'];
    details.sort((a, b) => levelOrder.indexOf(a.memberLevel) - levelOrder.indexOf(b.memberLevel));
    sessions.value = details;
  } catch {
    // silent
  }
  await nextTick();
  window.scrollTo(0, scrollY);
}

function goBack() {
  router.push({ path: '/sessions', query: { week: String(week.value) } });
}

// Day-level actions
async function handleApproveDay() {
  const pendingIds = sessions.value.filter((s) => s.status === 'pending_review').map((s) => s.id);
  if (pendingIds.length === 0) return;

  $q.dialog({
    title: 'Aprobar Dia',
    message: `Aprobar ${pendingIds.length} sesiones pendientes?`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      const result = await sessionsApi.bulkApprove(pendingIds);
      $q.notify({ type: 'positive', message: `${result.approvedCount} sesiones aprobadas` });
      refreshDay();
      adminStore.fetchPendingCount();
      adminStore.checkSessionCoverage();
    } catch {
      $q.notify({ type: 'negative', message: 'Error aprobando sesiones' });
    }
  });
}

async function handleRevertDay() {
  $q.dialog({
    title: 'Revertir Dia',
    message: 'Revertir todas las sesiones aprobadas a pendiente?',
    cancel: true,
  }).onOk(async () => {
    try {
      const approvedSessions = sessions.value.filter((s) => s.status === 'approved');
      await Promise.all(approvedSessions.map((s) => sessionsApi.revertSession(s.id)));
      $q.notify({ type: 'info', message: `${approvedSessions.length} sesiones revertidas` });
      refreshDay();
      adminStore.fetchPendingCount();
      adminStore.checkSessionCoverage();
    } catch {
      $q.notify({ type: 'negative', message: 'Error revirtiendo sesiones' });
    }
  });
}

async function handleResetDay() {
  $q.dialog({
    title: 'Resetear Dia',
    message:
      'Se restauraran TODAS las sesiones del dia al algoritmo original. Todos los cambios manuales se perderan. Continuar?',
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Resetear', color: 'negative' },
  }).onOk(async () => {
    try {
      await Promise.all(sessions.value.map((s) => editApi.resetToAlgorithm(s.id)));
      $q.notify({ type: 'positive', message: 'Sesiones restauradas al algoritmo' });
      refreshDay();
    } catch {
      $q.notify({ type: 'negative', message: 'Error al restaurar sesiones' });
    }
  });
}

// Block swap
async function onSwapBlock(payload: { sessionId: number; block: SessionBlock }) {
  preDialogScrollY.value = window.scrollY;
  blockSwapTarget.value = payload.block;
  blockSwapSessionId.value = payload.sessionId;
  blockSwapDialogOpen.value = true;
  blockPool.value = [];
  blockPoolLoading.value = true;

  try {
    const session = sessions.value.find((s) => s.id === payload.sessionId);
    const memberLevel = session?.memberLevel || 'alfa';
    const result = await sessionsApi.fetchBlockPool(
      payload.block.route,
      memberLevel,
      payload.sessionId,
      payload.block.id
    );
    blockPool.value = result.blocks;
  } catch {
    $q.notify({ type: 'negative', message: 'Error cargando pool de bloques' });
  } finally {
    blockPoolLoading.value = false;
  }
}

async function handleBlockSwap(sourceBlockId: number) {
  if (!blockSwapTarget.value) return;

  $q.dialog({
    title: 'Confirmar Intercambio',
    message: 'Se reemplazara el contenido del bloque actual con el bloque seleccionado. Continuar?',
    cancel: true,
  }).onOk(async () => {
    try {
      await sessionsApi.swapBlock(
        blockSwapSessionId.value,
        blockSwapTarget.value!.id,
        sourceBlockId
      );
      $q.notify({ type: 'positive', message: 'Bloque intercambiado' });
      blockSwapDialogOpen.value = false;
      refreshDay(preDialogScrollY.value);
    } catch {
      $q.notify({ type: 'negative', message: 'Error intercambiando bloque' });
    }
  });
}

// Exercise swap/add/mobility
function onSwapExercise(payload: {
  sessionId: number;
  blockId: number;
  exercise: SessionExercise;
  blockRoute: string;
  blockPattern: string;
}) {
  preDialogScrollY.value = window.scrollY;
  swapDialogMode.value = 'swap';
  swapDialogMobilityMode.value = false;
  swapDialogSessionId.value = payload.sessionId;
  swapDialogBlockId.value = payload.blockId;
  swapDialogBlockRoute.value = payload.blockRoute;
  swapDialogBlockPattern.value = payload.blockPattern;
  swapDialogExercise.value = payload.exercise;
  swapDialogOpen.value = true;
}

function onAddExercise(payload: {
  sessionId: number;
  blockId: number;
  blockRoute: string;
  blockPattern: string;
  blockRole: string;
}) {
  preDialogScrollY.value = window.scrollY;
  swapDialogMode.value = 'add';
  swapDialogMobilityMode.value = false;
  swapDialogSessionId.value = payload.sessionId;
  swapDialogBlockId.value = payload.blockId;
  swapDialogBlockRoute.value = payload.blockRoute;
  swapDialogBlockPattern.value = payload.blockPattern;
  swapDialogExercise.value = {
    id: 0,
    exerciseId: 0,
    exerciseName: 'Nuevo ejercicio',
    contraction: '',
    reps: null,
    repsMax: null,
    seconds: null,
    secondsMax: null,
    increment: null,
    rest: null,
    notes: null,
    dificultadLineal: null,
    sortOrder: 0,
    route: null,
  };
  swapDialogOpen.value = true;
}

function onSwapMobility(payload: { sessionId: number; blockId: number; blockRoute: string }) {
  preDialogScrollY.value = window.scrollY;
  swapDialogMode.value = 'swap';
  swapDialogMobilityMode.value = true;
  swapDialogSessionId.value = payload.sessionId;
  swapDialogBlockId.value = payload.blockId;
  swapDialogBlockRoute.value = payload.blockRoute;
  swapDialogBlockPattern.value = '';
  swapDialogExercise.value = {
    id: 0,
    exerciseId: 0,
    exerciseName: '',
    contraction: '',
    reps: null,
    repsMax: null,
    seconds: null,
    secondsMax: null,
    increment: null,
    rest: null,
    notes: null,
    dificultadLineal: null,
    sortOrder: 0,
    route: null,
  };
  swapDialogOpen.value = true;
}

async function onUpdateMobilityPrescription(payload: {
  sessionId: number;
  blockId: number;
  prescriptionId: number;
  fields: PrescriptionUpdate;
}) {
  const session = sessions.value.find((s) => s.id === payload.sessionId);
  if (!session) return;

  const block = session.blocks.find((b) => b.id === payload.blockId);
  if (!block) return;

  try {
    await editApi.updatePrescription(
      payload.sessionId,
      block.id,
      payload.prescriptionId,
      payload.fields
    );
    if (block.mobilityExercise) {
      Object.assign(block.mobilityExercise, payload.fields);
    }
    $q.notify({
      type: 'positive',
      message: 'Prescripcion de movilidad actualizada',
      color: 'green',
      timeout: 1500,
    });
  } catch {
    $q.notify({ type: 'negative', message: 'Error al actualizar prescripcion de movilidad' });
  }
}

function onDialogComplete() {
  swapDialogOpen.value = false;
  refreshDay(preDialogScrollY.value);
}

function dayLabel(d: string): string {
  const labels: Record<string, string> = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miercoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sabado',
  };
  return labels[d] || d;
}

onMounted(loadDay);
</script>
