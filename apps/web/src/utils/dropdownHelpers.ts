import type { ModelConfig, PromptConfig } from '../types/domain'

type SelectOption = { label: string; value: string }

export function filterModelOptions(models: ModelConfig[]): SelectOption[] {
  return models
    .filter((item) => {
      const hasModel = typeof item.modelName === 'string' && item.modelName.trim().length > 0
      const hasBaseUrl = typeof item.baseUrl === 'string' && item.baseUrl.trim().length > 0
      const hasApiKey = typeof item.apiKeyMasked === 'string' && item.apiKeyMasked.trim().length > 0
      return item.enabled && hasModel && hasBaseUrl && hasApiKey
    })
    .map((item) => ({
      label: `${item.id} / ${item.modelName}`,
      value: item.id,
    }))
}

export function filterPromptOptions(prompts: PromptConfig[]): SelectOption[] {
  return prompts
    .filter((item) => typeof item.template === 'string' && item.template.trim().length > 0)
    .map((item) => ({ label: item.name, value: item.id }))
}
