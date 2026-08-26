<template>
  <q-page class="reservas" padding>
    <!-- Loading -->
    <div v-if="loading" class="reservas__loading">
      <TemploLoader size="lg" />
    </div>

    <!-- State 3 — trial already booked (D-22): confirmation card, no reserve/cancel -->
    <div v-else-if="trialBooking" class="reservas__empty">
      <div class="next-class-card next-class-card--confirmed">
        <div class="next-class-card__icon">
          <q-icon name="check_circle" size="32px" color="positive" />
        </div>
        <div class="next-class-card__info">
          <p class="next-class-card__activity">Tu sesión de prueba está reservada</p>
          <p class="next-class-card__time">{{ trialConfirmationBody }}</p>
          <p v-if="trialBooking.branchAddress" class="next-class-card__address">
            {{ trialBooking.branchAddress }}
          </p>
        </div>
      </div>

      <!-- D-19: "Cómo llegar" secundario, reusa mapsUrlForBranch/openBranchMaps
           (D-17) — mapsUrl viaja pre-armado desde el backend (buildMapsUrl,
           fuente única), nunca una segunda construcción acá. -->
      <q-btn
        v-if="trialBooking.mapsUrl"
        flat
        dense
        no-caps
        color="primary"
        icon="directions"
        label="Cómo llegar"
        class="q-mt-sm"
        @click="openBranchMaps(trialBooking.mapsUrl)"
      />

      <!-- D-20: botón PRIMARIO de calendario — para el freemium sin la app, es
           el mecanismo anti no-show de primera línea (no un link chiquito). -->
      <q-btn
        unelevated
        no-caps
        rounded
        color="primary"
        icon="event"
        label="Agregar al calendario"
        class="q-mt-md trial-calendar-btn"
        @click="onAddTrialToCalendar"
      />

      <!-- D-16: qué esperar (mismo copy que en modo prueba, ver FIRST_TIMER_ITEMS) -->
      <q-expansion-item
        class="first-timer-card q-mt-md"
        icon="help_outline"
        label="¿Primera vez? Qué esperar"
        header-class="first-timer-card__header"
        dense
      >
        <q-list class="first-timer-card__list">
          <q-item v-for="item in FIRST_TIMER_ITEMS" :key="item.text" dense>
            <q-item-section avatar>
              <q-icon :name="item.icon" size="18px" color="primary" />
            </q-item-section>
            <q-item-section>{{ item.text }}</q-item-section>
          </q-item>
        </q-list>
      </q-expansion-item>

      <!-- >24h before the class: self-service change/cancel. Inside 24h it's
           locked, so we fall back to the WhatsApp affordance. -->
      <template v-if="trialBooking.canModify">
        <div class="row q-gutter-sm q-mt-md justify-center">
          <q-btn
            no-caps
            rounded
            outline
            color="primary"
            label="Cambiar horario"
            :loading="trialCancelLoading"
            @click="onChangeTrial"
          />
          <q-btn
            no-caps
            rounded
            color="negative"
            label="Cancelar"
            :loading="trialCancelLoading"
            @click="openTrialCancelDialog"
          />
        </div>
        <p class="reservas__empty-text q-mt-sm">Podés cambiar o cancelar hasta 24 horas antes.</p>
      </template>
      <q-btn v-else no-caps flat color="positive" class="q-mt-md" @click="openTrialWhatsApp">
        <q-icon
          name="img:/icons/whatsapp.svg"
          size="18px"
          class="q-mr-sm"
          style="filter: brightness(0) invert(1)"
        />
        ¿Necesitás cambiarla? Escribinos
      </q-btn>
    </div>

    <!-- State 4a — partner free-week benefit pending (Phase 179, D-05/D-06): the
         beneficiary sees the grid the same way a trial-eligible freemium does,
         even without an active plan. D-18 (backend) guarantees this never
         overlaps with trialEligible, so no cross-condition is needed here —
         only the chain order relative to the blocked state below. -->
    <template v-else-if="partnerBenefitEligible">
      <div class="trial-banner q-mb-md">
        <q-icon name="redeem" size="20px" class="trial-banner__icon" />
        <div class="trial-banner__text">
          <p class="trial-banner__heading">Tu semana de regalo</p>
          <p class="trial-banner__body">
            Cortesía de {{ partnerBenefit?.eligible ? partnerBenefit.partnerName : '' }}. Elegí un
            horario: al reservar tu primera clase arranca tu semana (3 clases). Vencimiento del
            beneficio: {{ partnerBenefitExpiresLabel }}.
          </p>
        </div>
      </div>

      <!-- Branch selector — required before the grid shows, same as trial mode. -->
      <div class="q-mb-md flex justify-center">
        <q-select
          v-model="trialBranchId"
          :options="branchOptions"
          dense
          rounded
          outlined
          emit-value
          map-options
          class="branch-select"
          :display-value="trialBranchId ? undefined : 'Elegí una sede para ver los horarios'"
        >
          <template #prepend>
            <q-icon name="location_on" size="18px" color="primary" />
          </template>
          <template #append>
            <q-icon name="unfold_more" size="16px" color="grey-6" />
          </template>
        </q-select>
      </div>

      <div v-if="!trialBranchId" class="day-slots__empty">
        <q-icon name="event_busy" size="40px" color="grey-4" />
        <p>Elegí una sede para ver los horarios disponibles.</p>
      </div>

      <template v-else>
        <div class="day-strip q-mb-md">
          <div class="day-strip__nav">
            <q-btn flat dense round icon="chevron_left" size="sm" @click="changeWeek(-1)" />
            <q-btn flat dense no-caps class="day-strip__week-label" @click="goToCurrentWeek">
              {{ weekLabel }}
            </q-btn>
            <q-btn flat dense round icon="chevron_right" size="sm" @click="changeWeek(1)" />
          </div>
          <div class="day-strip__days">
            <button
              v-for="day in visibleDays"
              :key="day"
              class="day-pill"
              :class="{
                'day-pill--selected': selectedDay === day,
                'day-pill--today': isToday(day),
                'day-pill--past': isDayPast(day),
              }"
              @click="selectedDay = day"
            >
              <span class="day-pill__abbrev">{{ DAY_LABELS[day] }}</span>
              <span class="day-pill__date">{{ dayDateNumber(day) }}</span>
            </button>
          </div>
        </div>

        <div class="day-slots">
          <div v-if="selectedDayHoliday" class="day-slots__holiday">
            <q-icon name="celebration" size="20px" />
            <span>{{ selectedDayHoliday }}</span>
          </div>

          <template v-if="morningSlots.length > 0">
            <p v-if="afternoonSlots.length > 0" class="day-slots__period">Turno Mañana</p>
            <div
              v-for="slot in morningSlots"
              :key="slot.id"
              class="slot-card"
              :class="slotCardClass(slot)"
              @click="onPartnerSlotTap(slot)"
            >
              <div class="slot-card__time">
                <span class="slot-card__hour">{{ formatTime(slot.startTime) }}</span>
                <span class="slot-card__activity">{{ slot.activityName }}</span>
              </div>
              <div class="slot-card__right">
                <template v-if="isSlotHoliday(slot)">
                  <q-badge color="accent" label="Feriado" />
                </template>
                <template v-else-if="slot.isFull">
                  <span class="slot-card__avail slot-card__avail--full">Completo</span>
                </template>
                <template v-else-if="isSlotPast(slot)"></template>
                <template v-else>
                  <span
                    class="slot-card__avail"
                    :class="`slot-card__avail--${availabilityLevel(slot)}`"
                    >{{ availabilityText(slot) }}</span
                  >
                  <q-btn
                    flat
                    dense
                    no-caps
                    color="primary"
                    label="Reservar"
                    class="slot-card__action"
                    @click.stop="onPartnerSlotTap(slot)"
                  />
                </template>
              </div>
            </div>
          </template>

          <template v-if="afternoonSlots.length > 0">
            <p v-if="morningSlots.length > 0" class="day-slots__period">Turno Tarde</p>
            <div
              v-for="slot in afternoonSlots"
              :key="slot.id"
              class="slot-card"
              :class="slotCardClass(slot)"
              @click="onPartnerSlotTap(slot)"
            >
              <div class="slot-card__time">
                <span class="slot-card__hour">{{ formatTime(slot.startTime) }}</span>
                <span class="slot-card__activity">{{ slot.activityName }}</span>
              </div>
              <div class="slot-card__right">
                <template v-if="isSlotHoliday(slot)">
                  <q-badge color="accent" label="Feriado" />
                </template>
                <template v-else-if="slot.isFull">
                  <span class="slot-card__avail slot-card__avail--full">Completo</span>
                </template>
                <template v-else-if="isSlotPast(slot)"></template>
                <template v-else>
                  <span
                    class="slot-card__avail"
                    :class="`slot-card__avail--${availabilityLevel(slot)}`"
                    >{{ availabilityText(slot) }}</span
                  >
                  <q-btn
                    flat
                    dense
                    no-caps
                    color="primary"
                    label="Reservar"
                    class="slot-card__action"
                    @click.stop="onPartnerSlotTap(slot)"
                  />
                </template>
              </div>
            </div>
          </template>
        </div>
      </template>
    </template>

    <!-- State 4b — partner free-week benefit expired (Phase 179, D-07): the
         benefit lapsed 30 days after signup without a first reservation. No
         grid, no reserve — same visual language as the blocked muro below. -->
    <div v-else-if="partnerBenefitExpired" class="reservas__empty">
      <q-icon name="event_busy" size="64px" color="grey-5" />
      <h2 class="reservas__empty-title">Tu semana de regalo venció</h2>
      <p class="reservas__empty-text">
        El beneficio de tu semana gratis venció porque no llegaste a reservar a tiempo. Consultá
        por nuestros planes para seguir entrenando.
      </p>
      <q-btn no-caps rounded color="positive" class="q-mt-md" @click="openWhatsApp">
        <q-icon
          name="img:/icons/whatsapp.svg"
          size="20px"
          class="q-mr-sm"
          style="filter: brightness(0) invert(1)"
        />
        Ver planes
      </q-btn>
    </div>

    <!-- Blocked state — user has no presencial plan and is NOT a trial-eligible freemium.
         Phase 162 (D-06): el externo-solo-pase (hasEspecialPass) pasa el gate y entra a
         la grilla filtrada a especiales (E5); usar canAccessGrid, no canReservePresencial. -->
    <div v-else-if="!canAccessGrid && !trialEligible" class="reservas__empty">
      <q-icon name="event_available" size="64px" color="grey-5" />
      <h2 class="reservas__empty-title">{{ emptyTitle }}</h2>
      <p class="reservas__empty-text">{{ emptyText }}</p>
      <q-btn no-caps rounded color="positive" class="q-mt-md" @click="openWhatsApp">
        <q-icon
          name="img:/icons/whatsapp.svg"
          size="20px"
          class="q-mr-sm"
          style="filter: brightness(0) invert(1)"
        />
        Consultá por tu plan
      </q-btn>
    </div>

    <!-- State 2 — modo reservar prueba (freemium elegible, D-20/D-22) -->
    <template v-else-if="trialEligible">
      <!-- Popup de elección de sede (D-07/D-08): setea el MISMO trialBranchId
           que alimenta el q-select de abajo — no hay un segundo estado de sede (D-09). -->
      <BranchPickerDialog
        v-model="showBranchPicker"
        :branches="branches"
        @select="onBranchPickerSelect"
      />

      <!-- Trial banner -->
      <div class="trial-banner q-mb-md">
        <q-icon name="card_giftcard" size="20px" class="trial-banner__icon" />
        <div class="trial-banner__text">
          <p class="trial-banner__heading">Tu sesión de prueba gratis</p>
          <p class="trial-banner__body">Elegí una sede y un horario. Es gratis y sin compromiso.</p>
        </div>
      </div>

      <!-- D-16: "¿Primera vez? Qué esperar" — solo en modo prueba, copy estático -->
      <q-expansion-item
        class="first-timer-card q-mb-md"
        icon="help_outline"
        label="¿Primera vez? Qué esperar"
        header-class="first-timer-card__header"
        dense
      >
        <q-list class="first-timer-card__list">
          <q-item v-for="item in FIRST_TIMER_ITEMS" :key="item.text" dense>
            <q-item-section avatar>
              <q-icon :name="item.icon" size="18px" color="primary" />
            </q-item-section>
            <q-item-section>{{ item.text }}</q-item-section>
          </q-item>
        </q-list>
      </q-expansion-item>

      <!-- Branch selector — ALWAYS shown for trial mode (D-06): freemium must pick a physical sede -->
      <div class="q-mb-md flex justify-center items-center">
        <q-select
          v-model="trialBranchId"
          :options="branchOptions"
          dense
          rounded
          outlined
          emit-value
          map-options
          class="branch-select"
          :display-value="trialBranchId ? undefined : 'Elegí una sede para ver los horarios'"
        >
          <template #prepend>
            <q-icon name="location_on" size="18px" color="primary" />
          </template>
          <template #append>
            <q-icon name="unfold_more" size="16px" color="grey-6" />
          </template>
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.label }}</q-item-label>
                <q-item-label caption>{{ scope.opt.address ?? 'Dirección no disponible' }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
        <!-- D-17: link "Cómo llegar" junto al selector cuando ya hay sede elegida -->
        <q-btn
          v-if="mapsUrlForBranch(trialBranchId)"
          flat
          dense
          no-caps
          size="sm"
          color="primary"
          label="Cómo llegar"
          class="q-ml-sm"
          @click="openBranchMaps(mapsUrlForBranch(trialBranchId)!)"
        />
      </div>

      <!-- Grid hidden until a sede is chosen -->
      <div v-if="!trialBranchId" class="day-slots__empty">
        <q-icon name="event_busy" size="40px" color="grey-4" />
        <p>Elegí una sede para ver los horarios disponibles.</p>
      </div>

      <template v-else>
        <!-- Day selector strip (30-day window, D-05) -->
        <div class="day-strip q-mb-md">
          <div class="day-strip__nav">
            <q-btn flat dense round icon="chevron_left" size="sm" @click="changeWeek(-1)" />
            <q-btn flat dense no-caps class="day-strip__week-label" @click="goToCurrentWeek">
              {{ weekLabel }}
            </q-btn>
            <q-btn
              flat
              dense
              round
              icon="chevron_right"
              size="sm"
              :disable="!canGoForward"
              @click="changeWeek(1)"
            />
          </div>
          <div class="day-strip__days">
            <button
              v-for="day in visibleDays"
              :key="day"
              class="day-pill"
              :class="{
                'day-pill--selected': selectedDay === day,
                'day-pill--today': isToday(day),
                'day-pill--past': isDayPast(day),
              }"
              @click="selectedDay = day"
            >
              <span class="day-pill__abbrev">{{ DAY_LABELS[day] }}</span>
              <span class="day-pill__date">{{ dayDateNumber(day) }}</span>
            </button>
          </div>
        </div>

        <!-- Selected day's slots (NO cancel affordance — D-03) -->
        <div class="day-slots">
          <div v-if="selectedDayHoliday" class="day-slots__holiday">
            <q-icon name="celebration" size="20px" />
            <span>{{ selectedDayHoliday }}</span>
          </div>

          <template v-if="morningSlots.length > 0">
            <p v-if="afternoonSlots.length > 0" class="day-slots__period">Turno Mañana</p>
            <div
              v-for="slot in morningSlots"
              :key="slot.id"
              class="slot-card"
              :class="slotCardClass(slot)"
              @click="onTrialSlotTap(slot)"
            >
              <div class="slot-card__time">
                <span class="slot-card__hour">{{ formatTime(slot.startTime) }}</span>
                <span
                class="slot-card__activity"
                :class="{ 'slot-card__activity--tappable': slot.activityDescription }"
                @click="onActivityNameTap(slot, $event)"
                >{{ slot.activityName }}</span
              >
              </div>
              <div class="slot-card__right">
                <template v-if="isSlotHoliday(slot)">
                  <q-badge color="accent" label="Feriado" />
                </template>
                <template v-else-if="slot.isFull">
                  <span class="slot-card__avail slot-card__avail--full">Completo</span>
                </template>
                <template v-else-if="isSlotPast(slot)"></template>
                <template v-else>
                  <span
                    class="slot-card__avail"
                    :class="`slot-card__avail--${availabilityLevel(slot)}`"
                    >{{ availabilityText(slot) }}</span
                  >
                  <q-btn
                    flat
                    dense
                    no-caps
                    color="primary"
                    label="Reservar"
                    class="slot-card__action"
                    @click.stop="onTrialSlotTap(slot)"
                  />
                </template>
              </div>
            </div>
          </template>

          <template v-if="afternoonSlots.length > 0">
            <p v-if="morningSlots.length > 0" class="day-slots__period">Turno Tarde</p>
            <div
              v-for="slot in afternoonSlots"
              :key="slot.id"
              class="slot-card"
              :class="slotCardClass(slot)"
              @click="onTrialSlotTap(slot)"
            >
              <div class="slot-card__time">
                <span class="slot-card__hour">{{ formatTime(slot.startTime) }}</span>
                <span
                class="slot-card__activity"
                :class="{ 'slot-card__activity--tappable': slot.activityDescription }"
                @click="onActivityNameTap(slot, $event)"
                >{{ slot.activityName }}</span
              >
              </div>
              <div class="slot-card__right">
                <template v-if="isSlotHoliday(slot)">
                  <q-badge color="accent" label="Feriado" />
                </template>
                <template v-else-if="slot.isFull">
                  <span class="slot-card__avail slot-card__avail--full">Completo</span>
                </template>
                <template v-else-if="isSlotPast(slot)"></template>
                <template v-else>
                  <span
                    class="slot-card__avail"
                    :class="`slot-card__avail--${availabilityLevel(slot)}`"
                    >{{ availabilityText(slot) }}</span
                  >
                  <q-btn
                    flat
                    dense
                    no-caps
                    color="primary"
                    label="Reservar"
                    class="slot-card__action"
                    @click.stop="onTrialSlotTap(slot)"
                  />
                </template>
              </div>
            </div>
          </template>

          <div
            v-if="morningSlots.length === 0 && afternoonSlots.length === 0"
            class="day-slots__empty"
          >
            <q-icon name="event_busy" size="40px" color="grey-4" />
            <p>No hay horarios este día</p>
          </div>
        </div>

        <p class="reservas__policy">
          Es tu sesión de prueba gratis. Podés cancelarla o cambiarla hasta 24 horas antes; dentro
          de las 24 horas queda fija.
        </p>
      </template>
    </template>

    <template v-else>
      <!-- Branch selector -->
      <div
        v-if="isMultiBranch && branches.length > 1"
        class="q-mb-md flex justify-center items-center"
      >
        <q-select
          v-model="selectedBranchId"
          :options="branchOptions"
          dense
          rounded
          outlined
          emit-value
          map-options
          class="branch-select"
        >
          <template #prepend>
            <q-icon name="location_on" size="18px" color="primary" />
          </template>
          <template #append>
            <q-icon name="unfold_more" size="16px" color="grey-6" />
          </template>
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.label }}</q-item-label>
                <q-item-label caption>{{ scope.opt.address ?? 'Dirección no disponible' }}</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
        <!-- D-17: link "Cómo llegar" junto al selector cuando ya hay sede elegida -->
        <q-btn
          v-if="mapsUrlForBranch(selectedBranchId)"
          flat
          dense
          no-caps
          size="sm"
          color="primary"
          label="Cómo llegar"
          class="q-ml-sm"
          @click="openBranchMaps(mapsUrlForBranch(selectedBranchId)!)"
        />
      </div>
      <p v-else class="branch-label">
        <q-icon name="location_on" size="14px" class="q-mr-xs" />
        {{ userStore.branchDisplayName }}
      </p>

      <!-- Phase 162 (APP-02): contador x/2 del plan especial — chip único dorado,
           visible sólo si el usuario tiene el plan especial. En 0/2 pasa a tono apagado. -->
      <div v-if="userStore.hasEspecialPass" class="especial-chip-row q-mb-md">
        <q-chip
          dense
          class="especial-chip"
          :class="{
            'especial-chip--exhausted':
              !userStore.especialUnlimited && userStore.especialClassesRemaining <= 0,
          }"
        >
          <q-icon name="auto_awesome" size="14px" class="q-mr-xs" />
          {{ especialChipLabel }}
        </q-chip>
      </div>

      <!-- Bonus usage banner (fixed plans only) -->
      <div v-if="bonusUsage.applicable" class="bonus-banner q-mb-md">
        <q-icon name="card_giftcard" size="18px" />
        <span class="bonus-banner__text">
          Clases bonus:
          <strong>{{ (bonusUsage.limit ?? 2) - (bonusUsage.used ?? 0) }}</strong>
          de {{ bonusUsage.limit ?? 2 }}
          <span v-if="bonusUsage.periodEnd" class="bonus-banner__period">
            · renueva el {{ formatBonusPeriodEnd(bonusUsage.periodEnd) }}
          </span>
        </span>
      </div>

      <!-- Next class hero card -->
      <div class="next-class-card q-mb-md">
        <div class="next-class-card__icon">
          <q-icon :name="nextBooking ? 'event' : 'event_available'" size="28px" color="primary" />
        </div>
        <div v-if="nextBooking" class="next-class-card__info">
          <p class="next-class-card__label">Próxima clase</p>
          <p class="next-class-card__activity">{{ nextBooking.activityName }}</p>
          <p class="next-class-card__time">
            {{ formatBookingDay(nextBooking) }} · {{ formatTime(nextBooking.startTime) }}
          </p>
        </div>
        <div v-else class="next-class-card__info">
          <p class="next-class-card__label">Próxima clase</p>
          <p class="next-class-card__activity-empty">Elegí un horario para reservar</p>
        </div>
        <q-btn
          v-if="nextBooking"
          flat
          round
          dense
          icon="close"
          color="negative"
          size="sm"
          @click="promptCancelBooking(nextBooking)"
        >
          <q-tooltip>Cancelar</q-tooltip>
        </q-btn>
      </div>

      <!-- Day selector strip -->
      <div class="day-strip q-mb-md">
        <div class="day-strip__nav">
          <q-btn flat dense round icon="chevron_left" size="sm" @click="changeWeek(-1)" />
          <q-btn flat dense no-caps class="day-strip__week-label" @click="goToCurrentWeek">
            {{ weekLabel }}
          </q-btn>
          <q-btn flat dense round icon="chevron_right" size="sm" @click="changeWeek(1)" />
        </div>
        <div class="day-strip__days">
          <button
            v-for="day in visibleDays"
            :key="day"
            class="day-pill"
            :class="{
              'day-pill--selected': selectedDay === day,
              'day-pill--today': isToday(day),
              'day-pill--has-booking': dayHasBooking(day),
              'day-pill--past': isDayPast(day),
            }"
            @click="selectedDay = day"
          >
            <span class="day-pill__abbrev">{{ DAY_LABELS[day] }}</span>
            <span class="day-pill__date">{{ dayDateNumber(day) }}</span>
            <span v-if="dayHasBooking(day)" class="day-pill__dot"></span>
          </button>
        </div>
      </div>

      <!-- Selected day's slots -->
      <div class="day-slots">
        <!-- Holiday banner -->
        <div v-if="selectedDayHoliday" class="day-slots__holiday">
          <q-icon name="celebration" size="20px" />
          <span>{{ selectedDayHoliday }}</span>
        </div>

        <!-- Morning section -->
        <template v-if="morningSlots.length > 0">
          <p v-if="afternoonSlots.length > 0" class="day-slots__period">Turno Mañana</p>
          <div
            v-for="slot in morningSlots"
            :key="slot.id"
            class="slot-card"
            :class="slotCardClass(slot)"
            @click="onSlotTap(slot)"
          >
            <div class="slot-card__time">
              <span class="slot-card__hour">{{ formatTime(slot.startTime) }}</span>
              <span
                class="slot-card__activity"
                :class="{ 'slot-card__activity--tappable': slot.activityDescription }"
                @click="onActivityNameTap(slot, $event)"
                >{{ slot.activityName }}</span
              >
              <!-- Phase 162 (APP-01): distintivo dorado en actividades especiales (todos los estados) -->
              <q-badge v-if="slot.isSpecial" class="slot-card__badge--special">
                <q-icon name="auto_awesome" size="12px" class="q-mr-xs" />Especial
              </q-badge>
            </div>
            <div class="slot-card__right">
              <template v-if="isSlotHoliday(slot)">
                <q-badge color="accent" label="Feriado" />
              </template>
              <template v-else-if="isSlotAttended(slot)">
                <q-icon name="verified" size="20px" color="positive" />
                <span class="slot-card__badge slot-card__badge--positive">Asististe</span>
              </template>
              <template v-else-if="isSlotBooked(slot)">
                <q-icon name="check_circle" size="20px" color="positive" />
                <span class="slot-card__badge slot-card__badge--positive">Reservado</span>
                <q-btn
                  flat
                  round
                  dense
                  icon="close"
                  color="negative"
                  size="sm"
                  @click.stop="cancelSlotBooking(slot)"
                >
                  <q-tooltip>Cancelar</q-tooltip>
                </q-btn>
              </template>
              <template v-else-if="slot.isFull && !slot.isSpecial">
                <span class="slot-card__avail slot-card__avail--full">Completo</span>
              </template>
              <template v-else-if="isSlotPast(slot)"></template>
              <!-- Phase 162 (APP-01): estados de la actividad especial. Se evalúan
                   DESPUÉS de holiday/attended/booked/full/past (que conservan prioridad).
                   Bloqueo en olive/grey, nunca rojo (no es error, es condición de acceso). -->
              <template v-else-if="slot.isSpecial && especialReservable">
                <!-- E1/E4: plan especial con saldo → flujo de reserva normal -->
                <span v-if="slot.isFull" class="slot-card__avail slot-card__avail--full"
                  >Completo</span
                >
                <template v-else>
                  <span
                    class="slot-card__avail"
                    :class="`slot-card__avail--${availabilityLevel(slot)}`"
                    >{{ availabilityText(slot) }}</span
                  >
                  <q-btn
                    flat
                    dense
                    no-caps
                    color="primary"
                    label="Reservar"
                    class="slot-card__action"
                    @click.stop="onSlotTap(slot)"
                  />
                </template>
              </template>
              <template v-else-if="slot.isSpecial && userStore.hasEspecialPass">
                <!-- E2: plan especial sin saldo (0/2) — pill apagada, sin botón -->
                <span class="slot-card__pill slot-card__pill--muted">Usaste tus 2 clases</span>
              </template>
              <template v-else-if="slot.isSpecial">
                <!-- E3: socio sin plan especial — afordancia informativa, abre el dialog al tocar -->
                <span class="slot-card__pill slot-card__pill--locked">
                  <q-icon name="lock" size="13px" class="q-mr-xs" />Requiere plan especial
                </span>
              </template>
              <template v-else>
                <span
                  class="slot-card__avail"
                  :class="`slot-card__avail--${availabilityLevel(slot)}`"
                  >{{ availabilityText(slot) }}</span
                >
                <q-btn
                  flat
                  dense
                  no-caps
                  color="primary"
                  label="Reservar"
                  class="slot-card__action"
                  @click.stop="onSlotTap(slot)"
                />
              </template>
            </div>
          </div>
        </template>

        <!-- Afternoon section -->
        <template v-if="afternoonSlots.length > 0">
          <p v-if="morningSlots.length > 0" class="day-slots__period">Turno Tarde</p>
          <div
            v-for="slot in afternoonSlots"
            :key="slot.id"
            class="slot-card"
            :class="slotCardClass(slot)"
            @click="onSlotTap(slot)"
          >
            <div class="slot-card__time">
              <span class="slot-card__hour">{{ formatTime(slot.startTime) }}</span>
              <span
                class="slot-card__activity"
                :class="{ 'slot-card__activity--tappable': slot.activityDescription }"
                @click="onActivityNameTap(slot, $event)"
                >{{ slot.activityName }}</span
              >
              <!-- Phase 162 (APP-01): distintivo dorado en actividades especiales (todos los estados) -->
              <q-badge v-if="slot.isSpecial" class="slot-card__badge--special">
                <q-icon name="auto_awesome" size="12px" class="q-mr-xs" />Especial
              </q-badge>
            </div>
            <div class="slot-card__right">
              <template v-if="isSlotHoliday(slot)">
                <q-badge color="accent" label="Feriado" />
              </template>
              <template v-else-if="isSlotAttended(slot)">
                <q-icon name="verified" size="20px" color="positive" />
                <span class="slot-card__badge slot-card__badge--positive">Asististe</span>
              </template>
              <template v-else-if="isSlotBooked(slot)">
                <q-icon name="check_circle" size="20px" color="positive" />
                <span class="slot-card__badge slot-card__badge--positive">Reservado</span>
                <q-btn
                  flat
                  round
                  dense
                  icon="close"
                  color="negative"
                  size="sm"
                  @click.stop="cancelSlotBooking(slot)"
                >
                  <q-tooltip>Cancelar</q-tooltip>
                </q-btn>
              </template>
              <template v-else-if="slot.isFull && !slot.isSpecial">
                <span class="slot-card__avail slot-card__avail--full">Completo</span>
              </template>
              <template v-else-if="isSlotPast(slot)"></template>
              <!-- Phase 162 (APP-01): estados de la actividad especial. Se evalúan
                   DESPUÉS de holiday/attended/booked/full/past (que conservan prioridad).
                   Bloqueo en olive/grey, nunca rojo (no es error, es condición de acceso). -->
              <template v-else-if="slot.isSpecial && especialReservable">
                <!-- E1/E4: plan especial con saldo → flujo de reserva normal -->
                <span v-if="slot.isFull" class="slot-card__avail slot-card__avail--full"
                  >Completo</span
                >
                <template v-else>
                  <span
                    class="slot-card__avail"
                    :class="`slot-card__avail--${availabilityLevel(slot)}`"
                    >{{ availabilityText(slot) }}</span
                  >
                  <q-btn
                    flat
                    dense
                    no-caps
                    color="primary"
                    label="Reservar"
                    class="slot-card__action"
                    @click.stop="onSlotTap(slot)"
                  />
                </template>
              </template>
              <template v-else-if="slot.isSpecial && userStore.hasEspecialPass">
                <!-- E2: plan especial sin saldo (0/2) — pill apagada, sin botón -->
                <span class="slot-card__pill slot-card__pill--muted">Usaste tus 2 clases</span>
              </template>
              <template v-else-if="slot.isSpecial">
                <!-- E3: socio sin plan especial — afordancia informativa, abre el dialog al tocar -->
                <span class="slot-card__pill slot-card__pill--locked">
                  <q-icon name="lock" size="13px" class="q-mr-xs" />Requiere plan especial
                </span>
              </template>
              <template v-else>
                <span
                  class="slot-card__avail"
                  :class="`slot-card__avail--${availabilityLevel(slot)}`"
                  >{{ availabilityText(slot) }}</span
                >
                <q-btn
                  flat
                  dense
                  no-caps
                  color="primary"
                  label="Reservar"
                  class="slot-card__action"
                  @click.stop="onSlotTap(slot)"
                />
              </template>
            </div>
          </div>
        </template>

        <!-- No slots -->
        <div
          v-if="morningSlots.length === 0 && afternoonSlots.length === 0"
          class="day-slots__empty"
        >
          <q-icon name="event_busy" size="40px" color="grey-4" />
          <p>No hay horarios este día</p>
        </div>
      </div>

      <p class="reservas__policy">
        Podés reservar desde hoy hasta 2 días en adelante, hasta 5 minutos antes del inicio de la
        clase. Las cancelaciones deben hacerse con al menos 20 minutos de anticipación.
      </p>

      <!-- Week activity summary (collapsible) -->
      <q-expansion-item
        class="week-summary q-mt-md"
        icon="history"
        label="Tu actividad esta semana"
        header-class="week-summary__header"
        dense
      >
        <q-list v-if="weekEvents.length > 0" separator class="week-summary__list">
          <q-item v-for="event in weekEvents" :key="event.key" dense>
            <q-item-section>
              <q-item-label class="text-weight-medium text-body2">
                {{ event.activityName }}
              </q-item-label>
              <q-item-label caption>{{ event.label }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-badge :color="event.badgeColor" :label="event.badgeLabel" />
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="q-pa-md text-center text-grey-6 text-body2">
          No tenés actividad esta semana
        </div>
      </q-expansion-item>
    </template>

    <!-- Reserve confirmation dialog -->
    <q-dialog v-model="reserveDialog.show" persistent>
      <q-card style="min-width: 300px">
        <q-card-section>
          <div class="text-h6">{{ reserveDialog.title }}</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          {{ reserveDialog.message }}
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey" v-close-popup />
          <q-btn
            flat
            :label="reserveDialog.confirmLabel"
            :color="reserveDialog.confirmColor"
            :loading="reserveDialog.loading"
            @click="confirmReserve"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Trial reserve confirmation dialog (no-cancel copy, D-03) -->
    <q-dialog v-model="trialDialog.show" persistent>
      <q-card style="min-width: 300px">
        <q-card-section>
          <div class="text-h6">Reservar tu sesión de prueba</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          {{ trialDialog.message }}
        </q-card-section>
        <q-card-section v-if="trialPhoneRequired" class="q-pt-none">
          <q-input
            v-model="trialDialog.phone"
            type="tel"
            inputmode="tel"
            label="Teléfono"
            outlined
            dense
            :rules="[
              (v) => (v ?? '').replace(/\D/g, '').length >= 6 || 'Ingresá un teléfono válido',
            ]"
            hint="Lo necesitamos para coordinar tu sesión de prueba"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey" v-close-popup />
          <q-btn
            flat
            label="Confirmar prueba"
            color="primary"
            :loading="trialDialog.loading"
            :disable="trialPhoneRequired && trialDialog.phone.replace(/\D/g, '').length < 6"
            @click="confirmTrialReserve"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Trial cancel confirmation dialog (D-03 revised, >24h only) -->
    <q-dialog v-model="trialCancelDialog" persistent>
      <q-card style="min-width: 300px">
        <q-card-section>
          <div class="text-h6">Cancelar tu sesión de prueba</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          ¿Seguro que querés cancelar tu sesión de prueba? Vas a poder reservar otra cuando quieras.
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="No, volver" color="grey" v-close-popup :disable="trialCancelLoading" />
          <q-btn
            flat
            label="Sí, cancelar"
            color="negative"
            :loading="trialCancelLoading"
            @click="confirmTrialCancel"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Partner free-week reserve confirmation dialog (Phase 179, D-05/D-06) -->
    <q-dialog v-model="partnerDialog.show" persistent>
      <q-card style="min-width: 300px">
        <q-card-section>
          <div class="text-h6">Arrancar tu semana de regalo</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          {{ partnerDialog.message }}
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey" v-close-popup :disable="partnerDialog.loading" />
          <q-btn
            flat
            label="Confirmar"
            color="primary"
            :loading="partnerDialog.loading"
            @click="confirmPartnerReserve"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Cancel confirmation dialog -->
    <q-dialog v-model="cancelDialog.show" persistent>
      <q-card style="min-width: 300px">
        <q-card-section>
          <div class="text-h6">Cancelar reserva</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          {{ cancelDialog.message }}
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Volver" color="grey" v-close-popup />
          <q-btn
            flat
            label="Cancelar reserva"
            color="negative"
            :loading="cancelDialog.loading"
            @click="confirmCancel"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Phase 144-04 (D-15): booking-block renewal dialog (COVERAGE_EXPIRED).
         NOT persistent — action-scoped, re-shows on every too-late retry. -->
    <q-dialog v-model="showCoverageDialog">
      <q-card class="coverage-dialog">
        <q-card-section class="coverage-dialog__body">
          <q-icon class="coverage-dialog__icon" name="event_busy" size="2.5em" />
          <h3 class="coverage-dialog__title">Necesitás renovar tu membresía</h3>
          <p class="coverage-dialog__text">
            Esta clase es posterior al vencimiento de tu plan. Renovalo por WhatsApp para poder
            reservarla.
          </p>
        </q-card-section>

        <q-card-actions class="coverage-dialog__actions">
          <q-btn
            unelevated
            no-caps
            class="coverage-dialog__primary full-width"
            label="Renovar por WhatsApp"
            @click="openCoverageWhatsApp"
          />
          <q-btn
            flat
            no-caps
            dense
            class="coverage-dialog__secondary"
            label="Entendido"
            v-close-popup
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Phase 162-05 (APP-03/D-02): dialog informativo de "Actividades con Aura".
         Se dispara desde E3 (tap en especial sin plan especial) y desde el backend
         (code PASS_REQUIRED). SIN pago in-app ni CTA de compra — la venta es por
         gestión/PoS. Un único botón "Entendido". Acento dorado (Aura). NOT persistent. -->
    <q-dialog v-model="showAuraInfoDialog">
      <q-card class="aura-dialog">
        <q-card-section class="aura-dialog__body">
          <q-icon class="aura-dialog__icon" name="auto_awesome" size="2.5em" />
          <h3 class="aura-dialog__title">Actividades con Aura</h3>
          <p class="aura-dialog__text">
            Son clases especiales de nuestros profes, además de tu plan. Con el plan especial
            reservás <strong>2 clases por mes</strong>.
          </p>
          <p class="aura-dialog__price">Socios: $10.000 · No socios: $20.000 por mes.</p>
          <p class="aura-dialog__text">Consultá en recepción o con tu profe para sumarte.</p>
        </q-card-section>

        <q-card-actions class="aura-dialog__actions">
          <q-btn
            unelevated
            no-caps
            class="aura-dialog__primary full-width"
            label="Entendido"
            v-close-popup
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Plan 180-13 (D-18): hoja de detalle de actividad, montada una sola vez. -->
    <ActivityInfoSheet
      :model-value="activitySheet !== null"
      :title="activitySheet?.title ?? ''"
      :description="activitySheet?.description ?? null"
      @update:model-value="onActivitySheetUpdate"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { useQuasar } from 'quasar'
