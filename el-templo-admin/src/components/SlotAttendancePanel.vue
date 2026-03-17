<template>
  <q-dialog
    :model-value="modelValue"
    position="right"
    maximized
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-card style="width: 480px; max-width: 95vw" class="column full-height">
      <!-- Header -->
      <q-card-section class="bg-primary text-white">
        <div class="row items-center no-wrap">
          <div class="col">
            <div class="text-h6">{{ activityName }}</div>
            <div class="text-caption">{{ formattedDate }} - {{ startTime }}</div>
          </div>
          <q-btn flat dense round icon="close" @click="$emit('update:modelValue', false)" />
        </div>
      </q-card-section>

      <q-separator />

      <!-- Loading -->
      <div v-if="loadingAttendance && attendanceList.length === 0" class="flex flex-center q-pa-xl">
        <q-spinner-dots size="40px" color="primary" />
      </div>

      <!-- Attendance List -->
      <q-scroll-area v-else class="col">
        <q-list separator>
          <q-item
            v-if="attendanceList.length === 0"
            class="text-center text-grey-5 text-italic q-pa-lg"
          >
            <q-item-section> Sin registros para este horario </q-item-section>
          </q-item>

          <q-item
            v-for="member in attendanceList"
            :key="`${member.memberId}-${member.bookingId}`"
            :class="member.attendanceId ? 'bg-green-1' : ''"
          >
            <q-item-section avatar>
              <q-icon
                :name="member.attendanceId ? 'check_circle' : 'radio_button_unchecked'"
                :color="member.attendanceId ? 'positive' : 'grey-4'"
                size="md"
              />
            </q-item-section>

            <q-item-section>
              <q-item-label>{{ member.memberName }}</q-item-label>
              <q-item-label caption>
                <template v-if="member.attendanceId && member.checkedInAt">
                  {{ formatTime(member.checkedInAt) }}
                  <q-badge
                    :color="member.source === 'qr' ? 'info' : 'grey-7'"
                    :label="member.source === 'qr' ? 'QR' : 'Manual'"
                    class="q-ml-xs"
                  />
                </template>
                <template v-else-if="!member.bookingId">
                  <span class="text-grey-5">(sin reserva)</span>
                </template>
                <template v-else>
                  <span class="text-grey-5">Reservado</span>
                </template>
              </q-item-label>
            </q-item-section>

            <q-item-section side v-if="member.attendanceId">
              <q-btn
                flat
                dense
                round
                icon="close"
                color="negative"
                size="sm"
                @click="confirmRemoveCheckIn(member)"
              >
                <q-tooltip>Eliminar asistencia</q-tooltip>
              </q-btn>
            </q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>

      <q-separator />

      <!-- Add Member Section -->
      <q-card-section v-if="canAddCheckIn">
        <div class="text-subtitle2 q-mb-sm">+ Agregar alumno</div>
        <q-select
          v-model="selectedMember"
          :options="memberSearchResults"
          option-value="id"
          option-label="displayLabel"
          label="Buscar por nombre, apellido o DNI"
          dense
          outlined
          use-input
          clearable
          input-debounce="300"
          :loading="searchingMembers"
          @filter="onMemberSearch"
        >
          <template #no-option>
            <q-item>
              <q-item-section class="text-grey-5 text-italic">
                {{ searchQuery ? 'Sin resultados' : 'Escribe para buscar' }}
              </q-item-section>
            </q-item>
          </template>

          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.displayLabel }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-badge :color="scope.opt.statusColor" :label="scope.opt.statusLabel" />
              </q-item-section>
            </q-item>
          </template>
        </q-select>

        <!-- Reason field (shown when member selected) -->
        <q-input
          v-if="selectedMember"
          v-model="checkInReason"
          label="Razon (opcional)"
          dense
          outlined
          class="q-mt-sm"
        />

        <q-btn
          v-if="selectedMember"
          color="primary"
          label="Registrar asistencia"
          icon="how_to_reg"
          class="q-mt-sm full-width"
          :loading="checkingIn"
          @click="onCoachCheckIn"
        />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useAttendanceApi } from 'src/composables/useAttendanceApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import type { SlotAttendanceItem } from 'src/types/attendance';

const log = createLogger('SlotAttendancePanel');
const $q = useQuasar();
const attendanceApi = useAttendanceApi();
const membersApi = useMembersApi();

// =========================================================================
// Props & Emits
// =========================================================================

const props = defineProps<{
  modelValue: boolean;
  scheduleId: number;
  date: string;
  activityName: string;
  startTime: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'attendance-changed': [];
}>();

// =========================================================================
// State
// =========================================================================

const attendanceList = ref<SlotAttendanceItem[]>([]);
const loadingAttendance = ref(false);

// Member search state
interface MemberSearchOption {
  id: number;
  displayLabel: string;
  statusLabel: string;
  statusColor: string;
}

