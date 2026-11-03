<!--
  Pestaña "Oficina" de la ficha del socio (fase 205 D-20): temas de gestión vinculados a este
  socio y alta de un tema nuevo con el socio ya puesto. El detalle y la conversación viven en
  /oficina/:id.
-->
<template>
  <div>
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-subtitle1 text-weight-medium">Temas de Oficina</div>
        <div v-if="!loadingFirst && !loadFailed" class="text-caption text-grey-7">
          {{ summaryLabel }}
        </div>
      </div>
      <q-btn
        unelevated
        no-caps
        color="primary"
        icon="add"
        label="Nuevo tema"
        :disable="loadFailed"
        @click="dialogOpen = true"
      />
    </div>

    <div v-if="loadFailed" class="text-center text-grey-7 q-pa-lg">
      <q-icon name="error_outline" size="40px" color="grey-5" />
      <div class="q-mt-sm">No pudimos cargar los temas de este socio.</div>
      <q-btn flat no-caps color="primary" label="Reintentar" class="q-mt-sm" @click="load" />
    </div>

    <OficinaTopicList
      v-else
      :topics="sortedTopics"
      :selected-id="null"
      :loading="loadingFirst"
      empty-message="Este socio no tiene temas en Oficina."
      @select="openTopic"
    />

    <OficinaTopicDialog
      v-model="dialogOpen"
      mode="create"
      :staff="staff"
      :preset-target="{ kind: 'socio', id: userId, label: memberName }"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import {
  useOfficeApi,
  type OfficeStaff,
  type OfficeTopicListItem,
} from 'src/composables/useOfficeApi';
import OficinaTopicList from 'src/components/oficina/OficinaTopicList.vue';
import OficinaTopicDialog from 'src/components/oficina/OficinaTopicDialog.vue';

const props = defineProps<{
  userId: number;
  memberName: string;
}>();

const log = createLogger('MemberOficinaTab');
const $q = useQuasar();
const router = useRouter();
const officeApi = useOfficeApi();

const topics = ref<OfficeTopicListItem[]>([]);
const staff = ref<OfficeStaff[]>([]);
const loadingFirst = ref(true);
const loadFailed = ref(false);
const dialogOpen = ref(false);

// Abiertos y dormidos primero, cerrados al final; dentro de cada grupo, última actividad primero.
const sortedTopics = computed(() =>
  [...topics.value].sort(
    (a, b) =>
      Number(a.status === 'cerrado') - Number(b.status === 'cerrado') ||
      b.lastActivityAt.localeCompare(a.lastActivityAt)
  )
);

const openCount = computed(() => topics.value.filter((t) => t.status !== 'cerrado').length);

const summaryLabel = computed(() => {
  const total = topics.value.length;
  if (total === 0) return 'Sin temas todavía';
  const totalLabel = total === 1 ? '1 tema' : `${total} temas`;
  const openLabel = openCount.value === 1 ? '1 abierto' : `${openCount.value} abiertos`;
  return `${totalLabel}, ${openLabel}`;
});

async function load(): Promise<void> {
  try {
    topics.value = await officeApi.listTopics({
      view: 'todos',
      targetKind: 'socio',
      targetId: props.userId,
    });
    loadFailed.value = false;
  } catch (err: unknown) {
    log.error('No se pudieron cargar los temas del socio', {
      error: err instanceof Error ? err.message : String(err),
    });
    loadFailed.value = true;
    $q.notify({
      type: 'negative',
      message: extractError(err, 'No pudimos cargar los temas de este socio'),
    });
  } finally {
    loadingFirst.value = false;
  }
}

async function loadStaff(): Promise<void> {
  try {
    staff.value = await officeApi.listStaff();
  } catch (err: unknown) {
    // Sin staff el alta sigue andando, solo no se puede elegir responsable.
    log.error('No se pudo cargar el staff de Oficina', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function openTopic(id: number): void {
  void router.push('/oficina/' + id);
}

async function onSaved(): Promise<void> {
  await load();
}

onMounted(() => {
  void load();
  void loadStaff();
});

onUnmounted(() => {
  officeApi.cleanup();
});
</script>