import TemploLoader from 'src/components/TemploLoader.vue'
import BranchPickerDialog from 'src/components/BranchPickerDialog.vue'
import ActivityInfoSheet from 'src/components/ActivityInfoSheet.vue'
import { useSchedulingApi } from 'src/composables/useSchedulingApi'
import type { TrialEligibility, BranchOption, PartnerBenefitEligibility } from 'src/composables/useSchedulingApi'
import { useUserStore } from 'src/stores/useUserStore'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import type {
  WeeklySlotView,
  BookingRecord,
  HolidayRecord,
  AttendanceWeekRecord,
  DayOfWeek,
} from 'src/types/scheduling'
import { DAY_LABELS, DAY_LABELS_FULL, BOOKING_STATUS_LABELS } from 'src/types/scheduling'
import { todayInTz, dowInTz, zonedWallClockToUtc, isWallClockPast } from 'src/utils/tz'
import { buildWhatsAppUrl } from 'src/utils/whatsapp'
import { buildGoogleCalendarUrl } from 'src/utils/calendar-link'

const $q = useQuasar()
const log = createLogger('ReservasV2')
const userStore = useUserStore()
const {
  getWeeklyGrid,
  reserve,
  cancelBooking,
  getBranches,
  getBonusUsage,
  getTrialEligibility,
  reserveTrial,
  cancelTrial,
  getPartnerBenefit,
  reservePartnerWeek,
  cleanup,
} = useSchedulingApi()
const bonusUsage = ref<{
  applicable: boolean
  used?: number
  limit?: number
  periodEnd?: string
}>({ applicable: false })

