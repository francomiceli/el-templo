<template>
  <q-page class="cobros-page q-pa-md">
    <!-- ════════════ PORTADA (step 0) ════════════ -->
    <div v-if="currentStep === 0" class="cobros-portada">
      <!-- Page title -->
      <div class="text-h5 q-mb-md">Cobros</div>

      <!-- Primary CTA: enter the 4-step flow -->
      <q-btn
        color="primary"
        size="lg"
        no-caps
        unelevated
        icon="add"
        label="Registrar cobro"
        class="cobros-cta q-mb-lg"
        @click="startCobro"
      />

      <!-- Historial de cobros — agrupado por día (fecha en el header, hora por fila).
           El endpoint devuelve los últimos 50 cobros (histórico), no "de hoy". -->
      <div v-if="loadingMyLoads" class="q-gutter-sm">
        <q-skeleton v-for="n in 3" :key="n" type="rect" height="56px" />
      </div>

      <q-card v-else-if="myLoads.length === 0" bordered flat>
        <q-card-section class="text-center text-grey-6 q-py-lg">
          <q-icon name="receipt_long" size="md" class="q-mb-sm" />
          <div class="text-body1">
            {{
              isCoachUser ? 'Todavía no registraste cobros' : 'Todavía no hay cobros registrados'
            }}
          </div>
          <div class="text-subtitle2 text-weight-regular text-grey-7">
            Cuando se registre un cobro, va a aparecer acá con su fecha y hora.
          </div>
        </q-card-section>
      </q-card>

      <template v-else>
        <div v-for="group in groupedLoads" :key="group.key" class="q-mb-md">
          <q-item-label
            header
            class="cobros-day-header bg-summary-surface text-body1 text-weight-bold q-py-sm"
          >
            {{ group.label }}
          </q-item-label>
          <q-list bordered separator class="rounded-borders">
            <q-item v-for="ticket in group.rows" :key="ticket.id">
              <q-item-section>
                <q-item-label>{{ ticket.memberName }}</q-item-label>
                <div class="text-subtitle2 text-weight-regular text-grey-7">
                  <q-icon name="schedule" size="xs" class="q-mr-xs" />{{
                    formatTime(ticket.createdAt)
                  }}
                  · {{ ticketConcept(ticket) }}
                  <!-- Roles no-coach ven el listado completo → mostrar quién cargó. -->
                  <template v-if="!isCoachUser"> · {{ ticket.recorderName }}</template>
                </div>
                <div class="q-mt-xs q-gutter-xs">
                  <q-badge
                    :color="methodColor(ticket.paymentMethod)"
                    :label="methodLabel(ticket.paymentMethod)"
                  />
                  <!-- WR-03: una fila anulada ya no se muestra "Pendiente".
                       (La distinción Validado-vs-Pendiente necesita exponer
                       validationStatus en el endpoint del listado — backend,
                       fuera de este gap-closure frontend-only.) -->
                  <q-badge v-if="ticket.voidedAt != null" color="negative" label="Anulado" />
                  <q-badge v-else color="warning" label="Pendiente" />
                  <q-badge
                    v-if="createdNewTicketIds.has(ticket.id)"
                    color="primary"
                    label="Nuevo"
                  />
                </div>
              </q-item-section>
              <q-item-section side top>
                <div class="text-h6">{{ formatPrice(ticket.amount, ticket.currency) }}</div>
              </q-item-section>
            </q-item>
          </q-list>
        </div>
      </template>
    </div>

    <!-- ════════════ WIZARD (steps 1..4) ════════════ -->
    <div v-else class="cobros-wizard">
      <!-- Progress header on the secondary band -->
      <div class="cobros-progress bg-summary-surface q-px-md q-py-sm">
        <div class="row items-center no-wrap">
          <q-btn flat round dense icon="arrow_back" aria-label="Volver" @click="goBack">
            <span v-if="$q.screen.gt.sm" class="q-ml-xs text-body1">Volver</span>
          </q-btn>

          <!-- Desktop: numbered steps -->
          <div v-if="$q.screen.gt.sm" class="row items-center q-gutter-md q-ml-md">
            <div v-for="(label, i) in STEP_LABELS" :key="i" class="row items-center no-wrap">
              <q-icon v-if="currentStep > i + 1" name="check_circle" color="primary" size="24px" />
              <span
                v-else
                class="cobros-step-num"
                :class="currentStep === i + 1 ? 'is-current' : 'is-future'"
                >{{ i + 1 }}</span
              >
              <span class="q-ml-xs text-body1" :class="stepLabelClass(i + 1)">{{ label }}</span>
            </div>
          </div>

          <!-- Mobile: Paso n de 4 + current label -->
          <div v-else class="col q-ml-sm">
            <div class="text-body1 text-weight-regular">
              Paso {{ currentStep }} de 4 · {{ STEP_LABELS[currentStep - 1] }}
            </div>
          </div>
        </div>

        <q-linear-progress
          v-if="!$q.screen.gt.sm"
          :value="currentStep / 4"
          size="4px"
          color="primary"
          class="q-mt-sm"
        />
      </div>

      <!-- Mobile: compact summary header (socio + running total), tap to expand -->
      <q-expansion-item
        v-if="!$q.screen.gt.sm"
        dense
        class="bg-summary-surface"
        :label="resumenSocio || '—'"
        :caption="formatPrice(amount ?? 0, resumenCurrency)"
      >
        <CobroResumen
          :socio="resumenSocio"
          :sede="resumenSede"
          :que-secobra="resumenQueSecobra"
          :como-paga="resumenComoPaga"
          :total="amount"
          :currency="resumenCurrency"
          :debt-warning="resumenDebtWarning"
        />
      </q-expansion-item>

      <!-- Body -->
      <div
        class="cobros-body q-mt-md"
        :class="$q.screen.gt.sm ? 'row no-wrap cobros-body--desktop' : ''"
      >
        <!-- LEFT: active step body -->
        <div class="cobros-step-col">
          <transition :name="reducedMotion ? 'cobro-fade' : transitionName" mode="out-in">
            <div :key="currentStep" class="cobros-step-body">
              <!-- ─── Step 1: Socio ─── -->
              <template v-if="currentStep === 1">
                <div class="text-h5 q-mb-md">Socio</div>

                <q-select
                  v-model="selectedMember"
                  :options="memberSearchResults"
                  option-value="id"
                  option-label="displayLabel"
                  label="Buscar socio (nombre o DNI)"
                  outlined
                  use-input
                  clearable
                  input-debounce="300"
                  :loading="searchingMembers"
                  @filter="onMemberSearch"
                  @update:model-value="onMemberSelected"
                >
                  <template #no-option>
                    <q-item>
                      <q-item-section class="text-grey-5 text-italic">
                        {{ searchQuery ? 'Sin resultados' : 'Escribí para buscar' }}
                      </q-item-section>
                    </q-item>
                  </template>
                  <template #option="scope">
                    <q-item v-bind="scope.itemProps">
                      <q-item-section>
                        <q-item-label>{{ scope.opt.displayLabel }}</q-item-label>
                        <q-item-label v-if="scope.opt.planLabel" caption>
                          {{ scope.opt.planLabel }}
                        </q-item-label>
                      </q-item-section>
                      <q-item-section side>
                        <q-badge :color="scope.opt.statusColor" :label="scope.opt.statusLabel" />
                      </q-item-section>
                    </q-item>
                  </template>
                </q-select>

                <!-- Nuevo alumno: crea un alumno nuevo (mini-form + Sede). -->
                <q-btn
                  v-if="!showNewStudentForm && !selectedMember"
                  outline
                  no-caps
                  color="primary"
                  icon="person_add"
                  label="Nuevo alumno"
                  class="full-width q-mt-sm"
                  @click="onNuevoAlumno"
                />

                <!-- Mini-form alumno nuevo (Nombre/Apellido/DNI + dedup). La Sede
                     se elige en el paso 2 (alta), reachable para TODA alta. -->
                <template v-if="showNewStudentForm">
                  <div class="text-body1 text-weight-bold q-mt-md">Datos del alumno</div>
                  <q-input
                    v-model="newStudent.firstName"
                    label="Nombre"
                    outlined
                    dense
                    class="q-mt-sm"
                  />
                  <q-input
                    v-model="newStudent.lastName"
                    label="Apellido"
                    outlined
                    dense
                    class="q-mt-sm"
                  />
                  <q-input
                    v-model="newStudent.dni"
                    label="DNI"
                    inputmode="numeric"
                    outlined
                    dense
                    class="q-mt-sm"
                    :loading="dedupChecking"
                    @blur="onDniBlur"
                  />

                  <!-- Dedup por DNI: si matchea, ofrecer cargar sobre el existente -->
                  <q-banner v-if="dedupMatch" dense rounded class="bg-warning text-dark q-mt-sm">
                    <template #avatar>
                      <q-icon name="warning" color="dark" />
                    </template>
                    Ya existe un alumno con ese DNI: {{ dedupMatchName }}. Se cargará sobre ese
                    alumno.
                    <template #action>
                      <q-btn flat dense no-caps label="Usar ese alumno" @click="onUsarExistente" />
                    </template>
                  </q-banner>
                </template>

                <!-- Deuda del socio (POS-01): aviso destacado bajo el socio elegido. -->
                <q-banner
                  v-if="(autocompletar?.outstanding ?? 0) > 0"
                  dense
                  rounded
                  class="bg-warning text-dark q-mt-md"
                >
                  <template #avatar>
                    <q-icon name="warning" color="dark" />
                  </template>
                  Debe
                  {{
                    formatPrice(autocompletar?.outstanding ?? 0, autocompletar?.currency ?? 'ARS')
                  }}
                  <span v-if="autocompletar?.planName"> — Plan {{ autocompletar.planName }}</span>
                </q-banner>

                <!-- Plan vigente sin deuda: el operador tiene que ver QUÉ plan
                     está por cobrar y hasta cuándo está cubierto, no sólo
                     "Activa" (UAT caja/cobros 2026-07-21). -->
                <q-banner
                  v-else-if="autocompletar?.hasRenewable && autocompletar.planName"
                  dense
                  rounded
                  class="bg-grey-2 text-dark q-mt-md"
                >
                  <template #avatar>
                    <q-icon name="card_membership" color="primary" />
                  </template>
                  Plan {{ autocompletar.planName }}
                  <span v-if="autocompletar.currentEndDate">
                    — vence el {{ formatDate(autocompletar.currentEndDate) }}
                  </span>
                </q-banner>
              </template>

              <!-- ─── Step 2: ¿Qué se cobra? ─── -->
              <template v-else-if="currentStep === 2">
                <div class="text-h5 q-mb-md">¿Qué se cobra?</div>

                <!-- Asociación (D-01, sin toggle de modo): 3 opciones como pregunta. -->
                <q-list bordered separator class="rounded-borders q-mb-md">
                  <q-item
                    v-for="opt in associationOptions"
                    :key="opt.value"
                    clickable
                    v-ripple
                    class="q-py-md"
                    :active="mode === opt.value"
                    active-class="bg-primary text-white"
                    :disable="isAssociationDisabled(opt.value)"
                    @click="onSelectAssociation(opt.value)"
                  >
                    <q-item-section avatar>
                      <q-icon :name="opt.icon" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ opt.label }}</q-item-label>
                      <div
                        class="text-subtitle2 text-weight-regular"
                        :class="mode === opt.value ? 'text-white' : 'text-grey-7'"
                      >
                        {{
                          isAssociationDisabled(opt.value)
                            ? 'Solo para socios existentes'
                            : opt.hint
                        }}
                      </div>
                    </q-item-section>
                  </q-item>
                </q-list>

                <!-- (a) Renovar plan vigente -->
                <template v-if="mode === 'renew'">
                  <template v-if="autocompletando">
                    <q-skeleton type="text" />
                    <q-skeleton type="text" />
                  </template>
                  <template v-else-if="autocompletar && !autocompletar.hasRenewable">
                    <div class="text-subtitle2 text-weight-regular text-warning q-mb-xs">
                      Este socio no tiene un plan activo para cobrar.
                    </div>
                    <q-btn
                      flat
                      dense
                      no-caps
                      color="primary"
                      icon="person_add"
                      label="Asignarle un plan"
                      @click="onSelectAssociation('alta')"
                    />
                  </template>
                  <template v-else-if="autocompletar">
                    <q-input
                      :model-value="autocompletar.planName ?? ''"
                      label="Plan vigente"
                      outlined
                      readonly
                    />
                  </template>
                </template>

                <!-- (b) Asignar plan nuevo: grilla por tier + Zero + turnos fixed -->
                <template v-else-if="mode === 'alta'">
                  <!-- Sede del alta (CR-01): editable para TODA alta (socio
                       existente Y alumno nuevo). Es el branchId que se persiste
                       en la suscripción y en el cargo del plan. -->
                  <q-select
                    v-model="sucursalId"
                    :options="branchOptions"
                    option-value="id"
                    option-label="name"
                    emit-value
                    map-options
                    outlined
                    label="Sede"
                    class="q-mb-md"
                    @update:model-value="onSucursalChange"
                  >
                    <template #prepend>
                      <q-icon name="place" color="primary" />
                    </template>
                  </q-select>

                  <div v-if="loadingPlans" class="q-gutter-sm">
                    <q-skeleton v-for="n in 3" :key="n" type="rect" height="56px" />
                  </div>
                  <div
                    v-else-if="plans.length === 0"
                    class="text-grey-5 text-italic q-pa-md text-center"
                  >
                    No hay planes activos para esta sede.
                  </div>
                  <template v-else>
                    <!-- Filtro por tipo: colapsa el catálogo al grupo que se
                         está cobrando (UAT caja/cobros 2026-07-21). Se oculta
                         si hay un solo grupo — no aporta nada. -->
                    <q-btn-toggle
                      v-if="planGroupTabs.length > 1"
                      v-model="planGroupFilter"
                      :options="planGroupTabs"
                      no-caps
                      unelevated
                      spread
                      toggle-color="primary"
                      color="grey-3"
                      text-color="grey-8"
                      class="q-mb-sm rounded-borders"
                    />
                    <div
                      v-if="plansByTier.length === 0"
                      class="text-grey-5 text-italic q-pa-md text-center"
                    >
                      No hay planes de este tipo para esta sede.
                    </div>
                    <div v-for="tier in plansByTier" :key="tier.tier" class="q-mb-sm">
                      <q-badge
                        :color="tierColor(tier.tier)"
                        :label="tierLabel(tier.tier)"
                        class="q-mb-xs"
                      />
                      <q-list bordered separator class="rounded-borders">
                        <q-item
                          v-for="plan in tier.plans"
                          :key="plan.id"
                          clickable
                          v-ripple
                          class="q-py-md"
                          :active="selectedPlan?.id === plan.id"
                          active-class="bg-primary text-white"
                          @click="selectPlan(plan)"
                        >
                          <q-item-section>
                            <q-item-label>{{ plan.name }}</q-item-label>
                            <div
                              class="text-subtitle2 text-weight-regular"
                              :class="selectedPlan?.id === plan.id ? 'text-white' : 'text-grey-7'"
                            >
                              {{ plan.durationDays }} días
                              <template v-if="plan.classesPerWeek">
                                · {{ plan.classesPerWeek }} clases/sem
                              </template>
                              <template v-else> · Ilimitado </template>
                            </div>
                          </q-item-section>
                          <q-item-section side>
                            <div
                              class="text-weight-bold"
                              :class="selectedPlan?.id === plan.id ? 'text-white' : ''"
                            >
                              {{ formatPrice(plan.priceRegular, plan.currency) }}
                            </div>
                          </q-item-section>
                        </q-item>
                      </q-list>
                    </div>

                    <q-toggle
                      v-if="zeroPriceEnabled"
                      v-model="zeroPrice"
                      :label="ZERO_PRICE_LABEL"
                      color="positive"
                      class="q-mt-sm"
                    />
                  </template>

                  <!-- Turnos: estructurado SOLO para planes fixed -->
                  <template v-if="selectedPlan">
                    <template v-if="selectedPlan.bookingMode === 'fixed'">
                      <div class="text-body1 text-weight-bold q-mt-md q-mb-xs">Turnos fijos</div>
                      <FixedSchedulePicker
                        v-model="scheduleIds"
                        :branch-id="sucursalId ?? 0"
                        :required-count="selectedPlan.classesPerWeek"
                        :allow-partial="false"
                        :multi-branch="selectedPlan.multiBranch"
                        :available-branches="multiBranchOptions"
                      />
                    </template>
                    <div v-else class="text-subtitle2 text-weight-regular text-grey-7 q-mt-sm">
                      Este plan reserva semana a semana — no se eligen turnos ahora.
                    </div>
                  </template>
                </template>

                <!-- (c) Cobro suelto: concepto + Motivo obligatorio -->
                <template v-else-if="mode === 'misc'">
                  <q-input
                    v-model="concepto"
                    type="textarea"
                    autogrow
                    label="Concepto"
                    placeholder="Ej.: clase de recuperación, ajuste, etc."
                    outlined
                  />
                  <q-select
                    v-model="miscReason"
                    :options="miscReasonOptions"
                    emit-value
                    map-options
                    label="Motivo"
                    outlined
                    class="q-mt-sm"
                  />
                </template>
              </template>

              <!-- ─── Step 3: ¿Cómo se paga? ─── -->
              <template v-else-if="currentStep === 3">
                <div class="text-h5 q-mb-md">¿Cómo se paga?</div>

                <div class="q-gutter-sm">
                  <q-btn
                    v-for="opt in paymentOptions"
                    :key="opt.value"
                    :label="opt.label"
                    :icon="opt.icon"
                    size="lg"
                    class="full-width"
                    no-caps
                    :color="paymentMethod === opt.value ? 'primary' : undefined"
                    :outline="paymentMethod !== opt.value"
                    :unelevated="paymentMethod === opt.value"
                    @click="paymentMethod = opt.value"
                  />
                </div>

                <q-input
                  v-model.number="amount"
                  type="number"
                  inputmode="numeric"
                  label="Monto"
                  outlined
                  class="q-mt-md"
                  :suffix="montoSymbol"
                  :hint="
                    mode === 'alta'
                      ? 'Por defecto se cobra el total. Editá si el cobro es parcial.'
                      : ''
                  "
                />

                <!-- Alta parcial: aviso de deuda remanente -->
                <q-banner
                  v-if="mode === 'alta' && isAltaPartial"
                  dense
                  rounded
                  class="bg-warning text-dark q-mt-sm"
                >
                  <template #avatar>
                    <q-icon name="warning" color="dark" />
                  </template>
                  El alumno quedará deudor por
                  {{ formatPrice(altaPrice - (amount ?? 0), altaCurrency) }}.
                </q-banner>

                <!-- Cuenta banco (COBRO-04) — sólo transferencia/tarjeta. -->
                <template v-if="needsBankAccount">
                  <div v-if="loadingBankAccounts" class="q-mt-md">
                    <q-skeleton type="QInput" />
                  </div>

                  <!-- Hay cuentas de la moneda -->
                  <template v-else-if="bankAccounts.length > 0">
                    <q-select
                      v-model="selectedBankAccountId"
                      :options="bankAccountOptions"
                      emit-value
                      map-options
                      label="Cuenta banco"
                      outlined
                      class="q-mt-md"
                    >
                      <!-- Atajo "+ Nueva cuenta" en el dropdown (admin/owner). -->
                      <template v-if="canCreateBankAccount" #after>
                        <q-btn
                          flat
                          dense
                          round
                          icon="add"
                          color="primary"
                          aria-label="Nueva cuenta"
                          @click="openCuentaDialog"
                        />
                      </template>
                    </q-select>
                    <!-- Botón de texto inline (admin/owner). -->
                    <q-btn
                      v-if="canCreateBankAccount"
                      flat
                      dense
                      no-caps
                      color="primary"
                      icon="add"
                      label="Nueva cuenta"
                      class="q-mt-xs"
                      @click="openCuentaDialog"
                    />
                    <div
                      v-if="selectedBankAccountId == null"
                      class="text-subtitle2 text-weight-regular text-warning q-mt-xs"
                    >
                      Elegí una cuenta bancaria para cobrar por transferencia o tarjeta.
                    </div>
                  </template>

                  <!-- Sin cuentas de la moneda, admin/owner -->
                  <template v-else-if="canCreateBankAccount">
                    <div class="text-body1 text-warning q-mt-md">
                      No hay cuentas de esta moneda. Creá una para continuar.
                    </div>
                    <q-btn
                      unelevated
                      no-caps
                      color="primary"
                      icon="add"
                      label="Crear cuenta"
                      class="q-mt-sm"
                      @click="openCuentaDialog"
                    />
                  </template>

                  <!-- Sin cuentas, profe/recepción: efectivo sigue disponible -->
                  <q-banner v-else dense rounded class="bg-warning text-dark q-mt-md">
                    <template #avatar>
                      <q-icon name="warning" color="dark" />
                    </template>
                    Todavía no hay cuentas bancarias cargadas. Pedile al dueño que cargue una para
                    cobrar por transferencia o tarjeta. Podés cobrar en efectivo.
                  </q-banner>
                </template>

                <!-- Efectivo: la caja la decide el server por la sede de quien
                     carga, así que no se pregunta — pero se MUESTRA (UAT
                     caja/cobros 2026-07-21: "lo cobré en efectivo, ¿a qué caja
                     lo manda?"). Si no es resolvible, no se muestra nada: el
                     server cae a la sede del socio y el cobro igual entra. -->
                <div
                  v-else-if="cajaEfectivo"
                  class="text-subtitle2 text-weight-regular text-grey-7 q-mt-md"
                >
                  <q-icon name="savings" size="xs" class="q-mr-xs" />Entra a
                  <span class="text-weight-medium">{{ cajaEfectivo.name }}</span>
                </div>

                <div class="text-subtitle2 text-weight-regular text-grey-7 q-mt-sm">
                  <q-icon name="schedule" size="xs" class="q-mr-xs" />Queda pendiente de validación.
                </div>
              </template>

              <template v-else-if="currentStep === 4">
                <div class="text-h5 q-mb-md">Resumen</div>
                <CobroResumen
                  :socio="resumenSocio"
                  :sede="resumenSede"
                  :que-secobra="resumenQueSecobra"
                  :como-paga="resumenComoPaga"
                  :total="amount"
                  :currency="resumenCurrency"
                  :debt-warning="resumenDebtWarning"
                />
              </template>
            </div>
          </transition>

          <!-- Desktop: inline-bottom action -->
          <div v-if="$q.screen.gt.sm" class="q-mt-lg">
            <q-btn
              color="primary"
              size="lg"
              no-caps
              :label="primaryActionLabel"
              :loading="submitting"
              :disable="primaryActionDisabled"
              @click="onPrimaryAction"
            />
          </div>
        </div>

        <!-- RIGHT: sticky accumulated summary panel (desktop) -->
        <div v-if="$q.screen.gt.sm" class="cobros-summary-col">
          <div class="cobros-summary-panel bg-summary-surface q-pa-lg">
            <div class="text-subtitle2 text-weight-regular text-grey-7 q-mb-sm">Resumen</div>
            <CobroResumen
              :socio="resumenSocio"
              :sede="resumenSede"
              :que-secobra="resumenQueSecobra"
              :como-paga="resumenComoPaga"
              :total="amount"
              :currency="resumenCurrency"
              :debt-warning="resumenDebtWarning"
            />
          </div>
        </div>
      </div>

      <!-- Mobile: sticky action bar -->
      <q-page-sticky v-if="!$q.screen.gt.sm" position="bottom" :offset="[0, 16]" expand>
        <div class="cobros-sticky-action">
          <q-btn
            color="primary"
            size="lg"
            class="full-width"
            no-caps
            :label="primaryActionLabel"
            :loading="submitting"
            :disable="primaryActionDisabled"
            @click="onPrimaryAction"
          />
        </div>
      </q-page-sticky>

      <div v-if="!$q.screen.gt.sm" style="height: 80px"></div>
    </div>

    <!-- Abandon-flow confirmation -->
    <q-dialog v-model="abandonDialog">
      <q-card>
        <q-card-section class="text-body1">
          Si salís ahora, se pierden los datos cargados.
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps color="primary" label="Seguir cargando" @click="cancelAbandon" />
          <q-btn unelevated no-caps color="negative" label="Salir" @click="confirmAbandon" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Alta rápida de cuenta banco (D-08) — sólo montado si admin/owner. -->
    <CuentaBancariaFormDialog
      v-if="canCreateBankAccount"
      v-model="showCuentaDialog"
      :selected-country="chargeCountry"
      :is-owner="isOwnerUser"
      :default-currency="chargeCurrency"
      @saved="onBankAccountSaved"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import { createLogger } from 'src/utils/logger';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import { formatDate } from 'src/utils/format-date';
import { ZERO_PRICE_LABEL } from 'src/config/templo-config';
import { useMembersApi } from 'src/composables/useMembersApi';
import { usePricingSettingsApi } from 'src/composables/usePricingSettingsApi';
import {
  useFinanceLoadApi,
  type AutocompletarResult,
  type CoachAltaInput,
} from 'src/composables/useFinanceLoadApi';
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_COLORS } from 'src/types/transaction';
import { PLAN_TIER_LABELS } from 'src/types/subscription';
import type { PaymentMethod, TransactionListItem } from 'src/types/transaction';
import type { BranchOption, UserStatus } from 'src/types/member';
import type { DuplicateMatch } from 'src/composables/useMembersApi';
import type { PlanListItem, PlanTier } from 'src/types/subscription';
import FixedSchedulePicker from 'src/components/scheduling/FixedSchedulePicker.vue';
import CobroResumen from 'src/components/caja/CobroResumen.vue';
import CuentaBancariaFormDialog from 'src/components/caja/CuentaBancariaFormDialog.vue';

