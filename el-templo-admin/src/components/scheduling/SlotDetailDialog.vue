<template>
  <q-dialog :model-value="show" persistent @update:model-value="$emit('update:show', $event)">
    <q-card style="width: 500px; max-width: 95vw">
      <!-- Header -->
      <q-card-section>
        <div class="slot-header">
          <template v-if="!editingActivity">
            <div class="slot-header__title">
              <span class="text-h6">{{ headerActivityName }}</span>
              <q-btn
                v-if="canEditActivity"
                flat
                dense
                round
                icon="edit"
                size="sm"
                color="primary"
                @click="startEditActivity"
              >
                <q-tooltip>Cambiar actividad</q-tooltip>
              </q-btn>
            </div>
            <div class="text-subtitle2 text-grey-7">
              {{ headerDayLabel }} {{ headerDateLabel }} · {{ headerStartTime }}
            </div>
          </template>
          <template v-else>
            <div class="row items-center no-wrap q-gutter-xs">
              <q-select
                v-model="selectedActivityId"
                :options="activityOptions"
                option-value="id"
                option-label="name"
                emit-value
                map-options
                dense
                outlined
                class="col"
              />
              <q-btn
                flat
                dense
                round
                icon="check"
                color="positive"
                size="sm"
                :loading="savingActivity"
                :disable="
                  !selectedActivityId || selectedActivityId === slotDetail?.schedule.activityId
                "
                @click="saveActivityChange"
              >
                <q-tooltip>Guardar</q-tooltip>
              </q-btn>
              <q-btn
                flat
                dense
                round
                icon="close"
                color="grey-7"
                size="sm"
                @click="editingActivity = false"
              >
                <q-tooltip>Cancelar</q-tooltip>
              </q-btn>
            </div>
          </template>
        </div>
        <div class="text-caption text-grey-7 q-mt-xs">
          {{ summaryText }}
        </div>
      </q-card-section>

      <q-separator />

      <!-- Members list (attendance for today/past; bookings for future) -->
      <q-card-section class="q-px-none q-py-sm" style="max-height: 400px; overflow-y: auto">
        <q-list separator>
          <q-item v-if="loading" class="flex flex-center q-pa-lg">
            <q-spinner-dots size="30px" color="primary" />
          </q-item>

          <!-- Future: bookings view -->
          <template v-else-if="!isPastOrToday">
            <q-item v-if="activeBookings.length === 0 && waitlistBookings.length === 0">
              <q-item-section class="text-grey-5 text-italic text-center">
                Sin reservas para este horario
              </q-item-section>
            </q-item>

            <!-- Reservados (regular bookings) -->
            <template v-if="activeTrialBookings.length > 0 && activeRegularBookings.length > 0">
              <q-item-label header> Reservados ({{ activeRegularBookings.length }}) </q-item-label>
            </template>
            <q-item v-for="booking in activeRegularBookings" :key="booking.id">
              <q-item-section>
                <q-item-label>{{ booking.memberName }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <div class="row items-center q-gutter-xs">
                  <q-badge
                    :color="getBookingStatusColor(booking.status)"
                    :label="getBookingStatusLabel(booking.status)"
                  />
                  <q-btn
                    flat
                    dense
                    round
                    icon="delete"
                    color="negative"
                    size="sm"
                    @click="onRemoveBooking(booking.id)"
                  >
                    <q-tooltip>Eliminar reserva</q-tooltip>
                  </q-btn>
                </div>
              </q-item-section>
            </q-item>

            <!-- Sesiones de Prueba (trial bookings) -->
            <template v-if="activeTrialBookings.length > 0">
              <q-item-label header>
                Sesiones de Prueba ({{ activeTrialBookings.length }})
              </q-item-label>
              <q-item v-for="booking in activeTrialBookings" :key="booking.id">
                <q-item-section>
                  <q-item-label>{{ booking.memberName }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="row items-center q-gutter-xs">
                    <q-badge
                      :color="getBookingStatusColor(booking.status)"
                      :label="getBookingStatusLabel(booking.status)"
                    />
                    <q-badge color="warning" label="PRUEBA" />
                    <q-btn
                      flat
                      dense
                      round
                      icon="delete"
                      color="negative"
                      size="sm"
                      @click="onRemoveBooking(booking.id)"
                    >
                      <q-tooltip>Eliminar reserva</q-tooltip>
                    </q-btn>
                  </div>
                </q-item-section>
              </q-item>
            </template>

            <!-- Lista de Espera -->
            <template v-if="waitlistBookings.length > 0">
              <q-item-label header> Lista de Espera ({{ waitlistBookings.length }}) </q-item-label>
              <q-item v-for="booking in waitlistBookings" :key="booking.id">
                <q-item-section>
                  <q-item-label>{{ booking.memberName }}</q-item-label>
                  <q-item-label v-if="booking.waitlistPosition" caption>
                    Posición {{ booking.waitlistPosition }}
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="row items-center q-gutter-xs">
                    <q-badge
                      :color="getBookingStatusColor(booking.status)"
                      :label="getBookingStatusLabel(booking.status)"
                    />
                    <q-btn
                      flat
                      dense
                      round
                      icon="delete"
                      color="negative"
                      size="sm"
                      @click="onRemoveBooking(booking.id)"
                    >
                      <q-tooltip>Eliminar reserva</q-tooltip>
                    </q-btn>
                  </div>
                </q-item-section>
              </q-item>
            </template>
          </template>

          <!-- Today/past: attendance view -->
          <template v-else>
            <q-item v-if="attendanceList.length === 0">
              <q-item-section class="text-grey-5 text-italic text-center">
                Sin registros para este horario
              </q-item-section>
            </q-item>
            <q-item
              v-for="member in attendanceList"
              :key="`${member.memberId}-${member.bookingId ?? 'walk'}`"
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
                <q-item-label>
                  {{ member.memberName }}
                  <q-badge
                    v-if="isTrialMember(member)"
                    color="warning"
                    label="PRUEBA"
                    class="q-ml-xs"
                  />
                </q-item-label>
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
              <q-item-section side>
                <q-btn
                  v-if="!member.attendanceId"
                  flat
                  dense
                  round
                  icon="how_to_reg"
                  color="primary"
                  size="sm"
                  @click="quickCheckIn(member)"
                >
                  <q-tooltip>Marcar asistencia</q-tooltip>
                </q-btn>
                <q-btn
                  v-else
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
          </template>
        </q-list>
      </q-card-section>

      <q-separator />

      <!-- Add member section -->
      <q-card-section>
        <!-- Mode toggle: today supports both; past = checkin only; future = reserve only -->
        <q-btn-toggle
          v-if="isToday"
          v-model="addMode"
          toggle-color="primary"
          spread
          no-caps
          class="q-mb-sm"
          :options="[
            { label: 'Marcar asistencia', value: 'checkin' },
            { label: 'Reservar turno', value: 'reserve' },
          ]"
        />
        <div class="text-subtitle2 q-mb-sm">{{ addSectionLabel }}</div>
        <q-select
          v-model="slotAddMember"
          :options="memberSearchResults"
          option-value="id"
          option-label="displayLabel"
          label="Buscar alumno (nombre o DNI)"
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
                {{ memberSearchQuery ? 'Sin resultados' : 'Escribe para buscar' }}
              </q-item-section>
            </q-item>
          </template>
          <template #after>
            <q-btn
              round
              dense
              flat
              :icon="submitIcon"
              color="primary"
              :disable="!slotAddMember"
              :loading="submitting"
              @click="onSubmitAdd"
            />
          </template>
        </q-select>
        <q-input
          v-if="effectiveMode === 'checkin' && slotAddMember"
          v-model="checkInReason"
          label="Razon (opcional)"
          dense
          outlined
          class="q-mt-sm"
        />

        <!-- Inline trial registration (today or future; hidden on past dates) -->
        <q-expansion-item
          v-if="canRegisterTrial"
          v-model="trialFormOpen"
          label="Agregar sesión de prueba"
          header-class="text-subtitle2 q-mt-md q-px-none"
          dense
          :disable="!slotDetail"
        >
          <div class="q-mt-sm">
            <div v-if="loadingEligibles" class="flex flex-center q-pa-md">
              <q-spinner-dots size="24px" color="primary" />
            </div>
            <template v-else-if="eligibleTrials.length === 0">
              <div class="text-caption text-grey-7 q-mb-sm">
                No hay alumnos en prueba sin sesión reservada en esta sede. Creá uno desde Alumnos
                para reservarle una sesión.
              </div>
              <q-btn
                color="primary"
                icon="person_add"
                label="Crear alumno en prueba"
                no-caps
                unelevated
                class="full-width"
                @click="goToCreateTrialMember"
              />
            </template>
            <template v-else>
              <q-select
                v-model="selectedTrialUser"
                :options="eligibleTrials"
                option-value="id"
                option-label="displayLabel"
                label="Buscar alumno en prueba"
                dense
                outlined
                use-input
                clearable
                input-debounce="0"
                :input-class="'text-body2'"
                @filter="filterEligibleTrials"
              >
                <template #no-option>
                  <q-item>
                    <q-item-section class="text-grey-5 text-italic">
                      Sin resultados
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
              <div class="row justify-end q-gutter-sm q-mt-sm">
                <q-btn
                  flat
                  label="Cancelar"
                  color="grey-7"
                  :disable="bookingTrial"
                  @click="trialFormOpen = false"
                />
                <q-btn
                  unelevated
                  label="Reservar"
                  color="primary"
                  :loading="bookingTrial"
                  :disable="!selectedTrialUser"
                  @click="onBookTrial"
                />
              </div>
            </template>
          </div>
        </q-expansion-item>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cerrar" color="grey-7" @click="$emit('update:show', false)" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSchedulingApi } from 'src/composables/useSchedulingApi';
import { useAttendanceApi } from 'src/composables/useAttendanceApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import type {
  SlotDetailView,
  BookingStatus,
  DayOfWeek,
  ActivityRecord,
} from 'src/types/scheduling';
import { DAY_LABELS, BOOKING_STATUS_LABELS, BOOKING_STATUS_COLORS } from 'src/types/scheduling';
import type { SlotAttendanceItem } from 'src/types/attendance';
import { todayInTz } from 'src/utils/tz';

