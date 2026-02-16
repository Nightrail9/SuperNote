import * as fs from 'fs';
import * as path from 'path';

import { isBundledFfmpegAvailable } from '../../utils/ffmpeg-resolver.js';
import { normalizeJinaReaderEndpoint } from '../jina-reader-client.js';
import type {
  IntegrationConfigRecord,
  LocalTranscriberConfigRecord,
  ModelConfigRecord,
  PromptConfigRecord,
  VideoUnderstandingConfigRecord,
} from '../app-data-store.js';

const DATA_DIR = path.resolve('data');
const SETTING_DIR = path.resolve('setting');
const ENV_FILE = path.resolve('.env');

const LEGACY_SETTINGS_FILE = path.join(DATA_DIR, 'app-settings.json');
const LEGACY_SETTINGS_DIR = path.join(DATA_DIR, 'settings');

export const MODELS_FILE = path.join(SETTING_DIR, 'models.json');
export const PROMPTS_FILE = path.join(SETTING_DIR, 'prompts.json');
export const INTEGRATIONS_FILE = path.join(SETTING_DIR, 'integrations.json');
export const LOCAL_TRANSCRIBER_FILE = path.join(SETTING_DIR, 'local-transcriber.json');
export const VIDEO_UNDERSTANDING_FILE = path.join(SETTING_DIR, 'video-understanding.json');

let migrated = false;

export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function ensureSettingsDir(): void {
  if (!fs.existsSync(SETTING_DIR)) {
    fs.mkdirSync(SETTING_DIR, { recursive: true });
  }
}

export function readJson(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) {
    return undefined;
  }
  return JSON.parse(raw) as unknown;
}

export function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function safeReadJson(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    return readJson(filePath);
  } catch {
    return undefined;
  }
}

function readLegacySettingsObject(): Partial<{
  models: unknown;
  prompts: unknown;
  integrations: unknown;
  localTranscriber: unknown;
  videoUnderstanding: unknown;
}> {
  const parsed = safeReadJson(LEGACY_SETTINGS_FILE);
  if (!parsed || typeof parsed !== 'object') {
    return {};
  }
  const record = parsed as Record<string, unknown>;
  return {
    models: record.models,
    prompts: record.prompts,
    integrations: record.integrations,
    localTranscriber: record.localTranscriber,
    videoUnderstanding: record.videoUnderstanding,
  };
}

function removeLegacySettingsArtifacts(): void {
  if (fs.existsSync(LEGACY_SETTINGS_FILE)) {
    try {
      fs.unlinkSync(LEGACY_SETTINGS_FILE);
    } catch {
      // ignore
    }
  }

  if (!fs.existsSync(LEGACY_SETTINGS_DIR)) {
    return;
  }
  try {
    const entries = fs.readdirSync(LEGACY_SETTINGS_DIR);
    for (const entry of entries) {
      const filePath = path.join(LEGACY_SETTINGS_DIR, entry);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    }
    fs.rmdirSync(LEGACY_SETTINGS_DIR);
  } catch {
    // ignore
  }
}

function removeLegacyNonSecretEnvKeys(): void {
  setEnvValue('JINA_READER_ENDPOINT', undefined);
  setEnvValue('JINA_READER_TIMEOUT_SEC', undefined);
  setEnvValue('JINA_READER_NO_CACHE', undefined);
}

export function defaultModels(): ModelConfigRecord[] {
  return [
    {
      id: 'gemini',
      provider: 'gemini',
      enabled: false,
      isDefault: true,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: '',
      modelName: 'gemini-2.5-flash',
      timeoutMs: 60000,
    },
    {
      id: 'chatgpt',
      provider: 'chatgpt',
      enabled: false,
      isDefault: false,
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      modelName: 'gpt-5-mini',
      timeoutMs: 60000,
    },
    {
      id: 'openai_compatible',
      provider: 'openai_compatible',
      enabled: false,
      isDefault: false,
      baseUrl: '',
      apiKey: '',
      modelName: '',
      timeoutMs: 60000,
    },
  ];
}