const log = createLogger('cobros');
const $q = useQuasar();
const route = useRoute();
const membersApi = useMembersApi();
const financeApi = useFinanceLoadApi();
const subsApi = useSubscriptionsApi();
const pricingApi = usePricingSettingsApi();
const authStore = useAuthStore();

// El "modo" antiguo pasa a ser la ASOCIACIÓN elegida en el paso 2 (D-01, sin
// toggle de modo). Arranca en null: nada preseleccionado hasta el paso 2.
type Mode = 'renew' | 'misc' | 'alta';
type LoadPaymentMethod = 'cash' | 'transfer' | 'card';

interface MemberSearchOption {
  id: number;
  displayLabel: string;
  statusLabel: string;
  statusColor: string;
  /** Nombre del plan vigente, o null si no tiene. Se muestra bajo el nombre
   *  (UAT caja/cobros 2026-07-21: el badge decía sólo "Activa" y el operador no
   *  sabía QUÉ plan estaba por cobrar). El dato ya venía en el payload de
   *  /members/search — sólo faltaba renderizarlo. */
  planLabel: string | null;
}

// ─── Wizard step state ──────────────────────────────────────────────────────
// 0 = portada, 1 = Socio, 2 = ¿Qué se cobra?, 3 = ¿Cómo se paga?, 4 = Resumen.
const currentStep = ref(0);
const slideDir = ref<'forward' | 'back'>('forward');
const STEP_LABELS = ['Socio', '¿Qué se cobra?', '¿Cómo se paga?', 'Resumen'];

