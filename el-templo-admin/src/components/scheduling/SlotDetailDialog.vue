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
        <q-banner v-if="isSlotInactive" class="bg-red-1 text-red-9 q-mt-sm" rounded dense>
          <template #avatar>
            <q-icon name="block" color="negative" />
          </template>
          <div class="text-weight-medium">Clase cancelada (todas las semanas)</div>
          <div v-if="slotInactiveReason" class="text-caption">
            Motivo (lo verán los alumnos al intentar reservar): "{{ slotInactiveReason }}"
          </div>
          <div v-else class="text-caption">
            Sin motivo registrado — los alumnos verán el mensaje genérico.
          </div>
        </q-banner>
        <q-banner
          v-else-if="isCancelledForDate"
          class="bg-orange-1 text-orange-10 q-mt-sm"
          rounded
          dense
        >
          <template #avatar>
            <q-icon name="event_busy" color="warning" />
          </template>
          <div class="text-weight-medium">
            Clase cancelada solo para esta fecha ({{ headerDayLabel }} {{ headerDateLabel }})
          </div>
          <div v-if="exceptionReason" class="text-caption">
            Motivo (lo verán los alumnos al intentar reservar): "{{ exceptionReason }}"
          </div>
          <div class="text-caption">Las demás semanas del horario siguen activas.</div>
        </q-banner>
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
            <!-- Inactive slot: list bookings cancelled by the deactivation
                 so the admin sees who will get their reservation back when
                 they click "Reactivar clase". -->
            <template
              v-if="(isSlotInactive || isCancelledForDate) && pendingRestorationBookings.length > 0"
            >
              <q-item-label header class="text-negative">
                Se restaurarán al reactivar ({{ pendingRestorationBookings.length }})
              </q-item-label>
              <q-item v-for="booking in pendingRestorationBookings" :key="booking.id">
                <q-item-section>
                  <q-item-label class="member-name-link" @click="goToMember(booking.memberId)">{{
                    booking.memberName
                  }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-badge color="grey-6" label="Cancelada" />
                </q-item-section>
              </q-item>
            </template>

            <q-item
              v-if="
                !isSlotInactive &&
                !isCancelledForDate &&
                activeBookings.length === 0 &&
                waitlistBookings.length === 0
              "
            >
              <q-item-section class="text-grey-5 text-italic text-center">
                Sin reservas para este horario
              </q-item-section>
            </q-item>
            <q-item
              v-if="
                (isSlotInactive || isCancelledForDate) && pendingRestorationBookings.length === 0
              "
            >
              <q-item-section class="text-grey-5 text-italic text-center">
                No hay reservas que restaurar.
              </q-item-section>
            </q-item>

            <!-- Reservados (regular bookings) -->
            <template v-if="activeTrialBookings.length > 0 && activeRegularBookings.length > 0">
              <q-item-label header> Reservados ({{ activeRegularBookings.length }}) </q-item-label>
            </template>
            <q-item v-for="booking in activeRegularBookings" :key="booking.id">
              <q-item-section>
                <q-item-label class="member-name-link" @click="goToMember(booking.memberId)">{{
                  booking.memberName
                }}</q-item-label>
                <q-item-label caption>
                  <MemberTags
                    :segment="booking.segment"
                    :seniority="booking.seniority"
                    :end-date="booking.endDate"
                    :timezone="branchTimezone"
                  />
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

            <!-- Sesiones de Prueba (trial bookings) -->
            <template v-if="activeTrialBookings.length > 0">
              <q-item-label header>
                Sesiones de Prueba ({{ activeTrialBookings.length }})
              </q-item-label>
              <q-item v-for="booking in activeTrialBookings" :key="booking.id">
                <q-item-section>
                  <q-item-label class="member-name-link" @click="goToMember(booking.memberId)">{{
                    booking.memberName
                  }}</q-item-label>
                  <q-item-label caption>
                    <MemberTags
                      :segment="booking.segment"
                      :seniority="booking.seniority"
                      :end-date="booking.endDate"
                      :timezone="branchTimezone"
                    />
                  </q-item-label>
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
                  <q-item-label class="member-name-link" @click="goToMember(booking.memberId)">{{
                    booking.memberName
                  }}</q-item-label>
                  <q-item-label v-if="booking.waitlistPosition" caption>
                    Posición {{ booking.waitlistPosition }}
                  </q-item-label>
                  <q-item-label caption>
                    <MemberTags
                      :segment="booking.segment"
                      :seniority="booking.seniority"
                      :end-date="booking.endDate"
                      :timezone="branchTimezone"
                    />
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
                  <span class="member-name-link" @click="goToMember(member.memberId)">{{
                    member.memberName
                  }}</span>
                  <q-badge
                    v-if="isTrialMember(member)"
                    color="warning"
                    label="PRUEBA"
                    class="q-ml-xs"
                  />
                  <MemberTags
                    :segment="member.segment"
                    :seniority="member.seniority"
                    :end-date="member.endDate"
                    :timezone="branchTimezone"
                    class="q-ml-xs"
                  />
                </q-item-label>
                <q-item-label caption>
                  <template v-if="member.attendanceId && member.checkedInAt">
                    {{ formatTime(member.checkedInAt) }}
                  </template>
                  <template v-else-if="!member.bookingId">
                    <span class="text-grey-5">(sin reserva)</span>
                  </template>
                  <template v-else>
                    <span class="text-grey-5">Reservado</span>
                  </template>
                </q-item-label>
                <q-item-label v-if="member.anniversaryLabel" caption>
                  <span class="anniversary-line">
                    🎉 {{ member.anniversaryLabel }}
                  </span>
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <div class="row items-center q-gutter-xs">
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
                    v-if="isToday && member.bookingId && !member.attendanceId"
                    flat
                    dense
                    round
                    icon="delete"
                    color="negative"
                    size="sm"
                    @click="onRemoveBooking(member.bookingId)"
                  >
                    <q-tooltip>Cancelar reserva</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if="member.attendanceId"
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
                </div>
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
            <template v-else>
              <!-- Picker for existing prueba alumnos that haven't used their
                   SP yet. Gated on the FULL list (eligibleTrialsAll), not the
                   filtered view: otherwise typing a query that matches nobody
                   collapses eligibleTrials to 0 and unmounts the input
                   mid-search ("se me va el renglón"). With the full list as the
                   gate, the input stays put and the #no-option slot renders
                   "Sin resultados". The empty-branch case (no eligible trials
                   at all) still falls through to "Crear nuevo" below. -->
              <template v-if="eligibleTrialsAll.length > 0">
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
                <q-separator class="q-my-md" />
              </template>

              <!-- Soft-register entry point: persona se presenta a la puerta,
                   admin crea alumno en prueba + reserva en este slot en una
                   sola acción. No redirect — happens inside the dialog. -->
              <q-btn
                color="warning"
                icon="fact_check"
                label="Crear nuevo en prueba"
                no-caps
                unelevated
                class="full-width"
                :disable="bookingTrial"
                @click="onOpenCreateTrialMember"
              />
              <div class="text-caption text-grey-7 q-mt-xs">
                Solo nombre, apellido y teléfono — se reserva automáticamente en este horario.
              </div>
            </template>
          </div>
        </q-expansion-item>

        <!-- Soft-register dialog. branchId is locked to this slot's sede so
             the receptionist can't accidentally create a lead in another
             sede that would then fail the branch-coherence check at book
             time. On @created we chain straight into bookTrial. -->
        <TrialMemberFormDialog
          v-model="createTrialMemberOpen"
          :branches="trialDialogBranches"
          :default-branch-id="slotDetail?.schedule.branchId ?? null"
          :lock-branch="true"
          @created="onTrialMemberCreated"
        />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn
          v-if="slotDetail && !isSlotInactive && !isCancelledForDate"
          flat
          label="Cancelar clase"
          color="negative"
          icon="block"
          :loading="togglingSlot"
          @click="openDeactivateDialog"
        />
        <q-btn
          v-if="isSlotInactive"
          flat
          label="Reactivar clase"
          color="positive"
          icon="check_circle"
          :loading="togglingSlot"
          @click="applyReactivate"
        />
        <q-btn
          v-if="!isSlotInactive && isCancelledForDate"
          flat
          label="Restaurar esta fecha"
          color="positive"
          icon="event_available"
          :loading="togglingSlot"
          @click="applyRestoreDate"
        />
        <q-btn flat label="Cerrar" color="grey-7" @click="$emit('update:show', false)" />
      </q-card-actions>
    </q-card>

    <!-- Cancel-class dialog -->
    <q-dialog v-model="deactivateDialogOpen" persistent>
      <q-card style="min-width: 360px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Cancelar clase</div>
          <div class="text-caption text-grey-7 q-mt-xs">
            {{
              deactivateScope === 'date'
                ? `Se cancela únicamente la clase del ${headerDayLabel.toLowerCase()} ${headerDateLabel}. Las demás semanas siguen activas.`
                : 'Se desactiva el horario completo: la clase deja de dictarse TODAS las semanas hasta que se reactive.'
            }}
            Las reservas afectadas se cancelan automáticamente y los alumnos verán el motivo al
            intentar reservar.
          </div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-option-group
            v-model="deactivateScope"
            :options="[
              { label: `Solo esta fecha (${headerDayLabel} ${headerDateLabel})`, value: 'date' },
              { label: 'Todas las semanas (desactiva el horario)', value: 'all' },
            ]"
            type="radio"
            class="q-mb-sm"
          />
          <q-input
            v-model="deactivateReason"
            label="Motivo (lo verán los alumnos al intentar reservar)"
            type="textarea"
            rows="2"
            maxlength="255"
            counter
            outlined
            autofocus
            hint="Ej: Sede inundada, reabrimos el viernes."
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            flat
            label="Volver"
            color="grey-7"
            :disable="togglingSlot"
            @click="deactivateDialogOpen = false"
          />
          <q-btn
            unelevated
            label="Cancelar clase"
            color="negative"
            :loading="togglingSlot"
            @click="applyDeactivate"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
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
import { extractError } from 'src/utils/extract-error';
import TrialMemberFormDialog from 'src/components/TrialMemberFormDialog.vue';
import MemberTags from 'src/components/scheduling/MemberTags.vue';
import type { BranchOption, MemberProfile } from 'src/types/member';
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
const router = useRouter();
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

