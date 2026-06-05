<template>
  <q-page class="q-pa-md">
    <!-- Back button -->
    <q-btn flat icon="arrow_back" label="Volver a Alumnos" class="q-mb-md" @click="goBack" />

    <!-- Loading -->
    <div v-if="pageLoading" class="flex flex-center q-pa-xl">
      <q-spinner-dots size="50px" color="primary" />
    </div>

    <!-- Error -->
    <div v-else-if="pageError" class="text-center q-pa-xl text-negative">
      <q-icon name="error" size="xl" class="q-mb-md" />
      <div class="text-h6">{{ pageError }}</div>
    </div>

    <!-- Detail content -->
    <template v-else-if="memberProfile">
      <!-- ========================================== -->
      <!-- Header Card -->
      <!-- ========================================== -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row items-center q-gutter-md">
            <!-- Photo + Level badge -->
            <div class="relative-position">
              <MemberPhotoUpload
                :userId="memberProfile.id"
                :currentPhotoUrl="memberProfile.photoUrl"
                @uploaded="onPhotoUploaded"
              />
              <q-badge
                rounded
                floating
                :color="levelColor(memberProfile.level)"
                :label="greekLevel(memberProfile.level)"
                class="text-weight-bold"
                style="font-size: 14px; bottom: 28px; right: -4px"
              />
            </div>

            <!-- Name and details -->
            <div class="col">
              <div class="text-h5">{{ memberName }}</div>
              <div class="text-caption text-grey-7">
                {{ levelDisplayName(memberProfile.level) }} ·
                {{ memberProfile.branchName }}
              </div>
              <!-- Phase 103 R10: 4-state badge from users.status (was binary
                   isActive). For status='prueba' the label embeds the trial
                   counter ("En Prueba (0/1)" / "En Prueba (1/1)") via the
                   hasUsedTrial flag — replaces the standalone Phase 102 trial
                   chip.
                   Phase 111 D-27: segment + avatarType badges moved here so
                   "Freemium Ghost" (status + segment) appear pegados in a
                   single row under the name. The right column keeps only the
                   action buttons. -->
              <div class="row items-center q-gutter-xs q-mt-xs">
                <q-badge
                  :color="getStatusColor(memberProfile.status)"
                  :label="getStatusLabel(memberProfile.status, memberProfile.hasUsedTrial)"
                  class="text-body2"
                />
                <q-badge
                  v-if="memberProfile.segment"
                  :color="SEGMENT_COLORS[memberProfile.segment as MemberSegment] ?? 'grey'"
                  :label="
                    SEGMENT_LABELS[memberProfile.segment as MemberSegment] ?? memberProfile.segment
                  "
                  outline
                  class="text-body2"
                >
                  <q-tooltip v-if="memberProfile.segmentUpdatedAt">
                    Actualizado: {{ formatDate(memberProfile.segmentUpdatedAt) }}
                  </q-tooltip>
                </q-badge>
                <q-badge
                  v-if="memberProfile.avatarType"
                  color="primary"
                  :label="AVATAR_LABELS[memberProfile.avatarType] ?? memberProfile.avatarType"
                  outline
                  class="text-body2"
                >
                  <q-tooltip>Avatar: {{ memberProfile.avatarType }}</q-tooltip>
                </q-badge>
              </div>
            </div>

            <div class="column items-end q-gutter-sm">
              <q-btn
                flat
                icon="edit"
                label="Editar"
                color="primary"
                @click="showEditDialog = true"
              />
              <!-- Freemium → sesión de prueba: pulls a self-registered member
                   into the lead pipeline. Mirrors the prueba→activo conversion
                   (Gestionar Plan) but in the other direction. -->
              <q-btn
                v-if="memberProfile.status === 'freemium'"
                flat
                icon="how_to_reg"
                label="Convertir a sesión de prueba"
                color="primary"
                no-caps
                @click="openConvertDialog"
              />
              <q-btn
                v-if="canDeleteMember"
                flat
                icon="delete_outline"
                label="Eliminar"
                color="negative"
                :loading="deleting"
                @click="showDeleteDialog = true"
              />
            </div>
          </div>
        </q-card-section>

        <!-- Phase 99 R11: session-level counts over last 30 days (hidden if empty, D-18) -->
        <q-card-section
          v-if="sessionLevelCounts.length > 0"
          class="session-levels q-pt-none"
          data-session-levels
        >
          <div class="text-caption text-grey-7 q-mb-xs">Ultimos 30 dias</div>
          <div class="row q-gutter-xs">
            <q-chip
              v-for="entry in sessionLevelCounts"
              :key="entry.level"
              :color="levelColor(entry.level)"
              text-color="white"
              size="sm"
              dense
            >
              {{ entry.count }} {{ levelDisplayName(entry.level) }}
            </q-chip>
          </div>
        </q-card-section>
      </q-card>

      <!-- Prueba-only row: 3 cols (banner | Datos de Lead | Sesión de Prueba).
           Consolidates what used to be three stacked full-width sections so
           the admin sees the whole lead context in a single horizontal scan.
           In mobile (col-12) they stack vertically — same content, no loss. -->
      <div v-if="memberProfile.status === 'prueba'" class="row q-col-gutter-md q-mt-md">
        <!-- Col 1: conversion banner (datos incompletos).
             Original bg-warning (yellow) kept per design call; only text +
             icons + button switched to white so the previous dark-on-yellow
             that was hard to scan reads cleanly. -->
        <div class="col-12 col-md-4">
          <q-banner class="bg-warning text-white full-height" rounded>
            <template #avatar>
              <q-icon name="fact_check" color="white" />
            </template>
            <div class="text-weight-medium">Alumno en prueba — datos incompletos</div>
            <div class="text-caption q-mt-xs">
              Completá email, DNI y el resto de los datos para que pueda usar la app, y asignale un
              plan para convertirlo en alumno activo.
            </div>
            <template #action>
              <q-btn
                unelevated
                color="white"
                text-color="warning"
                label="Completar y convertir"
                no-caps
                @click="showEditDialog = true"
              />
            </template>
          </q-banner>
        </div>

        <!-- Col 2: Datos de Lead (inline-edit pattern from Plan 06) -->
        <div class="col-12 col-md-4">
          <q-card class="q-pa-md full-height" flat bordered>
            <div class="text-subtitle1 text-weight-bold q-mb-sm">Datos de Lead</div>

            <q-select
              v-model="leadDraft.leadStatus"
              :options="LEAD_STATUS_OPTIONS"
              emit-value
              map-options
              label="Estado del Lead"
              outlined
              dense
              :loading="savingLeadStatus"
              @update:model-value="onSaveLeadStatus"
            />

            <q-input
              v-model="leadDraft.leadNotes"
              type="textarea"
              label="Comentarios"
              outlined
              autogrow
              maxlength="2000"
              :loading="savingLeadNotes"
              class="q-mt-sm"
              @blur="onSaveLeadNotes"
            />

            <!-- Phone + WhatsApp deep-link. Receptionist captures phone at
                 soft-register so it's almost always present; if missing
                 (legacy lead) we just render '—' and hide the WA button. -->
            <div class="q-mt-sm row items-center q-gutter-sm">
              <q-icon name="phone" size="18px" class="text-grey-7" />
              <div class="text-body2">
                {{ memberProfile.phone ?? '—' }}
              </div>
              <q-btn
                v-if="memberProfile.phone"
                flat
                dense
                round
                color="green-7"
                size="sm"
                @click="openWhatsapp(memberProfile.phone)"
              >
                <WhatsappIcon />
                <q-tooltip>Abrir WhatsApp</q-tooltip>
              </q-btn>
            </div>

            <div class="q-mt-sm text-caption text-grey-7">
              Gestiona: <strong>{{ memberProfile.createdBy?.name ?? '—' }}</strong>
            </div>
          </q-card>
        </div>

        <!-- Col 3: Sesión de Prueba — shows the latest trial booking + a link
             into Horarios to cancel/reassign. Both past and future trials
             surface here: past no-shows render the "No asistió" chip and
             the CTA copy switches to "Asignar nueva sesión". -->
        <div class="col-12 col-md-4">
          <q-card class="q-pa-md full-height" flat bordered>
            <div class="text-subtitle1 text-weight-bold q-mb-sm">Sesión de Prueba</div>

            <template v-if="memberProfile.latestTrial">
              <div class="row items-center q-gutter-sm q-mb-xs">
                <q-icon name="event" size="20px" class="text-grey-7" />
                <div class="text-body2">
                  <strong>{{ formatDate(memberProfile.latestTrial.bookingDate) }}</strong>
                  <span class="q-ml-xs">a las {{ memberProfile.latestTrial.startTime }}</span>
                </div>
              </div>
              <div class="row items-center q-gutter-sm q-mb-sm">
                <q-icon name="place" size="20px" class="text-grey-7" />
                <div class="text-body2">{{ memberProfile.latestTrial.branchName }}</div>
              </div>
              <div class="q-mb-sm">
                <q-chip
                  v-if="memberProfile.latestTrial.attended === 'si'"
                  color="positive"
                  text-color="white"
                  dense
                  label="Asistió"
                />
                <q-chip
                  v-else-if="memberProfile.latestTrial.attended === 'no'"
                  color="negative"
                  text-color="white"
                  dense
                  label="No asistió"
                />
                <q-chip v-else color="grey-6" text-color="white" dense label="Pendiente" />
              </div>
            </template>
            <div v-else class="text-grey-6 text-italic q-mb-sm">
              Sin sesión de prueba registrada
            </div>

            <!-- Deep-link into Horarios with the trial's date so the modal
                 opens already showing this alumno's row. trialDate is
                 omitted when there's no booking yet — the dialog falls
                 back to today and the admin can assign a fresh one. -->
            <q-btn
              outline
              color="primary"
              :label="
                memberProfile.latestTrial
                  ? memberProfile.latestTrial.attended === 'no'
                    ? 'Asignar nueva sesión'
                    : 'Modificar en Horarios'
                  : 'Asignar sesión de prueba'
              "
              icon="schedule"
              no-caps
              dense
              :to="{
                path: '/horarios',
                query: memberProfile.latestTrial
                  ? { openTrials: '1', trialDate: memberProfile.latestTrial.bookingDate }
                  : { openTrials: '1' },
              }"
            />
          </q-card>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- Tabs (hidden for alumnos en prueba — they have no plan/training/
           finanzas data yet, and the 3-col prueba block above carries the
           only actionable context). Becomes visible automatically once
           status flips to activo/inactivo/freemium via "Completar y
           convertir".  -->
      <!-- ========================================== -->
      <template v-if="memberProfile.status !== 'prueba'">
        <q-tabs
          v-model="activeTab"
          dense
          align="left"
          class="text-grey-8"
          active-color="primary"
          indicator-color="primary"
        >
          <q-tab name="perfil" label="Perfil" />
          <q-tab name="entrenamiento" label="Entrenamiento" />
          <q-tab name="notas" label="Notas" />
          <q-tab name="suscripcion">
            <div class="q-tab__label">Suscripcion</div>
            <q-badge
              v-if="memberHasDebt"
              color="negative"
              floating
              rounded
              text-color="white"
              class="debtor-tab-badge"
            >
              D
            </q-badge>
          </q-tab>
          <q-tab name="programas" label="Programas" />
          <q-tab name="asistencia" label="Asistencia" />
          <q-tab name="finanzas" label="Finanzas" />
        </q-tabs>
        <q-separator />

        <q-tab-panels v-model="activeTab" animated class="q-mt-md">
          <!-- Perfil Tab -->
          <q-tab-panel name="perfil">
            <MemberProfileTab :member="memberProfile" />

            <!-- Segmentacion card -->
            <q-card v-if="memberProfile.segment" flat bordered class="q-mt-md">
              <q-card-section>
                <div class="text-subtitle1 text-weight-bold q-mb-sm">Segmentacion</div>
                <div class="row items-center q-gutter-sm">
                  <q-badge
                    :color="SEGMENT_COLORS[memberProfile.segment as MemberSegment] ?? 'grey'"
                    :label="
                      SEGMENT_LABELS[memberProfile.segment as MemberSegment] ??
                      memberProfile.segment
                    "
                    class="text-body2"
                  />
                  <span v-if="memberProfile.segmentUpdatedAt" class="text-caption text-grey-6">
                    Actualizado: {{ formatDate(memberProfile.segmentUpdatedAt) }}
                  </span>
                </div>
              </q-card-section>
            </q-card>
          </q-tab-panel>

          <!-- Entrenamiento Tab -->
          <q-tab-panel name="entrenamiento">
            <!-- Loading state for goal plan data -->
            <div v-if="goalPlanLoading" class="flex flex-center q-pa-lg">
              <q-spinner-dots size="40px" color="primary" />
            </div>

            <template v-else-if="goalPlanDetail">
              <!-- Active Goal Plan -->
              <q-card v-if="goalPlanDetail.active" flat bordered class="q-mb-md">
                <q-card-section>
                  <div class="text-subtitle1 text-weight-bold q-mb-sm">
                    Plan por Objetivos Activo
                  </div>
                  <div class="row items-center q-gutter-sm q-mb-sm">
                    <q-badge
                      :color="goalPlanBadgeColor(goalPlanDetail.active.goalPlanType)"
                      :label="goalPlanLabel(goalPlanDetail.active.goalPlanType)"
                      class="text-body2"
                    />
                    <q-badge
                      outline
                      :color="goalPlanBadgeColor(goalPlanDetail.active.goalPlanType)"
                      :label="goalPlanTierLabel(goalPlanDetail.active.goalPlanType)"
                    />
                  </div>
                  <div class="text-caption text-grey-7">
                    Iniciado: {{ formatDate(goalPlanDetail.active.startedAt) }}
                  </div>
                </q-card-section>
              </q-card>

              <!-- No active goal plan -->
              <q-card v-else flat bordered class="q-mb-md">
                <q-card-section>
                  <div class="text-subtitle1 text-weight-bold q-mb-xs">
                    Plan por Objetivos Activo
                  </div>
                  <div class="text-grey-5 text-italic">Sin plan por objetivos activo</div>
                </q-card-section>
              </q-card>

              <!-- Entrenamiento Progress -->
              <q-card flat bordered class="q-mb-md">
                <q-card-section>
                  <div class="text-subtitle1 text-weight-bold q-mb-sm">Progreso Entrenamiento</div>
                  <div class="row q-gutter-md">
                    <div class="col">
                      <div class="text-center">
                        <div class="text-h6">
                          {{ goalPlanDetail.entrenamientoStats.totalSessions }}
                        </div>
                        <div class="text-caption text-grey-7">Sesiones completadas</div>
                      </div>
                    </div>
                    <div class="col">
                      <div class="text-center">
                        <div class="text-h6">
                          {{ goalPlanDetail.entrenamientoStats.totalDays }}
                        </div>
                        <div class="text-caption text-grey-7">Dias entrenados</div>
                      </div>
                    </div>
                    <div class="col">
                      <div class="text-center">
                        <div class="text-h6">
                          {{ goalPlanDetail.entrenamientoStats.currentStreak }}
                          <q-icon
                            v-if="goalPlanDetail.entrenamientoStats.currentStreak > 0"
                            name="local_fire_department"
                            color="orange"
                            size="xs"
                          />
                        </div>
                        <div class="text-caption text-grey-7">Racha actual</div>
                      </div>
                    </div>
                  </div>
                </q-card-section>
              </q-card>

              <!-- Goal Plan Progress -->
              <q-card flat bordered class="q-mb-md">
                <q-card-section>
                  <div class="text-subtitle1 text-weight-bold q-mb-sm">
                    Progreso Plan por Objetivos
                  </div>
                  <div class="row q-gutter-md">
                    <div class="col">
                      <div class="text-center">
                        <div class="text-h6">
                          {{ goalPlanDetail.goalPlanStats.totalSessions }}
                        </div>
                        <div class="text-caption text-grey-7">Sesiones por objetivos</div>
                      </div>
                    </div>
                  </div>
                </q-card-section>
              </q-card>

              <!-- Session History (last 20) -->
              <q-card flat bordered class="q-mb-md">
                <q-card-section>
                  <div class="text-subtitle1 text-weight-bold q-mb-sm">Historial de Sesiones</div>

                  <div v-if="recentCompletions.length === 0" class="text-grey-5 text-italic">
                    Sin sesiones completadas
                  </div>

                  <q-list v-else separator>
                    <q-item v-for="(completion, idx) in recentCompletions" :key="idx">
                      <q-item-section avatar>
                        <q-icon
                          :name="completion.goalPlanType ? 'explore' : 'fitness_center'"
                          :color="completion.goalPlanType ? 'deep-orange-9' : 'primary'"
                        />
                      </q-item-section>
                      <q-item-section>
                        <q-item-label>
                          {{
                            completion.goalPlanType
                              ? goalPlanLabel(completion.goalPlanType)
                              : 'Entrenamiento'
                          }}
                          <q-badge
                            v-if="completion.duration"
                            outline
                            color="grey-7"
                            :label="`${completion.duration} min`"
                            class="q-ml-sm"
                          />
                        </q-item-label>
                        <q-item-label caption>
                          {{ formatDate(completion.completedAt) }}
                          <span v-if="completion.rpe !== null"> · RPE {{ completion.rpe }}</span>
                        </q-item-label>
                      </q-item-section>
                      <q-item-section side>
                        <q-badge
                          v-if="completion.blocksCompleted"
                          outline
                          color="grey-7"
                          :label="`${completion.blocksCompleted.length} bloques`"
                        />
                      </q-item-section>
                    </q-item>
                  </q-list>
                </q-card-section>
              </q-card>

              <!-- Archived Goal Plans -->
              <q-card v-if="goalPlanDetail.archived.length > 0" flat bordered class="q-mb-md">
                <q-card-section>
                  <div class="text-subtitle1 text-weight-bold q-mb-sm">
                    Planes por Objetivos Anteriores
                  </div>

                  <q-list separator>
                    <q-item v-for="(arch, idx) in goalPlanDetail.archived" :key="idx">
                      <q-item-section avatar>
                        <q-icon name="history" color="grey-6" />
                      </q-item-section>
                      <q-item-section>
                        <q-item-label>
                          <q-badge
                            :color="goalPlanBadgeColor(arch.goalPlanType)"
                            :label="goalPlanLabel(arch.goalPlanType)"
                          />
                        </q-item-label>
                        <q-item-label caption>
                          {{ formatDate(arch.startedAt) }} — {{ formatDate(arch.archivedAt) }}
                        </q-item-label>
                      </q-item-section>
                      <q-item-section side>
                        <div class="text-caption text-grey-7">
                          {{ formatDate(arch.startedAt) }}
                        </div>
                      </q-item-section>
                    </q-item>
                  </q-list>
                </q-card-section>
              </q-card>
            </template>

            <!-- Goal plan data error -->
            <div v-else class="text-center q-pa-lg text-grey-5 text-italic">
              Sin datos de entrenamiento disponibles
            </div>
          </q-tab-panel>

          <!-- Notas Tab -->
          <q-tab-panel name="notas">
            <MemberNotesTab
              v-if="currentUser"
              :userId="userId"
              :currentUserId="currentUser.id"
              :currentUserRole="currentUser.role"
            />
          </q-tab-panel>

          <!-- Suscripcion Tab -->
          <q-tab-panel name="suscripcion">
            <MemberSubscriptionTab
              :userId="userId"
              :memberBranchId="memberProfile.branchId"
              :memberBranchName="memberProfile.branchName"
              :memberBoardingPassUsed="memberBoardingPassUsed"
              :memberBranchIsVirtual="memberBranchIsVirtual"
              :member="memberProfile"
              :branches="branches"
              :outstanding-concepts="outstandingConcepts"
              @subscription-changed="onSubscriptionChanged"
            />
          </q-tab-panel>

          <!-- Programas Tab (Phase 112) -->
          <q-tab-panel name="programas">
            <MemberProgramsTab :user-id="userId" />
          </q-tab-panel>

          <!-- Asistencia Tab -->
          <q-tab-panel name="asistencia">
            <MemberAttendanceTab :userId="userId" />
          </q-tab-panel>

          <!-- Finanzas Tab (Phase 108) -->
          <q-tab-panel name="finanzas">
            <FinancialHistoryTab :user-id="userId" :member-branch-id="memberProfile.branchId" />
          </q-tab-panel>
        </q-tab-panels>
      </template>

      <!-- ========================================== -->
      <!-- Edit Dialog -->
      <!-- ========================================== -->
      <MemberFormDialog
        v-model="showEditDialog"
        :member="memberProfile"
        :branches="branches"
        @saved="onMemberSaved"
      />

      <!-- Post-conversion (SP → legajo) plan assignment.
           Mirrors the post-create flow in AlumnosPage: opens automatically
           when the admin confirms "Cargar membresía" after completing data. -->
      <AssignPlanDialog
        v-if="postConvertAssignTarget"
        v-model="showAssignFromConvert"
        :userId="postConvertAssignTarget.id"
        :memberBranchId="postConvertAssignTarget.branchId"
        :memberBranchName="postConvertAssignTarget.branchName"
        :boardingPassUsed="false"
        :memberBranchIsVirtual="postConvertBranchIsVirtual"
        :member="postConvertAssignTarget"
        :branches="branches"
        @assigned="onPostConvertAssigned"
        @update:modelValue="onPostConvertAssignDialog"
      />

      <!-- Freemium → sesión de prueba conversion dialog. Requires a PHYSICAL
           sede (the trial session is presencial; the API rejects virtual
           branches). -->
      <q-dialog v-model="showConvertDialog">
        <q-card style="min-width: 380px; max-width: 480px">
          <q-card-section>
            <div class="text-h6">Convertir a sesión de prueba</div>
          </q-card-section>
          <q-card-section class="q-pt-none">
            <p class="text-body2 q-mb-md">
              <strong>{{ memberName }}</strong> pasa a ser un alumno en prueba (lead). Elegí la sede
              física donde se va a realizar la sesión de prueba.
            </p>
            <q-select
              v-model="convertBranchId"
              :options="physicalBranchOptions"
              emit-value
              map-options
              option-value="id"
              option-label="name"
              label="Sede de la sesión de prueba"
              outlined
              dense
              :disable="converting"
            />
          </q-card-section>
          <q-card-actions align="right" class="q-pa-md">
            <q-btn flat label="Cancelar" :disable="converting" @click="showConvertDialog = false" />
            <q-btn
              unelevated
              color="primary"
              label="Convertir"
              :loading="converting"
              :disable="convertBranchId === null"
              @click="onConvertToTrial"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <q-dialog v-model="showDeleteDialog" persistent>
        <q-card style="min-width: 380px; max-width: 480px">
          <q-card-section>
            <div class="text-h6 text-negative">Eliminar alumno</div>
          </q-card-section>
          <q-card-section class="q-pt-none">
            <p class="q-mb-sm">
              Vas a eliminar a <strong>{{ memberName }}</strong
              >. Esto libera su email y DNI para que pueda recrearse otra cuenta.
            </p>
            <q-banner dense rounded class="bg-amber-1 text-amber-10 q-mb-md">
              <template #avatar>
                <q-icon name="warning" color="amber-10" />
              </template>
              <div class="text-weight-medium q-mb-xs">Al eliminar va a pasar esto:</div>
              <ul class="q-ma-none q-pl-md text-body2">
                <li>Su suscripción activa o pausada se cancela.</li>
                <li>Las reservas futuras (de clases y clases de prueba) se cancelan.</li>
                <li>Se libera su email y DNI para crear otra cuenta.</li>
                <li>El historial de pagos, asistencias y AURA queda atribuido al registro.</li>
              </ul>
            </q-banner>
            <p class="text-caption text-grey-7 q-mb-none">
              La acción no se puede deshacer desde el admin.
            </p>
          </q-card-section>
          <q-card-actions align="right" class="q-pa-md">
            <q-btn flat label="Cancelar" :disable="deleting" @click="onCancelDelete" />
            <q-btn
              color="negative"
              label="Eliminar"
              :disable="deleting"
              :loading="deleting"
              @click="onConfirmDelete"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useGoalPlanAdminApi } from 'src/composables/useGoalPlanAdminApi';