const transitionName = computed(() =>
  slideDir.value === 'forward' ? 'cobro-slide-forward' : 'cobro-slide-back'
);
// prefers-reduced-motion → plain fade instead of the horizontal slide.
const reducedMotion = ref(
  typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

// ─── Form state ───────────────────────────────────────────────────────────
const mode = ref<Mode | null>(null);
const selectedMember = ref<MemberSearchOption | null>(null);
const amount = ref<number | null>(null);
const concepto = ref('');
const paymentMethod = ref<LoadPaymentMethod | null>(null);
// COBRO-01: motivo estructurado del cobro suelto. Default 'sin_plan' (el caso
// operativo principal). Se persiste como columna misc_reason, no en notes.
type MiscReason = 'sin_plan' | 'otro';
const miscReason = ref<MiscReason | null>('sin_plan');
const miscReasonOptions: Array<{ label: string; value: MiscReason }> = [
  { label: 'Sin plan activo', value: 'sin_plan' },
  { label: 'Otro', value: 'otro' },
];
function miscReasonLabel(value: MiscReason): string {
  return miscReasonOptions.find((o) => o.value === value)?.label ?? value;
}

// Step-2 associations (D-01, replaces the old mode toggle). Selecting one sets
// `mode` and drives which endpoint the confirm dispatches.
// Las opciones de asociación se declaran junto al estado de `autocompletar`,
// más abajo: el hint de `renew` depende del vencimiento vigente.

// ─── Alta + plan (Mode C) ─────────────────────────────────────────────────
// Sede elegida del socio (default = sede del profe, editable a sus sedes).
const sucursalId = ref<number | null>(authStore.user?.branchId ?? null);
const branchOptions = ref<BranchOption[]>([]);
// Mini-form de alumno nuevo: visible al tocar "+ Nuevo alumno"; se colapsa al
// elegir un socio existente (typeahead o dedup).
const showNewStudentForm = ref(false);
const newStudent = ref<{ firstName: string; lastName: string; dni: string }>({
  firstName: '',
  lastName: '',
  dni: '',
});
// Dedup por DNI on-blur (≥7 dígitos). El server es la autoridad en Confirmar.
const dedupMatch = ref<DuplicateMatch | null>(null);
const dedupChecking = ref(false);

// Plan grid (por sede) + selección + Zero + turnos fijos (solo planes fixed).
const plans = ref<PlanListItem[]>([]);
const loadingPlans = ref(false);
const selectedPlan = ref<PlanListItem | null>(null);
const zeroPrice = ref(false);
const scheduleIds = ref<number[]>([]);
// IDs de los tickets que ESTA alta creó-nuevo → chip "Nuevo" tras el re-fetch.
const createdNewTicketIds = ref<Set<number>>(new Set());

// ─── Typeahead state ──────────────────────────────────────────────────────
const memberSearchResults = ref<MemberSearchOption[]>([]);
const searchQuery = ref('');
const searchingMembers = ref(false);

// ─── Autocompletar (Mode A) ───────────────────────────────────────────────
const autocompletar = ref<AutocompletarResult | null>(null);
const autocompletando = ref(false);

// Step-2 associations (D-01, replaces the old mode toggle). Selecting one sets
// `mode` and drives which endpoint the confirm dispatches.
//
// El hint de `renew` es dinámico (UAT caja/cobros 2026-07-21): cuando el plan
// sigue vigente, renovar NO pisa el período en curso — la renovación nace
// 'scheduled' y arranca el día del vencimiento. Decirlo explícitamente evita que
// el staff crea que tiene que esperar al vencimiento para cobrar el mes que viene.
const associationOptions = computed<
  Array<{ value: Mode; label: string; hint: string; icon: string }>
>(() => {
  const endDate = autocompletar.value?.currentEndDate ?? null;
  const stillCovered = endDate !== null && endDate > new Date().toISOString().split('T')[0];
  return [
    {
      value: 'renew',
      label: stillCovered ? 'Cobrar próximo período' : 'Renovar plan vigente',
      hint: stillCovered
        ? `Arranca el ${formatDate(endDate)}, al vencer el actual`
        : 'Cobrar la renovación del plan activo',
      icon: 'autorenew',
    },
    {
      value: 'alta',
      label: 'Asignar plan nuevo',
      hint: 'Elegir un plan del catálogo',
      icon: 'add_card',
    },
    {
      value: 'misc',
      label: 'Cobro suelto',
      hint: 'Un cobro sin plan, con motivo',
      icon: 'receipt',
    },
  ];
});

// ─── Mis cargas ───────────────────────────────────────────────────────────
const myLoads = ref<TransactionListItem[]>([]);
const loadingMyLoads = ref(false);

// ─── Submit / idempotency ─────────────────────────────────────────────────
const submitting = ref(false);
// One key per confirmation ATTEMPT (D-09). Generated lazily on the first tap of
// Confirmar for the current form state, reused across retries of that same
// attempt, and regenerated only after an acknowledged success (form reset).
const currentIdempotencyKey = ref<string | null>(null);

const paymentOptions: Array<{ label: string; value: LoadPaymentMethod; icon: string }> = [
  { label: 'Efectivo', value: 'cash', icon: 'payments' },
  { label: 'Transferencia', value: 'transfer', icon: 'swap_horiz' },
  { label: 'Tarjeta', value: 'card', icon: 'credit_card' },
];

const currencySymbol = computed(() => (autocompletar.value?.currency === 'EUR' ? '€' : '$'));
// Monto suffix: alta usa la moneda del plan; renew/misc la del socio.
const montoSymbol = computed(() =>
  mode.value === 'alta' ? altaCurrencySymbol.value : currencySymbol.value
);

// Contexto de alumno nuevo: mini-form abierto sin socio existente adoptado. Un
// alumno nuevo no tiene member id, así que sólo `alta` es válido (WR-01).
const isNewStudentContext = computed(() => showNewStudentForm.value && !selectedMember.value);

// Renovar/Cobro suelto requieren un socio existente. Deshabilitarlos para un
// alumno nuevo evita el callejón sin salida (Confirmar permanentemente
// deshabilitado en misc / paso 2 vacío en renew).
function isAssociationDisabled(value: Mode): boolean {
  return isNewStudentContext.value && (value === 'renew' || value === 'misc');
}

// Selecting a step-2 association: set the mode and (re)load its dependencies.
// Preserves the socio + debt (autocompletar), clears the per-charge fields and
// the idempotency key (deliberate target change → new attempt).
function onSelectAssociation(m: Mode) {
  if (isAssociationDisabled(m)) return;
  if (mode.value === m) return;
  mode.value = m;
  amount.value = null;
  concepto.value = '';
  miscReason.value = 'sin_plan';
  selectedPlan.value = null;
  zeroPrice.value = false;
  scheduleIds.value = [];
  currentIdempotencyKey.value = null;
  if (m === 'alta') {
    if (branchOptions.value.length === 0) void loadBranches();
    void loadAltaPlans();
  }
  if (m === 'renew' && autocompletar.value?.hasRenewable && autocompletar.value.amount != null) {
    amount.value = autocompletar.value.amount;
  }
}

// ─── Accumulated summary (shared CobroResumen: desktop panel + step 4) ──────
const resumenSocio = computed<string | null>(() => {
  if (selectedMember.value) return selectedMember.value.displayLabel;
  if (showNewStudentForm.value) {
    const name = `${newStudent.value.firstName} ${newStudent.value.lastName}`.trim();
    return name || null;
  }
  return null;
});
const resumenQueSecobra = computed<string | null>(() => {
  if (mode.value === 'renew') return autocompletar.value?.planName ?? null;
  if (mode.value === 'alta') return selectedPlan.value?.name ?? null;
  if (mode.value === 'misc') {
    return concepto.value.trim() || (miscReason.value ? miscReasonLabel(miscReason.value) : null);
  }
  return null;
});
const resumenComoPaga = computed<string | null>(() => {
  if (!paymentMethod.value) return null;
  return paymentOptions.find((o) => o.value === paymentMethod.value)?.label ?? null;
});
const resumenCurrency = computed(() =>
  mode.value === 'alta' ? altaCurrency.value : (autocompletar.value?.currency ?? 'ARS')
);
const resumenDebtWarning = computed<string | null>(() => {
  const out = autocompletar.value?.outstanding ?? 0;
  if (out <= 0) return null;
  return `Debe ${formatPrice(out, autocompletar.value?.currency ?? 'ARS')}`;
});
// Sede resuelta (nombre) — sólo para alta, donde el operador elige el branchId
// que se persiste. Para renew/misc el branch lo deriva el server → null (fila
// oculta en CobroResumen).
const resumenSede = computed<string | null>(() => {
  if (mode.value !== 'alta') return null;
  return branchOptions.value.find((b) => b.id === sucursalId.value)?.name ?? null;
});

// ─── Cuenta banco (COBRO-04) ────────────────────────────────────────────────
// Sólo para transferencia/tarjeta: se elige la cuenta banco (type=banco, activa)
// de la MONEDA del cobro. El server (assertChosenBankAccount, Plan 01) es la
// autoridad; acá sólo guiamos y filtramos. Efectivo nunca muestra el selector.
const bankAccounts = ref<Array<{ id: number; name: string; currency: string }>>([]);
const loadingBankAccounts = ref(false);
const selectedBankAccountId = ref<number | null>(null);

const needsBankAccount = computed(
  () => paymentMethod.value === 'transfer' || paymentMethod.value === 'card'
);

const bankAccountOptions = computed(() =>
  bankAccounts.value.map((a) => ({ label: a.name, value: a.id }))
);

// admin/owner ven el atajo "+ Nueva cuenta"; el gate real es ADMIN_ROLES en la
// ruta de creación (150 D-12 / 149 D-04) — acá sólo se oculta el botón.
const canCreateBankAccount = computed(() => {
  const role = authStore.user?.role;
  return role === 'owner' || role === 'admin';
});

async function loadBankAccounts() {
  loadingBankAccounts.value = true;
  try {
    const { accounts } = await financeApi.listBankAccounts(resumenCurrency.value);
    bankAccounts.value = accounts;
  } catch (err: unknown) {
    log.error('Error cargando cuentas bancarias', {
      error: err instanceof Error ? err.message : String(err),
    });
    bankAccounts.value = [];
  } finally {
    loadingBankAccounts.value = false;
  }
}

// ─── Caja destino en efectivo (informativa) ─────────────────────────────────
// Para cash la caja la resuelve el server desde la sede de quien carga (CAJA-01)
// y el body no puede elegirla, así que no hay nada que preguntar — pero el
// operador necesita ver a dónde va la plata (UAT caja/cobros 2026-07-21). null
// cuando no es resolvible: el server cae a la sede del socio y el cobro entra
// igual, así que se omite el cartel en vez de mostrar un error.
const cajaEfectivo = ref<{ id: number; name: string } | null>(null);

async function loadCajaEfectivo() {
  try {
    const { caja } = await financeApi.getCajaEfectivo(resumenCurrency.value);
    cajaEfectivo.value = caja;
  } catch (err: unknown) {
    log.warn('No se pudo resolver la caja de efectivo destino', {
      error: err instanceof Error ? err.message : String(err),
    });
    cajaEfectivo.value = null;
  }
}

// Cargar cuentas al elegir transferencia/tarjeta; la caja al elegir efectivo.
watch(paymentMethod, (m) => {
  if (m === 'transfer' || m === 'card') void loadBankAccounts();
  if (m === 'cash') void loadCajaEfectivo();
});

// Si cambia la moneda del cobro, la cuenta elegida podría quedar de otra moneda:
// se limpia (no debe filtrarse) y se recargan las cuentas de la nueva moneda.
watch(resumenCurrency, () => {
  selectedBankAccountId.value = null;
  if (needsBankAccount.value) void loadBankAccounts();
  if (paymentMethod.value === 'cash') void loadCajaEfectivo();
});

// ─── Alta rápida de cuenta banco (D-08) — sólo admin/owner ──────────────────
// Reusa CuentaBancariaFormDialog (fase 150). El gate visual es admin/owner; la
// autoridad real es ADMIN_ROLES en la ruta de creación (149 D-04).
const showCuentaDialog = ref(false);
const isOwnerUser = computed(() => authStore.user?.role === 'owner');
// El backend fuerza recordedBy=self SOLO para coach (D-07); el resto de los
// roles recibe el listado completo → la UI muestra quién cargó cada cobro.
const isCoachUser = computed(() => authStore.user?.role === 'coach');
// El diálogo pide país (AR/ES); mapeamos desde la moneda del cobro.
const chargeCountry = computed<'AR' | 'ES'>(() => (resumenCurrency.value === 'EUR' ? 'ES' : 'AR'));
const chargeCurrency = computed<'ARS' | 'EUR'>(() =>
  resumenCurrency.value === 'EUR' ? 'EUR' : 'ARS'
);

function openCuentaDialog() {
  showCuentaDialog.value = true;
}

// Al crear la cuenta: cerrar, refetch de la moneda del cobro y auto-seleccionar
// la nueva (la que no estaba antes del refetch).
async function onBankAccountSaved() {
  showCuentaDialog.value = false;
  const beforeIds = new Set(bankAccounts.value.map((a) => a.id));
  await loadBankAccounts();
  const created = bankAccounts.value.find((a) => !beforeIds.has(a.id));
  if (created) selectedBankAccountId.value = created.id;
}

// Payment buttons only render once the per-mode required fields are present, so
// the coach picks a method right before confirming.
const showPaymentMethods = computed(() => {
  if (mode.value === 'renew') {
    return !autocompletando.value && autocompletar.value?.hasRenewable === true;
  }
  if (mode.value === 'alta') {
    return selectedPlan.value != null;
  }
  return true;
});

const canConfirm = computed(() => {
  if (!paymentMethod.value) return false;
  if (!amount.value || amount.value <= 0) return false;
  // Transferencia/tarjeta requieren cuenta banco (el server igual la valida).
  if (needsBankAccount.value && selectedBankAccountId.value == null) return false;

  if (mode.value === 'alta') {
    const hasAlumno = selectedMember.value != null || newStudentValid.value;
    if (!hasAlumno || sucursalId.value == null || !selectedPlan.value) return false;
    if (selectedPlan.value.bookingMode === 'fixed') {
      return scheduleIds.value.length === (selectedPlan.value.classesPerWeek ?? 0);
    }
    return true;
  }

  if (!selectedMember.value) return false;
  if (mode.value === 'renew') {
    return autocompletar.value?.hasRenewable === true;
  }
  if (mode.value === 'misc') {
    return concepto.value.trim().length > 0 && miscReason.value != null;
  }
  return false;
});

const confirmarLabel = computed(() => {
  if (amount.value && amount.value > 0) {
    const cur =
      mode.value === 'alta' ? altaCurrency.value : (autocompletar.value?.currency ?? 'ARS');
    return `Confirmar · ${formatPrice(amount.value, cur)}`;
  }
  return 'Confirmar';
});

// ─── Per-step gating + primary action ──────────────────────────────────────
const canContinueStep = computed(() => {
  switch (currentStep.value) {
    case 1:
      return selectedMember.value != null || newStudentValid.value;
    case 2:
      if (mode.value === 'renew') return autocompletar.value?.hasRenewable === true;
      if (mode.value === 'alta') {
        if (!selectedPlan.value) return false;
        if (selectedPlan.value.bookingMode === 'fixed') {
          return scheduleIds.value.length === (selectedPlan.value.classesPerWeek ?? 0);
        }
        return true;
      }
      if (mode.value === 'misc') {
        return (
          selectedMember.value != null &&
          concepto.value.trim().length > 0 &&
          miscReason.value != null
        );
      }
      return false;
    case 3:
      if (paymentMethod.value == null || !amount.value || amount.value <= 0) return false;
      if (needsBankAccount.value && selectedBankAccountId.value == null) return false;
      return true;
    default:
      return false;
  }
});

const primaryActionLabel = computed(() =>
  currentStep.value >= 4 ? confirmarLabel.value : 'Continuar'
);
const primaryActionDisabled = computed(() =>
  currentStep.value >= 4 ? !canConfirm.value || submitting.value : !canContinueStep.value
);
function onPrimaryAction() {
  if (currentStep.value >= 4) {
    void onConfirm();
  } else {
    goNext();
  }
}

// ─── Wizard navigation + abandon guard ──────────────────────────────────────
const formHasData = computed(
  () =>
    selectedMember.value != null ||
    showNewStudentForm.value ||
    !!amount.value ||
    concepto.value.trim().length > 0 ||
    selectedPlan.value != null ||
    paymentMethod.value != null ||
    mode.value != null
);

const abandonDialog = ref(false);
let onAbandonConfirm: (() => void) | null = null;
let onAbandonCancel: (() => void) | null = null;

function openAbandon(confirmFn: () => void, cancelFn: () => void) {
  onAbandonConfirm = confirmFn;
  onAbandonCancel = cancelFn;
  abandonDialog.value = true;
}
function confirmAbandon() {
  abandonDialog.value = false;
  const fn = onAbandonConfirm;
  onAbandonConfirm = null;
  onAbandonCancel = null;
  fn?.();
}
function cancelAbandon() {
  abandonDialog.value = false;
  const fn = onAbandonCancel;
  onAbandonConfirm = null;
  onAbandonCancel = null;
  fn?.();
}

function startCobro() {
  slideDir.value = 'forward';
  currentStep.value = 1;
}
function goNext() {
  if (currentStep.value >= 4) return;
  slideDir.value = 'forward';
  currentStep.value += 1;
}
function goBack() {
  if (currentStep.value <= 1) {
    if (formHasData.value) {
      openAbandon(
        () => resetToPortada(),
        () => {}
      );
    } else {
      resetToPortada();
    }
    return;
  }
  slideDir.value = 'back';
  currentStep.value -= 1;
}
function resetToPortada() {
  resetForm();
  mode.value = null;
  slideDir.value = 'back';
  currentStep.value = 0;
}

// Guard browser/route navigation away from a wizard mid-flow with data.
onBeforeRouteLeave((_to, _from, next) => {
  if (currentStep.value >= 1 && formHasData.value) {
    openAbandon(
      () => next(),
      () => next(false)
    );
  } else {
    next();
  }
});

// ─── Progress-header helpers ────────────────────────────────────────────────
function stepLabelClass(n: number): string {
  if (currentStep.value === n) return 'text-primary';
  if (currentStep.value > n) return 'text-grey-8';
  return 'text-grey-6';
}

// ─── Alta helpers ─────────────────────────────────────────────────────────
const dedupMatchName = computed(() => {
  const m = dedupMatch.value;
  if (!m) return '';
  return `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || `#${m.id}`;
});

async function loadBranches() {
  try {
    branchOptions.value = await membersApi.getBranches();
    if (sucursalId.value == null || !branchOptions.value.some((b) => b.id === sucursalId.value)) {
      sucursalId.value = branchOptions.value[0]?.id ?? sucursalId.value;
    }
  } catch (err: unknown) {
    log.error('Error cargando sucursales', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function resetAltaFields() {
  showNewStudentForm.value = false;
  newStudent.value = { firstName: '', lastName: '', dni: '' };
  dedupMatch.value = null;
  dedupChecking.value = false;
  selectedPlan.value = null;
  zeroPrice.value = false;
  scheduleIds.value = [];
}

function onNuevoAlumno() {
  selectedMember.value = null;
  resetChargeFields();
  showNewStudentForm.value = true;
  dedupMatch.value = null;
}

async function onDniBlur() {
  const dni = newStudent.value.dni.trim();
  dedupMatch.value = null;
  if (dni.length < 7) return;
  dedupChecking.value = true;
  try {
    const { matches } = await membersApi.checkDuplicates({ dni });
    const dniMatch = matches.find((m) => m.matchedField === 'dni' && !m.deletedAt);
    dedupMatch.value = dniMatch ?? null;
  } catch (err: unknown) {
    log.error('Error verificando DNI', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    dedupChecking.value = false;
  }
}

function onUsarExistente() {
  const m = dedupMatch.value;
  if (!m) return;
  selectedMember.value = {
    id: m.id,
    displayLabel: dedupMatchName.value,
    statusLabel: m.status ?? 'Sin plan',
    statusColor: 'grey',
    // El match de dedup no trae el plan; el banner del paso 1 lo resuelve vía
    // autocompletar, que se dispara justo abajo.
    planLabel: null,
  };
  resetAltaFields();
  // WR-02: adoptar un socio existente vía dedup debe cargar su autocompletar
  // (deuda POS-01, pre-fill de renovación, moneda del cobro) igual que el
  // typeahead (onMemberSelected).
  void loadAutocompletar(m.id);
}

function onSucursalChange() {
  selectedPlan.value = null;
  scheduleIds.value = [];
  currentIdempotencyKey.value = null;
  void loadAltaPlans();
}

// ─── Alta: plan grid + precio + turnos ────────────────────────────────────
const hasAlumnoContext = computed(
  () => selectedMember.value != null || (mode.value === 'alta' && showNewStudentForm.value)
);

const newStudentValid = computed(
  () =>
    showNewStudentForm.value &&
    newStudent.value.firstName.trim().length > 0 &&
    newStudent.value.lastName.trim().length > 0 &&
    newStudent.value.dni.trim().length >= 7
);

interface TierGroup {
  tier: PlanTier;
  plans: PlanListItem[];
}

// UAT caja/cobros 2026-07-21: el catálogo del país entero (presencial + online +
// especial) se renderizaba en una sola grilla, y llegar al picker de turnos que
// va abajo obligaba a scrollear toda la lista. El filtro colapsa la grilla al
// grupo que el operador está cobrando. 'presencial' arranca preseleccionado
// porque es el caso dominante en el mostrador; las pestañas sin planes no se
// muestran, así que una sede sólo-presencial no ve ruido.
type PlanGroupFilter = 'presencial' | 'online' | 'especial';

function planGroupOf(p: PlanListItem): PlanGroupFilter {
  if (p.planCategory === 'presencial') return 'presencial';
  if (p.planCategory === 'especial') return 'especial';
  return 'online';
}

const PLAN_GROUP_LABELS: Record<PlanGroupFilter, string> = {
  presencial: 'Presencial',
  online: 'Online',
  especial: 'Especiales',
};

const planGroupFilter = ref<PlanGroupFilter>('presencial');

/** Grupos con al menos un plan, en orden fijo. Vacío mientras cargan. */
const planGroupTabs = computed<Array<{ value: PlanGroupFilter; label: string }>>(() => {
  const order: PlanGroupFilter[] = ['presencial', 'online', 'especial'];
  return order
    .filter((g) => plans.value.some((p) => planGroupOf(p) === g))
    .map((g) => ({ value: g, label: PLAN_GROUP_LABELS[g] }));
});

// Si el grupo activo se queda sin planes (cambio de sede/país), caer al primero
// disponible para no mostrar una grilla vacía con planes cargados.
watch(planGroupTabs, (tabs) => {
  if (tabs.length > 0 && !tabs.some((t) => t.value === planGroupFilter.value)) {
    planGroupFilter.value = tabs[0].value;
  }
});

const plansByTier = computed((): TierGroup[] => {
  const tierOrder: PlanTier[] = ['flex', 'foundation', 'performance', 'other'];
  const groups: TierGroup[] = [];
  const visible = plans.value.filter((p) => planGroupOf(p) === planGroupFilter.value);
  for (const tier of tierOrder) {
    const tierPlans = visible.filter((p) => p.planTier === tier);
    if (tierPlans.length > 0) groups.push({ tier, plans: tierPlans });
  }
  return groups;
});

const multiBranchOptions = computed(() =>
  branchOptions.value.filter((b) => !b.isVirtual).map((b) => ({ id: b.id, name: b.name }))
);

const altaCurrency = computed(() => selectedPlan.value?.currency ?? 'ARS');
const altaCurrencySymbol = computed(() => (altaCurrency.value === 'EUR' ? '€' : '$'));

// ALUM-03 / D-04: la regla de recargo por tarjeta. Default conservador OFF: si
// no se pudo confirmar que está activa, NO aplicamos el precio de tarjeta (para
// no cobrar de más). La defensa real es server-side (plan 02); acá la UI se
// mantiene consistente con el server. Se inicializa en onMounted.
const cardSurchargeEnabled = ref(false);

// D-05: regla de Precio Zero. Default conservador OFF: con la regla apagada se
// esconde el toggle Zero (el server ya normaliza zero→regular — 156-01). Con el
// toggle oculto, `zeroPrice` queda en false y el payload viaja `zero:false`.
const zeroPriceEnabled = ref(false);

function getBasePriceFor(plan: PlanListItem, method: LoadPaymentMethod, zero: boolean): number {
  if (method === 'card' && cardSurchargeEnabled.value) {
    return plan.priceCreditCard ?? plan.priceRegular;
  }
  return zero ? plan.priceZero : plan.priceRegular;
}

const altaPrice = computed(() => {
  if (!selectedPlan.value || !paymentMethod.value) return 0;
  return getBasePriceFor(selectedPlan.value, paymentMethod.value, zeroPrice.value);
});

const isAltaPartial = computed(
  () => altaPrice.value > 0 && amount.value != null && amount.value < altaPrice.value
);

function tierLabel(tier: PlanTier): string {
  return PLAN_TIER_LABELS[tier] ?? tier;
}

function tierColor(tier: PlanTier): string {
  const colors: Record<PlanTier, string> = {
    flex: 'blue',
    foundation: 'teal',
    performance: 'deep-purple',
    other: 'grey',
  };
  return colors[tier] ?? 'grey';
}

function selectPlan(plan: PlanListItem) {
  selectedPlan.value = plan;
  scheduleIds.value = [];
  // WR-04: cambiar de plan es un nuevo target → nueva idempotency key, para que
  // un reintento tras un éxito perdido no sea no-op contra el plan anterior.
  currentIdempotencyKey.value = null;
}

async function loadAltaPlans() {
  if (sucursalId.value == null) {
    plans.value = [];
    return;
  }
  loadingPlans.value = true;
  try {
    plans.value = await subsApi.getPlans(true, { branchId: sucursalId.value });
  } catch (err: unknown) {
    log.error('Error cargando planes', {
      error: err instanceof Error ? err.message : String(err),
    });
    plans.value = [];
  } finally {
    loadingPlans.value = false;
  }
}

// Monto autocalculado: plan × medio de pago × Zero. Editable después a mano.
// `cardSurchargeEnabled` es dependencia (WR-03): arranca en false y se resuelve
// async en onMounted; sin ella, si la regla llega DESPUÉS de elegir plan+tarjeta
// el monto queda con precio regular y no se recalcula → cobro parcial / deuda
// fantasma por el recargo.
watch([selectedPlan, paymentMethod, zeroPrice, cardSurchargeEnabled], () => {
  if (mode.value !== 'alta') return;
  if (selectedPlan.value && paymentMethod.value) {
    amount.value = altaPrice.value;
  }
});

// ─── Typeahead ────────────────────────────────────────────────────────────
// Mapea un socio (resultado de búsqueda o perfil por id) al shape del selector.
// Compartido por el typeahead y el prefill del deep-link `?memberId=` (ALUM-02).
function buildMemberOption(m: {
  id: number;
  firstName: string | null;
  lastName: string | null;
  dni: string | null;
  planName: string | null;
  status: UserStatus | null;
}): MemberSearchOption {
  let statusLabel = 'Sin plan';
  let statusColor = 'grey';
  if (m.planName) {
    if (m.status === 'activo') {
      statusLabel = 'Activa';
      statusColor = 'positive';
    } else {
      statusLabel = 'Inactiva';
      statusColor = 'negative';
    }
  }
  return {
    id: m.id,
    displayLabel:
      `${m.firstName ?? ''} ${m.lastName ?? ''}${m.dni ? ` (${m.dni})` : ''}`.trim() || `#${m.id}`,
    statusLabel,
    statusColor,
    planLabel: m.planName,
  };
}

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
    .searchMembers(val, 15)
    .then((members) => {
      update(() => {
        memberSearchResults.value = members.map((m) => buildMemberOption(m));
      });
    })
    .catch((err: unknown) => {
      log.error('Error buscando socios', {
        error: err instanceof Error ? err.message : String(err),
      });
      update(() => {
        memberSearchResults.value = [];
      });
    })
    .finally(() => {
      searchingMembers.value = false;
    });
}

// ─── Selection / mode ─────────────────────────────────────────────────────
function resetChargeFields() {
  amount.value = null;
  concepto.value = '';
  miscReason.value = 'sin_plan';
  autocompletar.value = null;
  // A deliberate change of target = a new charge → new idempotency key.
  currentIdempotencyKey.value = null;
}

async function onMemberSelected() {
  resetChargeFields();
  resetAltaFields();
  if (!selectedMember.value) return;
  await loadAutocompletar(selectedMember.value.id);
}

async function loadAutocompletar(userId: number) {
  autocompletando.value = true;
  try {
    const res = await financeApi.getAutocompletar(userId);
    autocompletar.value = res;
    if (mode.value === 'renew' && res.hasRenewable && res.amount != null) {
      amount.value = res.amount;
    }
  } catch (err: unknown) {
    log.error('Error en autocompletar', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudo cargar el plan del socio.' });
  } finally {
    autocompletando.value = false;
  }
}

// ─── Confirmar (idempotent submit) ────────────────────────────────────────
async function onConfirm() {
  if (!mode.value) return;
  if (!canConfirm.value || !paymentMethod.value || !amount.value) {
    return;
  }
  if (mode.value !== 'alta' && !selectedMember.value) {
    return;
  }
  if (mode.value === 'misc' && miscReason.value == null) {
    return;
  }
  // Generate the idempotency key once per attempt; reuse on retry.
  if (!currentIdempotencyKey.value) {
    currentIdempotencyKey.value = crypto.randomUUID();
  }
  const idempotencyKey = currentIdempotencyKey.value;

  // COBRO-04: sólo transferencia/tarjeta llevan cuenta banco; efectivo nunca.
  const chosenBankAccountId =
    needsBankAccount.value && selectedBankAccountId.value != null
      ? selectedBankAccountId.value
      : undefined;

  submitting.value = true;
  try {
    if (mode.value === 'renew') {
      await financeApi.payPlan({
        userId: selectedMember.value!.id,
        amountReceived: amount.value,
        paymentMethod: paymentMethod.value,
        idempotencyKey,
        ...(chosenBankAccountId != null ? { bankAccountId: chosenBankAccountId } : {}),
      });
    } else if (mode.value === 'misc') {
      await financeApi.miscCharge({
        memberId: selectedMember.value!.id,
        amount: amount.value,
        concepto: concepto.value.trim(),
        paymentMethod: paymentMethod.value,
        currency: autocompletar.value?.currency ?? 'ARS',
        idempotencyKey,
        miscReason: miscReason.value ?? 'sin_plan',
        ...(chosenBankAccountId != null ? { bankAccountId: chosenBankAccountId } : {}),
      });
    } else {
      // ALTA + plan: alumno existente (userId) XOR alumno nuevo (firstName+...).
      if (sucursalId.value == null || !selectedPlan.value) return;
      const alumno = selectedMember.value
        ? { userId: selectedMember.value.id }
        : {
            firstName: newStudent.value.firstName.trim(),
            lastName: newStudent.value.lastName.trim(),
            dni: newStudent.value.dni.trim(),
          };
      const body: CoachAltaInput = {
        ...alumno,
        branchId: sucursalId.value,
        planId: selectedPlan.value.id,
        zero: zeroPrice.value,
        paymentMethod: paymentMethod.value,
        amountReceived: amount.value,
        idempotencyKey,
        ...(selectedPlan.value.bookingMode === 'fixed' ? { scheduleIds: scheduleIds.value } : {}),
        ...(chosenBankAccountId != null ? { bankAccountId: chosenBankAccountId } : {}),
      };
      const resp = await financeApi.altaConPlan(body);
      if (resp.createdNew && resp.transaction) {
        createdNewTicketIds.value = new Set(createdNewTicketIds.value).add(resp.transaction.id);
      }
    }
    const successMsg =
      mode.value === 'alta'
        ? 'Alumno y plan cargados — pendiente de validación'
        : 'Cobro registrado — pendiente de validación';
    $q.notify({ type: 'positive', message: successMsg });
    await refreshMyLoads();
    resetForm();
    resetToPortada();
  } catch (err: unknown) {
    // Retry re-uses the SAME key, so a load that actually succeeded server-side
    // before a timeout is a safe idempotent no-op on the next tap.
    const message = extractError(err, 'No se pudo registrar el cobro. Reintentá.');
    if (isExpectedClientError(err)) {
      // Business rejection (400/409), e.g. "Ya existe una renovación
      // programada." — show the backend's actionable message and log as warn
      // (console only, not Sentry). "Reintentá" would be misleading here.
      log.warn('Cobro rechazado', { error: message });
    } else {
      log.error('Error registrando cobro', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    $q.notify({ type: 'negative', message });
  } finally {
    submitting.value = false;
  }
}

function resetForm() {
  selectedMember.value = null;
  resetChargeFields();
  resetAltaFields();
  paymentMethod.value = null;
  bankAccounts.value = [];
  selectedBankAccountId.value = null;
  memberSearchResults.value = [];
  searchQuery.value = '';
}

// ─── Mis cargas list ──────────────────────────────────────────────────────
async function refreshMyLoads() {
  loadingMyLoads.value = true;
  try {
    const result = await financeApi.listMyLoads();
    myLoads.value = result.rows;
  } catch (err: unknown) {
    log.error('Error cargando mis cargas', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loadingMyLoads.value = false;
  }
}

function ticketConcept(ticket: TransactionListItem): string {
  if (ticket.kind === 'advance_payment') {
    return ticket.notes ?? 'Cobro suelto';
  }
  return 'Pago de plan';
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Listado agrupado por día (COBRO-03) ────────────────────────────────────
interface LoadDayGroup {
  key: string;
  label: string;
  rows: TransactionListItem[];
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(d: Date): string {
  if (Number.isNaN(d.getTime())) return 'invalid';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d: Date): string {
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return 'Hoy';
  if (sameDay(d, yesterday)) return 'Ayer';
  // p.ej. "mar 1 jul" (es-AR). Se limpian los puntos de las abreviaturas.
  return d
    .toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '');
}

// myLoads ya viene ordenado por recencia; el grouping preserva ese orden.
const groupedLoads = computed<LoadDayGroup[]>(() => {
  const groups: LoadDayGroup[] = [];
  const byKey = new Map<string, LoadDayGroup>();
  for (const t of myLoads.value) {
    const d = new Date(t.createdAt);
    const key = dayKey(d);
    let g = byKey.get(key);
    if (!g) {
      g = { key, label: dayLabel(d), rows: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.rows.push(t);
  }
  return groups;
});

function methodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

function methodColor(method: PaymentMethod): string {
  return PAYMENT_METHOD_COLORS[method] ?? 'grey';
}

// ALUM-03 / D-04: cargar la regla de recargo por tarjeta (default OFF si falla).
async function loadCardSurchargeRule() {
  try {
    cardSurchargeEnabled.value = await pricingApi.getCardSurchargeEnabled();
  } catch (err: unknown) {
    // Conservador: OFF ante error → no aplicar un recargo que no pudimos confirmar.
    cardSurchargeEnabled.value = false;
    log.error('Error cargando la regla de recargo por tarjeta', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// D-05: cargar la regla de Precio Zero (default OFF si falla → esconde el toggle).
async function loadZeroPriceRule() {
  try {
    zeroPriceEnabled.value = await pricingApi.getZeroPriceEnabled();
  } catch (err: unknown) {
    // Conservador: OFF ante error → no ofrecer una opción que no pudimos confirmar.
    zeroPriceEnabled.value = false;
    log.error('Error cargando la regla de Precio Zero', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ALUM-02 / D-02: deep-link `/cobros?memberId={id}`. Preselecciona el socio y
// entra al paso Socio del wizard. Un id inexistente/ajeno → toast + flujo normal
// (no rompe la página; searchMembers/getMember ya están scoped server-side).
async function applyMemberDeepLink() {
  const raw = route.query.memberId;
  const memberIdStr = typeof raw === 'string' ? raw.trim() : '';
  if (!memberIdStr) return;
  const memberId = Number(memberIdStr);
  if (!Number.isInteger(memberId) || memberId <= 0) return;
  try {
    const m = await membersApi.getMember(memberId);
    selectedMember.value = buildMemberOption(m);
    resetAltaFields();
    await loadAutocompletar(m.id);
    // Entrar al paso Socio (no dejar el wizard en la portada 0).
    slideDir.value = 'forward';
    currentStep.value = 1;
  } catch (err: unknown) {
    log.error('Error preseleccionando socio del deep-link', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({
      type: 'negative',
      message: 'No se encontró el socio indicado. Podés buscarlo manualmente.',
    });
  }
}

onMounted(() => {
  void loadCardSurchargeRule();
  void loadZeroPriceRule();
  void applyMemberDeepLink();
});

// Initial load of the coach's recent loads for the portada listado.
void refreshMyLoads();
// Pre-cargar las sedes accesibles para el selector de Sede del alta.
void loadBranches();
</script>

<style scoped lang="scss">
.cobros-cta {
  display: block;
  width: 100%;
  max-width: 560px;
}

.cobros-body--desktop {
  gap: 32px; // xl column gap
  align-items: flex-start;
}

.cobros-step-col {
  flex: 1 1 auto;
  width: 100%;
  max-width: 560px;
}

.cobros-summary-col {
  flex: 0 0 320px;
  width: 320px;
}

.cobros-summary-panel {
  position: sticky;
  top: 88px;
  border-radius: 8px;
}

.cobros-progress {
  border-radius: 8px;
}

.cobros-day-header {
  position: sticky;
  top: 0;
  z-index: 1;
  border-radius: 8px;
}

.cobros-sticky-action {
  width: 100%;
  max-width: 560px;
  padding: 0 16px;
}

.cobros-step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 14px;

  &.is-current {
    background: var(--q-primary);
    color: white;
  }

  &.is-future {
    color: inherit;
    opacity: 0.55;
    border: 1px solid currentColor;
  }
}

// Step transitions — 200ms ease-out horizontal slide.
.cobro-slide-forward-enter-active,
.cobro-slide-forward-leave-active,
.cobro-slide-back-enter-active,
.cobro-slide-back-leave-active {
  transition:
    transform 200ms ease-out,
    opacity 200ms ease-out;
}
.cobro-slide-forward-enter-from {
  transform: translateX(24px);
  opacity: 0;
}
.cobro-slide-forward-leave-to {
  transform: translateX(-24px);
  opacity: 0;
}
.cobro-slide-back-enter-from {
  transform: translateX(-24px);
  opacity: 0;
}
.cobro-slide-back-leave-to {
  transform: translateX(24px);
  opacity: 0;
}

.cobro-fade-enter-active,
.cobro-fade-leave-active {
  transition: opacity 150ms ease-out;
}
.cobro-fade-enter-from,
.cobro-fade-leave-to {
  opacity: 0;
}

// Respect reduced-motion: no horizontal travel, plain fade.
@media (prefers-reduced-motion: reduce) {
  .cobro-slide-forward-enter-active,
  .cobro-slide-forward-leave-active,
  .cobro-slide-back-enter-active,
  .cobro-slide-back-leave-active {
    transition: opacity 120ms ease-out;
  }
  .cobro-slide-forward-enter-from,
  .cobro-slide-forward-leave-to,
  .cobro-slide-back-enter-from,
  .cobro-slide-back-leave-to {
    transform: none;
  }
}
</style>
