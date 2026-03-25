<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="flex flex-center q-pa-lg">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <template v-else>
      <!-- ================================================================ -->
      <!-- Active Enrollment Card -->
      <!-- ================================================================ -->
      <q-card v-if="activeEnrollment" flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row items-center q-mb-sm">
            <div class="text-subtitle1 text-weight-bold col">
              {{ activeEnrollment.programName }}
            </div>
            <q-badge
              :color="ENROLLMENT_STATUS_COLORS[activeEnrollment.status]"
              :label="ENROLLMENT_STATUS_LABELS[activeEnrollment.status]"
            />
          </div>

          <div class="row q-gutter-md q-mb-md">
            <div class="col">
              <div class="text-center">
                <div class="text-h6 text-primary">
                  Semana {{ activeEnrollment.currentWeek }} de {{ activeEnrollment.durationWeeks }}
                </div>
                <div class="text-caption text-grey-7">Progreso</div>
              </div>
            </div>
            <div class="col">
              <div class="text-center">
                <div class="text-h6 text-primary">
                  {{ activeEnrollment.sessionsCompletedThisWeek }}/{{
                    activeEnrollment.sessionsPerWeekToAdvance
                  }}
                </div>
                <div class="text-caption text-grey-7">Sesiones esta semana</div>
              </div>
            </div>
          </div>

          <div class="text-caption text-grey-7 q-mb-md">
            Inscripto: {{ formatDate(activeEnrollment.enrolledAt) }}
          </div>

          <div class="row q-gutter-sm">
            <q-btn
              outline
              color="primary"
              label="Avanzar semana"
              icon="skip_next"
              :loading="advancing"
              @click="onAdvanceWeek"
            />
            <q-btn
              outline
              color="negative"
              label="Cancelar inscripcion"
              icon="cancel"
              @click="onCancelEnrollment"
            />
          </div>
        </q-card-section>
      </q-card>

      <!-- ================================================================ -->
      <!-- Enroll Button (no active enrollment) -->
      <!-- ================================================================ -->
      <q-btn
        v-if="!activeEnrollment"
        color="primary"
        icon="add"
        label="Inscribir"
        class="q-mb-md"
        @click="showEnrollDialog = true"
      />

      <!-- ================================================================ -->
      <!-- Enrollment History -->
      <!-- ================================================================ -->
      <q-card v-if="pastEnrollments.length > 0" flat bordered>
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Historial de Inscripciones</div>

          <q-list separator>
            <q-item v-for="enrollment in pastEnrollments" :key="enrollment.id">
              <q-item-section avatar>
                <q-icon name="history" color="grey-6" />
              </q-item-section>
              <q-item-section>
                <q-item-label>
                  {{ enrollment.programName }}
                  <q-badge
                    :color="ENROLLMENT_STATUS_COLORS[enrollment.status]"
                    :label="ENROLLMENT_STATUS_LABELS[enrollment.status]"
                    class="q-ml-sm"
                  />
                </q-item-label>
                <q-item-label caption>
                  Inscripto: {{ formatDate(enrollment.enrolledAt) }}
                  <template v-if="enrollment.completedAt">
                    — Completado: {{ formatDate(enrollment.completedAt) }}
                  </template>
                  <template v-else-if="enrollment.expiredAt">
                    — Expirado: {{ formatDate(enrollment.expiredAt) }}
                  </template>
                  <template v-else-if="enrollment.cancelledAt">
                    — Cancelado: {{ formatDate(enrollment.cancelledAt) }}
                  </template>
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>

      <!-- No enrollments at all -->
      <div
        v-if="!activeEnrollment && pastEnrollments.length === 0 && !loading"
        class="text-grey-5 text-italic"
      >
        Sin inscripciones en programas
      </div>
    </template>

    <!-- ================================================================== -->
    <!-- Enroll Dialog -->
    <!-- ================================================================== -->
    <q-dialog v-model="showEnrollDialog">
      <q-card style="width: 500px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Inscribir en Programa</div>
        </q-card-section>

        <q-separator />

        <q-card-section class="q-gutter-sm">
          <q-select
            v-model="enrollForm.programId"
            :options="activeProgramOptions"
            label="Programa *"
            dense
            outlined
            emit-value
            map-options
            :loading="loadingPrograms"
            @update:model-value="onProgramSelected"
          />

          <q-input
            v-model.number="enrollForm.paymentAmount"
            label="Monto del pago"
            type="number"
            dense
            outlined
            prefix="$"
          />

          <q-select
            v-model="enrollForm.paymentMethod"
            :options="paymentMethodOptions"
            label="Metodo de pago"
            dense
            outlined
            emit-value
            map-options
          />

          <q-input
            v-model="enrollForm.notes"
            label="Notas (opcional)"
            type="textarea"
            :rows="2"
            dense
            outlined
          />

          <q-checkbox
            v-model="paymentConfirmed"
            label="Confirmo que el pago fue recibido"
            class="q-mt-sm"
          />
        </q-card-section>

        <q-separator />

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancelar" color="grey" @click="showEnrollDialog = false" />
          <q-btn
            label="Confirmar inscripcion"
            color="primary"
            :loading="enrolling"
            :disable="!paymentConfirmed || !enrollForm.programId || enrolling"
            @click="onEnroll"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { useProgramsApi } from 'src/composables/useProgramsApi';