export function defaultPrompts(): PromptConfigRecord[] {
  return [];
}

function withEnvFallback(value: string | undefined, envValue: string | undefined): string {
  if (value && value.trim()) {
    return value;
  }
  return envValue?.trim() ?? '';
}

function readEnvFileRaw(): string {
  if (!fs.existsSync(ENV_FILE)) {
    return '';
  }
  return fs.readFileSync(ENV_FILE, 'utf-8');
}

function writeEnvFileRaw(raw: string): void {
  fs.writeFileSync(ENV_FILE, raw, 'utf-8');
}

function normalizeEnvLineBreak(raw: string): string {
  return raw.includes('\r\n') ? '\r\n' : '\n';
}

function parseEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function getEnvValue(key: string): string | undefined {
  const fromProcess = process.env[key]?.trim();
  if (fromProcess) {
    return fromProcess;
  }

  const raw = readEnvFileRaw();
  if (!raw) {
    return undefined;
  }
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const current = line.trim();
    if (!current || current.startsWith('#')) {
      continue;
    }
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(current);
    if (!match) {
      continue;
    }
    if (match[1] !== key) {
      continue;
    }
    const value = parseEnvValue(match[2] ?? '');
    return value || undefined;
  }
  return undefined;
}

export function setEnvValue(key: string, value: string | undefined): void {
  const normalized = value?.trim() ?? '';
  const shouldDelete = normalized.length === 0;

  const raw = readEnvFileRaw();
  const lineBreak = normalizeEnvLineBreak(raw);
  const lines = raw ? raw.split(/\r?\n/) : [];
  const keyPattern = new RegExp(`^${key}\\s*=`);

  const filtered = lines.filter((line) => !keyPattern.test(line.trim()));
  if (!shouldDelete) {
    filtered.push(`${key}=${normalized}`);
  }

  const next = filtered.filter((line, index, arr) => !(index === arr.length - 1 && line === '')).join(lineBreak);
  writeEnvFileRaw(next.length > 0 ? `${next}${lineBreak}` : '');

  if (shouldDelete) {
    delete process.env[key];
  } else {
    process.env[key] = normalized;
  }
}

function normalizeModelIdForEnv(modelId: string): string {
  return modelId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function toModelApiKeyEnvName(modelId: string): string {
  const normalized = normalizeModelIdForEnv(modelId);
  return normalized ? `MODEL_API_KEY_${normalized}` : 'MODEL_API_KEY_UNKNOWN';
}

export function getModelApiKeyFromEnv(modelId: string): string | undefined {
  return getEnvValue(toModelApiKeyEnvName(modelId));
}

export function setModelApiKeyInEnv(modelId: string, apiKey: string | undefined): void {
  setEnvValue(toModelApiKeyEnvName(modelId), apiKey);
}

export function clearStaleModelApiKeysInEnv(validModelIds: string[]): void {
  const expectedKeys = new Set(validModelIds.map((id) => toModelApiKeyEnvName(id)));
  const raw = readEnvFileRaw();
  if (!raw) {
    return;
  }

  const lineBreak = normalizeEnvLineBreak(raw);
  const lines = raw.split(/\r?\n/);
  let changed = false;

  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return true;
    }
    const match = /^([A-Z0-9_]+)\s*=/.exec(trimmed);
    if (!match) {
      return true;
    }
    const key = match[1];
    if (!key.startsWith('MODEL_API_KEY_')) {
      return true;
    }
    if (expectedKeys.has(key)) {
      return true;
    }

    delete process.env[key];
    changed = true;
    return false;
  });

  if (!changed) {
    return;
  }

  const next = filtered.filter((line, index, arr) => !(index === arr.length - 1 && line === '')).join(lineBreak);
  writeEnvFileRaw(next.length > 0 ? `${next}${lineBreak}` : '');
}

function resolveJinaApiKeyFromEnv(): string {
  return (getEnvValue('JINA_API_KEY') ?? getEnvValue('JINA_READER_API_KEY') ?? '').trim();
}

