import * as fs from 'fs';
import * as path from 'path';

type LogLevel = 'info' | 'warn' | 'error';

type DiagnosticPayload = Record<string, unknown>;

const LOG_DIR = path.resolve('data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'note-generation-debug.log');
const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024;
const MAX_VALUE_LENGTH = 1500;

function safeError(error: unknown): { name?: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: truncate(error.message, 1000),
      stack: truncate(error.stack || '', 2000) || undefined,
    };
  }
  return { message: truncate(String(error), 1000) };
}

function truncate(value: string, max: number = MAX_VALUE_LENGTH): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...<truncated>`;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return truncate(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => sanitizeValue(item));
  }
  if (typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, current] of Object.entries(src)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('apikey') || lowerKey.includes('authorization') || lowerKey.includes('token')) {
        out[key] = '[masked]';
        continue;
      }
      out[key] = sanitizeValue(current);
    }
    return out;
  }
  return String(value);
}

function ensureLogFile(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, '', 'utf-8');
    return;
  }

  const size = fs.statSync(LOG_FILE).size;
  if (size < MAX_LOG_FILE_BYTES) {
    return;
  }

  const archived = `${LOG_FILE}.${Date.now()}.bak`;
  fs.renameSync(LOG_FILE, archived);
  fs.writeFileSync(LOG_FILE, '', 'utf-8');
}

export function logDiagnostic(level: LogLevel, scope: string, event: string, payload: DiagnosticPayload = {}): void {
  try {
    ensureLogFile();
    const record = {
      time: new Date().toISOString(),
      level,
      scope,
      event,
      payload: sanitizeValue(payload),
    };
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(record)}\n`, 'utf-8');
  } catch {
    // ignore diagnostic log errors
  }
}

export function logDiagnosticError(scope: string, event: string, error: unknown, payload: DiagnosticPayload = {}): void {
  logDiagnostic('error', scope, event, {
    ...payload,
    error: safeError(error),
  });
}

export function getDiagnosticLogFilePath(): string {
  return LOG_FILE;
}
