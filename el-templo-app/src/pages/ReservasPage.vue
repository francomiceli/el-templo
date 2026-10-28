<template>
  <q-page class="reservas" padding>
    <!-- SPEC "Empezá acá" C — tip de primera vez en Reservas. -->
    <FirstVisitTipBanner v-if="!loading" tip-id="reservas-anticipacion" />

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
        class="q-mt-sm branch-maps-link"
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
          hide-dropdown-icon
          :display-value="trialBranchId ? undefined : 'Elegí una sede para ver los horarios'"
        >
          <template #prepend>
            <q-icon name="location_on" size="18px" color="primary" />
          </template>
          <template #append>
            <q-icon name="unfold_more" size="16px" color="info" />
          </template>
        </q-select>
      </div>

      <div v-if="!trialBranchId" class="day-slots__empty">
        <q-icon name="event_busy" size="40px" color="info" />
        <p>Elegí una sede para ver los horarios disponibles.</p>
      </div>

      <template v-else>
        <div class="day-strip">
          <div class="day-strip__nav">
            <q-btn
              flat
              round
              icon="chevron_left"
              class="week-nav-btn"
              aria-label="Semana anterior"
              @click="changeWeek(-1)"
            />
            <q-btn flat dense no-caps class="day-strip__week-label" @click="goToCurrentWeek">
              {{ weekLabel }}
            </q-btn>
            <q-btn
              flat
              round
              icon="chevron_right"
              class="week-nav-btn"
              aria-label="Semana siguiente"
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
              :aria-pressed="selectedDay === day"
              @click="selectedDay = day"
            >
              <span class="day-pill__abbrev">{{ DAY_LABELS[day] }}</span>
              <span class="day-pill__date">{{ dayDateNumber(day) }}</span>
              <span v-if="isToday(day)" class="day-pill__sr">hoy</span>
            </button>
          </div>
        </div>

        <div class="day-slots">
          <div v-if="selectedDayHoliday" class="day-slots__holiday">
            <q-icon name="celebration" size="20px" />
            <span>{{ selectedDayHoliday }}</span>
          </div>

          <template v-for="section in daySections" :key="section.turno">
            <TurnoHeader :turno="section.turno" :slots="section.slots" />
            <div
              v-for="slot in section.slots"
              :key="slot.id"
              class="slot-card"
              :class="slotCardClass(slot)"
              @click="onPartnerSlotTap(slot)"
            >
              <div class="slot-card__time">
                <span class="slot-card__hour">{{ formatTime(slot.startTime) }}</span>
                <span class="slot-card__activity">{{ slot.activityName }}</span>
                <span v-if="slot.coachOverride && slot.coachFirstName" class="slot-card__coach"
                  >Profe {{ slot.coachFirstName }}</span
                >
              </div>
              <div class="slot-card__right">
                <template v-if="isSlotHoliday(slot)">
                  <span class="slot-card__avail slot-card__avail--few">Feriado</span>
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
                  <button
                    type="button"
                    class="slot-card__go"
                    :aria-label="`Reservar ${formatTime(slot.startTime)}`"
                    @click.stop="onPartnerSlotTap(slot)"
                  >
                    Reservar
                  </button>
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
      <q-icon name="event_busy" size="64px" color="info" />
      <h2 class="reservas__empty-title">Tu semana de regalo venció</h2>
      <p class="reservas__empty-text">
        El beneficio de tu semana gratis venció porque no llegaste a reservar a tiempo. Consultá por
        nuestros planes para seguir entrenando.
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
          hide-dropdown-icon
          :display-value="trialBranchId ? undefined : 'Elegí una sede para ver los horarios'"
        >
          <template #prepend>
            <q-icon name="location_on" size="18px" color="primary" />
          </template>
          <template #append>
            <q-icon name="unfold_more" size="16px" color="info" />
          </template>
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.label }}</q-item-label>
                <q-item-label caption>{{
                  scope.opt.address ?? 'Dirección no disponible'
                }}</q-item-label>
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
          class="q-ml-sm branch-maps-link"
          @click="openBranchMaps(mapsUrlForBranch(trialBranchId)!)"
        />
      </div>

      <!-- Grid hidden until a sede is chosen -->
      <div v-if="!trialBranchId" class="day-slots__empty">
        <q-icon name="event_busy" size="40px" color="info" />
        <p>Elegí una sede para ver los horarios disponibles.</p>
      </div>

      <template v-else>
        <!-- Day selector strip (30-day window, D-05) -->
        <div class="day-strip">
          <div class="day-strip__nav">
            <q-btn
              flat
              round
              icon="chevron_left"
              class="week-nav-btn"
              aria-label="Semana anterior"
              @click="changeWeek(-1)"
            />
            <q-btn flat dense no-caps class="day-strip__week-label" @click="goToCurrentWeek">
              {{ weekLabel }}
            </q-btn>
            <q-btn
              flat
              round
              icon="chevron_right"
              class="week-nav-btn"
              aria-label="Semana siguiente"
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
              :aria-pressed="selectedDay === day"
              @click="selectedDay = day"
            >
              <span class="day-pill__abbrev">{{ DAY_LABELS[day] }}</span>
              <span class="day-pill__date">{{ dayDateNumber(day) }}</span>
              <span v-if="isToday(day)" class="day-pill__sr">hoy</span>
            </button>
          </div>
        </div>

        <!-- Selected day's slots (NO cancel affordance — D-03) -->
        <div class="day-slots">
          <div v-if="selectedDayHoliday" class="day-slots__holiday">
            <q-icon name="celebration" size="20px" />
            <span>{{ selectedDayHoliday }}</span>
          </div>

          <template v-for="section in daySections" :key="section.turno">
            <TurnoHeader :turno="section.turno" :slots="section.slots" />
            <div
              v-for="slot in section.slots"
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
                  :role="slot.activityDescription ? 'button' : undefined"
                  :tabindex="slot.activityDescription ? 0 : undefined"
                  @click="onActivityNameTap(slot, $event)"
                  @keydown.enter="onActivityNameTap(slot, $event)"
                  @keydown.space.prevent="onActivityNameTap(slot, $event)"
                  >{{ slot.activityName }}</span
                >
                <span v-if="slot.coachOverride && slot.coachFirstName" class="slot-card__coach"
                  >Profe {{ slot.coachFirstName }}</span
                >
              </div>
              <div class="slot-card__right">
                <template v-if="isSlotHoliday(slot)">
                  <span class="slot-card__avail slot-card__avail--few">Feriado</span>
                </template>
                <template v-else-if="slotIsFull(slot)">
                  <span class="slot-card__avail slot-card__avail--full">Completo</span>
                </template>
                <template v-else-if="isSlotPast(slot)"></template>
                <template v-else>
                  <span
                    class="slot-card__avail"
                    :class="`slot-card__avail--${availabilityLevel(slot)}`"
                    >{{ availabilityText(slot) }}</span
                  >
                  <button
                    type="button"
                    class="slot-card__go"
                    :aria-label="`Reservar ${formatTime(slot.startTime)}`"
                    @click.stop="onTrialSlotTap(slot)"
                  >
                    Reservar
                  </button>
                </template>
              </div>
            </div>
          </template>

          <div v-if="daySections.length === 0" class="day-slots__empty">
            <q-icon name="event_busy" size="40px" color="info" />
            <p>No hay horarios este día</p>
          </div>
        </div>

        <ReservasRulesNote>
          Es tu sesión de prueba gratis. Podés cancelarla o cambiarla hasta 24 horas antes; dentro
          de las 24 horas queda fija.
        </ReservasRulesNote>
      </template>
    </template>

    <template v-else>
      <!-- Branch selector -->
      <div v-if="isMultiBranch && branches.length > 1" class="branch-row">
        <q-select
          v-model="selectedBranchId"
          :options="branchOptions"
          dense
          rounded
          outlined
          emit-value
          map-options
          class="branch-select branch-select--chip"
          hide-dropdown-icon
          :display-value="currentBranchShortName"
          aria-label="Sede"
        >
          <template #prepend>
            <q-icon name="place" size="18px" />
          </template>
          <template #append>
            <q-icon name="expand_more" size="18px" />
          </template>
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.label }}</q-item-label>
                <q-item-label caption>{{
                  scope.opt.address ?? 'Dirección no disponible'
                }}</q-item-label>
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
          class="q-ml-sm branch-maps-link"
          @click="openBranchMaps(mapsUrlForBranch(selectedBranchId)!)"
        />
      </div>
      <div v-else class="branch-row">
        <p class="branch-chip">
          <q-icon name="place" size="18px" />
          {{ currentBranchShortName }}
        </p>
      </div>

      <!-- Phase 162 (APP-02): contador del pase especial — un chip dorado POR PASE
           (línea Aura, Yoga...), visible sólo si el usuario tiene algún pase. En 0/N
           pasa a tono apagado. -->
      <div v-if="userStore.hasEspecialPass" class="especial-chip-row q-mb-md">
        <q-chip
          v-for="pass in userStore.especialPasses"
          :key="pass.specialLine ?? '__aura__'"
          dense
          class="especial-chip"
          :class="{
            'especial-chip--exhausted': !passHasBalance(pass),
          }"
        >
          <q-icon name="auto_awesome" size="14px" class="q-mr-xs" />
          {{ passChipLabel(pass) }}
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

      <!-- Próxima clase (sketch 013 A): card clara con marco degradé fino -->
      <div class="next-card">
        <div class="next-card__body">
          <span class="next-card__icon">
            <q-icon :name="nextBooking ? 'event' : 'event_available'" size="22px" />
          </span>
          <div class="next-card__info">
            <p class="next-card__kicker">Tu próxima clase</p>
            <p class="next-card__title">
              {{ nextBooking ? nextBookingTitle(nextBooking) : 'Elegí un horario' }}
            </p>
            <p class="next-card__meta">
              {{
                nextBooking
                  ? nextBookingMeta(nextBooking)
                  : 'Podés reservar hasta 2 días en adelante'
              }}
            </p>
          </div>
          <button
            v-if="nextBooking"
            type="button"
            class="link-btn next-card__cancel"
            @click="promptCancelBooking(nextBooking)"
          >
            Cancelar
          </button>
        </div>
      </div>

      <!-- Day selector strip -->
      <div class="day-strip">
        <div class="day-strip__nav">
          <q-btn
            flat
            round
            icon="chevron_left"
            class="week-nav-btn"
            aria-label="Semana anterior"
            @click="changeWeek(-1)"
          />
          <q-btn flat dense no-caps class="day-strip__week-label" @click="goToCurrentWeek">
            {{ weekLabel }}
          </q-btn>
          <q-btn
            flat
            round
            icon="chevron_right"
            class="week-nav-btn"
            aria-label="Semana siguiente"
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
              'day-pill--has-booking': dayHasBooking(day),
              'day-pill--past': isDayPast(day),
            }"
            :aria-pressed="selectedDay === day"
            @click="selectedDay = day"
          >
            <span class="day-pill__abbrev">{{ DAY_LABELS[day] }}</span>
            <span class="day-pill__date">{{ dayDateNumber(day) }}</span>
            <span v-if="isToday(day)" class="day-pill__sr">hoy</span>
            <span v-if="dayHasBooking(day)" class="day-pill__sr">con reserva</span>
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

        <!-- Secciones: Turno Mañana / Especiales (entre turnos) / Turno Tarde -->
        <template v-for="section in daySections" :key="section.turno">
          <TurnoHeader :turno="section.turno" :slots="section.slots" />
          <div
            v-for="slot in section.slots"
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
                :role="slot.activityDescription ? 'button' : undefined"
                :tabindex="slot.activityDescription ? 0 : undefined"
                @click="onActivityNameTap(slot, $event)"
                @keydown.enter="onActivityNameTap(slot, $event)"
                @keydown.space.prevent="onActivityNameTap(slot, $event)"
                >{{ slot.activityName }}</span
              >
              <span v-if="slot.coachOverride && slot.coachFirstName" class="slot-card__coach"
                >Profe {{ slot.coachFirstName }}</span
              >
            </div>
            <div class="slot-card__right">
              <template v-if="isSlotHoliday(slot)">
                <span class="slot-card__avail slot-card__avail--few">Feriado</span>
              </template>
              <template v-else-if="isSlotAttended(slot)">
                <span class="slot-card__chip slot-card__chip--ok">
                  <q-icon name="verified" size="16px" />Asististe
                </span>
              </template>
              <template v-else-if="isSlotBooked(slot)">
                <span class="slot-card__chip slot-card__chip--ok">
                  <q-icon name="check" size="16px" />Reservado
                </span>
                <button
                  type="button"
                  class="link-btn"
                  :aria-label="`Cancelar reserva de las ${formatTime(slot.startTime)}`"
                  @click.stop="cancelSlotBooking(slot)"
                >
                  Cancelar
                </button>
              </template>
              <template v-else-if="slot.isFull && !slot.isSpecial">
                <span class="slot-card__avail slot-card__avail--full">Completo</span>
                <button
                  v-if="canJoinWaitlist(slot)"
                  type="button"
                  class="slot-card__go slot-card__go--wait"
                  :aria-label="`Lista de espera de las ${formatTime(slot.startTime)}`"
                  @click.stop="onSlotTap(slot)"
                >
                  Lista de espera
                </button>
              </template>
              <template v-else-if="isSlotPast(slot)"></template>
              <!-- Phase 162 (APP-01): estados de la actividad especial. Se evalúan
                   DESPUÉS de holiday/attended/booked/full/past (que conservan prioridad).
                   Bloqueo en tono apagado, nunca rojo (no es error, es condición de acceso). -->
              <template v-else-if="slot.isSpecial && slotSpecialState(slot) === 'reservable'">
                <!-- E1/E4: plan especial con saldo → flujo de reserva normal -->
                <template v-if="slot.isFull">
                  <span class="slot-card__avail slot-card__avail--full">Completo</span>
                  <button
                    v-if="canJoinWaitlist(slot)"
                    type="button"
                    class="slot-card__go slot-card__go--wait"
                    :aria-label="`Lista de espera de las ${formatTime(slot.startTime)}`"
                    @click.stop="onSlotTap(slot)"
                  >
                    Lista de espera
                  </button>
                </template>
                <template v-else>
                  <span
                    class="slot-card__avail"
                    :class="`slot-card__avail--${availabilityLevel(slot)}`"
                    >{{ availabilityText(slot) }}</span
                  >
                  <button
                    type="button"
                    class="slot-card__go"
                    :aria-label="`Reservar ${formatTime(slot.startTime)}`"
                    @click.stop="onSlotTap(slot)"
                  >
                    Reservar
                  </button>
                </template>
              </template>
              <template v-else-if="slot.isSpecial && slotSpecialState(slot) === 'exhausted'">
                <!-- E2: pase de la línea sin saldo (0/N) — chip apagado, sin botón -->
                <span class="slot-card__pill slot-card__pill--muted">Usaste tus clases</span>
              </template>
              <template v-else-if="slot.isSpecial">
                <!-- E3: socio sin el pase de ESTA línea — abre el dialog al tocar. Si todavía
                     puede usar la clase de prueba gratis de la línea, la invita a probar en
                     vez del candado. -->
                <span
                  v-if="canClaimTrial(userStore.trialLines, slot.specialLine ?? null)"
                  class="slot-card__pill slot-card__pill--trial"
                >
                  <q-icon name="redeem" size="14px" />¡Probá una clase!
                </span>
                <span v-else class="slot-card__pill slot-card__pill--locked">
                  <q-icon name="lock" size="14px" />{{ specialLockedLabel(slot) }}
                </span>
              </template>
              <template v-else>
                <span
                  class="slot-card__avail"
                  :class="`slot-card__avail--${availabilityLevel(slot)}`"
                  >{{ availabilityText(slot) }}</span
                >
                <button
                  type="button"
                  class="slot-card__go"
                  :aria-label="`Reservar ${formatTime(slot.startTime)}`"
                  @click.stop="onSlotTap(slot)"
                >
                  Reservar
                </button>
              </template>
            </div>
          </div>
        </template>

        <!-- No slots -->
        <div v-if="daySections.length === 0" class="day-slots__empty">
          <q-icon name="event_busy" size="40px" color="info" />
          <p>No hay horarios este día</p>
        </div>
      </div>

      <ReservasRulesNote>
        Podés reservar desde hoy hasta 2 días en adelante, hasta 5 minutos antes del inicio de la
        clase. Las cancelaciones deben hacerse con al menos 20 minutos de anticipación.
      </ReservasRulesNote>

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
              <span class="week-pill" :class="`week-pill--${event.badgeTone}`">{{
                event.badgeLabel
              }}</span>
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="week-summary__empty q-pa-md text-center text-body2">
          No tenés actividad esta semana
        </div>
      </q-expansion-item>
    </template>

    <!-- Diálogos de trámite: PremiumDialogCard tone="light" (sketch 012 A · Hermana clara).
         Primario terracota con destello; lo destructivo (cancelar reserva / prueba) en rojo sin
         destello (`pd-cta--neg`); el secundario es un link. -->

    <!-- Reserve confirmation dialog -->
    <q-dialog v-model="reserveDialog.show" persistent>
      <PremiumDialogCard tone="light">
        <h3 class="pd-title">{{ reserveDialog.title }}</h3>
        <p class="pd-text">{{ reserveDialog.message }}</p>
        <div class="pd-acts">
          <q-btn
            unelevated
            no-caps
            class="pd-cta"
            :class="{ 'pd-cta--neg': reserveDialog.confirmColor === 'negative' }"
            :label="reserveDialog.confirmLabel"
            :loading="reserveDialog.loading"
            @click="confirmReserve"
          />
          <q-btn flat no-caps dense class="pd-skip" label="Cancelar" v-close-popup />
        </div>
      </PremiumDialogCard>
    </q-dialog>

    <!-- Trial reserve confirmation dialog (no-cancel copy, D-03) -->
    <q-dialog v-model="trialDialog.show" persistent>
      <PremiumDialogCard tone="light">
        <h3 class="pd-title">Reservar tu sesión de prueba</h3>
        <p class="pd-text">{{ trialDialog.message }}</p>
        <q-input
          v-if="trialPhoneRequired"
          v-model="trialDialog.phone"
          class="pd-input"
          type="tel"
          inputmode="tel"
          label="Teléfono"
          outlined
          :rules="[(v) => (v ?? '').replace(/\D/g, '').length >= 6 || 'Ingresá un teléfono válido']"
          hint="Lo necesitamos para coordinar tu sesión de prueba"
        />
        <div class="pd-acts">
          <q-btn
            unelevated
            no-caps
            class="pd-cta"
            label="Confirmar prueba"
            :loading="trialDialog.loading"
            :disable="trialPhoneRequired && trialDialog.phone.replace(/\D/g, '').length < 6"
            @click="confirmTrialReserve"
          />
          <q-btn flat no-caps dense class="pd-skip" label="Cancelar" v-close-popup />
        </div>
      </PremiumDialogCard>
    </q-dialog>

    <!-- Trial cancel confirmation dialog (D-03 revised, >24h only) -->
    <q-dialog v-model="trialCancelDialog" persistent>
      <PremiumDialogCard tone="light">
        <h3 class="pd-title">Cancelar tu sesión de prueba</h3>
        <p class="pd-text">
          ¿Seguro que querés cancelar tu sesión de prueba? Vas a poder reservar otra cuando quieras.
        </p>
        <div class="pd-acts">
          <q-btn
            unelevated
            no-caps
            class="pd-cta pd-cta--neg"
            label="Sí, cancelar"
            :loading="trialCancelLoading"
            @click="confirmTrialCancel"
          />
          <q-btn
            flat
            no-caps
            dense
            class="pd-skip"
            label="No, volver"
            :disable="trialCancelLoading"
            v-close-popup
          />
        </div>
      </PremiumDialogCard>
    </q-dialog>

    <!-- Partner free-week reserve confirmation dialog (Phase 179, D-05/D-06) -->
    <q-dialog v-model="partnerDialog.show" persistent>
      <PremiumDialogCard tone="light">
        <h3 class="pd-title">Arrancar tu semana de regalo</h3>
        <p class="pd-text">{{ partnerDialog.message }}</p>
        <div class="pd-acts">
          <q-btn
            unelevated
            no-caps
            class="pd-cta"
            label="Confirmar"
            :loading="partnerDialog.loading"
            @click="confirmPartnerReserve"
          />
          <q-btn
            flat
            no-caps
            dense
            class="pd-skip"
            label="Cancelar"
            :disable="partnerDialog.loading"
            v-close-popup
          />
        </div>
      </PremiumDialogCard>
    </q-dialog>

    <!-- Cancel confirmation dialog -->
    <q-dialog v-model="cancelDialog.show" persistent>
      <PremiumDialogCard tone="light">
        <h3 class="pd-title">Cancelar reserva</h3>
        <p class="pd-text">{{ cancelDialog.message }}</p>
        <div class="pd-acts">
          <q-btn
            unelevated
            no-caps
            class="pd-cta pd-cta--neg"
            label="Cancelar reserva"
            :loading="cancelDialog.loading"
            @click="confirmCancel"
          />
          <q-btn flat no-caps dense class="pd-skip" label="Volver" v-close-popup />
        </div>
      </PremiumDialogCard>
    </q-dialog>

    <!-- Phase 144-04 (D-15): booking-block renewal dialog (COVERAGE_EXPIRED).
         NOT persistent — action-scoped, re-shows on every too-late retry. -->
    <q-dialog v-model="showCoverageDialog">
      <PremiumDialogCard tone="light" icon="event_busy">
        <h3 class="pd-title">Necesitás renovar tu membresía</h3>
        <p class="pd-text">
          Esta clase es posterior al vencimiento de tu plan. Renovalo por WhatsApp para poder
          reservarla.
        </p>
        <div class="pd-acts">
          <q-btn
            unelevated
            no-caps
            class="pd-cta"
            label="Renovar por WhatsApp"
            @click="openCoverageWhatsApp"
          />
          <q-btn flat no-caps dense class="pd-skip" label="Entendido" v-close-popup />
        </div>
      </PremiumDialogCard>
    </q-dialog>

    <!-- Phase 162-05 (APP-03/D-02): dialog informativo del pase especial. Se dispara
         desde E3 (tap en especial sin el pase de su línea) y desde el backend
         (code PASS_REQUIRED). Consciente de la LÍNEA (Aura, Yoga...) que lo abrió y sin
         precios (cambian). SIN pago in-app — la venta es por gestión/PoS (el CTA
         "Adquirí tu pase" de la clase de prueba solo abre el WhatsApp de administración).
         NOT persistent salvo mientras se reserva la prueba. -->
    <q-dialog v-model="showAuraInfoDialog" :persistent="trialClaimLoading">
      <PremiumDialogCard tone="light" icon="auto_awesome">
        <h3 class="pd-title">{{ passInfoTitle }}</h3>
        <p v-if="passInfoTrialSlot" class="pd-text">
          Podés probar una clase gratis con tu plan. Si te gustó, podés pedir tu pase especial de
          <strong>{{ passInfoLine }}</strong> contactándote con nosotros.
        </p>
        <p v-else class="pd-text">
          Esta clase se reserva con el pase de <strong>{{ passInfoLine }}</strong
          >, aparte de tu plan. Pedilo en la recepción de tu sede.
        </p>

        <!-- Clase de prueba gratis (2026-09-29): si el server marcó la línea como elegible
             (trialLines) y hay un turno concreto detrás del tap, el CTA primario es probarla.
             2026-10-01: un solo paso — "Probá una clase gratis" reserva ese turno directo,
             sin confirmación. "Adquirí tu pase" lleva al WhatsApp de administración. Sin
             turno o sin elegibilidad queda el "Entendido" de siempre. -->
        <div v-if="passInfoTrialSlot" class="pd-acts">
          <q-btn
            unelevated
            no-caps
            class="pd-cta"
            label="Probá una clase gratis"
            :loading="trialClaimLoading"
            :disable="trialClaimLoading"
            @click="confirmEspecialTrial"
          />
          <q-btn
            unelevated
            no-caps
            class="pd-cta"
            label="Adquirí tu pase"
            :disable="trialClaimLoading"
            @click="openPassWhatsApp"
          />
          <q-btn
            flat
            no-caps
            dense
            class="pd-skip"
            label="Ahora no"
            :disable="trialClaimLoading"
            v-close-popup
          />
        </div>
        <div v-else class="pd-acts">
          <q-btn unelevated no-caps class="pd-cta" label="Entendido" v-close-popup />
        </div>
      </PremiumDialogCard>
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
import FirstVisitTipBanner from 'src/components/FirstVisitTipBanner.vue'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'
import BranchPickerDialog from 'src/components/BranchPickerDialog.vue'
import ActivityInfoSheet from 'src/components/ActivityInfoSheet.vue'
import TurnoHeader from 'src/components/TurnoHeader.vue'
import { splitDaySections } from 'src/utils/turno-sections'
import { needsExplicitGridLoad } from 'src/utils/reservas-initial-load'
import {
  availabilityLevel as availabilityLevelFor,
  availabilityText as availabilityTextFor,
  slotIsFull as slotIsFullFor,
  type AvailabilityLevel,
} from 'src/utils/slot-availability'
import { shortBranchName } from 'src/modules/progression/utils/today-card'
import ReservasRulesNote from 'src/components/ReservasRulesNote.vue'
import { useSchedulingApi } from 'src/composables/useSchedulingApi'
import type {
  TrialEligibility,
  BranchOption,
  PartnerBenefitEligibility,
} from 'src/composables/useSchedulingApi'
import { useUserStore } from 'src/stores/useUserStore'
import { useTodayBookingStore } from 'src/stores/useTodayBookingStore'
import { createLogger } from 'src/utils/logger'
import {
  fullLineLabel,
  passChipLabel,
  passHasBalance,
  sameSpecialLine,
  shortLineLabel,
  specialSlotState,
  canClaimTrial,
} from 'src/utils/special-line'
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
// Turno de hoy (botón QR de MainLayout): reservar o cancelar no cambia de ruta,
// así que hay que recargarlo a mano. Si no, quien reserva dentro de la ventana
// ±20 min (se puede hasta 5 min antes) no ve el botón para marcar asistencia.
const todayBookingStore = useTodayBookingStore()
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
  reserveEspecialTrial,
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

