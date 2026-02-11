import { Router, Request, Response } from 'express';
import { getAppData } from '../services/app-data-store.js';
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
        suggestedTitle: task.suggestedTitle,
        sourceType: task.sourceType,
        resultMd: task.resultMd,
        error: task.error,
      });
    } catch (error) {
      sendApiError(res, 500, 'GET_TASK_FAILED', toErrorMessage(error, '获取任务状态失败'));
    }
  });

  return router;
}
