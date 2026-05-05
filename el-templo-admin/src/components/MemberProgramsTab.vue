<template>
  <div>
    <div class="row items-center q-mb-md">
      <div class="text-h6">Programas</div>
      <q-space />
      <q-btn
        color="primary"
        icon="add"
        label="Asignar programa adicional"
        @click="showAssignDialog = true"
      />
    </div>

    <div v-if="loading" class="flex flex-center q-pa-lg">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <q-banner v-else-if="enrollments.length === 0" class="bg-grey-2 q-mb-md">
      <template #avatar>
        <q-icon name="info" color="grey-7" />
      </template>
      El miembro no tiene programas activos.
    </q-banner>

    <q-list v-else bordered separator class="bg-white rounded-borders">
      <q-item v-for="row in enrollments" :key="row.id">
        <q-item-section>
          <q-item-label class="text-weight-medium">{{ row.programName }}</q-item-label>
          <q-item-label caption class="q-mt-xs">
            <span>
              Semana {{ row.currentWeek }}
              <span v-if="row.durationWeeks !== null"> de {{ row.durationWeeks }}</span>
              · {{ statusLabel(row.status) }}
            </span>
            <template v-if="row.source === 'admin_addon'">
              <span class="q-mx-xs">·</span>
              <span>
                Asignado el {{ formatDate(row.enrolledAt) }}
                <span v-if="row.assignedByName"> por {{ row.assignedByName }}</span>
                · {{ formatPrice(row.pricePaid) }}
              </span>
            </template>
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-chip
            :color="sourceBadgeColor(row.source)"
            text-color="white"
            dense
            :label="sourceBadgeLabel(row.source)"
          />
        </q-item-section>
        <q-item-section v-if="row.status === 'active' || row.status === 'paused'" side>
          <q-btn flat dense round color="negative" icon="cancel" @click="confirmCancel(row)">
            <q-tooltip>Cancelar inscripcion</q-tooltip>
          </q-btn>
        </q-item-section>
      </q-item>
    </q-list>

    <AssignProgramAddonDialog
      v-model="showAssignDialog"
      :user-id="userId"
      :existing-program-ids="lockedProgramIds"
      @success="onAssignSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useProgramsApi } from 'src/composables/useProgramsApi';
import {
  ENROLLMENT_STATUS_LABELS,
  type EnrollmentSource,
  type EnrollmentStatus,
  type ProgramEnrollment,
} from 'src/types/program';
import AssignProgramAddonDialog from './AssignProgramAddonDialog.vue';

const log = createLogger('MemberProgramsTab');
const $q = useQuasar();
const { listEnrollmentsForUser, cancelEnrollment } = useProgramsApi();

const props = defineProps<{ userId: number }>();

const enrollments = ref<ProgramEnrollment[]>([]);
const loading = ref(false);
const showAssignDialog = ref(false);

const lockedProgramIds = computed(() =>
  enrollments.value
    .filter((e) => e.status === 'active' || e.status === 'paused')
    .map((e) => e.programId)
);

async function load() {
  loading.value = true;
  try {
    enrollments.value = await listEnrollmentsForUser(props.userId);
  } catch (err: unknown) {
    log.error('Failed to load enrollments', {
      userId: props.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudieron cargar los programas.' });
  } finally {
    loading.value = false;
  }
}

function statusLabel(status: EnrollmentStatus): string {
  return ENROLLMENT_STATUS_LABELS[status];
}

function sourceBadgeLabel(source: EnrollmentSource): string {
  return source === 'admin_addon' ? 'Add-on' : 'Incluido en plan';
}

function sourceBadgeColor(source: EnrollmentSource): string {
  return source === 'admin_addon' ? 'accent' : 'primary';
}

function formatPrice(price: number | null): string {
  if (price === null || price === 0) return 'Regalo';
  return `$${price.toLocaleString('es-AR')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR');
}

function confirmCancel(row: ProgramEnrollment) {
  $q.dialog({
    title: 'Cancelar inscripcion',
    message: `Vas a cancelar la inscripcion en "${row.programName}". Esta accion no genera reembolso automatico.`,
    ok: { label: 'Cancelar inscripcion', color: 'negative' },
    cancel: { label: 'Volver', flat: true },
    persistent: true,
  }).onOk(async () => {
    try {
      await cancelEnrollment(row.id);
      $q.notify({ type: 'positive', message: 'Inscripcion cancelada.' });
      await load();
    } catch (err: unknown) {
      log.error('Failed to cancel enrollment', {
        enrollmentId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
      $q.notify({ type: 'negative', message: 'No se pudo cancelar la inscripcion.' });
    }
  });
}

function onAssignSuccess() {
  showAssignDialog.value = false;
  void load();
}

onMounted(() => {
  void load();
});
</script>
