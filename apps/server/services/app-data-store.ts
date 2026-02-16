import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

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
};

const DATA_DIR = path.resolve('data');
const LEGACY_DATA_FILE = path.join(DATA_DIR, 'app-data.json');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');
const DRAFTS_FILE = path.join(DATA_DIR, 'drafts.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

let cache: AppData | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function createDefaultRuntimeData(): AppData {
  return {
    notes: [],
    drafts: [],
    tasks: [],
  };
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function readJson(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) {
    return undefined;
  }
  return JSON.parse(raw) as unknown;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function safeReadArray<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const parsed = readJson(filePath);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function ensureArrayFile(filePath: string, fallback: unknown[]): void {
  if (!fs.existsSync(filePath)) {
    writeJson(filePath, fallback);
  }
}

function migrateLegacyAppDataIfNeeded(): void {
  const hasSplitFiles = fs.existsSync(NOTES_FILE) || fs.existsSync(DRAFTS_FILE) || fs.existsSync(TASKS_FILE);
  if (!fs.existsSync(LEGACY_DATA_FILE)) {
    if (!hasSplitFiles) {
      const defaults = createDefaultRuntimeData();
      writeJson(NOTES_FILE, defaults.notes);
      writeJson(DRAFTS_FILE, defaults.drafts);
      writeJson(TASKS_FILE, defaults.tasks);
    }
    return;
  }

  let parsed: Partial<AppData> = {};
  try {
    const raw = readJson(LEGACY_DATA_FILE) as Partial<AppData> | undefined;
    parsed = raw && typeof raw === 'object' ? raw : {};
  } catch {
    parsed = {};
  }

  if (!fs.existsSync(NOTES_FILE)) {
    writeJson(NOTES_FILE, Array.isArray(parsed.notes) ? parsed.notes : []);
  }
  if (!fs.existsSync(DRAFTS_FILE)) {
    writeJson(DRAFTS_FILE, Array.isArray(parsed.drafts) ? parsed.drafts : []);
  }
  if (!fs.existsSync(TASKS_FILE)) {
    writeJson(TASKS_FILE, Array.isArray(parsed.tasks) ? parsed.tasks : []);
  }

  try {
    fs.unlinkSync(LEGACY_DATA_FILE);
  } catch {
    // ignore
  }
}

function readDiskData(): AppData {
  ensureDataDir();
  migrateLegacyAppDataIfNeeded();

  ensureArrayFile(NOTES_FILE, []);
  ensureArrayFile(DRAFTS_FILE, []);
  ensureArrayFile(TASKS_FILE, []);

  return {
    notes: safeReadArray<NoteRecord>(NOTES_FILE),
    drafts: safeReadArray<DraftRecord>(DRAFTS_FILE),
    tasks: safeReadArray<TaskRecord>(TASKS_FILE),
  };
}

function persist(data: AppData): void {
  ensureDataDir();
  writeJson(NOTES_FILE, data.notes);
  writeJson(DRAFTS_FILE, data.drafts);
  writeJson(TASKS_FILE, data.tasks);
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
