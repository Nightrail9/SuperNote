/**
 * 流水线性质测试
 *
 * 验证流水线执行后临时文件会被清理。
 */

import * as fs from 'fs';
import * as path from 'path';
import fc from 'fast-check';
import {
  DefaultSummaryPipeline,
  type SummaryPipelineConfig,
  type SummaryPipelineDeps,
} from './summary-pipeline.js';
import type { BilibiliVideoParser, VideoInfo } from './pipeline-utils.js';
import type { AIOrganizer, AIOrganizeResult } from './ai-organizer.js';
import type { LocalTranscriber, TranscriptResult } from './local-transcriber.js';

// 测试工具

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    testsPassed++;
    console.log(`✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`✗ ${message}`);
  }
}

// 测试配置与辅助函数

const TEST_TEMP_DIR = path.resolve('storage', 'temp', 'test-pipeline-prop6');

function createTestConfig(): SummaryPipelineConfig {
  return {
    tempDir: TEST_TEMP_DIR,
    sessdata: 'test-sessdata',
    localTranscriber: {
      engine: 'whisper_cli',
      command: 'whisper',
      model: 'small',
      language: 'zh',
      device: 'cpu',
      beamSize: 5,
      temperature: 0,
      timeoutMs: 120000,
    },
    videoUnderstanding: {
      enabled: false,
      maxFrames: 24,
      sceneThreshold: 0.3,
      perSceneMax: 2,
      minSceneGapSec: 2,
      dedupeHashDistance: 6,
      blackFrameLumaThreshold: 18,
      blurVarianceThreshold: 80,
      extractWidth: 640,
      timeoutMs: 120000,
    },
  };
}

/** 下载之后可能失败的阶段 */
type FailureStage = 'none' | 'local_transcribe' | 'generate' | 'ai_call';

const FAILURE_STAGES: FailureStage[] = ['none', 'local_transcribe', 'generate', 'ai_call'];

/** 创建模拟依赖 */
function createMockDeps(failAt: FailureStage): SummaryPipelineDeps {
  const mockVideoParser: BilibiliVideoParser = {
    async parseVideo(_url: string, _part: number): Promise<VideoInfo | null> {
      return {
        title: 'Test Video',
        bvid: 'BV1test',
        aid: 12345,
        cid: 67890,
        part: 1,
        partTitle: 'Part 1',
        videoUrl: 'https://example.com/video.mp4',
      };
    },
  };

  const mockDownloader = {
    async download(_url: string, outputPath: string, _options?: { referer?: string; userAgent?: string }): Promise<void> {
      // 真实创建临时文件，便于校验清理
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(outputPath, 'fake video content');
    },
  };

  const mockLocalTranscriber: LocalTranscriber = {
    async transcribe(_videoPath: string, _config): Promise<TranscriptResult> {
      if (failAt === 'local_transcribe') {
        throw new Error('Mock local transcribe failure');
      }
      return {
        text: '这是测试转录内容。',
        segments: [
          { startSec: 0, endSec: 8, text: '这是测试转录内容。' },
        ],
      };
    },
  };

  const mockAIOrganizer: AIOrganizer = {
    async organize(
      _markdown: string,
      _config: { apiUrl: string; apiKey: string; prompt: string; provider?: string; modelName?: string }
    ): Promise<AIOrganizeResult> {
      if (failAt === 'ai_call') {
        throw new Error('Mock AI API failure');
      }
      return {
        success: true,
        content: '# Organized Notes\n\nSummary content',
      };
    },
  };

  return {
    videoParser: mockVideoParser,
    downloader: mockDownloader,
    localTranscriber: mockLocalTranscriber,
    aiOrganizer: mockAIOrganizer,
  };
}

/** 列出临时目录文件 */
function listTempFiles(): string[] {
  if (!fs.existsSync(TEST_TEMP_DIR)) {
    return [];
  }
  return fs.readdirSync(TEST_TEMP_DIR);
}

/** 清理测试临时目录 */
function cleanupTestDir(): void {
  try {
    if (fs.existsSync(TEST_TEMP_DIR)) {
      fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
    }
  } catch {
    // 忽略清理异常
  }
}

// ============================================================================
// 性质 6：流水线执行后临时文件被清理
// ============================================================================

async function runTests(): Promise<void> {
  console.log('\n=== Property 6: 流水线执行后临时文件被清理 ===\n');

  // 保证初始环境干净
  cleanupTestDir();

  // ──────────────────────────────────────────────────────────────────────────
  // 任意阶段（含成功）结束后都不应残留临时视频
  // ──────────────────────────────────────────────────────────────────────────

  try {
    await fc.assert(
      fc.asyncProperty(
        // 随机失败阶段（none 表示无失败）
        fc.constantFrom(...FAILURE_STAGES),
        async (failAt: FailureStage) => {
          // 每轮前先清理目录
          cleanupTestDir();

          const config = createTestConfig();
          const deps = createMockDeps(failAt);
          const pipeline = new DefaultSummaryPipeline(config, deps);

          // 执行流水线
          await pipeline.execute(
            'https://www.bilibili.com/video/BV1test',
            { apiUrl: 'https://api.example.com/ai', apiKey: 'test-key', prompt: 'Summarize' }
          );

          // 执行后不应残留临时视频
          const remainingFiles = listTempFiles();
          const videoFiles = remainingFiles.filter(f => f.endsWith('.mp4'));
          return videoFiles.length === 0;
        }
      ),
      { numRuns: 100 }
    );
    testsPassed++;
    console.log('✓ Property 6: Temp files are cleaned up for any pipeline execution (success or failure at any stage)');
  } catch (err) {
    testsFailed++;
    console.error('✗ Property 6: Temp file cleanup property failed');
    console.error(err instanceof Error ? err.message : String(err));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 解析失败时不应创建临时文件
  // ──────────────────────────────────────────────────────────────────────────

  console.log('\n=== Property 6 (parse failure): 解析失败不应创建临时文件 ===\n');

  try {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // true = parseVideo returns null, false = parseVideo throws
        async (returnNull: boolean) => {
          cleanupTestDir();

          const config = createTestConfig();
          const failingParser: BilibiliVideoParser = {
            async parseVideo(_url: string, _part: number): Promise<VideoInfo | null> {
              if (returnNull) return null;
              throw new Error('Mock parse failure');
            },
          };

          const deps = createMockDeps('none');
          deps.videoParser = failingParser;
          const pipeline = new DefaultSummaryPipeline(config, deps);

          await pipeline.execute(
            'https://www.bilibili.com/video/BV1test',
            { apiUrl: 'https://api.example.com/ai', apiKey: 'test-key', prompt: 'Summarize' }
          );

          // 不会进入下载阶段，因此应无临时文件
          const remainingFiles = listTempFiles();
          return remainingFiles.length === 0;
        }
      ),
      { numRuns: 50 }
    );
    testsPassed++;
    console.log('✓ Property 6 (parse failure): No temp files created when parse fails');
  } catch (err) {
    testsFailed++;
    console.error('✗ Property 6 (parse failure): Unexpected temp files after parse failure');
    console.error(err instanceof Error ? err.message : String(err));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 下载失败也要清理（可能已有部分文件）
  // ──────────────────────────────────────────────────────────────────────────

  console.log('\n=== Property 6 (download failure): 下载失败后临时文件被清理 ===\n');

  try {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // true = create partial file before failing, false = fail immediately
        async (createPartialFile: boolean) => {
          cleanupTestDir();

          const config = createTestConfig();
          const deps = createMockDeps('none');

          // 覆盖下载器，模拟下载失败
          deps.downloader = {
            async download(_url: string, outputPath: string, _options?: { referer?: string; userAgent?: string }): Promise<void> {
              if (createPartialFile) {
                const dir = path.dirname(outputPath);
                if (!fs.existsSync(dir)) {
                  fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(outputPath, 'partial content');
              }
              throw new Error('Mock download failure');
            },
          };

          const pipeline = new DefaultSummaryPipeline(config, deps);

          await pipeline.execute(
            'https://www.bilibili.com/video/BV1test',
            { apiUrl: 'https://api.example.com/ai', apiKey: 'test-key', prompt: 'Summarize' }
          );

          // 执行后不应残留临时视频
          const remainingFiles = listTempFiles();
          const videoFiles = remainingFiles.filter(f => f.endsWith('.mp4'));
          return videoFiles.length === 0;
        }
      ),
      { numRuns: 50 }
    );
    testsPassed++;
    console.log('✓ Property 6 (download failure): Temp files cleaned up after download failure');
  } catch (err) {
    testsFailed++;
    console.error('✗ Property 6 (download failure): Temp file cleanup after download failure failed');
    console.error(err instanceof Error ? err.message : String(err));
  }

  // ============================================================================
  // 单元用例
  // ============================================================================

  console.log('\n=== Unit Tests: Specific temp file cleanup scenarios ===\n');

  // 成功执行也要清理临时文件
  {
    cleanupTestDir();
    const config = createTestConfig();
    const deps = createMockDeps('none');
    const pipeline = new DefaultSummaryPipeline(config, deps);

    const result = await pipeline.execute(
      'https://www.bilibili.com/video/BV1test',
      { apiUrl: 'https://api.example.com/ai', apiKey: 'test-key', prompt: 'Summarize' }
    );

    assert(result.success === true, 'Pipeline should succeed');
    const remaining = listTempFiles().filter(f => f.endsWith('.mp4'));
    assert(remaining.length === 0, 'No temp video files should remain after successful execution');
  }

  // 本地转写失败时清理临时文件
  {
    cleanupTestDir();
    const config = createTestConfig();
    const deps = createMockDeps('local_transcribe');
    const pipeline = new DefaultSummaryPipeline(config, deps);

    const result = await pipeline.execute(
      'https://www.bilibili.com/video/BV1test',
      { apiUrl: 'https://api.example.com/ai', apiKey: 'test-key', prompt: 'Summarize' }
    );

    assert(result.success === false, 'Pipeline should fail on local transcribe');
    assert(result.error?.stage === 'local_transcribe', 'Error stage should be local_transcribe');
    const remaining = listTempFiles().filter(f => f.endsWith('.mp4'));
    assert(remaining.length === 0, 'No temp video files should remain after local transcribe failure');
  }

  // AI 调用失败时清理临时文件
  {
    cleanupTestDir();
    const config = createTestConfig();
    const deps = createMockDeps('ai_call');
    const pipeline = new DefaultSummaryPipeline(config, deps);

    const result = await pipeline.execute(
      'https://www.bilibili.com/video/BV1test',
      { apiUrl: 'https://api.example.com/ai', apiKey: 'test-key', prompt: 'Summarize' }
    );

    assert(result.success === false, 'Pipeline should fail on ai_call');
    assert(result.error?.stage === 'ai_call', 'Error stage should be ai_call');
    const remaining = listTempFiles().filter(f => f.endsWith('.mp4'));
    assert(remaining.length === 0, 'No temp video files should remain after AI call failure');
  }

  // 收尾与汇总

  // 清理测试目录
  cleanupTestDir();

  console.log('\n=== Test Summary ===\n');
  console.log(`Total tests: ${testsPassed + testsFailed}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);

  if (testsFailed === 0) {
    console.log('\n✓ All tests passed!\n');
    process.exit(0);
  } else {
    console.log('\n✗ Some tests failed!\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unexpected error running tests:', err);
  process.exit(1);
});
