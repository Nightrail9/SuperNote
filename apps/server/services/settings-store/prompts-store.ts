import { PROMPTS_FILE, ensureSplitSettingsMigrated, readJson, writeJson } from './shared.js';
import type { PromptConfigRecord } from '../app-data-store.js';

export function getPrompts(): PromptConfigRecord[] {
  ensureSplitSettingsMigrated();
  try {
    const parsed = readJson(PROMPTS_FILE);
    if (!Array.isArray(parsed)) {
      writeJson(PROMPTS_FILE, []);
      return [];
    }
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => item as PromptConfigRecord);
  } catch {
    writeJson(PROMPTS_FILE, []);
    return [];
  }
}

export function savePrompts(prompts: PromptConfigRecord[]): void {
  ensureSplitSettingsMigrated();
  writeJson(PROMPTS_FILE, prompts);
}
