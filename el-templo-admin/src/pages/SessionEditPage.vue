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
      <q-btn flat color="primary" @click="loadSession">Reintentar</q-btn>
    </div>

    <!-- Session content -->
    <template v-else-if="session">
      <!-- Header -->
      <div class="row items-center justify-between q-mb-md">
        <div class="row items-center">
          <q-btn flat icon="arrow_back" @click="goBack" class="q-mr-sm" />
          <span class="text-h5">
            Editar Sesion - Semana {{ session.week }} - {{ dayLabel(session.day) }}
          </span>
        </div>
        <status-badge :status="session.status" :by-system="session.approvedBySystem" />
      </div>

      <!-- Session meta card -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row q-gutter-md">
            <div>
              <div class="text-caption text-grey">Nivel</div>
              <q-chip dense :color="memberLevelColor(session.memberLevel, session.levelGroup)">
                {{ memberLevelLabel(session.memberLevel, session.levelGroup) }}
              </q-chip>
            </div>
            <div>
              <div class="text-caption text-grey">Bloques</div>
              <div>{{ session.blockCount }}</div>
            </div>
            <div>
              <div class="text-caption text-grey">Estado</div>
              <div>{{ session.status === 'pending_review' ? 'Pendiente' : 'Aprobada' }}</div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Action bar -->
      <div class="q-mb-md q-gutter-sm">
        <q-btn
          v-if="session.status === 'pending_review'"
          color="positive"
          icon="check"
          label="Aprobar"
          @click="handleApprove"
        />
        <q-btn
          v-if="session.status === 'approved'"
          color="warning"
          icon="undo"
          label="Revertir a Pendiente"
          @click="handleRevert"
        />
        <q-btn
          color="secondary"
          icon="restore"
          label="Resetear al Algoritmo"
          @click="handleReset"
        />
        <q-btn
          color="info"
          icon="preview"
          label="Vista Previa"
          @click="previewOpen = true"
        />
      </div>

      <!-- Blocks -->
      <div class="text-subtitle1 q-mb-sm">Bloques</div>
      <editable-block-card
        v-for="block in session.blocks"
        :key="block.id"
        :block="block"
        :session-id="session.id"
        :level-group="session.levelGroup"
        @swap-exercise="onSwapExercise"
        @swap-block="onSwapBlock"
        @add-exercise="onAddExercise"
        @swap-mobility="onSwapMobility"
        @update-mobility-prescription="onUpdateMobilityPrescription"
        @refresh="refreshSession"
      />

      <!-- Member preview dialog -->
      <member-preview-dialog
        v-model="previewOpen"
        :session-id="session.id"
        :current-member-level="session.memberLevel || 'alfa'"
      />
    </template>

    <!-- Exercise Swap / Add / Mobility Dialog -->
    <exercise-swap-dialog
      v-if="swapDialogExercise"
      v-model="swapDialogOpen"
      :session-id="session?.id ?? 0"
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
            Reemplazar bloque {{ blockSwapTarget.role }} ({{ blockSwapTarget.route }}) con uno del pool de sesiones aprobadas
          </div>

          <div v-if="blockPoolLoading" class="flex flex-center q-pa-lg">
            <q-spinner-dots size="40px" color="primary" />
          </div>

          <div v-else-if="blockPool.length === 0" class="text-center q-pa-lg text-grey">
            <q-icon name="info" size="md" class="q-mb-sm" /><br>
            No hay bloques disponibles para esta ruta y nivel
          </div>

          <q-list v-else separator bordered class="rounded-borders" style="max-height: 400px; overflow-y: auto">
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
                    {{ ex.exerciseName }}<span v-if="i < Math.min(poolBlock.exercises.length, 4) - 1">, </span>
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
import { ref, nextTick, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionsApi } from 'src/composables/useSessionsApi';
import { useEditApi } from 'src/composables/useEditApi';
import { useAdminStore } from 'src/stores/useAdminStore';
import StatusBadge from 'src/components/sessions/StatusBadge.vue';
import EditableBlockCard from 'src/components/sessions/EditableBlockCard.vue';
import MemberPreviewDialog from 'src/components/sessions/MemberPreviewDialog.vue';
import ExerciseSwapDialog from 'src/components/sessions/ExerciseSwapDialog.vue';
import type { SessionDetail, SessionExercise, SessionBlock, PoolBlock, LevelGroup, PrescriptionUpdate } from 'src/types/session';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const sessionsApi = useSessionsApi();
const editApi = useEditApi();
const adminStore = useAdminStore();

