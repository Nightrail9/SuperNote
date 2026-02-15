/**
 * Unit test for model settings env persistence.
 *
 * Verifies persistModelsToEnvFile writes model config to .env
 * using AI_MODELS_JSON and AI_DEFAULT_MODEL_ID.
 *
 * Run with: npx tsx apps/server/routes/settings-models-env.test.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { persistModelsToEnvFile } from './settings.js';
import type { ModelConfigRecord } from '../services/app-data-store.js';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    testsPassed += 1;
    console.log(`✓ ${message}`);
  } else {
    testsFailed += 1;
    console.error(`✗ ${message}`);
  }
}

function readEnvValue(content: string, key: string): string | undefined {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trimStart().startsWith('#')) {
      continue;
    }
    const index = line.indexOf('=');
    if (index <= 0) {
      continue;
    }
    const currentKey = line.slice(0, index).trim();
    if (currentKey === key) {
      return line.slice(index + 1);
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'supernote-settings-env-'));
  const envFile = path.join(tmpRoot, '.env');
  fs.writeFileSync(
    envFile,
    ['PORT=3001', 'AI_MODELS_JSON=[]', 'AI_DEFAULT_MODEL_ID=', '# Keep this custom line', 'CUSTOM_FLAG=1', ''].join('\n'),
    'utf-8',
  );

  try {
    const payload: ModelConfigRecord[] = [
      {
        id: 'chatgpt_prod',
        provider: 'chatgpt',
        enabled: true,
        isDefault: true,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-123456',
        modelName: 'gpt-5-mini',
        timeoutMs: 60000,
      },
      {
        id: 'openai_proxy',
        provider: 'openai_compatible',
        enabled: true,
        isDefault: false,
        baseUrl: 'https://api-inference.modelscope.cn/v1',
        apiKey: 'ms-test-abc',
        modelName: 'moonshotai/Kimi-K2.5',
        timeoutMs: 60000,
      },
    ];

    const envValues = persistModelsToEnvFile(envFile, payload);
    assert(typeof envValues.AI_MODELS_JSON === 'string', 'persistModelsToEnvFile returns AI_MODELS_JSON');
    assert(envValues.AI_DEFAULT_MODEL_ID === 'chatgpt_prod', 'persistModelsToEnvFile returns default model id');

    const envContent = fs.readFileSync(envFile, 'utf-8');
    const aiModelsJson = readEnvValue(envContent, 'AI_MODELS_JSON');
    const defaultModelId = readEnvValue(envContent, 'AI_DEFAULT_MODEL_ID');

    assert(typeof aiModelsJson === 'string' && aiModelsJson.length > 2, 'AI_MODELS_JSON is written to .env');
    assert(defaultModelId === 'chatgpt_prod', 'AI_DEFAULT_MODEL_ID is written to .env');
    assert(envContent.includes('CUSTOM_FLAG=1'), 'existing unrelated env keys are preserved');

    const parsedModels = JSON.parse(aiModelsJson || '[]') as Array<{ id?: string; isDefault?: boolean }>;
    assert(parsedModels.length === 2, 'AI_MODELS_JSON contains saved models');
    assert(parsedModels.some((item) => item.id === 'chatgpt_prod' && item.isDefault === true), 'default model is serialized');

    const nextPayload: ModelConfigRecord[] = [
      {
        id: 'openai_proxy',
        provider: 'openai_compatible',
        enabled: true,
        isDefault: false,
        baseUrl: 'https://api-inference.modelscope.cn/v1',
        apiKey: 'ms-test-abc',
        modelName: 'moonshotai/Kimi-K2.5',
        timeoutMs: 60000,
      },
    ];
    persistModelsToEnvFile(envFile, nextPayload);
    const updatedContent = fs.readFileSync(envFile, 'utf-8');
    const updatedDefaultModelId = readEnvValue(updatedContent, 'AI_DEFAULT_MODEL_ID');
    assert(updatedDefaultModelId === 'openai_proxy', 'default model falls back to first model when none is default');
  } catch (error) {
    testsFailed += 1;
    console.error('✗ settings env persistence test crashed');
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log('\n=== Test Summary ===\n');
  console.log(`Total tests: ${testsPassed + testsFailed}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);

  if (testsFailed === 0) {
    console.log('\n✓ All tests passed!\n');
    process.exit(0);
  }

  console.log('\n✗ Some tests failed!\n');
  process.exit(1);
}

void main();