import { useMembersApi, type LeadStatusValue } from 'src/composables/useMembersApi';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import {
  extractError,
  isExpectedClientError,
  parseActiveTransactionsBlock,
} from 'src/utils/extract-error';
import type { OutstandingConcept } from 'src/types/transaction';
import { useStatusBadge } from 'src/composables/useStatusBadge';
import MemberProfileTab from 'src/components/MemberProfileTab.vue';
import MemberNotesTab from 'src/components/MemberNotesTab.vue';
import MemberSubscriptionTab from 'src/components/MemberSubscriptionTab.vue';
import MemberProgramsTab from 'src/components/MemberProgramsTab.vue';
import MemberAttendanceTab from 'src/components/MemberAttendanceTab.vue';
import MemberFormDialog from 'src/components/MemberFormDialog.vue';
import MemberPhotoUpload from 'src/components/MemberPhotoUpload.vue';
import FinancialHistoryTab from 'src/components/FinancialHistoryTab.vue';
import AssignPlanDialog from 'src/components/AssignPlanDialog.vue';
import WhatsappIcon from 'src/components/icons/WhatsappIcon.vue';
import type { MemberProfile, MemberSegment, BranchOption } from 'src/types/member';
import { SEGMENT_LABELS, SEGMENT_COLORS, AVATAR_LABELS } from 'src/types/member';
import {
  GOAL_PLAN_TYPE_LABELS,
  GOAL_PLAN_TIER_MAP,
  GOAL_PLAN_TIER_COLORS,
  GOAL_PLAN_TIER_LABELS,
  type GoalPlanType,
  type GoalPlanTier,
  type MemberGoalPlanDetail,
} from 'src/types/goal-plan';