// Activity edit
const editingActivity = ref(false);
const selectedActivityId = ref<number | null>(null);
const availableActivities = ref<ActivityRecord[]>([]);
const savingActivity = ref(false);

// Slot deactivation (closure). Scope 'date' cancels only this occurrence
// (schedule_exceptions); 'all' deactivates the recurring template.
const deactivateDialogOpen = ref(false);
const deactivateReason = ref('');
const deactivateScope = ref<'date' | 'all'>('date');
const togglingSlot = ref(false);

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

/**
 * Bookings cancelled as part of the current deactivation — these are the
 * ones that will be restored when the admin clicks "Reactivar clase".
 * Mirrors the backend filter in BookingService.restoreCancelledBookingsForSchedule:
 *   status='cancelado' AND cancelledAt >= deactivatedAt.
 * Member-initiated cancellations from before the closure are excluded.
 */
const pendingRestorationBookings = computed(() => {
  if (!slotDetail.value) return [];
  // Per-date cancellation: cutoff = exception createdAt (mirrors the backend
  // filter in BookingService.restoreCancelledBookingsForDate). Whole-slot
  // deactivation: cutoff = deactivatedAt (restoreCancelledBookingsForSchedule).
  const cutoff = slotDetail.value.cancelledForDate
    ? slotDetail.value.exceptionCreatedAt
    : slotDetail.value.schedule.deactivatedAt;
  if (!cutoff) return [];
  return slotDetail.value.bookings.filter(
    (b) => b.status === 'cancelado' && b.cancelledAt !== null && b.cancelledAt >= cutoff
  );
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

const isSlotInactive = computed(
  () => slotDetail.value !== null && !slotDetail.value.schedule.isActive
);
const slotInactiveReason = computed(() => slotDetail.value?.schedule.inactiveReason ?? null);

// Per-date cancellation state (this exact date only).
const isCancelledForDate = computed(() => slotDetail.value?.cancelledForDate ?? false);
const exceptionReason = computed(() => slotDetail.value?.exceptionReason ?? null);

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

// D-07 (Plan 161): ¿la actividad del slot es especial (requiere pase)? Se
// resuelve matcheando el activityId del schedule contra la lista de actividades
// (cargada al abrir el diálogo). Habilita la advertencia confirmable del staff.
const isSpecialSlot = computed(() => {
  const id = slotDetail.value?.schedule.activityId;
  if (id == null) return false;
  return availableActivities.value.some((a) => a.id === id && a.isSpecial);
});

/** Carga la lista de actividades una vez (para conocer isSpecial del slot). */
async function ensureActivitiesLoaded(): Promise<void> {
  if (availableActivities.value.length > 0) return;
  try {
    availableActivities.value = await schedulingApi.listActivities();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading activities for special check', { error: message });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getBookingStatusLabel(status: BookingStatus): string {
  return BOOKING_STATUS_LABELS[status];
}

function getBookingStatusColor(status: BookingStatus): string {
  return BOOKING_STATUS_COLORS[status];
}

// Navega al perfil del alumno. Cierra el dialog antes de empujar la ruta para
// que HorariosPage no quede con el modal montado al volver.
function goToMember(memberId: number): void {
  emit('update:show', false);
  void router.push(`/alumnos/${memberId}`);
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

// ─── Slot toggle (deactivate / reactivate) ────────────────────────────────

function openDeactivateDialog() {
  deactivateReason.value = '';
  // Past dates can't take a per-date exception (the class already ran), so
  // the whole-template scope is the only meaningful option there.
  deactivateScope.value = isPastOrToday.value && !isToday.value ? 'all' : 'date';
  deactivateDialogOpen.value = true;
}

async function applyDeactivate() {
  if (!props.scheduleId) return;
  togglingSlot.value = true;
  try {
    let cancelledBookings = 0;
    if (deactivateScope.value === 'date') {
      const result = await schedulingApi.cancelScheduleDate(
        props.scheduleId,
        props.date,
        deactivateReason.value.trim() || null
      );
      cancelledBookings = result.cancelledBookings;
    } else {
      const result = await schedulingApi.toggleSchedule(
        props.scheduleId,
        false,
        deactivateReason.value.trim() || null
      );
      cancelledBookings = result.cancelledBookings;
    }
    deactivateDialogOpen.value = false;
    const scopeLabel =
      deactivateScope.value === 'date' ? 'Clase cancelada para esta fecha.' : 'Clase cancelada.';
    const msg =
      cancelledBookings > 0
        ? `${scopeLabel} ${cancelledBookings} reserva${
            cancelledBookings === 1 ? '' : 's'
          } cancelada${cancelledBookings === 1 ? '' : 's'}.`
        : scopeLabel;
    $q.notify({ type: 'positive', message: msg });
    await refreshAll();
    emit('bookings-changed');
  } catch (err: unknown) {
    const message = extractError(err, 'Error cancelando la clase');
    log.warn('Deactivate slot rejected', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    togglingSlot.value = false;
  }
}

async function applyRestoreDate() {
  if (!props.scheduleId) return;
  togglingSlot.value = true;
  try {
    const result = await schedulingApi.restoreScheduleDate(props.scheduleId, props.date);
    const msg =
      result.restoredBookings > 0
        ? `Fecha restaurada. ${result.restoredBookings} reserva${
            result.restoredBookings === 1 ? '' : 's'
          } restaurada${result.restoredBookings === 1 ? '' : 's'}.`
        : 'Fecha restaurada.';
    $q.notify({ type: 'positive', message: msg });
    await refreshAll();
    emit('bookings-changed');
  } catch (err: unknown) {
    const message = extractError(err, 'Error restaurando la fecha');
    log.warn('Restore date rejected', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    togglingSlot.value = false;
  }
}

async function applyReactivate() {
  if (!props.scheduleId) return;
  togglingSlot.value = true;
  try {
    const result = await schedulingApi.toggleSchedule(props.scheduleId, true, null);
    const msg =
      result.restoredBookings > 0
        ? `Clase reactivada. ${result.restoredBookings} reserva${
            result.restoredBookings === 1 ? '' : 's'
          } restaurada${result.restoredBookings === 1 ? '' : 's'}.`
        : 'Clase reactivada.';
    $q.notify({ type: 'positive', message: msg });
    await refreshAll();
    emit('bookings-changed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error reactivating slot', { error: message });
    $q.notify({ type: 'negative', message: 'Error reactivando la clase' });
  } finally {
    togglingSlot.value = false;
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
    .searchMembers(val, 10)
    .then((members) => {
      update(() => {
        memberSearchResults.value = members.map((m) => ({
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
  // D-07 (Plan 161): reserva manual de una actividad especial → advertencia
  // confirmable (bypass de staff del gating de pase). El backend valida y avisa
  // con detalle si el alumno no tiene un pase activo.
  if (effectiveMode.value === 'reserve' && isSpecialSlot.value) {
    $q.dialog({
      title: 'Actividad especial (requiere pase)',
      message:
        'Estás reservando manualmente una actividad especial. Si el alumno no tiene un pase de actividades activo, la reserva se registrará igual como excepción del staff. ¿Confirmás?',
      cancel: { flat: true, label: 'Volver' },
      ok: { color: 'primary', label: 'Confirmar reserva' },
    }).onOk(() => {
      void doSubmitAdd();
    });
    return;
  }
  await doSubmitAdd();
}

async function doSubmitAdd() {
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
    // 4xx from the API are validation errors (slot inactivo, duplicado,
    // ya tiene asistencia, etc) — surface the backend message to the
    // admin and log as warn so Sentry isn't swamped by every business
    // rejection. log.error is reserved for unexpected failures (5xx,
    // network, JS bugs).
    const fallback =
      effectiveMode.value === 'reserve'
        ? 'Error agregando reserva'
        : 'Error registrando asistencia';
    const message = extractError(err, fallback);
    log.warn('Submit add rejected', { error: message });
    $q.notify({ type: 'negative', message });
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
    const message = extractError(err, 'Error registrando asistencia');
    log.warn('Quick check-in rejected', { error: message });
    $q.notify({ type: 'negative', message });
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
      const message = extractError(err, 'Error eliminando asistencia');
      log.warn('Remove check-in rejected', { error: message });
      $q.notify({ type: 'negative', message });
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
      const message = extractError(err, 'Error eliminando reserva');
      log.warn('Remove booking rejected', { error: message });
      $q.notify({ type: 'negative', message });
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

// ─── Inline soft-register for SP ────────────────────────────────────────────
// Persona se presenta a la puerta → admin abre slot → crea alumno en prueba
// + reserva en este horario en una sola acción. The TrialMemberFormDialog
// stays mounted inside this dialog so we don't lose context (the previous
// flow redirected to /alumnos which forced the admin to manually walk back).

const createTrialMemberOpen = ref(false);

// We feed the trial dialog just this slot's sede — branchId is locked, so
// no need to load the full BranchOption[] list.
const trialDialogBranches = computed<BranchOption[]>(() => {
  if (!slotDetail.value) return [];
  return [
    {
      id: slotDetail.value.schedule.branchId,
      name: slotDetail.value.schedule.branchName,
    },
  ];
});

function onOpenCreateTrialMember(): void {
  if (!slotDetail.value) return;
  createTrialMemberOpen.value = true;
}

// On successful soft-register, immediately book the just-created prueba
// user into this slot. The user is in 'prueba' status with branch = this
// slot's branch, so bookTrial passes its eligibility checks.
async function onTrialMemberCreated(member: MemberProfile): Promise<void> {
  if (!slotDetail.value) return;
  bookingTrial.value = true;
  try {
    await schedulingApi.bookTrial({
      userId: member.id,
      scheduleId: slotDetail.value.schedule.id,
      bookingDate: props.date,
    });
    $q.notify({ type: 'positive', message: 'Alumno creado y reservado para esta clase' });
    trialFormOpen.value = false;
    await refreshAll();
    emit('bookings-changed');
  } catch (err: unknown) {
    // Booking failed but the user already exists — surface the reason so
    // the admin can fix it (e.g. branch mismatch, prior trial conflict) and
    // retry via the "Buscar alumno en prueba" picker.
    const fallback = err instanceof Error ? err.message : 'Error reservando sesión de prueba';
    const msg = schedulingApi.error.value ?? fallback;
    log.error('Error booking trial after soft register', { error: msg });
    $q.notify({
      type: 'warning',
      message: `Alumno creado pero la reserva falló: ${msg}. Buscalo en la lista para reservar.`,
      timeout: 7000,
    });
    await loadEligibleTrials();
  } finally {
    bookingTrial.value = false;
  }
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
      void ensureActivitiesLoaded();
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

/* Nombres de alumnos clickeables → perfil del alumno */
/* Color de texto original (negro heredado), solo se distingue por el subrayado. */
.member-name-link {
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Aniversario de permanencia: línea cálida y destacada bajo el nombre. */
.anniversary-line {
  color: #b26a00;
  font-weight: 600;
}
</style>