// Estado de una clase especial según el pase de SU línea (2026-09-29): un pase de
// Yoga no habilita una clase Aura ni al revés. E1/E4 reservable · E2 sin saldo · E3
// sin pase de esa línea.
function slotSpecialState(slot: WeeklySlotView) {
  return specialSlotState(userStore.especialPasses, slot.specialLine ?? null)
}

// Afordancia E3: la línea Aura conserva "Requiere plan especial".
function specialLockedLabel(slot: WeeklySlotView): string {
  return slot.specialLine
    ? `Requiere pase de ${shortLineLabel(slot.specialLine)}`
    : 'Requiere plan especial'
}

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
  return `Te esperamos el ${dayLabel.toLowerCase()} ${dateStr} a las ${timeStr} en ${sede}. ¡Llegá unos minutos antes!`
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
// Línea (null = Aura) de la clase que abrió el dialog — define título y texto.
const passInfoSpecialLine = ref<string | null>(null)
const passInfoTitle = computed(() => fullLineLabel(passInfoSpecialLine.value))
const passInfoLine = computed(() => shortLineLabel(passInfoSpecialLine.value))

// Turno concreto (id + fecha) detrás del tap, para ofrecer la clase de prueba gratis.
// Solo se setea si el server marcó la línea como elegible (`trialLines`); si no, el
// dialog queda informativo como siempre.
const passInfoTrialSlot = ref<{ scheduleId: number; date: string } | null>(null)
const trialClaimLoading = ref(false)

