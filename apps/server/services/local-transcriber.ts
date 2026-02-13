import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { createId, type LocalTranscriberConfigRecord } from './app-data-store.js';

const execFileAsync = promisify(execFile);

export type TranscriptSegment = {
  startSec: number;
  endSec: number;
  text: string;
};

export type TranscriptResult = {
  text: string;
  segments: TranscriptSegment[];
};

export interface LocalTranscriber {
  transcribe(
    videoPath: string,
    config: LocalTranscriberConfigRecord,
    options?: { signal?: AbortSignal },
  ): Promise<TranscriptResult>;
}

function formatTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const total = Math.floor(safe);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function toTranscriptMarkdown(title: string, transcript: TranscriptResult): string {
  const header = `# ${title}`;
  const plain = transcript.text.trim();
  const timeline = transcript.segments
    .map((item) => `- [${formatTimestamp(item.startSec)}-${formatTimestamp(item.endSec)}] ${item.text.trim()}`)
    .join('\n');
  const sections = [
    header,
    '## 转录全文',
    plain || '（未提取到有效文本）',
    '## 分段时间轴',
    timeline || '- （无分段）',
  ];
  return sections.join('\n\n');
}

export class WhisperCliTranscriber implements LocalTranscriber {
  constructor() {}

  async transcribe(
    videoPath: string,
    config: LocalTranscriberConfigRecord,
    options?: { signal?: AbortSignal },
  ): Promise<TranscriptResult> {
    const workDir = path.join(path.dirname(videoPath), `asr_${createId('tmp')}`);
    fs.mkdirSync(workDir, { recursive: true });
    const audioPath = path.join(workDir, 'audio.wav');

    try {
      await this.extractAudio(videoPath, audioPath, config, options?.signal);
      const jsonPath = await this.runWhisperCli(audioPath, workDir, config, options?.signal);
      const result = this.parseWhisperJson(jsonPath);
      if (!result.text.trim()) {
        throw new Error('local transcriber returned empty text');
      }
      return result;
    } finally {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    }
  }