const session = ref<SessionDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

// Preview dialog state
const previewOpen = ref(false);

// Swap/Add/Mobility dialog state
const swapDialogOpen = ref(false);
const swapDialogMode = ref<'swap' | 'add'>('swap');
const swapDialogMobilityMode = ref(false);
const swapDialogBlockId = ref(0);
const swapDialogBlockRoute = ref('');
const swapDialogBlockPattern = ref('');
const swapDialogExercise = ref<SessionExercise | null>(null);

// Block swap dialog state
const blockSwapDialogOpen = ref(false);
const blockSwapTarget = ref<SessionBlock | null>(null);
const blockPool = ref<PoolBlock[]>([]);
const blockPoolLoading = ref(false);

// Scroll position saved before dialogs open (q-dialog locks body scroll)
const preDialogScrollY = ref(0);

async function loadSession() {
  const id = Number(route.params.id);
  if (isNaN(id)) {
    error.value = 'ID de sesion invalido';
    loading.value = false;
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    session.value = await sessionsApi.fetchSessionDetail(id);
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { error?: string } } };
    error.value = axiosError.response?.data?.error || 'Error cargando sesion';
  } finally {
    loading.value = false;
  }
}

async function refreshSession(savedScrollY?: number) {
  const scrollY = savedScrollY ?? window.scrollY;
  const id = Number(route.params.id);
  if (isNaN(id)) return;
  try {
    session.value = await sessionsApi.fetchSessionDetail(id);
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { error?: string } } };
    error.value = axiosError.response?.data?.error || 'Error cargando sesion';
  }
  await nextTick();
  window.scrollTo(0, scrollY);
}

function goBack() {
  router.push('/sessions');
}

async function handleApprove() {
  if (!session.value) return;
  try {
    await sessionsApi.approveSession(session.value.id);
    $q.notify({ type: 'positive', message: 'Sesion aprobada' });
    refreshSession();
    adminStore.fetchPendingCount();
    adminStore.checkSessionCoverage();
  } catch {
    $q.notify({ type: 'negative', message: 'Error aprobando sesion' });
  }
}

async function handleRevert() {
  if (!session.value) return;
  try {
    await sessionsApi.revertSession(session.value.id);
    $q.notify({ type: 'info', message: 'Sesion revertida a pendiente' });
    refreshSession();
    adminStore.fetchPendingCount();
    adminStore.checkSessionCoverage();
  } catch {
    $q.notify({ type: 'negative', message: 'Error revirtiendo sesion' });
  }
}

async function handleReset() {
  if (!session.value) return;
  $q.dialog({
    title: 'Resetear al Algoritmo',
    message: 'Se restaurara la sesion al estado original generado por el algoritmo. Todos los cambios manuales se perderan. Continuar?',
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Resetear', color: 'negative' },
  }).onOk(async () => {
    try {
      await editApi.resetToAlgorithm(session.value!.id);
      $q.notify({ type: 'positive', message: 'Sesion restaurada al algoritmo' });
      refreshSession();
    } catch {
      $q.notify({ type: 'negative', message: editApi.error.value || 'Error al restaurar sesion' });
    }
  });
}

async function onSwapBlock(block: SessionBlock) {
  if (!session.value) return;
  preDialogScrollY.value = window.scrollY;
  blockSwapTarget.value = block;
  blockSwapDialogOpen.value = true;
  blockPool.value = [];
  blockPoolLoading.value = true;

  try {
    const memberLevel = session.value.memberLevel;
    const result = await sessionsApi.fetchBlockPool(
      block.route,
      memberLevel,
      session.value.id,
      block.id
    );
    blockPool.value = result.blocks;
  } catch {
    $q.notify({ type: 'negative', message: 'Error cargando pool de bloques' });
  } finally {
    blockPoolLoading.value = false;
  }
}

async function handleBlockSwap(sourceBlockId: number) {
  if (!session.value || !blockSwapTarget.value) return;

  $q.dialog({
    title: 'Confirmar Intercambio',
    message: 'Se reemplazara el contenido del bloque actual con el bloque seleccionado. Continuar?',
    cancel: true,
  }).onOk(async () => {
    try {
      await sessionsApi.swapBlock(
        session.value!.id,
        blockSwapTarget.value!.id,
        sourceBlockId
      );
      $q.notify({ type: 'positive', message: 'Bloque intercambiado' });
      blockSwapDialogOpen.value = false;
      refreshSession(preDialogScrollY.value);
    } catch {
      $q.notify({ type: 'negative', message: 'Error intercambiando bloque' });
    }
  });
}

