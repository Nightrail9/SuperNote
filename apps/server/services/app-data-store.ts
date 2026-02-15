import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { normalizeJinaReaderEndpoint } from './jina-reader-client.js';
import { isBundledFfmpegAvailable } from '../utils/ffmpeg-resolver.js';

export type NoteRecord = {
  id: string;
  title: string;
  sourceUrl: string;
  contentMd: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
};

export type DraftRecord = {
  id: string;
  sourceUrl?: string;
  title?: string;
  contentMd: string;
  lastAutoSavedAt: string;
  updatedAt: string;
};

export type ModelProvider = 'gemini' | 'chatgpt' | 'openai_compatible';

export type ModelConfigRecord = {
  id: string;
  provider: ModelProvider;
  enabled: boolean;
  isDefault: boolean;
  baseUrl?: string;
  apiKey?: string;
  modelName: string;
  timeoutMs?: number;
};

export type PromptConfigRecord = {
  id: string;
  name: string;
  template: string;
  variables: string[];
  isDefault: boolean;
  updatedAt: string;
};

export type IntegrationConfigRecord = {
  jinaReader: {
    endpoint?: string;
    apiKey?: string;
    timeoutSec?: number;
    noCache?: boolean;
  };
};

export type LocalTranscriberConfigRecord = {
  engine: 'whisper_cli';
  command: string;
  ffmpegBin: string;
  model: string;
  language: string;
  device: 'cpu' | 'cuda';
  cudaChecked: boolean;
  cudaAvailable: boolean;
  cudaEnabledOnce: boolean;
  beamSize: number;
  temperature: number;
  timeoutMs: number;
};

export type VideoUnderstandingConfigRecord = {
  enabled: boolean;
  maxFrames: number;
  sceneThreshold: number;
  perSceneMax: number;
  minSceneGapSec: number;
  dedupeHashDistance: number;
  blackFrameLumaThreshold: number;
  blurVarianceThreshold: number;
  extractWidth: number;
  timeoutMs: number;
};