export function setJinaApiKeyInEnv(apiKey: string | undefined): void {
  setEnvValue('JINA_API_KEY', apiKey);
}

export function defaultIntegrations(): IntegrationConfigRecord {
  return {
    jinaReader: {
      endpoint: normalizeJinaReaderEndpoint('https://r.jina.ai/'),
      apiKey: resolveJinaApiKeyFromEnv(),
      timeoutSec: 30,
      noCache: false,
    },
  };
}

export function sanitizeIntegrationsForStorage(integrations: IntegrationConfigRecord): IntegrationConfigRecord {
  return {
    jinaReader: {
      endpoint: integrations.jinaReader.endpoint,
      timeoutSec: integrations.jinaReader.timeoutSec,
      noCache: integrations.jinaReader.noCache,
    },
  };
}

export function migrateModelBaseUrls(models: ModelConfigRecord[]): ModelConfigRecord[] {
  return models.map((item) => {
    if (item.provider === 'gemini') {
      if (
        item.baseUrl === 'https://generativelanguage.googleapis.com/v1beta/openai/' ||
        item.baseUrl === 'https://generativelanguage.googleapis.com/v1beta/openai'
      ) {
        return { ...item, baseUrl: 'https://generativelanguage.googleapis.com/v1beta' };
      }
      return item;
    }

    if (item.provider === 'chatgpt') {
      if (item.baseUrl === 'https://api.openai.com/v1/chat/completions') {
        return { ...item, baseUrl: 'https://api.openai.com/v1' };
      }
      return item;
    }

    return item;
  });
}

export function normalizeModelPayload(payload: unknown): ModelConfigRecord[] | null {
  if (!Array.isArray(payload)) {
    return null;
  }

  const mapped = payload
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as Partial<ModelConfigRecord>)
    .filter((item) => typeof item.id === 'string' && typeof item.provider === 'string')
    .filter((item) => item.provider === 'gemini' || item.provider === 'chatgpt' || item.provider === 'openai_compatible')
    .map((item) => ({
      id: (item.id as string).trim(),
      provider: item.provider as ModelConfigRecord['provider'],
      enabled: Boolean(item.enabled),
      isDefault: Boolean(item.isDefault),
      baseUrl: typeof item.baseUrl === 'string' ? item.baseUrl.trim() : undefined,
      apiKey: typeof item.apiKey === 'string' ? item.apiKey.trim() : undefined,
      modelName: typeof item.modelName === 'string' ? item.modelName.trim() : '',
      timeoutMs: typeof item.timeoutMs === 'number' ? item.timeoutMs : undefined,
    }))
    .filter((item) => item.id.length > 0);

  if (mapped.length === 0) {
    return [];
  }

  const deduped: ModelConfigRecord[] = [];
  const seen = new Set<string>();
  for (const item of mapped) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    deduped.push(item);
  }

  if (!deduped.some((item) => item.isDefault)) {
    deduped[0]!.isDefault = true;
  }

  return deduped;
}

export function normalizeIntegrationsPayload(payload: unknown): IntegrationConfigRecord {
  const parsed = payload && typeof payload === 'object' ? (payload as Partial<IntegrationConfigRecord>) : undefined;
  const defaults = defaultIntegrations();

  return {
    jinaReader: {
      endpoint: normalizeJinaReaderEndpoint(withEnvFallback(parsed?.jinaReader?.endpoint, defaults.jinaReader.endpoint)),
      apiKey: resolveJinaApiKeyFromEnv(),
      timeoutSec:
        typeof parsed?.jinaReader?.timeoutSec === 'number'
          ? Math.max(3, Math.min(180, Math.floor(parsed.jinaReader.timeoutSec)))
          : defaults.jinaReader.timeoutSec,
      noCache:
        typeof parsed?.jinaReader?.noCache === 'boolean'
          ? parsed.jinaReader.noCache
          : Boolean(defaults.jinaReader.noCache),
    },
  };
}

