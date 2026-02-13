<script setup lang="ts">
import { MdPreview } from 'md-editor-v3'

defineProps<{
  source: string
}>()
</script>

<template>
  <MdPreview editor-id="md-preview" :model-value="source || '暂无内容'" preview-theme="default" />
</template>