const log = createLogger('SlotDetailDialog');
const $q = useQuasar();
const schedulingApi = useSchedulingApi();
const attendanceApi = useAttendanceApi();
const membersApi = useMembersApi();

// ─── Props & Emits ──────────────────────────────────────────────────────────

const props = withDefaults(
  defineProps<{
    show: boolean;
    scheduleId: number | null;
    date: string;
    /**
     * IANA timezone of the branch owning this slot. Controls whether the
     * dialog treats the slot as "today / past" for check-in vs. reservation
     * mode. Defaults to AR so existing callsites keep working.
     */
    branchTimezone?: string;
  }>(),
  { branchTimezone: 'America/Argentina/Buenos_Aires' }
);

const emit = defineEmits<{
  'update:show': [value: boolean];
  'bookings-changed': [];
}>();

// ─── State ──────────────────────────────────────────────────────────────────

const slotDetail = ref<SlotDetailView | null>(null);
const attendanceList = ref<SlotAttendanceItem[]>([]);
const loadingSlotDetail = ref(false);
const loadingAttendance = ref(false);
const loading = computed(() => loadingSlotDetail.value || loadingAttendance.value);

// Add-member form
const slotAddMember = ref<{ id: number; displayLabel: string } | null>(null);
const memberSearchResults = ref<Array<{ id: number; displayLabel: string }>>([]);
const searchingMembers = ref(false);
const memberSearchQuery = ref('');
const checkInReason = ref('');
const submitting = ref(false);
const addMode = ref<'checkin' | 'reserve'>('checkin');

