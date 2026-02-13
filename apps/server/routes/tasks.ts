import { Router, Request, Response } from 'express';
import { getAppData } from '../services/app-data-store.js';
import { cancelGenerateTask, retryGenerateTask } from '../services/note-generation.js';
import { sendApiError, toErrorMessage } from '../utils/http-error.js';

export function createTasksRouter(): Router {
  const router = Router();

  router.get('/tasks/:taskId', async (req: Request, res: Response) => {
    try {
      const task = getAppData().tasks.find((item) => item.id === req.params.taskId);
      if (!task) {
        sendApiError(res, 404, 'TASK_NOT_FOUND', '任务不存在');
        return;
      }

      res.json({
        status: task.status,
        stage: task.stage,
        progress: task.progress,
        message: task.message,
        retryable: Boolean(task.retryable),
        sourceType: task.sourceType,
        formats: task.formats,
        resultMd: task.resultMd,
        debug: task.debug,
        error: task.error,
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

  return router;
}