function openPassInfoDialog(line: string | null, target?: { scheduleId: number; date: string }) {
  passInfoSpecialLine.value = line
  passInfoTrialSlot.value =
    target && canClaimTrial(userStore.trialLines, line) ? { ...target } : null
  showAuraInfoDialog.value = true
}

// "Adquirí tu pase": la venta del pase es por administración (sin pago in-app).
function openPassWhatsApp(): void {
  const message = `Hola, quiero adquirir el pase especial de ${passInfoLine.value}`
  window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, message), '_blank')
  showAuraInfoDialog.value = false
}

async function confirmEspecialTrial() {
  const target = passInfoTrialSlot.value
  if (!target || trialClaimLoading.value) return
  trialClaimLoading.value = true
  try {
    await reserveEspecialTrial(target.scheduleId, target.date)
    showAuraInfoDialog.value = false
    $q.notify({
      type: 'positive',
      message: `Reserva confirmada. ¡Disfrutá tu clase de prueba de ${passInfoLine.value}!`,
    })
    void todayBookingStore.load()
    await loadGrid()
    // El pase de prueba recién asignado tiene que aparecer en el chip y la línea deja de
    // ser elegible (trialLines).
    await userStore.loadEspecialPass()
  } catch (err: unknown) {
    const message = extractError(err, 'No pudimos reservar tu clase de prueba. Probá de nuevo.')
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      // Regla de negocio (ya usada, plan vence antes, turno completo...): el server
      // manda el mensaje listo. Se cierra el dialog y se refresca la elegibilidad.
      showAuraInfoDialog.value = false
      $q.notify({ type: 'warning', message })
      await userStore.loadEspecialPass()
    } else {
      $q.notify({ type: 'negative', message })
      log.error('Especial trial reserve failed', { error: message })
    }
  } finally {
    trialClaimLoading.value = false
  }
}

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

