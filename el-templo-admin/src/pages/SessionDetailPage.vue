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
        <div>
          <q-btn flat icon="arrow_back" @click="goBack" class="q-mr-sm" />
          <span class="text-h5">
            {{ formatWeekLabel(session.week) }} - {{ dayLabel(session.day) }}
          </span>
        </div>
        <status-badge :status="session.status" :by-system="session.approvedBySystem" />
      </div>

      <!-- Session meta -->
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
            <div v-if="session.approvedByName">
              <div class="text-caption text-grey">Aprobado por</div>
              <div>{{ session.approvedByName }}</div>
              <div class="text-caption">{{ formatDate(session.approvedAt) }}</div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Action buttons -->
      <div class="q-mb-md q-gutter-sm">
        <q-btn color="primary" icon="edit" label="Editar" @click="goToEdit" />
        <q-btn color="info" icon="preview" label="Vista Previa" @click="previewOpen = true" />
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
      </div>

      <!-- Blocks -->
      <div class="text-subtitle1 q-mb-sm">Bloques</div>
      <block-card
        v-for="block in session.blocks"
        :key="block.id"
        :block="block"
        :show-swap="true"
        @swap="openSwapDialog"
      />
    </template>

    <!-- Member preview dialog -->
    <member-preview-dialog
      v-if="session"
      v-model="previewOpen"
      :session-id="session.id"
      :current-member-level="session.memberLevel || 'alfa'"
    />

    <!-- Swap dialog -->
    <q-dialog v-model="swapDialogOpen" persistent>
      <q-card style="min-width: 500px; max-width: 700px">
        <q-card-section class="row items-center">
          <div class="text-h6">Intercambiar Bloque</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section v-if="swapTargetBlock" class="q-pt-none">
          <div class="text-caption text-grey q-mb-md">
            Reemplazar bloque {{ swapTargetBlock.role }} ({{ swapTargetBlock.route }}) con uno del
            pool de sesiones aprobadas
          </div>

          <!-- Loading pool -->
          <div v-if="poolLoading" class="flex flex-center q-pa-lg">
            <q-spinner-dots size="40px" color="primary" />
          </div>

          <!-- Empty pool -->
          <div v-else-if="poolBlocks.length === 0" class="text-center q-pa-lg text-grey">
            <q-icon name="info" size="md" class="q-mb-sm" /><br />
            No hay bloques disponibles para esta ruta y nivel
          </div>

          <!-- Pool blocks list -->
          <q-list v-else separator bordered class="rounded-borders">
            <q-item
              v-for="poolBlock in poolBlocks"
              :key="poolBlock.id"
              clickable
              @click="handleSwap(poolBlock.id)"
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
                    {{ formatWeekLabel(poolBlock.sourceWeek) }} -
                    {{ dayLabel(poolBlock.sourceDay) }}
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
                <q-btn flat dense icon="swap_horiz" color="positive">
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
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionsApi } from 'src/composables/useSessionsApi';
import { formatWeekLabel } from 'src/utils/weekDates';
import { useAdminStore } from 'src/stores/useAdminStore';
import StatusBadge from 'src/components/sessions/StatusBadge.vue';
import BlockCard from 'src/components/sessions/BlockCard.vue';
import MemberPreviewDialog from 'src/components/sessions/MemberPreviewDialog.vue';
import type { SessionDetail, SessionBlock, PoolBlock, LevelGroup } from 'src/types/session';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const sessionsApi = useSessionsApi();
const adminStore = useAdminStore();

const session = ref<SessionDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

// Swap dialog state
const swapDialogOpen = ref(false);
const swapTargetBlock = ref<SessionBlock | null>(null);
const poolBlocks = ref<PoolBlock[]>([]);
const poolLoading = ref(false);

// Preview dialog state
const previewOpen = ref(false);

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

function goBack() {
  router.push('/sessions');
}

function goToEdit() {
  const id = route.params.id;
  router.push(`/sessions/${id}/edit`);
}

async function handleApprove() {
  if (!session.value) return;
  try {
    await sessionsApi.approveSession(session.value.id);
    $q.notify({ type: 'positive', message: 'Sesion aprobada' });
    loadSession();
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
    loadSession();
    adminStore.fetchPendingCount();
    adminStore.checkSessionCoverage();
  } catch {
    $q.notify({ type: 'negative', message: 'Error revirtiendo sesion' });
  }
}

async function openSwapDialog(block: SessionBlock) {
  if (!session.value) return;
  swapTargetBlock.value = block;
  swapDialogOpen.value = true;
  poolBlocks.value = [];
  poolLoading.value = true;

  try {
    const memberLevel = session.value.memberLevel;
    const result = await sessionsApi.fetchBlockPool(
      block.route,
      memberLevel,
      session.value.id,
      block.id
    );
    poolBlocks.value = result.blocks;
  } catch {
    $q.notify({ type: 'negative', message: 'Error cargando pool de bloques' });
  } finally {
    poolLoading.value = false;
  }
}

async function handleSwap(sourceBlockId: number) {
  if (!session.value || !swapTargetBlock.value) return;

  $q.dialog({
    title: 'Confirmar Intercambio',
    message: 'Se reemplazara el contenido del bloque actual con el bloque seleccionado. Continuar?',
    cancel: true,
  }).onOk(async () => {
    try {
      await sessionsApi.swapBlock(session.value!.id, swapTargetBlock.value!.id, sourceBlockId);
      $q.notify({ type: 'positive', message: 'Bloque intercambiado' });
      swapDialogOpen.value = false;
      loadSession();
    } catch {
      $q.notify({ type: 'negative', message: 'Error intercambiando bloque' });
    }
  });
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
    if (level === 'alfa') return 'amber-8';
    if (level === 'delta') return 'deep-orange-7';
    if (level === 'sigma') return 'brown-8';
    if (level === 'omega') return 'red-9';
    if (level === 'spartan') return 'grey-9';
  }
  switch (group) {
    case 'alfa_delta':
      return 'deep-orange-7';
    case 'sigma':
      return 'brown-8';
    case 'omega':
      return 'red-9';
    default:
      return 'grey';
  }
}

function memberLevelLabel(memberLevel: string | undefined, group: LevelGroup): string {
  if (memberLevel) {
    return memberLevel.charAt(0).toUpperCase() + memberLevel.slice(1).toLowerCase();
  }
  switch (group) {
    case 'alfa_delta':
      return 'Alfa/Delta';
    case 'sigma':
      return 'Sigma';
    case 'omega':
      return 'Omega';
    default:
      return group;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

onMounted(loadSession);
</script>