export type TaskRecord = {
  id: string;
  status: 'pending' | 'generating' | 'success' | 'failed' | 'cancelled';
  stage?: string;
  progress?: number;
  message?: string;
  sourceUrl: string;
  resolvedTitle?: string;
  sourceType?: 'bilibili' | 'web';
  promptId?: string;
  modelId?: string;
  formats?: string[];
  resultMd?: string;
  preparedMd?: string;
  retryable?: boolean;
  cancelReason?: string;
  debug?: {
    keyframeStats?: Array<{
      url: string;
      sceneCount: number;
      candidateCount: number;
      afterBlackFilter: number;
      afterBlurFilter: number;
      afterDedupe: number;
      finalCount: number;
      elapsedMs: number;
    }>;
    keyframeWarnings?: string[];
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type AppData = {
  notes: NoteRecord[];
  drafts: DraftRecord[];
  tasks: TaskRecord[];
  settings: {
    models: ModelConfigRecord[];
    prompts: PromptConfigRecord[];
    integrations: IntegrationConfigRecord;
    localTranscriber: LocalTranscriberConfigRecord;
    videoUnderstanding: VideoUnderstandingConfigRecord;
  };
};

const DATA_DIR = path.resolve('storage', 'data');
const DATA_FILE = path.join(DATA_DIR, 'app-data.json');

let cache: AppData | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function defaultModels(): ModelConfigRecord[] {
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

function normalizeModelRecords(input: unknown): ModelConfigRecord[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const mapped = input
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as Partial<ModelConfigRecord>)
    .filter((item) => typeof item.id === 'string' && typeof item.provider === 'string')
    .filter((item) => item.provider === 'gemini' || item.provider === 'chatgpt' || item.provider === 'openai_compatible')
    .map((item) => ({
      id: (item.id as string).trim(),
      provider: item.provider as ModelProvider,
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

  const defaultModelId = process.env.AI_DEFAULT_MODEL_ID?.trim();
  if (defaultModelId) {
    const hasMatch = deduped.some((item) => item.id === defaultModelId);
    if (hasMatch) {
      return deduped.map((item) => ({
        ...item,
        isDefault: item.id === defaultModelId,
      }));
    }
  }

  if (!deduped.some((item) => item.isDefault)) {
    deduped[0]!.isDefault = true;
  }
  return deduped;
}

function readModelsFromEnv(): ModelConfigRecord[] {
  const raw = process.env.AI_MODELS_JSON;
  if (!raw || !raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeModelRecords(parsed);
  } catch {
    return [];
  }
}

function migrateModelBaseUrls(models: ModelConfigRecord[]): ModelConfigRecord[] {
  return models.map((item) => {
    if (item.provider === 'gemini') {
      if (item.baseUrl === 'https://generativelanguage.googleapis.com/v1beta/openai/' || item.baseUrl === 'https://generativelanguage.googleapis.com/v1beta/openai') {
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

function defaultPrompts(): PromptConfigRecord[] {
  return [];
}

function defaultIntegrations(): IntegrationConfigRecord {
  return {
    jinaReader: {
      endpoint: normalizeJinaReaderEndpoint(process.env.JINA_READER_ENDPOINT || 'https://r.jina.ai/'),
      apiKey: process.env.JINA_API_KEY ?? process.env.JINA_READER_API_KEY ?? '',
      timeoutSec: Number.parseInt(process.env.JINA_READER_TIMEOUT_SEC || '30', 10),
      noCache: /^(1|true|yes)$/i.test(process.env.JINA_READER_NO_CACHE || ''),
    },
  };
}

function defaultLocalTranscriber(): LocalTranscriberConfigRecord {
  const bundledFfmpeg = 'tools/ffmpeg/bin/ffmpeg.exe';
  const hasBundled = isBundledFfmpegAvailable();
  return {
    engine: 'whisper_cli',
    command: process.env.LOCAL_ASR_COMMAND?.trim() || 'python',
    ffmpegBin: process.env.FFMPEG_BIN?.trim() || (hasBundled ? bundledFfmpeg : 'ffmpeg'),
    model: process.env.LOCAL_ASR_MODEL?.trim() || 'small',
    language: process.env.LOCAL_ASR_LANGUAGE?.trim() || 'zh',
    device: process.env.LOCAL_ASR_DEVICE?.trim() === 'cuda' ? 'cuda' : 'cpu',
    cudaChecked: false,
    cudaAvailable: false,
    cudaEnabledOnce: process.env.LOCAL_ASR_DEVICE?.trim() === 'cuda',
    beamSize: Number.parseInt(process.env.LOCAL_ASR_BEAM_SIZE || '5', 10),
    temperature: Number.parseFloat(process.env.LOCAL_ASR_TEMPERATURE || '0'),
    timeoutMs: Number.parseInt(process.env.LOCAL_ASR_TIMEOUT_MS || '1800000', 10),
  };
}

function defaultVideoUnderstanding(): VideoUnderstandingConfigRecord {
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

function withEnvFallback(value: string | undefined, envValue: string | undefined): string {
  if (value && value.trim()) {
    return value;
  }
  return envValue?.trim() ?? '';
}

function createDefaultData(): AppData {
  return {
    notes: [],
    drafts: [],
    tasks: [],
    settings: {
      models: defaultModels(),
      prompts: defaultPrompts(),
      integrations: defaultIntegrations(),
      localTranscriber: defaultLocalTranscriber(),
      videoUnderstanding: defaultVideoUnderstanding(),
    },
  };
}

function normalizeLocalTranscriberConfig(
  incoming: Partial<LocalTranscriberConfigRecord> | undefined,
): LocalTranscriberConfigRecord {
  const defaults = defaultLocalTranscriber();
  const env = process.env;

  // Priority: Environment variables > Saved config > Defaults
  const command = env.LOCAL_ASR_COMMAND?.trim() || incoming?.command || defaults.command;
  const ffmpegBin = env.FFMPEG_BIN?.trim() || incoming?.ffmpegBin || defaults.ffmpegBin;
  const model = env.LOCAL_ASR_MODEL?.trim() || incoming?.model || defaults.model;
  const language = env.LOCAL_ASR_LANGUAGE?.trim() || incoming?.language || defaults.language;
  const deviceEnv = env.LOCAL_ASR_DEVICE?.trim();
  const device =
    deviceEnv === 'cpu' || deviceEnv === 'cuda'
      ? deviceEnv
      : incoming?.device === 'cpu' || incoming?.device === 'cuda'
        ? incoming.device
        : defaults.device;
  const beamSize = env.LOCAL_ASR_BEAM_SIZE
    ? Math.max(1, Math.min(10, Math.floor(Number.parseInt(env.LOCAL_ASR_BEAM_SIZE, 10))))
    : typeof incoming?.beamSize === 'number'
      ? Math.max(1, Math.min(10, Math.floor(incoming.beamSize)))
      : defaults.beamSize;
  const temperature = env.LOCAL_ASR_TEMPERATURE
    ? Math.max(0, Math.min(1, Number.parseFloat(env.LOCAL_ASR_TEMPERATURE)))
    : typeof incoming?.temperature === 'number'
      ? Math.max(0, Math.min(1, incoming.temperature))
      : defaults.temperature;
  const timeoutMs = env.LOCAL_ASR_TIMEOUT_MS
    ? Math.max(30000, Math.min(1800000, Math.floor(Number.parseInt(env.LOCAL_ASR_TIMEOUT_MS, 10))))
    : typeof incoming?.timeoutMs === 'number'
      ? Math.max(30000, Math.min(1800000, Math.floor(incoming.timeoutMs)))
      : defaults.timeoutMs;
  const cudaChecked = typeof incoming?.cudaChecked === 'boolean' ? incoming.cudaChecked : defaults.cudaChecked;
  const cudaAvailable = typeof incoming?.cudaAvailable === 'boolean' ? incoming.cudaAvailable : defaults.cudaAvailable;
  const cudaEnabledOnce =
    typeof incoming?.cudaEnabledOnce === 'boolean'
      ? incoming.cudaEnabledOnce
      : defaults.cudaEnabledOnce || device === 'cuda';

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

function normalizeVideoUnderstandingConfig(
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

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readDiskData(): AppData {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    const initial = createDefaultData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }

  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  if (!raw.trim()) {
    const initial = createDefaultData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }

  const parsed = JSON.parse(raw) as Partial<AppData>;
  const envModels = readModelsFromEnv();
  const next: AppData = {
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    settings: {
      models: migrateModelBaseUrls(
        envModels.length > 0
          ? envModels
          : normalizeModelRecords(
              Array.isArray(parsed.settings?.models) && parsed.settings?.models.length > 0
                ? parsed.settings.models
                : defaultModels()
            )
      ),
      prompts: Array.isArray(parsed.settings?.prompts) ? parsed.settings.prompts : defaultPrompts(),
      integrations: parsed.settings?.integrations
        ? {
            jinaReader: {
              endpoint: normalizeJinaReaderEndpoint(
                withEnvFallback(parsed.settings.integrations.jinaReader?.endpoint, process.env.JINA_READER_ENDPOINT || 'https://r.jina.ai/')
              ),
              apiKey: withEnvFallback(
                parsed.settings.integrations.jinaReader?.apiKey,
                process.env.JINA_API_KEY || process.env.JINA_READER_API_KEY
              ),
              timeoutSec:
                typeof parsed.settings.integrations.jinaReader?.timeoutSec === 'number'
                  ? Math.max(3, Math.min(180, Math.floor(parsed.settings.integrations.jinaReader.timeoutSec)))
                  : Number.parseInt(process.env.JINA_READER_TIMEOUT_SEC || '30', 10),
              noCache:
                typeof parsed.settings.integrations.jinaReader?.noCache === 'boolean'
                  ? parsed.settings.integrations.jinaReader.noCache
                  : /^(1|true|yes)$/i.test(process.env.JINA_READER_NO_CACHE || ''),
            },
          }
        : defaultIntegrations(),
      localTranscriber: normalizeLocalTranscriberConfig(parsed.settings?.localTranscriber),
      videoUnderstanding: normalizeVideoUnderstandingConfig(parsed.settings?.videoUnderstanding),
    },
  };
  return next;
}

function persist(data: AppData): void {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function getAppData(): AppData {
  if (!cache) {
    cache = readDiskData();
  }
  return cache;
}

export function saveAppData(data: AppData): void {
  cache = data;
  persist(data);
}

export function mutateAppData<T>(mutator: (data: AppData) => T): T {
  const data = getAppData();
  const result = mutator(data);
  saveAppData(data);
  return result;
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function timestamp(): string {
  return nowIso();
}

export function maskSecret(secret?: string): string | undefined {
  if (!secret || !secret.trim()) {
    return undefined;
  }
  const value = secret.trim();
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