// Meses en minúscula ("16 oct", "12 al 16 de octubre"): van dentro de frases.
const MONTH_ABBREV = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
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
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
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

// Secciones del día: Turno Mañana / Especiales (entre turnos) / Turno Tarde.
const daySections = computed(() => splitDaySections(selectedDaySlots.value))

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
    'slot-card--full': slotIsFull(slot) && !isSlotBooked(slot) && !isSlotAttended(slot),
    'slot-card--holiday': isSlotHoliday(slot),
    'slot-card--past': isSlotPast(slot) && !isSlotBooked(slot) && !isSlotAttended(slot),
    'slot-card--available':
      !slotIsFull(slot) &&
      !isSlotBooked(slot) &&
      !isSlotAttended(slot) &&
      !isSlotHoliday(slot) &&
      !isSlotPast(slot),
  }
}

// ─── Availability tier ──────────────────────────────────────────────
// Nivel y copy del chip de cupo: lógica pura en `utils/slot-availability` (con tests). Acá solo se
// ata al modo del componente: en modo prueba (freemium eligiendo SP) la disponibilidad es la del
// cupo ESPECIAL de SP. El bloque de prueba y el regular son mutuamente excluyentes (v-if/v-else-if
// sobre `trialEligible`), así que las funciones ramifican por `isTrialMode`.
function slotIsFull(slot: WeeklySlotView): boolean {
  return slotIsFullFor(slot, isTrialMode.value)
}