// ─── State ───────────────────────────────────────────────────────────
const loading = ref(true)
const slots = ref<WeeklySlotView[]>([])
const holidays = ref<HolidayRecord[]>([])
const myBookings = ref<BookingRecord[]>([])
const myAttendance = ref<AttendanceWeekRecord[]>([])
// Default to AR until the API returns the viewing branch's timezone.
// The first loadGrid() overwrites this before any TZ-sensitive computation
// renders for the user's actual branch.
const branchTimezone = ref<string>('America/Argentina/Buenos_Aires')
const weekStart = ref<Date>(getMondayInTz(branchTimezone.value))
const selectedDay = ref<DayOfWeek>(getTodayDow(branchTimezone.value))

// ─── Multi-branch ───────────────────────────────────────────────────
const branches = ref<BranchOption[]>([])
const selectedBranchId = ref<number | null>(null)
const hasActiveButNotPresencial = computed(
  () => userStore.hasActiveSubscription && !userStore.hasPresencialPlan,
)

// Phase 162 (D-06): gate de página refinado. El externo-solo-pase (hasEspecialPass sin
// presencial) también pasa — entra a la grilla filtrada a especiales (E5). El socio con
// presencial mantiene su acceso completo. Corrige el gate todo-o-nada (Pitfall 1).
const canAccessGrid = computed(
  () => userStore.hasPresencialReservationAccess || userStore.hasEspecialPass,
)

