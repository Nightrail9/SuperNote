import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../../api/modules'
import { filterModelOptions, filterPromptOptions } from '../../utils/dropdownHelpers'
import type { ModelConfig, PromptConfig } from '../../types/domain'
import { toArrayData } from '../../utils/api-data'

function resolveDefaultId(options: Array<{ value: string }>, items: Array<{ id: string; isDefault?: boolean }>): string | undefined {
  if (!options.length) return undefined

  const optionIds = new Set(options.map((item) => item.value))
  const configuredDefault = items.find((item) => item.isDefault && optionIds.has(item.id))
  return configuredDefault?.id ?? options[0]?.value
}

export function useTaskConfigOptions() {
  const modelsLoading = ref(false)
  const promptsLoading = ref(false)
  const models = ref<ModelConfig[]>([])
  const prompts = ref<PromptConfig[]>([])

  const modelSelectOptions = computed(() => filterModelOptions(models.value))
  const promptSelectOptions = computed(() => filterPromptOptions(prompts.value))

  const defaultModelId = computed(() => resolveDefaultId(modelSelectOptions.value, models.value))
  const defaultPromptId = computed(() => resolveDefaultId(promptSelectOptions.value, prompts.value))

  async function loadModels() {
    modelsLoading.value = true
    try {
      const response = await api.getModels()
      models.value = toArrayData<ModelConfig>(response.data)
    } catch (error) {
      ElMessage.error((error as { message?: string }).message ?? '加载模型失败')
    } finally {
      modelsLoading.value = false
    }
  }

  async function loadPrompts() {
    promptsLoading.value = true
    try {
      const response = await api.getPrompts()
      prompts.value = toArrayData<PromptConfig>(response.data)
    } catch (error) {
      ElMessage.error((error as { message?: string }).message ?? '加载提示词失败')
    } finally {
      promptsLoading.value = false
    }
  }

  async function refreshTaskConfigOptions() {
    await Promise.all([loadModels(), loadPrompts()])
  }

  return {
    modelsLoading,
    promptsLoading,
    modelSelectOptions,
    promptSelectOptions,
    defaultModelId,
    defaultPromptId,
    refreshTaskConfigOptions,
  }
}