export function defaultLocalTranscriber(): LocalTranscriberConfigRecord {
  const bundledFfmpeg = 'tools/ffmpeg/bin/ffmpeg.exe';
  const hasBundled = isBundledFfmpegAvailable();
  return {
    engine: 'whisper_cli',
    command: 'python',
    ffmpegBin: hasBundled ? bundledFfmpeg : 'ffmpeg',
    model: 'small',
    language: 'zh',
    device: 'cpu',
    cudaChecked: false,
    cudaAvailable: false,
    cudaEnabledOnce: false,
    beamSize: 5,
    temperature: 0,
    timeoutMs: 1800000,
  };
}

export function normalizeLocalTranscriberConfig(
  incoming: Partial<LocalTranscriberConfigRecord> | undefined,
): LocalTranscriberConfigRecord {
  const defaults = defaultLocalTranscriber();

  const command = incoming?.command || defaults.command;
  const ffmpegBin = incoming?.ffmpegBin || defaults.ffmpegBin;
  const model = incoming?.model || defaults.model;
  const language = incoming?.language || defaults.language;
  const incomingDevice = incoming?.device === 'cpu' || incoming?.device === 'cuda' ? incoming.device : defaults.device;
  const beamSize =
    typeof incoming?.beamSize === 'number'
      ? Math.max(1, Math.min(10, Math.floor(incoming.beamSize)))
      : defaults.beamSize;
  const temperature =
    typeof incoming?.temperature === 'number' ? Math.max(0, Math.min(1, incoming.temperature)) : defaults.temperature;
  const timeoutMs =
    typeof incoming?.timeoutMs === 'number'
      ? Math.max(30000, Math.min(1800000, Math.floor(incoming.timeoutMs)))
      : defaults.timeoutMs;
  const cudaChecked = typeof incoming?.cudaChecked === 'boolean' ? incoming.cudaChecked : defaults.cudaChecked;
  const cudaAvailable = typeof incoming?.cudaAvailable === 'boolean' ? incoming.cudaAvailable : defaults.cudaAvailable;
  const hasVerifiedCuda = cudaChecked && cudaAvailable;
  const device = incomingDevice === 'cuda' && !hasVerifiedCuda ? 'cpu' : incomingDevice;
  const cudaEnabledOnce = hasVerifiedCuda
    ? (typeof incoming?.cudaEnabledOnce === 'boolean' ? incoming.cudaEnabledOnce : defaults.cudaEnabledOnce) || device === 'cuda'
    : false;

  return {
    engine: 'whisper_cli',
    command,
    ffmpegBin,
    model,
    language,
    device,
    cudaChecked,
    cudaAvailable,
    cudaEnabledOnce,
    beamSize,
    temperature,
    timeoutMs,
  };
}

export function defaultVideoUnderstanding(): VideoUnderstandingConfigRecord {
  return {
    enabled: true,
    maxFrames: 24,
    sceneThreshold: 0.3,
    perSceneMax: 2,
    minSceneGapSec: 2,
    dedupeHashDistance: 6,
    blackFrameLumaThreshold: 18,
    blurVarianceThreshold: 80,
    extractWidth: 640,
    timeoutMs: 120000,
  };
}

