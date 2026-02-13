<script setup lang="ts">
import { MdEditor } from 'md-editor-v3'

withDefaults(
  defineProps<{
    value: string
    height?: number
  }>(),
  {
    height: 320,
  },
)

const emit = defineEmits<{
  change: [value: string]
}>()
</script>

<template>
  <MdEditor
    :model-value="value"
    :preview="false"
    :style="{ height: `${height}px` }"
    @on-change="(next) => emit('change', next || '')"
  />
</template>
