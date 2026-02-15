import type { VideoUnderstandingConfigRecord } from './app-data-store.js';
import {
  deriveAdaptiveConfig,
  getDurationProfile,
  hammingDistance,
} from './keyframe-selector.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`✓ ${message}`);
    return;
  }
  failed += 1;
  console.error(`✗ ${message}`);
}

const baseConfig: VideoUnderstandingConfigRecord = {
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

function run(): void {
  assert(getDurationProfile(120) === 'short', 'Profile: short video');
  assert(getDurationProfile(1200) === 'medium', 'Profile: medium video');
  assert(getDurationProfile(2400) === 'long', 'Profile: long video');
  assert(getDurationProfile(5000) === 'extra_long', 'Profile: extra long video');

  const shortCfg = deriveAdaptiveConfig(4 * 60, baseConfig);
  assert(shortCfg.maxFrames >= baseConfig.maxFrames, 'Adaptive short increases frame budget');
  assert(shortCfg.sceneThreshold < baseConfig.sceneThreshold, 'Adaptive short lowers scene threshold');

  const mediumCfg = deriveAdaptiveConfig(12 * 60, baseConfig);
  assert(mediumCfg.maxFrames === baseConfig.maxFrames, 'Adaptive medium keeps budget');
  assert(mediumCfg.sceneThreshold === baseConfig.sceneThreshold, 'Adaptive medium keeps threshold');

  const longCfg = deriveAdaptiveConfig(35 * 60, baseConfig);
  assert(longCfg.maxFrames < baseConfig.maxFrames, 'Adaptive long reduces frame budget');
  assert(longCfg.sceneThreshold > baseConfig.sceneThreshold, 'Adaptive long raises scene threshold');

  const extraLongCfg = deriveAdaptiveConfig(90 * 60, baseConfig);
  assert(extraLongCfg.maxFrames <= longCfg.maxFrames, 'Adaptive extra long reduces budget further');

  assert(hammingDistance(0b1111n, 0b1111n) === 0, 'Hamming distance equal hashes');
  assert(hammingDistance(0b1010n, 0b0101n) === 4, 'Hamming distance opposite bits');

  console.log(`\nTotal: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

run();