export function normalizeVideoUnderstandingConfig(
  incoming: Partial<VideoUnderstandingConfigRecord> | undefined,
): VideoUnderstandingConfigRecord {
  const defaults = defaultVideoUnderstanding();
  return {
    enabled: typeof incoming?.enabled === 'boolean' ? incoming.enabled : defaults.enabled,
    maxFrames:
      typeof incoming?.maxFrames === 'number'
        ? Math.max(4, Math.min(120, Math.floor(incoming.maxFrames)))
        : defaults.maxFrames,
    sceneThreshold:
      typeof incoming?.sceneThreshold === 'number'
        ? Math.max(0.05, Math.min(0.95, incoming.sceneThreshold))
        : defaults.sceneThreshold,
    perSceneMax:
      typeof incoming?.perSceneMax === 'number'
        ? Math.max(1, Math.min(3, Math.floor(incoming.perSceneMax)))
        : defaults.perSceneMax,
    minSceneGapSec:
      typeof incoming?.minSceneGapSec === 'number'
        ? Math.max(0.2, Math.min(30, incoming.minSceneGapSec))
        : defaults.minSceneGapSec,
    dedupeHashDistance:
      typeof incoming?.dedupeHashDistance === 'number'
        ? Math.max(1, Math.min(64, Math.floor(incoming.dedupeHashDistance)))
        : defaults.dedupeHashDistance,
    blackFrameLumaThreshold:
      typeof incoming?.blackFrameLumaThreshold === 'number'
        ? Math.max(0, Math.min(255, Math.floor(incoming.blackFrameLumaThreshold)))
        : defaults.blackFrameLumaThreshold,
    blurVarianceThreshold:
      typeof incoming?.blurVarianceThreshold === 'number'
        ? Math.max(1, Math.min(10000, incoming.blurVarianceThreshold))
        : defaults.blurVarianceThreshold,
    extractWidth:
      typeof incoming?.extractWidth === 'number'
        ? Math.max(160, Math.min(1920, Math.floor(incoming.extractWidth)))
        : defaults.extractWidth,
    timeoutMs:
      typeof incoming?.timeoutMs === 'number'
        ? Math.max(15000, Math.min(600000, Math.floor(incoming.timeoutMs)))
        : defaults.timeoutMs,
  };
}

export function ensureSplitSettingsMigrated(): void {
  if (migrated) {
    return;
  }

  ensureDataDir();
  ensureSettingsDir();

  const legacyObject = readLegacySettingsObject();

  const legacyModels = legacyObject.models ?? safeReadJson(path.join(LEGACY_SETTINGS_DIR, 'models.json'));
  const legacyPrompts = legacyObject.prompts ?? safeReadJson(path.join(LEGACY_SETTINGS_DIR, 'prompts.json'));
  const legacyIntegrations = legacyObject.integrations ?? safeReadJson(path.join(LEGACY_SETTINGS_DIR, 'integrations.json'));
  const legacyLocalTranscriber =
    legacyObject.localTranscriber ?? safeReadJson(path.join(LEGACY_SETTINGS_DIR, 'local-transcriber.json'));
  const legacyVideoUnderstanding =
    legacyObject.videoUnderstanding ?? safeReadJson(path.join(LEGACY_SETTINGS_DIR, 'video-understanding.json'));

  if (!fs.existsSync(MODELS_FILE)) {
    const normalized = normalizeModelPayload(legacyModels);
    const models = normalized && normalized.length > 0 ? migrateModelBaseUrls(normalized) : defaultModels();
    writeJson(MODELS_FILE, models);
  }

  if (!fs.existsSync(PROMPTS_FILE)) {
    const prompts = Array.isArray(legacyPrompts) ? (legacyPrompts as PromptConfigRecord[]) : defaultPrompts();
    writeJson(PROMPTS_FILE, prompts);
  }

  if (!fs.existsSync(INTEGRATIONS_FILE)) {
    writeJson(INTEGRATIONS_FILE, sanitizeIntegrationsForStorage(normalizeIntegrationsPayload(legacyIntegrations)));
  }

  if (!fs.existsSync(LOCAL_TRANSCRIBER_FILE)) {
    writeJson(
      LOCAL_TRANSCRIBER_FILE,
      normalizeLocalTranscriberConfig(legacyLocalTranscriber as Partial<LocalTranscriberConfigRecord> | undefined),
    );
  }

  if (!fs.existsSync(VIDEO_UNDERSTANDING_FILE)) {
    writeJson(
      VIDEO_UNDERSTANDING_FILE,
      normalizeVideoUnderstandingConfig(legacyVideoUnderstanding as Partial<VideoUnderstandingConfigRecord> | undefined),
    );
  }

  removeLegacySettingsArtifacts();
  removeLegacyNonSecretEnvKeys();
  migrated = true;
}