// Inline trial booking — picks an existing prueba user (created via /alumnos)
// and attaches a trial booking to this slot.
type EligibleTrial = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  dni: string | null;
  displayLabel: string;
};
const trialFormOpen = ref(false);
const loadingEligibles = ref(false);
const bookingTrial = ref(false);
const eligibleTrialsAll = ref<EligibleTrial[]>([]);
const eligibleTrials = ref<EligibleTrial[]>([]);
const selectedTrialUser = ref<EligibleTrial | null>(null);
const router = useRouter();

// Activity edit
const editingActivity = ref(false);
const selectedActivityId = ref<number | null>(null);
const availableActivities = ref<ActivityRecord[]>([]);
const savingActivity = ref(false);

// ─── Computed ───────────────────────────────────────────────────────────────

const todayIso = () => todayInTz(props.branchTimezone);

const isPastOrToday = computed(() => props.date <= todayIso());
const isToday = computed(() => props.date === todayIso());

// Trial registration is for today or future slots only — past dates cannot
// register a new trial (the class already happened).
const canRegisterTrial = computed(() => !isPastOrToday.value || isToday.value);

const activeBookings = computed(() => {
  if (!slotDetail.value) return [];
  return slotDetail.value.bookings.filter(
    (b) => b.status === 'reservado' || b.status === 'qr_escaneado' || b.status === 'confirmado'
  );
});