function onSwapExercise(payload: { blockId: number; exercise: SessionExercise; blockRoute: string; blockPattern: string }) {
  preDialogScrollY.value = window.scrollY;
  swapDialogMode.value = 'swap';
  swapDialogMobilityMode.value = false;
  swapDialogBlockId.value = payload.blockId;
  swapDialogBlockRoute.value = payload.blockRoute;
  swapDialogBlockPattern.value = payload.blockPattern;
  swapDialogExercise.value = payload.exercise;
  swapDialogOpen.value = true;
}

function onAddExercise(payload: { blockId: number; blockRoute: string; blockPattern: string; blockRole: string }) {
  preDialogScrollY.value = window.scrollY;
  swapDialogMode.value = 'add';
  swapDialogMobilityMode.value = false;
  swapDialogBlockId.value = payload.blockId;
  swapDialogBlockRoute.value = payload.blockRoute;
  swapDialogBlockPattern.value = payload.blockPattern;
  swapDialogExercise.value = {
    id: 0,
    exerciseId: 0,
    exerciseName: 'Nuevo ejercicio',
    contraction: '',
    reps: null,
    seconds: null,
    rest: null,
    notes: null,
    dificultadLineal: null,
    sortOrder: 0,
    route: null,
  };
  swapDialogOpen.value = true;
}

function onSwapMobility(payload: { blockId: number; blockRoute: string }) {
  preDialogScrollY.value = window.scrollY;
  swapDialogMode.value = 'swap';
  swapDialogMobilityMode.value = true;
  swapDialogBlockId.value = payload.blockId;
  swapDialogBlockRoute.value = payload.blockRoute;
  swapDialogBlockPattern.value = '';
  // Placeholder exercise for mobility mode (dialog ignores currentExercise in mobility mode)
  swapDialogExercise.value = {
    id: 0,
    exerciseId: 0,
    exerciseName: '',
    contraction: '',
    reps: null,
    seconds: null,
    rest: null,
    notes: null,
    dificultadLineal: null,
    sortOrder: 0,
    route: null,
  };
  swapDialogOpen.value = true;
}

async function onUpdateMobilityPrescription(payload: { prescriptionId: number; fields: PrescriptionUpdate }) {
  if (!session.value) return;
  // Find the block containing this mobility exercise
  const block = session.value.blocks.find(b => b.mobilityExercise?.id === payload.prescriptionId);
  if (!block) return;

  try {
    await editApi.updatePrescription(session.value.id, block.id, payload.prescriptionId, payload.fields);
    // Update mobility exercise in-place for reactivity
    if (block.mobilityExercise) {
      Object.assign(block.mobilityExercise, payload.fields);
    }
    $q.notify({ type: 'positive', message: 'Prescripcion de movilidad actualizada', color: 'green', timeout: 1500 });
  } catch {
    $q.notify({ type: 'negative', message: 'Error al actualizar prescripcion de movilidad' });
  }
}

function onDialogComplete() {
  swapDialogOpen.value = false;
  refreshSession(preDialogScrollY.value);
}

function dayLabel(day: string): string {
  const labels: Record<string, string> = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miercoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sabado',
  };
  return labels[day] || day;
}

function memberLevelColor(memberLevel: string | undefined, group: LevelGroup): string {
  if (memberLevel) {
    const level = memberLevel.toLowerCase();
    if (level === 'alfa') return 'light-blue';
    if (level === 'delta') return 'blue';
    if (level === 'sigma') return 'purple';
    if (level === 'omega') return 'orange';
    if (level === 'spartan') return 'red';
  }
  switch (group) {
    case 'alfa_delta': return 'blue';
    case 'sigma': return 'purple';
    case 'omega': return 'orange';
    default: return 'grey';
  }
}

function memberLevelLabel(memberLevel: string | undefined, group: LevelGroup): string {
  if (memberLevel) {
    return memberLevel.charAt(0).toUpperCase() + memberLevel.slice(1).toLowerCase();
  }
  switch (group) {
    case 'alfa_delta': return 'Alfa/Delta';
    case 'sigma': return 'Sigma';
    case 'omega': return 'Omega';
    default: return group;
  }
}

onMounted(loadSession);
</script>
