<template>
  <div class="prog-card-outer">
    <div class="prog-card-inner">
      <!-- Decorative effects -->
      <div class="prog-radial-glow" />
      <div class="prog-sparkle" />
      <div class="prog-sparkle" />
      <div class="prog-sparkle" />
      <div class="prog-bottom-line" />

      <!-- Header + Title + CTA arrow -->
      <div class="prog-top">
        <div class="prog-top__info">
          <div class="prog-header">
            <div class="prog-badge">
              <svg class="prog-badge-icon" width="12" height="12" viewBox="0 0 12 12">
                <polygon
                  points="6,0.5 7.5,4.2 11.5,4.5 8.5,7.2 9.3,11.2 6,9.2 2.7,11.2 3.5,7.2 0.5,4.5 4.5,4.2"
                  fill="#C4956A"
                  opacity=".9"
                />
              </svg>
              <span class="prog-badge-text">{{ badgeText }}</span>
            </div>
          </div>
          <div
            class="prog-title-row"
            :class="{ 'prog-title-row--switchable': canSwitch }"
            :tabindex="canSwitch ? 0 : -1"
            :role="canSwitch ? 'button' : undefined"
            :aria-haspopup="canSwitch ? 'menu' : undefined"
          >
            <h3 class="prog-title">{{ progress.programName }}</h3>
            <q-icon v-if="canSwitch" name="expand_more" size="20px" class="prog-title-chevron" />
            <!-- Phase 112 D-21 (verified zero-code outcome): the dropdown
                 lists ALL active enrollments regardless of source. Bundle
                 (plan_bundle), linked (plan_linked) and admin-assigned
                 (admin_addon) rows surface naturally because /me/enrollments
                 does not filter by source and useCurrentProgram does not
                 inspect it. Do NOT add a source-based badge here — D-21
                 explicitly forbids visual distinction in the member UI. -->
            <q-menu v-if="canSwitch" anchor="bottom left" self="top left" :offset="[0, 6]">
              <q-list class="prog-menu">
                <q-item-label header class="prog-menu__header">Cambiar de programa</q-item-label>
                <q-item
                  v-for="enr in enrollments"
                  :key="enr.id"
                  v-close-popup
                  clickable
                  :active="currentEnrollmentId === enr.id"
                  :disable="isUpdating"
                  @click="onSelectEnrollment(enr.id)"
                >
                  <q-item-section>
                    <q-item-label>{{ enr.programName }}</q-item-label>
                    <q-item-label caption>
                      Semana {{ enr.currentWeek
                      }}<span v-if="enr.durationWeeks"> de {{ enr.durationWeeks }}</span>
                    </q-item-label>
                  </q-item-section>
                  <q-item-section v-if="currentEnrollmentId === enr.id" side>
                    <q-icon name="check" color="positive" />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </div>
        </div>
        <div class="prog-arrow" @click="goToTraining">
          <q-icon name="chevron_right" size="24px" />
        </div>
      </div>

      <!-- Weekly sessions bar -->
      <div class="prog-bar-section">
        <div class="prog-bar-label">
          <span class="prog-bar-name">Sesiones esta semana</span>
          <span class="prog-bar-value">
            {{ progress.sessionsCompletedThisWeek }}/{{ progress.sessionsPerWeekToAdvance }}
          </span>
        </div>
        <div class="prog-bar-track">
          <div class="prog-bar-fill" :style="{ width: weeklyBarWidth }" />
        </div>
      </div>

      <!-- Total program sessions bar -->
      <div v-if="progress.durationWeeks" class="prog-bar-section">
        <div class="prog-bar-label">
          <span class="prog-bar-name">Progreso total</span>
          <span class="prog-bar-value">
            Semana {{ progress.currentWeek }} de {{ progress.durationWeeks }}
          </span>
        </div>
        <div class="prog-bar-track">
          <div class="prog-bar-fill" :style="{ width: totalBarWidth }" />
        </div>
      </div>

      <!-- Week complete indicator -->
      <div v-if="progress.isWeekComplete" class="prog-complete">
        <q-icon name="check_circle" size="16px" />
        <span>Semana completa</span>
      </div>

      <!-- Renewal badge -->
      <div v-if="showRenewalBadge" class="prog-renewal" @click="openRenewalWhatsApp">
        Tu experiencia vence en {{ progress.daysUntilExpiry }} dias — Renova
      </div>

      <!-- Expand toggle for content blocks -->
      <div v-if="currentWeekBlocks.length > 0" class="prog-expand">
        <q-btn
          flat
          round
          dense
          :icon="expanded ? 'expand_less' : 'expand_more'"
          color="white"
          size="sm"
          @click="expanded = !expanded"
        />
      </div>

      <!-- Expandable content blocks -->
      <div v-if="expanded && currentWeekBlocks.length > 0" class="prog-blocks">
        <div
          v-for="block in currentWeekBlocks"
          :key="block.id"
          class="prog-block-item"
          @click="handleBlockClick(block)"
        >
          <q-icon :name="blockIcon(block.blockType)" size="18px" class="prog-block-icon" />
          <span class="prog-block-title">{{ blockTitle(block) }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Text content dialog -->
  <q-dialog v-model="textDialogVisible">
    <q-card style="min-width: 300px; max-width: 500px">
      <q-card-section>
        <div class="text-h6">{{ textDialogTitle }}</div>
      </q-card-section>
      <q-card-section class="q-pt-none">
        <div class="text-body2" style="white-space: pre-wrap">{{ textDialogContent }}</div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Cerrar" color="primary" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { createLogger } from 'src/utils/logger'
import { useUserStore } from 'src/stores/useUserStore'
import { useCurrentProgram } from 'src/modules/training/composables/useCurrentProgram'
import { buildWhatsAppUrl } from 'src/utils/whatsapp'
import type { MemberEnrollmentProgress, ContentBlockDetail, ContentBlockType } from '../types'

const log = createLogger('ProgramProgressCard')
const router = useRouter()

const props = defineProps<{
  progress: MemberEnrollmentProgress
}>()

const emit = defineEmits<{
  (e: 'program-changed'): void
}>()

const expanded = ref(false)
const textDialogVisible = ref(false)
const textDialogTitle = ref('')
const textDialogContent = ref('')

const userStore = useUserStore()

const { currentEnrollmentId, enrollments, isUpdating, select } = useCurrentProgram()

// Show the dropdown only when the member has more than one active enrollment
// (bundle members or a linked-program member with an admin-assigned addon).
// Single-program members keep the static title.
const canSwitch = computed(() => enrollments.value.length > 1)

const badgeText = computed(() => (canSwitch.value ? 'Tus Programas' : 'Tu Programa'))

async function onSelectEnrollment(enrollmentId: number): Promise<void> {
  if (isUpdating.value) return
  if (enrollmentId === currentEnrollmentId.value) return
  try {
    await select(enrollmentId)
    emit('program-changed')
  } catch {
    // useCurrentProgram already logged; let the UI keep the previous program.
  }
}

const weeklyBarWidth = computed(() => {
  if (props.progress.sessionsPerWeekToAdvance === 0) return '1%'
  const ratio = props.progress.sessionsCompletedThisWeek / props.progress.sessionsPerWeekToAdvance
  return ratio === 0 ? '1%' : `${Math.min(ratio * 100, 100)}%`
})

const totalBarWidth = computed(() => {
  if (!props.progress.durationWeeks || props.progress.durationWeeks === 0) return '1%'
  const ratio = (props.progress.currentWeek - 1) / props.progress.durationWeeks
  return ratio === 0 ? '1%' : `${Math.min(ratio * 100, 100)}%`
})

const showRenewalBadge = computed(() => {
  return props.progress.daysUntilExpiry !== null && props.progress.daysUntilExpiry <= 7
})

const currentWeekBlocks = computed(() => {
  return props.progress.contentBlocks
    .filter((b) => b.weekNumber === props.progress.currentWeek)
    .sort((a, b) => a.sortOrder - b.sortOrder)
})

const BLOCK_ICONS: Record<ContentBlockType, string> = {
  video: 'play_circle',
  text: 'article',
  pdf: 'picture_as_pdf',
  exercise: 'fitness_center',
}

function blockIcon(blockType: ContentBlockType): string {
  return BLOCK_ICONS[blockType] ?? 'description'
}

function blockTitle(block: ContentBlockDetail): string {
  if (block.blockType === 'exercise' && block.exerciseName) {
    return block.exerciseName
  }
  return block.title
}

function handleBlockClick(block: ContentBlockDetail) {
  switch (block.blockType) {
    case 'video':
      if (block.videoUrl) {
        window.open(block.videoUrl, '_blank')
      }
      break
    case 'text':
      textDialogTitle.value = block.title
      textDialogContent.value = block.content ?? ''
      textDialogVisible.value = true
      break
    case 'pdf':
      if (block.content) {
        window.open(block.content, '_blank')
      }
      break
    case 'exercise':
      if (block.exerciseVideoUrl) {
        window.open(block.exerciseVideoUrl, '_blank')
      }
      break
    default:
      log.warn('Unknown block type clicked', { blockType: block.blockType })
  }
}

function goToTraining() {
  router.push('/training')
}

function openRenewalWhatsApp() {
  const message = `Hola, quiero renovar mi experiencia "${props.progress.programName}"`
  window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, message), '_blank')
}
</script>