function availabilityLevel(slot: WeeklySlotView): AvailabilityLevel {
  return availabilityLevelFor(slot, isTrialMode.value)
}

function availabilityText(slot: WeeklySlotView): string {
  return availabilityTextFor(slot, isTrialMode.value)
}

// ─── Week events (for collapsible summary) ──────────────────────────

type WeekEventTone = 'ok' | 'neutral' | 'warn' | 'bad'

interface WeekEvent {
  key: string
  activityName: string
  label: string
  /** Tono semántico del estado; los colores salen del rework (pills de cupos), no de Quasar. */
  badgeTone: WeekEventTone
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
      badgeTone: att.status === 'confirmado' ? 'ok' : 'neutral',
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

    let badgeTone: WeekEventTone
    let badgeLabel: string
    if (b.status === 'no_show') {
      badgeTone = 'bad'
      badgeLabel = BOOKING_STATUS_LABELS.no_show
    } else if (b.status === 'confirmado') {
      badgeTone = 'ok'
      badgeLabel = 'Asististe'
    } else {
      badgeTone = b.status === 'reservado' || b.status === 'qr_escaneado' ? 'neutral' : 'warn'
      badgeLabel =
        b.status === 'lista_espera' && b.waitlistPosition !== null
          ? `${BOOKING_STATUS_LABELS.lista_espera} (#${b.waitlistPosition})`
          : (BOOKING_STATUS_LABELS[b.status] ?? b.status)
    }

    events.push({
      key: `bk-${b.id}`,
      activityName: b.activityName,
      label: `${dayLabel} ${dateStr} - ${formatTime(b.startTime)}`,
      badgeTone,
      badgeLabel,
    })
  }

  return events
})

// ─── Booking flow ───────────────────────────────────────────────────

/** "Viernes 16 · 19:00": título de la card "Tu próxima clase". */
function nextBookingTitle(booking: BookingRecord): string {
  const dayLabel = DAY_LABELS_FULL[booking.dayOfWeek as DayOfWeek] ?? ''
  const d = new Date(booking.bookingDate + 'T00:00:00')
  return `${dayLabel} ${d.getDate()} · ${formatTime(booking.startTime)}`
}

