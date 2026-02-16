import {
  INTEGRATIONS_FILE,
  ensureSplitSettingsMigrated,
  normalizeIntegrationsPayload,
  readJson,
  sanitizeIntegrationsForStorage,
  setJinaApiKeyInEnv,
  writeJson,
} from './shared.js';
import type { IntegrationConfigRecord } from '../app-data-store.js';

export function getIntegrations(): IntegrationConfigRecord {
  ensureSplitSettingsMigrated();
  try {
    const raw = readJson(INTEGRATIONS_FILE);
    const legacyApiKey =
      raw && typeof raw === 'object' && typeof (raw as { jinaReader?: { apiKey?: unknown } }).jinaReader?.apiKey === 'string'
        ? ((raw as { jinaReader?: { apiKey?: string } }).jinaReader?.apiKey ?? '').trim()
        : '';
    if (legacyApiKey) {
      setJinaApiKeyInEnv(legacyApiKey);
    }

    const normalized = normalizeIntegrationsPayload(raw);
    writeJson(INTEGRATIONS_FILE, sanitizeIntegrationsForStorage(normalized));
    return normalized;
  } catch {
    const normalized = normalizeIntegrationsPayload(undefined);
    writeJson(INTEGRATIONS_FILE, sanitizeIntegrationsForStorage(normalized));
    return normalized;
  }
}

export function saveIntegrations(integrations: IntegrationConfigRecord): void {
  ensureSplitSettingsMigrated();
  writeJson(INTEGRATIONS_FILE, sanitizeIntegrationsForStorage(normalizeIntegrationsPayload(integrations)));
}

export function setJinaApiKey(apiKey: string | undefined): void {
  setJinaApiKeyInEnv(apiKey);
}
