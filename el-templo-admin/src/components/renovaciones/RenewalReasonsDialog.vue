<!-- Configuración de motivos de no renovación (SPEC Admin "Motivos"). Solo
     owner/admin (gate real en el API — acá solo se abre el gear que dispara
     este diálogo). Sin lugar de "Configuración" natural para este dominio
     específico (Usuarios/Reglas de precio/Comunicaciones/Partners no
     encajan) — mismo patrón de "engranaje con diálogo" que Comunicaciones
     (`AjustesDialog.vue`), abierto desde el ícono de la cabecera del tab
     Renovaciones (RenovacionesTab.vue, dentro de ReportesPage). Sin DELETE:
     desactivar en vez de borrar. -->
<template>
  <q-dialog v-model="localOpen" @show="onShow">
    <q-card style="min-width: 420px; max-width: 560px; width: 100%">
      <q-card-section class="row items-center">
        <q-icon name="settings" size="24px" class="q-mr-sm" />
        <div class="text-h6">Motivos de no renovación</div>
        <q-space />
        <q-btn flat round dense icon="close" v-close-popup />
      </q-card-section>
      <q-separator />

      <q-card-section>
        <div class="row q-col-gutter-sm items-end q-mb-md">
          <div class="col">
            <q-input
              v-model="newLabel"
              label="Nuevo motivo"
              dense
              outlined
              maxlength="80"
              :disable="creating"
              @keyup.enter="onCreate"
            />
          </div>
          <div class="col-auto">
            <q-btn
              color="primary"
              label="Agregar"
              :loading="creating"
              :disable="!newLabel.trim()"
              @click="onCreate"
            />
          </div>
        </div>

        <div v-if="loading" class="flex flex-center q-pa-lg">
          <q-spinner-dots size="32px" color="primary" />
        </div>

        <q-list v-else bordered separator class="rounded-borders">
          <q-item v-for="reason in sortedReasons" :key="reason.id" class="q-py-sm">
            <q-item-section>
              <q-input
                :model-value="reason.label"
                dense
                borderless
                maxlength="80"
                debounce="600"
                :class="{ 'text-strike text-grey-6': !reason.isActive }"
                @update:model-value="(v) => onLabelChange(reason, String(v ?? ''))"
              />
            </q-item-section>
            <q-item-section side style="width: 84px">
              <q-input
                :model-value="reason.sortOrder"
                type="number"
                dense
                borderless
                label="Orden"
                debounce="600"
                @update:model-value="(v) => onSortOrderChange(reason, Number(v))"
              />
            </q-item-section>
            <q-item-section side>
              <q-toggle
                :model-value="reason.isActive"
                color="primary"
                @update:model-value="(v) => onActiveChange(reason, Boolean(v))"
              >
                <q-tooltip>{{ reason.isActive ? 'Activo' : 'Inactivo' }}</q-tooltip>
              </q-toggle>
            </q-item-section>
          </q-item>
          <q-item v-if="reasons.length === 0">
            <q-item-section class="text-grey-6 text-italic">Sin motivos cargados</q-item-section>
          </q-item>
        </q-list>
        <div class="text-caption text-grey-6 q-mt-sm">
          Sin borrado: un motivo usado en el pasado se desactiva, no se elimina.
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useRenewalsApi } from 'src/composables/useRenewalsApi';
import type { RenewalReason } from 'src/types/renewals';

const log = createLogger('RenewalReasonsDialog');
const $q = useQuasar();
const renewalsApi = useRenewalsApi();

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const localOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const reasons = ref<RenewalReason[]>([]);
const loading = ref(false);
const creating = ref(false);
const newLabel = ref('');

const sortedReasons = computed(() =>
  [...reasons.value].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
);

async function onShow() {
  loading.value = true;
  try {
    reasons.value = await renewalsApi.listReasons(true);
  } catch (err: unknown) {
    log.error('Error cargando motivos', { error: err instanceof Error ? err.message : String(err) });
    $q.notify({ type: 'negative', message: 'No se pudieron cargar los motivos' });
  } finally {
    loading.value = false;
  }
}

async function onCreate() {
  const label = newLabel.value.trim();
  if (!label) return;
  creating.value = true;
  try {
    const created = await renewalsApi.createReason({ label });
    reasons.value = [...reasons.value, created];
    newLabel.value = '';
  } catch (err: unknown) {
    log.error('Error creando motivo', { error: err instanceof Error ? err.message : String(err) });
    $q.notify({
      type: 'negative',
      message: renewalsApi.error.value ?? 'No se pudo crear el motivo',
    });
  } finally {
    creating.value = false;
  }
}

function replaceReason(updated: RenewalReason) {
  const idx = reasons.value.findIndex((r) => r.id === updated.id);
  if (idx !== -1) reasons.value[idx] = updated;
}

async function onLabelChange(reason: RenewalReason, label: string) {
  const trimmed = label.trim();
  if (!trimmed || trimmed === reason.label) return;
  try {
    const updated = await renewalsApi.updateReason(reason.id, { label: trimmed });
    replaceReason(updated);
  } catch (err: unknown) {
    log.error('Error renombrando motivo', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: renewalsApi.error.value ?? 'No se pudo renombrar el motivo' });
  }
}

async function onSortOrderChange(reason: RenewalReason, sortOrder: number) {
  if (!Number.isFinite(sortOrder) || sortOrder === reason.sortOrder) return;
  try {
    const updated = await renewalsApi.updateReason(reason.id, { sortOrder });
    replaceReason(updated);
  } catch (err: unknown) {
    log.error('Error reordenando motivo', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudo reordenar el motivo' });
  }
}

async function onActiveChange(reason: RenewalReason, isActive: boolean) {
  try {
    const updated = await renewalsApi.updateReason(reason.id, { isActive });
    replaceReason(updated);
  } catch (err: unknown) {
    log.error('Error activando/desactivando motivo', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudo actualizar el motivo' });
  }
}
</script>
