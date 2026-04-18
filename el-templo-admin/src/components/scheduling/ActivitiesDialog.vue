<template>
  <q-dialog :model-value="show" @update:model-value="$emit('update:show', $event)">
    <q-card style="min-width: 500px; max-width: 600px">
      <q-card-section>
        <div class="text-h6">Gestionar Actividades</div>
      </q-card-section>

      <q-separator />

      <q-card-section class="q-px-none q-py-sm" style="max-height: 400px; overflow-y: auto">
        <q-list separator>
          <q-item v-if="loadingActivities" class="flex flex-center q-pa-lg">
            <q-spinner-dots size="30px" color="primary" />
          </q-item>

          <q-item v-for="act in activities" :key="act.id">
            <q-item-section>
              <q-item-label :class="{ 'text-grey-5 text-strike': !act.isActive }">
                {{ act.name }}
                <q-badge
                  v-if="!act.isActive"
                  outline
                  color="grey-7"
                  label="Inactiva"
                  class="q-ml-sm"
                />
              </q-item-label>
              <q-item-label caption>{{ act.description || 'Sin descripcion' }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <div class="row items-center q-gutter-xs">
                <q-btn flat dense round icon="edit" size="sm" @click="startEditActivity(act)" />
                <q-btn
                  v-if="act.isActive"
                  flat
                  dense
                  round
                  icon="close"
                  color="negative"
                  size="sm"
                  @click="confirmDeactivate(act)"
                >
                  <q-tooltip>Desactivar actividad</q-tooltip>
                </q-btn>
                <q-btn
                  v-else
                  flat
                  dense
                  round
                  icon="restore"
                  color="positive"
                  size="sm"
                  @click="onToggleActivity(act.id, act.name, act.description, true)"
                >
                  <q-tooltip>Reactivar actividad</q-tooltip>
                </q-btn>
              </div>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">
          {{ editingActivity ? 'Editar actividad' : 'Nueva actividad' }}
        </div>
        <div class="row q-gutter-sm">
          <q-input v-model="activityForm.name" label="Nombre" dense outlined class="col" />
          <q-input
            v-model="activityForm.description"
            label="Descripcion"
            dense
            outlined
            class="col"
          />
          <q-btn
            :icon="editingActivity ? 'save' : 'add'"
            color="primary"
            dense
            :disable="!activityForm.name.trim()"
            @click="onSaveActivity"
          />
          <q-btn v-if="editingActivity" icon="close" flat dense @click="cancelEditActivity" />
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cerrar" color="grey-7" @click="$emit('update:show', false)" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import type { ActivityRecord } from 'src/types/scheduling';

const log = createLogger('ActivitiesDialog');
const $q = useQuasar();
const schedulingApi = useSchedulingApi();

// ─── Props & Emits ──────────────────────────────────────────────────────────

const props = defineProps<{
  show: boolean;
}>();

defineEmits<{
  'update:show': [value: boolean];
}>();

// ─── State ──────────────────────────────────────────────────────────────────

const activities = ref<ActivityRecord[]>([]);
const loadingActivities = ref(false);
const activityForm = ref({ name: '', description: '' });
const editingActivity = ref<ActivityRecord | null>(null);

// ─── Data Loading ───────────────────────────────────────────────────────────

async function loadActivities() {
  loadingActivities.value = true;
  try {
    activities.value = await schedulingApi.listActivities();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading activities', { error: message });
  } finally {
    loadingActivities.value = false;
  }
}

// ─── Activity Management ────────────────────────────────────────────────────

function startEditActivity(act: ActivityRecord) {
  editingActivity.value = act;
  activityForm.value = { name: act.name, description: act.description ?? '' };
}

function cancelEditActivity() {
  editingActivity.value = null;
  activityForm.value = { name: '', description: '' };
}

async function onSaveActivity() {
  if (!activityForm.value.name.trim()) return;
  try {
    if (editingActivity.value) {
      await schedulingApi.updateActivity(editingActivity.value.id, {
        name: activityForm.value.name,
        description: activityForm.value.description || undefined,
      });
      $q.notify({ type: 'positive', message: 'Actividad actualizada' });
    } else {
      await schedulingApi.createActivity({
        name: activityForm.value.name,
        description: activityForm.value.description || undefined,
      });
      $q.notify({ type: 'positive', message: 'Actividad creada' });
    }
    activityForm.value = { name: '', description: '' };
    editingActivity.value = null;
    await loadActivities();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error saving activity', { error: message });
    $q.notify({ type: 'negative', message: 'Error guardando actividad' });
  }
}

async function onToggleActivity(
  id: number,
  name: string,
  description: string | null,
  isActive: boolean
) {
  try {
    await schedulingApi.updateActivity(id, {
      name,
      description: description ?? undefined,
      isActive,
    });
    await loadActivities();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error toggling activity', { error: message });
    $q.notify({ type: 'negative', message: 'Error actualizando actividad' });
  }
}

function confirmDeactivate(act: ActivityRecord) {
  $q.dialog({
    title: 'Desactivar actividad',
    message: `Desactivar "${act.name}"? Los horarios existentes que la referencian seguiran funcionando, pero no podras asignarla a nuevos slots hasta reactivarla.`,
    cancel: { flat: true, label: 'Volver' },
    ok: { color: 'negative', label: 'Desactivar' },
  }).onOk(() => {
    void onToggleActivity(act.id, act.name, act.description, false);
  });
}

// ─── Watchers ───────────────────────────────────────────────────────────────

// Load activities and reset form when dialog opens
watch(
  () => props.show,
  (val) => {
    if (val) {
      loadActivities();
      cancelEditActivity();
    }
  }
);
</script>
