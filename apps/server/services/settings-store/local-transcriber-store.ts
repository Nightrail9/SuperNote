import {
  LOCAL_TRANSCRIBER_FILE,
  ensureSplitSettingsMigrated,
  normalizeLocalTranscriberConfig,
  readJson,
  writeJson,
} from './shared.js';
import type { LocalTranscriberConfigRecord } from '../app-data-store.js';

export function getLocalTranscriber(): LocalTranscriberConfigRecord {
  ensureSplitSettingsMigrated();
  try {
    const normalized = normalizeLocalTranscriberConfig(
      readJson(LOCAL_TRANSCRIBER_FILE) as Partial<LocalTranscriberConfigRecord> | undefined,
    );
    writeJson(LOCAL_TRANSCRIBER_FILE, normalized);
    return normalized;
  } catch {
    const normalized = normalizeLocalTranscriberConfig(undefined);
    writeJson(LOCAL_TRANSCRIBER_FILE, normalized);
    return normalized;
  }
}

export function saveLocalTranscriber(localTranscriber: LocalTranscriberConfigRecord): void {
  ensureSplitSettingsMigrated();
  writeJson(LOCAL_TRANSCRIBER_FILE, normalizeLocalTranscriberConfig(localTranscriber));
}
