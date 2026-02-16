import {
  clearStaleModelApiKeysInEnv,
  MODELS_FILE,
  defaultModels,
  ensureSplitSettingsMigrated,
  getModelApiKeyFromEnv,
  migrateModelBaseUrls,
  normalizeModelPayload,
  readJson,
  setModelApiKeyInEnv,
  writeJson,
} from './shared.js';
import type { ModelConfigRecord } from '../app-data-store.js';

function sanitizeModelsForStorage(models: ModelConfigRecord[]): ModelConfigRecord[] {
  return models.map(({ apiKey: _apiKey, ...rest }) => ({ ...rest }));
}

function hydrateModelApiKeys(models: ModelConfigRecord[]): ModelConfigRecord[] {
  return models.map((item) => ({
    ...item,
    apiKey: getModelApiKeyFromEnv(item.id) ?? '',
  }));
}

function migrateLegacyModelApiKeys(models: ModelConfigRecord[]): ModelConfigRecord[] {
  let changed = false;

  const migrated = models.map((item) => {
    const legacyApiKey = typeof item.apiKey === 'string' ? item.apiKey.trim() : '';
    if (!legacyApiKey) {
      return { ...item, apiKey: undefined };
    }

    const envApiKey = getModelApiKeyFromEnv(item.id);
    if (!envApiKey) {
      setModelApiKeyInEnv(item.id, legacyApiKey);
    }
    changed = true;
    return { ...item, apiKey: undefined };
  });

  if (changed) {
    writeJson(MODELS_FILE, sanitizeModelsForStorage(migrated));
  }

  return migrated;
}

export function getModels(): ModelConfigRecord[] {
  ensureSplitSettingsMigrated();

  try {
    const normalized = normalizeModelPayload(readJson(MODELS_FILE));
    const fromDisk = normalized && normalized.length > 0 ? migrateModelBaseUrls(normalized) : defaultModels();

    const migrated = migrateLegacyModelApiKeys(fromDisk);
    if (!normalized || normalized.length === 0) {
      writeJson(MODELS_FILE, sanitizeModelsForStorage(migrated));
    }

    clearStaleModelApiKeysInEnv(migrated.map((item) => item.id));
    return hydrateModelApiKeys(migrated);
  } catch {
    const defaults = defaultModels();
    writeJson(MODELS_FILE, sanitizeModelsForStorage(defaults));
    clearStaleModelApiKeysInEnv(defaults.map((item) => item.id));
    return hydrateModelApiKeys(defaults);
  }
}

export function saveModels(models: ModelConfigRecord[]): void {
  ensureSplitSettingsMigrated();

  const normalized = migrateModelBaseUrls(models);
  const existing = normalizeModelPayload(readJson(MODELS_FILE)) ?? [];
  const nextIds = new Set(normalized.map((item) => item.id));

  for (const oldItem of existing) {
    if (!nextIds.has(oldItem.id)) {
      setModelApiKeyInEnv(oldItem.id, undefined);
    }
  }

  for (const model of normalized) {
    setModelApiKeyInEnv(model.id, model.apiKey);
  }
  clearStaleModelApiKeysInEnv(normalized.map((item) => item.id));
  writeJson(MODELS_FILE, sanitizeModelsForStorage(normalized));
}