import {
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUS_COLORS,
  type ProgramEnrollment,
  type MicroProgram,
} from 'src/types/program';

const log = createLogger('ProgramEnrollmentSection');
const $q = useQuasar();
const programsApi = useProgramsApi();

// =========================================================================
// Props
// =========================================================================

const props = defineProps<{
  memberId: number;
}>();

// =========================================================================
// State
// =========================================================================

const loading = ref(false);
const enrollments = ref<ProgramEnrollment[]>([]);
const programs = ref<MicroProgram[]>([]);
const loadingPrograms = ref(false);
const showEnrollDialog = ref(false);
const enrolling = ref(false);
const advancing = ref(false);
const paymentConfirmed = ref(false);

const enrollForm = ref({
  programId: null as number | null,
  paymentAmount: null as number | null,
  paymentMethod: null as string | null,
  notes: '',
});

// =========================================================================
// Payment method options
// =========================================================================

const paymentMethodOptions = [
  { label: 'Transferencia', value: 'transferencia' },
  { label: 'Efectivo', value: 'efectivo' },
  { label: 'Tarjeta', value: 'tarjeta' },
];

// =========================================================================
// Computed
// =========================================================================

const activeEnrollment = computed<ProgramEnrollment | null>(() => {
  return enrollments.value.find((e) => e.status === 'active') ?? null;
});

const pastEnrollments = computed<ProgramEnrollment[]>(() => {
  return enrollments.value.filter((e) => e.status !== 'active');
});

const activeProgramOptions = computed(() => {
  return programs.value
    .filter((p) => p.isActive)
    .map((p) => ({
      label: `${p.name} ($${p.price.toLocaleString()})`,
      value: p.id,
    }));
});

// =========================================================================
// Data loading
// =========================================================================

async function loadEnrollments() {
  loading.value = true;
  try {
    enrollments.value = await programsApi.getUserEnrollments(props.memberId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading enrollments', { error: message, memberId: props.memberId });
  } finally {
    loading.value = false;
  }
}

async function loadPrograms() {
  loadingPrograms.value = true;
  try {
    programs.value = await programsApi.getPrograms();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading programs', { error: message });
  } finally {
    loadingPrograms.value = false;
  }
}

// =========================================================================
// Actions
// =========================================================================

function onProgramSelected(programId: number | null) {
  if (!programId) return;
  const program = programs.value.find((p) => p.id === programId);
  if (program) {
    enrollForm.value.paymentAmount = program.price;
  }
}

async function onEnroll() {
  if (!enrollForm.value.programId) return;

  enrolling.value = true;
  try {
    await programsApi.enrollMember({
      userId: props.memberId,
      programId: enrollForm.value.programId,
      paymentAmount: enrollForm.value.paymentAmount,
      paymentMethod: enrollForm.value.paymentMethod,
      notes: enrollForm.value.notes || null,
    });
    $q.notify({ type: 'positive', message: 'Miembro inscripto correctamente' });
    showEnrollDialog.value = false;
    resetEnrollForm();
    await loadEnrollments();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error enrolling member', { error: message });
    $q.notify({ type: 'negative', message: 'Error inscribiendo miembro' });
  } finally {
    enrolling.value = false;
  }
}

async function onAdvanceWeek() {
  if (!activeEnrollment.value) return;

  advancing.value = true;
  try {
    await programsApi.advanceWeek(activeEnrollment.value.id);
    $q.notify({ type: 'positive', message: 'Semana avanzada' });
    await loadEnrollments();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error advancing week', { error: message });
    $q.notify({ type: 'negative', message: 'Error avanzando semana' });
  } finally {
    advancing.value = false;
  }
}

function onCancelEnrollment() {
  if (!activeEnrollment.value) return;

  $q.dialog({
    title: 'Cancelar inscripcion',
    message: `Cancelar la inscripcion de "${activeEnrollment.value.programName}"?`,
    cancel: { flat: true, label: 'Volver' },
    ok: { color: 'negative', label: 'Cancelar inscripcion' },
  }).onOk(async () => {
    if (!activeEnrollment.value) return;
    try {
      await programsApi.cancelEnrollment(activeEnrollment.value.id);
      $q.notify({ type: 'positive', message: 'Inscripcion cancelada' });
      await loadEnrollments();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error cancelling enrollment', { error: message });
      $q.notify({ type: 'negative', message: 'Error cancelando inscripcion' });
    }
  });
}

function resetEnrollForm() {
  enrollForm.value = {
    programId: null,
    paymentAmount: null,
    paymentMethod: null,
    notes: '',
  };
  paymentConfirmed.value = false;
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadEnrollments();
  loadPrograms();
});
</script>