  private async extractAudio(
    videoPath: string,
    audioPath: string,
    config: LocalTranscriberConfigRecord,
    signal?: AbortSignal,
  ): Promise<void> {
    const ffmpegBin = config.ffmpegBin?.trim() || process.env.FFMPEG_BIN || 'ffmpeg';
    try {
      await execFileAsync(ffmpegBin, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        videoPath,
        '-vn',
        '-acodec',
        'pcm_s16le',
        '-ar',
        '16000',
        '-ac',
        '1',
        '-y',
        audioPath,
      ], { signal });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/enoent/i.test(message)) {
        throw new Error('未找到 ffmpeg。请安装 ffmpeg 并加入 PATH，或在本地转写配置中填写 ffmpeg 可执行路径');
      }
      throw error;
    }
  }

  private async runWhisperCli(
    audioPath: string,
    outputDir: string,
    config: LocalTranscriberConfigRecord,
    signal?: AbortSignal,
  ): Promise<string> {
    const ffmpegBin = config.ffmpegBin?.trim() || process.env.FFMPEG_BIN || 'ffmpeg';
    const ffmpegDir = path.dirname(ffmpegBin);
    const mergedPath = ffmpegDir
      ? `${ffmpegDir}${path.delimiter}${process.env.PATH ?? ''}`
      : process.env.PATH;

    const args = [
      audioPath,
      '--model',
      config.model,
      '--output_format',
      'json',
      '--output_dir',
      outputDir,
      '--task',
      'transcribe',
      '--fp16',
      'False',
      '--temperature',
      String(config.temperature),
      '--beam_size',
      String(config.beamSize),
      '--verbose',
      'False',
    ];
    if (config.language) {
      args.push('--language', config.language);
    }
    if (config.device && config.device !== 'auto') {
      args.push('--device', config.device);
    }

    const effectiveTimeoutMs = await this.resolveAdaptiveTimeoutMs(audioPath, config, ffmpegBin);

    let whisperStdout = '';
    let whisperStderr = '';
    try {
      const result = await execFileAsync(config.command, args, {
        timeout: effectiveTimeoutMs,
        maxBuffer: 1024 * 1024 * 16,
        signal,
        env: {
          ...process.env,
          KMP_DUPLICATE_LIB_OK: process.env.KMP_DUPLICATE_LIB_OK || 'TRUE',
          PATH: mergedPath,
        },
      });
      whisperStdout = result.stdout;
      whisperStderr = result.stderr;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/enoent/i.test(message)) {
        throw new Error(`未找到本地转写命令 ${config.command}。请安装 whisper 并确保命令可执行`);
      }
      if (/timed out|timeout/i.test(message)) {
        throw new Error(
          `本地转写超时（${Math.round(effectiveTimeoutMs / 1000)}秒）。请在系统配置中提高“本地转写超时”，或使用更小模型`,
        );
      }
      throw error;
    }

    const expected = [
      path.join(outputDir, `${path.parse(audioPath).name}.json`),
      path.join(outputDir, `${path.basename(audioPath)}.json`),
    ];

    for (const candidate of expected) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    const allJsonFiles = fs
      .readdirSync(outputDir, { withFileTypes: true })
      .filter((item) => item.isFile() && item.name.toLowerCase().endsWith('.json'))
      .map((item) => path.join(outputDir, item.name));

    if (allJsonFiles.length > 0) {
      return allJsonFiles[0] as string;
    }

    const detail = [whisperStdout, whisperStderr].filter(Boolean).join('\n').trim();
    if (/Skipping\s+.+\s+FileNotFoundError|No such file or directory/i.test(detail)) {
      throw new Error(
        'whisper 未找到 ffmpeg。请将 ffmpeg 路径配置为有效可执行文件，或将其所在目录加入 PATH',
      );
    }

    throw new Error(`whisper output not found: ${expected[0]}${detail ? `\n${detail.slice(0, 600)}` : ''}`);
  }

  private async resolveAdaptiveTimeoutMs(
    audioPath: string,
    config: LocalTranscriberConfigRecord,
    ffmpegBin: string,
  ): Promise<number> {
    const baseTimeoutMs = Math.max(30000, config.timeoutMs || 600000);
    const ffprobeBin = path.join(path.dirname(ffmpegBin), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');

    if (!fs.existsSync(ffprobeBin)) {
      return baseTimeoutMs;
    }

    try {
      const { stdout } = await execFileAsync(ffprobeBin, [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=nokey=1:noprint_wrappers=1',
        audioPath,
      ]);
      const durationSec = Number.parseFloat(String(stdout).trim());
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        return baseTimeoutMs;
      }

      const model = String(config.model || '').toLowerCase();
      const modelMultiplier =
        model.includes('tiny') ? 1.8 : model.includes('base') ? 2.5 : model.includes('small') ? 3.5 : model.includes('medium') ? 5.5 : 8;
      const deviceFactor = config.device === 'cuda' ? 0.75 : 1;

      const estimatedMs = Math.ceil((durationSec * modelMultiplier * deviceFactor + 90) * 1000);
      return Math.max(baseTimeoutMs, Math.min(estimatedMs, 4 * 60 * 60 * 1000));
    } catch {
      return baseTimeoutMs;
    }
  }

  private parseWhisperJson(jsonPath: string): TranscriptResult {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      text?: string;
      segments?: Array<{ start?: number; end?: number; text?: string }>;
    };
    const segments = Array.isArray(parsed.segments)
      ? parsed.segments
          .map((item) => ({
            startSec: Number(item.start ?? 0),
            endSec: Number(item.end ?? item.start ?? 0),
            text: String(item.text ?? '').trim(),
          }))
          .filter((item) => item.text && Number.isFinite(item.startSec) && Number.isFinite(item.endSec))
      : [];

    const text = typeof parsed.text === 'string'
      ? parsed.text.trim()
      : segments.map((item) => item.text).join(' ').trim();

    return { text, segments };
  }
}

export function createLocalTranscriber(): LocalTranscriber {
  return new WhisperCliTranscriber();
}

export { toTranscriptMarkdown };
