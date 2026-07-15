<!--
  Phase 113: este componente fue refactor desde dialog flotante a panel
  embebido, consumido como tab "Actividades" en HorariosPage. El nombre del
  archivo se mantiene por compatibilidad de git history; el alias del
  import en HorariosPage es `ActivitiesPanel`.
-->
<template>
  <div class="q-pa-md">
    <div class="q-mb-md">
      <div class="text-subtitle1 text-weight-medium">Actividades</div>
      <div class="text-caption text-grey-7">
        Gestiona el catálogo de actividades disponibles para asignar a horarios.
      </div>
    </div>

    <q-card flat bordered>
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
                <q-badge
                  v-if="act.isSpecial"
                  color="deep-purple"
                  label="Especial"
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
        <div class="row q-gutter-sm items-start">
          <q-input v-model="activityForm.name" label="Nombre" dense outlined class="col" />
          <q-input
            v-model="activityForm.description"
            label="Descripcion"
            dense
            outlined
            class="col"
          />
          <q-input
            v-model="activityForm.maxCapacity"
            label="Cupo"
            type="number"
            dense
            outlined
            class="col"
            min="1"
            hint="vacío = hereda el cupo de la sucursal"
            :rules="[validateCapacity]"
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
        <div class="row items-center q-mt-sm">
          <q-toggle
            v-model="activityForm.isSpecial"
            label="Actividad especial (requiere pase)"
            color="deep-purple"
          />
          <q-icon name="info" size="18px" color="grey-6" class="q-ml-xs">
            <q-tooltip max-width="280px">
              Las actividades especiales solo pueden reservarse desde la app con un pase de
              actividades activo. El staff puede reservar manualmente con una advertencia.
            </q-tooltip>
          </q-icon>
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import axios from 'axios';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import type { ActivityRecord, AffectedScheduleRef } from 'src/types/scheduling';

const log = createLogger('ActivitiesPanel');
const $q = useQuasar();
const schedulingApi = useSchedulingApi();

// ─── Props & Emits ──────────────────────────────────────────────────────────

const props = defineProps<{
  /** True when the parent tab "Actividades" is currently visible. */
  active: boolean;
}>();

const emit = defineEmits<{
  /**
   * Emitted when the backend returns 409 with `affectedSchedules` (cascade-block
   * on activity deactivation per Plan 113-01). The parent (HorariosPage)
   * surfaces this as a toast listing the conflicting slots.
   */
  'cascade-error': [payload: { message: string; affectedSchedules: AffectedScheduleRef[] }];
}>();

// ─── State ──────────────────────────────────────────────────────────────────

const activities = ref<ActivityRecord[]>([]);
const loadingActivities = ref(false);
// maxCapacity is bound to a number-type q-input, so Quasar may hand back a
// string, a number, or an empty string; it is normalized to `number | null`
// on save (empty → null = inherit the branch cap).
const activityForm = ref<{
  name: string;
  description: string;
  maxCapacity: number | string | null;
  isSpecial: boolean;
}>({ name: '', description: '', maxCapacity: null, isSpecial: false });
const editingActivity = ref<ActivityRecord | null>(null);

/**
 * Validates the Cupo field: empty (inherit) or a positive integer.
 * Server-side validation (155-02) remains authoritative (1-500).
 */
function validateCapacity(v: number | string | null): true | string {
  if (v === null || v === undefined || v === '') return true;
  const n = Number(v);
  return (Number.isInteger(n) && n > 0) || 'El cupo debe ser un entero positivo';
}

/** Normalizes the Cupo input to `number | null` (empty/invalid → null). */
function normalizeCapacity(v: number | string | null): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

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
  activityForm.value = {
    name: act.name,
    description: act.description ?? '',
    maxCapacity: act.maxCapacity ?? null,
    isSpecial: act.isSpecial,
  };
}

function cancelEditActivity() {
  editingActivity.value = null;
  activityForm.value = { name: '', description: '', maxCapacity: null, isSpecial: false };
}

async function onSaveActivity() {
  if (!activityForm.value.name.trim()) return;
  if (validateCapacity(activityForm.value.maxCapacity) !== true) return;
  const maxCapacity = normalizeCapacity(activityForm.value.maxCapacity);
  try {
    if (editingActivity.value) {
      await schedulingApi.updateActivity(editingActivity.value.id, {
        name: activityForm.value.name,
        description: activityForm.value.description || undefined,
        maxCapacity,
        isSpecial: activityForm.value.isSpecial,
      });
      $q.notify({ type: 'positive', message: 'Actividad actualizada' });
    } else {
      await schedulingApi.createActivity({
        name: activityForm.value.name,
        description: activityForm.value.description || undefined,
        maxCapacity,
        isSpecial: activityForm.value.isSpecial,
      });
      $q.notify({ type: 'positive', message: 'Actividad creada' });
    }
    activityForm.value = { name: '', description: '', maxCapacity: null, isSpecial: false };
    editingActivity.value = null;
    await loadActivities();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error saving activity', { error: message });
    // Backend (Plan 113-01) returns 409 with actionable message for name
    // uniqueness ("Ya existe una actividad activa con ese nombre"). Use
    // extractError so the backend message reaches the user instead of a
    // generic fallback.
    $q.notify({ type: 'negative', message: extractError(err, 'Error guardando actividad') });
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

    // Detect cascade-block 409 with affectedSchedules and emit to parent so
    // HorariosPage can render an actionable toast listing the conflicting
    // slots. Falls back to generic toast for any other 409/4xx/5xx.
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      const data = err.response.data as {
        message?: string;
        affectedSchedules?: AffectedScheduleRef[];
      };
      if (Array.isArray(data.affectedSchedules) && data.affectedSchedules.length > 0) {
        emit('cascade-error', {
          message: data.message ?? 'No se puede desactivar la actividad',
          affectedSchedules: data.affectedSchedules,
        });
        return; // Do not also notify a generic toast.
      }
    }

    $q.notify({ type: 'negative', message: extractError(err, 'Error actualizando actividad') });
  }
}

function confirmDeactivate(act: ActivityRecord) {
  $q.dialog({
    title: 'Desactivar actividad',
    message: `Desactivar "${act.name}"? Si hay horarios activos usandola, vas a tener que cambiarles la actividad o desactivarlos primero.`,
    cancel: { flat: true, label: 'Volver' },
    ok: { color: 'negative', label: 'Desactivar' },
  }).onOk(() => {
    void onToggleActivity(act.id, act.name, act.description, false);
  });
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

// First mount: if the parent already has the tab active (e.g. user landed
// directly on /horarios?tab=actividades in the future), load right away.
onMounted(() => {
  if (props.active) {
    void loadActivities();
    cancelEditActivity();
  }
});

// Subsequent activations: reload activities each time the tab becomes
// visible so admins always see fresh state after creating slots elsewhere.
watch(
  () => props.active,
  (val) => {
    if (val) {
      void loadActivities();
      cancelEditActivity();
    }
  }
);
</script>
