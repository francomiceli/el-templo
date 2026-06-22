<template>
  <span v-if="segment || avatarType" class="row inline items-center q-gutter-xs">
    <q-badge v-if="segment" :color="segmentColor" :label="segmentLabel" class="text-caption" />
    <q-badge v-if="avatarType" outline color="grey-7" :label="avatarType" class="text-caption">
      <q-tooltip>{{ avatarLabel }}</q-tooltip>
    </q-badge>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  SEGMENT_LABELS,
  SEGMENT_COLORS,
  AVATAR_LABELS,
  type MemberSegment,
} from 'src/types/member';

const props = defineProps<{
  segment: string | null;
  avatarType: string | null;
}>();

const segmentLabel = computed(() =>
  props.segment ? (SEGMENT_LABELS[props.segment as MemberSegment] ?? props.segment) : ''
);

const segmentColor = computed(() =>
  props.segment ? (SEGMENT_COLORS[props.segment as MemberSegment] ?? 'grey') : 'grey'
);

const avatarLabel = computed(() =>
  props.avatarType ? (AVATAR_LABELS[props.avatarType] ?? props.avatarType) : ''
);
</script>
