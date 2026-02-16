import { Router } from 'express';

import { timestamp, type PromptConfigRecord } from '../../services/app-data-store.js';
import { getPrompts, savePrompts } from '../../services/settings-store/index.js';
import { sendApiError, toErrorMessage } from '../../utils/http-error.js';
import type { Request, Response } from 'express';

export function createSettingsPromptsRouter(): Router {
  const router = Router();

  router.get('/prompts', async (_req: Request, res: Response) => {
    try {
      res.json(getPrompts());
    } catch (error) {
      sendApiError(res, 500, 'GET_PROMPTS_FAILED', toErrorMessage(error, '获取提示词失败'));
    }
  });

  router.put('/prompts', async (req: Request, res: Response) => {
    try {
      if (!Array.isArray(req.body)) {
        sendApiError(res, 400, 'INVALID_PROMPTS_PAYLOAD', '提示词配置格式不正确');
        return;
      }

      const prompts: PromptConfigRecord[] = req.body
        .filter((item) => item && typeof item === 'object')
        .map((item) => item as Partial<PromptConfigRecord>)
        .filter((item) => typeof item.id === 'string' && typeof item.name === 'string')
        .map((item) => ({
          id: item.id as string,
          name: (item.name as string).trim(),
          template: typeof item.template === 'string' ? item.template : '',
          variables: Array.isArray(item.variables) ? item.variables.filter((v): v is string => typeof v === 'string') : [],
          isDefault: Boolean(item.isDefault),
          updatedAt: timestamp(),
        }));

      if (prompts.length === 0) {
        sendApiError(res, 400, 'INVALID_PROMPTS_PAYLOAD', '提示词配置不能为空');
        return;
      }

      if (!prompts.some((item) => item.isDefault)) {
        prompts[0].isDefault = true;
      }

      savePrompts(prompts);
      res.json({ success: true });
    } catch (error) {
      sendApiError(res, 500, 'UPDATE_PROMPTS_FAILED', toErrorMessage(error, '保存提示词失败'));
    }
  });

  return router;
}
