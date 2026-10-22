<!--
  Pedidos de desbloqueo de Conquer (fase 201, D-12): alumnos que tocaron "Quiero desbloquearlo"
  y todavía no fueron activados, el más viejo primero. "Activar" le pide a la página que abra el
  diálogo de alta con el alumno ya elegido.
-->
<template>
  <div>
    <div v-if="loading && requests.length === 0" class="row justify-center q-pa-lg">
      <q-spinner color="secondary" size="32px" />
    </div>

    <q-banner v-else-if="loadError" rounded class="bg-grey-3 text-accent">
      {{ loadError }}
      <template #action>
        <q-btn flat color="secondary" label="Reintentar" @click="load" />
      </template>
    </q-banner>

    <div v-else-if="requests.length === 0" class="text-center text-grey-8 q-pa-lg">
      <q-icon name="inbox" size="40px" color="grey-6" />
      <div class="q-mt-sm">No hay pedidos de desbloqueo</div>
    </div>

    <q-list v-else bordered separator class="rounded-borders">
      <q-item v-for="req in requests" :key="req.userId" data-test="conquer-request">
        <q-item-section>
          <q-item-label class="text-weight-medium">
            {{ fullName(req.firstName, req.lastName) || req.email }}
          </q-item-label>
          <q-item-label caption>
            {{ detailLine(req) }}
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-btn
            unelevated
            dense
            no-caps
            color="secondary"
            label="Activar"
            class="q-px-md"
            style="min-height: 36px"
            @click="emit('activate', { userId: req.userId, name: displayName(req) })"
          />
        </q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import type { UnlockRequest } from 'src/types/conquer';
import { agoText, daysSince, fullName } from 'src/utils/conquer-format';

const props = defineProps<{
  /** Sube cuando la página necesita que se relea la lista (después de activar a alguien). */
  reloadToken: number;
}>();

const emit = defineEmits<{
  activate: [member: { userId: number; name: string }];
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();

const requests = ref<UnlockRequest[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

function displayName(req: UnlockRequest): string {
  return fullName(req.firstName, req.lastName) || req.email;
}

function detailLine(req: UnlockRequest): string {
  const days = daysSince(req.requestedAt);
  const parts: string[] = [];
  if (req.branchName) parts.push(req.branchName);
  parts.push(days === null ? 'pidió el desbloqueo' : `pidió ${agoText(days)}`);
  return parts.join(' · ');
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    requests.value = await conquerApi.listRequests();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'No pudimos cargar los pedidos';
    loadError.value = message;
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.reloadToken, load);
</script>
