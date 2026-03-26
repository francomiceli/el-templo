<template>
  <q-card class="program-progress-card">
    <q-card-section>
      <!-- Header (always visible) -->
      <div class="row items-center justify-between q-mb-sm">
        <div class="text-subtitle1 text-weight-bold">{{ progress.programName }}</div>
        <q-badge color="primary" outline>
          Semana {{ progress.currentWeek }} de {{ progress.durationWeeks }}
        </q-badge>
      </div>

      <!-- Session progress -->
      <div class="row items-center q-mb-xs">
        <span class="text-body2 text-grey-7 q-mr-sm">
          {{ progress.sessionsCompletedThisWeek }}/{{ progress.sessionsPerWeekToAdvance }}
          sesiones
        </span>
        <span v-if="progress.isWeekComplete" class="text-positive text-caption">
          <q-icon name="check_circle" size="14px" class="q-mr-xs" />
          Semana completa
        </span>
      </div>
      <q-linear-progress
        :value="sessionProgressRatio"
        color="primary"
        size="8px"
        rounded
        class="q-mb-sm"
      />

      <!-- Renewal badge (per D-16) -->
      <q-badge
        v-if="showRenewalBadge"
        color="accent"
        class="cursor-pointer q-mb-sm"
        @click="openRenewalWhatsApp"
      >
        Tu experiencia vence en {{ progress.daysUntilExpiry }} dias — Renova
      </q-badge>

      <!-- Expand toggle -->
      <div class="row justify-end">
        <q-btn
          flat
          round
          dense
          :icon="expanded ? 'expand_less' : 'expand_more'"
          @click="expanded = !expanded"
        />
      </div>

      <!-- Expandable content blocks -->
      <div v-if="expanded" class="q-mt-sm">
        <q-list v-if="currentWeekBlocks.length > 0" separator dense>
          <q-item
            v-for="block in currentWeekBlocks"
            :key="block.id"
            clickable
            @click="handleBlockClick(block)"
          >
            <q-item-section avatar>
              <q-icon :name="blockIcon(block.blockType)" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ blockTitle(block) }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="text-body2 text-grey-6 text-center q-pa-sm">
          Contenido no disponible aun
        </div>
      </div>
    </q-card-section>

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
  </q-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { createLogger } from 'src/utils/logger'
import type { MemberEnrollmentProgress, ContentBlockDetail, ContentBlockType } from '../types'

const log = createLogger('ProgramProgressCard')

const props = defineProps<{
  progress: MemberEnrollmentProgress
}>()

const expanded = ref(false)
const textDialogVisible = ref(false)
const textDialogTitle = ref('')
const textDialogContent = ref('')

const WHATSAPP_NUMBER = '5492235820521'

const sessionProgressRatio = computed(() => {
  if (props.progress.sessionsPerWeekToAdvance === 0) return 0
  return Math.min(
    props.progress.sessionsCompletedThisWeek / props.progress.sessionsPerWeekToAdvance,
    1,
  )
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

function openRenewalWhatsApp() {
  const message = `Hola, quiero renovar mi experiencia "${props.progress.programName}"`
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank')
}
</script>
