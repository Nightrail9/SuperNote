import {
  VIDEO_UNDERSTANDING_FILE,
  ensureSplitSettingsMigrated,
  normalizeVideoUnderstandingConfig,
  readJson,
  writeJson,
} from './shared.js';
import type { VideoUnderstandingConfigRecord } from '../app-data-store.js';

export function getVideoUnderstanding(): VideoUnderstandingConfigRecord {
  ensureSplitSettingsMigrated();
  try {
    const normalized = normalizeVideoUnderstandingConfig(
      readJson(VIDEO_UNDERSTANDING_FILE) as Partial<VideoUnderstandingConfigRecord> | undefined,
    );
    writeJson(VIDEO_UNDERSTANDING_FILE, normalized);
    return normalized;
  } catch {
    const normalized = normalizeVideoUnderstandingConfig(undefined);
    writeJson(VIDEO_UNDERSTANDING_FILE, normalized);
    return normalized;
  }
}

export function saveVideoUnderstanding(videoUnderstanding: VideoUnderstandingConfigRecord): void {
  ensureSplitSettingsMigrated();
  writeJson(VIDEO_UNDERSTANDING_FILE, normalizeVideoUnderstandingConfig(videoUnderstanding));
}
