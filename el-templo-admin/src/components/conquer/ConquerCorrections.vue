<!--
  Bandeja de correcciones con video de Conquer (fase 202, D-26, D-28, D-29): los alumnos que
  mandaron un video para que el coach lo mire. "Pendientes" va con la más vieja primero y
  "Respondidas" con las 50 más recientes. La fila abre el detalle (video, comentario, borrado); la
  respuesta del coach (202-10) se escribe en el mismo diálogo y, al enviarse, la fila pasa a
  Respondidas y sale de Pendientes.
-->
<template>
  <div data-test="conquer-corrections">
    <q-btn-toggle
      v-model="status"
      no-caps
      unelevated
      dense
      toggle-color="secondary"
      color="grey-3"
      text-color="accent"
      :options="statusOptions"
      class="q-mb-md"
    />

    <div v-if="loading && items.length === 0" class="row justify-center q-pa-lg">
      <q-spinner color="secondary" size="32px" />
    </div>

    <q-banner v-else-if="loadError" rounded class="bg-grey-3 text-accent">
      {{ loadError }}
      <template #action>
        <q-btn flat color="secondary" label="Reintentar" @click="load" />
      </template>
    </q-banner>

    <div v-else-if="items.length === 0" class="text-center text-grey-8 q-pa-lg">
      <q-icon name="ondemand_video" size="40px" color="grey-6" />
      <div class="q-mt-sm">{{ emptyText }}</div>
    </div>

    <q-list v-else bordered separator class="rounded-borders">
      <q-item
        v-for="item in items"
        :key="item.id"
        clickable
        data-test="conquer-correction-row"
        @click="openDetail(item)"
      >
        <q-item-section>
          <q-item-label class="text-weight-medium">
            <router-link
              :to="{ name: 'conquer-alumno', params: { userId: item.userId } }"
              class="text-secondary"
              @click.stop
            >
              {{ item.memberName || 'Alumno' }}
            </router-link>
            <span class="text-grey-8 text-weight-regular"> · {{ item.targetLabel }}</span>
          </q-item-label>
          <q-item-label caption>{{ detailLine(item) }}</q-item-label>
          <q-item-label v-if="item.comment" caption lines="1">{{ item.comment }}</q-item-label>
        </q-item-section>
        <q-item-section side top>
          <div class="column items-end q-gutter-y-xs">
            <q-chip v-if="item.videoDeleted" dense square color="grey-3" text-color="accent">
              Video borrado
            </q-chip>
            <q-chip
              v-if="item.status === 'respondida'"
              dense
              square
              color="grey-3"
              text-color="accent"
            >
              {{ repliedText(item) }}
            </q-chip>
          </div>
        </q-item-section>
      </q-item>
    </q-list>

    <ConquerCorrectionDialog v-model="detailOpen" :correction="selected" @changed="onChanged" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import ConquerCorrectionDialog from 'src/components/conquer/ConquerCorrectionDialog.vue';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import { useAdminStore } from 'src/stores/useAdminStore';
import type { AdminCorrection, CorrectionStatus } from 'src/types/conquer';
import { agoText, daysSince, durationText } from 'src/utils/conquer-format';

const props = defineProps<{
  /** Sube cuando la página necesita que se relea la lista (después de activar a alguien). */
  reloadToken: number;
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();
const adminStore = useAdminStore();

const statusOptions = [
  { label: 'Pendientes', value: 'pendiente' },
  { label: 'Respondidas', value: 'respondida' },
];

const status = ref<CorrectionStatus>('pendiente');
const items = ref<AdminCorrection[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

const detailOpen = ref(false);
const selected = ref<AdminCorrection | null>(null);

// Descarta respuestas de una carga vieja si el coach cambió de toggle mientras tanto.
let loadToken = 0;

const emptyText = computed(() =>
  status.value === 'pendiente' ? 'No hay correcciones pendientes' : 'Todavía no respondiste ninguna'
);

function agoOf(iso: string): string {
  const days = daysSince(iso);
  return days === null ? '' : agoText(days);
}

function detailLine(item: AdminCorrection): string {
  const parts: string[] = [];
  const ago = agoOf(item.createdAt);
  if (ago) parts.push(ago);
  parts.push(durationText(item.durationSec));
  return parts.join(' · ');
}

function repliedText(item: AdminCorrection): string {
  return item.repliedByName ? `Respondida por ${item.repliedByName}` : 'Respondida';
}

async function load(): Promise<void> {
  const mine = ++loadToken;
  loading.value = true;
  loadError.value = null;
  try {
    const list = await conquerApi.listCorrections(status.value);
    if (mine !== loadToken) return;
    items.value = list;
  } catch (err: unknown) {
    if (mine !== loadToken) return;
    const message = err instanceof Error ? err.message : 'No pudimos cargar las correcciones';
    items.value = [];
    loadError.value = message;
    $q.notify({ type: 'negative', message });
  } finally {
    if (mine === loadToken) loading.value = false;
  }
}

function openDetail(item: AdminCorrection): void {
  selected.value = item;
  detailOpen.value = true;
}

// El API devuelve la corrección completa: la fila se reemplaza; si cambió de estado, sale de
// la lista del toggle actual. El diálogo sigue mostrando la versión nueva.
function onChanged(updated: AdminCorrection): void {
  selected.value = updated;
  if (updated.status !== status.value) {
    items.value = items.value.filter((i) => i.id !== updated.id);
  } else {
    items.value = items.value.map((i) => (i.id === updated.id ? updated : i));
  }
  void adminStore.fetchConquerCorrectionsCount();
}

onMounted(load);
watch(() => props.reloadToken, load);
watch(status, () => {
  items.value = [];
  void load();
});
</script>