const waitlistBookings = computed(() => {
  if (!slotDetail.value) return [];
  return slotDetail.value.bookings.filter((b) => b.status === 'lista_espera' && !b.isTrial);
});

const activeRegularBookings = computed(() => activeBookings.value.filter((b) => !b.isTrial));
const activeTrialBookings = computed(() => activeBookings.value.filter((b) => b.isTrial));

const trialBookingIds = computed(() => {
  if (!slotDetail.value) return new Set<number>();
  return new Set(slotDetail.value.bookings.filter((b) => b.isTrial).map((b) => b.id));
});

function isTrialMember(member: SlotAttendanceItem): boolean {
  return member.bookingId !== null && trialBookingIds.value.has(member.bookingId);
}

const headerActivityName = computed(() => slotDetail.value?.schedule.activityName ?? '');

const headerDayLabel = computed(() => {
  if (!slotDetail.value) return '';
  const dow = slotDetail.value.schedule.dayOfWeek as DayOfWeek;
  return DAY_LABELS[dow] ?? '';
});

const headerDateLabel = computed(() => {
  if (!slotDetail.value) return '';
  const d = new Date(slotDetail.value.date + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
});

const headerStartTime = computed(() => slotDetail.value?.schedule.startTime ?? '');

const summaryText = computed(() => {
  if (!isPastOrToday.value) {
    const max = slotDetail.value?.maxCapacity ?? 0;
    return `${activeRegularBookings.value.length}/${max} reservas`;
  }
  const total = attendanceList.value.length;
  const attended = attendanceList.value.filter((m) => m.attendanceId).length;
  return `${attended}/${total} presentes`;
});

const canEditActivity = computed(() => !!slotDetail.value);

// Effective mode (past=checkin, future=reserve, today=user choice)
const effectiveMode = computed<'checkin' | 'reserve'>(() => {
  if (!isPastOrToday.value) return 'reserve';
  if (!isToday.value) return 'checkin';
  return addMode.value;
});

const addSectionLabel = computed(() =>
  effectiveMode.value === 'checkin' ? 'Marcar asistencia' : 'Agregar reserva'
);

const submitIcon = computed(() => (effectiveMode.value === 'checkin' ? 'how_to_reg' : 'add'));

const activityOptions = computed(() =>
  availableActivities.value.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name }))
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function getBookingStatusLabel(status: BookingStatus): string {
  return BOOKING_STATUS_LABELS[status];
}

function getBookingStatusColor(status: BookingStatus): string {
  return BOOKING_STATUS_COLORS[status];
}

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

// ─── Data Loading ───────────────────────────────────────────────────────────

async function loadSlotDetail(scheduleId: number, date: string) {
  loadingSlotDetail.value = true;
  slotDetail.value = null;
  try {
    slotDetail.value = await schedulingApi.getSlotDetail(scheduleId, date);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading slot detail', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando detalle del horario' });
  } finally {
    loadingSlotDetail.value = false;
  }
}

async function loadAttendance(scheduleId: number, date: string) {
  loadingAttendance.value = true;
  try {
    const result = await attendanceApi.getSlotAttendance(scheduleId, date);
    attendanceList.value = result.members;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading attendance', { error: message });
  } finally {
    loadingAttendance.value = false;
  }
}

async function refreshAll() {
  if (!props.scheduleId) return;
  await loadSlotDetail(props.scheduleId, props.date);
  if (isPastOrToday.value) {
    await loadAttendance(props.scheduleId, props.date);
  } else {
    attendanceList.value = [];
  }
}