// E1/E4: hay saldo del plan especial para reservar (user-level, no depende del slot).
const especialReservable = computed(
  () =>
    userStore.hasEspecialPass &&
    (userStore.especialUnlimited || userStore.especialClassesRemaining > 0),
)

// Chip contador. Ilimitado → "Ilimitado"; con cupo x/budget; en 0/budget copy apagado.
const especialChipLabel = computed(() => {
  if (userStore.especialUnlimited) return 'Especiales · Ilimitado'
  return userStore.especialClassesRemaining <= 0
    ? `Especiales · 0/${userStore.especialClassesBudget} · se renuevan el próximo mes`
    : `Especiales · ${userStore.especialClassesRemaining}/${userStore.especialClassesBudget}`
})

// Differentiated empty-state copy: "no plan at all" vs "wrong plan type".
const emptyTitle = computed(() =>
  hasActiveButNotPresencial.value ? 'Reservas presenciales' : 'Activá Tu Plan',
)
const emptyText = computed(() =>
  hasActiveButNotPresencial.value
    ? 'Las reservas son para planes presenciales. Tu plan actual no las incluye.'
    : 'No tenés un plan activo. Consultá por tu plan para comenzar a entrenar.',
)

function openWhatsApp(): void {
  const message = 'Hola, quiero consultar por los planes de entrenamiento'
  window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, message), '_blank')
}
const isMultiBranch = computed(() => userStore.subscription?.multiBranch ?? false)
// El nombre de sede ya viene normalizado desde el server (`appBranchName`,
// shared/app-branch-name.ts): el helper prefija la marca del tenant cuando
// corresponde. Se elimina el replace() que hacía este mismo trabajo del lado
// del front para no tener dos normalizadores del mismo nombre (plan 180-05,
// Task 1).
const branchOptions = computed(() =>
  branches.value.map((b) => ({
    label: b.name,
    value: b.id,
    address: b.address,
    mapsUrl: b.mapsUrl,
  })),
)

// ─── Trial mode (Phase 119, D-20/D-22) ──────────────────────────────
// Eligibility comes from the backend ONLY (server-side state is the sole
// authorization — the campaign email token never authorizes, D-21).
const TRIAL_WINDOW_DAYS = 30
const trialEligibility = ref<TrialEligibility | null>(null)
const trialBranchId = ref<number | null>(null)

const trialEligible = computed(
  () => trialEligibility.value?.eligible === true && !trialEligibility.value?.alreadyBooked,
)
const trialBooking = computed(() =>
  trialEligibility.value?.alreadyBooked ? (trialEligibility.value.booking ?? null) : null,
)
const isTrialMode = computed(() => trialEligible.value)

// "¿Primera vez? Qué esperar" (D-16): copy ESTÁTICO, sin llamadas a la API.
// Fuente única — se referencia (v-for) tanto en el estado "modo prueba" como en
// "prueba reservada" para no duplicar el texto en dos lugares del template.
interface FirstTimerItem {
  icon: string
  text: string
}
const FIRST_TIMER_ITEMS: FirstTimerItem[] = [
  { icon: 'schedule', text: 'La clase dura 1 hora.' },
  { icon: 'checkroom', text: 'Ropa cómoda y agua.' },
  { icon: 'directions_walk', text: 'Llegá 10 minutos antes.' },
  { icon: 'record_voice_over', text: 'Preguntá por el profe cuando llegues.' },
]

// Popup de elección de sede (D-07/D-08/D-09, plan 180-05): se abre UNA vez al
// entrar a Reservas en modo prueba sin sede elegida y con sedes ya cargadas
// (ver onMounted). Elegir o descartar lo cierra y no se reabre solo — el
// q-select existente queda como la única vía para cambiar de sede después.
const showBranchPicker = ref(false)

function onBranchPickerSelect(id: number): void {
  trialBranchId.value = id
}

/** Link "Cómo llegar" (D-17) de la sede actualmente elegida en un selector. */
function mapsUrlForBranch(branchId: number | null): string | null {
  return branchOptions.value.find((o) => o.value === branchId)?.mapsUrl ?? null
}

/** Abre un link de Maps (selector de sede o "Cómo llegar" de la confirmación de prueba). */
function openBranchMaps(mapsUrl: string): void {
  log.info('Cómo llegar → abre Maps', { mapsUrl })
  window.open(mapsUrl, '_blank', 'noopener')
}

const trialConfirmationBody = computed(() => {
  const b = trialBooking.value
  if (!b) return ''
  const d = new Date(b.date + 'T00:00:00')
  const dayLabel = DAY_LABELS_FULL[((d.getDay() === 0 ? 7 : d.getDay()) as DayOfWeek) ?? 1] ?? ''
  const dateStr = `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`
  const timeStr = formatTime(b.startTime)
  const sede = b.branchAddress ? `${b.branchName} (${b.branchAddress})` : b.branchName
  return `Te esperamos el ${dayLabel} ${dateStr} a las ${timeStr} en ${sede}. ¡Llegá unos minutos antes!`
})

// D-20: botón primario "Agregar al calendario" de la confirmación de prueba
// (estado "prueba reservada"). Usa branchTimezone del booking (la SEDE, no un
// default de página — T-180-33): este estado nunca corre loadGrid().
function onAddTrialToCalendar(): void {
  const b = trialBooking.value
  if (!b) return
  const url = buildGoogleCalendarUrl({
    date: b.date,
    startTime: b.startTime,
    timezone: b.branchTimezone,
    branchName: b.branchName,
    branchAddress: b.branchAddress,
  })
  log.info('Agregar al calendario (prueba)', { url })
  window.open(url, '_blank', 'noopener')
}

// 30-day forward bound for the trial grid (D-05): disable navigating past a week
// whose Monday is already beyond today+30d.
const canGoForward = computed(() => {
  if (!isTrialMode.value) return true
  const today = todayInTz(branchTimezone.value)
  const [y, m, d] = today.split('-').map(Number)
  const maxDate = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0))
  maxDate.setUTCDate(maxDate.getUTCDate() + TRIAL_WINDOW_DAYS)
  // The Monday of the week AFTER the currently shown week:
  const nextWeekMonday = new Date(weekStart.value)
  nextWeekMonday.setUTCDate(nextWeekMonday.getUTCDate() + 7)
  return nextWeekMonday <= maxDate
})