/**
 * Meta de la card "Tu próxima clase": actividad + sede de la RESERVA. El weekly-grid trae las reservas
 * de todas las sedes sin `branchName`; la sede se toma del slot de la grilla con el mismo `scheduleId`
 * (que sí la trae). Si la clase no está en la grilla que se está viendo, se omite en vez de inventarla.
 */
function nextBookingMeta(booking: BookingRecord): string {
  const branchName = slots.value.find((s) => s.id === booking.scheduleId)?.branchName
  const short = branchName ? shortBranchName(branchName) : ''
  return short ? `${booking.activityName} · ${short}` : booking.activityName
}

/** Nombre corto de la sede que se está viendo ("Mario Bravo"), para el chip de sede y la meta. */
const currentBranchShortName = computed(() => {
  const picked =
    isTrialMode.value || partnerBenefitEligible.value ? trialBranchId.value : selectedBranchId.value
  const fromList = branches.value.find((b) => b.id === picked)?.name
  return shortBranchName(fromList ?? userStore.profile?.branchName ?? '')
})

/**
 * Reserva activa del socio que choca con `slot` el mismo día. El choque diario es POR CATEGORÍA, igual
 * que la guarda 8b del server: una especial (pase Aura) no colisiona con una regular del mismo día — el
 * socio puede tener ROM el sábado y la clase con Aura ese mismo sábado. Sin este filtro la app ofrecía
 * "Cambiar horario" y le cancelaba la otra reserva. Entre especiales el choque es POR LÍNEA (yoga + Aura
 * el mismo día están permitidos).
 */
function findSameDayBooking(slot: WeeklySlotView, date: string): BookingRecord | undefined {
  return myBookings.value.find(
    (b) =>
      b.bookingDate === date &&
      b.isSpecial === slot.isSpecial &&
      (!slot.isSpecial || sameSpecialLine(b.specialLine, slot.specialLine)) &&
      ['reservado', 'qr_escaneado', 'confirmado', 'lista_espera'].includes(b.status),
  )
}

/**
 * ¿Se ofrece "Lista de espera" en este horario completo? La guarda 8b del server rechaza CUALQUIER
 * reserva (también la que cae en lista de espera) si el socio ya tiene otra el mismo día y categoría
 * ("Cancela la existente primero"): anotarse implicaría soltar la reserva confirmada sin garantía de
 * entrar. Con una reserva ese día no se ofrece, queda solo el chip "Completo".
 */
function canJoinWaitlist(slot: WeeklySlotView): boolean {
  if (isSlotPast(slot)) return false
  return !findSameDayBooking(slot, dateForDay(slot.dayOfWeek as DayOfWeek))
}

