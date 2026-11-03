<!--
  Lista de temas de Oficina (fase 205 D-17): un ítem por tema, ordenados por el padre
  (última actividad primero). Punto de color = hay novedades para mí (`unseen`).
-->
<template>
  <q-card flat bordered class="oficina-list">
    <div v-if="loading && topics.length === 0" class="flex flex-center q-pa-xl">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <div v-else-if="topics.length === 0" class="text-center text-grey-7 q-pa-xl">
      <q-icon name="inbox" size="48px" color="grey-5" />
      <div class="text-body1 q-mt-md">{{ emptyMessage }}</div>
    </div>

    <q-list v-else separator>
      <q-item
        v-for="topic in topics"
        :key="topic.id"
        clickable
        v-ripple
        class="q-py-md"
        :class="{ 'oficina-list__item--closed': topic.status === 'cerrado' }"
        :active="topic.id === selectedId"
        active-class="bg-summary-surface"
        @click="emit('select', topic.id)"
      >
        <q-item-section side top class="oficina-list__dot-col">
          <span
            v-if="topic.unseen"
            class="oficina-list__dot"
            role="img"
            aria-label="Con novedades"
          />
        </q-item-section>

        <q-item-section>
          <q-item-label
            lines="2"
            class="text-body2"
            :class="topic.unseen ? 'text-weight-bold' : 'text-weight-medium'"
          >
            {{ topic.title }}
          </q-item-label>

          <q-item-label v-if="hasMeta(topic)" class="row items-center q-gutter-xs q-mt-xs">
            <q-chip v-if="topic.targetKind" dense size="sm" color="grey-3" text-color="grey-9">
              <q-icon :name="TARGET_KIND_ICONS[topic.targetKind]" size="14px" class="q-mr-xs" />
              <span class="oficina-list__chip-text">
                {{ topic.targetLabel ?? TARGET_KIND_LABELS[topic.targetKind] }}
              </span>
            </q-chip>
            <q-chip v-if="topic.branchName" dense size="sm" color="grey-3" text-color="grey-9">
              <span class="oficina-list__chip-text">{{ topic.branchName }}</span>
            </q-chip>
            <q-chip
              v-if="topic.status === 'dormido' && topic.snoozedUntil"
              dense
              size="sm"
              color="warning"
              text-color="grey-10"
            >
              Hasta {{ shortDate(topic.snoozedUntil) }}
            </q-chip>
          </q-item-label>

          <q-item-label v-if="topic.lastEvent" caption lines="1" class="q-mt-xs">
            {{ lastEventLine(topic.lastEvent) }}
          </q-item-label>
        </q-item-section>

        <q-item-section side top class="oficina-list__side">
          <q-item-label caption>{{ relativeTime(topic.lastActivityAt) }}</q-item-label>
          <div class="row items-center no-wrap q-gutter-xs q-mt-xs">
            <q-icon v-if="topic.origin === 'sistema'" name="smart_toy" size="18px" color="grey-6">
              <q-tooltip>Lo abrió el sistema</q-tooltip>
            </q-icon>
            <q-avatar
              v-if="topic.assignee"
              size="24px"
              color="primary"
              text-color="white"
              font-size="11px"
            >
              {{ personInitials(topic.assignee) }}
              <q-tooltip>Responsable: {{ personName(topic.assignee) }}</q-tooltip>
            </q-avatar>
            <q-icon v-else name="person_outline" size="22px" color="grey-5">
              <q-tooltip>Sin responsable</q-tooltip>
            </q-icon>
          </div>
        </q-item-section>
      </q-item>
    </q-list>
  </q-card>
</template>

<script setup lang="ts">
import type { OfficeTopicListItem } from 'src/composables/useOfficeApi';
import { relativeTime } from 'src/utils/relative-time';
import {
  TARGET_KIND_ICONS,
  TARGET_KIND_LABELS,
  lastEventLine,
  personInitials,
  personName,
  shortDate,
} from 'src/components/oficina/office-labels';

withDefaults(
  defineProps<{
    topics: OfficeTopicListItem[];
    selectedId: number | null;
    loading?: boolean;
    emptyMessage?: string;
  }>(),
  { loading: false, emptyMessage: 'No hay temas para mostrar.' }
);

const emit = defineEmits<{ select: [id: number] }>();

function hasMeta(topic: OfficeTopicListItem): boolean {
  return (
    topic.targetKind !== null ||
    topic.branchName !== null ||
    (topic.status === 'dormido' && topic.snoozedUntil !== null)
  );
}
</script>

<style scoped lang="scss">
.oficina-list__item--closed {
  opacity: 0.7;
}

.oficina-list__dot-col {
  min-width: 14px;
  padding-right: 0;
}

.oficina-list__dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--q-primary);
}

.oficina-list__side {
  min-width: 64px;
  align-items: flex-end;
}

.oficina-list__chip-text {
  display: inline-block;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 1024px) {
  .oficina-list {
    max-height: calc(100vh - 240px);
    overflow-y: auto;
  }
}
</style>