<style lang="scss" scoped>
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulseGlow {
  0%,
  100% {
    opacity: 0.08;
  }
  50% {
    opacity: 0.18;
  }
}

@keyframes sparkle1 {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.5);
  }
  50% {
    opacity: 0.7;
    transform: scale(1);
  }
}

@keyframes sparkle2 {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.4);
  }
  40% {
    opacity: 0.5;
    transform: scale(1.1);
  }
}

@keyframes sparkle3 {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.6);
  }
  60% {
    opacity: 0.6;
    transform: scale(0.9);
  }
}

.prog-card-outer {
  position: relative;
  border-radius: 18px;
  padding: 1.5px;
  background: linear-gradient(
    135deg,
    rgba(180, 140, 80, 0.15),
    rgba(196, 149, 106, 0.4) 30%,
    rgba(220, 190, 130, 0.6) 50%,
    rgba(196, 149, 106, 0.4) 70%,
    rgba(180, 140, 80, 0.15)
  );
  background-size: 200% 200%;
  animation: shimmer 4s ease-in-out infinite;
}

.prog-card-inner {
  background: linear-gradient(135deg, #1a1612 0%, #2c2318 50%, #1e1914 100%);
  border-radius: 16.5px;
  padding: 18px;
  position: relative;
  overflow: hidden;
  animation: fadeUp 0.6s ease-out both;
}

.prog-radial-glow {
  position: absolute;
  top: -40px;
  right: -40px;
  width: 180px;
  height: 180px;
  background: radial-gradient(circle, rgba(196, 149, 106, 0.12) 0%, transparent 70%);
  pointer-events: none;
  animation: pulseGlow 4s ease-in-out infinite;
}

.prog-sparkle {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(220, 190, 130, 0.8) 0%, transparent 70%);
  pointer-events: none;

  &:nth-child(2) {
    top: 18px;
    right: 60px;
    width: 6px;
    height: 6px;
    animation: sparkle1 3s ease-in-out infinite;
  }
  &:nth-child(3) {
    top: 50px;
    right: 30px;
    width: 4px;
    height: 4px;
    animation: sparkle2 4s ease-in-out infinite 0.8s;
  }
  &:nth-child(4) {
    top: 35px;
    right: 90px;
    width: 5px;
    height: 5px;
    animation: sparkle3 3.5s ease-in-out infinite 1.5s;
  }
}

