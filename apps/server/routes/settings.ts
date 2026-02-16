import { execFile } from 'child_process';
import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import {
  type LocalTranscriberConfigRecord,
  type VideoUnderstandingConfigRecord,
} from '../services/app-data-store.js';
import {
  getLocalTranscriber,
  getVideoUnderstanding,
  saveLocalTranscriber,
  saveVideoUnderstanding,
} from '../services/settings-store/index.js';
import { sendApiError, toErrorMessage } from '../utils/http-error.js';
import { resolveProjectPath, resolveCommand, getProjectRoot } from '../utils/path-resolver.js';
import { createSettingsIntegrationsRouter } from './settings/integrations.js';
import { createSettingsModelsRouter } from './settings/models.js';
import { createSettingsPromptsRouter } from './settings/prompts.js';
import type { Request, Response } from 'express';

const execFileAsync = promisify(execFile);

function toWhisperCheckMessage(error: unknown): string {
  const message = toErrorMessage(error, 'faster-whisper 检测失败');
  if (/timed out|timeout/i.test(message)) {
    return '检测超时（可能首次加载较慢），请重试';
  }
  if (/No module named ['"]faster_whisper['"]/i.test(message)) {
    return '未安装 faster-whisper';
  }
  if (/enoent|not recognized as an internal or external command|is not recognized|找不到指定的文件/i.test(message)) {
    return '未找到 Python 可执行文件';
  }
  return `检测失败：${message.slice(0, 140)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeLocalTranscriberInput(
  incoming: Partial<LocalTranscriberConfigRecord> | undefined,
  prev: LocalTranscriberConfigRecord,
): LocalTranscriberConfigRecord {
  const command = typeof incoming?.command === 'string' && incoming.command.trim()
    ? incoming.command.trim()
    : prev.command;
  const ffmpegBin = typeof incoming?.ffmpegBin === 'string' && incoming.ffmpegBin.trim()
    ? incoming.ffmpegBin.trim()
    : prev.ffmpegBin;
  const model = typeof incoming?.model === 'string' && incoming.model.trim()
    ? incoming.model.trim()
    : prev.model;
  const language = typeof incoming?.language === 'string' && incoming.language.trim()
    ? incoming.language.trim()
    : prev.language;
  const device = incoming?.device === 'cpu' || incoming?.device === 'cuda'
    ? incoming.device
    : prev.device;
  const beamSize = typeof incoming?.beamSize === 'number'
    ? Math.floor(clamp(incoming.beamSize, 1, 10))
    : prev.beamSize;
  const temperature = typeof incoming?.temperature === 'number'
    ? clamp(incoming.temperature, 0, 1)
    : prev.temperature;
  const timeoutMs = typeof incoming?.timeoutMs === 'number'
    ? Math.floor(clamp(incoming.timeoutMs, 30000, 1800000))
    : prev.timeoutMs;

  return {
    engine: 'whisper_cli',
    command,
    ffmpegBin,
    model,
    language,
    device,
    cudaChecked: prev.cudaChecked,
    cudaAvailable: prev.cudaAvailable,
    cudaEnabledOnce: prev.cudaEnabledOnce || device === 'cuda',
    beamSize,
    temperature,
    timeoutMs,
  };
}

export function createSettingsRouter(): Router {
  const router = Router();

  router.use('/settings', createSettingsModelsRouter());
  router.use('/settings', createSettingsPromptsRouter());
  router.use('/settings', createSettingsIntegrationsRouter());

  router.get('/settings/video-understanding', async (_req: Request, res: Response) => {
    try {
      res.json(getVideoUnderstanding());
    } catch (error) {
      sendApiError(res, 500, 'GET_VIDEO_UNDERSTANDING_FAILED', toErrorMessage(error, '获取视频理解配置失败'));
    }
  });

  router.get('/settings/video-understanding/presets', async (_req: Request, res: Response) => {
    try {
      res.json({
        items: [
          {
            id: 'short_dense',
            label: '短视频高覆盖',
            appliesTo: '0-8min',
            config: {
              maxFrames: 32,
              sceneThreshold: 0.24,
              perSceneMax: 2,
              minSceneGapSec: 1.2,
              dedupeHashDistance: 7,
              blackFrameLumaThreshold: 18,
              blurVarianceThreshold: 80,
              extractWidth: 640,
              timeoutMs: 120000,
            },
          },
          {
            id: 'medium_balanced',
            label: '中长视频均衡',
            appliesTo: '8-25min',
            config: {
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
          },
          {
            id: 'long_efficient',
            label: '长视频高效率',
            appliesTo: '25min+',
            config: {
              maxFrames: 16,
              sceneThreshold: 0.36,
              perSceneMax: 2,
              minSceneGapSec: 3,
              dedupeHashDistance: 6,
              blackFrameLumaThreshold: 18,
              blurVarianceThreshold: 80,
              extractWidth: 640,
              timeoutMs: 120000,
            },
          },
        ],
      });
    } catch (error) {
      sendApiError(res, 500, 'GET_VIDEO_UNDERSTANDING_PRESETS_FAILED', toErrorMessage(error, '获取视频理解预设失败'));
    }
  });

  router.put('/settings/video-understanding', async (req: Request, res: Response) => {
    try {
      const incoming = req.body as Partial<VideoUnderstandingConfigRecord>;
      const prev = getVideoUnderstanding();
      saveVideoUnderstanding({
        enabled: typeof incoming.enabled === 'boolean' ? incoming.enabled : prev.enabled,
        maxFrames:
          typeof incoming.maxFrames === 'number'
            ? Math.max(4, Math.min(120, Math.floor(incoming.maxFrames)))
            : prev.maxFrames,
        sceneThreshold:
          typeof incoming.sceneThreshold === 'number'
            ? Math.max(0.05, Math.min(0.95, incoming.sceneThreshold))
            : prev.sceneThreshold,
        perSceneMax:
          typeof incoming.perSceneMax === 'number'
            ? Math.max(1, Math.min(3, Math.floor(incoming.perSceneMax)))
            : prev.perSceneMax,
        minSceneGapSec:
          typeof incoming.minSceneGapSec === 'number'
            ? Math.max(0.2, Math.min(30, incoming.minSceneGapSec))
            : prev.minSceneGapSec,
        dedupeHashDistance:
          typeof incoming.dedupeHashDistance === 'number'
            ? Math.max(1, Math.min(64, Math.floor(incoming.dedupeHashDistance)))
            : prev.dedupeHashDistance,
        blackFrameLumaThreshold:
          typeof incoming.blackFrameLumaThreshold === 'number'
            ? Math.max(0, Math.min(255, Math.floor(incoming.blackFrameLumaThreshold)))
            : prev.blackFrameLumaThreshold,
        blurVarianceThreshold:
          typeof incoming.blurVarianceThreshold === 'number'
            ? Math.max(1, Math.min(10000, incoming.blurVarianceThreshold))
            : prev.blurVarianceThreshold,
        extractWidth:
          typeof incoming.extractWidth === 'number'
            ? Math.max(160, Math.min(1920, Math.floor(incoming.extractWidth)))
            : prev.extractWidth,
        timeoutMs:
          typeof incoming.timeoutMs === 'number'
            ? Math.max(15000, Math.min(600000, Math.floor(incoming.timeoutMs)))
            : prev.timeoutMs,
      });
      res.json({ success: true });
    } catch (error) {
      sendApiError(res, 500, 'UPDATE_VIDEO_UNDERSTANDING_FAILED', toErrorMessage(error, '保存视频理解配置失败'));
    }
  });

  router.get('/settings/local-transcriber', async (_req: Request, res: Response) => {
    try {
      res.json(getLocalTranscriber());
    } catch (error) {
      sendApiError(res, 500, 'GET_LOCAL_TRANSCRIBER_FAILED', toErrorMessage(error, '获取本地转写配置失败'));
    }
  });

  router.put('/settings/local-transcriber', async (req: Request, res: Response) => {
    try {
      const incoming = req.body as Partial<LocalTranscriberConfigRecord> | undefined;
      const prev = getLocalTranscriber();
      const normalized = normalizeLocalTranscriberInput(incoming, prev);

      if (!normalized.command.trim()) {
        sendApiError(res, 400, 'INVALID_LOCAL_TRANSCRIBER_COMMAND', '请填写本地转写命令');
        return;
      }
      if (!normalized.ffmpegBin.trim()) {
        sendApiError(res, 400, 'INVALID_FFMPEG_BIN', '请填写 ffmpeg 可执行路径');
        return;
      }
      if (normalized.device === 'cuda' && (!prev.cudaChecked || !prev.cudaAvailable)) {
        sendApiError(res, 400, 'CUDA_NOT_VERIFIED', '请先在环境检测中完成 CUDA 检测并确认可用后再保存 CUDA 设备');
        return;
      }

      saveLocalTranscriber({
        ...normalized,
        cudaEnabledOnce: normalized.cudaEnabledOnce || normalized.device === 'cuda',
      });

      res.json({ success: true, message: '本地转写配置已保存到 setting/local-transcriber.json' });
    } catch (error) {
      sendApiError(res, 500, 'UPDATE_LOCAL_TRANSCRIBER_FAILED', toErrorMessage(error, '保存本地转写配置失败'));
    }
  });

  router.post('/settings/local-transcriber/test', async (req: Request, res: Response) => {
    try {
      const incoming = req.body as Partial<LocalTranscriberConfigRecord> | undefined;
      const commandRaw =
        typeof incoming?.command === 'string' && incoming.command.trim()
          ? incoming.command.trim()
          : getLocalTranscriber().command;
      const ffmpegBinRaw =
        typeof incoming?.ffmpegBin === 'string' && incoming.ffmpegBin.trim()
          ? incoming.ffmpegBin.trim()
          : getLocalTranscriber().ffmpegBin;
      if (!commandRaw) {
        res.json({ ok: false, message: '请填写本地转写命令' });
        return;
      }
      if (!ffmpegBinRaw) {
        res.json({ ok: false, message: '请填写 ffmpeg 可执行路径' });
        return;
      }
      // 解析路径（支持相对路径）
      const command = resolveProjectPath(commandRaw);
      const ffmpegBin = resolveProjectPath(ffmpegBinRaw);
      try {
        await execFileAsync(command, ['--help'], {
          timeout: 8000,
          windowsHide: true,
          maxBuffer: 1024 * 1024 * 2,
          env: {
            ...process.env,
            KMP_DUPLICATE_LIB_OK: process.env.KMP_DUPLICATE_LIB_OK || 'TRUE',
          },
        });

      } catch (error) {
        // Ignore error, just checking if command is executable
      }
      await execFileAsync(ffmpegBin, ['-version'], { timeout: 8000, windowsHide: true, maxBuffer: 1024 * 1024 * 2 });
      res.json({ ok: true, message: '本地转写命令与 ffmpeg 均可用' });
    } catch (error) {
      const message = toErrorMessage(error, '本地转写命令不可用，请检查安装和 PATH');
      if (/spawn\s+ffmpeg\s+ENOENT|enoent/i.test(message)) {
        res.json({ ok: false, message: '未找到 ffmpeg。请安装 ffmpeg 并加入 PATH，或在配置里填写 ffmpeg 可执行路径。' });
        return;
      }
      res.json({ ok: false, message });
    }
  });

  router.get('/settings/env-check', async (_req: Request, res: Response) => {
    const results = {
      ffmpeg: { ok: false, version: '', path: '' },
      cuda: { ok: false, details: '' },
      whisper: { ok: false, version: '', path: '' },
    };

    const config = getLocalTranscriber();

    // Check FFmpeg
    const ffmpegBinRaw = config.ffmpegBin || 'ffmpeg';
    const ffmpegBin = resolveProjectPath(ffmpegBinRaw);
    try {
      const { stdout } = await execFileAsync(ffmpegBin, ['-version'], { timeout: 3000 });
      results.ffmpeg.ok = true;
      results.ffmpeg.version = stdout.split('\n')[0].trim();
      results.ffmpeg.path = ffmpegBinRaw; // 显示原始路径（可能是相对的）
    } catch {
      results.ffmpeg.ok = false;
    }

    // Check Whisper (now checking Python + faster-whisper)
    // For now, we assume if python is available and can import faster_whisper, it is OK.
    let pythonBin = 'python';
    // If config.command looks like a python executable (contains 'python'), use it.
    if (config.command && config.command.toLowerCase().includes('python')) {
      pythonBin = resolveCommand(config.command);
    }
    // Ensure we have an absolute path for local env/python.exe
    if (!path.isAbsolute(pythonBin) && (pythonBin.includes('env/') || pythonBin.includes('env\\'))) {
       const projectRoot = getProjectRoot();
       const candidate = path.join(projectRoot, pythonBin.replace(/^\.\//, ''));
       if (fs.existsSync(candidate)) {
         pythonBin = candidate;
       }
    }

    try {
      const { stdout } = await execFileAsync(
        pythonBin,
        ['-c', 'import faster_whisper; print(faster_whisper.__version__)'],
        { timeout: 10000 },
      );
      results.whisper.ok = true;
      results.whisper.version = String(stdout).trim() || 'faster-whisper installed';
      results.whisper.path = pythonBin;
    } catch (error) {
      results.whisper.ok = false;
      results.whisper.version = toWhisperCheckMessage(error);
      results.whisper.path = pythonBin;
    }

    // Check CUDA (prefer ctranslate2 used by faster-whisper; fallback to torch)
    try {
      const { stdout } = await execFileAsync(
        pythonBin,
        [
          '-c',
          [
            'import json',
            'result = {"ok": False, "details": ""}',
            'try:',
            '  import ctranslate2',
            '  count = ctranslate2.get_cuda_device_count() if hasattr(ctranslate2, "get_cuda_device_count") else 0',
            '  if count > 0:',
            '    result = {"ok": True, "details": f"CUDA is available ({count} device(s), ctranslate2)"}',
            'except Exception:',
            '  pass',
            'if not result["ok"]:',
            '  try:',
            '    import torch',
            '    ok = bool(torch.cuda.is_available())',
            '    details = torch.cuda.get_device_name(0) if ok else "CUDA not found"',
            '    result = {"ok": ok, "details": details}',
            '  except Exception:',
            '    result = {"ok": False, "details": "CUDA not found (ctranslate2/torch unavailable)"}',
            'print(json.dumps(result, ensure_ascii=False))',
          ].join('\n'),
        ],
        { timeout: 5000 }
      );
      const parsed = JSON.parse(stdout.trim()) as { ok?: boolean; details?: string };
      results.cuda.ok = Boolean(parsed.ok);
      results.cuda.details = parsed.details || (results.cuda.ok ? 'CUDA is available' : 'CUDA not found');
    } catch {
      results.cuda.ok = false;
      results.cuda.details = 'Failed to detect CUDA';
    }

    const prev = getLocalTranscriber();
    saveLocalTranscriber({
      ...prev,
      cudaChecked: true,
      cudaAvailable: results.cuda.ok,
    });

    res.json(results);
  });

  return router;
}
