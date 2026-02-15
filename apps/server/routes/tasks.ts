import { Router } from 'express';

import { getAppData } from '../services/app-data-store.js';
import { cancelGenerateTask, refineGenerateTask, retryGenerateTask } from '../services/note-generation.js';
import { sendApiError, toErrorMessage } from '../utils/http-error.js';
import type { Request, Response } from 'express';

export function createTasksRouter(): Router {
  const router = Router();

  router.get('/tasks/:taskId', async (req: Request, res: Response) => {
    try {
      const task = getAppData().tasks.find((item) => item.id === req.params.taskId);
      if (!task) {
        sendApiError(res, 404, 'TASK_NOT_FOUND', '任务不存在');
        return;
      }

      const createdAtMs = Date.parse(task.createdAt);
      const updatedAtMs = Date.parse(task.updatedAt);
      const elapsedMs =
        Number.isFinite(createdAtMs) && Number.isFinite(updatedAtMs) && updatedAtMs >= createdAtMs
          ? updatedAtMs - createdAtMs
          : undefined;

      res.json({
        status: task.status,
        stage: task.stage,
        progress: task.progress,
        message: task.message,
        retryable: Boolean(task.retryable),
        resolvedTitle: task.resolvedTitle,
        sourceType: task.sourceType,
        formats: task.formats,
        resultMd: task.resultMd,
        debug: task.debug,
        error: task.error,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        elapsedMs,
      });
    } catch (error) {
      sendApiError(res, 500, 'GET_TASK_FAILED', toErrorMessage(error, '获取任务状态失败'));
    }
  });

  router.post('/tasks/:taskId/cancel', async (req: Request, res: Response) => {
    try {
      const taskId = String(req.params.taskId ?? '');
      const result = cancelGenerateTask(taskId);
      if (!result.ok) {
        sendApiError(res, 409, 'TASK_CANCEL_FAILED', result.message);
        return;
      }
      res.json({ success: true, message: result.message });
    } catch (error) {
      sendApiError(res, 500, 'CANCEL_TASK_FAILED', toErrorMessage(error, '取消任务失败'));
    }
  });

  router.post('/tasks/:taskId/retry', async (req: Request, res: Response) => {
    try {
      const taskId = String(req.params.taskId ?? '');
      const result = retryGenerateTask(taskId);
      if (!result.ok) {
        sendApiError(res, 409, 'TASK_RETRY_FAILED', result.message);
        return;
      }
      res.json({ success: true, message: result.message });
    } catch (error) {
      sendApiError(res, 500, 'RETRY_TASK_FAILED', toErrorMessage(error, '重试任务失败'));
    }
  });

  router.post('/tasks/:taskId/refine', async (req: Request, res: Response) => {
    try {
      const taskId = String(req.params.taskId ?? '');
      const result = refineGenerateTask(taskId);
      if (!result.ok) {
        sendApiError(res, 409, 'TASK_REFINE_FAILED', result.message);
        return;
      }
      res.json({ success: true, message: result.message });
    } catch (error) {
      sendApiError(res, 500, 'REFINE_TASK_FAILED', toErrorMessage(error, '再次整理任务失败'));
    }
  });

  return router;
}