function onSlotTap(slot: WeeklySlotView) {
  if (isSlotHoliday(slot)) return
  if (isSlotBooked(slot)) return
  if (isSlotAttended(slot)) return
  if (isSlotPast(slot)) return

  // Phase 162 (APP-01): estados del plan especial. E3 (sin plan) → dialog informativo;
  // E2 (0/2) → toast; E1 (con saldo) cae al flujo de reserva normal de abajo.
  // El estado es POR LÍNEA: el pase de Yoga no habilita una clase Aura ni al revés.
  if (slot.isSpecial) {
    const state = slotSpecialState(slot)
    if (state === 'no-pass') {
      openPassInfoDialog(slot.specialLine ?? null, {
        scheduleId: slot.id,
        date: dateForDay(slot.dayOfWeek as DayOfWeek),
      })
      return
    }
    if (state === 'exhausted') {
      $q.notify({
        type: 'info',
        message: slot.specialLine
          ? `Ya usaste todas las clases de tu pase de ${shortLineLabel(slot.specialLine)}.`
          : 'Ya usaste tus accesos especiales del mes. Se renuevan con tu próximo período.',
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

  const existingBooking = findSameDayBooking(slot, date)

  // Horario completo + reserva ese día: no hay cambio posible (el server no admite lista de espera
  // sin soltar la reserva) → sin acción, el card ya muestra "Completo".
  if (existingBooking && slot.isFull) return

  if (existingBooking) {
    const existingTime = formatTime(existingBooking.startTime)
    reserveDialog.value = {
      show: true,
      title: 'Cambiar horario',
      message: `Ya tenés una reserva el ${dayLabel.toLowerCase()} ${dateStr} a las ${existingTime}. ¿Querés cambiarla por la de las ${timeStr}?`,
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
      message: 'Este horario está completo. ¿Querés anotarte en la lista de espera?',
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
      message: `¿Reservar ${slot.activityName} el ${dayLabel.toLowerCase()} ${dateStr} a las ${timeStr}?`,
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
        message: `Te anotaste en la lista de espera (posición #${booking.waitlistPosition})`,
      })
    } else {
      $q.notify({
        type: 'positive',
        message: reserveDialog.value.cancelFirst ? 'Horario cambiado' : 'Reserva confirmada',
      })
    }
    void todayBookingStore.load()
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
      // La línea sale del slot que se intentó reservar (el server nombra la línea
      // en el mensaje, pero acá la resolvemos por scheduleId).
      const blocked = slots.value.find((s) => s.id === reserveDialog.value.scheduleId)
      openPassInfoDialog(blocked?.specialLine ?? null, {
        scheduleId: reserveDialog.value.scheduleId,
        date: reserveDialog.value.date,
      })
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
  if (slotIsFull(slot)) return

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
    message: `¿Reservar ${slot.activityName} el ${dayLabel.toLowerCase()} ${dateStr} a las ${timeStr} en ${sede}? Es tu única sesión de prueba. ${policyLine}`,
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
    message: `¿Reservar ${slot.activityName} el ${dayLabel.toLowerCase()} ${formatDateLabel(date)} a las ${timeStr} en ${sede}? Al confirmar arranca tu semana de regalo (3 clases).`,
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
    void todayBookingStore.load()
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
    message: `¿Cancelar tu reserva del ${dayLabel.toLowerCase()} a las ${formatTime(booking.startTime)}?`,
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
    void todayBookingStore.load()
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

// Único que pide la grilla al cambiar la sede (fase 203, R-1): quien asigna
// `selectedBranchId` solo llama a `loadGrid()` a mano si el valor no cambió
// (ver `needsExplicitGridLoad`), para no pedir /weekly dos veces.
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

  const prevBranch = selectedBranchId.value
  if (isMultiBranch.value) {
    try {
      branches.value = await getBranches()
      selectedBranchId.value = userStore.profile?.branchId ?? null
    } catch {
      // fall through
    }
  }
  // Si la sede cambió, el watch de selectedBranchId ya pide la grilla (una vez).
  if (needsExplicitGridLoad(prevBranch, selectedBranchId.value)) loadGrid()
})

onBeforeUnmount(() => cleanup())
</script>

<style scoped lang="scss">
@use 'sass:color';
@import 'src/css/quasar.variables.scss';
@import 'src/css/premium-card';

.reservas {
  max-width: 600px;
  margin: 0 auto;
  // Mismo margen lateral que Mi Templo (sketch 013 A); antes 8px del padding de q-page.
  padding: 16px 16px 24px;
}

// ─── Phase 162 (APP-02): chip contador x/2 del plan especial ─────────
// Acento dorado "Aura" (RESERVADO). En 0/2 pasa a olive apagado.
.especial-chip-row {
  display: flex;
  flex-wrap: wrap; // un chip por pase (Aura, Yoga...)
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
  color: $pd-ink; // 199-29: texto sólido sobre Sandy Beige (11.7)
  margin: 0;
}

.trial-banner__body {
  font-size: 13px;
  color: $pd-ink; // 199-29: antes Olive Stone #8a8472 (2.68)
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
// Sede como chip (sketch 013 A): pastilla blanca con borde y sombra suave. En multi-sede el chip ES
// el q-select (abre el mismo menú de siempre); con una sola sede es un chip sin caret ni toque.

.branch-row {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}

.branch-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  margin: 0;
  padding: 0 14px 0 10px;
  border-radius: 999px;
  border: 1px solid $pd-light-edge;
  background: #fff;
  color: $pd-ink;
  font-family: 'Geologica', sans-serif;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(150, 89, 58, 0.08);

  .q-icon {
    color: $pd-terra-ink;
  }
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

  // 199-29: sin opacity en el ícono (antes .5, medía 1.57-1.94)
  :deep(.q-field__append) {
    .q-icon {
      color: $info;
    }
  }
}

.branch-select--chip {
  margin-top: 0;

  :deep(.q-field__control) {
    height: 36px;
    min-height: 36px;
    padding: 0 10px;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 2px 8px rgba(150, 89, 58, 0.08);

    &::before {
      border-radius: 999px;
      border: 1px solid $pd-light-edge;
    }

    &::after {
      border-radius: 999px;
    }
  }

  :deep(.q-field__native) {
    min-height: 34px;
    padding: 0 4px;
    font-family: 'Geologica', sans-serif;
    color: $pd-ink;
    letter-spacing: 0;
  }

  :deep(.q-field__prepend .q-icon) {
    color: $pd-terra-ink;
  }

  :deep(.q-field__append .q-icon) {
    color: $pd-ink-2;
  }
}

// App 1.7.9: "Cómo llegar" — subrayado y centrado vertical respecto del
// selector de sede, mismo tratamiento en los 3 lugares que lo usan
// (confirmación de sesión de prueba + junto al selector de sede ×2).
.branch-maps-link {
  align-self: center;
  text-decoration: underline;
  color: $pd-ink !important; // 199-29: sobre la página (antes $primary 4.35)

  :deep(.q-btn__content) {
    text-decoration: underline;
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
  color: $pd-ink-2; // 199-29: sobre card blanca (antes Olive Stone #8a8472)
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

// ─── Day strip ──────────────────────────────────────────────────────

.day-strip {
  margin-bottom: 14px;
}

.day-strip__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

// Flechas: 36px redondas (sketch 013 A). El ícono va en tinta (15:1).
.week-nav-btn {
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  color: $pd-ink;
}

.day-strip__week-label {
  font-family: 'Geologica', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: $pd-ink-2;
  text-transform: none;
  letter-spacing: 0;
}

.day-strip__days {
  display: flex;
  gap: 6px;
}

// Fichas de día (sketch 013 A): blanca con borde suave; la elegida con el degradé terracota del
// botón y texto blanco; hoy con borde tinta. Día con reserva: el número va dentro de un círculo
// salvia (2026-10-18; antes un punto debajo que le robaba alto a la ficha).
.day-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 0;
  padding: 8px 0 9px;
  border: 1px solid $pd-light-edge;
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
  position: relative;

  &--selected {
    border-color: transparent;
    background: linear-gradient(135deg, $pd-btn-a, $pd-btn-b);
    box-shadow: 0 4px 12px rgba(126, 69, 41, 0.3);

    .day-pill__abbrev,
    .day-pill__date {
      color: #fff;
    }
  }

  &--today:not(&--selected) {
    border-color: $pd-ink;
  }

  // 199-29: día pasado = fondo atenuado y texto sólido (antes opacity .5 sobre todo, 1.4-2.1)
  &--past:not(&--selected) {
    background: #f4f1ed;

    .day-pill__abbrev,
    .day-pill__date {
      color: $pd-ink-2;
    }
  }

  &__abbrev {
    font-family: 'Montserrat', sans-serif;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: $pd-ink-2;
    letter-spacing: 0.03em;
  }

  // El círculo siempre ocupa su lugar (así las fichas no cambian de alto); se pinta solo con reserva.
  &__date {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    margin-top: 2px;
    border-radius: 50%;
    font-family: 'Montserrat', sans-serif;
    font-size: 19px;
    font-weight: 700;
    color: $pd-ink;
    line-height: 1;
  }

  // Con reserva: círculo salvia y número blanco (6.2:1).
  &--has-booking &__date,
  &--has-booking.day-pill--past:not(.day-pill--selected) &__date {
    background: #3f6a47;
    color: #fff;
  }

  // Elegido y con reserva: sobre el degradé, círculo blanco con el número salvia.
  &--selected.day-pill--has-booking &__date {
    background: #fff;
    color: #3f6a47;
  }

  &__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}

// ─── Day slots ──────────────────────────────────────────────────────

.day-slots__holiday {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #f6efdc;
  border-radius: 14px;
  font-size: 14px;
  color: #7d6520; // ocre sobre tinte: 5.0:1
  margin-bottom: 12px;
}

.day-slots__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 0;
  color: $pd-ink; // 199-29: sobre la página (antes $grey-6)
  font-size: 14px;
  gap: 8px;
}

// Link de acción discreto ("Cancelar"): tinta-2 subrayado, 32px de alto para el toque.
.link-btn {
  flex: none;
  min-height: 32px;
  padding: 0 2px;
  border: 0;
  background: none;
  color: $pd-ink-2; // 5.4:1 sobre blanco
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

// ─── Próxima clase (sketch 013 A) ───────────────────────────────────
// Marco degradé fino en versión clara (mismo marco que la card de hoy, borde de 1.5px).

.next-card {
  @include pd-frame-light;
  margin-bottom: 14px;
}

.next-card__body {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  background: $pd-light-surface;
}

.next-card__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f3ede4;
  color: $pd-terra-ink;
}

.next-card__info {
  flex: 1;
  min-width: 0;

  p {
    margin: 0;
  }
}

.next-card__kicker {
  font-family: 'Cinzel', serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: $pd-terra-ink;
}

.next-card__info .next-card__title {
  margin-top: 2px;
  font-family: 'Montserrat', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: $pd-ink;
}

.next-card__meta {
  font-size: 13.5px;
  color: $pd-ink-2;
}

.next-card__cancel {
  align-self: center;
}

// ─── Horarios (sketch 013 A) ────────────────────────────────────────

.slot-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 12px 12px 16px;
  margin-bottom: 10px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid $pd-light-edge;
  box-shadow: 0 6px 18px rgba(150, 89, 58, 0.06);
  transition: background 0.15s ease;

  &--available,
  &--full {
    cursor: pointer;

    &:active {
      background: $pd-light-surface;
    }
  }

  // Reservado: borde salvia.
  &--booked {
    border-color: #3f6a47;
    box-shadow: 0 6px 18px rgba(63, 106, 71, 0.12);
  }

  &--attended {
    border-color: #3f6a47;
  }

  // Pasado / feriado: sin fondo, borde punteado, hora en tinta-2 (≥ 5.2:1 sobre la página).
  &--holiday,
  &--past {
    background: transparent;
    border-style: dashed;
    border-color: #cbbfae;
    box-shadow: none;

    .slot-card__hour,
    .slot-card__activity,
    .slot-card__coach {
      color: $pd-ink-2;
    }
  }

  &__time {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }

  // 2026-09-29: profe propio del horario (ej. la profe de yoga dentro del turno de
  // otro profe). Línea secundaria discreta bajo el nombre de la actividad.
  &__coach {
    font-size: 12px;
    color: $pd-ink-2;
    margin-top: 1px;
  }

  &__hour {
    font-family: 'Montserrat', sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: $pd-ink;
  }

  &__activity {
    margin-top: 2px;
    font-size: 13px;
    color: $pd-ink-2;

    // Plan 180-13 (D-18): affordance de tap SOLO cuando el slot trae activityDescription
    // (:class condicional en el template — sin copy cargado, este modificador nunca se aplica).
    // Subrayado suave que invita a abrir la hoja de info.
    &--tappable {
      text-decoration: underline;
      text-decoration-color: #cbbfae;
      text-underline-offset: 3px;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid $pd-terra-ink;
        outline-offset: 2px;
        border-radius: 4px;
      }
    }
  }

  // Derecha: arriba el chip (cupo / estado), abajo la acción.
  &__right {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  // Chips (pastillas de 999): salvia = anotados / reservado, ocre = pocos lugares / feriado,
  // rojo tierra = completo. Todos ≥ 4.5:1 sobre su tinte.
  &__avail,
  &__chip,
  &__pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    font-family: 'Geologica', sans-serif;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
  }

  &__avail {
    &--available {
      color: #3f6a47; // 5.4:1 sobre #e9f0e6
      background: #e9f0e6;
    }

    &--few,
    &--last {
      color: #7d6520; // 5.0:1 sobre #f6efdc
      background: #f6efdc;
    }

    &--full {
      color: #a8423f; // 4.9:1 sobre #f7e6e2
      background: #f7e6e2;
    }
  }

  &__chip--ok {
    height: 28px;
    padding: 0 10px;
    font-size: 13px;
    color: #3f6a47;
    background: #e9f0e6;
  }

  // Phase 162 (E2/E3): estados de bloqueo del plan especial. Tono apagado, NUNCA rojo — no es un
  // error, es una condición de acceso (UI-SPEC §Color).
  &__pill {
    &--muted,
    &--locked {
      color: $pd-ink-2; // 5.0:1 sobre #f3ede4
      background: #f3ede4;
    }

    // 2026-10-01: clase de prueba gratis disponible — invitación, no bloqueo.
    &--trial {
      color: $pd-terra-ink; // 4.9:1 sobre #f7ece4
      background: #f7ece4;
    }
  }

  // "Reservar": pastilla terracota sólida, SIN destello (se repite en cada horario).
  &__go {
    height: 36px;
    padding: 0 16px;
    border: 1.5px solid $pd-terra-ink;
    border-radius: 999px;
    background: $pd-terra-ink;
    color: #fff; // 5.6:1
    font-family: 'Geologica', sans-serif;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;

    // "Lista de espera": borde terracota sobre blanco.
    &--wait {
      background: #fff;
      color: $pd-terra-ink;
    }

    &:focus-visible {
      outline: 2px solid $pd-ink;
      outline-offset: 2px;
    }
  }
}