const trialDialog = ref({
  show: false,
  message: '',
  loading: false,
  scheduleId: 0,
  date: '',
  // Teléfono capturado en el diálogo cuando eligibility.phoneRequired (D-05).
  phone: '',
})

// True cuando el perfil del lead no tiene teléfono: el diálogo debe pedirlo (D-05).
const trialPhoneRequired = computed(() => trialEligibility.value?.phoneRequired === true)

function openTrialWhatsApp(): void {
  const message = 'Hola, necesito cambiar mi sesión de prueba'
  window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, message), '_blank')
}

// ─── Partner free-week mode (Phase 179, D-05/D-06/D-07) ──────────────
// Eligibility comes from the backend ONLY, same principle as trial (D-21
// equivalent). D-18 (backend, 179-08) guarantees a socio never has
// trialEligible AND a pending/consumed partner benefit at the same time, so
// this block never needs to branch on trial state — only the template's
// v-else-if ORDER coordinates the two (D-05/D-06/D-07/D-19 truths).
const partnerBenefit = ref<PartnerBenefitEligibility | null>(null)

const partnerBenefitEligible = computed(() => partnerBenefit.value?.eligible === true)
const partnerBenefitExpired = computed(
  () => partnerBenefit.value?.eligible === false && partnerBenefit.value.reason === 'expirado',
)
// Reuses trialBranchId as the sede selector for the grid (safe under D-18:
// never both active at once) — the freemium and partner-pending flows share
// the exact same "pick a sede, then a slot" grid mechanics.
const isPartnerWeekMode = computed(() => partnerBenefitEligible.value)

const partnerBenefitExpiresLabel = computed(() =>
  partnerBenefit.value?.eligible ? formatDateLabel(partnerBenefit.value.expiresAt) : '',
)

async function loadPartnerBenefit() {
  try {
    partnerBenefit.value = await getPartnerBenefit()
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'CanceledError') return
    // Non-critical — if eligibility can't be resolved, fall back to the
    // existing presencial/muro/trial branching (partnerBenefitEligible stays false).
    partnerBenefit.value = null
    log.warn('Failed to load partner benefit', { error: extractError(err, 'unknown') })
  }
}

// ─── Dialogs ────────────────────────────────────────────────────────
const reserveDialog = ref({
  show: false,
  title: '',
  message: '',
  confirmLabel: 'Confirmar',
  confirmColor: 'primary',
  loading: false,
  scheduleId: 0,
  date: '',
  cancelFirst: null as number | null,
})

// Phase 144-04 (BOOK-BLOCK, D-15): booking-block renewal dialog, opened only
// when the API rejects a reserve with code COVERAGE_EXPIRED (plan expired before
// the class date). Action-scoped — NOT persisted, re-shows on every retry.
const showCoverageDialog = ref(false)

// Phase 162-05 (APP-03/D-02): dialog informativo del plan especial. Se abre desde E3
// (tap en una especial sin plan) y desde el catch de confirmReserve ante code
// PASS_REQUIRED (espejo de COVERAGE_EXPIRED). Informativo, SIN pago in-app.
const showAuraInfoDialog = ref(false)

// Plan 180-13 (D-18/RES-05): hoja de detalle de actividad. El título viaja
// TAL CUAL la etiqueta visible del slot (activityName, ya derivada server-side
// por 180-10) — nunca se busca la descripción por el id de la actividad en el
// cliente (T-180-61).
const activitySheet = ref<{ title: string; description: string } | null>(null)

function onActivityNameTap(slot: WeeklySlotView, event: Event): void {
  if (!slot.activityDescription) return
  // No debe disparar la acción de reservar/abrir el slot del contenedor padre.
  event.stopPropagation()
  activitySheet.value = { title: slot.activityName, description: slot.activityDescription }
}

function onActivitySheetUpdate(value: boolean): void {
  if (!value) activitySheet.value = null
}

function openCoverageWhatsApp(): void {
  const message = 'Hola, quiero renovar mi membresía para reservar una clase 💪'
  window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, message), '_blank')
  showCoverageDialog.value = false
}

const cancelDialog = ref({
  show: false,
  message: '',
  loading: false,
  bookingId: 0,
})

// Partner free-week reserve dialog (Phase 179, D-05/D-06) — no phone capture,
// unlike trialDialog: the socio already has a phone on file by the time they
// have a partner benefit (it comes from a real registration, not a lead).
const partnerDialog = ref({
  show: false,
  message: '',
  loading: false,
  scheduleId: 0,
  date: '',
})

// ─── Helpers ────────────────────────────────────────────────────────

const MONTH_ABBREV = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
]

/**
 * Build a UTC-noon Date whose UTC date equals the Monday of the week
 * containing "today" in the given timezone. Using UTC-noon as the anchor
 * means date arithmetic via setUTCDate() and toISOString().slice(0,10)
 * stays stable across DST transitions and never drifts across day
 * boundaries due to the browser's local timezone.
 */
function getMondayInTz(tz: string): Date {
  const today = todayInTz(tz)
  const [y, m, d] = today.split('-').map(Number)
  const isoDow = dowInTz(tz) // 1=Mon ... 7=Sun
  // Sunday: show next week's Monday (tomorrow).
  const diff = isoDow === 7 ? 1 : 1 - isoDow
  const anchor = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0))
  anchor.setUTCDate(anchor.getUTCDate() + diff)
  return anchor
}

function getTodayDow(tz: string): DayOfWeek {
  const iso = dowInTz(tz)
  // Sunday (7) defaults to Monday since the schedule grid is Mon–Sat.
  return (iso === 7 ? 1 : iso) as DayOfWeek
}

function formatWeekStart(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function dateForDay(day: DayOfWeek): string {
  const d = new Date(weekStart.value)
  d.setUTCDate(d.getUTCDate() + (day - 1))
  return d.toISOString().slice(0, 10)
}

function dayDateNumber(day: DayOfWeek): string {
  const d = new Date(weekStart.value)
  d.setUTCDate(d.getUTCDate() + (day - 1))
  return String(d.getUTCDate())
}

function formatTime(time: string): string {
  const parts = time.split(':')
  const hour = parseInt(parts[0], 10)
  return `${hour}:${parts[1]}`
}

function formatBonusPeriodEnd(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/** "22 Sep" — used for the partner benefit expiry date and the free-week end date. */
function formatDateLabel(isoDate: string): string {
  const d = new Date(isoDate.slice(0, 10) + 'T12:00:00')
  return `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`
}

function isToday(day: DayOfWeek): boolean {
  return dateForDay(day) === todayInTz(branchTimezone.value)
}

function isDayPast(day: DayOfWeek): boolean {
  return dateForDay(day) < todayInTz(branchTimezone.value)
}

// ─── Computed ───────────────────────────────────────────────────────

const visibleDays = computed<DayOfWeek[]>(() => {
  const days = new Set<DayOfWeek>()
  for (const slot of slots.value) {
    days.add(slot.dayOfWeek as DayOfWeek)
  }
  if (days.size > 0) {
    for (let d = 1; d <= 5; d++) days.add(d as DayOfWeek)
    return Array.from(days).sort((a, b) => a - b) as DayOfWeek[]
  }
  return [1, 2, 3, 4, 5] as DayOfWeek[]
})

const weekLabel = computed(() => {
  const monthNames = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ]
  // weekStart is anchored at UTC noon so calendar math uses UTC methods —
  // see getMondayInTz() for why.
  const start = weekStart.value
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + (visibleDays.value.includes(6 as DayOfWeek) ? 5 : 4))

  const firstDay = start.getUTCDate()
  const firstMonth = monthNames[start.getUTCMonth()]
  const lastDay = end.getUTCDate()
  const lastMonth = monthNames[end.getUTCMonth()]

  if (firstMonth === lastMonth) {
    return `${firstDay} al ${lastDay} de ${firstMonth}`
  }
  return `${firstDay} de ${firstMonth} al ${lastDay} de ${lastMonth}`
})

/** Lookup maps */
const bookedScheduleIds = computed(() => {
  const ids = new Set<number>()
  for (const b of myBookings.value) {
    if (['reservado', 'qr_escaneado', 'confirmado', 'lista_espera'].includes(b.status)) {
      ids.add(b.scheduleId)
    }
  }
  return ids
})

const holidayDates = computed(() => {
  const dates = new Set<string>()
  for (const h of holidays.value) dates.add(h.date)
  return dates
})

const attendedSlotKeys = computed(() => {
  const keys = new Set<string>()
  for (const att of myAttendance.value) {
    const attDate = new Date(att.checkedInAt).toISOString().slice(0, 10)
    keys.add(`${att.scheduleId}-${attDate}`)
  }
  return keys
})

/** Slots for selected day, sorted by time.
 *  Phase 162 (E5, D-06): el externo-solo-pase ve la grilla LIMITADA a especiales — las
 *  regulares se ocultan client-side (el backend igual las rechaza — GATE-04). El socio
 *  presencial ve todo (hasOnlyEspecialPass=false) y no pierde nada de su vista actual. */
const selectedDaySlots = computed(() => {
  const onlyEspecial = userStore.hasOnlyEspecialPass
  return slots.value
    .filter((s) => s.dayOfWeek === selectedDay.value)
    .filter((s) => !onlyEspecial || s.isSpecial)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
})

const morningSlots = computed(() => selectedDaySlots.value.filter((s) => s.startTime < '12:00:00'))
const afternoonSlots = computed(() =>
  selectedDaySlots.value.filter((s) => s.startTime >= '12:00:00'),
)

const selectedDayHoliday = computed(() => {
  const date = dateForDay(selectedDay.value)
  const h = holidays.value.find((hol) => hol.date === date)
  return h?.name ?? null
})

/** Next upcoming active booking (evaluated in the branch's timezone) */
const nextBooking = computed<BookingRecord | null>(() => {
  const now = new Date()
  const tz = branchTimezone.value
  return (
    myBookings.value
      .filter((b) => {
        if (b.status !== 'reservado' && b.status !== 'qr_escaneado' && b.status !== 'lista_espera')
          return false
        return zonedWallClockToUtc(b.bookingDate, b.startTime, tz) > now
      })
      .sort((a, b) => {
        const da = `${a.bookingDate}T${a.startTime}`
        const db = `${b.bookingDate}T${b.startTime}`
        return da.localeCompare(db)
      })[0] ?? null
  )
})

// ─── Day pill helpers ───────────────────────────────────────────────

function dayHasBooking(day: DayOfWeek): boolean {
  const date = dateForDay(day)
  return myBookings.value.some(
    (b) =>
      b.bookingDate === date &&
      ['reservado', 'qr_escaneado', 'confirmado', 'lista_espera'].includes(b.status),
  )
}

// ─── Slot state helpers ─────────────────────────────────────────────

function isSlotBooked(slot: WeeklySlotView): boolean {
  return bookedScheduleIds.value.has(slot.id)
}

function findBookingForSlot(slot: WeeklySlotView): BookingRecord | null {
  const date = dateForDay(slot.dayOfWeek as DayOfWeek)
  return (
    myBookings.value.find(
      (b) =>
        b.scheduleId === slot.id &&
        b.bookingDate === date &&
        ['reservado', 'qr_escaneado', 'lista_espera'].includes(b.status),
    ) ?? null
  )
}

function cancelSlotBooking(slot: WeeklySlotView) {
  const booking = findBookingForSlot(slot)
  if (booking) promptCancelBooking(booking)
}

function isSlotAttended(slot: WeeklySlotView): boolean {
  const date = dateForDay(slot.dayOfWeek as DayOfWeek)
  return attendedSlotKeys.value.has(`${slot.id}-${date}`)
}

function isSlotHoliday(slot: WeeklySlotView): boolean {
  if (slot.isHoliday) return true
  const date = dateForDay(slot.dayOfWeek as DayOfWeek)
  return holidayDates.value.has(date)
}