const log = createLogger('AlumnoDetailPage');
const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const authStore = useAuthStore();
const membersApi = useMembersApi();
const goalPlanApi = useGoalPlanAdminApi();
const transactionsApi = useTransactionsApi();
const { getColor: getStatusColor, getLabel: getStatusLabel } = useStatusBadge();

// =========================================================================
// State
// =========================================================================

const pageLoading = ref(true);
const pageError = ref<string | null>(null);
const memberProfile = ref<MemberProfile | null>(null);
const goalPlanDetail = ref<MemberGoalPlanDetail | null>(null);
const goalPlanLoading = ref(false);
const branches = ref<BranchOption[]>([]);
const activeTab = ref('perfil');
const showEditDialog = ref(false);
const showDeleteDialog = ref(false);
const deleting = ref(false);
// Freemium → sesión de prueba conversion dialog state.
const showConvertDialog = ref(false);
const convertBranchId = ref<number | null>(null);
const converting = ref(false);
const outstandingConcepts = ref<OutstandingConcept[]>([]);

// Drives the floating "D" badge on the Suscripcion tab and the deudor
// banner inside MemberSubscriptionTab. Sourced from the balances cache
// via GET /admin/members/:id/outstanding-concepts. Coach role gets 403
// (silenced) so the badge stays hidden for non-finance roles.
const memberHasDebt = computed(() => outstandingConcepts.value.some((c) => c.balance > 0));

