<!-- Diálogo del socio — "renovación rápida" (SPEC Admin). Se abre al hacer
     click en el nombre de la fila. Acciones: Renovar (deep-link a Cobros, el
     modal NO reimplementa el cobro), No renovó (motivo+nota), Volver a En
     proceso, Agregar observación, y un link a la ficha para pausar (no hay
     componente de pausa reutilizable fuera de la ficha del socio — ver
     reporte). Renovó/Pausada NUNCA se marcan a mano acá: son derivados. -->
<template>
  <q-dialog v-model="localOpen">
    <q-card style="min-width: 420px; max-width: 560px; width: 100%" v-if="row">
      <q-card-section class="row items-center">
        <div class="text-h6">{{ row.memberName }}</div>
        <q-space />
        <q-btn flat round dense icon="close" v-close-popup />
      </q-card-section>
      <q-separator />

      <q-banner v-if="row.manualOverridden" class="bg-warning text-white" dense rounded>
        <template #avatar><q-icon name="history" /></template>
        Estaba marcado "No renovó" a mano; el sistema detectó una renovación y la reemplazó.
      </q-banner>

      <q-card-section class="q-gutter-y-xs">
        <div class="row items-center q-gutter-sm">
          <q-badge :color="renewalStatusMeta(row.status).color" :label="renewalStatusLabel(row)" />
          <q-icon
            v-if="renewalStatusMeta(row.status).tooltip"
            name="info"
            size="16px"
            color="grey-6"
          >
            <q-tooltip>{{ renewalStatusMeta(row.status).tooltip }}</q-tooltip>
          </q-icon>
        </div>
        <div><span class="text-grey-7">Plan vigente:</span> {{ row.planName }}</div>
        <div v-if="row.newPlanName">
          <span class="text-grey-7">Plan nuevo:</span> {{ row.newPlanName }}
        </div>
        <div>
          <span class="text-grey-7">Vencimiento:</span> {{ formatDate(row.endDate) }}
          <span class="text-grey-6">({{ daysRemainingLabel }})</span>
        </div>
        <div><span class="text-grey-7">Sucursal:</span> {{ row.branchName }}</div>
        <div class="row items-center q-gutter-xs">
          <span class="text-grey-7">Celular:</span>
          <span>{{ row.phoneE164 ?? row.phone ?? 'Sin cargar' }}</span>
          <q-btn
            v-if="row.phoneE164 || row.phone"
            flat
            round
            dense
            size="sm"
            icon="content_copy"
            @click="onCopyPhone"
          >
            <q-tooltip>Copiar número</q-tooltip>
          </q-btn>
          <q-icon v-if="!row.phoneE164" name="warning" color="warning" size="18px">
            <q-tooltip>Número inválido: revisalo en la ficha</q-tooltip>
          </q-icon>
        </div>
        <div>
          <span class="text-grey-7">Mensajes enviados:</span> {{ row.messageCount }}/4
          <span v-if="row.lastMessageAt" class="text-grey-6">
            (último {{ formatDate(row.lastMessageAt) }})
          </span>
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section class="q-gutter-sm">
        <q-btn
          color="primary"
          icon="autorenew"
          label="Renovar"
          class="full-width"
          @click="onRenovar"
        />
        <div class="text-caption text-grey-6">
          Renovó y Pausada se detectan solas (pago dentro de la ventana / estado de la
          membresía) — no se marcan a mano acá.
        </div>
        <q-btn
          flat
          dense
          icon="pause_circle"
          label="Pausar desde la ficha"
          class="full-width"
          :to="`/alumnos/${row.userId}`"
        />
      </q-card-section>

      <q-separator />

      <q-card-section v-if="row.manualStatus === 'no_renovo'">
        <div class="text-subtitle2 q-mb-xs">No renovó</div>
        <div class="text-body2">{{ row.reasonLabel ?? 'Sin motivo' }}</div>
        <div v-if="row.reasonNote" class="text-caption text-grey-7">{{ row.reasonNote }}</div>
        <q-btn
          flat
          dense
          color="primary"
          label="Volver a En proceso"
          class="q-mt-sm"
          :loading="savingFollowup"
          @click="onBackToEnProceso"
        />
      </q-card-section>

      <q-card-section v-else>
        <div class="text-subtitle2 q-mb-sm">Marcar No renovó</div>
        <q-select
          v-model="selectedReasonId"
          :options="reasonOptions"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          dense
          outlined
          label="Motivo"
          class="q-mb-sm"
        />
        <q-input
          v-model="reasonNoteDraft"
          type="textarea"
          :rows="2"
          dense
          outlined
          label="Nota (opcional)"
          maxlength="500"
          class="q-mb-sm"
        />
        <q-btn
          color="negative"
          label="Marcar No renovó"
          :disable="selectedReasonId == null"
          :loading="savingFollowup"
          @click="onMarkNoRenovo"
        />
      </q-card-section>

      <q-separator />

      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Observación</div>
        <div v-if="row.lastNote" class="text-body2 q-mb-sm" style="white-space: pre-wrap">
          {{ row.lastNote.content }}
          <div class="text-caption text-grey-6">{{ formatDate(row.lastNote.createdAt) }}</div>
        </div>
        <q-input
          v-model="noteDraft"
          type="textarea"
          :rows="2"
          dense
          outlined
          placeholder="Agregar observación..."
          :disable="addingNote"
        />
        <div class="text-right q-mt-xs">
          <q-btn
            label="Agregar"
            color="primary"
            dense
            :disable="!noteDraft.trim() || addingNote"
            :loading="addingNote"
            @click="onAddNote"
          />
        </div>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right">
        <q-btn flat label="Ver ficha" icon="person" :to="`/alumnos/${row.userId}`" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { useRenewalsApi } from 'src/composables/useRenewalsApi';
