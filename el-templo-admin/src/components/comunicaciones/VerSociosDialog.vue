<!-- "Ver socios" de un aviso (Fase 193, plan 11, D-18): quiénes tocaron el
     botón, con nombre y teléfono. El link a WhatsApp usa la fuente única
     `whatsappUrl` (src/utils/whatsapp.ts) — el `window.open` se dispara
     ANTES de cualquier `await` del handler para no perder el gesto de
     usuario (mismo patrón que TrialSessionsReport.vue). -->
<template>
  <q-dialog v-model="localOpen">
    <q-card style="min-width: 480px; max-width: 640px; width: 100%">
      <q-card-section>
        <div class="text-h6">Socios que tocaron el botón</div>
        <div class="text-caption text-grey-7">{{ avisoTitle }}</div>
      </q-card-section>

      <q-card-section>
        <q-table
          :rows="clickers"
          :columns="columns"
          row-key="userId"
          flat
          bordered
          :loading="loading"
          :pagination="{ rowsPerPage: 20 }"
        >
          <template #body-cell-phone="props">
            <q-td :props="props">
              <q-btn
                v-if="props.row.phone"
                flat
                dense
                no-caps
                color="primary"
                icon="chat"
                :label="props.row.phone"
                @click="openWhatsapp(props.row.phone)"
              />
              <span v-else class="text-grey-6">Sin teléfono</span>
            </q-td>
          </template>

          <template #body-cell-lastAt="props">
            <q-td :props="props">{{ formatDateTime(props.row.lastAt) }}</q-td>
          </template>

          <template #no-data>
            <div class="full-width text-center q-pa-lg text-grey-6">
              Todavía nadie tocó el botón.
            </div>
          </template>
        </q-table>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cerrar" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { whatsappUrl } from 'src/utils/whatsapp';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type { AvisoClicker } from 'src/composables/useCommunicationsApi';

const log = createLogger('VerSociosDialog');
const $q = useQuasar();
const commsApi = useCommunicationsApi();

const props = defineProps<{
  modelValue: boolean;
  avisoId: number | null;
  avisoTitle: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const localOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const clickers = ref<AvisoClicker[]>([]);
const loading = ref(false);

const columns: QTableColumn[] = [
  { name: 'fullName', label: 'Nombre', field: 'fullName', align: 'left', sortable: true },
  { name: 'phone', label: 'Teléfono', field: 'phone', align: 'left' },
  { name: 'lastAt', label: 'Última vez', field: 'lastAt', align: 'left', sortable: true },
];

// Botón de WhatsApp: `window.open` SIEMPRE antes del `await` (evita el
// bloqueo de pop-ups del navegador ante un handler async).
function openWhatsapp(phone: string): void {
  window.open(whatsappUrl(phone), '_blank', 'noopener');
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

async function loadClickers(): Promise<void> {
  if (!props.avisoId) {
    clickers.value = [];
    return;
  }
  loading.value = true;
  try {
    clickers.value = await commsApi.listAvisoClickers(props.avisoId);
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando quién tocó el botón');
    log.error('Error loading clickers', { error: message, avisoId: props.avisoId });
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void loadClickers();
  },
);

onUnmounted(() => {
  commsApi.cleanup();
});
</script>