// ─── Member Search ──────────────────────────────────────────────────────────

function onMemberSearch(val: string, update: (fn: () => void) => void, _abort: () => void) {
  memberSearchQuery.value = val;
  if (!val || val.length < 2) {
    update(() => {
      memberSearchResults.value = [];
    });
    return;
  }
  searchingMembers.value = true;
  membersApi
    .getMembers({ search: val, limit: 10 })
    .then((result) => {
      update(() => {
        memberSearchResults.value = result.members.map((m) => ({
          id: m.id,
          displayLabel: `${m.firstName} ${m.lastName}${m.dni ? ` (${m.dni})` : ''}`,
        }));
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

// ─── Submit ────────────────────────────────────────────────────────────────

async function onSubmitAdd() {
  if (!slotAddMember.value || !props.scheduleId) return;
  submitting.value = true;
  try {
    if (effectiveMode.value === 'reserve') {
      const result = await schedulingApi.adminAddBooking({
        scheduleId: props.scheduleId,
        memberId: slotAddMember.value.id,
        date: props.date,
      });
      $q.notify({ type: 'positive', message: 'Reserva agregada' });
      if (result.warnings?.length) {
        for (const warning of result.warnings) {
          $q.notify({ type: 'warning', message: warning, timeout: 5000 });
        }
      }
    } else {
      const result = await attendanceApi.coachCheckIn(
        props.scheduleId,
        props.date,
        slotAddMember.value.id,
        checkInReason.value.trim() || undefined
      );
      if (result.warnings?.length) {
        $q.notify({
          type: 'warning',
          message: `Asistencia registrada con advertencias: ${result.warnings.join(', ')}`,
          timeout: 5000,
        });
      } else {
        $q.notify({ type: 'positive', message: 'Asistencia registrada' });
      }
    }
    slotAddMember.value = null;
    checkInReason.value = '';
    memberSearchResults.value = [];
    await refreshAll();
    emit('bookings-changed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error in submit add', { error: message });
    $q.notify({
      type: 'negative',
      message:
        effectiveMode.value === 'reserve'
          ? 'Error agregando reserva'
          : 'Error registrando asistencia',
    });
  } finally {
    submitting.value = false;
  }
}

// ─── Attendance row actions ─────────────────────────────────────────────────

async function quickCheckIn(member: SlotAttendanceItem) {
  if (!props.scheduleId) return;
  try {
    const result = await attendanceApi.coachCheckIn(
      props.scheduleId,
      props.date,
      member.memberId,
      undefined
    );
    if (result.warnings?.length) {
      $q.notify({
        type: 'warning',
        message: `Asistencia registrada con advertencias: ${result.warnings.join(', ')}`,
        timeout: 5000,
      });
    } else {
      $q.notify({ type: 'positive', message: 'Asistencia registrada' });
    }
    await refreshAll();
    emit('bookings-changed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error quick check-in', { error: message });
    $q.notify({ type: 'negative', message: 'Error registrando asistencia' });
  }
}

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
      await refreshAll();
      emit('bookings-changed');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error removing check-in', { error: message });
      $q.notify({ type: 'negative', message: 'Error eliminando asistencia' });
    }
  });
}

// ─── Booking row action (future) ───────────────────────────────────────────

async function onRemoveBooking(bookingId: number) {
  $q.dialog({
    title: 'Eliminar reserva',
    message: 'Esta seguro que desea eliminar esta reserva?',
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Eliminar', color: 'negative' },
  }).onOk(async () => {
    try {
      await schedulingApi.adminRemoveBooking(bookingId);
      $q.notify({ type: 'positive', message: 'Reserva eliminada' });
      await refreshAll();
      emit('bookings-changed');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error removing booking', { error: message });
      $q.notify({ type: 'negative', message: 'Error eliminando reserva' });
    }
  });
}

// ─── Activity edit ─────────────────────────────────────────────────────────

async function startEditActivity() {
  if (availableActivities.value.length === 0) {
    try {
      availableActivities.value = await schedulingApi.listActivities();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error loading activities', { error: message });
      $q.notify({ type: 'negative', message: 'Error cargando actividades' });
      return;
    }
  }
  selectedActivityId.value = slotDetail.value?.schedule.activityId ?? null;
  editingActivity.value = true;
}

async function saveActivityChange() {
  if (!slotDetail.value || !selectedActivityId.value) return;
  const scheduleId = slotDetail.value.schedule.id;
  const activityId = selectedActivityId.value;
  savingActivity.value = true;
  try {
    await schedulingApi.updateScheduleActivity(scheduleId, activityId);
    $q.notify({
      type: 'positive',
      message: 'Actividad actualizada — las reservas existentes se mantienen',
    });
    editingActivity.value = false;
    await refreshAll();
    emit('bookings-changed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error updating schedule activity', { error: message });
    $q.notify({ type: 'negative', message: 'Error actualizando actividad' });
  } finally {
    savingActivity.value = false;
  }
}

// ─── Trial booking (Phase 103) ─────────────────────────────────────────────

function buildTrialLabel(u: {
  firstName: string;
  lastName: string;
  phone: string | null;
  dni: string | null;
}): string {
  const name = `${u.firstName} ${u.lastName}`.trim();
  const extras = [u.dni, u.phone].filter(Boolean).join(' · ');
  return extras ? `${name} (${extras})` : name;
}

async function loadEligibleTrials() {
  if (!slotDetail.value) return;
  loadingEligibles.value = true;
  try {
    const res = await schedulingApi.listEligibleTrials(slotDetail.value.schedule.branchId);
    eligibleTrialsAll.value = res.users.map((u) => ({
      ...u,
      displayLabel: buildTrialLabel(u),
    }));
    eligibleTrials.value = eligibleTrialsAll.value;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading eligible trials', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando alumnos en prueba' });
    eligibleTrialsAll.value = [];
    eligibleTrials.value = [];
  } finally {
    loadingEligibles.value = false;
  }
}