function isSlotPast(slot: WeeklySlotView): boolean {
  const date = dateForDay(slot.dayOfWeek as DayOfWeek)
  return isWallClockPast(date, slot.startTime, branchTimezone.value)
}

function slotCardClass(slot: WeeklySlotView): Record<string, boolean> {
  return {
    'slot-card--booked': isSlotBooked(slot) && !isSlotAttended(slot),
    'slot-card--attended': isSlotAttended(slot),
    'slot-card--full': slot.isFull && !isSlotBooked(slot) && !isSlotAttended(slot),
    'slot-card--holiday': isSlotHoliday(slot),
    'slot-card--past': isSlotPast(slot) && !isSlotBooked(slot) && !isSlotAttended(slot),
    'slot-card--available':
      !slot.isFull &&
      !isSlotBooked(slot) &&
      !isSlotAttended(slot) &&
      !isSlotHoliday(slot) &&
      !isSlotPast(slot),
  }
}

// ─── Availability tier ──────────────────────────────────────────────
// Mirrors the admin Horarios grid thresholds (HorariosPage.vue cellClass):
// 1 lugar → 'last' (pill NARANJA), 2-4 → 'few' (pill amarilla), 5+ →
// 'available' (verde), 0 → 'full'. Umbral ABSOLUTO (no porcentual) para que el
// aviso sea consistente sin importar el tamaño de la clase.
//
// Copy (pedido de negocio): cuando hay lugar de sobra la etiqueta muestra
// cuánta gente YA reservó ("N personas anotadas" = prueba social); cuando queda
// poco lugar pasa a mostrar los lugares RESTANTES ("Quedan N lugares" =
// urgencia). El color sale del CSS por nivel.
type AvailabilityLevel = 'available' | 'few' | 'last' | 'full'

const FEW_THRESHOLD = 5

function spotsLeft(slot: WeeklySlotView): number {
  return Math.max(0, slot.maxCapacity - slot.bookedCount)
}

function availabilityLevel(slot: WeeklySlotView): AvailabilityLevel {
  const left = spotsLeft(slot)
  if (slot.isFull || left <= 0) return 'full'
  if (left === 1) return 'last'
  if (left < FEW_THRESHOLD) return 'few'
  return 'available'
}

function availabilityText(slot: WeeklySlotView): string {
  const level = availabilityLevel(slot)
  if (level === 'full') return 'Completo'
  if (level === 'last') return 'Queda 1 lugar'
  if (level === 'few') return `Quedan ${spotsLeft(slot)} lugares`
  // 'available': prueba social — cuántos ya se anotaron.
  const booked = Math.max(0, slot.bookedCount)
  if (booked === 1) return '1 persona anotada'
  return `${booked} personas anotadas`
}

// ─── Week events (for collapsible summary) ──────────────────────────

interface WeekEvent {
  key: string
  activityName: string
  label: string
  badgeColor: string
  badgeLabel: string
}

const weekEvents = computed<WeekEvent[]>(() => {
  const now = new Date()
  const events: WeekEvent[] = []

  for (const att of myAttendance.value) {
    const checkedIn = new Date(att.checkedInAt)
    const dateStr = checkedIn.toISOString().slice(0, 10)
    const dayLabel = DAY_LABELS_FULL[att.dayOfWeek as DayOfWeek] ?? ''
    const d = new Date(dateStr + 'T00:00:00')
    const dateLabel = `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`
    events.push({
      key: `att-${att.id}`,
      activityName: att.activityName,
      label: `${dayLabel} ${dateLabel} - ${formatTime(att.startTime)}`,
      badgeColor: att.status === 'confirmado' ? 'positive' : 'info',
      badgeLabel: att.status === 'confirmado' ? 'Asististe' : 'Check-in',
    })
  }

  for (const b of myBookings.value) {
    if (b.status === 'cancelado') continue
    const hasAtt = myAttendance.value.some((att) => {
      const attDate = new Date(att.checkedInAt).toISOString().slice(0, 10)
      return att.scheduleId === b.scheduleId && attDate === b.bookingDate
    })
    if (hasAtt) continue

    const isPast = zonedWallClockToUtc(b.bookingDate, b.startTime, branchTimezone.value) <= now
    if (isPast && b.status !== 'confirmado' && b.status !== 'no_show') continue

    const dayLabel = DAY_LABELS_FULL[b.dayOfWeek as DayOfWeek] ?? ''
    const d = new Date(b.bookingDate + 'T00:00:00')
    const dateStr = `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`

    let badgeColor: string
    let badgeLabel: string
    if (b.status === 'no_show') {
      badgeColor = 'negative'
      badgeLabel = BOOKING_STATUS_LABELS.no_show
    } else if (b.status === 'confirmado') {
      badgeColor = 'positive'
      badgeLabel = 'Asististe'
    } else {
      badgeColor = b.status === 'reservado' || b.status === 'qr_escaneado' ? 'primary' : 'warning'
      badgeLabel =
        b.status === 'lista_espera' && b.waitlistPosition !== null
          ? `${BOOKING_STATUS_LABELS.lista_espera} (#${b.waitlistPosition})`
          : (BOOKING_STATUS_LABELS[b.status] ?? b.status)
    }

    events.push({
      key: `bk-${b.id}`,
      activityName: b.activityName,
      label: `${dayLabel} ${dateStr} - ${formatTime(b.startTime)}`,
      badgeColor,
      badgeLabel,
    })
  }

  return events
})

// ─── Booking flow ───────────────────────────────────────────────────

function formatBookingDay(booking: BookingRecord): string {
  const dayLabel = DAY_LABELS_FULL[booking.dayOfWeek as DayOfWeek] ?? ''
  const d = new Date(booking.bookingDate + 'T00:00:00')
  return `${dayLabel} ${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`
}

function onSlotTap(slot: WeeklySlotView) {
  if (isSlotHoliday(slot)) return
  if (isSlotBooked(slot)) return
  if (isSlotAttended(slot)) return
  if (isSlotPast(slot)) return

  // Phase 162 (APP-01): estados del plan especial. E3 (sin plan) → dialog informativo;
  // E2 (0/2) → toast; E1 (con saldo) cae al flujo de reserva normal de abajo.
  if (slot.isSpecial) {
    if (!userStore.hasEspecialPass) {
      showAuraInfoDialog.value = true
      return
    }
    if (!userStore.especialUnlimited && userStore.especialClassesRemaining <= 0) {
      $q.notify({
        type: 'info',
        message: 'Ya usaste tus accesos especiales del mes. Se renuevan con tu próximo período.',
        timeout: 3000,
      })
      return
    }
  }

  const date = dateForDay(slot.dayOfWeek as DayOfWeek)
  const dayLabel = DAY_LABELS_FULL[slot.dayOfWeek as DayOfWeek]
  const d = new Date(date + 'T00:00:00')
  const dateStr = `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`
  const timeStr = formatTime(slot.startTime)

  // El choque diario es POR CATEGORÍA, igual que la guarda 8b del server: una
  // especial (pase Aura) no colisiona con una regular del mismo día — el socio
  // puede tener ROM el sábado y la clase con Aura ese mismo sábado. Sin este
  // filtro la app ofrecía "Cambiar horario" y le cancelaba la otra reserva.
  const existingBooking = myBookings.value.find(
    (b) =>
      b.bookingDate === date &&
      b.isSpecial === slot.isSpecial &&
      ['reservado', 'qr_escaneado', 'confirmado', 'lista_espera'].includes(b.status),
  )

  if (existingBooking) {
    const existingTime = formatTime(existingBooking.startTime)
    reserveDialog.value = {
      show: true,
      title: 'Cambiar horario',
      message: `Ya tenés una reserva el ${dayLabel} ${dateStr} a las ${existingTime}. Querés cambiarla por las ${timeStr}?`,
      confirmLabel: 'Cambiar',
      confirmColor: 'primary',
      loading: false,
      scheduleId: slot.id,
      date,
      cancelFirst: existingBooking.id,
    }
  } else if (slot.isFull) {
    reserveDialog.value = {
      show: true,
      title: 'Horario completo',
      message: `Este horario está completo. Querés anotarte en la lista de espera?`,
      confirmLabel: 'Lista de espera',
      confirmColor: 'warning',
      loading: false,
      scheduleId: slot.id,
      date,
      cancelFirst: null,
    }
  } else {
    reserveDialog.value = {
      show: true,
      title: 'Reservar',
      message: `Reservar ${slot.activityName} ${dayLabel} ${dateStr} ${timeStr}?`,
      confirmLabel: 'Confirmar',
      confirmColor: 'primary',
      loading: false,
      scheduleId: slot.id,
      date,
      cancelFirst: null,
    }
  }
}

async function confirmReserve() {
  reserveDialog.value.loading = true
  try {
    if (reserveDialog.value.cancelFirst) {
      await cancelBooking(reserveDialog.value.cancelFirst)
    }
    const booking = await reserve(reserveDialog.value.scheduleId, reserveDialog.value.date)
    reserveDialog.value.show = false

    if (booking.status === 'lista_espera') {
      $q.notify({
        type: 'warning',
        message: `Te anotaste en la lista de espera (posicion #${booking.waitlistPosition})`,
      })
    } else {
      $q.notify({
        type: 'positive',
        message: reserveDialog.value.cancelFirst ? 'Horario cambiado' : 'Reserva confirmada',
      })
    }
    await loadGrid()
    // Phase 162 (Pitfall 3): recargar el pase para que el contador x/2 no mienta
    // tras consumir una clase especial.
    await userStore.loadEspecialPass()
  } catch (err: unknown) {
    // Phase 144-04 (D-15): a class dated after the member's covered-until is
    // rejected with code COVERAGE_EXPIRED — show the renewal dialog instead of
    // the generic negative notify. All OTHER reserve errors keep the existing
    // extractError/$q.notify path unchanged.
    if (axios.isAxiosError(err) && err.response?.data?.code === 'COVERAGE_EXPIRED') {
      reserveDialog.value.show = false
      showCoverageDialog.value = true
      log.info('Reserve blocked: membership coverage expired')
      return
    }
    // Phase 162-05 (APP-03): reserva de especial sin plan → code PASS_REQUIRED
    // (161-06). Espeja COVERAGE_EXPIRED: abre el dialog informativo, sin pago (D-02).
    if (axios.isAxiosError(err) && err.response?.data?.code === 'PASS_REQUIRED') {
      reserveDialog.value.show = false
      showAuraInfoDialog.value = true
      log.info('Reserve blocked: especial pass required')
      return
    }
    const message = extractError(err, 'Error al reservar')
    $q.notify({ type: 'negative', message })
    log.warn('Reserve failed', { error: message })
  } finally {
    reserveDialog.value.loading = false
  }
}

// ─── Trial reserve flow (Phase 119, D-03) ───────────────────────────

function onTrialSlotTap(slot: WeeklySlotView) {
  if (isSlotHoliday(slot)) return
  if (isSlotPast(slot)) return
  if (slot.isFull) return

  const date = dateForDay(slot.dayOfWeek as DayOfWeek)
  const dayLabel = DAY_LABELS_FULL[slot.dayOfWeek as DayOfWeek]
  const d = new Date(date + 'T00:00:00')
  const dateStr = `${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`
  const timeStr = formatTime(slot.startTime)
  const sede =
    branchOptions.value.find((o) => o.value === trialBranchId.value)?.label ?? 'la sede elegida'

  // The 24h change/cancel window is decided server-side; here we only pick the
  // matching confirmation copy. <24h away (typically same-day) → locked.
  const classStart = zonedWallClockToUtc(date, slot.startTime, branchTimezone.value)
  const modifiable = classStart.getTime() - Date.now() >= 24 * 60 * 60 * 1000
  const policyLine = modifiable
    ? 'Podés cancelar o cambiar hasta 24 horas antes.'
    : 'Como falta menos de 24 horas, no se va a poder cancelar ni cambiar.'

  trialDialog.value = {
    show: true,
    message: `¿Reservar ${slot.activityName} el ${dayLabel} ${dateStr} a las ${timeStr} en ${sede}? Es tu única sesión de prueba. ${policyLine}`,
    loading: false,
    scheduleId: slot.id,
    date,
    phone: '',
  }
}