// ─── Week summary ───────────────────────────────────────────────────

.week-summary,
.first-timer-card {
  border: 1px solid $pd-light-line;
  border-radius: 14px;
  background: #fff;
  overflow: hidden;
}

.week-summary {
  margin-top: 16px;
}

:deep(.week-summary__header) {
  font-family: 'Montserrat', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: $pd-ink; // 199-29: sobre la página (antes $primary 4.15)
}

.week-summary__list {
  background: transparent;
  padding: 4px 8px;

  :deep(.q-item) {
    padding: 10px 8px;
  }

  :deep(.q-item__label) {
    color: $pd-ink; // sólido (antes rgba($primary, .8))
  }

  :deep(.q-item__label--caption) {
    color: $pd-ink-2; // secundario sólido (antes $grey-7)
  }
}

.week-summary__empty {
  color: $pd-ink-2;
}

// Ícono `history` del header: terracota sólido, igual que el de "Planes anteriores".
.week-summary :deep(.q-item__section--avatar .q-icon) {
  color: $pd-terra-ink;
}

// Estado del evento: mismas pills del rework que los cupos de los horarios (salvia / neutro /
// ocre / rojo tierra), texto sólido ≥ 4.5:1 sobre su tinte.
.week-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-family: 'Geologica', sans-serif;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;

  &--ok {
    color: $pd-sage;
    background: $pd-sage-tint;
  }

  &--neutral {
    color: $pd-ink-3;
    background: #f3ede4;
  }

  &--warn {
    color: $pd-gold-ink;
    background: $pd-gold-tint;
  }

  &--bad {
    color: $pd-neg-title;
    background: #f7e6e2;
  }
}

// ─── D-16: "¿Primera vez? Qué esperar" ───────────────────────────────
// Mismo patrón que .week-summary (borde redondeado, header en $primary).
:deep(.first-timer-card__header) {
  font-family: 'Montserrat', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: $pd-ink; // 199-29: sobre la página (antes $primary 4.35)
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
