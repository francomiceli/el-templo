<!-- Categoría "Avisos en TV" del dashboard de Comunicaciones (Fase 193, Plan
     B, pedido de Franco 2026-09-03) — reemplaza la vieja `q-table` por una
     grilla de `ComunicacionCard`. El listado (`avisos`) y el estado de
     módulo (`moduleDisabled`) los resuelve `ComunicacionesPage.vue` al
     montar; acá solo se pide `reload` tras crear/editar/borrar/toggle.
     Entidad APARTE de los avisos de la app: sin `kind` (siempre "Propia",
     D-24, plan 16) — no hay plantillas de sistema de TV, así que tampoco
     hay botón "Restaurar las del sistema" acá. -->
<template>
  <div>
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-subtitle1 text-weight-medium">Avisos en TV</div>
        <div class="text-caption text-grey-7">
          Placa que se ve en la pantalla del televisor de la sede.
        </div>
      </div>
      <div class="col-auto">
        <q-btn
          v-if="!moduleDisabled"
          color="primary"
          icon="add"
          label="Nuevo aviso de TV"
          unelevated
          @click="openCreate"
        />
      </div>
    </div>

    <div v-if="moduleDisabled" class="text-center q-pa-xl text-grey-7">
      <q-icon name="tv_off" size="48px" color="grey-5" />
      <div class="text-subtitle1 q-mt-md">
        El módulo de TV no está habilitado para este gimnasio
      </div>
      <div class="text-caption">
        Los avisos de TV dependen del módulo de entrenamiento en vivo (control de clase +
        pantalla de sede), que está apagado para este tenant.
      </div>
    </div>

    <template v-else>
      <!-- D-25/D-26: ayuda contextual sobre por qué el profe a veces no ve el
           botón AVISO en el control (lección L4 de la fase). -->
      <q-banner class="bg-orange-1 text-orange-10 q-mb-md" rounded dense>
        <template #avatar>
          <q-icon name="info" color="orange-9" />
        </template>
        En modo <strong>Manual</strong>, el profe ve un botón AVISO en el control y el aviso
        queda en pantalla completa hasta que avanza de bloque. El botón solo aparece cuando hay
        un aviso Manual <strong>activo</strong> para la sede — si el profe no lo ve, revisá que
        el aviso esté activo y que la sede esté en su alcance. En modo reemplazo, el texto ocupa
        el lugar de la cápsula (flexibilidad inicial) o de la frase (cierre), sin que el profe
        tenga que hacer nada.
      </q-banner>

      <div v-if="!avisos.length" class="text-center q-pa-lg text-grey-6">
        No hay avisos de TV todavía. Creá uno con "Nuevo aviso de TV".
      </div>

      <div v-else class="row q-col-gutter-md">
        <div v-for="row in avisos" :key="row.id" class="col-12 col-sm-6 col-lg-4">
          <ComunicacionCard
            :title="row.title"
            :subtitle="row.body"
            origin="custom"
            :enabled="row.isActive"
            :meta="cardMeta(row)"
            @update:enabled="(val) => toggleActive(row, val)"
            @edit="openEdit(row)"
            @delete="handleDelete(row)"
          />
        </div>
      </div>
    </template>

    <TvAvisoEditorDialog v-model="editorOpen" :aviso="editingAviso" @saved="emit('reload')" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import TvAvisoEditorDialog from 'src/components/comunicaciones/TvAvisoEditorDialog.vue';
import ComunicacionCard from 'src/components/comunicaciones/ComunicacionCard.vue';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type { TvAvisoRow, TvAvisoMode } from 'src/composables/useCommunicationsApi';
import type { BranchOption } from 'src/types/member';
import { confirmDeleteComunicacion } from 'src/utils/confirm-delete-comunicacion';

const log = createLogger('TvAvisosTab');
const $q = useQuasar();
const commsApi = useCommunicationsApi();

const props = defineProps<{
  avisos: TvAvisoRow[];
  moduleDisabled: boolean;
  branches: BranchOption[];
}>();
const emit = defineEmits<{ reload: [] }>();

const MODE_LABELS: Record<TvAvisoMode, string> = {
  manual: 'Manual',
  flex_inicio: 'Reemplaza flexibilidad inicial',
  flex_final: 'Reemplaza flexibilidad final',
};

function sedesLabel(row: TvAvisoRow): string {
  if (!row.scopeBranchIds || row.scopeBranchIds.length === 0) return 'Todas';
  const names = row.scopeBranchIds.map((id) => {
    const branch = props.branches.find((b) => b.id === id);
    return branch?.name ?? `#${id}`;
  });
  return names.join(', ');
}

function cardMeta(row: TvAvisoRow): Array<{ icon: string; text: string }> {
  return [
    { icon: 'tv', text: MODE_LABELS[row.mode] },
    { icon: 'place', text: sedesLabel(row) },
  ];
}

const editorOpen = ref(false);
const editingAviso = ref<TvAvisoRow | null>(null);

function openCreate(): void {
  editingAviso.value = null;
  editorOpen.value = true;
}

function openEdit(row: TvAvisoRow): void {
  editingAviso.value = row;
  editorOpen.value = true;
}

async function toggleActive(row: TvAvisoRow, value: boolean): Promise<void> {
  try {
    await commsApi.updateTvAviso(row.id, { isActive: value });
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo actualizar el aviso de TV');
    log.error('Error toggling tv aviso', { error: message, avisoId: row.id });
    $q.notify({ type: 'negative', message });
  }
}

async function handleDelete(row: TvAvisoRow): Promise<void> {
  const ok = await confirmDeleteComunicacion($q, {
    title: 'Borrar aviso de TV',
    itemLabel: row.title,
    isSystem: false,
  });
  if (!ok) return;

  try {
    await commsApi.deleteTvAviso(row.id);
    $q.notify({ type: 'positive', message: 'Aviso de TV borrado' });
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo borrar el aviso de TV');
    log.error('Error deleting tv aviso', { error: message, avisoId: row.id });
    $q.notify({ type: 'negative', message });
  }
}
</script>
