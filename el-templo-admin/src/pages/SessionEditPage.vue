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
      </div>

      <!-- Blocks -->
      <div class="text-subtitle1 q-mb-sm">Bloques</div>
      <editable-block-card
        v-for="block in session.blocks"
        :key="block.id"
        :block="block"
        :session-id="session.id"
        @swap-exercise="onSwapExercise"
        @add-exercise="onAddExercise"
        @refresh="loadSession"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionsApi } from 'src/composables/useSessionsApi';
import { useEditApi } from 'src/composables/useEditApi';
import { useAdminStore } from 'src/stores/useAdminStore';
import StatusBadge from 'src/components/sessions/StatusBadge.vue';
import EditableBlockCard from 'src/components/sessions/EditableBlockCard.vue';
import type { SessionDetail, SessionExercise, LevelGroup } from 'src/types/session';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const sessionsApi = useSessionsApi();
const editApi = useEditApi();
const adminStore = useAdminStore();

const session = ref<SessionDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

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
  const id = route.params.id;
  router.push(`/sessions/${id}`);
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
      loadSession();
    } catch {
      $q.notify({ type: 'negative', message: editApi.error.value || 'Error al restaurar sesion' });
    }
  });
}

function onSwapExercise(payload: { blockId: number; exercise: SessionExercise }) {
  // Swap dialog will be implemented in plan 15-06
  void payload;
  $q.notify({ type: 'info', message: 'Intercambio de ejercicios - Proximamente', timeout: 2000 });
}

function onAddExercise(payload: { blockId: number }) {
  // Add exercise dialog will be implemented in plan 15-06
  void payload;
  $q.notify({ type: 'info', message: 'Agregar ejercicio - Proximamente', timeout: 2000 });
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