.prog-bottom-line {
  position: absolute;
  bottom: 0;
  left: 22px;
  right: 22px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(196, 149, 106, 0.2) 20%,
    rgba(196, 149, 106, 0.35) 50%,
    rgba(196, 149, 106, 0.2) 80%,
    transparent
  );
}

.prog-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.prog-top__info {
  flex: 1;
  min-width: 0;
}

.prog-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #c4956a, #a07850);
  color: #fff;
  flex-shrink: 0;
  cursor: pointer;
}

.prog-header {
  display: flex;
  align-items: center;
  position: relative;
  margin-bottom: 4px;
}

.prog-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, rgba(196, 149, 106, 0.18), rgba(196, 149, 106, 0.08));
  border: 0.5px solid rgba(196, 149, 106, 0.3);
  border-radius: 20px;
  padding: 4px 12px 4px 8px;
}

.prog-badge-icon {
  flex-shrink: 0;
}

.prog-badge-text {
  font-size: 10px;
  font-weight: 600;
  color: #c4956a;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}

.prog-title-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  position: relative;
  padding: 4px 0 0;

  &--switchable {
    cursor: pointer;
    border-radius: 6px;

    &:hover {
      background: rgba(196, 149, 106, 0.08);
    }
  }
}

.prog-title-chevron {
  color: rgba(240, 230, 214, 0.65);
  flex-shrink: 0;
  margin-top: 2px;
}