const selectedMember = ref<MemberSearchOption | null>(null);
const memberSearchResults = ref<MemberSearchOption[]>([]);
const searchingMembers = ref(false);
const searchQuery = ref('');
const checkInReason = ref('');
const checkingIn = ref(false);

// Auto-refresh
let refreshInterval: ReturnType<typeof setInterval> | null = null;

// =========================================================================
// Computed
// =========================================================================

const formattedDate = computed(() => {
  try {
    const d = new Date(props.date + 'T12:00:00');
    return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return props.date;
  }
});

const canAddCheckIn = computed(() => {
  // Only allow manual check-in for today or past dates
  const today = new Date().toISOString().split('T')[0];
  return props.date <= today;
});

// =========================================================================
// Data Loading
// =========================================================================

async function loadAttendance() {
  loadingAttendance.value = true;
  try {
    const result = await attendanceApi.getSlotAttendance(props.scheduleId, props.date);
    attendanceList.value = result.members;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading slot attendance', { error: message });
  } finally {
    loadingAttendance.value = false;
  }
}

// =========================================================================
// Display Helpers
// =========================================================================

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// =========================================================================
// Member Search
// =========================================================================

function onMemberSearch(val: string, update: (fn: () => void) => void, _abort: () => void) {
  searchQuery.value = val;
  if (!val || val.length < 2) {
    update(() => {
      memberSearchResults.value = [];
    });
    return;
  }

  searchingMembers.value = true;
  membersApi
    .getMembers({ search: val, limit: 15 })
    .then((result) => {
      update(() => {
        memberSearchResults.value = result.members.map((m) => {
          // Determine subscription status for warning badges
          let statusLabel = 'Sin plan';
          let statusColor = 'grey';

          if (m.planName) {
            if (m.isActive) {
              statusLabel = 'Activa';
              statusColor = 'positive';
            } else {
              statusLabel = 'Inactiva';
              statusColor = 'negative';
            }
          }

          if (m.isOverdue) {
            statusLabel = 'Pago pendiente';
            statusColor = 'warning';
          }

          return {
            id: m.id,
            displayLabel:
              `${m.firstName ?? ''} ${m.lastName ?? ''}${m.dni ? ` (${m.dni})` : ''}`.trim(),
            statusLabel,
            statusColor,
          };
        });
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error searching members', { error: message });
      update(() => {
        memberSearchResults.value = [];
      });
    })
    .finally(() => {
      searchingMembers.value = false;
    });
}

// =========================================================================
// Coach Check-in
// =========================================================================

async function onCoachCheckIn() {
  if (!selectedMember.value) return;

  checkingIn.value = true;
  try {
    const result = await attendanceApi.coachCheckIn(
      props.scheduleId,
      props.date,
      selectedMember.value.id,
      checkInReason.value.trim() || undefined
    );

    // Show warnings if any
    if (result.warnings.length > 0) {
      $q.notify({
        type: 'warning',
        message: `Asistencia registrada con advertencias: ${result.warnings.join(', ')}`,
        timeout: 5000,
      });
    } else {
      $q.notify({ type: 'positive', message: 'Asistencia registrada' });
    }

    selectedMember.value = null;
    checkInReason.value = '';
    memberSearchResults.value = [];
    await loadAttendance();
    emit('attendance-changed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error coach check-in', { error: message });
    $q.notify({
      type: 'negative',
      message: attendanceApi.error.value ?? 'Error registrando asistencia',
    });
  } finally {
    checkingIn.value = false;
  }
}

// =========================================================================
// Remove Check-in
// =========================================================================

function confirmRemoveCheckIn(member: SlotAttendanceItem) {
  if (!member.attendanceId) return;

  $q.dialog({
    title: 'Eliminar asistencia',
    message: `Eliminar asistencia de ${member.memberName}? Se revertira el AURA y las clases.`,
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Eliminar', color: 'negative' },
  }).onOk(async () => {
    try {
      await attendanceApi.removeCheckIn(member.attendanceId!);
      $q.notify({ type: 'positive', message: 'Asistencia eliminada' });
      await loadAttendance();
      emit('attendance-changed');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error removing check-in', { error: message });
      $q.notify({ type: 'negative', message: 'Error eliminando asistencia' });
    }
  });
}

// =========================================================================
// Auto-refresh & Lifecycle
// =========================================================================

function startAutoRefresh() {
  stopAutoRefresh();
  refreshInterval = setInterval(() => {
    if (props.modelValue) {
      loadAttendance();
    }
  }, 30000);
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selectedMember.value = null;
      checkInReason.value = '';
      memberSearchResults.value = [];
      loadAttendance();
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  }
);

onBeforeUnmount(() => {
  stopAutoRefresh();
});
</script>