// =========================================================================
// Phase 114 (D-38): "Datos de Lead" block state
// =========================================================================
// Local draft mirrors the lead-lifecycle fields on memberProfile and is
// reset whenever the profile reloads. Edits flow through
// useMembersApi.updateLead (PATCH /admin/leads/:userId) — re-using the
// same composable method wired in Plan 114-06 for the inline-edit cells
// in the Sesiones de Prueba report.

const LEAD_STATUS_OPTIONS: ReadonlyArray<{ value: LeadStatusValue; label: string }> = [
  { value: 'en_seguimiento', label: 'En seguimiento' },
  { value: 'cerrado', label: 'Cerrado' },
  { value: 'perdido', label: 'Perdido' },
] as const;

const leadDraft = ref<{
  leadStatus: LeadStatusValue | null;
  leadNotes: string | null;
}>({
  leadStatus: null,
  leadNotes: null,
});
const savingLeadStatus = ref(false);
const savingLeadNotes = ref(false);

// Sync draft with memberProfile whenever it (re)loads. The watcher fires
// `immediate: true` so the very first load also seeds the draft.
watch(
  () => memberProfile.value,
  (profile) => {
    if (profile?.status === 'prueba') {
      leadDraft.value.leadStatus = profile.leadStatus ?? null;
      leadDraft.value.leadNotes = profile.leadNotes ?? null;
    }
  },
  { immediate: true }
);