function filterEligibleTrials(val: string, update: (fn: () => void) => void): void {
  update(() => {
    const q = val.trim().toLowerCase();
    if (!q) {
      eligibleTrials.value = eligibleTrialsAll.value;
      return;
    }
    eligibleTrials.value = eligibleTrialsAll.value.filter((u) =>
      u.displayLabel.toLowerCase().includes(q)
    );
  });
}

async function onBookTrial() {
  if (!selectedTrialUser.value || !slotDetail.value) return;
  bookingTrial.value = true;
  try {
    await schedulingApi.bookTrial({
      userId: selectedTrialUser.value.id,
      scheduleId: slotDetail.value.schedule.id,
      bookingDate: props.date,
    });
    $q.notify({ type: 'positive', message: 'Sesión de prueba reservada' });
    selectedTrialUser.value = null;
    trialFormOpen.value = false;
    await refreshAll();
    emit('bookings-changed');
  } catch (err: unknown) {
    const fallback = err instanceof Error ? err.message : 'Error reservando sesión de prueba';
    const msg = schedulingApi.error.value ?? fallback;
    log.error('Error booking trial', { error: msg });
    $q.notify({ type: 'negative', message: msg, timeout: 5000 });
  } finally {
    bookingTrial.value = false;
  }
}

function goToCreateTrialMember() {
  emit('update:show', false);
  void router.push({ path: '/alumnos', query: { nuevo: 'prueba' } });
}

// Re-fetch eligibles when the toggle opens, so the list reflects newly
// created prueba alumnos without forcing a dialog reopen.
watch(trialFormOpen, (open) => {
  if (open) {
    selectedTrialUser.value = null;
    void loadEligibleTrials();
  }
});

// ─── Watchers ───────────────────────────────────────────────────────────────

watch(
  () => props.show,
  (val) => {
    if (val && props.scheduleId) {
      slotAddMember.value = null;
      memberSearchResults.value = [];
      checkInReason.value = '';
      editingActivity.value = false;
      trialFormOpen.value = false;
      selectedTrialUser.value = null;
      eligibleTrialsAll.value = [];
      eligibleTrials.value = [];
      addMode.value = isToday.value ? 'checkin' : isPastOrToday.value ? 'checkin' : 'reserve';
      refreshAll();
    }
  }
);
</script>

<style scoped>
.slot-header__title {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
</style>