async function confirmTrialReserve() {
  if (!trialBranchId.value) return
  // Si el perfil no tiene teléfono, es condición para reservar (D-05). WR-04:
  // exigimos al menos 6 dígitos (no solo no-vacío) para no alimentar el bypass
  // del backend. El backend igual rechaza, pero evitamos el round-trip inútil.
  if (trialPhoneRequired.value && trialDialog.value.phone.replace(/\D/g, '').length < 6) {
    $q.notify({ type: 'warning', message: 'Ingresá un teléfono válido para reservar la prueba' })
    return
  }
  trialDialog.value.loading = true
  try {
    await reserveTrial(
      trialDialog.value.scheduleId,
      trialDialog.value.date,
      trialBranchId.value,
      trialDialog.value.phone.trim() || undefined,
    )
    trialDialog.value.show = false
    $q.notify({ type: 'positive', message: 'Tu sesión de prueba está reservada' })
    // Re-fetch eligibility so the page flips to the confirmation card (state 3).
    await loadTrialEligibility()
  } catch (err: unknown) {
    const message = extractError(
      err,
      'No pudimos reservar tu sesión de prueba. Probá de nuevo o escribinos por WhatsApp.',
    )
    $q.notify({ type: 'negative', message })
    log.warn('Trial reserve failed', { error: message })
  } finally {
    trialDialog.value.loading = false
  }
}

// ─── Trial change / cancel (Phase 119, D-03 revised) ────────────────
// Both go through the same cancel endpoint (prueba→freemium). "Change" then
// drops the user back onto the grid to rebook; "Cancel" just confirms.

const trialCancelLoading = ref(false)
const trialCancelDialog = ref(false)

/** Cancel the trial booking; returns true on success. Errors are surfaced. */
async function cancelTrialBooking(): Promise<boolean> {
  trialCancelLoading.value = true
  try {
    await cancelTrial()
    await loadTrialEligibility()
    return true
  } catch (err: unknown) {
    const message = extractError(
      err,
      'No pudimos cancelar tu sesión de prueba. Probá de nuevo o escribinos por WhatsApp.',
    )
    $q.notify({ type: 'negative', message })
    log.warn('Trial cancel failed', { error: message })
    return false
  } finally {
    trialCancelLoading.value = false
  }
}

async function onChangeTrial() {
  const ok = await cancelTrialBooking()
  if (ok) {
    // loadTrialEligibility flipped the user back to freemium → the grid shows.
    $q.notify({ type: 'info', message: 'Elegí tu nuevo horario de prueba' })
  }
}

function openTrialCancelDialog() {
  trialCancelDialog.value = true
}

async function confirmTrialCancel() {
  const ok = await cancelTrialBooking()
  trialCancelDialog.value = false
  if (ok) {
    $q.notify({
      type: 'positive',
      message: 'Tu sesión de prueba fue cancelada. Podés reservar otra cuando quieras.',
    })
  }
}

// ─── Partner free-week reserve flow (Phase 179, D-05/D-06) ─────────

function onPartnerSlotTap(slot: WeeklySlotView) {
  if (isSlotHoliday(slot)) return
  if (isSlotPast(slot)) return
  if (slot.isFull) return

  const date = dateForDay(slot.dayOfWeek as DayOfWeek)
  const dayLabel = DAY_LABELS_FULL[slot.dayOfWeek as DayOfWeek]
  const timeStr = formatTime(slot.startTime)
  const sede =
    branchOptions.value.find((o) => o.value === trialBranchId.value)?.label ?? 'la sede elegida'

  partnerDialog.value = {
    show: true,
    message: `¿Reservar ${slot.activityName} el ${dayLabel} ${formatDateLabel(date)} a las ${timeStr} en ${sede}? Al confirmar arranca tu semana de regalo (3 clases).`,
    loading: false,
    scheduleId: slot.id,
    date,
  }
}

async function confirmPartnerReserve() {
  if (!trialBranchId.value) return
  partnerDialog.value.loading = true
  try {
    const result = await reservePartnerWeek({
      scheduleId: partnerDialog.value.scheduleId,
      date: partnerDialog.value.date,
      branchId: trialBranchId.value,
    })
    partnerDialog.value.show = false
    const endLabel = result.endDate ? formatDateLabel(result.endDate) : null
    $q.notify({
      type: 'positive',
      message: endLabel
        ? `¡Listo! Tu semana arrancó hoy y tenés 3 clases para usar hasta el ${endLabel}.`
        : '¡Listo! Tu semana arrancó hoy y tenés 3 clases para usar.',
    })
    // La fuente de verdad es el server (D-06): recargar beneficio + suscripción
    // para que canAccessGrid pase a true y la página caiga a la grilla normal
    // con la reserva recién creada.
    selectedBranchId.value = trialBranchId.value
    await Promise.all([loadPartnerBenefit(), userStore.loadSubscription()])
    await loadGrid()
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      const message = extractError(
        err,
        'Tu semana de regalo ya no está disponible. Actualizamos tu estado.',
      )
      $q.notify({ type: 'warning', message })
      await loadPartnerBenefit()
    } else {
      const message = extractError(
        err,
        'No pudimos activar tu semana. Probá de nuevo o escribinos por WhatsApp.',
      )
      $q.notify({ type: 'negative', message })
      log.error('Partner week reserve failed', { error: message })
    }
  } finally {
    partnerDialog.value.loading = false
  }
}

function promptCancelBooking(booking: BookingRecord) {
  const dayLabel = DAY_LABELS_FULL[booking.dayOfWeek as DayOfWeek] ?? ''
  cancelDialog.value = {
    show: true,
    message: `Cancelar reserva de ${dayLabel} ${formatTime(booking.startTime)}?`,
    loading: false,
    bookingId: booking.id,
  }
}

async function confirmCancel() {
  cancelDialog.value.loading = true
  try {
    await cancelBooking(cancelDialog.value.bookingId)
    cancelDialog.value.show = false
    $q.notify({ type: 'positive', message: 'Reserva cancelada' })
    await loadGrid()
    // Phase 162 (Pitfall 3): cancelar una especial devuelve el crédito — recargar el pase.
    await userStore.loadEspecialPass()
  } catch (err: unknown) {
    const message = extractError(err, 'Error al cancelar')
    $q.notify({ type: 'negative', message })
  } finally {
    cancelDialog.value.loading = false
  }
}

// ─── Week navigation ────────────────────────────────────────────────

function changeWeek(delta: number) {
  const d = new Date(weekStart.value)
  d.setUTCDate(d.getUTCDate() + delta * 7)
  weekStart.value = d
  selectedDay.value = delta > 0 ? (1 as DayOfWeek) : getTodayDow(branchTimezone.value)
  loadGrid()
}

function goToCurrentWeek() {
  weekStart.value = getMondayInTz(branchTimezone.value)
  selectedDay.value = getTodayDow(branchTimezone.value)
  loadGrid()
}

// ─── Data loading ───────────────────────────────────────────────────

async function loadBonusUsage() {
  try {
    bonusUsage.value = await getBonusUsage()
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'CanceledError') return
    // Non-critical — just hide the banner.
    bonusUsage.value = { applicable: false }
  }
}

async function loadTrialEligibility() {
  try {
    trialEligibility.value = await getTrialEligibility()
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'CanceledError') return
    // Non-critical — if eligibility can't be resolved, fall back to the
    // existing presencial/muro branching (trialEligible stays false).
    trialEligibility.value = null
    log.warn('Failed to load trial eligibility', { error: extractError(err, 'unknown') })
  }
}

async function loadGrid() {
  try {
    const branchId =
      isTrialMode.value || isPartnerWeekMode.value
        ? (trialBranchId.value ?? undefined)
        : isMultiBranch.value
          ? (selectedBranchId.value ?? undefined)
          : undefined
    const data = await getWeeklyGrid(formatWeekStart(weekStart.value), branchId)

    // Adopt the viewing branch's timezone. If this is the first load or
    // the user just switched branches, realign weekStart / selectedDay to
    // the branch's "current" week so Sunday-in-BCN doesn't accidentally
    // display Monday-in-AR slots.
    const prevTz = branchTimezone.value
    branchTimezone.value = data.branchTimezone
    if (data.branchTimezone !== prevTz) {
      weekStart.value = getMondayInTz(data.branchTimezone)
      selectedDay.value = getTodayDow(data.branchTimezone)
    }

    slots.value = data.slots
    holidays.value = data.holidays
    myBookings.value = data.myBookings
    myAttendance.value = data.myAttendance
    await loadBonusUsage()
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'CanceledError') return
    const message = extractError(err, 'Error al cargar horarios')
    $q.notify({ type: 'negative', message })
    log.error('Failed to load grid', { error: message })
  } finally {
    loading.value = false
  }
}

watch(selectedBranchId, () => loadGrid())

// Trial mode: reloading the grid for the chosen physical sede (D-06). Reset the
// week to "today" so the 30-day window starts from the current week.
// Also covers partner free-week mode (Phase 179, D-06): same "pick a sede,
// then reload" mechanics, shared ref under the D-18 mutual-exclusion guarantee.
watch(trialBranchId, () => {
  if (!trialEligible.value && !isPartnerWeekMode.value) return
  weekStart.value = getMondayInTz(branchTimezone.value)
  selectedDay.value = getTodayDow(branchTimezone.value)
  loadGrid()
})

onMounted(async () => {
  if (!userStore.subscription && !userStore.subscriptionLoading) {
    await userStore.loadSubscription()
  }

  // Phase 162 (APP-02/D-06): cargar el plan especial antes de decidir el empty-state.
  // Debe resolver ANTES para que el externo-solo-pase (canAccessGrid) no vea un flash
  // del muro y para que el chip x/2 tenga el saldo correcto al primer render.
  await userStore.loadEspecialPass()

  // Resolve trial eligibility and partner free-week benefit together, at the
  // same point in the lifecycle (Phase 179 plan): they gate mutually
  // exclusive states (D-18, backend-guaranteed) that together decide which
  // of the ReservasPage states renders.
  await Promise.all([loadTrialEligibility(), loadPartnerBenefit()])

  if (trialEligible.value) {
    // Trial mode: load the physical-branch options for the sede selector (D-06).
    // The grid stays empty until the user picks a sede.
    try {
      branches.value = await getBranches()
    } catch {
      // fall through — selector simply renders empty
    }
    // Gate del popup (D-08): modo prueba (isTrialMode) sin sede elegida
    // (trialBranchId === null) y con sedes efectivamente disponibles.
    if (isTrialMode.value && trialBranchId.value === null && branches.value.length > 0) {
      showBranchPicker.value = true
    }
    loading.value = false
    return
  }

  if (trialBooking.value) {
    // Already-booked confirmation card (state 3) needs no grid.
    loading.value = false
    return
  }

  if (partnerBenefitEligible.value) {
    // Partner free-week pending (Phase 179, D-06): same sede-selector-first
    // pattern as trial mode. The grid stays empty until the user picks a sede.
    try {
      branches.value = await getBranches()
    } catch {
      // fall through — selector simply renders empty
    }
    loading.value = false
    return
  }

  if (partnerBenefitExpired.value) {
    // Expired benefit (D-07): no grid, no sede selector needed.
    loading.value = false
    return
  }

  if (isMultiBranch.value) {
    try {
      branches.value = await getBranches()
      selectedBranchId.value = userStore.profile?.branchId ?? null
    } catch {
      // fall through
    }
  }
  loadGrid()
})

onBeforeUnmount(() => cleanup())
</script>