.prog-title {
  font-size: 20px;
  font-weight: 600;
  color: #f0e6d6;
  letter-spacing: 0.3px;
  line-height: 1.3;
  margin: 0;
}

.prog-menu {
  background: linear-gradient(135deg, #1a1612 0%, #2c2318 50%, #1e1914 100%);
  min-width: 240px;
  padding: 4px 0;

  :deep(.q-item) {
    color: #f0e6d6;
    transition: background 0.15s ease;
  }

  :deep(.q-item__label) {
    color: #f0e6d6;
  }

  :deep(.q-item__label--caption) {
    color: rgba(240, 230, 214, 0.65);
  }

  :deep(.q-item--active) {
    color: #c4956a;
    background: rgba(196, 149, 106, 0.12);

    .q-item__label,
    .q-item__label--caption {
      color: #c4956a;
    }
  }

  :deep(.q-item:hover:not(.q-item--active)) {
    background: rgba(196, 149, 106, 0.08);
  }
}

.prog-menu__header {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #c4956a;
  padding: 8px 16px 4px;
}

.prog-bar-section {
  margin-bottom: 12px;
}

.prog-bar-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}

.prog-bar-name {
  font-size: 11px;
  color: rgba(240, 230, 214, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.prog-bar-value {
  font-size: 12px;
  font-weight: 600;
  color: #c4956a;
}

.prog-bar-track {
  height: 6px;
  background: rgba(196, 149, 106, 0.12);
  border-radius: 3px;
  overflow: hidden;
}

.prog-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #c4956a, #dcbe82);
  border-radius: 3px;
  transition: width 0.4s ease;
}

.prog-complete {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #8bc34a;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 8px;
}

.prog-renewal {
  font-size: 11px;
  color: #ffb74d;
  background: rgba(255, 183, 77, 0.1);
  border: 0.5px solid rgba(255, 183, 77, 0.3);
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  margin-bottom: 8px;
  text-align: center;
}

.prog-expand {
  display: flex;
  justify-content: center;
}

.prog-blocks {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prog-block-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(196, 149, 106, 0.08);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;

  &:active {
    background: rgba(196, 149, 106, 0.18);
  }
}

.prog-block-icon {
  color: #c4956a;
}

.prog-block-title {
  font-size: 13px;
  color: rgba(240, 230, 214, 0.8);
}

@media (prefers-reduced-motion: reduce) {
  .prog-card-outer {
    animation: none;
    background-size: 100% 100%;
  }
  .prog-card-inner {
    animation: none;
    opacity: 1;
    transform: none;
  }
  .prog-radial-glow {
    animation: none;
    opacity: 0.12;
  }
  .prog-sparkle {
    animation: none;
    opacity: 0;
  }
}
</style>
