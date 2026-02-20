<script setup lang="ts">
import { FullScreen, ScaleToOriginal } from '@element-plus/icons-vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function toggle() {
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <el-tooltip :content="modelValue ? '退出全屏' : '全屏'" placement="top">
    <el-button
      circle
      :disabled="disabled"
      :icon="modelValue ? ScaleToOriginal : FullScreen"
      @click="toggle"
    />
  </el-tooltip>
</template>