async function onSaveLeadStatus(newValue: LeadStatusValue): Promise<void> {
  if (!memberProfile.value) return;
  const previous = memberProfile.value.leadStatus;
  savingLeadStatus.value = true;
  try {
    const snapshot = await membersApi.updateLead(memberProfile.value.id, {
      leadStatus: newValue,
    });
    memberProfile.value.leadStatus = snapshot.leadStatus;
    // D-34 invariant: leadNotes is NOT touched by lead_status edits
    // server-side. memberProfile.leadNotes stays as-is.
    $q.notify({ type: 'positive', message: 'Estado actualizado' });
  } catch (err: unknown) {
    leadDraft.value.leadStatus = previous;
    const message = err instanceof Error ? err.message : 'Error al actualizar estado';
    log.error('Failed to update lead status', {
      error: message,
      userId: memberProfile.value.id,
    });
    $q.notify({ type: 'negative', message });
  } finally {
    savingLeadStatus.value = false;
  }
}

async function onSaveLeadNotes(): Promise<void> {
  if (!memberProfile.value) return;
  const draft = leadDraft.value.leadNotes;
  if (draft === memberProfile.value.leadNotes) return;
  savingLeadNotes.value = true;
  try {
    const snapshot = await membersApi.updateLead(memberProfile.value.id, {
      leadNotes: draft === '' ? null : draft,
    });
    memberProfile.value.leadNotes = snapshot.leadNotes;
    $q.notify({ type: 'positive', message: 'Comentario guardado' });
  } catch (err: unknown) {
    leadDraft.value.leadNotes = memberProfile.value.leadNotes;
    const message = err instanceof Error ? err.message : 'Error al guardar comentario';
    log.error('Failed to update lead notes', {
      error: message,
      userId: memberProfile.value.id,
    });
    $q.notify({ type: 'negative', message });
  } finally {
    savingLeadNotes.value = false;
  }
}

