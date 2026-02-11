import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { normalizeTingwuEndpoint } from './tingwu-client.js';
import { normalizeJinaReaderEndpoint } from './jina-reader-client.js';

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
  oss: {
    endpoint: string;
    bucket: string;
    accessKeyId?: string;
    accessKeySecret?: string;
    region?: string;
  };
  tingwu: {
    appKey?: string;
    secret?: string;
    endpoint?: string;
  };
  jinaReader: {
    endpoint?: string;
    apiKey?: string;
    timeoutSec?: number;
    noCache?: boolean;
  };
};

export type TaskRecord = {
  id: string;
  status: 'pending' | 'generating' | 'success' | 'failed';
  stage?: string;
  progress?: number;
  message?: string;
  suggestedTitle?: string;
  sourceUrl: string;
  sourceType?: 'bilibili' | 'web';
  promptId?: string;
  modelId?: string;
  resultMd?: string;
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
  };
};

const DATA_DIR = path.resolve('data');
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
    oss: {
      endpoint: process.env.OSS_REGION ? `${process.env.OSS_REGION}.aliyuncs.com` : '',
      bucket: process.env.OSS_BUCKET ?? '',
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID ?? '',
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET ?? '',
      region: process.env.OSS_REGION ?? 'oss-cn-hangzhou',
    },
    tingwu: {
      appKey: process.env.TINGWU_APP_KEY ?? '',
      secret: process.env.ALIYUN_ACCESS_KEY_SECRET ?? '',
      endpoint: normalizeTingwuEndpoint('tingwu.cn-beijing.aliyuncs.com'),
    },
    jinaReader: {
      endpoint: normalizeJinaReaderEndpoint(process.env.JINA_READER_ENDPOINT || 'https://r.jina.ai/'),
      apiKey: process.env.JINA_API_KEY ?? process.env.JINA_READER_API_KEY ?? '',
      timeoutSec: Number.parseInt(process.env.JINA_READER_TIMEOUT_SEC || '30', 10),
      noCache: /^(1|true|yes)$/i.test(process.env.JINA_READER_NO_CACHE || ''),
    },
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
    },
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
  const next: AppData = {
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    settings: {
      models: migrateModelBaseUrls(
        Array.isArray(parsed.settings?.models) && parsed.settings?.models.length > 0
          ? parsed.settings.models
          : defaultModels()
      ),
      prompts: Array.isArray(parsed.settings?.prompts) ? parsed.settings.prompts : defaultPrompts(),
      integrations: parsed.settings?.integrations
        ? {
            oss: {
              endpoint: withEnvFallback(
                parsed.settings.integrations.oss?.endpoint,
                process.env.OSS_REGION ? `${process.env.OSS_REGION}.aliyuncs.com` : ''
              ),
              bucket: withEnvFallback(parsed.settings.integrations.oss?.bucket, process.env.OSS_BUCKET),
              accessKeyId: withEnvFallback(parsed.settings.integrations.oss?.accessKeyId, process.env.ALIYUN_ACCESS_KEY_ID),
              accessKeySecret: withEnvFallback(
                parsed.settings.integrations.oss?.accessKeySecret,
                process.env.ALIYUN_ACCESS_KEY_SECRET
              ),
              region: withEnvFallback(parsed.settings.integrations.oss?.region, process.env.OSS_REGION),
            },
            tingwu: {
              appKey: withEnvFallback(parsed.settings.integrations.tingwu?.appKey, process.env.TINGWU_APP_KEY),
              secret: withEnvFallback(parsed.settings.integrations.tingwu?.secret, process.env.ALIYUN_ACCESS_KEY_SECRET),
              endpoint: normalizeTingwuEndpoint(
                withEnvFallback(parsed.settings.integrations.tingwu?.endpoint, 'tingwu.cn-beijing.aliyuncs.com')
              ),
            },
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
