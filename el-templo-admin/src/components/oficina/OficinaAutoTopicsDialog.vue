<!--
  Avisos automáticos de Oficina (fase 205): activar o desactivar cada aviso del
  sistema para todo el gimnasio o por sede. Cada cambio se guarda al instante:
  la API vuelve a correr el aviso y cierra los temas abiertos de lo que se apagó.
  Un tema que ya se cerró no se reabre al volver a activar el aviso.
-->
<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card class="avisos-dialog">
      <q-card-section class="row items-start no-wrap q-pb-none">
        <div class="col">
          <div class="text-h6">Avisos automáticos</div>
          <div class="text-caption text-grey-7">
            Los temas que Oficina abre sola. Apagá los que no tienen sentido para tu gimnasio o para
            una sede.
          </div>
        </div>
        <q-btn v-close-popup flat round dense icon="close" aria-label="Cerrar" />
      </q-card-section>

      <q-card-section v-if="loadingSettings" class="flex flex-center q-pa-xl">
        <q-spinner-dots size="40px" color="primary" />
      </q-card-section>

      <q-card-section v-else-if="loadFailed" class="text-center q-pa-lg">
        <div class="text-body2 text-grey-8 q-mb-sm">No pudimos cargar los avisos.</div>
        <q-btn flat no-caps color="primary" icon="refresh" label="Reintentar" @click="load" />
      </q-card-section>

      <q-card-section v-else class="q-gutter-y-md avisos-body">
        <q-card
          v-for="detector in detectors"
          :key="detector.key"
          flat
          bordered
          class="avisos-card"
          :data-detector="detector.key"
        >
          <q-card-section class="row items-start no-wrap">
            <div class="col q-pr-md">
              <div class="text-subtitle1 text-weight-medium">{{ detector.label }}</div>
              <div class="text-caption text-grey-7">{{ detector.description }}</div>
            </div>
            <q-toggle
              :model-value="!detector.disabledAll"
              color="primary"
              label="Activo"
              left-label
              :disable="savingKey === detector.key"
              @update:model-value="(active: boolean) => onToggleAll(detector, active)"
            />
          </q-card-section>

          <template v-if="!detector.disabledAll && detector.perBranch && detector.branches.length">
            <q-separator />
            <q-card-section class="q-py-sm">
              <div class="text-caption text-grey-7 q-mb-xs">Activo en:</div>
              <q-toggle
                v-for="branch in detector.branches"
                :key="branch.id"
                class="avisos-branch"
                color="primary"
                dense
                :label="branch.name"
                :model-value="!detector.disabledBranchIds.includes(branch.id)"
                :disable="savingKey === detector.key"
                @update:model-value="
                  (active: boolean) => onToggleBranch(detector, branch.id, active)
                "
              />
            </q-card-section>
          </template>

          <q-card-section
            v-else-if="detector.disabledAll"
            class="q-py-sm text-caption text-grey-7 bg-summary-surface"
          >
            Apagado para todo el gimnasio: no se abren temas nuevos de este aviso.
          </q-card-section>

          <q-linear-progress
            v-if="savingKey === detector.key"
            indeterminate
            color="primary"
            size="2px"
          />
        </q-card>
      </q-card-section>

      <q-card-actions align="right" class="q-px-md q-pb-md">
        <q-btn v-close-popup flat no-caps color="grey-8" label="Cerrar" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import { useOfficeApi, type OfficeAutoDetector } from 'src/composables/useOfficeApi';

const props = defineProps<{ modelValue: boolean }>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** Se guardó un aviso: la lista de temas puede haber cambiado (se cerraron temas). */
  changed: [];
}>();

const log = createLogger('OficinaAutoTopicsDialog');
const $q = useQuasar();
const officeApi = useOfficeApi();

const detectors = ref<OfficeAutoDetector[]>([]);
const loadingSettings = ref(false);
const loadFailed = ref(false);
const savingKey = ref<string | null>(null);

async function load(): Promise<void> {
  loadingSettings.value = true;
  loadFailed.value = false;
  try {
    detectors.value = await officeApi.getAutoTopicSettings();
  } catch (err: unknown) {
    loadFailed.value = true;
    log.error('No se pudieron cargar los avisos automáticos', {
      error: err instanceof Error ? err.message : 'desconocido',
    });
  } finally {
    loadingSettings.value = false;
  }
}

// Cada vez que se abre se vuelve a leer: otra persona pudo haber cambiado algo.
watch(
  () => props.modelValue,
  (open) => {
    if (open) void load();
  },
  { immediate: true }
);

async function save(
  detector: OfficeAutoDetector,
  next: { disabledAll: boolean; disabledBranchIds: number[] }
): Promise<void> {
  if (savingKey.value !== null) return;
  savingKey.value = detector.key;
  try {
    const saved = await officeApi.saveAutoTopicSetting(detector.key, next);
    detectors.value = detectors.value.map((d) => (d.key === saved.key ? saved : d));
    $q.notify({ type: 'positive', message: `Aviso guardado: ${saved.label}` });
    emit('changed');
  } catch (err: unknown) {
    const context = {
      error: err instanceof Error ? err.message : 'desconocido',
      key: detector.key,
    };
    if (isExpectedClientError(err)) log.warn('No se pudo guardar el aviso', context);
    else log.error('No se pudo guardar el aviso', context);
    $q.notify({ type: 'negative', message: extractError(err, 'No pudimos guardar el aviso') });
    // Puede haber cambiado desde otra pantalla: se vuelve a leer lo real.
    void load();
  } finally {
    savingKey.value = null;
  }
}

function onToggleAll(detector: OfficeAutoDetector, active: boolean): void {
  void save(detector, {
    disabledAll: !active,
    disabledBranchIds: detector.disabledBranchIds,
  });
}

function onToggleBranch(detector: OfficeAutoDetector, branchId: number, active: boolean): void {
  const rest = detector.disabledBranchIds.filter((id) => id !== branchId);
  void save(detector, {
    disabledAll: detector.disabledAll,
    disabledBranchIds: active ? rest : [...rest, branchId],
  });
}
</script>

<style scoped lang="scss">
.avisos-dialog {
  width: 640px;
  max-width: 95vw;
}

.avisos-body {
  max-height: 65vh;
  overflow-y: auto;
}

.avisos-branch {
  display: flex;
  margin: 2px 0;
}
</style>