const userId = computed(() => Number(route.params.userId));

const currentUser = computed(() => authStore.user);

const canDeleteMember = computed(() => {
  const role = currentUser.value?.role;
  return role === 'admin' || role === 'owner' || role === 'gestion';
});

// Only physical branches are valid trial-session locations (the API rejects
// virtual sedes). Excludes the "Templo Online" virtual branch.
const physicalBranchOptions = computed(() => branches.value.filter((b) => !b.isVirtual));

function openConvertDialog() {
  // Default to the member's current branch if it's physical; otherwise leave
  // it empty so the admin must make an explicit choice.
  const current = memberProfile.value?.branchId ?? null;
  const isPhysical = physicalBranchOptions.value.some((b) => b.id === current);
  convertBranchId.value = isPhysical ? current : null;
  showConvertDialog.value = true;
}

async function onConvertToTrial() {
  if (!memberProfile.value || convertBranchId.value === null) return;
  converting.value = true;
  try {
    await membersApi.convertToTrial(memberProfile.value.id, convertBranchId.value);
    $q.notify({ type: 'positive', message: 'Alumno convertido a sesión de prueba' });
    showConvertDialog.value = false;
    await loadMemberProfile();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al convertir a sesión de prueba';
    log.error('Failed to convert freemium to trial', {
      error: message,
      userId: memberProfile.value.id,
    });
    $q.notify({ type: 'negative', message });
  } finally {
    converting.value = false;
  }
}

