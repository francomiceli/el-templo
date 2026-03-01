<script setup lang="ts">
interface PlaceholderBoxProps {
  label?: string;
  aspectRatio?: string;
  height?: string;
}

const props = withDefaults(defineProps<PlaceholderBoxProps>(), {
  label: "Imagen pendiente",
  aspectRatio: undefined,
  height: undefined,
});

const boxStyle = computed(() => {
  const style: Record<string, string> = {};
  if (props.aspectRatio) {
    style.aspectRatio = props.aspectRatio;
  } else if (props.height) {
    style.height = props.height;
  }
  return style;
});
</script>

<template>
  <div class="placeholder-box" :style="boxStyle">
    <span class="placeholder-box__label">{{ label }}</span>
  </div>
</template>

<style scoped>
.placeholder-box {
  background: var(--color-deep-charcoal);
  border: 1px solid var(--color-warm-stone);
  border-radius: var(--radius-card);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  overflow: hidden;
}

.placeholder-box__label {
  font-family: var(--font-clarity);
  font-size: 14px;
  color: var(--color-olive-stone);
  text-align: center;
  padding: var(--space-base);
}
</style>
