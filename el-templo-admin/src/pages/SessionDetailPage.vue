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
            Semana {{ session.week }} - {{ dayLabel(session.day) }}
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
              <q-chip dense :color="levelColor(session.levelGroup)">
                {{ levelLabel(session.levelGroup) }}
              </q-chip>
              <span v-if="session.memberLevel" class="q-ml-xs text-caption">
                ({{ session.memberLevel }})
              </span>
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
            <div v-if="session.discardedReason">
              <div class="text-caption text-grey">Razon de descarte</div>
              <div class="text-italic">{{ session.discardedReason }}</div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Action buttons -->
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
          v-if="session.status !== 'discarded'"
          color="negative"
          icon="delete_outline"
          label="Descartar"
          outline
          @click="handleDiscard"
        />
        <q-btn
          v-if="session.status === 'discarded'"
          color="info"
          icon="restore"
          label="Restaurar a Pendiente"
          @click="handleRestore"
        />
      </div>

      <!-- Blocks -->
      <div class="text-subtitle1 q-mb-sm">Bloques</div>
      <block-card
        v-for="block in session.blocks"
        :key="block.id"
        :block="block"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionsApi } from 'src/composables/useSessionsApi';
import StatusBadge from 'src/components/sessions/StatusBadge.vue';
import BlockCard from 'src/components/sessions/BlockCard.vue';
import type { SessionDetail, LevelGroup } from 'src/types/session';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const sessionsApi = useSessionsApi();

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
  router.push('/sessions');
}

async function handleApprove() {
  if (!session.value) return;
  try {
    await sessionsApi.approveSession(session.value.id);
    $q.notify({ type: 'positive', message: 'Sesion aprobada' });
    loadSession();
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
  } catch {
    $q.notify({ type: 'negative', message: 'Error revirtiendo sesion' });
  }
}

async function handleDiscard() {
  if (!session.value) return;
  $q.dialog({
    title: 'Descartar Sesion',
    message: 'Razon (opcional):',
    prompt: {
      model: '',
      type: 'textarea',
    },
    cancel: true,
  }).onOk(async (reason: string) => {
    try {
      await sessionsApi.discardSession(session.value!.id, reason || undefined);
      $q.notify({ type: 'info', message: 'Sesion descartada' });
      loadSession();
    } catch {
      $q.notify({ type: 'negative', message: 'Error descartando sesion' });
    }
  });
}

async function handleRestore() {
  if (!session.value) return;
  try {
    await sessionsApi.restoreSession(session.value.id);
    $q.notify({ type: 'positive', message: 'Sesion restaurada' });
    loadSession();
  } catch {
    $q.notify({ type: 'negative', message: 'Error restaurando sesion' });
  }
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

function levelColor(group: LevelGroup): string {
  switch (group) {
    case 'alfa_delta': return 'blue';
    case 'sigma': return 'purple';
    case 'omega': return 'orange';
    default: return 'grey';
  }
}

function levelLabel(group: LevelGroup): string {
  switch (group) {
    case 'alfa_delta': return 'Alfa/Delta';
    case 'sigma': return 'Sigma';
    case 'omega': return 'Omega';
    default: return group;
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