function onCancelDelete() {
  showDeleteDialog.value = false;
}

async function onConfirmDelete() {
  if (deleting.value || !memberProfile.value) return;
  deleting.value = true;
  try {
    await membersApi.deleteMember(memberProfile.value.id);
    $q.notify({ type: 'positive', message: 'Alumno eliminado' });
    showDeleteDialog.value = false;
    await router.push('/alumnos');
  } catch (err: unknown) {
    // Phase 111 REQ-3: backend refuses delete when the member's subscription
    // has non-voided charge transactions. Surface an actionable message so
    // the admin knows to anular in Detalle Financiero first.
    const block = parseActiveTransactionsBlock(err, 'eliminar');
    if (block) {
      log.warn('Delete blocked: active transactions', {
        userId: memberProfile.value.id,
        count: block.count,
        amount: block.amount,
      });
      $q.notify({
        type: 'warning',
        message: block.message,
        timeout: 8000,
        multiLine: true,
        actions: [{ label: 'Entendido', color: 'white' }],
      });
      return;
    }
    const message = extractError(err, 'Error eliminando alumno');
    if (isExpectedClientError(err)) {
      log.warn('Delete member rejected', { error: message });
    } else {
      log.error('Error deleting member', { error: message });
    }
    $q.notify({ type: 'negative', message });
  } finally {
    deleting.value = false;
  }
}

// boardingPassUsed is not in the member profile API response; the pricing preview API handles eligibility
const memberBoardingPassUsed = computed(() => false);

// Phase 111 REQ-2: derive whether the member's current branch is virtual
// (e.g. Templo Online) from the loaded branches list. Threaded down to
// MemberSubscriptionTab → AssignPlanDialog so the assign flow can filter
// presencial plans and surface the convert-CTA banner. Defaults to false
// when branches haven't loaded yet (the dialog won't open before the page
// finishes loading anyway).
const memberBranchIsVirtual = computed(() => {
  if (!memberProfile.value) return false;
  const branch = branches.value.find((b) => b.id === memberProfile.value!.branchId);
  return branch?.isVirtual === true;
});

const memberName = computed(() => {
  if (!memberProfile.value) return '';
  const parts = [memberProfile.value.firstName, memberProfile.value.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : `Usuario #${userId.value}`;
});

const recentCompletions = computed(() => {
  if (!goalPlanDetail.value) return [];
  return goalPlanDetail.value.completions.slice(0, 20);
});

// Phase 99 R11 — per-level session counts over the last 30 days. Empty array
// hides the row (D-18: no "0-of-everything" noise).
const sessionLevelCounts = ref<Array<{ level: string; count: number }>>([]);

async function loadSessionLevels(): Promise<void> {
  const id = memberProfile.value?.id;
  if (!id) return;
  try {
    sessionLevelCounts.value = await membersApi.getSessionLevels(id, 30);
  } catch {
    sessionLevelCounts.value = [];
  }
}

// =========================================================================
// Greek level display
// =========================================================================

const LEVEL_GREEK_MAP: Record<string, string> = {
  kairos: '\u03B1', // kairos reuses Alfa's glyph (Phase 129, member-app parity)
  alfa: '\u03B1',
  delta: '\u0394',
  sigma: '\u03A3',
  omega: '\u03A9',
  spartan: '\u03A9',
};

const LEVEL_NAMES: Record<string, string> = {
  kairos: 'Kairos',
  alfa: 'Alfa',
  delta: 'Delta',
  sigma: 'Sigma',
  omega: 'Omega',
  spartan: 'Spartan',
};

function greekLevel(level: string): string {
  return LEVEL_GREEK_MAP[level.toLowerCase()] ?? level;
}

function levelDisplayName(level: string): string {
  return LEVEL_NAMES[level.toLowerCase()] ?? level;
}

function levelColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'kairos':
      return 'amber-6';
    case 'alfa':
      return 'amber-8';
    case 'delta':
      return 'deep-orange-7';
    case 'sigma':
      return 'brown-8';
    case 'omega':
      return 'red-9';
    case 'spartan':
      return 'grey-9';
    default:
      return 'grey';
  }
}

// =========================================================================
// Goal plan display helpers
// =========================================================================

function goalPlanLabel(goalPlanType: string): string {
  return GOAL_PLAN_TYPE_LABELS[goalPlanType as GoalPlanType] ?? goalPlanType;
}

function goalPlanBadgeColor(goalPlanType: string): string {
  const tier: GoalPlanTier | undefined = GOAL_PLAN_TIER_MAP[goalPlanType as GoalPlanType];
  return tier ? GOAL_PLAN_TIER_COLORS[tier] : 'grey';
}