<style scoped lang="scss">
@use 'sass:color';
@import 'src/css/quasar.variables.scss';

.reservas {
  max-width: 600px;
  margin: 0 auto;
}

// Phase 144-04 (D-15): booking-block renewal dialog — reuses the charcoal-card
// visual from RatingPromptDialog/PushPermissionDialog (no new styling per
// UI-SPEC §143). $primary (#96593a) is the brand terracotta; $dark-page the
// charcoal card; $cream the marble-cream text.
.coverage-dialog {
  width: 100%;
  max-width: 340px;
  background: $dark-page;
  color: $cream;
  border-radius: 16px;
  border-top: 2px solid rgba($primary, 0.6);
  padding: 8px 4px 16px;
}

.coverage-dialog__body {
  text-align: center;
  padding-top: 16px;
}

.coverage-dialog__icon {
  color: $primary;
  margin-bottom: 12px;
}

.coverage-dialog__title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: 0.04em;
  margin: 0 0 12px 0;
  color: $cream;
}

.coverage-dialog__text {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.875rem;
  line-height: 1.5;
  color: rgba($cream, 0.75);
  margin: 0;
}

.coverage-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 20px 4px;
}

.coverage-dialog__primary {
  background: linear-gradient(135deg, $primary 0%, #ad6540 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  letter-spacing: 0.12em;
  padding: 12px 0;
  border-radius: 8px;
}

.coverage-dialog__secondary {
  color: rgba($cream, 0.55) !important;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  margin-top: 4px;
}

// ─── Phase 162 (APP-02): chip contador x/2 del plan especial ─────────
// Acento dorado "Aura" (RESERVADO). En 0/2 pasa a olive apagado.
.especial-chip-row {
  display: flex;
  justify-content: center;
}

.especial-chip {
  color: $warning !important;
  background: #f5ecd9 !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.01em;

  &--exhausted {
    color: $info !important;
    background: rgba($info, 0.1) !important;
  }
}

// ─── Phase 162 (APP-03): dialog informativo "Actividades con Aura" ───
// Clona coverage-dialog (charcoal card) con acento dorado en vez de terracotta.
// El botón "Entendido" es neutro (cream) — el dorado queda reservado al ícono.
.aura-dialog {
  width: 100%;
  max-width: 340px;
  background: $dark-page;
  color: $cream;
  border-radius: 16px;
  border-top: 2px solid rgba($warning, 0.7);
  padding: 8px 4px 16px;
}

.aura-dialog__body {
  text-align: center;
  padding-top: 16px;
}

.aura-dialog__icon {
  color: #d4b896; // bronze-light — legible sobre charcoal (el $warning puro es muy oscuro)
  margin-bottom: 12px;
}

.aura-dialog__title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: 0.04em;
  color: $cream;
  margin: 0 0 8px;
}

.aura-dialog__text {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.875rem;
  line-height: 1.5;
  color: rgba($cream, 0.75);
  margin: 0 0 8px;
}

.aura-dialog__price {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  color: #d4b896;
  margin: 8px 0;
}

.aura-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 20px 4px;
}

.aura-dialog__primary {
  background: $cream !important;
  color: $dark !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  letter-spacing: 0.12em;
  padding: 12px 0;
  min-height: 44px;
  border-radius: 8px;
}

.bonus-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba($positive, 0.08);
  color: $positive;
  border-radius: 10px;
  font-size: 0.9rem;
  line-height: 1.2;
}

.bonus-banner__text {
  flex: 1;
}

.bonus-banner__period {
  color: $grey-7;
  font-weight: 400;
}

// ─── Trial banner (Phase 119) — warm palette, Sandy Beige fill ───────
.trial-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: #e5d9c8; // Sandy Beige
  border-left: 4px solid $primary;
  border-radius: 10px;
}

.trial-banner__icon {
  color: $primary;
  flex-shrink: 0;
  margin-top: 2px;
}

.trial-banner__heading {
  font-family: 'Montserrat', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: $primary;
  margin: 0;
}

.trial-banner__body {
  font-size: 13px;
  color: #8a8472; // Olive Stone
  margin: 4px 0 0;
  line-height: 1.4;
}

.next-class-card--confirmed {
  border-left-color: $positive;
  width: 100%;
  max-width: 420px;
}

.reservas__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.reservas__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  text-align: center;
}

.reservas__empty-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: $primary;
  margin: 16px 0 8px;
}

.reservas__empty-text {
  font-size: 14px;
  color: $grey-7;
}

// ─── Branch ─────────────────────────────────────────────────────────

.branch-label {
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Montserrat', sans-serif;
  font-size: 18px;
  font-weight: 800;
  color: $primary;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 12px;
  padding-top: 8px;
}

.branch-select {
  max-width: 300px;
  margin-top: 4px;

  :deep(.q-field__control) {
    background: white;
    border-color: rgba($primary, 0.15);
    padding: 0 12px;

    &:hover {
      border-color: rgba($primary, 0.35);
    }
  }

  :deep(.q-field__control--focused) {
    border-color: $primary;
    box-shadow: 0 0 0 2px rgba($primary, 0.12);
  }

  :deep(.q-field__native) {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: $primary;
    letter-spacing: 0.02em;
  }

  :deep(.q-field__append) {
    .q-icon {
      opacity: 0.5;
    }
  }
}

// ─── Next class hero ────────────────────────────────────────────────

.next-class-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: white;
  border: 1px solid rgba($primary, 0.15);
  border-radius: 12px;
  border-left: 4px solid $primary;
}

.next-class-card__icon {
  flex-shrink: 0;
}

.next-class-card__info {
  flex: 1;
  min-width: 0;
}

.next-class-card__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba($primary, 0.5);
  margin: 0;
}

.next-class-card__activity {
  font-family: 'Montserrat', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: $primary;
  margin: 2px 0;
}

.next-class-card__time {
  font-size: 13px;
  color: $grey-7;
  margin: 0;
}

.next-class-card__address {
  font-size: 12px;
  color: #8a8472; // Olive Stone, igual que .trial-banner__body
  margin: 4px 0 0;
}

// D-20: CTA primario del calendario en la confirmación de prueba.
.trial-calendar-btn {
  background: linear-gradient(135deg, $primary 0%, #ad6540 100%) !important;
  color: white !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 10px 24px;
}

.next-class-card__activity-empty {
  font-size: 14px;
  color: $grey-6;
  margin: 2px 0 0;
}

// ─── Day strip ──────────────────────────────────────────────────────

.day-strip__nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-bottom: 8px;
}

.day-strip__week-label {
  font-family: 'Montserrat', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: rgba($primary, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.day-strip__days {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
}

.day-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 48px;
  padding: 8px 4px;
  border: 1px solid rgba($primary, 0.12);
  border-radius: 12px;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;

  &--selected {
    background: $primary;
    border-color: $primary;

    .day-pill__abbrev,
    .day-pill__date {
      color: white;
    }
  }

  &--today:not(&--selected) {
    border-color: $primary;
  }

  &--past:not(&--selected) {
    opacity: 0.5;
  }

  &__abbrev {
    font-family: 'Montserrat', sans-serif;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: rgba($primary, 0.5);
    letter-spacing: 0.03em;
  }

  &__date {
    font-size: 18px;
    font-weight: 700;
    color: $primary;
    line-height: 1.2;
  }

  &__dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $primary;
  }

  &--selected &__dot {
    background: white;
  }
}

// ─── Day slots ──────────────────────────────────────────────────────

.day-slots__holiday {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba($accent, 0.08);
  border-radius: 10px;
  font-size: 14px;
  color: $accent;
  margin-bottom: 12px;
}

.day-slots__period {
  font-family: 'Montserrat', sans-serif;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba($accent, 0.4);
  margin: 16px 0 6px;

  &:first-child {
    margin-top: 0;
  }
}

.day-slots__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 0;
  color: $grey-6;
  font-size: 14px;
  gap: 8px;
}

.reservas__policy {
  font-size: 12px;
  color: $grey-6;
  margin: 16px 0 0;
  line-height: 1.5;
}

.slot-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin-bottom: 6px;
  border-radius: 10px;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.06);
  transition: all 0.15s ease;

  &--available {
    cursor: pointer;

    &:active {
      background: rgba($primary, 0.04);
    }
  }

  &--booked {
    border-color: rgba($primary, 0.3);
    background: rgba($primary, 0.04);
  }

  &--attended {
    border-color: rgba($positive, 0.3);
    background: rgba($positive, 0.04);
  }

  &--full {
    cursor: pointer;

    &:active {
      background: rgba($negative, 0.04);
    }
  }

  &--holiday {
    opacity: 0.5;
  }

  &--past {
    opacity: 0.4;
  }

  &__time {
    display: flex;
    flex-direction: column;
  }

  &__hour {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: $primary;
  }

  &__activity {
    font-size: 12px;
    color: $grey-7;

    // Plan 180-13 (D-18): affordance de tap SOLO cuando el slot trae
    // activityDescription (:class condicional en el template — sin copy
    // cargado, este modificador nunca se aplica).
    &--tappable {
      text-decoration: underline dotted rgba($grey-7, 0.5);
      text-underline-offset: 2px;
      cursor: pointer;
    }
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__avail {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 9px;
    border-radius: 8px;
    white-space: nowrap;
    letter-spacing: 0.01em;

    &--available {
      color: #2e7d32;
      background: #e8f5e9;
    }

    &--few {
      color: #a06a00;
      background: #fff8e1;
    }

    &--last {
      color: #e65100;
      background: #fff3e0;
    }

    &--full {
      color: $negative;
      background: #ffebee;
    }
  }

  &__badge {
    font-size: 12px;
    font-weight: 600;

    &--positive {
      color: $positive;
    }
  }

  // Phase 162 (APP-01): distintivo dorado "Aura" — RESERVADO a la actividad especial.
  // Espeja el patrón de .slot-card__avail. Aged Gold ($warning #7d6520) sobre tinte #f5ecd9.
  &__badge--special {
    margin-top: 4px;
    align-self: flex-start;
    color: $warning;
    background: #f5ecd9;
    padding: 2px 9px;
    border-radius: 8px;
    font-family: 'Montserrat', sans-serif;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.2;
  }

  // Phase 162 (E2/E3): estados de bloqueo del plan especial. Olive/grey apagado, NUNCA
  // rojo — no es un error, es una condición de acceso (UI-SPEC §Color).
  &__pill {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 9px;
    border-radius: 8px;
    white-space: nowrap;
    letter-spacing: 0.01em;

    &--muted,
    &--locked {
      color: $info; // Olive Stone
      background: rgba($info, 0.1);
    }
  }

  &__action {
    font-family: 'Montserrat', sans-serif;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.03em;
  }
}

// ─── Week summary ───────────────────────────────────────────────────

.week-summary {
  border: 1px solid rgba($primary, 0.12);
  border-radius: 12px;
  overflow: hidden;
}

:deep(.week-summary__header) {
  font-family: 'Montserrat', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: $primary;
}

.week-summary__list {
  background: transparent;
  padding: 4px 8px;

  :deep(.q-item) {
    padding: 10px 8px;
  }

  :deep(.q-item__label) {
    color: rgba($primary, 0.8);
  }

  :deep(.q-item__label--caption) {
    color: $grey-7;
  }
}

// ─── D-16: "¿Primera vez? Qué esperar" ───────────────────────────────
// Mismo patrón que .week-summary (borde redondeado, header en $primary).
.first-timer-card {
  border: 1px solid rgba($primary, 0.12);
  border-radius: 12px;
  overflow: hidden;
}

:deep(.first-timer-card__header) {
  font-family: 'Montserrat', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: $primary;
}

.first-timer-card__list {
  background: transparent;
  padding: 4px 8px;

  :deep(.q-item) {
    padding: 8px;
    min-height: unset;
  }

  :deep(.q-item__section--avatar) {
    min-width: 28px;
  }
}
</style>