import { renewalStatusMeta, renewalStatusLabel } from 'src/utils/renewal-status';
import type { RenewalRow, RenewalReason } from 'src/types/renewals';

const log = createLogger('RenewalMemberDialog');
const $q = useQuasar();
const router = useRouter();
const renewalsApi = useRenewalsApi();

const props = defineProps<{
  modelValue: boolean;
  row: RenewalRow | null;
  /** Motivos activos — cargados una vez por la página, no por diálogo. */
  reasons: RenewalReason[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /**
   * Fila actualizada. `refreshKpis` avisa al padre si conviene recargar el
   * listado completo (cambia el estado manual → puede mover KPIs) o alcanza
   * con reemplazar la fila local (una observación nueva no mueve KPIs).
   */
  'row-updated': [row: RenewalRow, refreshKpis: boolean];
}>();

const localOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const daysRemainingLabel = computed(() => {
  const d = props.row?.daysRemaining ?? 0;
  if (d > 0) return `en ${d}d`;
  if (d === 0) return 'hoy';
  return `vencido hace ${Math.abs(d)}d`;
});

const reasonOptions = computed(() =>
  props.reasons.map((r) => ({ label: r.label, value: r.id }))
);

// ─── Estado del form "No renovó" ────────────────────────────────────────
const selectedReasonId = ref<number | null>(null);
const reasonNoteDraft = ref('');
const savingFollowup = ref(false);

// Resetea el borrador al cambiar de fila (abrir el diálogo sobre otro socio).
watch(
  () => props.row?.subscriptionId,
  () => {
    selectedReasonId.value = props.row?.reasonId ?? null;
    reasonNoteDraft.value = props.row?.reasonNote ?? '';
    noteDraft.value = '';
  },
  { immediate: true }
);

async function onMarkNoRenovo() {
  const row = props.row;
  if (!row || selectedReasonId.value == null) return;
  const reasonId = selectedReasonId.value;
  savingFollowup.value = true;
  try {
    const updated = await renewalsApi.updateFollowup(row.subscriptionId, {
      manualStatus: 'no_renovo',
      reasonId,
      reasonNote: reasonNoteDraft.value.trim() || null,
    });
    emit('row-updated', updated, true);
    $q.notify({ type: 'positive', message: 'Marcado como No renovó' });
  } catch (err: unknown) {
    log.error('Error marcando No renovó', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({
      type: 'negative',
      message: renewalsApi.error.value ?? 'No se pudo marcar No renovó',
    });
  } finally {
    savingFollowup.value = false;
  }
}

async function onBackToEnProceso() {
  const row = props.row;
  if (!row) return;
  savingFollowup.value = true;
  try {
    const updated = await renewalsApi.updateFollowup(row.subscriptionId, {
      manualStatus: 'en_proceso',
    });
    emit('row-updated', updated, true);
    $q.notify({ type: 'positive', message: 'Vuelve a En proceso' });
  } catch (err: unknown) {
    log.error('Error volviendo a En proceso', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: renewalsApi.error.value ?? 'No se pudo actualizar' });
  } finally {
    savingFollowup.value = false;
  }
}

// ─── Observación ────────────────────────────────────────────────────────
const noteDraft = ref('');
const addingNote = ref(false);

async function onAddNote() {
  const row = props.row;
  if (!row) return;
  const content = noteDraft.value.trim();
  if (!content) return;
  addingNote.value = true;
  try {
    const note = await renewalsApi.addNote(row.subscriptionId, content);
    emit(
      'row-updated',
      { ...row, lastNote: { content: note.content, createdAt: note.createdAt } },
      false
    );
    noteDraft.value = '';
    $q.notify({ type: 'positive', message: 'Observación agregada' });
  } catch (err: unknown) {
    log.error('Error agregando observación', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({
      type: 'negative',
      message: renewalsApi.error.value ?? 'No se pudo agregar la observación',
    });
  } finally {
    addingNote.value = false;
  }
}

// ─── Copiar número ──────────────────────────────────────────────────────
async function onCopyPhone() {
  const row = props.row;
  if (!row) return;
  const target = row.phoneE164 ?? row.phone;
  if (!target) return;
  try {
    await navigator.clipboard.writeText(target);
  } catch (err: unknown) {
    log.error('Error copiando número', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudo copiar' });
    return;
  }
  $q.notify({
    type: row.phoneE164 ? 'positive' : 'warning',
    message: row.phoneE164 ? 'Copiado' : 'Número inválido: revisalo en la ficha (copiado el original)',
  });
}

// ─── Renovar (deep-link a Cobros) ───────────────────────────────────────
function onRenovar() {
  const row = props.row;
  if (!row) return;
  localOpen.value = false;
  void router.push({
    path: '/cobros',
    query: {
      memberId: String(row.userId),
      planId: String(row.planId),
      returnTo: '/renovaciones',
    },
  });
}
</script>