function goalPlanTierLabel(goalPlanType: string): string {
  const tier: GoalPlanTier | undefined = GOAL_PLAN_TIER_MAP[goalPlanType as GoalPlanType];
  return tier ? GOAL_PLAN_TIER_LABELS[tier] : '';
}

// =========================================================================
// Data loading
// =========================================================================

async function loadMemberProfile() {
  try {
    memberProfile.value = await membersApi.getMember(userId.value);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading member profile', { error: message, userId: userId.value });
    throw err;
  }
}

async function loadGoalPlanDetail() {
  goalPlanLoading.value = true;
  try {
    goalPlanDetail.value = await goalPlanApi.getMemberDetail(userId.value);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading goal plan detail', { error: message, userId: userId.value });
    // Non-fatal: goal plan data is supplementary, profile still works
    goalPlanDetail.value = null;
  } finally {
    goalPlanLoading.value = false;
  }
}

async function loadBranches() {
  try {
    branches.value = await membersApi.getBranches();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading branches', { error: message });
  }
}

async function loadOutstandingConcepts() {
  try {
    outstandingConcepts.value = await transactionsApi.getOutstandingConcepts(userId.value);
  } catch (err: unknown) {
    outstandingConcepts.value = [];
    // 403 for coach role is expected (FINANCE_READ_ROLES excludes coach).
    if (!isExpectedClientError(err)) {
      log.warn('Error loading outstanding concepts', {
        error: extractError(err),
        userId: userId.value,
      });
    }
  }
}

async function loadAll() {
  pageLoading.value = true;
  pageError.value = null;

  try {
    // Load profile + branches in parallel (required for page render)
    await Promise.all([loadMemberProfile(), loadBranches()]);

    // Load goal plan detail in background (non-blocking)
    loadGoalPlanDetail();
    // Phase 99 R11: load session-level counts in background (non-blocking)
    loadSessionLevels();
    // Outstanding balance in background — drives the Suscripcion tab badge.
    loadOutstandingConcepts();
  } catch {
    pageError.value = 'Error cargando detalle del alumno';
  } finally {
    pageLoading.value = false;
  }
}

// =========================================================================
// Actions
// =========================================================================

function onPhotoUploaded(url: string) {
  if (memberProfile.value) {
    memberProfile.value.photoUrl = url;
  }
}

async function onMemberSaved(updated: MemberProfile | null) {
  $q.notify({ type: 'positive', message: 'Alumno actualizado' });
  await loadMemberProfile();

  // SP → legajo conversion: MemberFormDialog emits the updated profile
  // only when the alumno was in 'prueba' before the save. Mirror the
  // post-create flow in AlumnosPage and offer to load the membership
  // right away so the admin doesn't have to navigate to the Suscripción
  // tab manually.
  if (!updated) return;

  $q.dialog({
    title: '¿Cargar membresía?',
    message: `${[updated.firstName, updated.lastName].filter(Boolean).join(' ') || updated.email} pasó a legajo. ¿Querés cargarle la membresía ahora?`,
    cancel: { flat: true, label: 'Más tarde' },
    ok: { color: 'primary', label: 'Cargar membresía' },
  }).onOk(() => {
    postConvertAssignTarget.value = updated;
    postConvertAssignmentDone.value = false;
    showAssignFromConvert.value = true;
  });
}

// =========================================================================
// SP → legajo: post-conversion plan assignment flow
// =========================================================================
// Mirrors the post-create flow in AlumnosPage. The Suscripción tab is now
// visible (status moved to 'inactivo'), so even if the admin cancels this
// dialog they can assign a plan later from the tab — but we still surface
// the prompt because it's the natural next step after completing the data.

const showAssignFromConvert = ref(false);
const postConvertAssignTarget = ref<MemberProfile | null>(null);
const postConvertAssignmentDone = ref(false);

const postConvertBranchIsVirtual = computed(() => {
  if (!postConvertAssignTarget.value) return false;
  const branch = branches.value.find((b) => b.id === postConvertAssignTarget.value!.branchId);
  return branch?.isVirtual === true;
});

async function onPostConvertAssigned() {
  postConvertAssignmentDone.value = true;
  await loadMemberProfile();
}

function onPostConvertAssignDialog(open: boolean) {
  if (open) return;
  if (!postConvertAssignmentDone.value && postConvertAssignTarget.value) {
    $q.notify({
      type: 'warning',
      message:
        'El alumno quedó como Inactivo sin membresía. Podés cargarla más tarde desde la pestaña Suscripción.',
      timeout: 6000,
    });
  }
  postConvertAssignTarget.value = null;
  postConvertAssignmentDone.value = false;
}

async function onSubscriptionChanged() {
  // Refresh member profile in case boarding pass usage changed.
  // Also re-pull outstanding concepts because renewal / change-plan can
  // create or settle balances — keeps the Suscripcion tab badge in sync.
  await Promise.all([loadMemberProfile(), loadOutstandingConcepts()]);
}

// =========================================================================
// Navigation
// =========================================================================

function goBack() {
  router.push('/alumnos');
}

// Same wa.me pattern as SesionesDePruebaDialog: strip non-digits so any
// admin-stored format (+5491155551234, 11-5555-1234, etc) lands on a
// valid WhatsApp URL.
function openWhatsapp(phone: string): void {
  const cleaned = phone.replace(/[^0-9]/g, '');
  window.open(`https://wa.me/${cleaned}`, '_blank');
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadAll();
});
</script>
